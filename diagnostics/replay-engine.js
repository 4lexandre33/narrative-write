/**
 * @file replay-engine.js
 * @module diagnostics
 * @description Grava sessões de comandos e reproduz deterministicamente.
 * @imports — (nenhum)
 * @importedBy diagnostics/index (Fase 6+), systems/diagnostics-system (Fase 6+)
 * @level 9
 *
 * Modelo:
 *   Session = { id, name, startedAt, endedAt, commands[], meta }
 *   Command = { seq, line, ts, tick, kind }
 *
 * Uso:
 *   const engine = new ReplayEngine();
 *   engine.startSession('bug-2026-09-23');
 *   // após cada handleLine:
 *   engine.record(line, { tick, kind });
 *   engine.endSession(finalSnapshot);
 *
 *   // Depois, para reproduzir:
 *   const result = engine.replay(session, { machine: freshMachine });
 *   const diff = engine.compare(session.finalSnapshot, result.actualSnapshot);
 *
 * API:
 *   startSession / record / endSession
 *   getSession / listSessions / clearSessions
 *   exportSession / importSession
 *   replay / compare
 */

export class ReplayEngine {
  /**
   * @param {Object} [opts={}]
   * @param {number} [opts.maxSessions=20]
   * @param {number} [opts.maxCommandsPerSession=5000]
   * @param {boolean} [opts.autoRecord=false]
   */
  constructor({
    maxSessions = 20,
    maxCommandsPerSession = 5000,
    autoRecord = false,
  } = {}) {
    this.maxSessions = Math.max(1, maxSessions);
    this.maxCommandsPerSession = Math.max(1, maxCommandsPerSession);
    this.autoRecord = !!autoRecord;

    /** @type {Map<string, Object>} sessionId → Session */
    this.sessions = new Map();

    /** @type {Object|null} sessão atualmente gravando */
    this.activeSession = null;

    /** @type {number} contador para ids de sessão */
    this._sessionCounter = 0;
  }

  // ── Ciclo de vida da sessão ─────────────────────────────────

  /**
   * Inicia uma nova sessão de gravação.
   * Se já existe uma ativa, ela é encerrada automaticamente.
   * @param {string} [name]
   * @param {Object} [meta={}]
   * @returns {Object} sessão criada
   */
  startSession(name = null, meta = {}) {
    if (this.activeSession) {
      this.endSession();
    }

    this._sessionCounter++;
    const id = name
      ? String(name)
      : `s-${Date.now().toString(36)}-${this._sessionCounter}`;

    const session = {
      id,
      name: id,
      startedAt: Date.now(),
      endedAt: null,
      meta: { ...meta },
      commands: [],
      initialSnapshot: meta.initialSnapshot ?? null,
      finalSnapshot: null,
    };

    this.sessions.set(id, session);
    this.activeSession = session;
    this._evictOld();

    return session;
  }

  /**
   * Registra um comando na sessão ativa.
   * Silenciosamente ignorado se não há sessão ativa ou se atingiu o limite.
   * @param {string} line
   * @param {Object} [ctx={}] — { tick, kind }
   * @returns {Object|null} entrada criada
   */
  record(line, ctx = {}) {
    if (!this.activeSession) return null;
    if (this.activeSession.commands.length >= this.maxCommandsPerSession) {
      return null;
    }

    const entry = {
      seq: this.activeSession.commands.length + 1,
      line: String(line ?? ''),
      ts: Date.now(),
      tick: ctx.tick ?? null,
      kind: ctx.kind ?? null,
    };

    this.activeSession.commands.push(entry);
    return entry;
  }

  /**
   * Encerra a sessão ativa.
   * @param {Object} [finalSnapshot=null]
   * @returns {Object|null} sessão encerrada
   */
  endSession(finalSnapshot = null) {
    if (!this.activeSession) return null;

    const s = this.activeSession;
    s.endedAt = Date.now();
    if (finalSnapshot) s.finalSnapshot = finalSnapshot;

    this.activeSession = null;
    return s;
  }

  /**
   * Verifica se está gravando.
   * @returns {boolean}
   */
  isRecording() {
    return this.activeSession !== null;
  }

  // ── Consultas ───────────────────────────────────────────────

  /**
   * Retorna uma sessão.
   * @param {string} id
   * @returns {Object|null}
   */
  getSession(id) {
    return this.sessions.get(id) ?? null;
  }

  /**
   * Lista todas as sessões (resumo).
   * @returns {Array<Object>}
   */
  listSessions() {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.id,
      name: s.name,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      commandCount: s.commands.length,
      durationMs: s.endedAt ? s.endedAt - s.startedAt : null,
    }));
  }

  /**
   * Limpa todas as sessões.
   */
  clearSessions() {
    this.sessions.clear();
    this.activeSession = null;
  }

  /**
   * Número de sessões armazenadas.
   * @returns {number}
   */
  size() {
    return this.sessions.size;
  }

  // ── Import/Export ───────────────────────────────────────────

  /**
   * Exporta uma sessão em JSON.
   * @param {string} id
   * @param {boolean} [pretty=true]
   * @returns {string|null}
   */
  exportSession(id, pretty = true) {
    const s = this.sessions.get(id);
    if (!s) return null;
    return pretty ? JSON.stringify(s, null, 2) : JSON.stringify(s);
  }

  /**
   * Importa uma sessão de JSON.
   * @param {string|Object} json
   * @returns {Object|null}
   */
  importSession(json) {
    let parsed;
    try {
      parsed = typeof json === 'string' ? JSON.parse(json) : json;
    } catch {
      return null;
    }

    if (!parsed || !parsed.id || !Array.isArray(parsed.commands)) return null;

    this.sessions.set(parsed.id, parsed);
    this._evictOld();
    return parsed;
  }

  // ── Replay ──────────────────────────────────────────────────

  /**
   * Reproduz uma sessão contra um Machine.
   * IMPORTANTE: o caller deve fornecer um Machine limpo
   * (idealmente recém-criado, com os mesmos sistemas registrados).
   * Não faz reset nem restore — apenas executa os comandos em sequência.
   *
   * @param {Object} session
   * @param {Object} opts
   * @param {Object} opts.machine — Machine de destino
   * @param {boolean} [opts.captureFinal=false] — captura snapshot final se true
   * @param {Function} [opts.onCommand] — callback(opcional) por comando
   * @returns {Object}
   */
  replay(session, { machine, captureFinal = false, onCommand = null } = {}) {
    if (!session || !Array.isArray(session.commands)) {
      return { ok: false, error: 'sessão inválida (commands ausente)' };
    }
    if (!machine || typeof machine.handleLine !== 'function') {
      return { ok: false, error: 'machine inválido' };
    }

    const results = [];
    const errors = [];
    const t0 = this._now();

    for (const cmd of session.commands) {
      let res;
      try {
        res = machine.handleLine(cmd.line);
      } catch (err) {
        res = { ok: false, error: err.message, mutated: false };
      }

      const entry = {
        seq: cmd.seq,
        line: cmd.line,
        ok: res.ok !== false,
        mutated: res.mutated === true,
        error: res.error ?? null,
        tick: res.tick ?? (typeof machine.getTick === 'function' ? machine.getTick() : null),
      };

      results.push(entry);
      if (entry.ok === false) errors.push(entry);

      if (typeof onCommand === 'function') {
        try { onCommand(entry, cmd); } catch { /* isola */ }
      }
    }

    const durationMs = this._round(this._now() - t0);

    const out = {
      ok: errors.length === 0,
      sessionId: session.id,
      sessionName: session.name,
      executed: results.length,
      failed: errors.length,
      durationMs,
      results,
      errors,
      finalTick: typeof machine.getTick === 'function' ? machine.getTick() : null,
      finalTimeline: typeof machine.getTimeline === 'function' ? machine.getTimeline() : null,
    };

    if (captureFinal && machine.world) {
      out.actualSnapshot = this._captureWorld(machine.world);
    }

    return out;
  }

  // ── Compare ─────────────────────────────────────────────────

  /**
   * Compara o estado esperado (recorded) com o estado real (replayed).
   * @param {Object|null} expected — snapshot gravado (formato: { entities })
   * @param {Object|null} actual — snapshot obtido via _captureWorld
   * @returns {Object}
   */
  compare(expected, actual) {
    if (!expected || !actual) {
      return {
        equal: null,
        reason: 'snapshot ausente',
      };
    }

    const expectedEntities = expected.entities ?? expected.world?.entities ?? {};
    const actualEntities = actual.entities ?? actual.world?.entities ?? {};

    const expIds = new Set(Object.keys(expectedEntities));
    const actIds = new Set(Object.keys(actualEntities));

    const added = [];
    const removed = [];
    const changed = [];

    for (const id of actIds) {
      if (!expIds.has(id)) added.push(id);
    }
    for (const id of expIds) {
      if (!actIds.has(id)) removed.push(id);
    }

    for (const id of expIds) {
      if (!actIds.has(id)) continue;

      const eComps = expectedEntities[id] || {};
      const aComps = actualEntities[id] || {};
      const compNames = new Set([...Object.keys(eComps), ...Object.keys(aComps)]);
      const compDiffs = [];

      for (const comp of compNames) {
        const a = eComps[comp];
        const b = aComps[comp];

        if (a === undefined && b !== undefined) {
          compDiffs.push({ component: comp, op: 'added' });
        } else if (a !== undefined && b === undefined) {
          compDiffs.push({ component: comp, op: 'removed' });
        } else if (JSON.stringify(a) !== JSON.stringify(b)) {
          compDiffs.push({ component: comp, op: 'changed' });
        }
      }

      if (compDiffs.length > 0) {
        changed.push({ id, components: compDiffs });
      }
    }

    const equal = added.length === 0 && removed.length === 0 && changed.length === 0;

    return {
      equal,
      added,
      removed,
      changed,
      stats: {
        expectedEntities: expIds.size,
        actualEntities: actIds.size,
        added: added.length,
        removed: removed.length,
        changed: changed.length,
      },
    };
  }

  // ── Internos ────────────────────────────────────────────────

  /**
   * @private
   */
  _evictOld() {
    while (this.sessions.size > this.maxSessions) {
      const oldestKey = this.sessions.keys().next().value;
      if (oldestKey === undefined) break;
      this.sessions.delete(oldestKey);
    }
  }

  /**
   * @private
   */
  _captureWorld(world) {
    const entities = {};
    for (const id of world.allEntities()) {
      entities[id] = world.componentsOf(id);
    }
    return { entities, count: world.allEntities().length };
  }

  /**
   * @private
   */
  _now() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  /**
   * @private
   */
  _round(n) {
    return Math.round(Number(n) * 1000) / 1000;
  }
}