/**
 * @file subtype-detector.js
 * @module narrative-language/acts
 * @description Detector v2 — mapeia cada operação selecionada pelo classifier
 *              para um subtipo canônico (D-number) da Norma C. Aplica herança,
 *              agrega traits e detecta eixos dimensionais (D5, D7, D8).
 * @imports narrative-language/ir/catalog,
 *          narrative-language/pt-br/lexicon,
 *          narrative-language/user-lexicon,
 *          narrative-language/acts/axis-detector
 * @importedBy narrative-language/acts/classifier,
 *             narrative-language/diagnostics/trace
 * @level N3
 *
 * ═══════════════════════════════════════════════════════════════
 * CAMADA 5 — ESTRATÉGIA DE APRENDIZADO DO AUTOR
 * ═══════════════════════════════════════════════════════════════
 *
 * Adicionada `_fromUserLexicon` como estratégia de PRIORIDADE MÁXIMA.
 * Se o autor já corrigiu este verbo alguma vez, o detector obedece
 * cegamente — confiança 0.99.
 *
 * Ordem de estratégias (prioridade decrescente):
 *   0. User lexicon   (verb-subtype aprendido)
 *   1. Construction
 *   2. Variant
 *   3. Lexicon
 *   4. Hints (interiority/epistemic)
 *   5. Raw text (regex)
 *
 * A Camada 3 adicionou `_CONSTRUCTION_SUBTYPES` para as 12 novas
 * constructions. Mantidas.
 *
 * Nunca lança. Determinístico.
 */

import { Catalog } from '../ir/catalog.js';
import {
  lookupLemma,
  subtypeOf as lexSubtypeOf,
  classOf as lexClassOf,
  traitsOf as lexTraitsOf,
  variantFor as lexVariantFor,
} from '../pt-br/lexicon.js';
import {
  getVerbSubtype as userGetVerbSubtype,
  LEARNED_CONFIDENCE,
} from '../user-lexicon.js';
import { detectAxes } from './axis-detector.js';

// ══════════════════════════════════════════════════════════════
// MAPAS DE ALIAS (v1 ↔ D-number)
// ══════════════════════════════════════════════════════════════

/** @type {Readonly<Object<string, string>>} @private */
const _V1_TO_D = Object.freeze({
  'represent':   'D1',
  'describe':    'D2',
  'expose':      'D3',
  'interiorize': 'D4',
  'enunciate':   'D5',
  'evaluate':    'D6',
  'focalize':    'D7',
  'structure':   'D8',
});

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

// ══════════════════════════════════════════════════════════════
// CONSTRUCTION → SUBTYPE
// ══════════════════════════════════════════════════════════════

/**
 * @type {Readonly<Object<string, Object>>}
 * @private
 */
const _CONSTRUCTION_SUBTYPES = Object.freeze({
  // ── D2 — Descrever ────────────────────────────────────
  'para-x-parecia-y':   { D2: 'D2.1' },
  'para-x-y-era-z':     { D2: 'D2.1' },

  // ── D3 — Expor ────────────────────────────────────────
  'x-e-um-y':           { D3: 'D3.3' },
  'x-fica-em-y':        { D3: 'D3.1' },
  'havia-tempo':        { D3: 'D3.2' },

  // ── D4 — Interiorizar ─────────────────────────────────
  'x-sabia-que-y':      { D4: 'D4.3' },
  'x-achava-que-y':     { D4: 'D4.3' },
  'x-viu-y':            { D4: 'D4.1' },
  'x-lembrou-de-y':     { D4: 'D4.4' },
  'x-sentiu-y':         { D4: 'D4.1' },
  'x-queria-y':         { D4: 'D4.7' },
  'maybe-error':        { D4: 'D4.3' },

  // ── D5 — Enunciar ─────────────────────────────────────
  'direct-speech-dash': { D5: 'D5.1' },
  'x-disse-que-y':      { D5: 'D5.1' },
  'x-y-disse':          { D5: 'D5.1' },

  // ── D6 — Avaliar ──────────────────────────────────────
  'foi-uma-avaliacao':  { D6: 'D6.1' },

  // ── Camada 3 ──────────────────────────────────────────
  'relative-clause-restrictive': { D2: 'D2.1' },
  'relative-clause-explanatory': { D3: 'D3.5' },
  'apposition':                  { D3: 'D3.3' },
  'consecutive-clause':          { D8: 'D8' },
  'comparison':                  { D6: 'D6.5' },
  'causal-gerund':               { D8: 'D8' },
  'concession':                  { D8: 'D8' },
  'purpose-clause':              { D8: 'D8' },
  'nested-indirect-speech':      { D5: 'D5.1' },
  'explicit-expectation':        { D4: 'D4.7' },
  'pseudo-cleft':                { D6: 'D6.5' },
  'free-indirect-doubt':         { D4: 'D4.3' },
});

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * @param {string} op
 * @returns {string|null}
 * @private
 */
function _resolveOperationId(op) {
  if (!op || typeof op !== 'string') return null;
  if (/^D\d+$/.test(op)) return op;
  return _V1_TO_D[op] ?? null;
}

/**
 * @param {string} subtypeId
 * @returns {string|null}
 * @private
 */
function _operationOfSubtype(subtypeId) {
  if (!subtypeId || typeof subtypeId !== 'string') return null;
  const m = /^(D\d+)/.exec(subtypeId);
  return m ? m[1] : null;
}

/**
 * @param {string} subtypeId
 * @param {string} operationId
 * @returns {string[]}
 * @private
 */
function _buildChain(subtypeId, operationId) {
  const chain = [];
  if (operationId) chain.push(operationId);
  if (!subtypeId) return chain;

  const lineage = [];
  let cur = subtypeId;
  let safety = 0;

  while (cur && safety < 10) {
    lineage.unshift(cur);
    const st = Catalog.getSubtype(cur);
    cur = st?.parent ?? null;
    safety++;
  }

  for (const l of lineage) {
    if (!chain.includes(l)) chain.push(l);
  }

  return chain;
}

/**
 * @param {Object} subtypes
 * @returns {Set<string>}
 * @private
 */
function _collectTraits(subtypes) {
  const out = new Set();
  for (const sub of Object.values(subtypes)) {
    if (!sub) continue;
    if (Array.isArray(sub.traits)) {
      for (const t of sub.traits) out.add(t);
    }
  }
  return out;
}

// ══════════════════════════════════════════════════════════════
// ESTRATÉGIAS DE DETECÇÃO
// ══════════════════════════════════════════════════════════════

/**
 * Estratégia 0 — APRENDIZADO DO AUTOR (Camada 5).
 *
 * PRIORIDADE MÁXIMA. Se o autor já registrou `learnVerbSubtype` para
 * o `predicateLemma`, obedece sem discussão. Confiança 0.99.
 *
 * @param {string} op
 * @param {Object} model
 * @param {Object} classification
 * @returns {Object|null}
 * @private
 */
function _fromUserLexicon(op, model, classification) {
  const lemma = model?.predicateLemma;
  if (!lemma) return null;

  const lexicon = classification?.__userLexicon;
  if (!(lexicon instanceof Map)) return null;

  const dnumber = userGetVerbSubtype(lemma, lexicon);
  if (!dnumber) return null;

  // Verifica se a operação bate com a solicitada
  const stOp = _operationOfSubtype(dnumber);
  if (stOp !== op) return null;

  const stDef = Catalog.getSubtype(dnumber);
  if (!stDef) return null;

  const lexEntry = lexicon.get(String(lemma).toLowerCase());
  const uses = lexEntry?.uses ?? 1;

  return {
    operation: op,
    id: dnumber,
    label: stDef.label ?? dnumber,
    confidence: LEARNED_CONFIDENCE,
    source: 'user',
    reason: `aprendido pelo autor ("${lemma}" → ${dnumber}, ${uses}×)`,
    value: lemma,
    traits: [
      ...(Catalog.getOperation(op)?.traits ?? []),
      ...(stDef.traits ?? []),
    ],
    chain: _buildChain(dnumber, op),
  };
}

/**
 * Estratégia 1 — Construction reconhecida determina o subtipo.
 * @private
 */
function _fromConstruction(op, model) {
  const cid = model?.construction?.id;
  if (!cid) return null;
  const mapping = _CONSTRUCTION_SUBTYPES[cid];
  if (!mapping) return null;
  const st = mapping[op];
  if (!st) return null;

  const stDef = Catalog.getSubtype(st);
  if (!stDef) return null;

  const baseConfidence = typeof model.construction?.confidence === 'number'
    ? model.construction.confidence
    : 0.9;

  return {
    operation: op,
    id: st,
    label: stDef.label ?? st,
    confidence: baseConfidence,
    source: 'construction',
    reason: `construction "${cid}"`,
    value: cid,
    traits: [...(Catalog.getOperation(op)?.traits ?? []), ...(stDef.traits ?? [])],
    chain: _buildChain(st, op),
  };
}

/**
 * Estratégia 2 — Variante por classe do objeto.
 * @private
 */
function _fromVariant(op, model) {
  const lemma = model?.predicateLemma;
  if (!lemma) return null;
  const objects = Array.isArray(model.objects) ? model.objects : [];
  if (objects.length === 0) return null;

  const obj = objects[0];
  if (!obj) return null;

  let cls = obj.class;
  if (!cls && obj.lemma) cls = lexClassOf(obj.lemma);
  if (!cls || typeof cls !== 'string') return null;

  const variant = lexVariantFor(lemma, cls);
  if (!variant?.subtype) return null;

  const st = variant.subtype;
  const stOp = _operationOfSubtype(st);
  if (stOp !== op) return null;

  const stDef = Catalog.getSubtype(st);
  if (!stDef) return null;

  return {
    operation: op,
    id: st,
    label: stDef.label ?? st,
    confidence: 0.95,
    source: 'variant',
    reason: `variante "${lemma}+${cls}"`,
    value: `${lemma}+${cls}`,
    traits: [...(Catalog.getOperation(op)?.traits ?? []), ...(stDef.traits ?? [])],
    chain: _buildChain(st, op),
  };
}

/**
 * Estratégia 3 — Léxico direto.
 * @private
 */
function _fromLexicon(op, model) {
  const lemma = model?.predicateLemma;
  if (!lemma) return null;

  const st = lexSubtypeOf(lemma);
  if (!st) return null;

  const stOp = _operationOfSubtype(st);
  if (stOp !== op) return null;

  const stDef = Catalog.getSubtype(st);
  if (!stDef) return null;

  const traits = lexTraitsOf(lemma);
  const confidence = traits.length > 0 ? 0.88 : 0.82;

  return {
    operation: op,
    id: st,
    label: stDef.label ?? st,
    confidence,
    source: 'lexicon',
    reason: `lema "${lemma}"`,
    value: lemma,
    traits: [...(Catalog.getOperation(op)?.traits ?? []), ...traits, ...(stDef.traits ?? [])],
    chain: _buildChain(st, op),
  };
}

/**
 * Estratégia 4 — Hints de analisadores.
 * @private
 */
function _fromHints(op, model, classification) {
  const hints = classification?.hints;
  if (!hints) return null;

  if (op === 'D4') {
    const interiority = hints.interiority;
    const iActs = Array.isArray(interiority?.acts) ? interiority.acts : [];
    if (iActs.length > 0) {
      const act = iActs[0];
      const st = _mapInteriorityCategory(act.category);
      if (st) return _mkHint('D4', st, act.confidence ?? 0.75, `interiority "${act.category}"`);
    }

    const epistemic = hints.epistemic;
    const eActs = Array.isArray(epistemic?.acts) ? epistemic.acts : [];
    if (eActs.length > 0) {
      const act = eActs[0];
      const st = _mapEpistemicCategory(act.category);
      if (st) return _mkHint('D4', st, act.confidence ?? 0.75, `epistemic "${act.category}"`);
    }
  }

  return null;
}

function _mapInteriorityCategory(cat) {
  switch (cat) {
    case 'emotion':              return 'D4.6';
    case 'sensation':            return 'D4.1';
    case 'thought':              return 'D4.2';
    case 'desire':               return 'D4.7';
    case 'intention':            return 'D4.8';
    case 'memory':               return 'D4.4';
    case 'imagination':          return 'D4.5';
    case 'belief':               return 'D4.3';
    case 'doubt':                return 'D4.3';
    case 'expectation':          return 'D4.2';
    case 'subjective-perception':return 'D4.1';
    default:                     return null;
  }
}

function _mapEpistemicCategory(cat) {
  switch (cat) {
    case 'perception': return 'D4.1';
    case 'knowledge':  return 'D4.3';
    case 'belief':     return 'D4.3';
    case 'memory':     return 'D4.4';
    case 'ignorance':  return 'D4.3';
    case 'fact':       return null;
    default:           return null;
  }
}

function _mkHint(op, st, conf, reason) {
  const stDef = Catalog.getSubtype(st);
  if (!stDef) return null;
  return {
    operation: op,
    id: st,
    label: stDef.label ?? st,
    confidence: Math.max(0, Math.min(1, conf)),
    source: 'context',
    reason,
    value: reason,
    traits: [...(Catalog.getOperation(op)?.traits ?? []), ...(stDef.traits ?? [])],
    chain: _buildChain(st, op),
  };
}

/**
 * Estratégia 5 — Texto cru (regex).
 * @private
 */
function _fromRawText(op, model) {
  const raw = String(model?.raw ?? '').toLowerCase();
  if (!raw) return null;

  if (op === 'D6') {
    if (/\b(errado|certo|justo|injusto|cruel|covarde|nobre)\b/.test(raw)) {
      return _mkHint('D6', 'D6.1', 0.75, 'juízo ético no texto');
    }
    if (/\b(falso|verdadeiro|duvidoso|incerto|suspeito)\b/.test(raw)) {
      return _mkHint('D6', 'D6.2', 0.72, 'juízo epistêmico no texto');
    }
    if (/\b(belo|feio|sublime|horrendo|gracioso|elegante)\b/.test(raw)) {
      return _mkHint('D6', 'D6.5', 0.70, 'avaliação estética');
    }
    if (/\b(claro|obviamente|naturalmente)\b/.test(raw)) {
      return _mkHint('D6', 'D6.4', 0.70, 'ironia detectada');
    }
    if (/\b(sem dúvida|certamente|de fato|realmente)\b/.test(raw)) {
      return _mkHint('D6', 'D6.4', 0.65, 'ênfase detectada');
    }
    return _mkHint('D6', 'D6.5', 0.55, 'comentário genérico');
  }

  if (op === 'D3') {
    if (/\b(era|foi)\s+(um|uma)\b/.test(raw)) {
      return _mkHint('D3', 'D3.3', 0.75, 'identidade declarada');
    }
    if (/\b(ficava|situava|erguia|localizava|situado)\b/.test(raw)) {
      return _mkHint('D3', 'D3.1', 0.75, 'localização declarada');
    }
    if (/\b(pertencia|fazia parte|membro|descendia)\b/.test(raw)) {
      return _mkHint('D3', 'D3.6', 0.72, 'relação declarada');
    }
    if (/\b(havia|existia|outrora|antigamente|no passado)\b/.test(raw)) {
      return _mkHint('D3', 'D3.2', 0.72, 'contexto histórico');
    }
    return null;
  }

  return null;
}

// ══════════════════════════════════════════════════════════════
// ORQUESTRAÇÃO POR OPERAÇÃO
// ══════════════════════════════════════════════════════════════

/**
 * Tenta todas as estratégias para uma operação, em ordem de
 * prioridade. Devolve a primeira que casar com confiança ≥ 0.90,
 * ou a melhor até então.
 *
 * @private
 */
function _detectForOperation(op, model, resolution, classification) {
  const strategies = [
    () => _fromUserLexicon(op, model, classification),  // ← Camada 5
    () => _fromConstruction(op, model),
    () => _fromVariant(op, model),
    () => _fromLexicon(op, model),
    () => _fromHints(op, model, classification),
    () => _fromRawText(op, model),
  ];

  let best = null;

  for (const fn of strategies) {
    try {
      const result = fn();
      if (!result) continue;
      if (!best || result.confidence > best.confidence) best = result;

      // User lexicon tem prioridade absoluta — se casar, para aqui
      if (result.source === 'user') break;

      if (result.confidence >= 0.90) break;
    } catch { /* isola */ }
  }

  return best;
}

// ══════════════════════════════════════════════════════════════
// API PRINCIPAL — detect (rich)
// ══════════════════════════════════════════════════════════════

/**
 * Detecta subtipos e eixos para o modelo dado.
 *
 * @param {Object} model
 * @param {Object} [resolution]
 * @param {Object} [classification]
 * @returns {{ subtypes: Object, axes: Object, traits: Set<string> }}
 */
export function detect(model, resolution, classification = {}) {
  const empty = { subtypes: {}, axes: {}, traits: new Set() };
  if (!model) return empty;

  const selected = Array.isArray(classification.selected) && classification.selected.length > 0
    ? classification.selected
    : (classification.primary ? [classification.primary] : []);

  const subtypes = {};

  for (const op of selected) {
    const dOp = _resolveOperationId(op);
    if (!dOp) continue;

    // D7 e D8 são coordenadores puros: só eixos, sem subtipos.
    if (dOp === 'D7' || dOp === 'D8') continue;

    const sub = _detectForOperation(dOp, model, resolution, classification);
    if (sub) subtypes[dOp] = sub;
  }

  let axes = {};
  try {
    axes = detectAxes(model, resolution, classification) ?? {};
  } catch {
    axes = {};
  }

  const traits = _collectTraits(subtypes);

  return { subtypes, axes, traits };
}

// ══════════════════════════════════════════════════════════════
// API RETROCOMPATÍVEL — detectSubtypes (flat)
// ══════════════════════════════════════════════════════════════

/**
 * Versão achatada.
 * @param {Object} model
 * @param {Object} resolution
 * @param {Object} classification
 * @returns {Object<string, string>}
 */
export function detectSubtypes(model, resolution, classification = {}) {
  const result = detect(model, resolution, classification);
  const flat = {};

  for (const [dOp, sub] of Object.entries(result.subtypes)) {
    const v1 = _D_TO_V1[dOp];
    if (v1 && sub?.id) flat[v1] = sub.id;
  }

  return flat;
}

// ══════════════════════════════════════════════════════════════
// CONSULTAS / DEBUG
// ══════════════════════════════════════════════════════════════

/**
 * Estatísticas de um resultado de detecção.
 * @param {Object} result
 * @returns {Object}
 */
export function subtypeStats(result) {
  if (!result || typeof result !== 'object') {
    return { count: 0, operations: [], all: [], axisCount: 0, traitCount: 0, sourceCounts: {} };
  }
  const subtypes = result.subtypes ?? {};
  const keys = Object.keys(subtypes);

  const all = keys.map((op) => {
    const s = subtypes[op];
    return `${op}:${s.id}(${s.source})`;
  });

  const axesCount = result.axes
    ? Object.values(result.axes).reduce(
        (n, opAxes) => n + Object.keys(opAxes ?? {}).length,
        0
      )
    : 0;

  const traitCount = result.traits instanceof Set
    ? result.traits.size
    : (Array.isArray(result.traits) ? result.traits.length : 0);

  const sourceCounts = {};
  for (const sub of Object.values(subtypes)) {
    if (!sub?.source) continue;
    sourceCounts[sub.source] = (sourceCounts[sub.source] ?? 0) + 1;
  }

  return {
    count: keys.length,
    operations: keys,
    all,
    axisCount: axesCount,
    traitCount,
    sourceCounts,
  };
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const SubtypeDetector = Object.freeze({
  detect,
  detectSubtypes,
  subtypeStats,
});