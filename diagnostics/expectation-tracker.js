/**
 * @file expectation-tracker.js
 * @module diagnostics
 * @description Rastreia o que era esperado vs o que aconteceu em cada comando.
 * @imports — (nenhum)
 * @importedBy diagnostics/index, diagnostics/instrumentation, diagnostics/report-builder
 * @level 9
 *
 * Fluxo (Fase 5/6):
 *   1. declare(line, ast, ctx)         → cria uma entrada com expectativas
 *   2. recordEvent(commandId, evt, pl) → alimenta eventos observados
 *   3. observe(commandId, result, ctx) → preenche o real e calcula diff
 *
 * O wire é feito pelo `Instrumentation`:
 *   - `_wrapSystem` chama `declare()` logo após o ParseSystem produzir AST.
 *   - `_wireBusForExpectations` anexa um wildcard `'*'` ao bus que chama
 *     `recordEvent()` para cada evento emitido durante o comando.
 *   - `_wrapHandleLine` chama `observe()` no `finally`, depois de todos os
 *     sistemas rodarem, passando `tickAfter`.
 *
 * API pública:
 *   declare(line, ast, ctx?)              → commandId
 *   recordEvent(commandId, event, payload) → void
 *   recordEvents(commandId, events[])      → void   (bulk)
 *   observe(commandId, result, ctx?)       → entry
 *   get(commandId)                         → entry | null
 *   getAll()                               → entry[]
 *   getFailures()                          → entry[]
 *   stats()                                → stats
 *   toJSON()                               → { stats, entries }
 *   setEnabled(bool)                       → this
 *   clear()                                → void
 *   destroy()                              → void
 *
 * Motivos de discrepância detectados pelo `_compare()`:
 *   - `mutated`: esperava mutar, não mutou (ou vice-versa)
 *   - `halt`: pipeline parou quando não devia (ou não parou quando devia)
 *   - `tickAdvanced`: mutou mas tick não avançou
 *   - `events.missing`: eventos esperados não foram observados
 *   - `error`: erro inesperado em comando que deveria mutar
 */

/**
 * Deriva expectativas a partir do AST + contexto.
 *
 * Mapeia verbos e ações para:
 *   - `mutated`: o comando deve mutar o mundo?
 *   - `events`: quais eventos o bus deve emitir?
 *   - `halt`: o pipeline deve parar?
 *
 * @param {Object} ast
 * @param {Object} ctx
 * @returns {{ mutated:boolean, events:string[], halt:boolean }}
 * @private
 */
function deriveExpectations(ast, ctx) {
  const base = { mutated: false, events: [], halt: false };
  if (!ast) return base;

  const verb = ast.verb;
  const action = ast.action;

  // ── Mutations ────────────────────────────────────────────
  if (verb === 'mut') {
    return {
      mutated: true,
      events: ['component:updated', 'tick:advanced'],
      halt: false,
    };
  }

  // ── Entities ─────────────────────────────────────────────
  if (verb === 'ent') {
    if (action === 'create') {
      return { mutated: true, events: ['entity:created', 'tick:advanced'], halt: false };
    }
    if (action === 'delete') {
      return { mutated: true, events: ['entity:destroyed', 'tick:advanced'], halt: false };
    }
    // show / list
    return base;
  }

  // ── Identity ─────────────────────────────────────────────
  if (verb === 'id') {
    if (['rename', 'describe', 'retype'].includes(action)) {
      return { mutated: true, events: ['component:updated', 'tick:advanced'], halt: false };
    }
    return base;
  }

  // ── Instantiation ────────────────────────────────────────
  if (verb === 'inst') {
    if (['mark', 'unmark', 'create', 'destroy', 'sync'].includes(action)) {
      return { mutated: true, events: ['component:updated', 'tick:advanced'], halt: false };
    }
    if (['reparent', 'unset', 'policy'].includes(action)) {
      return { mutated: true, events: ['component:updated', 'tick:advanced'], halt: false };
    }
    // chain, resolve, list
    return base;
  }

  // ── Link mutation vs query ───────────────────────────────
  if (verb === 'link') {
    if (['set', 'add', 'pull', 'clear'].includes(action)) {
      return { mutated: true, events: ['component:updated', 'tick:advanced'], halt: false };
    }
    return base;
  }

  // ── Rules ────────────────────────────────────────────────
  if (verb === 'rul') {
    if (action === 'add') {
      return { mutated: true, events: ['entity:created', 'tick:advanced'], halt: false };
    }
    if (['off', 'on', 'del'].includes(action)) {
      return { mutated: true, events: ['component:updated', 'tick:advanced'], halt: false };
    }
    if (action === 'run') {
      return { mutated: true, events: ['tick:advanced'], halt: false };
    }
    return base;
  }

  // ── Snippets ─────────────────────────────────────────────
  if (verb === 'snip') {
    if (typeof action === 'string' && action.startsWith('create')) {
      return { mutated: true, events: ['entity:created', 'tick:advanced'], halt: false };
    }
    if (action === 'delete') {
      return { mutated: true, events: ['entity:destroyed', 'tick:advanced'], halt: false };
    }
    return base;
  }

  // ── Knowledge ────────────────────────────────────────────
  if (verb === 'kno') {
    if (['learn', 'forget'].includes(action)) {
      return { mutated: true, events: ['component:updated', 'tick:advanced'], halt: false };
    }
    return base;
  }

  // ── Fork ─────────────────────────────────────────────────
  if (verb === 'frk') {
    if (['create', 'delete', 'merge'].includes(action)) {
      return { mutated: true, events: [], halt: false };
    }
    // switch / list
    return base;
  }

  // ── Export (não muta, gera arquivo) ──────────────────────
  if (verb === 'exp') {
    return { mutated: false, events: ['export:ready'], halt: false };
  }

  // ── Queries e leitura (nunca mutam) ──────────────────────
  if (['que', 'at', 'whe', 'tim', 'aud', 'sea', 'help'].includes(verb)) {
    return base;
  }

  // ── Dif (nunca muta) ─────────────────────────────────────
  if (verb === 'dif') {
    return base;
  }

  // ── Diagnostics (nunca muta) ─────────────────────────────
  if (verb === 'diag') {
    return base;
  }

  // ── Slash commands ───────────────────────────────────────
  if (verb === 'slash') {
    // /save emite persist:flush; /reset emite machine:reset-requested
    if (ast.command === 'save') {
      return { mutated: false, events: ['persist:flush'], halt: false };
    }
    if (ast.command === 'reset') {
      return { mutated: false, events: ['machine:reset-requested'], halt: false };
    }
    return base;
  }

  return base;
}

export class ExpectationTracker {
  /**
   * @param {Object} [opts={}]
   * @param {number} [opts.maxEntries=500]
   * @param {boolean} [opts.enabled=true]
   */
  constructor({ maxEntries = 500, enabled = true } = {}) {
    this.maxEntries = Math.max(1, maxEntries);
    this.enabled = !!enabled;

    /** @type {Map<string, Object>} commandId → Entry */
    this.entries = new Map();

    /** @type {Array<string>} ordem de inserção */
    this._order = [];

    /** Contador monotônico para IDs únicos dentro da sessão */
    this._seq = 0;

    /** Rastreia total histórico (não limitado pelo ring) */
    this._totalDeclared = 0;
    this._totalObserved = 0;
    this._totalFailures = 0;
  }

  // ══════════════════════════════════════════════════════════
  // API principal
  // ══════════════════════════════════════════════════════════

  /**
   * Declara uma expectativa antes de rodar o comando.
   *
   * Chamado pelo `Instrumentation` logo após o `ParseSystem` produzir AST.
   * Se `enabled === false`, retorna string vazia (falsy) sem efeito colateral.
   *
   * @param {string} line
   * @param {Object} ast
   * @param {Object} [ctx={}]
   * @param {string} [ctx.kind] — 'command' | 'slash-command' | ...
   * @param {string} [ctx.tick] — tick ANTES da execução
   * @returns {string} commandId (string vazia se disabled)
   */
  declare(line, ast, ctx = {}) {
    if (!this.enabled) return '';

    const commandId = this._nextId();
    const expected = deriveExpectations(ast, ctx);

    const entry = {
      commandId,
      line: String(line ?? ''),
      ast: ast
        ? {
            verb: ast.verb ?? null,
            action: ast.action ?? null,
            subtype: ast.subtype ?? null,
          }
        : null,
      kind: ctx.kind ?? null,
      tickBefore: ctx.tick ?? null,
      declaredAt: Date.now(),

      expected,

      events: [],
      actual: null,
      diff: null,
      observedAt: null,
    };

    this.entries.set(commandId, entry);
    this._order.push(commandId);
    this._totalDeclared++;
    this._evict();

    return commandId;
  }

  /**
   * Registra um evento observado entre declare e observe.
   *
   * Chamado pelo wildcard `'*'` do bus anexado pelo `Instrumentation`.
   * Se o `commandId` não existir mais (foi evictado) ou não for passado,
   * é no-op silencioso.
   *
   * @param {string} commandId
   * @param {string} event
   * @param {any} [payload=null]
   */
  recordEvent(commandId, event, payload = null) {
    if (!commandId) return;
    const entry = this.entries.get(commandId);
    if (!entry) return;

    entry.events.push({
      event: String(event),
      payload: this._safePayload(payload),
      ts: Date.now(),
    });
  }

  /**
   * Registra vários eventos de uma vez.
   *
   * Útil quando o consumidor faz buffering antes de flushar.
   *
   * @param {string} commandId
   * @param {Array<{event:string, payload?:any}>} events
   */
  recordEvents(commandId, events) {
    if (!commandId || !Array.isArray(events)) return;
    const entry = this.entries.get(commandId);
    if (!entry) return;

    for (const e of events) {
      if (!e || !e.event) continue;
      entry.events.push({
        event: String(e.event),
        payload: this._safePayload(e.payload ?? null),
        ts: e.ts ?? Date.now(),
      });
    }
  }

  /**
   * Observa o resultado real e calcula diff.
   *
   * Chamado pelo `Instrumentation` no `finally` do `_wrapHandleLine`,
   * depois de todos os sistemas terem rodado.
   *
   * @param {string} commandId
   * @param {Object} result — SystemResult de machine.handleLine
   * @param {Object} [ctx={}]
   * @param {string} [ctx.tickAfter] — tick DEPOIS da execução
   * @returns {Object|null} entry preenchida, ou null se não existir
   */
  observe(commandId, result, ctx = {}) {
    if (!commandId) return null;
    const entry = this.entries.get(commandId);
    if (!entry) return null;

    entry.actual = {
      ok: result?.ok !== false,
      mutated: result?.mutated === true,
      halt: result?.halt === true,
      error: result?.error ?? null,
      tickAfter: ctx.tickAfter ?? null,
      tickAdvanced: entry.tickBefore !== null && ctx.tickAfter !== null
        ? entry.tickBefore !== ctx.tickAfter
        : null,
    };
    entry.observedAt = Date.now();
    entry.diff = this._compare(entry);

    this._totalObserved++;
    if (entry.diff.hasDiscrepancies) {
      this._totalFailures++;
    }

    return this.get(commandId);
  }

  // ══════════════════════════════════════════════════════════
  // Consultas
  // ══════════════════════════════════════════════════════════

  /**
   * Retorna uma entrada (cópia rasa).
   * @param {string} commandId
   * @returns {Object|null}
   */
  get(commandId) {
    const entry = this.entries.get(commandId);
    return entry ? this._copy(entry) : null;
  }

  /**
   * Todas as entradas (cópias).
   * @returns {Array<Object>}
   */
  getAll() {
    return this._order
      .map(id => this.get(id))
      .filter(Boolean);
  }

  /**
   * Entradas com discrepâncias (mais recentes primeiro).
   * @param {number} [limit]
   * @returns {Array<Object>}
   */
  getFailures(limit = null) {
    const out = this.getAll()
      .filter(e => e.diff?.hasDiscrepancies === true)
      .reverse();
    if (Number.isFinite(limit) && limit > 0) return out.slice(0, limit);
    return out;
  }

  /**
   * Estatísticas resumidas.
   * @returns {Object}
   */
  stats() {
    const all = this.getAll();
    const failures = all.filter(e => e.diff?.hasDiscrepancies);

    return {
      total: all.length,
      failures: failures.length,
      maxEntries: this.maxEntries,
      failureRate: all.length > 0 ? failures.length / all.length : 0,
      totalDeclared: this._totalDeclared,
      totalObserved: this._totalObserved,
      totalFailures: this._totalFailures,
      enabled: this.enabled,
    };
  }

  /**
   * Serializa.
   * @returns {Object}
   */
  toJSON() {
    return {
      stats: this.stats(),
      entries: this.getAll(),
    };
  }

  // ══════════════════════════════════════════════════════════
  // Controle
  // ══════════════════════════════════════════════════════════

  /**
   * Liga/desliga.
   * @param {boolean} v
   * @returns {ExpectationTracker} this
   */
  setEnabled(v) {
    this.enabled = !!v;
    return this;
  }

  /**
   * Limpa entradas e contadores.
   */
  clear() {
    this.entries.clear();
    this._order = [];
    this._seq = 0;
    this._totalDeclared = 0;
    this._totalObserved = 0;
    this._totalFailures = 0;
  }

  /**
   * Destrói.
   */
  destroy() {
    this.clear();
    this.enabled = false;
  }

  // ══════════════════════════════════════════════════════════
  // Internos
  // ══════════════════════════════════════════════════════════

  /**
   * Compara expected vs actual e produz diff.
   * @param {Object} entry
   * @returns {Object}
   * @private
   */
  _compare(entry) {
    const expected = entry.expected;
    const actual = entry.actual;
    const discrepancies = [];

    // 1. mutated
    if (expected.mutated !== actual.mutated) {
      discrepancies.push({
        field: 'mutated',
        expected: expected.mutated,
        actual: actual.mutated,
      });
    }

    // 2. halt
    if (expected.halt !== actual.halt) {
      discrepancies.push({
        field: 'halt',
        expected: expected.halt,
        actual: actual.halt,
      });
    }

    // 3. tick advancement (só quando ambos esperavam mutação e mutaram)
    if (expected.mutated && actual.mutated) {
      if (actual.tickAdvanced === false) {
        discrepancies.push({
          field: 'tickAdvanced',
          expected: true,
          actual: false,
          note: 'mutated=true mas tick não avançou',
        });
      }
    }

    // 4. eventos esperados não observados
    const observedEventNames = new Set(entry.events.map(e => e.event));
    const missingEvents = expected.events.filter(e => !observedEventNames.has(e));
    if (missingEvents.length > 0) {
      discrepancies.push({
        field: 'events.missing',
        expected: missingEvents,
        actual: Array.from(observedEventNames),
      });
    }

    // 5. erro inesperado em comando que deveria mutar
    if (actual.error && expected.mutated) {
      discrepancies.push({
        field: 'error',
        expected: null,
        actual: actual.error,
      });
    }

    // 6. halt inesperado com erro — sinal mais forte de problema
    if (actual.halt === true && actual.error && expected.halt !== true) {
      // já coberto pelo item 2, mas registramos a nota para o consumidor
      const haltDisc = discrepancies.find(d => d.field === 'halt');
      if (haltDisc) haltDisc.note = `halt inesperado: ${actual.error}`;
    }

    return {
      hasDiscrepancies: discrepancies.length > 0,
      discrepancies,
      missingEvents,
      observedEventCount: entry.events.length,
    };
  }

  /**
   * Cópia defensiva de uma entrada (não expõe referências internas).
   * @param {Object} entry
   * @returns {Object}
   * @private
   */
  _copy(entry) {
    return {
      commandId: entry.commandId,
      line: entry.line,
      ast: entry.ast ? { ...entry.ast } : null,
      kind: entry.kind,
      tickBefore: entry.tickBefore,
      declaredAt: entry.declaredAt,
      observedAt: entry.observedAt,
      expected: {
        ...entry.expected,
        events: [...entry.expected.events],
      },
      actual: entry.actual ? { ...entry.actual } : null,
      events: entry.events.map(e => ({ ...e })),
      diff: entry.diff
        ? {
            hasDiscrepancies: entry.diff.hasDiscrepancies,
            discrepancies: entry.diff.discrepancies.map(d => ({ ...d })),
            missingEvents: [...entry.diff.missingEvents],
            observedEventCount: entry.diff.observedEventCount,
          }
        : null,
    };
  }

  /**
   * Evict do mais antigo quando o ring está cheio.
   * @private
   */
  _evict() {
    while (this.entries.size > this.maxEntries) {
      const oldestId = this._order.shift();
      if (oldestId !== undefined) {
        this.entries.delete(oldestId);
      }
    }
  }

  /**
   * Gera um commandId único dentro da sessão.
   * Formato: `cmd-<seq>-<ts36>`
   * @returns {string}
   * @private
   */
  _nextId() {
    this._seq++;
    const t = Date.now().toString(36);
    return `cmd-${this._seq}-${t}`;
  }

  /**
   * Converte payload em algo serializável, com fallback seguro.
   * @param {any} payload
   * @returns {any}
   * @private
   */
  _safePayload(payload) {
    if (payload === null || payload === undefined) return null;
    if (
      typeof payload === 'string' ||
      typeof payload === 'number' ||
      typeof payload === 'boolean'
    ) {
      return payload;
    }
    try {
      return JSON.parse(JSON.stringify(payload));
    } catch {
      return { _unsafe: true, _type: typeof payload };
    }
  }
}