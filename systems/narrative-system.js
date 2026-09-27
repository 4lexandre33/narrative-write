/**
 * @file narrative-system.js
 * @module systems
 * @description Integra o subsistema narrativo PT-BR ao pipeline ECS.
 * @imports ecs/system, core/constants,
 *          narrative-language/index,
 *          narrative-language/acts/projector,
 *          narrative-language/ir/catalog,
 *          narrative-language/overrides,
 *          narrative-language/user-lexicon,
 *          narrative-language/diagnostics/diag-handlers
 * @importedBy boot.js
 * @level 7
 *
 * ═══════════════════════════════════════════════════════════════
 * CAMADA 6 — CONTEXTO DE CENA
 * ═══════════════════════════════════════════════════════════════
 *
 * Até a Camada 5, `_buildContext()` passava arrays VAZIOS em
 * `sceneEntities`, `recentEntities` e `chapterEntities`. Como o
 * `resolver.js` já consumia esses arrays, a resolução pronominal
 * ficava sempre em "0 candidatos" → `REF_UNRESOLVED` ou
 * `REF_AMBIGUOUS` para quase todo pronome.
 *
 * A Camada 6 preenche os três arrays com heurísticas determinísticas:
 *
 *   projectEntities  → todas as entidades do World
 *   chapterEntities  → idem (não há capítulos formais ainda)
 *   recentEntities   → últimas N entidades mencionadas em atos
 *   sceneEntities    → entidades com `Links.location` = cena atual
 *
 * ── Heurísticas ─────────────────────────────────────────────
 *
 *   **Recentes:** buffer rolling de 30 IDs. Atualizado em cada
 *   análise: o sistema varre `act.references` e
 *   `act.proposition.roles` e empilha os entityIds encontrados.
 *   Os já presentes sobem para o topo (LRU). Nunca excede 30.
 *
 *   **Cena atual:** heurística baseada em `Links.location`:
 *
 *     1. Se `_sceneAnchorId` está setado e ainda existe → usa.
 *     2. Senão, agrupa todas as entidades por `Links.location`.
 *        O grupo com mais membros vence. Empate: maior id
 *        lexicográfico do anchor (determinismo).
 *     3. Se nenhuma entidade tem `Links.location`, cai para
 *        `recentEntities`.
 *     4. Se nada há, usa as últimas 10 entidades do World.
 *
 *   O `_sceneAnchorId` é atualizado por:
 *
 *     - `link.set.location` — quando o destino aponta para uma
 *       entidade do tipo `location`.
 *     - `entity:created` com tipo `location` — passa a ser a
 *       cena ativa.
 *     - Atos analisados que tenham role `location`.
 *
 * ── Persistência de estado ──────────────────────────────────
 *
 *   O buffer de recentes e o anchor de cena vivem em memória,
 *   não são persistidos. São reconstruídos do zero em cada boot
 *   através das primeiras análises.
 *
 * ═══════════════════════════════════════════════════════════════
 * Camadas anteriores (mantidas)
 * ═══════════════════════════════════════════════════════════════
 *
 *   Camada 4: thresholds por operação em `_emitAuto` / `_emitSuggest`.
 *   Camada 5: `learnVerbSubtype` / `learnConstructionOp`, integração
 *             com user-lexicon, exposição via `narr:learn:*`.
 *   Fase 13.7: `_extractLemmaFromIR` usa `ir.acts[].source`; handler
 *              `diag.narrative.*` registrado via bus.
 */

import { System } from '../ecs/system.js';
import { COMPONENT_NAMES } from '../core/constants.js';
import {
  analyze as analyzeNarrative,
  getProjection,
  NARRATIVE_CONFIG,
  DEFAULT_MODE,
  isModeValid,
  readMode,
  writeMode,
} from '../narrative-language/index.js';
import { projectMany } from '../narrative-language/acts/projector.js';
import { Catalog } from '../narrative-language/ir/catalog.js';
import {
  loadOverrides,
  saveOverride as saveOverrideEntry,
  clearOverride as clearOverrideEntry,
  clearAllOverrides as clearAllOverridesStorage,
  persistMap as persistOverrides,
  stats as overrideStats,
  listOverrides,
  DEFAULT_TTL_MS,
} from '../narrative-language/overrides.js';
import {
  loadUserLexicon,
  persistMap as persistLexicon,
  learn as lexiconLearn,
  learnVerbSubtype as lexiconLearnVerbSubtype,
  learnConstructionOp as lexiconLearnConstructionOp,
  forget as lexiconForgot,
  clearUserLexicon as clearUserLexiconStorage,
  stats as lexiconStats,
  listPreferences,
  listByKind as lexiconListByKind,
} from '../narrative-language/user-lexicon.js';
import { NarrativeDiagHandlers } from '../narrative-language/diagnostics/diag-handlers.js';

// ══════════════════════════════════════════════════════════════
// CONSTANTES — CAMADA 6
// ══════════════════════════════════════════════════════════════

/**
 * Tamanho máximo do buffer de entidades recentes.
 * @type {number}
 */
const _RECENT_MAX = 30;

/**
 * Fallback quando não há nenhuma entidade com `Links.location`:
 * usa as últimas N entidades do World.
 * @type {number}
 */
const _FALLBACK_SCENE_SIZE = 10;

/**
 * Papéis semânticos que identificam uma entidade na cena.
 * @type {ReadonlyArray<string>}
 */
const _SCENE_ROLES = Object.freeze([
  'agent', 'experiencer', 'patient', 'theme', 'target',
  'recipient', 'beneficiary', 'location', 'origin', 'destination',
]);

// ══════════════════════════════════════════════════════════════
// HELPERS DE MÓDULO
// ══════════════════════════════════════════════════════════════

function _now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function _inferGender(name) {
  const n = String(name ?? '').toLowerCase().trim();
  if (!n) return null;
  if (n.endsWith('a') || n.endsWith('á') || n.endsWith('ã')) return 'feminine';
  if (n.endsWith('o') || n.endsWith('ó')) return 'masculine';
  return null;
}

function _mkEntityRecord(id, ident) {
  return {
    id,
    name: ident.name,
    shortId: ident.id ?? '',
    type: ident.type ?? 'custom',
    gender: _inferGender(ident.name),
    number: 'singular',
  };
}

function _extractLemmaFromIR(ir, offset) {
  const acts = ir?.acts;
  if (!Array.isArray(acts)) return null;
  for (const act of acts) {
    const s = act.source;
    if (!s || typeof s.start !== 'number' || typeof s.end !== 'number') continue;
    if (offset >= s.start && offset <= s.end) {
      const raw = String(s.raw ?? '').trim();
      if (!raw) continue;
      const first = raw.split(/\s+/)[0] ?? '';
      return first.toLowerCase();
    }
  }
  return null;
}

function _offsetFromSpanKey(spanKey) {
  if (typeof spanKey !== 'string') return null;
  const m = /^(.+?)\.t(\d+)$/.exec(spanKey);
  if (!m) return null;
  const n = parseInt(m[2], 10);
  return Number.isFinite(n) ? n : null;
}

// ══════════════════════════════════════════════════════════════
// CLASSE
// ══════════════════════════════════════════════════════════════

export class NarrativeSystem extends System {
  constructor() {
    super('NarrativeSystem');

    this.mode = DEFAULT_MODE;
    this._unsubs = [];

    this._stats = {
      analyzed: 0, previewed: 0, suggested: 0,
      auto: 0, applied: 0, failed: 0, skipped: 0,
      overrides: 0, learned: 0,
      // ── Camada 6 ────────────────────────────────────
      sceneHits: 0,
      recentHits: 0,
    };

    this._lastIR = null;
    this._lastLine = null;
    this._overrides = new Map();
    this._userLexicon = new Map();

    // ── Camada 6 — estado de cena ──────────────────────────
    /**
     * Rolling buffer de IDs recentemente mencionados em atos.
     * Mais recente no fim. Sem duplicatas. Máx `_RECENT_MAX`.
     * @type {string[]}
     */
    this._recentEntityIds = [];

    /**
     * ID da entidade que ancora a cena atual.
     * Atualizado por `link.set.location` e por atos com role `location`.
     * @type {string|null}
     */
    this._sceneAnchorId = null;

    /** @type {NarrativeDiagHandlers|null} */
    this._diagHandlers = null;
  }

  // ═══════════════════════════════════════════════════════════
  // Ciclo de vida
  // ═══════════════════════════════════════════════════════════

  init() {
    if (!this.machine) return;

    try { this.mode = readMode(); } catch { this.mode = DEFAULT_MODE; }
    try { this._overrides = loadOverrides(); } catch { this._overrides = new Map(); }
    try { this._userLexicon = loadUserLexicon(); } catch { this._userLexicon = new Map(); }

    // Camada 6: reconstrói cena inicial a partir do World existente
    try {
      const anchor = this._detectSceneAnchorId();
      if (anchor) this._sceneAnchorId = anchor;
    } catch { /* isola */ }

    this._wireEvents();
    this._registerDiagHandler();
  }

  destroy() {
    for (const unsub of this._unsubs) {
      try { unsub(); } catch { /* isola */ }
    }
    this._unsubs = [];
    this._lastIR = null;
    this._lastLine = null;
    this._recentEntityIds = [];
    this._sceneAnchorId = null;
  }

  _registerDiagHandler() {
    if (!this.bus) return;
    try {
      this.bus.emit('diag:handler:register', {
        verb: 'narrative',
        handler: (prev, ast) => this._dispatchDiagNarrative(prev, ast),
      });
    } catch { /* isola */ }
  }

  _dispatchDiagNarrative(prev, ast) {
    try {
      if (!this._diagHandlers) {
        this._diagHandlers = new NarrativeDiagHandlers(this.machine.systems.get('DiagnosticsSystem'));
      }
      return this._diagHandlers.dispatch(prev, ast);
    } catch (err) {
      return {
        ...prev, ok: false, halt: true,
        error: `narrative handler falhou: ${err?.message ?? String(err)}`,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // API pública — modo
  // ═══════════════════════════════════════════════════════════

  setMode(mode) {
    if (!isModeValid(mode)) return false;
    if (this.mode === mode) return true;
    this.mode = mode;
    try { writeMode(mode); } catch { /* isola */ }
    try { this.bus.emit('narr:mode:changed', { mode }); } catch { /* isola */ }
    return true;
  }

  getMode() { return this.mode; }

  getStats() {
    return {
      mode: this.mode,
      stats: { ...this._stats },
      hasLastIR: this._lastIR !== null,
      lastIRActs: this._lastIR?.acts?.length ?? 0,
      overridesCount: this._overrides.size,
      lexiconCount: this._userLexicon.size,
      lexiconByKind: lexiconStats().byKind,
      // ── Camada 6 ─────────────────────────────────────
      recentCount: this._recentEntityIds.length,
      sceneAnchorId: this._sceneAnchorId,
      sceneAnchorName: this._sceneAnchorId
        ? this.world?.get?.(this._sceneAnchorId, COMPONENT_NAMES.IDENTITY)?.name ?? null
        : null,
    };
  }

  /**
   * Devolve um snapshot do contexto de cena atual.
   * Útil para debug via console ou UI.
   *
   * @returns {Object}
   */
  getSceneContext() {
    const all = this._collectAllEntities();
    const recent = this._collectRecentEntities(all);
    const scene = this._detectSceneEntities(all);

    return {
      anchorId: this._sceneAnchorId,
      anchorName: this._sceneAnchorId
        ? this.world?.get?.(this._sceneAnchorId, COMPONENT_NAMES.IDENTITY)?.name ?? null
        : null,
      recentIds: this._recentEntityIds.slice(),
      recentCount: recent.length,
      sceneCount: scene.length,
      sceneIds: scene.map((e) => e.id),
      totalEntities: all.length,
      stats: {
        sceneHits: this._stats.sceneHits,
        recentHits: this._stats.recentHits,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // API pública — aprendizagem (Camada 5)
  // ═══════════════════════════════════════════════════════════

  learnVerbSubtype(lemma, dnumber, opts = {}) {
    if (typeof lemma !== 'string' || !lemma) return false;
    if (typeof dnumber !== 'string' || !dnumber) return false;

    try {
      const ok = lexiconLearnVerbSubtype(lemma, dnumber, opts);
      if (ok) {
        this._userLexicon = loadUserLexicon();
        this._stats.learned++;
        try {
          this.bus.emit('narr:learn:verb-subtype', {
            lemma: String(lemma).toLowerCase(),
            dnumber,
            uses: this._userLexicon.get(String(lemma).toLowerCase())?.uses ?? 1,
          });
        } catch { /* isola */ }
      }
      return ok;
    } catch { return false; }
  }

  learnConstructionOp(constructionId, operation, opts = {}) {
    if (typeof constructionId !== 'string' || !constructionId) return false;
    if (typeof operation !== 'string' || !operation) return false;

    try {
      const ok = lexiconLearnConstructionOp(constructionId, operation, opts);
      if (ok) {
        this._userLexicon = loadUserLexicon();
        this._stats.learned++;
        try {
          this.bus.emit('narr:learn:construction-op', {
            constructionId: String(constructionId).toLowerCase(),
            operation,
          });
        } catch { /* isola */ }
      }
      return ok;
    } catch { return false; }
  }

  forgetLexicon(key) {
    if (typeof key !== 'string' || !key) return false;
    try {
      const removed = lexiconForgot(key);
      if (removed) this._userLexicon = loadUserLexicon();
      return removed;
    } catch { return false; }
  }

  clearLexicon() {
    try {
      const n = clearUserLexiconStorage();
      this._userLexicon = new Map();
      return n;
    } catch { return 0; }
  }

  // ═══════════════════════════════════════════════════════════
  // API pública — overrides de referência
  // ═══════════════════════════════════════════════════════════

  applyOverride(spanKey, opts = {}) {
    try {
      return this._handleOverrideSet({
        spanKey, chose: opts.chose, rejected: opts.rejected, learn: opts.learn === true,
      });
    } catch { return false; }
  }

  forgetOverride(spanKey) {
    if (typeof spanKey !== 'string' || !spanKey) return false;
    return this._handleOverrideClear(spanKey);
  }

  clearAllOverrides() {
    try {
      const n = clearAllOverridesStorage();
      this._overrides = new Map();
      this._stats.overrides += n;
      return n;
    } catch { return 0; }
  }

  // ═══════════════════════════════════════════════════════════
  // Pipeline
  // ═══════════════════════════════════════════════════════════

  run(line, ctx, prev) {
    try {
      if (!line || !prev || prev.kind === 'empty') return prev;
      if (prev.kind === 'prose') return this._runProse(line, ctx, prev);
      if (prev.kind === 'command' && prev.ast?.verb === 'narr') {
        return this._runNarrCommand(line, ctx, prev);
      }
      return prev;
    } catch (err) {
      try { this.bus.emit('narrative:degraded', { reason: `NarrativeSystem.run falhou: ${err?.message ?? String(err)}` }); } catch { /* isola */ }
      return prev;
    }
  }

  _runProse(line, ctx, prev) {
    if (this.mode === 'off') { this._stats.skipped++; return prev; }
    const text = String(line ?? '').trim();
    if (!text) return prev;
    this._scheduleAnalysis(text, ctx);
    return prev;
  }

  _scheduleAnalysis(text, ctx) {
    if (this.mode === 'off') return;
    const t0 = _now();
    const context = this._buildContext(ctx);

    // Recarrega o user lexicon a cada análise
    try { this._userLexicon = loadUserLexicon(); } catch { /* isola */ }
    context.userLexicon = this._userLexicon;

    analyzeNarrative(text, context)
      .then((ir) => {
        if (this.mode === 'off') return;
        const latency = _now() - t0;
        if (latency > NARRATIVE_CONFIG.maxLatencySlowMs) {
          this.bus.emit('narrative:degraded', {
            reason: `Análise demorou ${Math.round(latency)}ms`,
            latencyMs: Math.round(latency),
          });
        }
        this._stats.analyzed++;
        this._lastIR = ir;
        this._lastLine = text;

        // ── Camada 6: atualiza buffers de cena após análise ──
        try { this._trackFromIR(ir); } catch { /* isola */ }

        this._emitByMode(ir, context);
      })
      .catch((err) => {
        this._stats.failed++;
        try { this.bus.emit('narrative:degraded', { reason: `Análise falhou: ${err?.message ?? String(err)}` }); } catch { /* isola */ }
      });
  }

  _emitByMode(ir, context) {
    if (!ir) return;
    this._emitPreview(ir);
    switch (this.mode) {
      case 'preview': this._stats.previewed++; break;
      case 'suggest': this._stats.suggested++; this._emitSuggest(ir, context); break;
      case 'auto': this._emitAuto(ir, context); break;
      default: break;
    }
    this._emitDiagnostics(ir);
  }

  _emitPreview(ir) {
    try {
      this.bus.emit('narrative:preview', {
        ir,
        spans: ir?._internal?.spans ?? [],
        sentences: ir?._internal?.sentences ?? [],
        acts: ir.acts ?? [],
      });
    } catch { /* isola */ }
  }

  _emitSuggest(ir, context) {
    const projection = context?.projection ?? 'literary';
    let proposals = [];
    try { proposals = projectMany(ir.acts ?? [], { projection }); } catch { /* isola */ }
    const filtered = proposals.filter((p) => {
      if (typeof p.confidence !== 'number') return false;
      const op = p.operation ?? 'represent';
      const threshold = NARRATIVE_CONFIG.suggestThresholds?.[op]
        ?? NARRATIVE_CONFIG.suggestThreshold;
      return p.confidence >= threshold;
    });
    try { this.bus.emit('narrative:suggest', { ir, proposals: filtered }); } catch { /* isola */ }
  }

  _emitAuto(ir, context) {
    const projection = context?.projection ?? 'literary';
    let proposals = [];
    try { proposals = projectMany(ir.acts ?? [], { projection }); } catch { /* isola */ }

    let appliedHere = 0;
    const byOp = { applied: {}, skipped: {} };

    for (const p of proposals) {
      const op = p.operation ?? 'represent';
      const threshold = NARRATIVE_CONFIG.autoThresholds?.[op]
        ?? NARRATIVE_CONFIG.autoThreshold;

      if (typeof p.confidence !== 'number' || p.confidence < threshold) {
        byOp.skipped[op] = (byOp.skipped[op] ?? 0) + 1;
        continue;
      }

      try {
        const result = this.machine.handleLine(p.command);
        if (result?.ok === false) { this._stats.failed++; continue; }
        this._stats.applied++;
        appliedHere++;
        byOp.applied[op] = (byOp.applied[op] ?? 0) + 1;
        try {
          this.bus.emit('narrative:act:applied', {
            actId: p.actId, command: p.command, operation: op, threshold, result,
          });
        } catch { /* isola */ }
      } catch (err) {
        this._stats.failed++;
        try {
          this.bus.emit('narrative:degraded', {
            reason: `Aplicação de "${p.command}" falhou: ${err?.message ?? String(err)}`,
          });
        } catch { /* isola */ }
      }
    }

    if (appliedHere > 0) {
      this._stats.auto++;
      try {
        this.bus.emit('narrative:auto:summary', {
          applied: appliedHere,
          byOperation: byOp.applied,
        });
      } catch { /* isola */ }
    }
  }

  _emitDiagnostics(ir) {
    const diags = ir?.diagnostics ?? [];
    if (!Array.isArray(diags)) return;
    for (const d of diags) {
      try { this.bus.emit('narrative:diagnostic', d); } catch { /* isola */ }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // narr.*
  // ═══════════════════════════════════════════════════════════

  _runNarrCommand(_line, _ctx, prev) {
    const ast = prev.ast;
    if (!ast) return prev;
    try {
      switch (ast.action) {
        case 'off':       this.setMode('off');     return { ...prev, ok: true, mutated: false };
        case 'preview':   this.setMode('preview'); return { ...prev, ok: true, mutated: false };
        case 'suggest':   this.setMode('suggest'); return { ...prev, ok: true, mutated: false };
        case 'auto':      this.setMode('auto');    return { ...prev, ok: true, mutated: false };
        case 'status':    return this._statusPayload(prev);
        case 'stats':     return this._statsPayload(prev);
        case 'overrides': return this._handleOverridesCommand(prev, ast);
        case 'lexicon':   return this._handleLexiconCommand(prev, ast);
        case 'catalog':   return this._catalogPayload(prev);
        default:          return { ...prev, ok: false, halt: true, error: `narr.${ast.action} não suportado` };
      }
    } catch (err) {
      return { ...prev, ok: false, halt: true, error: err?.message ?? String(err) };
    }
  }

  _handleOverridesCommand(prev, ast) {
    if (ast.subtype === 'clear') {
      const n = this.clearAllOverrides();
      return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: `📖 narr.overrides.clear (${n} removidos)`, data: { status: { removed: n } } } };
    }
    return this._overridesPayload(prev);
  }

  _handleLexiconCommand(prev, ast) {
    if (ast.subtype === 'forget') {
      const lemma = this._extractLemmaFromRaw(ast.raw);
      if (!lemma) return { ...prev, ok: false, halt: true, error: 'uso: narr.lexicon.forget <chave>' };
      const removed = this.forgetLexicon(lemma);
      return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: `📖 narr.lexicon.forget ${lemma}`, data: { status: { lemma, removed } } } };
    }
    if (ast.subtype === 'clear') {
      const n = this.clearLexicon();
      return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: `📖 narr.lexicon.clear (${n} removidos)`, data: { status: { removed: n } } } };
    }
    return this._lexiconPayload(prev);
  }

  _extractLemmaFromRaw(raw) {
    if (typeof raw !== 'string') return null;
    const m = /^narr\.lexicon\.forget\s+(\S+)/i.exec(raw.trim());
    return m?.[1] ? m[1].trim() : null;
  }

  _statusPayload(prev) {
    let projection = 'literary';
    try { projection = getProjection(); } catch { /* isola */ }
    return {
      ...prev, ok: true, mutated: false,
      right: {
        kind: 'card', title: '📖 narr.status',
        data: {
          mode: this.mode,
          projection,
          hasLastIR: this._lastIR !== null,
          lastIRActs: this._lastIR?.acts?.length ?? 0,
          lastLine: this._lastLine ? String(this._lastLine).slice(0, 60) : null,
          overridesCount: this._overrides.size,
          lexiconCount: this._userLexicon.size,
          lexiconByKind: lexiconStats().byKind,
          sceneAnchorId: this._sceneAnchorId,
          recentCount: this._recentEntityIds.length,
          stats: { ...this._stats },
        },
        sticky: true,
      },
    };
  }

  _statsPayload(prev) {
    return { ...prev, ok: true, mutated: false, right: { kind: 'table', title: '📖 narr.stats', data: [
      { metrica: 'Analisados',  valor: this._stats.analyzed },
      { metrica: 'Previews',    valor: this._stats.previewed },
      { metrica: 'Sugeridos',   valor: this._stats.suggested },
      { metrica: 'Auto',        valor: this._stats.auto },
      { metrica: 'Aplicados',   valor: this._stats.applied },
      { metrica: 'Falhas',      valor: this._stats.failed },
      { metrica: 'Pulados',     valor: this._stats.skipped },
      { metrica: 'Overrides',   valor: this._stats.overrides },
      { metrica: 'Aprendidos',  valor: this._stats.learned },
      { metrica: 'Scene hits',  valor: this._stats.sceneHits },
      { metrica: 'Recent hits', valor: this._stats.recentHits },
    ], sticky: true } };
  }

  _overridesPayload(prev) {
    const list = listOverrides();
    const st = overrideStats();
    return { ...prev, ok: true, mutated: false, right: { kind: 'table', title: `📖 narr.overrides (${list.length})`, data: list.slice(0, 50).map((o) => ({ span: o.key, chose: o.chose, rejeitados: (o.rejected ?? []).join(', '), uses: o.uses ?? 0, ttl_dias: Math.round(((o.ttl ?? DEFAULT_TTL_MS) / (24 * 60 * 60 * 1000))) })), metadata: { stats: st }, sticky: true } };
  }

  _lexiconPayload(prev) {
    const list = listPreferences();
    const st = lexiconStats();
    return { ...prev, ok: true, mutated: false, right: { kind: 'table', title: `📖 narr.lexicon (${list.length})`, data: list.slice(0, 50).map((p) => ({ chave: p.lemma, kind: p.kind, prefere: p.prefer, contexto: p.context ?? '—', uses: p.uses })), metadata: { stats: st }, sticky: true } };
  }

  _catalogPayload(prev) {
    let stats;
    try { stats = Catalog.catalogStats(); } catch (err) { return { ...prev, ok: false, halt: true, error: `catálogo indisponível: ${err?.message ?? String(err)}` }; }
    const rows = [];
    for (const opId of Catalog.operationIds()) {
      const op = Catalog.getOperation(opId);
      if (!op) continue;
      rows.push({ id: opId, nome: op.label ?? opId, tipo: 'Operação', pai: '—', traits: (op.traits ?? []).join(', ') || '—' });
      const stIds = Catalog.subtypeIds(opId);
      for (const stId of stIds) {
        const st = Catalog.getSubtype(stId);
        if (!st) continue;
        const traits = [...(op.traits ?? []), ...(st.traits ?? [])].join(', ') || '—';
        rows.push({ id: stId, nome: st.label ?? stId, tipo: 'Subtipo', pai: opId, traits });
      }
    }
    const axisRows = [];
    for (const axis of Catalog.allAxes()) {
      axisRows.push({ operação: axis.operation, eixo: axis.axis, valores: axis.values.join(' | ') });
    }
    return { ...prev, ok: true, mutated: false, right: { kind: 'table', title: `📖 narr.catalog — v${stats.version} · ${stats.operations} ops · ${stats.subtypes} subtipos · ${stats.axes} eixos · ${stats.traits} traits`, data: rows, metadata: { axes: axisRows, summary: stats }, sticky: true } };
  }

  // ═══════════════════════════════════════════════════════════
  // CAMADA 6 — Contexto de cena
  // ═══════════════════════════════════════════════════════════

  /**
   * Constrói o contexto narrativo para a análise.
   *
   * Camada 6: preenche `sceneEntities`, `recentEntities` e
   * `chapterEntities` a partir do World e do estado interno.
   *
   * @private
   */
  _buildContext(ctx) {
    const all = this._collectAllEntities();

    // ── Cena atual (heurística) ────────────────────────────
    const scene = this._detectSceneEntities(all);

    // ── Recentes (rolling buffer) ──────────────────────────
    const recent = this._collectRecentEntities(all);

    // ── Stats de cobertura ─────────────────────────────────
    if (scene.length > 0) this._stats.sceneHits++;
    if (recent.length > 0) this._stats.recentHits++;

    let projection = 'literary';
    try { projection = getProjection(); } catch { /* isola */ }

    return {
      documentId: ctx?.documentId ?? 'default',
      projectEntities: all,
      chapterEntities: all,       // sem capítulos formais ainda
      sceneEntities: scene,
      recentEntities: recent,
      sceneAnchorId: this._sceneAnchorId,
      overrides: this._overrides,
      userLexicon: this._userLexicon,
      projection,
    };
  }

  /**
   * Coleta todas as entidades do World como records normalizados.
   * @returns {Array<Object>}
   * @private
   */
  _collectAllEntities() {
    const out = [];
    try {
      const world = this.world;
      if (!world || typeof world.allEntities !== 'function') return out;
      for (const id of world.allEntities()) {
        const ident = world.get(id, COMPONENT_NAMES.IDENTITY);
        if (!ident || !ident.name) continue;
        out.push(_mkEntityRecord(id, ident));
      }
    } catch { /* isola */ }
    return out;
  }

  /**
   * Detecta as entidades que estão na mesma cena.
   *
   * Heurística:
   *   1. Se há `_sceneAnchorId` válido, devolve o grupo daquele
   *      anchor (`Links.location` = anchor).
   *   2. Senão, agrupa por `Links.location`. Grupo maior vence.
   *      Empate: chave lexicograficamente maior.
   *   3. Se ninguém tem `Links.location`, cai para recentes.
   *   4. Se ainda vazio, últimas N entidades do World.
   *
   * @param {Array<Object>} all
   * @returns {Array<Object>}
   * @private
   */
  _detectSceneEntities(all) {
    if (!Array.isArray(all) || all.length === 0) return [];

    const world = this.world;
    if (!world) return all.slice(-_FALLBACK_SCENE_SIZE);

    // ── 1. Se há anchor setado, usa ────────────────────────
    if (this._sceneAnchorId && world.hasEntity(this._sceneAnchorId)) {
      const scene = this._entitiesAtLocation(this._sceneAnchorId, all);
      if (scene.length > 0) return scene;
    }

    // ── 2. Agrupa por location ─────────────────────────────
    const byLocation = new Map();

    for (const ent of all) {
      const links = world.get(ent.id, COMPONENT_NAMES.LINKS);
      if (!links) continue;

      const loc = links.location;
      if (!loc) continue;

      const keys = Array.isArray(loc) ? loc : [loc];
      for (const key of keys) {
        if (typeof key !== 'string' || !key) continue;
        if (!byLocation.has(key)) byLocation.set(key, []);
        byLocation.get(key).push(ent);
      }
    }

    if (byLocation.size > 0) {
      let bestKey = null;
      let bestCount = -1;

      for (const [key, group] of byLocation) {
        if (group.length > bestCount ||
            (group.length === bestCount && key > bestKey)) {
          bestCount = group.length;
          bestKey = key;
        }
      }

      const group = byLocation.get(bestKey);
      if (Array.isArray(group) && group.length > 0) {
        // Atualiza o anchor para o próximo ciclo
        if (!this._sceneAnchorId || this._sceneAnchorId !== bestKey) {
          this._sceneAnchorId = bestKey;
        }
        return group.slice();
      }
    }

    // ── 3. Fallback para recentes ──────────────────────────
    const recent = this._collectRecentEntities(all);
    if (recent.length > 0) return recent;

    // ── 4. Fallback final ──────────────────────────────────
    return all.slice(-_FALLBACK_SCENE_SIZE);
  }

  /**
   * Devolve todas as entidades em um dado location.
   * @param {string} locationId
   * @param {Array<Object>} all
   * @returns {Array<Object>}
   * @private
   */
  _entitiesAtLocation(locationId, all) {
    const world = this.world;
    if (!world || !locationId) return [];

    const out = [];
    for (const ent of all) {
      const links = world.get(ent.id, COMPONENT_NAMES.LINKS);
      if (!links) continue;

      const loc = links.location;
      if (!loc) continue;

      const keys = Array.isArray(loc) ? loc : [loc];
      if (keys.includes(locationId)) out.push(ent);
    }
    return out;
  }

  /**
   * Monta a lista de entidades recentes a partir do buffer
   * e das entidades do World (filtra IDs destruídos).
   *
   * @param {Array<Object>} all
   * @returns {Array<Object>}
   * @private
   */
  _collectRecentEntities(all) {
    if (!Array.isArray(all) || all.length === 0) return [];
    if (this._recentEntityIds.length === 0) {
      // Sem buffer: devolve as últimas N por ordem do World
      return all.slice(-_RECENT_MAX);
    }

    const byId = new Map(all.map((e) => [e.id, e]));
    const out = [];
    for (const id of this._recentEntityIds) {
      const ent = byId.get(id);
      if (ent) out.push(ent);
    }

    return out;
  }

  /**
   * Atualiza os buffers de recentes e anchor a partir de um IR
   * recém-analisado.
   *
   * Extrai entityIds de:
   *   - `act.references[]` com kind='entity'
   *   - `act.proposition.roles{}` com kind='entity'
   *
   * IDs já presentes no buffer são movidos para o fim (LRU).
   *
   * @param {Object} ir
   * @private
   */
  _trackFromIR(ir) {
    const acts = Array.isArray(ir?.acts) ? ir.acts : [];
    if (acts.length === 0) return;

    const found = new Set();

    for (const act of acts) {
      // ── references[] ───────────────────────────────────
      const refs = Array.isArray(act.references) ? act.references : [];
      for (const r of refs) {
        if (r?.kind === 'entity' && r.entityId) found.add(r.entityId);
      }

      // ── proposition.roles{} ────────────────────────────
      const roles = act?.proposition?.roles ?? {};
      for (const [roleName, ref] of Object.entries(roles)) {
        if (!_SCENE_ROLES.includes(roleName)) continue;
        if (ref?.kind === 'entity' && ref.entityId) {
          found.add(ref.entityId);
          // role 'location' ou 'destination' → candidato a anchor
          if (roleName === 'location' || roleName === 'destination') {
            this._maybeUpdateAnchor(ref.entityId);
          }
        }
      }
    }

    if (found.size === 0) return;

    // ── Atualiza buffer de recentes (LRU) ──────────────────
    for (const id of found) {
      this._touchRecent(id);
    }
  }

  /**
   * Move um ID para o fim do buffer de recentes (LRU).
   * Se não existe, adiciona. Respeita o limite `_RECENT_MAX`.
   *
   * @param {string} id
   * @private
   */
  _touchRecent(id) {
    if (typeof id !== 'string' || !id) return;

    const idx = this._recentEntityIds.indexOf(id);
    if (idx >= 0) this._recentEntityIds.splice(idx, 1);
    this._recentEntityIds.push(id);

    while (this._recentEntityIds.length > _RECENT_MAX) {
      this._recentEntityIds.shift();
    }
  }

  /**
   * Atualiza o anchor de cena para um candidato, se ele for do
   * tipo `location`.
   *
   * @param {string} id
   * @private
   */
  _maybeUpdateAnchor(id) {
    const world = this.world;
    if (!world || typeof world.hasEntity !== 'function') return;
    if (!world.hasEntity(id)) return;

    const ident = world.get(id, COMPONENT_NAMES.IDENTITY);
    if (!ident) return;
    if (ident.type !== 'location') return;

    this._sceneAnchorId = id;
  }

  /**
   * Detecta o anchor inicial varrendo o World.
   * Chamado em `init()` para reconstruir o estado.
   *
   * @returns {string|null}
   * @private
   */
  _detectSceneAnchorId() {
    const world = this.world;
    if (!world || typeof world.allEntities !== 'function') return null;

    const byLocation = new Map();
    for (const id of world.allEntities()) {
      const links = world.get(id, COMPONENT_NAMES.LINKS);
      if (!links?.location) continue;

      const loc = links.location;
      const keys = Array.isArray(loc) ? loc : [loc];
      for (const key of keys) {
        if (typeof key !== 'string' || !key) continue;
        byLocation.set(key, (byLocation.get(key) ?? 0) + 1);
      }
    }

    if (byLocation.size === 0) return null;

    let bestKey = null;
    let bestCount = -1;
    for (const [key, count] of byLocation) {
      if (count > bestCount || (count === bestCount && key > bestKey)) {
        bestCount = count;
        bestKey = key;
      }
    }
    return bestKey;
  }

  /**
   * Reset defensivo do estado de cena. Útil em testes.
   * @internal
   */
  _resetSceneState() {
    this._recentEntityIds = [];
    this._sceneAnchorId = null;
  }

  // ═══════════════════════════════════════════════════════════
  // Wiring de eventos
  // ═══════════════════════════════════════════════════════════

  _wireEvents() {
    if (!this.bus) return;

    // ── Modo ────────────────────────────────────────────────
    this._unsubs.push(this.bus.on('narr:mode:set', ({ mode } = {}) => {
      if (!isModeValid(mode)) return;
      if (mode === this.mode) return;
      this.mode = mode;
      try { writeMode(mode); } catch { /* isola */ }
      try { this.bus.emit('narr:mode:changed', { mode }); } catch { /* isola */ }
    }));

    // ── Overrides ───────────────────────────────────────────
    this._unsubs.push(this.bus.on('narr:override:set', (payload) => {
      try { this._handleOverrideSet(payload); } catch (err) {
        try { this.bus.emit('narrative:degraded', { reason: `Override falhou: ${err?.message ?? String(err)}` }); } catch { /* isola */ }
      }
    }));

    this._unsubs.push(this.bus.on('narr:override:clear', ({ spanKey } = {}) => {
      this.forgetOverride(spanKey);
    }));

    this._unsubs.push(this.bus.on('narr:override:clearAll', () => {
      this.clearAllOverrides();
    }));

    // ── Lexicon ─────────────────────────────────────────────
    this._unsubs.push(this.bus.on('narr:lexicon:forget', ({ lemma } = {}) => {
      this.forgetLexicon(lemma);
    }));

    this._unsubs.push(this.bus.on('narr:lexicon:clearAll', () => {
      this.clearLexicon();
    }));

    // ── Aprendizagem via bus (Camada 5) ────────────────────
    this._unsubs.push(this.bus.on('narr:learn:verb-subtype:request', ({ lemma, dnumber, context } = {}) => {
      this.learnVerbSubtype(lemma, dnumber, { context });
    }));

    this._unsubs.push(this.bus.on('narr:learn:construction-op:request', ({ constructionId, operation, context } = {}) => {
      this.learnConstructionOp(constructionId, operation, { context });
    }));

    // ═══════════════════════════════════════════════════════
    // CAMADA 6 — Atualização do contexto de cena
    // ═══════════════════════════════════════════════════════

    // Entidade criada: se for do tipo `location`, vira anchor
    this._unsubs.push(this.bus.on('entity:created', ({ id } = {}) => {
      if (!id) return;
      const world = this.world;
      if (!world) return;
      const ident = world.get(id, COMPONENT_NAMES.IDENTITY);
      if (ident?.type === 'location') {
        this._sceneAnchorId = id;
      }
      this._touchRecent(id);
    }));

    // Entidade destruída: remove do buffer de recentes
    this._unsubs.push(this.bus.on('entity:destroyed', ({ id } = {}) => {
      if (!id) return;
      const idx = this._recentEntityIds.indexOf(id);
      if (idx >= 0) this._recentEntityIds.splice(idx, 1);
      if (this._sceneAnchorId === id) {
        this._sceneAnchorId = this._detectSceneAnchorId();
      }
    }));

    // Componente atualizado: se `Links.location` mudou, pode
    // deslocar o anchor.
    this._unsubs.push(this.bus.on('component:updated', ({ id, name } = {}) => {
      if (!id || name !== COMPONENT_NAMES.LINKS) return;
      const world = this.world;
      if (!world) return;
      const links = world.get(id, COMPONENT_NAMES.LINKS);
      const loc = links?.location;
      if (!loc) return;

      const keys = Array.isArray(loc) ? loc : [loc];
      for (const key of keys) {
        if (typeof key !== 'string' || !key) continue;
        if (world.hasEntity(key)) {
          const ident = world.get(key, COMPONENT_NAMES.IDENTITY);
          if (ident?.type === 'location') {
            this._sceneAnchorId = key;
            break;
          }
        }
      }
      this._touchRecent(id);
    }));

    // Componente adicionado: se for Links com location, idem
    this._unsubs.push(this.bus.on('component:added', ({ id, name, data } = {}) => {
      if (!id || name !== COMPONENT_NAMES.LINKS) return;
      const loc = data?.location;
      if (!loc) return;

      const world = this.world;
      if (!world) return;

      const keys = Array.isArray(loc) ? loc : [loc];
      for (const key of keys) {
        if (typeof key !== 'string' || !key) continue;
        if (world.hasEntity(key)) {
          const ident = world.get(key, COMPONENT_NAMES.IDENTITY);
          if (ident?.type === 'location') {
            this._sceneAnchorId = key;
            break;
          }
        }
      }
      this._touchRecent(id);
    }));
  }

  _handleOverrideSet(payload) {
    const { spanKey, chose, rejected, learn } = payload ?? {};
    if (typeof spanKey !== 'string' || !spanKey) return false;
    if (typeof chose !== 'string' || !chose) return false;

    const keys = this._normalizeKeys(spanKey);
    const entry = {
      chose,
      rejected: Array.isArray(rejected) ? [...rejected] : [],
      ts: Date.now(),
      ttl: DEFAULT_TTL_MS,
      uses: 0,
    };

    for (const k of keys) {
      this._overrides.set(k, { ...entry });
      try {
        saveOverrideEntry(k, {
          chose: entry.chose,
          rejected: entry.rejected,
          ttl: entry.ttl,
        });
      } catch { /* isola */ }
    }
    this._stats.overrides++;

    if (learn === true) {
      const lemma = this._lemmaForSpanKey(spanKey);
      if (lemma) {
        try {
          lexiconLearn(lemma, chose, null);
          this._userLexicon = loadUserLexicon();
          this._stats.learned++;
        } catch { /* isola */ }
      }
    }
    return true;
  }

  _handleOverrideClear(spanKey) {
    if (typeof spanKey !== 'string' || !spanKey) return false;

    const keys = this._normalizeKeys(spanKey);
    let cleared = false;

    for (const k of keys) {
      if (this._overrides.delete(k)) cleared = true;
      try { clearOverrideEntry(k); } catch { /* isola */ }
    }

    if (cleared) {
      try { persistOverrides(this._overrides); } catch { /* isola */ }
    }
    return cleared;
  }

  _normalizeKeys(spanKey) {
    const keys = new Set([spanKey]);
    try {
      const ir = this._lastIR;
      const acts = ir?.acts;
      if (!Array.isArray(acts)) return Array.from(keys);

      let offset = null;
      const mT = /^(.+?)\.t(\d+)$/.exec(spanKey);
      const mO = /^(.+?)\.o(\d+)$/.exec(spanKey);
      if (mT) offset = parseInt(mT[2], 10);
      else if (mO) offset = parseInt(mO[2], 10);
      if (offset === null || !Number.isFinite(offset)) return Array.from(keys);

      const act = acts.find(a => {
        const s = a.source;
        return s && typeof s.start === 'number' && typeof s.end === 'number' && offset >= s.start && offset <= s.end;
      });
      if (!act) return Array.from(keys);

      const sid = act.provenance?.sentenceId;
      if (typeof sid === 'string' && sid) {
        keys.add(`${sid}.o${offset}`);
        const idx = acts.indexOf(act);
        if (idx >= 0) keys.add(`${sid}.t${idx}`);
      }
    } catch { /* isola */ }
    return Array.from(keys);
  }

  _lemmaForSpanKey(spanKey) {
    try {
      const offset = _offsetFromSpanKey(spanKey);
      if (offset === null) return null;
      return _extractLemmaFromIR(this._lastIR, offset);
    } catch { return null; }
  }
}