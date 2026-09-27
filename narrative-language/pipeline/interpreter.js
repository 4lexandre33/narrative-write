/**
 * @file interpreter.js
 * @module narrative-language/pipeline
 * @description Núcleo do frontend narrativo. Combina segmenter + analyzer +
 *              resolver + classifier + dimensions para produzir NarrativeAct[].
 * @imports narrative-language/pt-br/adapter,
 *          narrative-language/pipeline/segmenter,
 *          narrative-language/pipeline/analyzer,
 *          narrative-language/pipeline/resolver,
 *          narrative-language/pipeline/discourse-analyzer,
 *          narrative-language/acts/classifier,
 *          narrative-language/acts/dimensions,
 *          narrative-language/ir/schema
 * @importedBy narrative-language/index
 * @level N3
 *
 * Fase 14 — Subtipos propagados para o NarrativeAct.
 * Estágio 5 — Propagação do catálogo canônico Norma C.
 *
 * Fase 13.7 — Bugfix P0-7 (auditoria 25/09/2026):
 *   `_mkDiag` classificava `EXECUTION_FAILED` como `'warning'`. Como
 *   `narrative-language/index.js` só promove um IR a `_lastValidIR`
 *   quando `!hasErrors(diagnostics)`, IRs parcialmente falhos eram
 *   promovidos silenciosamente.
 *
 *   Correção: `EXECUTION_FAILED` agora é `'error'`. Uma tabela de
 *   severidades substitui o ternário rígido, permitindo override por
 *   código sem reescrever o formato.
 */

import { Adapter } from '../pt-br/adapter.js';
import { segment } from './segmenter.js';
import { analyze } from './analyzer.js';
import { resolve } from './resolver.js';
import { analyzeDiscourse } from './discourse-analyzer.js';
import { classify } from '../acts/classifier.js';
import { extractDimensions } from '../acts/dimensions.js';
import {
  OPERATIONS,
  SEMANTIC_ROLES,
} from '../ir/schema.js';

// ══════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════

/**
 * Comprimento máximo de sentença processável.
 * @type {number}
 * @private
 */
const _MAX_SENTENCE_LENGTH = 400;

/**
 * Versão do interpreter (para provenance).
 * @type {string}
 * @private
 */
const _VERSION = 'interpreter-1.2.1';

/**
 * Mapa de severidade por código de diagnóstico.
 * Códigos ausentes caem em `'info'` (default seguro).
 *
 * @type {Readonly<Object<string, string>>}
 * @private
 */
const _SEVERITY_MAP = Object.freeze({
  EXECUTION_FAILED: 'error',
  SYN_NO_VERB:      'info',
  SYN_AMBIGUOUS_SUBJECT: 'info',
  SEM_OP_LOW_CONFIDENCE: 'info',
});

/**
 * Severidade default quando o código não está no mapa.
 * @type {string}
 * @private
 */
const _DEFAULT_SEVERITY = 'info';

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * Monta uma Reference a partir de um lemma + resolução.
 * @private
 */
function _mkReferenceFromLemma(lemma, resolution, raw) {
  const found = (resolution?.references ?? []).find(
    (r) => r.lemma === lemma || r.raw?.toLowerCase() === String(lemma).toLowerCase()
  );

  if (found) return found;

  return {
    kind: 'literal',
    entityId: null,
    raw: raw ?? lemma,
    lemma,
    resolvedFrom: null,
    confidence: 0.5,
  };
}

/**
 * Constrói o objeto `proposition` a partir do modelo e da resolução.
 * @private
 */
function _buildProposition(model, resolution) {
  const roles = {};

  for (const [roleName, lemma] of Object.entries(model.semanticRoles ?? {})) {
    if (!SEMANTIC_ROLES.includes(roleName)) continue;
    if (typeof lemma !== 'string' || !lemma) continue;

    roles[roleName] = _mkReferenceFromLemma(lemma, resolution, lemma);
  }

  return {
    predicate: model.predicate ?? '',
    predicateLemma: model.predicateLemma ?? '',
    roles,
  };
}

/**
 * Coleta todas as referências relevantes de uma sentença.
 * @private
 */
function _collectReferences(resolution) {
  if (!Array.isArray(resolution?.references)) return [];
  return resolution.references.slice();
}

/**
 * Cria um ID canônico para um ato.
 * @private
 */
function _mkActId(sentenceId, n) {
  return `act-${sentenceId}-${n}`;
}

/**
 * Cria um diagnóstico de execução do interpreter.
 *
 * Fase 13.7: usa `_SEVERITY_MAP` em vez de ternário rígido.
 *
 * @param {string} code
 * @param {string} message
 * @param {Object|null} span
 * @param {Object|null} [context=null]
 * @returns {Object}
 * @private
 */
function _mkDiag(code, message, span, context = null) {
  return {
    severity: _SEVERITY_MAP[code] ?? _DEFAULT_SEVERITY,
    phase: 'execution',
    code,
    message,
    sourceSpan: span ?? null,
    suggestions: [],
    related: [],
    context,
  };
}

/**
 * Constrói o objeto de proveniência para um ato.
 * @private
 */
function _mkProvenance(extras = {}) {
  return {
    segmenter: 'segmenter-1.0.0',
    nlpBackend: Adapter.backend(),
    classifier: 'classifier-2.0.0',
    lexicon: 'lexicon-2.0.0',
    catalog: '2.0.0',
    analyzedBy: _VERSION,
    analyzedAt: 0,
    ...extras,
  };
}

/**
 * Normaliza `subtypes` para formato rich (cópia defensiva).
 * Aceita: objeto rich (D-numbers), objeto flat (v1), ou undefined.
 * @private
 */
function _normalizeSubtypes(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value && typeof value === 'object' && typeof value.id === 'string') {
      out[key] = {
        operation: value.operation ?? key,
        id: value.id,
        label: value.label ?? value.id,
        confidence: typeof value.confidence === 'number' ? value.confidence : 0,
        source: value.source ?? 'unknown',
        reason: value.reason ?? '',
        value: value.value ?? '',
        traits: Array.isArray(value.traits) ? [...value.traits] : [],
        chain: Array.isArray(value.chain) ? [...value.chain] : [],
      };
      continue;
    }
    if (typeof value === 'string' && /^D\d/.test(value)) {
      out[key] = {
        operation: key,
        id: value,
        label: value,
        confidence: 0,
        source: 'flat',
        reason: '',
        value: '',
        traits: [],
        chain: [],
      };
    }
  }
  return out;
}

/**
 * Normaliza `subtypesFlat` (v1) para formato plano.
 * @private
 */
function _normalizeSubtypesFlat(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      out[key] = value;
      continue;
    }
    if (value && typeof value === 'object' && typeof value.id === 'string') {
      out[key] = value.id;
    }
  }
  return out;
}

/**
 * Normaliza `axes` para cópia defensiva.
 * @private
 */
function _normalizeAxes(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [op, opAxes] of Object.entries(raw)) {
    if (!opAxes || typeof opAxes !== 'object') continue;
    const copy = {};
    for (const [axis, value] of Object.entries(opAxes)) {
      if (typeof value === 'string') copy[axis] = value;
    }
    if (Object.keys(copy).length > 0) out[op] = copy;
  }
  return out;
}

/**
 * Normaliza `traits` para array de strings únicos.
 * Aceita: array, Set, ou undefined.
 * @private
 */
function _normalizeTraits(raw) {
  if (!raw) return [];
  if (raw instanceof Set) return Array.from(raw);
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.filter((t) => typeof t === 'string')));
  }
  return [];
}

/**
 * Constrói um NarrativeAct a partir das peças.
 * @private
 */
function _buildAct({ id, sentence, model, resolution, classification, dimensions }) {
  const operations = (classification.selected ?? []).filter((op) =>
    OPERATIONS.includes(op)
  );

  const finalOperations = operations.length > 0 ? operations : ['represent'];

  const confidence = classification.candidates?.[0]?.confidence ?? 0.5;

  const evidence = [];
  for (const c of classification.candidates ?? []) {
    for (const e of c.evidence ?? []) {
      evidence.push({
        source: e.source,
        value: e.value,
        reason: `[${c.operation}] ${e.reason}`,
        weight: e.weight,
      });
    }
  }

  const proposition = _buildProposition(model, resolution);
  const references = _collectReferences(resolution);

  let focalization = dimensions.focalization;
  if (finalOperations.includes('focalize') && !focalization) {
    const g = model.construction?.groups;
    const target = g?.focalizer ?? g?.perceiver ?? null;
    if (target) {
      focalization = { kind: 'character', targetId: target };
    } else {
      focalization = { kind: 'unknown', targetId: null };
    }
  }

  const subtypes     = _normalizeSubtypes(classification.subtypes);
  const subtypesFlat = _normalizeSubtypesFlat(classification.subtypesV1);
  const axes         = _normalizeAxes(classification.axes);
  const traits       = _normalizeTraits(classification.traits);

  return {
    id,
    kind: 'narrative-act',
    operations: finalOperations,
    subtypes,
    subtypesFlat,
    axes,
    traits,
    confidence: Math.round(confidence * 100) / 100,
    evidence,
    voice: dimensions.voice ?? { kind: 'narrator', sourceId: null },
    focalization,
    form: dimensions.form ?? 'narration',
    tense: dimensions.tense ?? null,
    aspect: dimensions.aspect ?? null,
    modality: dimensions.modality ?? null,
    negation: dimensions.negation ?? null,
    epistemic: dimensions.epistemic ?? null,
    proposition,
    references,
    discourseRelations: [],
    source: sentence.source,
    provenance: _mkProvenance({
      sentenceId: sentence.id,
      constructionId: model.construction?.id ?? null,
    }),
  };
}

// ══════════════════════════════════════════════════════════════
// API PRINCIPAL — UMA SENTENÇA
// ══════════════════════════════════════════════════════════════

/**
 * Interpreta uma sentença.
 *
 * @param {Object} sentence — de segmenter.js
 * @param {Object} [context={}]
 * @returns {Promise<{ acts:NarrativeAct[], diagnostics:NarrativeDiagnostic[] }>}
 */
export async function interpret(sentence, context = {}) {
  const diagnostics = [];

  if (!sentence || typeof sentence.raw !== 'string' || sentence.raw.length === 0) {
    return { acts: [], diagnostics };
  }

  if (sentence.raw.length > _MAX_SENTENCE_LENGTH) {
    diagnostics.push(_mkDiag(
      'SYN_NO_VERB',
      `Sentença longa demais (${sentence.raw.length} chars) — pulada`,
      sentence.source,
      { reason: 'too-long' }
    ));
    return { acts: [], diagnostics };
  }

  // ── 1. NLP analysis (async) ─────────────────────────────
  let nlp;
  try {
    nlp = await Adapter.analyze(sentence.raw);
  } catch (err) {
    diagnostics.push(_mkDiag(
      'EXECUTION_FAILED',
      `Adapter falhou: ${err.message}`,
      sentence.source
    ));
    return { acts: [], diagnostics };
  }

  // ── 2. Análise linguística ──────────────────────────────
  let model;
  try {
    model = analyze(sentence, nlp, context);
  } catch (err) {
    diagnostics.push(_mkDiag(
      'EXECUTION_FAILED',
      `Analyzer falhou: ${err.message}`,
      sentence.source
    ));
    return { acts: [], diagnostics };
  }

  // ── 3. Resolução de referências ─────────────────────────
  let resolution;
  try {
    resolution = resolve(model, context, context.overrides ?? null);
  } catch (err) {
    diagnostics.push(_mkDiag(
      'EXECUTION_FAILED',
      `Resolver falhou: ${err.message}`,
      sentence.source
    ));
    resolution = { references: [], diagnostics: [], confidence: 0 };
  }
  if (Array.isArray(resolution.diagnostics)) {
    diagnostics.push(...resolution.diagnostics);
  }

  // ── 4. Classificação ────────────────────────────────────
  let classification;
  try {
    classification = classify(model, resolution, context);
  } catch (err) {
    diagnostics.push(_mkDiag(
      'EXECUTION_FAILED',
      `Classifier falhou: ${err.message}`,
      sentence.source
    ));
    classification = {
      candidates: [],
      selected: [],
      primary: null,
      subtypes: {},
      subtypesV1: {},
      axes: {},
      traits: [],
      hints: { focalization: null, interiority: null, epistemic: null, rule: null },
    };
  }

  const topConf = classification.candidates?.[0]?.confidence ?? 0;
  if (topConf > 0 && topConf < 0.70) {
    diagnostics.push({
      severity: 'info',
      phase: 'semantic',
      code: 'SEM_OP_LOW_CONFIDENCE',
      message: `Classificação com baixa confiança (${topConf.toFixed(2)})`,
      sourceSpan: sentence.source,
      suggestions: [],
      related: [],
      context: {
        candidates: (classification.candidates ?? []).map((c) => ({
          operation: c.operation,
          confidence: c.confidence,
        })),
      },
    });
  }

  // ── 5. Dimensões ────────────────────────────────────────
  let dimensions;
  try {
    dimensions = extractDimensions(model, resolution, context);
  } catch (err) {
    diagnostics.push(_mkDiag(
      'EXECUTION_FAILED',
      `Dimensions falhou: ${err.message}`,
      sentence.source
    ));
    dimensions = {
      voice: { kind: 'narrator', sourceId: null },
      focalization: null,
      form: 'narration',
      tense: null,
      aspect: null,
      modality: null,
      negation: null,
      epistemic: 'fact',
    };
  }

  // ── 6. Monta o NarrativeAct ─────────────────────────────
  let act;
  try {
    act = _buildAct({
      id: _mkActId(sentence.id, 1),
      sentence,
      model,
      resolution,
      classification,
      dimensions,
    });
  } catch (err) {
    diagnostics.push(_mkDiag(
      'EXECUTION_FAILED',
      `Build do act falhou: ${err.message}`,
      sentence.source
    ));
    return { acts: [], diagnostics };
  }

  // ── 7. Diagnósticos locais do model ─────────────────────
  if (Array.isArray(model.diagnostics)) {
    for (const d of model.diagnostics) {
      diagnostics.push({
        ...d,
        sourceSpan: d.sourceSpan ?? sentence.source,
      });
    }
  }

  return { acts: [act], diagnostics };
}

// ══════════════════════════════════════════════════════════════
// API PRINCIPAL — DOCUMENTO
// ══════════════════════════════════════════════════════════════

/**
 * Interpreta um documento inteiro.
 *
 * @param {string} text
 * @param {Object} [context={}]
 * @returns {Promise<{
 *   acts: NarrativeAct[],
 *   diagnostics: NarrativeDiagnostic[],
 *   sentences: Sentence[],
 *   spans: Span[],
 *   relations: DiscourseRelation[],
 *   sourceMap: Map<string, SourceSpan>,
 * }>}
 */
export async function interpretDocument(text, context = {}) {
  const acts = [];
  const diagnostics = [];
  const sourceMap = new Map();

  // ── 1. Segmentação ──────────────────────────────────────
  let seg;
  try {
    seg = segment(text);
  } catch (err) {
    return {
      acts: [],
      diagnostics: [_mkDiag('EXECUTION_FAILED', `Segmenter falhou: ${err.message}`, null)],
      sentences: [],
      spans: [],
      relations: [],
      sourceMap,
    };
  }

  // ── 2. Interpretação por sentença ───────────────────────
  for (const sentence of seg.sentences) {
    let result;
    try {
      result = await interpret(sentence, context);
    } catch (err) {
      diagnostics.push(_mkDiag(
        'EXECUTION_FAILED',
        `Interpreter falhou em "${sentence.id}": ${err.message}`,
        sentence.source
      ));
      continue;
    }

    for (const act of result.acts) {
      acts.push(act);
      sourceMap.set(act.id, act.source);
    }
    for (const d of result.diagnostics) {
      diagnostics.push(d);
    }
  }

  // ── 3. Análise de discurso ──────────────────────────────
  let relations = [];
  try {
    relations = analyzeDiscourse(seg, context);
  } catch (err) {
    diagnostics.push(_mkDiag(
      'EXECUTION_FAILED',
      `Discourse analyzer falhou: ${err.message}`,
      null
    ));
  }

  // ── 4. Anexa relações aos atos correspondentes ──────────
  if (Array.isArray(relations) && relations.length > 0) {
    const actBySpan = new Map();
    for (const act of acts) {
      const sid = act.provenance?.sentenceId;
      if (sid) actBySpan.set(`${sid}.1`, act);
    }

    for (const rel of relations) {
      const from = actBySpan.get(rel.fromSpanId);
      const to = actBySpan.get(rel.toSpanId);

      if (from && to) {
        from.discourseRelations.push({
          kind: rel.kind,
          fromActId: from.id,
          toActId: to.id,
        });
      } else {
        const target = from ?? to;
        if (target) {
          target.discourseRelations.push({
            kind: rel.kind,
            fromActId: rel.fromSpanId,
            toActId: rel.toSpanId,
          });
        }
      }
    }
  }

  return {
    acts,
    diagnostics,
    sentences: seg.sentences,
    spans: seg.spans,
    relations,
    sourceMap,
  };
}

// ══════════════════════════════════════════════════════════════
// UTILITÁRIOS DE DEBUG
// ══════════════════════════════════════════════════════════════

/**
 * Devolve estatísticas de interpretação.
 *
 * @param {Object} result
 * @returns {Object}
 */
export function interpretationStats(result) {
  if (!result) return null;

  const opCounts = {};
  const subtypeCounts = {};
  const axesCounts = {};
  const traitCounts = {};

  for (const act of result.acts ?? []) {
    for (const op of act.operations ?? []) {
      opCounts[op] = (opCounts[op] ?? 0) + 1;
    }

    const subs = act.subtypes ?? {};
    for (const [dOp, sub] of Object.entries(subs)) {
      const key = `${dOp}:${sub.id ?? '?'}`;
      subtypeCounts[key] = (subtypeCounts[key] ?? 0) + 1;
    }

    const axes = act.axes ?? {};
    for (const [op, opAxes] of Object.entries(axes)) {
      for (const [axis, value] of Object.entries(opAxes ?? {})) {
        const key = `${op}.${axis}=${value}`;
        axesCounts[key] = (axesCounts[key] ?? 0) + 1;
      }
    }

    const traits = Array.isArray(act.traits) ? act.traits : [];
    for (const t of traits) {
      traitCounts[t] = (traitCounts[t] ?? 0) + 1;
    }
  }

  return {
    actCount: result.acts?.length ?? 0,
    sentenceCount: result.sentences?.length ?? 0,
    spanCount: result.spans?.length ?? 0,
    diagnosticCount: result.diagnostics?.length ?? 0,
    relationsCount: result.relations?.length ?? 0,
    operations: opCounts,
    subtypes: subtypeCounts,
    axes: axesCounts,
    traits: traitCounts,
  };
}

/**
 * Versão do interpreter.
 * @returns {string}
 */
export function version() {
  return _VERSION;
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const Interpreter = Object.freeze({
  interpret,
  interpretDocument,
  interpretationStats,
  version,
});