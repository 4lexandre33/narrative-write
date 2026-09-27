/**
 * @file narrative-diagnostics.js
 * @module narrative-language/diagnostics
 * @description Fábrica canônica de NarrativeDiagnostic. Centraliza a
 *              criação de diagnósticos em todas as fases do pipeline
 *              narrativo, garantindo formato consistente e códigos
 *              válidos.
 * @imports narrative-language/ir/schema
 * @importedBy narrative-language/pipeline/interpreter,
 *             narrative-language/ir/validator,
 *             narrative-language/ir/source-map,
 *             narrative-language/index,
 *             systems/narrative-system (F5),
 *             diagnostics/config (F8)
 * @level N2
 *
 * Contrato:
 *   makeDiagnostic(code, span, opts)         → NarrativeDiagnostic
 *   makeAmbiguousRefDiagnostic(ref, cands, span, opts) → NarrativeDiagnostic
 *   makeLowConfidenceDiagnostic(act, thr, opts)        → NarrativeDiagnostic
 *   makeIrInvalidDiagnostic(errors, opts)              → NarrativeDiagnostic
 *   makeExecutionDiagnostic(phase, msg, span, opts)    → NarrativeDiagnostic
 *
 * Determinismo: todos os diagnósticos têm forma estável, independente de
 * ordem de criação. Ordenação é feita por `sortDiagnostics`.
 *
 * Nunca lança. Em entrada degenerada devolve diagnóstico sintético com
 * código EXECUTION_FAILED.
 */

import {
  DIAGNOSTIC_CODES,
  DIAGNOSTIC_SEVERITIES,
  DIAGNOSTIC_PHASES,
} from '../ir/schema.js';

// ══════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════

/**
 * Severidades em ordem crescente de gravidade.
 * @type {ReadonlyArray<string>}
 * @private
 */
const _SEVERITY_ORDER = Object.freeze(['info', 'warning', 'error']);

// ══════════════════════════════════════════════════════════════
// HELPERS INTERNOS
// ══════════════════════════════════════════════════════════════

/**
 * Sanitiza um SourceSpan; devolve null se malformado.
 * @param {any} span
 * @returns {Object|null}
 * @private
 */
function _sanitizeSpan(span) {
  if (!span || typeof span !== 'object') return null;
  if (typeof span.start !== 'number' || span.start < 0) return null;
  if (typeof span.end !== 'number' || span.end < span.start) return null;
  return {
    start: span.start,
    end: span.end,
    line: typeof span.line === 'number' ? span.line : 1,
    column: typeof span.column === 'number' ? span.column : 0,
    raw: typeof span.raw === 'string' ? span.raw : '',
  };
}

/**
 * Valida um código. Se desconhecido, devolve a meta default.
 * @param {string} code
 * @returns {{ severity:string, phase:string, message:string }}
 * @private
 */
function _metaFor(code) {
  const entry = DIAGNOSTIC_CODES[code];
  if (entry) return entry;
  return {
    severity: 'info',
    phase: 'execution',
    message: `Diagnóstico ${code}`,
  };
}

/**
 * Garante que uma lista é array de strings.
 * @param {any} v
 * @returns {string[]}
 * @private
 */
function _stringList(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string' && x.length > 0);
}

/**
 * Serializa um objeto de forma segura para o campo context.
 * Remove referências circulares. Trunca strings muito longas.
 * @param {any} v
 * @param {number} [depth=0]
 * @returns {any}
 * @private
 */
function _safeContext(v, depth = 0) {
  if (depth > 4) return '[deep]';
  if (v === null || v === undefined) return v;
  if (typeof v === 'string') {
    return v.length > 500 ? v.slice(0, 497) + '...' : v;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'function') return '[Function]';

  if (Array.isArray(v)) {
    if (v.length > 20) {
      return [
        ...v.slice(0, 20).map((x) => _safeContext(x, depth + 1)),
        `... ${v.length - 20} itens`,
      ];
    }
    return v.map((x) => _safeContext(x, depth + 1));
  }

  if (typeof v === 'object') {
    const out = {};
    let count = 0;
    for (const [k, val] of Object.entries(v)) {
      if (count++ > 30) break;
      out[k] = _safeContext(val, depth + 1);
    }
    return out;
  }

  return String(v);
}

// ══════════════════════════════════════════════════════════════
// FÁBRICA PRINCIPAL
// ══════════════════════════════════════════════════════════════

/**
 * Cria um NarrativeDiagnostic canônico.
 *
 * @param {string} code              — chave de DIAGNOSTIC_CODES ou código livre
 * @param {Object|null} [span]       — SourceSpan ou null
 * @param {Object} [opts={}]
 * @param {string}   [opts.severity] — override de severidade
 * @param {string}   [opts.phase]    — override de fase
 * @param {string}   [opts.message]  — override de mensagem
 * @param {string[]} [opts.suggestions]
 * @param {string[]} [opts.related]
 * @param {Object}   [opts.context]
 * @returns {Object} NarrativeDiagnostic
 */
export function makeDiagnostic(code, span = null, opts = {}) {
  const safeCode = typeof code === 'string' && code
    ? code
    : 'EXECUTION_FAILED';

  const meta = _metaFor(safeCode);

  const severity = DIAGNOSTIC_SEVERITIES.includes(opts.severity)
    ? opts.severity
    : meta.severity;

  const phase = DIAGNOSTIC_PHASES.includes(opts.phase)
    ? opts.phase
    : meta.phase;

  const message = typeof opts.message === 'string' && opts.message.length > 0
    ? opts.message
    : meta.message;

  return {
    severity,
    phase,
    code: safeCode,
    message,
    sourceSpan: _sanitizeSpan(span),
    suggestions: _stringList(opts.suggestions),
    related: _stringList(opts.related),
    context: opts.context ? _safeContext(opts.context) : null,
  };
}

// ══════════════════════════════════════════════════════════════
// FÁBRICAS ESPECIALIZADAS
// ══════════════════════════════════════════════════════════════

/**
 * Cria um diagnóstico de referência ambígua, com candidatos no contexto.
 *
 * @param {Object} ref        — Reference ({ raw, lemma })
 * @param {Array} candidates  — [{ entityId, name, score }]
 * @param {Object|null} span
 * @param {Object} [opts={}]
 * @returns {Object}
 */
export function makeAmbiguousRefDiagnostic(ref, candidates, span, opts = {}) {
  const raw = ref?.raw ?? ref?.lemma ?? '?';
  const cands = Array.isArray(candidates) ? candidates : [];

  const topNames = cands
    .slice(0, 3)
    .map((c) => c.name ?? c.entityId ?? '?')
    .join(', ');

  const message = cands.length > 0
    ? `Referência "${raw}" ambígua entre ${cands.length} candidatos: ${topNames}`
    : `Referência "${raw}" sem candidato resolvível`;

  return makeDiagnostic('REF_AMBIGUOUS', span, {
    ...opts,
    message,
    suggestions: opts.suggestions ?? [
      `Substitua "${raw}" por um nome explícito`,
    ],
    context: {
      ...(opts.context ?? {}),
      raw,
      lemma: ref?.lemma ?? null,
      candidates: cands.slice(0, 10).map((c) => ({
        entityId: c.entityId ?? null,
        name: c.name ?? null,
        score: typeof c.score === 'number' ? c.score : null,
      })),
    },
  });
}

/**
 * Cria um diagnóstico de referência não resolvida.
 *
 * @param {Object} ref
 * @param {Object|null} span
 * @param {Object} [opts={}]
 * @returns {Object}
 */
export function makeUnresolvedRefDiagnostic(ref, span, opts = {}) {
  const raw = ref?.raw ?? ref?.lemma ?? '?';
  return makeDiagnostic('REF_UNRESOLVED', span, {
    ...opts,
    message: opts.message ?? `Referência "${raw}" sem candidato resolvível`,
    context: {
      ...(opts.context ?? {}),
      raw,
      lemma: ref?.lemma ?? null,
    },
  });
}

/**
 * Cria um diagnóstico de baixa confiança de classificação.
 *
 * @param {Object} act       — NarrativeAct ou ClassificationResult
 * @param {number} [threshold=0.70]
 * @param {Object} [opts={}]
 * @returns {Object}
 */
export function makeLowConfidenceDiagnostic(act, threshold = 0.70, opts = {}) {
  const confidence = typeof act?.confidence === 'number' ? act.confidence : 0;
  const operations = Array.isArray(act?.operations) ? act.operations : [];

  const message = `Classificação com baixa confiança (${confidence.toFixed(2)} < ${threshold.toFixed(2)})`;

  return makeDiagnostic('SEM_OP_LOW_CONFIDENCE', act?.source ?? null, {
    ...opts,
    message,
    suggestions: opts.suggestions ?? [
      'Refraseie com verbo mais explícito',
      'Adicione sujeito explícito',
    ],
    context: {
      ...(opts.context ?? {}),
      confidence,
      threshold,
      operations,
      actId: act?.id ?? null,
    },
  });
}

/**
 * Cria um ou mais diagnósticos de validação do IR.
 * Se `errors` for um array, devolve um array de diagnósticos.
 * Se for um erro único, devolve um diagnóstico.
 *
 * @param {Object|Object[]} errors
 * @param {Object} [opts={}]
 * @returns {Object|Object[]}
 */
export function makeIrInvalidDiagnostic(errors, opts = {}) {
  if (Array.isArray(errors)) {
    return errors.map((e) => makeIrInvalidDiagnostic(e, opts));
  }

  const err = errors ?? {};
  const code = typeof err.code === 'string' ? err.code : 'IR_MISSING_FIELD';
  const message = typeof err.message === 'string'
    ? err.message
    : 'IR inválido';

  // Se já é um diagnóstico canônico, garante que segue o formato
  if (err.severity && err.phase && err.code && err.message) {
    return makeDiagnostic(err.code, err.sourceSpan, {
      ...opts,
      severity: err.severity,
      phase: err.phase,
      message: err.message,
      suggestions: err.suggestions,
      related: err.related,
      context: err.context,
    });
  }

  return makeDiagnostic(code, err.sourceSpan ?? null, {
    ...opts,
    message,
    suggestions: opts.suggestions ?? err.suggestions ?? [],
    related: opts.related ?? err.related ?? [],
    context: opts.context ?? err.context ?? null,
  });
}

/**
 * Cria um diagnóstico de execução (interpreter, adapter, etc.).
 *
 * @param {string} phase        — 'lexical' | 'syntactic' | 'semantic' | 'execution'
 * @param {string} message
 * @param {Object|null} [span]
 * @param {Object} [opts={}]
 * @returns {Object}
 */
export function makeExecutionDiagnostic(phase, message, span = null, opts = {}) {
  const code = opts.code ?? 'EXECUTION_FAILED';
  const safePhase = DIAGNOSTIC_PHASES.includes(phase) ? phase : 'execution';
  return makeDiagnostic(code, span, {
    ...opts,
    phase: safePhase,
    message: typeof message === 'string' ? message : 'Falha na execução',
  });
}

/**
 * Cria um diagnóstico de IR com erro de diagnóstico interno.
 * Usado pelo validator quando o IR contém diagnósticos `error`.
 *
 * @param {Object} act
 * @param {Object} innerDiag
 * @param {Object} [opts={}]
 * @returns {Object}
 */
export function makeIrHasErrorDiagnostic(act, innerDiag, opts = {}) {
  return makeDiagnostic('IR_HAS_ERROR_DIAGNOSTICS', act?.source ?? null, {
    ...opts,
    message: `Act "${act?.id ?? '?'}" carrega diagnóstico de erro: ${innerDiag?.code ?? '?'}`,
    related: innerDiag?.code ? [innerDiag.code] : [],
    context: {
      ...(opts.context ?? {}),
      actId: act?.id ?? null,
      innerCode: innerDiag?.code ?? null,
      innerMessage: innerDiag?.message ?? null,
    },
  });
}

// ══════════════════════════════════════════════════════════════
// CONSULTAS
// ══════════════════════════════════════════════════════════════

/**
 * Devolve a severidade default de um código.
 * @param {string} code
 * @returns {string}
 */
export function severityFor(code) {
  return _metaFor(code).severity;
}

/**
 * Devolve a fase default de um código.
 * @param {string} code
 * @returns {string}
 */
export function phaseFor(code) {
  return _metaFor(code).phase;
}

/**
 * Verifica se um diagnóstico tem severidade 'error'.
 * @param {Object} d
 * @returns {boolean}
 */
export function isError(d) {
  return d?.severity === 'error';
}

/**
 * Verifica se um diagnóstico tem severidade 'warning'.
 * @param {Object} d
 * @returns {boolean}
 */
export function isWarning(d) {
  return d?.severity === 'warning';
}

/**
 * Verifica se uma lista contém pelo menos um erro.
 * @param {Object[]} list
 * @returns {boolean}
 */
export function hasErrors(list) {
  if (!Array.isArray(list)) return false;
  return list.some(isError);
}

/**
 * Conta diagnósticos por severidade.
 * @param {Object[]} list
 * @returns {{ error:number, warning:number, info:number }}
 */
export function countBySeverity(list) {
  const out = { error: 0, warning: 0, info: 0 };
  if (!Array.isArray(list)) return out;
  for (const d of list) {
    if (!d || typeof d.severity !== 'string') continue;
    if (d.severity in out) out[d.severity]++;
  }
  return out;
}

/**
 * Filtra diagnósticos por severidade.
 * @param {Object[]} list
 * @param {string} severity
 * @returns {Object[]}
 */
export function filterBySeverity(list, severity) {
  if (!Array.isArray(list)) return [];
  return list.filter((d) => d?.severity === severity);
}

/**
 * Filtra diagnósticos por fase.
 * @param {Object[]} list
 * @param {string} phase
 * @returns {Object[]}
 */
export function filterByPhase(list, phase) {
  if (!Array.isArray(list)) return [];
  return list.filter((d) => d?.phase === phase);
}

/**
 * Filtra diagnósticos por código.
 * @param {Object[]} list
 * @param {string} code
 * @returns {Object[]}
 */
export function filterByCode(list, code) {
  if (!Array.isArray(list)) return [];
  return list.filter((d) => d?.code === code);
}

// ══════════════════════════════════════════════════════════════
// ORDENAÇÃO
// ══════════════════════════════════════════════════════════════

/**
 * Ordena diagnósticos de forma estável:
 *   1. severity desc (error > warning > info)
 *   2. sourceSpan.start asc (null no final)
 *   3. code asc lexicográfico
 *   4. message asc lexicográfico
 *
 * @param {Object[]} list
 * @returns {Object[]}
 */
export function sortDiagnostics(list) {
  if (!Array.isArray(list)) return [];
  const copy = [...list];

  const sevIdx = (d) => {
    const idx = _SEVERITY_ORDER.indexOf(d?.severity);
    return idx < 0 ? 99 : 100 - idx; // maior = mais grave
  };

  copy.sort((a, b) => {
    const sa = sevIdx(a);
    const sb = sevIdx(b);
    if (sa !== sb) return sb - sa;

    const ast = a?.sourceSpan?.start;
    const bst = b?.sourceSpan?.start;
    const aHas = typeof ast === 'number';
    const bHas = typeof bst === 'number';

    if (aHas && bHas && ast !== bst) return ast - bst;
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;

    const ac = String(a?.code ?? '');
    const bc = String(b?.code ?? '');
    if (ac !== bc) return ac.localeCompare(bc);

    return String(a?.message ?? '').localeCompare(String(b?.message ?? ''));
  });

  return copy;
}

// ══════════════════════════════════════════════════════════════
// SERIALIZAÇÃO E DEBUG
// ══════════════════════════════════════════════════════════════

/**
 * Serializa diagnósticos em NDJSON (uma linha por diagnóstico).
 * @param {Object[]} list
 * @returns {string}
 */
export function toNDJSON(list) {
  if (!Array.isArray(list)) return '';
  const lines = [];
  for (const d of list) {
    try {
      lines.push(JSON.stringify(d));
    } catch { /* isola */ }
  }
  return lines.join('\n');
}

/**
 * Converte um diagnóstico em uma linha legível.
 * @param {Object} d
 * @returns {string}
 */
export function toLine(d) {
  if (!d) return '';
  const span = d.sourceSpan
    ? `[${d.sourceSpan.start}-${d.sourceSpan.end}]`
    : '[—]';
  const icon = d.severity === 'error' ? '✗'
    : d.severity === 'warning' ? '⚠'
    : 'ℹ';
  return `${icon} ${span} ${d.code}: ${d.message}`;
}

/**
 * Devolve estatísticas de uma lista de diagnósticos.
 * @param {Object[]} list
 * @returns {Object}
 */
export function diagnosticsStats(list) {
  if (!Array.isArray(list)) {
    return { total: 0, bySeverity: {}, byPhase: {}, byCode: {} };
  }

  const bySeverity = countBySeverity(list);
  const byPhase = {};
  const byCode = {};

  for (const d of list) {
    if (!d) continue;
    if (typeof d.phase === 'string') {
      byPhase[d.phase] = (byPhase[d.phase] ?? 0) + 1;
    }
    if (typeof d.code === 'string') {
      byCode[d.code] = (byCode[d.code] ?? 0) + 1;
    }
  }

  return {
    total: list.length,
    bySeverity,
    byPhase,
    byCode,
  };
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const NarrativeDiagnostics = Object.freeze({
  makeDiagnostic,
  makeAmbiguousRefDiagnostic,
  makeUnresolvedRefDiagnostic,
  makeLowConfidenceDiagnostic,
  makeIrInvalidDiagnostic,
  makeExecutionDiagnostic,
  makeIrHasErrorDiagnostic,
  severityFor,
  phaseFor,
  isError,
  isWarning,
  hasErrors,
  countBySeverity,
  filterBySeverity,
  filterByPhase,
  filterByCode,
  sortDiagnostics,
  toNDJSON,
  toLine,
  diagnosticsStats,
});