/**
 * @file classifier.js
 * @module narrative-language/acts
 * @description Classifica uma unidade linguística em 1..N operações narrativas
 *              (das 8 fundamentais), com evidências rastreáveis e confiança.
 *              Propaga subtipos (D-numbers), eixos dimensionais e traits
 *              detectados pelo `subtype-detector`.
 * @imports narrative-language/pt-br/lexicon,
 *          narrative-language/ir/schema,
 *          narrative-language/acts/focalization-analyzer,
 *          narrative-language/acts/interiority-analyzer,
 *          narrative-language/acts/epistemic-analyzer,
 *          narrative-language/acts/rule-compiler,
 *          narrative-language/acts/subtype-detector
 * @importedBy narrative-language/pipeline/interpreter,
 *             narrative-language/diagnostics/trace
 * @level N3
 *
 * ═══════════════════════════════════════════════════════════════
 * CAMADA 5 — APRENDIZADO DO AUTOR
 * ═══════════════════════════════════════════════════════════════
 *
 * O `classify()` agora expõe `classification.__userLexicon` para
 * que o `subtype-detector` possa consultar as correções do autor
 * sem precisar re-passar o `ctx`.
 *
 * Também aceita `ctx.constructionOpOverrides` — mapa constructionId
 * → operação v1 — que tem prioridade MÁXIMA sobre a operação
 * primária detectada.
 *
 * Nunca lança. Determinístico.
 */

import { OPERATIONS } from '../ir/schema.js';
import {
  lookupLemma,
  variantFor as lexVariantFor,
  classOf as lexClassOf,
} from '../pt-br/lexicon.js';
import { analyzeFocalization } from './focalization-analyzer.js';
import { analyzeInteriority } from './interiority-analyzer.js';
import { analyzeEpistemic } from './epistemic-analyzer.js';
import { compileRule } from './rule-compiler.js';
import { detect, detectSubtypes } from './subtype-detector.js';

// ══════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════

const _SELECT_THRESHOLD = 0.70;
const _MAX_CONFIDENCE = 0.99;

/** @type {Readonly<Object<string, string>>} @private */
const _D_TO_V1 = Object.freeze({
  'D1': 'represent',
  'D2': 'describe',
  'D3': 'expose',
  'D4': 'interiorize',
  'D5': 'enunciate',
  'D6': 'evaluate',
  'D7': 'focalize',
  'D8': 'structure',
});

const _PREDICATE_WEIGHTS = Object.freeze({
  action:       { operation: 'represent',  weight: 0.90 },
  motion:       { operation: 'represent',  weight: 0.90 },
  transfer:     { operation: 'represent',  weight: 0.88 },
  creation:     { operation: 'represent',  weight: 0.88 },
  destruction:  { operation: 'represent',  weight: 0.88 },
  social:       { operation: 'represent',  weight: 0.88 },
  combat:       { operation: 'represent',  weight: 0.90 },
  ritual:       { operation: 'represent',  weight: 0.88 },
  perception:   { operation: 'represent',  weight: 0.75 },
  experiential: { operation: 'interiorize',weight: 0.75 },
  cognitive:    { operation: 'interiorize',weight: 0.80 },
  communicative:{ operation: 'enunciate',  weight: 0.90 },
  emotion:      { operation: 'interiorize',weight: 0.90 },
  state:        { operation: 'describe',   weight: 0.70 },
  somatic:      { operation: 'represent',  weight: 0.85 },
  weather:      { operation: 'represent',  weight: 0.88 },
});

const _CONSTRUCTION_EVIDENCE = Object.freeze({
  'para-x-parecia-y': [
    { operation: 'describe', weight: 0.90, reason: 'percepção subjetiva' },
    { operation: 'focalize', weight: 0.85, reason: 'focalização explícita' },
  ],
  'para-x-y-era-z': [
    { operation: 'describe', weight: 0.88, reason: 'percepção subjetiva' },
    { operation: 'focalize', weight: 0.85, reason: 'focalização explícita' },
  ],
  'x-nao-viu-y': [
    { operation: 'describe', weight: 0.75, reason: 'focalização negativa' },
    { operation: 'focalize', weight: 0.78, reason: 'focalização negativa' },
  ],
  'direct-speech-dash': [
    { operation: 'enunciate', weight: 0.95, reason: 'discurso direto' },
  ],
  'x-disse-que-y': [
    { operation: 'enunciate', weight: 0.92, reason: 'discurso indireto' },
  ],
  'x-y-disse': [
    { operation: 'enunciate', weight: 0.90, reason: 'discurso direto com atribuição' },
  ],
  'x-sabia-que-y': [
    { operation: 'interiorize', weight: 0.85, reason: 'conhecimento' },
    { operation: 'expose',      weight: 0.50, reason: 'conhecimento como exposição' },
  ],
  'x-achava-que-y': [
    { operation: 'interiorize', weight: 0.85, reason: 'crença' },
  ],
  'x-viu-y': [
    { operation: 'represent', weight: 0.70, reason: 'percepção' },
    { operation: 'expose',    weight: 0.40, reason: 'percepção como exposição' },
  ],
  'x-sentiu-y': [
    { operation: 'interiorize', weight: 0.85, reason: 'experiência interna' },
  ],
  'x-queria-y': [
    { operation: 'interiorize', weight: 0.90, reason: 'desejo' },
  ],
  'x-lembrou-de-y': [
    { operation: 'interiorize', weight: 0.88, reason: 'memória' },
    { operation: 'structure',   weight: 0.50, reason: 'memória pode ser retrospectiva' },
  ],
  'maybe-error': [
    { operation: 'interiorize', weight: 0.80, reason: 'discurso indireto livre' },
  ],
  'anos-antes': [
    { operation: 'structure', weight: 0.95, reason: 'retrospecção' },
    { operation: 'expose',    weight: 0.50, reason: 'contexto histórico' },
  ],
  'mais-tarde': [
    { operation: 'structure', weight: 0.95, reason: 'antecipação' },
  ],
  'enquanto-isso': [
    { operation: 'structure', weight: 0.90, reason: 'simultaneidade' },
  ],
  'havia-tempo': [
    { operation: 'expose',    weight: 0.85, reason: 'exposição histórica' },
    { operation: 'structure', weight: 0.50, reason: 'marcador temporal' },
  ],
  'foi-uma-avaliacao': [
    { operation: 'evaluate',  weight: 0.95, reason: 'avaliação explícita' },
    { operation: 'enunciate', weight: 0.40, reason: 'avaliação enuncia juízo' },
  ],
  'rule-se': [
    { operation: 'structure', weight: 0.90, reason: 'regra condicional' },
  ],
  'rule-quando': [
    { operation: 'structure', weight: 0.90, reason: 'regra temporal' },
  ],
  'rule-sempre-que': [
    { operation: 'structure', weight: 0.90, reason: 'regra habitual' },
  ],
  'rule-depois-que': [
    { operation: 'structure', weight: 0.90, reason: 'regra pós-condição' },
  ],
  'x-e-um-y': [
    { operation: 'expose', weight: 0.85, reason: 'identidade declarada' },
  ],
  'x-fica-em-y': [
    { operation: 'expose', weight: 0.75, reason: 'localização declarada' },
  ],

  // ── Camada 3 ──────────────────────────────────────────
  'relative-clause-restrictive': [
    { operation: 'describe', weight: 0.85, reason: 'oração relativa descritiva' },
  ],
  'relative-clause-explanatory': [
    { operation: 'expose', weight: 0.82, reason: 'oração relativa explicativa' },
  ],
  'apposition': [
    { operation: 'expose', weight: 0.85, reason: 'aposto' },
  ],
  'consecutive-clause': [
    { operation: 'structure', weight: 0.88, reason: 'consecutiva' },
  ],
  'comparison': [
    { operation: 'evaluate', weight: 0.82, reason: 'comparação avaliativa' },
  ],
  'causal-gerund': [
    { operation: 'structure', weight: 0.80, reason: 'gerúndio causal' },
  ],
  'concession': [
    { operation: 'structure', weight: 0.90, reason: 'concessiva' },
  ],
  'purpose-clause': [
    { operation: 'structure', weight: 0.88, reason: 'final' },
  ],
  'nested-indirect-speech': [
    { operation: 'enunciate', weight: 0.85, reason: 'discurso indireto aninhado' },
  ],
  'explicit-expectation': [
    { operation: 'interiorize', weight: 0.88, reason: 'expectativa explícita' },
  ],
  'pseudo-cleft': [
    { operation: 'evaluate', weight: 0.80, reason: 'clivada enfática' },
  ],
  'free-indirect-doubt': [
    { operation: 'interiorize', weight: 0.85, reason: 'discurso indireto livre com dúvida' },
  ],
});

const _STATE_VERBS = Object.freeze([
  'ser', 'estar', 'ficar', 'parecer', 'tornar', 'virar', 'permanecer',
]);

const _SUBORDINATION_MARKERS = Object.freeze([
  { pattern: /^\s*se\s+/i,          kind: 'conditional',
    operations: [{ op: 'structure', weight: 0.88, reason: 'oração condicional (se)' }] },
  { pattern: /^\s*quando\s+/i,      kind: 'temporal',
    operations: [{ op: 'structure', weight: 0.85, reason: 'oração temporal (quando)' }] },
  { pattern: /^\s*enquanto\s+/i,    kind: 'simultaneous',
    operations: [{ op: 'structure', weight: 0.85, reason: 'oração simultânea (enquanto)' }] },
  { pattern: /^\s*porque\s+/i,      kind: 'causal',
    operations: [
      { op: 'structure', weight: 0.82, reason: 'oração causal (porque)' },
      { op: 'expose',    weight: 0.55, reason: 'causa como exposição' },
    ] },
  { pattern: /^\s*embora\s+/i,      kind: 'concessive',
    operations: [{ op: 'structure', weight: 0.85, reason: 'oração concessiva (embora)' }] },
  { pattern: /^\s*caso\s+/i,        kind: 'conditional-alt',
    operations: [{ op: 'structure', weight: 0.85, reason: 'oração condicional (caso)' }] },
  { pattern: /^\s*assim\s+que\s+/i, kind: 'immediate',
    operations: [{ op: 'structure', weight: 0.82, reason: 'oração temporal (assim que)' }] },
]);

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function _evidenceFromPredicate(model) {
  const lemma = model.predicateLemma;
  if (!lemma) return [];
  const entry = lookupLemma(lemma);
  if (!entry || !entry.type) return [];
  const rule = _PREDICATE_WEIGHTS[entry.type];
  if (!rule) return [];
  return [{
    source: 'lexicon',
    value: lemma,
    reason: `predicado do tipo "${entry.type}"`,
    weight: rule.weight,
  }];
}

function _evidenceFromVariant(model) {
  const lemma = model.predicateLemma;
  if (!lemma) return [];
  const objects = Array.isArray(model.objects) ? model.objects : [];
  if (objects.length === 0) return [];
  const firstObj = objects[0];
  const objClass = firstObj?.class ?? lexClassOf(firstObj?.lemma);
  if (!objClass) return [];
  const variant = lexVariantFor(lemma, objClass);
  if (!variant || !variant.subtype) return [];

  const op = _operationOfDNumber(variant.subtype);
  if (!op) return [];

  return [{
    source: 'variant',
    value: `${lemma}+${objClass}`,
    reason: `variante específica para objeto tipo "${objClass}"`,
    weight: 0.95,
    operation: op,
  }];
}

function _operationOfDNumber(dnumber) {
  if (typeof dnumber !== 'string') return null;
  const m = /^(D\d+)/.exec(dnumber);
  return m ? _D_TO_V1[m[1]] ?? null : null;
}

function _evidenceFromSyntax(model) {
  const out = [];
  const hasSubject = !!model.subject;
  const hasPredicate = !!model.predicateLemma;
  const hasObject = Array.isArray(model.objects) && model.objects.length > 0;
  const isStateVerb = hasPredicate && _STATE_VERBS.includes(model.predicateLemma);
  const hasPredicative = !!model.complements?.predicative;

  if (hasSubject && hasPredicate && hasObject) {
    out.push({ source: 'syntax', value: 'SVO',
      reason: 'estrutura sujeito-verbo-objeto', weight: 0.30 });
  }
  if (isStateVerb && hasPredicative) {
    out.push({ source: 'syntax', value: 'state+predicative',
      reason: 'estado com complemento predicativo', weight: 0.35 });
  }
  if (isStateVerb && hasSubject && !hasObject && !hasPredicative) {
    out.push({ source: 'syntax', value: 'state-bare',
      reason: 'estado sem complemento', weight: 0.20 });
  }
  if (hasSubject && !hasPredicate) {
    out.push({ source: 'syntax', value: 'fragment',
      reason: 'fragmento nominal', weight: 0.15 });
  }
  return out;
}

function _evidenceFromFocalization(model, resolution, ctx) {
  let focalization = null;
  try {
    focalization = analyzeFocalization(model, resolution, ctx);
  } catch { /* isola */ }

  if (!focalization) return [];

  const out = [];
  const weight = focalization.confidence;
  const reason = focalization.targetId
    ? `focalização em "${focalization.targetId}" via ${focalization.marker}`
    : `focalização sem alvo claro via ${focalization.marker}`;

  out.push({
    operation: 'focalize',
    evidence: { source: 'syntax', value: focalization.marker ?? 'focalization', reason, weight },
  });

  if (focalization.source === 'appearance' || focalization.marker === 'aparecer-para') {
    out.push({
      operation: 'describe',
      evidence: {
        source: 'syntax', value: 'appearance-focalized',
        reason: 'aparência filtrada por focalização', weight: 0.55,
      },
    });
  }

  return out;
}

function _evidenceFromInteriority(model, resolution, ctx) {
  let result = null;
  try { result = analyzeInteriority(model, resolution, ctx); } catch { /* isola */ }
  if (!result || result.acts.length === 0) return [];

  const out = [];
  for (const act of result.acts) {
    out.push({
      operation: 'interiorize',
      evidence: {
        source: 'lexicon', value: act.verb,
        reason: `interioridade [${act.category}] via "${act.verb}"`,
        weight: act.confidence,
      },
    });
  }
  if (result.acts.length >= 2) {
    out.push({
      operation: 'interiorize',
      evidence: {
        source: 'context', value: 'multiple-interiority',
        reason: `${result.acts.length} expressões de interioridade`,
        weight: Math.min(0.30, 0.10 * result.acts.length),
      },
    });
  }
  return out;
}

function _evidenceFromEpistemic(model, resolution, ctx) {
  let result = null;
  try { result = analyzeEpistemic(model, resolution, ctx); } catch { /* isola */ }
  if (!result || result.acts.length === 0) return [];

  const out = [];
  for (const act of result.acts) {
    let op = 'interiorize';
    if (act.category === 'perception') op = 'represent';
    else if (act.category === 'knowledge') op = 'interiorize';
    else if (act.category === 'belief') op = 'interiorize';
    else if (act.category === 'memory') op = 'interiorize';
    else if (act.category === 'ignorance') op = 'interiorize';
    else if (act.category === 'fact') op = 'expose';

    out.push({
      operation: op,
      evidence: {
        source: 'lexicon', value: act.verb,
        reason: `epistemia [${act.category}] via "${act.verb}"`,
        weight: act.confidence * 0.85,
      },
    });
  }

  const cats = new Set(result.acts.map((a) => a.category));
  if (cats.size >= 2) {
    out.push({
      operation: 'interiorize',
      evidence: {
        source: 'context', value: 'mixed-epistemic',
        reason: `${cats.size} categorias epistêmicas na sentença`,
        weight: 0.20,
      },
    });
  }

  return out;
}

function _evidenceFromRule(model, resolution, ctx) {
  let compilation = null;
  try { compilation = compileRule(model, resolution, ctx); } catch { /* isola */ }

  if (!compilation || !compilation.ok || !compilation.rule) {
    return { evidence: [], rule: null };
  }

  const confidence = compilation.rule.confidence;

  const evidence = [{
    operation: 'structure',
    evidence: {
      source: 'syntax', value: `rule:${compilation.rule.marker}`,
      reason: `regra natural detectada (${compilation.rule.marker})`,
      weight: confidence * 0.95,
    },
  }];

  if (compilation.rule.marker === 'quando' || compilation.rule.marker === 'depois que') {
    evidence.push({
      operation: 'expose',
      evidence: {
        source: 'syntax', value: 'rule-exposition',
        reason: 'regra temporal como exposição do comportamento',
        weight: 0.40,
      },
    });
  }

  return { evidence, rule: compilation.rule };
}

// ══════════════════════════════════════════════════════════════
// AGREGAÇÃO
// ══════════════════════════════════════════════════════════════

function _bump(map, operation, evidence) {
  if (!map.has(operation)) map.set(operation, { total: 0, list: [] });
  const entry = map.get(operation);
  entry.total += evidence.weight;
  entry.list.push(evidence);
}

function _operationsForEvidence(e, model) {
  if (e.source === 'lexicon') {
    const lemma = e.value;
    const entry = lookupLemma(lemma);
    if (!entry) return [];
    const rule = _PREDICATE_WEIGHTS[entry.type];
    return rule ? [rule.operation] : [];
  }
  if (e.source === 'variant') return e.operation ? [e.operation] : [];
  if (e.source === 'construction') return [];
  if (e.source === 'syntax') {
    if (e.value === 'SVO' || e.value === 'state-bare' || e.value === 'fragment') {
      return ['represent', 'describe'];
    }
    if (e.value === 'state+predicative') return ['describe'];
    return [];
  }
  if (e.source === 'context') return ['focalize'];
  return [];
}

function _splitConstructionEvidence(construction) {
  if (!construction || typeof construction.id !== 'string') return [];
  const table = _CONSTRUCTION_EVIDENCE[construction.id];
  if (!Array.isArray(table)) return [];
  const baseConfidence = typeof construction.confidence === 'number'
    ? construction.confidence
    : 0.9;
  return table.map((e) => ({
    operation: e.operation,
    evidence: {
      source: 'construction', value: construction.id, reason: e.reason,
      weight: Math.round(e.weight * baseConfidence * 100) / 100,
    },
  }));
}

function _sortCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.operation.localeCompare(b.operation);
  });
}

function _sortEvidence(list) {
  return [...list].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    if (a.source !== b.source) return a.source.localeCompare(b.source);
    return a.reason.localeCompare(b.reason);
  });
}

// ══════════════════════════════════════════════════════════════
// ADAPTER — subtypesV1 (flat)
// ══════════════════════════════════════════════════════════════

function _buildSubtypesV1(subtypes) {
  const out = {};
  if (!subtypes || typeof subtypes !== 'object') return out;
  for (const [dOp, sub] of Object.entries(subtypes)) {
    const v1 = _D_TO_V1[dOp];
    if (v1 && sub?.id) out[v1] = sub.id;
  }
  return out;
}

// ══════════════════════════════════════════════════════════════
// APLICAÇÃO DE USER OVERRIDES EM CONSTRUCTION
// ══════════════════════════════════════════════════════════════

/**
 * Se o autor registrou uma correção de operação para esta
 * construction via `learnConstructionOp`, aplica ANTES de qualquer
 * outra evidência. Devolve a lista de candidatos com override, ou
 * null se não houver override.
 *
 * @param {Object} model
 * @param {Object} ctx
 * @returns {Array|null}
 * @private
 */
function _applyConstructionOverrides(model, ctx) {
  const cid = model?.construction?.id;
  if (!cid) return null;

  const lexicon = ctx?.userLexicon;
  if (!(lexicon instanceof Map)) return null;

  const entry = lexicon.get(String(cid).toLowerCase());
  if (!entry || entry.kind !== 'construction-op') return null;

  const op = entry.prefer;
  if (!OPERATIONS.includes(op)) return null;

  return [{
    operation: op,
    confidence: 0.99,
    evidence: [{
      source: 'context',
      value: `user:${cid}`,
      reason: `autor corrigiu "${cid}" → ${op}`,
      weight: 0.99,
    }],
  }];
}

// ══════════════════════════════════════════════════════════════
// API PRINCIPAL
// ══════════════════════════════════════════════════════════════

export function classify(model, resolution, ctx = {}) {
  if (!model || typeof model !== 'object') {
    return {
      candidates: [],
      selected: [],
      primary: null,
      subtypes: {},
      subtypesV1: {},
      axes: {},
      traits: [],
      hints: { focalization: null, interiority: null, epistemic: null, rule: null },
      __userLexicon: ctx?.userLexicon ?? null,
    };
  }

  // ── Camada 5: aplica overrides de construction ─────────────
  const constructionOverrides = _applyConstructionOverrides(model, ctx);

  const aggregated = new Map();

  // ── 1. Overrides de construção (autor) ─────────────────────
  if (Array.isArray(constructionOverrides)) {
    for (const c of constructionOverrides) {
      for (const e of c.evidence) {
        if (!OPERATIONS.includes(c.operation)) continue;
        _bump(aggregated, c.operation, e);
      }
    }
  }

  // ── 2. Construction ────────────────────────────────────────
  try {
    const splits = _splitConstructionEvidence(model.construction);
    for (const { operation, evidence } of splits) {
      if (!OPERATIONS.includes(operation)) continue;
      _bump(aggregated, operation, evidence);
    }
  } catch { /* isola */ }

  // ── 3. Variant ─────────────────────────────────────────────
  try {
    const variantEvidence = _evidenceFromVariant(model);
    for (const e of variantEvidence) {
      const ops = _operationsForEvidence(e, model);
      for (const op of ops) if (OPERATIONS.includes(op)) _bump(aggregated, op, e);
    }
  } catch { /* isola */ }

  // ── 4. Lexicon predicate ───────────────────────────────────
  try {
    const predEvidence = _evidenceFromPredicate(model);
    for (const e of predEvidence) {
      const ops = _operationsForEvidence(e, model);
      for (const op of ops) if (OPERATIONS.includes(op)) _bump(aggregated, op, e);
    }
  } catch { /* isola */ }

  // ── 5. Sintaxe ─────────────────────────────────────────────
  try {
    const synEvidence = _evidenceFromSyntax(model);
    for (const e of synEvidence) {
      const ops = _operationsForEvidence(e, model);
      for (const op of ops) if (OPERATIONS.includes(op)) _bump(aggregated, op, e);
    }
  } catch { /* isola */ }

  // ── 6. Subordinação ────────────────────────────────────────
  try {
    const subEvidence = _evidenceFromSubordination(model);
    for (const e of subEvidence) {
      if (!OPERATIONS.includes(e.operation)) continue;
      _bump(aggregated, e.operation, {
        source: 'syntax', value: e.marker, reason: e.reason, weight: e.weight,
      });
    }
  } catch { /* isola */ }

  // ── 7. Focalização ─────────────────────────────────────────
  let focalizationHints = null;
  try {
    const focalizationEvidence = _evidenceFromFocalization(model, resolution, ctx);
    for (const e of focalizationEvidence) {
      if (!OPERATIONS.includes(e.operation)) continue;
      _bump(aggregated, e.operation, e.evidence);
    }
    focalizationHints = analyzeFocalization(model, resolution, ctx);
  } catch { /* isola */ }

  // ── 8. Interioridade ───────────────────────────────────────
  let interiorityHints = null;
  try {
    const interiorityEvidence = _evidenceFromInteriority(model, resolution, ctx);
    for (const e of interiorityEvidence) {
      if (!OPERATIONS.includes(e.operation)) continue;
      _bump(aggregated, e.operation, e.evidence);
    }
    interiorityHints = analyzeInteriority(model, resolution, ctx);
  } catch { /* isola */ }

  // ── 9. Epistemologia ───────────────────────────────────────
  let epistemicHints = null;
  try {
    const epistemicEvidence = _evidenceFromEpistemic(model, resolution, ctx);
    for (const e of epistemicEvidence) {
      if (!OPERATIONS.includes(e.operation)) continue;
      _bump(aggregated, e.operation, e.evidence);
    }
    epistemicHints = analyzeEpistemic(model, resolution, ctx);
  } catch { /* isola */ }

  // ── 10. Regras naturais ────────────────────────────────────
  let ruleHints = null;
  try {
    const ruleResult = _evidenceFromRule(model, resolution, ctx);
    for (const e of ruleResult.evidence) {
      if (!OPERATIONS.includes(e.operation)) continue;
      _bump(aggregated, e.operation, e.evidence);
    }
    ruleHints = ruleResult.rule;
  } catch { /* isola */ }

  // ── 11. Context hints (legado) ─────────────────────────────
  try {
    if (ctx?.hints?.focalization) {
      _bump(aggregated, 'focalize', {
        source: 'context', value: ctx.hints.focalization,
        reason: 'focalização informada pelo contexto', weight: 0.60,
      });
    }
  } catch { /* isola */ }

  // ── 12. Materializa candidatos ─────────────────────────────
  const candidates = [];
  for (const [operation, { total, list }] of aggregated) {
    const confidence = Math.min(_MAX_CONFIDENCE, total);
    candidates.push({
      operation,
      confidence: Math.round(confidence * 100) / 100,
      evidence: _sortEvidence(list),
    });
  }

  const sorted = _sortCandidates(candidates);

  const selected = sorted
    .filter((c) => c.confidence >= _SELECT_THRESHOLD)
    .map((c) => c.operation);

  const primary = sorted.length > 0 ? sorted[0].operation : null;
  const effectiveSelected = selected.length > 0
    ? selected
    : (primary ? [primary] : []);

  // ── 13. Resultado base ─────────────────────────────────────
  const classification = {
    candidates: sorted,
    selected: effectiveSelected,
    primary,
    subtypes: {},
    subtypesV1: {},
    axes: {},
    traits: [],
    hints: {
      focalization: focalizationHints,
      interiority: interiorityHints,
      epistemic: epistemicHints,
      rule: ruleHints,
    },
    // ── Camada 5: expõe o user lexicon para o subtype-detector ──
    __userLexicon: ctx?.userLexicon instanceof Map ? ctx.userLexicon : null,
  };

  // ── 14. Subtipos + eixos + traits ──────────────────────────
  try {
    const detection = detect(model, resolution, classification);
    classification.subtypes   = detection.subtypes ?? {};
    classification.axes       = detection.axes ?? {};
    classification.traits     = detection.traits instanceof Set
      ? Array.from(detection.traits)
      : (Array.isArray(detection.traits) ? detection.traits : []);
    classification.subtypesV1 = _buildSubtypesV1(classification.subtypes);
  } catch {
    try {
      classification.subtypesV1 = detectSubtypes(model, resolution, classification) ?? {};
    } catch { /* isola */ }
  }

  return classification;
}

// ══════════════════════════════════════════════════════════════
// SUBORDINAÇÃO
// ══════════════════════════════════════════════════════════════

function _evidenceFromSubordination(model) {
  const raw = String(model?.raw ?? '').trim();
  if (!raw) return [];

  const out = [];

  for (const entry of _SUBORDINATION_MARKERS) {
    if (entry.pattern.test(raw)) {
      for (const op of entry.operations) {
        out.push({
          operation: op.op,
          weight: op.weight,
          reason: op.reason,
          marker: entry.kind,
        });
      }
      break;
    }
  }

  if (/,\s*porque\s+/i.test(raw)) {
    out.push({
      operation: 'structure', weight: 0.75,
      reason: 'oração causal in-situ (porque)', marker: 'causal-inline',
    });
  }

  return out;
}

// ══════════════════════════════════════════════════════════════
// CONSULTAS
// ══════════════════════════════════════════════════════════════

/**
 * Estatísticas de uma classificação.
 * @param {Object} result
 * @returns {Object}
 */
export function classificationStats(result) {
  if (!result || !Array.isArray(result.candidates)) {
    return {
      candidateCount: 0, selectedCount: 0, topConfidence: 0,
      subtypes: {}, subtypesV1: {}, axes: {}, traits: [],
      axisCount: 0, traitCount: 0, hasFocalization: false,
      hasInteriority: false, hasEpistemic: false, hasRule: false,
    };
  }

  const axes = result.axes ?? {};
  const axisCount = Object.values(axes).reduce(
    (n, opAxes) => n + Object.keys(opAxes ?? {}).length, 0
  );

  const traits = Array.isArray(result.traits) ? result.traits : [];

  return {
    candidateCount: result.candidates.length,
    selectedCount: result.selected.length,
    topConfidence: result.candidates[0]?.confidence ?? 0,
    primary: result.primary,
    subtypes: result.subtypes ?? {},
    subtypesV1: result.subtypesV1 ?? {},
    axes,
    traits,
    axisCount,
    traitCount: traits.length,
    hasFocalization: result.hints?.focalization != null,
    hasInteriority: (result.hints?.interiority?.acts?.length ?? 0) > 0,
    hasEpistemic: (result.hints?.epistemic?.acts?.length ?? 0) > 0,
    hasRule: result.hints?.rule != null,
  };
}

export function selectThreshold() {
  return _SELECT_THRESHOLD;
}

export function listSubordinationMarkers() {
  return _SUBORDINATION_MARKERS.map((e) => e.kind);
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const Classifier = Object.freeze({
  classify,
  classificationStats,
  selectThreshold,
  listSubordinationMarkers,
});