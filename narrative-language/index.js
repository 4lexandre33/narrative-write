/**
 * @file index.js
 * @module narrative-language
 * @description API pública do subsistema narrativo. Ponto de entrada único
 *              para o frontend PT-BR.
 * @imports narrative-language/config,
 *          narrative-language/mode,
 *          narrative-language/overrides,
 *          narrative-language/pt-br/adapter,
 *          narrative-language/pipeline/interpreter,
 *          narrative-language/ir/schema,
 *          narrative-language/ir/validator,
 *          narrative-language/ir/source-map,
 *          narrative-language/diagnostics/narrative-diagnostics
 * @importedBy systems/narrative-system (F5),
 *             diagnostics/trace (F8)
 * @level N4
 *
 * Fase 13.7 — Bugfix P0-2 (auditoria 25/09/2026):
 *   `_cacheKey()` incluía `overrides` mas NÃO `userLexicon`. Quando o
 *   autor "aprendia" uma correção (`narr:lexicon:learn`), o mapa
 *   `_userLexicon` era atualizado, mas o cache de análise continuava
 *   devolvendo o resultado antigo para o mesmo texto. A preferência
 *   aprendida era silenciosamente ignorada a partir da primeira
 *   análise.
 *
 *   Correção: incluir as entradas de `userLexicon` relevantes para
 *   resolução (`prefer` + `context`) na chave de cache. O campo `uses`
 *   NÃO entra na chave porque não afeta a resolução.
 */

import { NARRATIVE_CONFIG, isProjectionValid, DEFAULT_PROJECTION } from './config.js';
import { readMode } from './mode.js';
import { Adapter } from './pt-br/adapter.js';
import {
  interpretDocument,
  interpretationStats,
} from './pipeline/interpreter.js';
import {
  IR_VERSION,
  DIAGNOSTIC_CODES,
} from './ir/schema.js';
import { validateIR } from './ir/validator.js';
import {
  buildSourceMap,
  stats as sourceMapStats,
  toJSON as sourceMapToJSON,
} from './ir/source-map.js';
import {
  makeDiagnostic,
  makeExecutionDiagnostic,
  makeIrInvalidDiagnostic,
  sortDiagnostics,
  hasErrors,
  countBySeverity,
  diagnosticsStats,
} from './diagnostics/narrative-diagnostics.js';

// ══════════════════════════════════════════════════════════════
// ESTADO INTERNO
// ══════════════════════════════════════════════════════════════

/**
 * Último IR válido. Nunca destruído por falha de análise.
 * @type {Object|null}
 * @private
 */
let _lastValidIR = null;

/**
 * Política de projeção ativa.
 * @type {string}
 * @private
 */
let _activeProjection = DEFAULT_PROJECTION;

/**
 * Cache LRU de análise.
 * Chave: hash do texto + hash do contexto (overrides, lexicon, projeção).
 * @type {Map<string, Object>}
 * @private
 */
const _cache = new Map();

/**
 * Estatísticas de execução.
 * @type {Object}
 * @private
 */
const _stats = {
  analyzed: 0,
  cached: 0,
  failed: 0,
  lastLatencyMs: 0,
  avgLatencyMs: 0,
  totalLatencyMs: 0,
};

// ══════════════════════════════════════════════════════════════
// HASHING DETERMINÍSTICO
// ══════════════════════════════════════════════════════════════

/**
 * FNV-1a hash de uma string, 32 bits, retorna base36.
 * Determinístico, sem dependências.
 * @param {string} str
 * @returns {string}
 * @private
 */
function _fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

/**
 * Constrói uma chave de cache determinística a partir de texto + contexto.
 *
 * Campos considerados:
 *   - texto (diretamente)
 *   - ids das entidades em scene/recent/chapter/project (ordenados)
 *   - overrides do autor (chave + escolha)
 *   - userLexicon (lemma + prefer + context) — Fase 13.7
 *   - política de projeção ativa
 *
 * O campo `uses` de `userLexicon` NÃO entra na chave: não afeta
 * resolução, apenas telemetria.
 *
 * @param {string} text
 * @param {Object} ctx
 * @returns {string}
 * @private
 */
function _cacheKey(text, ctx) {
  const relevant = {
    text,
    scene: (ctx?.sceneEntities ?? []).map((e) => e?.id).sort(),
    recent: (ctx?.recentEntities ?? []).map((e) => e?.id).sort(),
    chapter: (ctx?.chapterEntities ?? []).map((e) => e?.id).sort(),
    project: (ctx?.projectEntities ?? []).map((e) => e?.id).sort(),
    overrides: ctx?.overrides instanceof Map
      ? Array.from(ctx.overrides.entries())
          .map(([k, v]) => [String(k), v?.chose ?? null])
          .sort(([a], [b]) => String(a).localeCompare(String(b)))
      : null,
    // Fase 13.7 — P0-2: incluir userLexicon na chave. Só `prefer` e
    // `context` importam para resolução (o resolver usa `prefer` para
    // computar o boost). `uses` é telemetria e fica fora.
    userLexicon: ctx?.userLexicon instanceof Map
      ? Array.from(ctx.userLexicon.entries())
          .map(([k, v]) => [String(k), v?.prefer ?? null, v?.context ?? null])
          .sort(([a], [b]) => String(a).localeCompare(String(b)))
      : null,
    projection: ctx?.projection ?? _activeProjection,
  };

  let canonical;
  try {
    canonical = JSON.stringify(relevant);
  } catch {
    canonical = String(text) + ':' + Date.now();
  }

  return `${_fnv1a(canonical)}:${text.length}`;
}

/**
 * Insere no cache com eviction FIFO.
 * @private
 */
function _cacheSet(key, value) {
  _cache.set(key, value);
  while (_cache.size > NARRATIVE_CONFIG.cacheSize) {
    const oldest = _cache.keys().next().value;
    if (oldest === undefined) break;
    _cache.delete(oldest);
  }
}

// ══════════════════════════════════════════════════════════════
// CONSTRUÇÃO DO IR
// ══════════════════════════════════════════════════════════════

/**
 * Constrói o objeto NarrativeIR a partir do resultado do interpreter.
 *
 * @param {Object} interpretResult
 * @param {Object} meta — { documentId, sourceHash, latencyMs }
 * @returns {Object} NarrativeIR
 * @private
 */
function _buildIR(interpretResult, meta) {
  const acts = interpretResult.acts ?? [];
  const diagnostics = interpretResult.diagnostics ?? [];
  const sentences = interpretResult.sentences ?? [];
  const spans = interpretResult.spans ?? [];
  const relations = interpretResult.relations ?? [];
  const sourceMap = interpretResult.sourceMap instanceof Map
    ? interpretResult.sourceMap
    : new Map();

  const index = _buildIndex(acts);

  const provenance = {
    segmenter: 'segmenter-1.0.0',
    nlpBackend: Adapter.backend(),
    classifier: 'classifier-1.0.0',
    lexicon: 'lexicon-1.0.0',
    latencyMs: meta.latencyMs ?? 0,
    sentenceCount: sentences.length,
    spanCount: spans.length,
    relationCount: relations.length,
  };

  return {
    version: IR_VERSION,
    documentId: meta.documentId ?? 'default',
    generatedAt: meta.generatedAt ?? '',
    sourceHash: meta.sourceHash ?? '',
    acts,
    diagnostics: sortDiagnostics(diagnostics),
    index,
    provenance,
    _internal: {
      sentences,
      spans,
      relations,
      sourceMap,
    },
  };
}

/**
 * Constrói o índice canônico do IR.
 * @param {Array} acts
 * @returns {Object}
 * @private
 */
function _buildIndex(acts) {
  const byEntity = {};
  const byOperation = {};
  const bySpan = {};

  for (const act of acts) {
    if (!act?.id) continue;

    for (const op of act.operations ?? []) {
      if (!byOperation[op]) byOperation[op] = [];
      if (!byOperation[op].includes(act.id)) byOperation[op].push(act.id);
    }

    const refs = act.references ?? [];
    for (const ref of refs) {
      if (ref?.kind === 'entity' && ref.entityId) {
        if (!byEntity[ref.entityId]) byEntity[ref.entityId] = [];
        if (!byEntity[ref.entityId].includes(act.id)) {
          byEntity[ref.entityId].push(act.id);
        }
      }
    }

    const sid = act.provenance?.sentenceId;
    if (typeof sid === 'string' && sid) {
      bySpan[`${sid}.1`] = act.id;
    }
  }

  for (const k of Object.keys(byEntity)) byEntity[k].sort();
  for (const k of Object.keys(byOperation)) byOperation[k].sort();

  return { byEntity, byOperation, bySpan };
}

/**
 * Constrói um IR vazio mas estruturalmente válido, com um diagnóstico de erro.
 * @param {string} text
 * @param {Object} diag
 * @returns {Object}
 * @private
 */
function _mkErrorIR(text, diag) {
  return {
    version: IR_VERSION,
    documentId: 'default',
    generatedAt: '',
    sourceHash: _fnv1a(String(text ?? '')),
    acts: [],
    diagnostics: [diag],
    index: { byEntity: {}, byOperation: {}, bySpan: {} },
    provenance: {
      segmenter: 'segmenter-1.0.0',
      nlpBackend: Adapter.backend(),
      classifier: 'classifier-1.0.0',
      lexicon: 'lexicon-1.0.0',
      latencyMs: 0,
      error: true,
    },
    _internal: {
      sentences: [],
      spans: [],
      relations: [],
      sourceMap: new Map(),
    },
  };
}

// ══════════════════════════════════════════════════════════════
// API PÚBLICA — ANÁLISE ASSÍNCRONA
// ══════════════════════════════════════════════════════════════

/**
 * Analisa um texto. Assíncrono. Nunca lança.
 *
 * @param {string} text
 * @param {Object} [context={}]
 * @returns {Promise<NarrativeIR>}
 */
export async function analyze(text, context = {}) {
  const t0 = _now();
  const source = String(text ?? '');

  if (source.length === 0) {
    const ir = _mkErrorIR(source, makeDiagnostic(
      'EXECUTION_FAILED',
      null,
      { message: 'Texto vazio', severity: 'info', phase: 'execution' }
    ));
    _lastValidIR = ir;
    return ir;
  }

  const key = _cacheKey(source, context);
  if (_cache.has(key)) {
    _stats.cached++;
    const cached = _cache.get(key);
    _cache.delete(key);
    _cache.set(key, cached);
    return cached;
  }

  try {
    if (!Adapter.isAvailable()) {
      await Adapter.init();
    }
  } catch {
    // Heurística sempre disponível — segue mesmo assim
  }

  let result;
  try {
    result = await interpretDocument(source, context);
  } catch (err) {
    _stats.failed++;
    const diag = makeExecutionDiagnostic(
      'execution',
      `Interpreter falhou: ${err.message}`,
      null,
      { code: 'EXECUTION_FAILED' }
    );
    const ir = _mkErrorIR(source, diag);
    _lastValidIR = ir;
    return ir;
  }

  const latencyMs = _now() - t0;
  _stats.lastLatencyMs = Math.round(latencyMs * 100) / 100;
  _stats.totalLatencyMs += latencyMs;
  _stats.analyzed++;
  _stats.avgLatencyMs = _stats.analyzed > 0
    ? Math.round((_stats.totalLatencyMs / _stats.analyzed) * 100) / 100
    : 0;

  const ir = _buildIR(result, {
    documentId: context.documentId ?? 'default',
    sourceHash: _fnv1a(source),
    generatedAt: _isoNow(),
    latencyMs: _stats.lastLatencyMs,
  });

  let validation;
  try {
    validation = validateIR(ir);
  } catch (err) {
    validation = {
      ok: false,
      errors: [makeExecutionDiagnostic(
        'validation',
        `Validator falhou: ${err.message}`,
        null,
        { code: 'IR_MISSING_FIELD' }
      )],
    };
  }

  if (!validation.ok && Array.isArray(validation.errors)) {
    const validationDiags = makeIrInvalidDiagnostic(validation.errors);
    const list = Array.isArray(validationDiags)
      ? validationDiags
      : [validationDiags];
    ir.diagnostics = sortDiagnostics([...ir.diagnostics, ...list]);
  }

  if (!hasErrors(ir.diagnostics)) {
    _lastValidIR = ir;
  }

  _cacheSet(key, ir);

  return ir;
}

// ══════════════════════════════════════════════════════════════
// API PÚBLICA — ANÁLISE SÍNCRONA (FAST PASS)
// ══════════════════════════════════════════════════════════════

/**
 * Versão síncrona. Reusa último IR se o texto não mudou desde então.
 *
 * @param {string} text
 * @param {Object} [context={}]
 * @returns {NarrativeIR}
 */
export function analyzeSync(text, context = {}) {
  const source = String(text ?? '');
  const key = _cacheKey(source, context);

  if (_cache.has(key)) {
    _stats.cached++;
    return _cache.get(key);
  }

  if (_lastValidIR && _lastValidIR.sourceHash === _fnv1a(source)) {
    return _lastValidIR;
  }

  return {
    version: IR_VERSION,
    documentId: context.documentId ?? 'default',
    generatedAt: '',
    sourceHash: _fnv1a(source),
    acts: [],
    diagnostics: [],
    index: { byEntity: {}, byOperation: {}, bySpan: {} },
    provenance: {
      segmenter: 'segmenter-1.0.0',
      nlpBackend: Adapter.backend(),
      classifier: 'classifier-1.0.0',
      lexicon: 'lexicon-1.0.0',
      latencyMs: 0,
      fastPass: true,
    },
    _internal: {
      sentences: [],
      spans: [],
      relations: [],
      sourceMap: new Map(),
    },
  };
}

// ══════════════════════════════════════════════════════════════
// API PÚBLICA — CONTROLE E ESTADO
// ══════════════════════════════════════════════════════════════

/**
 * Devolve o último IR válido, ou null se nunca houve análise bem-sucedida.
 * @returns {NarrativeIR|null}
 */
export function getLastIR() {
  return _lastValidIR;
}

/**
 * Define a política de projeção ativa.
 * @param {string} policy
 * @returns {boolean}
 */
export function setProjection(policy) {
  if (!isProjectionValid(policy)) return false;
  _activeProjection = policy;
  return true;
}

/**
 * Devolve a política de projeção ativa.
 * @returns {string}
 */
export function getProjection() {
  return _activeProjection;
}

/**
 * Devolve o modo narrativo atual, lido do storage.
 * @returns {string}
 */
export function getMode() {
  return readMode();
}

/**
 * Devolve estatísticas de execução.
 * @returns {Object}
 */
export function stats() {
  const cacheSize = _cache.size;
  const cacheMax = NARRATIVE_CONFIG.cacheSize;
  return {
    analyzed: _stats.analyzed,
    cached: _stats.cached,
    failed: _stats.failed,
    lastLatencyMs: _stats.lastLatencyMs,
    avgLatencyMs: _stats.avgLatencyMs,
    cacheSize,
    cacheMax,
    cacheHitRate: (_stats.cached + _stats.analyzed) > 0
      ? Math.round((_stats.cached / (_stats.cached + _stats.analyzed)) * 100) / 100
      : 0,
    hasLastIR: _lastValidIR !== null,
    projection: _activeProjection,
    backend: Adapter.backend(),
    backendVersion: Adapter.version(),
  };
}

/**
 * Limpa o cache interno. Não afeta `_lastValidIR`.
 * @returns {number}
 */
export function clearCache() {
  const n = _cache.size;
  _cache.clear();
  return n;
}

/**
 * Reset completo (para testes).
 * @internal
 */
export function reset() {
  _cache.clear();
  _lastValidIR = null;
  _activeProjection = DEFAULT_PROJECTION;
  _stats.analyzed = 0;
  _stats.cached = 0;
  _stats.failed = 0;
  _stats.lastLatencyMs = 0;
  _stats.avgLatencyMs = 0;
  _stats.totalLatencyMs = 0;
  try {
    Adapter.clearCache();
  } catch { /* isola */ }
}

// ══════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ══════════════════════════════════════════════════════════════

/**
 * Devolve o timestamp atual em ISO.
 * @returns {string}
 * @private
 */
function _isoNow() {
  try {
    return new Date().toISOString();
  } catch {
    return '';
  }
}

/**
 * Devolve o timestamp monotônico em ms.
 * @returns {number}
 * @private
 */
function _now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/**
 * Serializa um IR em JSON (com Maps convertidos).
 * @param {NarrativeIR} ir
 * @returns {Object}
 */
export function irToJSON(ir) {
  if (!ir) return null;

  const internal = ir._internal ?? {};

  return {
    version: ir.version,
    documentId: ir.documentId,
    generatedAt: ir.generatedAt,
    sourceHash: ir.sourceHash,
    acts: ir.acts,
    diagnostics: ir.diagnostics,
    index: ir.index,
    provenance: ir.provenance,
    sourceMap: sourceMapToJSON(internal.sourceMap),
    sentences: internal.sentences,
    spans: internal.spans,
    relations: internal.relations,
  };
}

/**
 * Devolve um resumo legível do IR.
 * @param {NarrativeIR} ir
 * @returns {Object}
 */
export function summarize(ir) {
  if (!ir) return null;

  const diagStats = diagnosticsStats(ir.diagnostics);
  const internal = ir._internal ?? {};

  return {
    version: ir.version,
    actCount: ir.acts?.length ?? 0,
    diagnosticCount: ir.diagnostics?.length ?? 0,
    diagnosticsBySeverity: diagStats.bySeverity,
    entityCount: Object.keys(ir.index?.byEntity ?? {}).length,
    operationCount: Object.keys(ir.index?.byOperation ?? {}).length,
    sourceMapStats: sourceMapStats(internal.sourceMap),
    provenance: ir.provenance,
  };
}

// ══════════════════════════════════════════════════════════════
// EXPORTS — RE-EXPORTS ÚTEIS
// ══════════════════════════════════════════════════════════════

// Config
export { NARRATIVE_CONFIG, DEFAULT_PROJECTION } from './config.js';
export {
  MODES,
  DEFAULT_MODE,
  isModeValid,
  isProjectionValid,
  isLevelInScope,
} from './config.js';

// Modo
export {
  readMode,
  writeMode,
  clearMode,
  nextMode,
  modeLabel,
  modeDescription,
  canMutate,
  canAnalyze,
} from './mode.js';

// IR schema
export {
  IR_VERSION,
  OPERATIONS,
  VOICE_KINDS,
  FOCALIZATION_KINDS,
  DISCOURSE_FORMS,
  SEMANTIC_ROLES,
  EPISTEMIC_KINDS,
  TEMPORAL_FRAMES,
  ASPECT_KINDS,
  MODALITY_KINDS,
  NEGATION_KINDS,
  DIAGNOSTIC_SEVERITIES,
  DIAGNOSTIC_PHASES,
  DIAGNOSTIC_CODES,
} from './ir/schema.js';

// Validator
export { validateIR, validateAct } from './ir/validator.js';

// Source map
export {
  buildSourceMap,
  actToSource,
  sourceToAct,
  sourceToActs,
  spanKeyFor,
} from './ir/source-map.js';

// Interpreter
export {
  interpret,
  interpretDocument,
  interpretationStats,
} from './pipeline/interpreter.js';

// Segmenter
export {
  segment,
  segmentSentence,
  segmentStats,
} from './pipeline/segmenter.js';

// Diagnostics
export {
  makeDiagnostic,
  makeAmbiguousRefDiagnostic,
  makeLowConfidenceDiagnostic,
  makeExecutionDiagnostic,
  sortDiagnostics,
  hasErrors,
  countBySeverity,
} from './diagnostics/narrative-diagnostics.js';

// ══════════════════════════════════════════════════════════════
// FACHADA CONGELADA
// ══════════════════════════════════════════════════════════════

/**
 * Fachada pública congelada.
 * @type {Readonly<Object>}
 */
export const API = Object.freeze({
  analyze,
  analyzeSync,
  getLastIR,
  summarize,
  irToJSON,
  setProjection,
  getProjection,
  getMode,
  stats,
  clearCache,
  reset,
});

export default API;