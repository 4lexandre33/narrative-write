/**
 * @file dimensions.js
 * @module narrative-language/acts
 * @description Extrai as dimensões transversais de um ato: voz, focalização,
 *              forma discursiva, tempo, aspecto, modalidade, negação e
 *              epistemologia. Integra análise de temporalidade narrativa.
 * @imports narrative-language/ir/schema,
 *          narrative-language/acts/temporality-analyzer
 * @importedBy narrative-language/pipeline/interpreter
 * @level N3
 *
 * ═══════════════════════════════════════════════════════════════
 * CAMADA 3 — DIMENSIONS EXPANDIDAS
 * ═══════════════════════════════════════════════════════════════
 *
 * `_CONSTRUCTION_DIMENSIONS` ganha entradas para as 12 novas
 * construções introduzidas em `pt-br/constructions.js`:
 *
 *   - relative-clause-restrictive → describe/description
 *   - relative-clause-explanatory → expose/exposition
 *   - apposition                  → expose/exposition
 *   - consecutive-clause          → structure + narration
 *   - comparison                  → evaluate/commentary
 *   - causal-gerund               → structure + narration
 *   - concession                  → structure + narration
 *   - purpose-clause              → structure + narration
 *   - nested-indirect-speech      → enunciate/indirect-speech
 *   - explicit-expectation        → interiorize/thought + belief
 *   - pseudo-cleft                → evaluate/commentary
 *   - free-indirect-doubt         → interiorize/free-indirect + doubt
 *
 * Fase 10 — LUME (mantido):
 *   - Consome `temporality-analyzer.js` para enriquecer aspecto, frame
 *     e relação temporal.
 *   - `_detectFineModality` e `_detectFineNegation` mantidos.
 *
 * Nunca lança. Em entrada degenerada devolve dimensões neutras mas válidas.
 */

import {
  VOICE_KINDS,
  FOCALIZATION_KINDS,
  DISCOURSE_FORMS,
  EPISTEMIC_KINDS,
  MODALITY_KINDS,
  NEGATION_KINDS,
  TEMPORAL_FRAMES,
} from '../ir/schema.js';
import { analyzeTemporality } from './temporality-analyzer.js';

// ══════════════════════════════════════════════════════════════
// MAPEAMENTO DE CONSTRUCTION → DIMENSÕES
// ══════════════════════════════════════════════════════════════

/**
 * Configuração de dimensões por construction.
 * @type {Readonly<Object<string, Object>>}
 * @private
 */
const _CONSTRUCTION_DIMENSIONS = Object.freeze({
  // ── Focalização explícita ─────────────────────────────
  'para-x-parecia-y': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: { kind: 'character', targetFrom: 'focalizer' },
    form: 'description',
    epistemic: 'perception',
  },
  'para-x-y-era-z': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: { kind: 'character', targetFrom: 'focalizer' },
    form: 'description',
    epistemic: 'perception',
  },
  'x-nao-viu-y': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: { kind: 'character', targetFrom: 'perceiver' },
    form: 'narration',
    epistemic: 'perception',
  },

  // ── Discurso direto / indireto ────────────────────────
  'direct-speech-dash': {
    voice: { kind: 'character', sourceFrom: 'attributedTo' },
    focalization: null,
    form: 'direct-speech',
    epistemic: 'fact',
  },
  'x-disse-que-y': {
    voice: { kind: 'character', sourceFrom: 'speaker' },
    focalization: null,
    form: 'indirect-speech',
    epistemic: 'fact',
  },
  'x-y-disse': {
    voice: { kind: 'character', sourceFrom: 'speaker' },
    focalization: null,
    form: 'direct-speech',
    epistemic: 'fact',
  },

  // ── Epistemologia ─────────────────────────────────────
  'x-sabia-que-y': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'thought',
    epistemic: 'knowledge',
    subjectFrom: 'holder',
  },
  'x-achava-que-y': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'thought',
    epistemic: 'belief',
    subjectFrom: 'holder',
  },
  'x-viu-y': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'narration',
    epistemic: 'perception',
    subjectFrom: 'perceiver',
  },
  'x-lembrou-de-y': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'thought',
    epistemic: 'memory',
    subjectFrom: 'holder',
  },

  // ── Interioridade ─────────────────────────────────────
  'x-sentiu-y': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'thought',
    epistemic: 'fact',
    subjectFrom: 'experiencer',
  },
  'x-queria-y': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'thought',
    epistemic: 'fact',
    subjectFrom: 'experiencer',
  },
  'maybe-error': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'free-indirect-discourse',
    epistemic: 'belief',
  },

  // ── Estrutura temporal ────────────────────────────────
  'anos-antes': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'narration',
    epistemic: 'fact',
  },
  'mais-tarde': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'narration',
    epistemic: 'fact',
  },
  'enquanto-isso': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'narration',
    epistemic: 'fact',
  },
  'havia-tempo': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'exposition',
    epistemic: 'fact',
  },

  // ── Avaliação ─────────────────────────────────────────
  'foi-uma-avaliacao': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'commentary',
    epistemic: 'fact',
  },

  // ── Exposição ─────────────────────────────────────────
  'x-e-um-y': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'exposition',
    epistemic: 'fact',
  },
  'x-fica-em-y': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'exposition',
    epistemic: 'fact',
  },

  // ═══════════════════════════════════════════════════════════
  // CAMADA 3 — Novas constructions
  // ═══════════════════════════════════════════════════════════

  // ── Relativa restritiva ───────────────────────────────
  'relative-clause-restrictive': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'description',
    epistemic: 'fact',
  },

  // ── Relativa explicativa ──────────────────────────────
  'relative-clause-explanatory': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'exposition',
    epistemic: 'fact',
  },

  // ── Aposto ────────────────────────────────────────────
  'apposition': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'exposition',
    epistemic: 'fact',
  },

  // ── Consecutiva ───────────────────────────────────────
  'consecutive-clause': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'narration',
    epistemic: 'fact',
  },

  // ── Comparativa ───────────────────────────────────────
  'comparison': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'commentary',
    epistemic: 'fact',
  },

  // ── Gerúndio causal ───────────────────────────────────
  'causal-gerund': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'narration',
    epistemic: 'fact',
  },

  // ── Concessiva ────────────────────────────────────────
  'concession': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'narration',
    epistemic: 'fact',
  },

  // ── Final ─────────────────────────────────────────────
  'purpose-clause': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'narration',
    epistemic: 'fact',
  },

  // ── Discurso indireto aninhado ────────────────────────
  'nested-indirect-speech': {
    voice: { kind: 'character', sourceFrom: 'speaker1' },
    focalization: { kind: 'character', targetFrom: 'speaker2' },
    form: 'indirect-speech',
    epistemic: 'belief',
  },

  // ── Expectativa explícita ─────────────────────────────
  'explicit-expectation': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'thought',
    epistemic: 'belief',
    subjectFrom: 'holder',
  },

  // ── Clivada enfática ──────────────────────────────────
  'pseudo-cleft': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'commentary',
    epistemic: 'fact',
  },

  // ── Discurso indireto livre com dúvida ────────────────
  'free-indirect-doubt': {
    voice: { kind: 'narrator', sourceFrom: null },
    focalization: null,
    form: 'free-indirect-discourse',
    epistemic: 'doubt',
  },
});

// ══════════════════════════════════════════════════════════════
// MODALIDADE FINA
// ══════════════════════════════════════════════════════════════

/**
 * Prioridade de modalidades.
 * @type {ReadonlyArray<string>}
 * @private
 */
const _MODALITY_PRIORITY = Object.freeze([
  'intention',
  'attempt',
  'capability',
  'obligation',
  'desire',
  'certainty',
  'probability',
  'possibility',
  'doubt',
]);

/** @type {ReadonlyArray<string>} @private */
const _INTENTION_VERBS = Object.freeze([
  'pretender', 'tencionar', 'intencionar', 'planejar', 'decidir',
  'projetar', 'arquitetar', 'programar',
]);

/** @type {ReadonlyArray<string>} @private */
const _CERTAINTY_ADVERBS = Object.freeze([
  'certamente', 'decerto', 'seguramente', 'indubitavelmente',
]);

/** @type {ReadonlyArray<string>} @private */
const _PROBABILITY_ADVERBS = Object.freeze([
  'provavelmente', 'possivelmente', 'aparentemente', 'presumivelmente',
]);

/**
 * Detecta modalidade fina.
 * @private
 */
function _detectFineModality(model, baseModality) {
  const tokens = Array.isArray(model?.tokens) ? model.tokens : [];
  const texts = tokens.map((t) => (t.text ?? '').toLowerCase());
  const lemmas = tokens.map((t) => (t.lemma ?? '').toLowerCase());

  for (const lemma of lemmas) {
    if (_INTENTION_VERBS.includes(lemma)) return 'intention';
  }

  const hasPoder = lemmas.includes('poder');
  if (hasPoder) {
    const idx = lemmas.indexOf('poder');
    for (let i = idx + 1; i < lemmas.length; i++) {
      if (lemmas[i] === 'tentar') return 'attempt';
      if (lemmas[i] === 'conseguir') return 'capability';
      if (lemmas[i] === 'pretender') return 'intention';
      if (lemmas[i] === 'dever') return 'obligation';
      if (i - idx > 4) break;
    }
  }

  if (lemmas.includes('querer') || lemmas.includes('desejar')) {
    if (baseModality !== 'attempt' && baseModality !== 'capability') {
      return 'desire';
    }
  }

  for (const t of texts) {
    if (_CERTAINTY_ADVERBS.includes(t)) return 'certainty';
  }

  for (const t of texts) {
    if (_PROBABILITY_ADVERBS.includes(t)) return 'probability';
  }

  if (baseModality && MODALITY_KINDS.includes(baseModality)) {
    return baseModality;
  }

  return null;
}

// ══════════════════════════════════════════════════════════════
// NEGAÇÃO FINA
// ══════════════════════════════════════════════════════════════

/**
 * Detecta negação fina.
 * @private
 */
function _detectFineNegation(model, baseNegation) {
  const tokens = Array.isArray(model?.tokens) ? model.tokens : [];
  const texts = tokens.map((t) => (t.text ?? '').toLowerCase());

  for (let i = 0; i < texts.length - 2; i++) {
    if (texts[i] === 'em' && texts[i + 1] === 'hipótese' && texts[i + 2] === 'alguma') {
      return 'never';
    }
  }

  for (let i = 0; i < texts.length - 2; i++) {
    if (texts[i] === 'de' &&
        (texts[i + 1] === 'forma' || texts[i + 1] === 'modo' || texts[i + 1] === 'jeito') &&
        (texts[i + 2] === 'alguma' || texts[i + 2] === 'algum' || texts[i + 2] === 'nenhum')) {
      return 'not';
    }
  }

  if (texts.includes('sequer')) {
    if (baseNegation === 'not' || baseNegation === 'never' || baseNegation === 'nor') {
      return baseNegation;
    }
    return 'not';
  }

  if (baseNegation && NEGATION_KINDS.includes(baseNegation)) {
    return baseNegation;
  }

  return null;
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function _neutralVoice() {
  return { kind: 'narrator', sourceId: null };
}

function _neutralForm() {
  return 'narration';
}

/**
 * Resolve o valor de um campo "From" contra os grupos da construction.
 * @private
 */
function _resolveFrom(fromKey, construction, resolution) {
  if (!fromKey) return null;

  if (construction?.groups && fromKey in construction.groups) {
    const value = construction.groups[fromKey];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  if (resolution?.references) {
    const found = resolution.references.find((r) =>
      r.lemma === fromKey || r.raw?.toLowerCase() === fromKey.toLowerCase()
    );
    if (found?.entityId) return found.entityId;
    if (found?.raw) return found.raw;
  }

  return null;
}

// ══════════════════════════════════════════════════════════════
// API PRINCIPAL
// ══════════════════════════════════════════════════════════════

/**
 * Extrai as dimensões de um ato.
 *
 * @param {Object} model
 * @param {Object} resolution
 * @param {Object} [ctx={}]
 * @returns {Object}
 */
export function extractDimensions(model, resolution, ctx = {}) {
  const dims = {
    voice: _neutralVoice(),
    focalization: null,
    form: _neutralForm(),
    tense: null,
    aspect: null,
    modality: null,
    negation: null,
    epistemic: null,
    temporalFrame: 'story',
    temporalRelation: null,
    temporalAnchor: null,
  };

  if (!model || typeof model !== 'object') {
    return dims;
  }

  // ── 1. Construction (dimensões explícitas) ──────────────
  const construction = model.construction;
  if (construction && typeof construction.id === 'string') {
    const config = _CONSTRUCTION_DIMENSIONS[construction.id];
    if (config) {
      if (config.voice) {
        const sourceId = _resolveFrom(config.voice.sourceFrom, construction, resolution);
        if (VOICE_KINDS.includes(config.voice.kind)) {
          dims.voice = { kind: config.voice.kind, sourceId };
        }
      }

      if (config.focalization) {
        const targetId = _resolveFrom(config.focalization.targetFrom, construction, resolution);
        if (FOCALIZATION_KINDS.includes(config.focalization.kind)) {
          dims.focalization = { kind: config.focalization.kind, targetId };
        }
      }

      if (config.form && DISCOURSE_FORMS.includes(config.form)) {
        dims.form = config.form;
      }

      if (config.epistemic && EPISTEMIC_KINDS.includes(config.epistemic)) {
        dims.epistemic = config.epistemic;
      }
    }
  }

  // ── 2. Dimensões diretas do modelo ──────────────────────
  if (model.tense) dims.tense = model.tense;

  const fineModality = _detectFineModality(model, model.modality ?? null);
  if (fineModality) dims.modality = fineModality;
  else if (model.modality) dims.modality = model.modality;

  const fineNegation = _detectFineNegation(model, model.negation ?? null);
  if (fineNegation) dims.negation = fineNegation;
  else if (model.negation) dims.negation = model.negation;

  // ── 3. Temporalidade narrativa ──────────────────────────
  let temporal = null;
  try {
    temporal = analyzeTemporality(model, resolution, ctx);
  } catch { /* isola */ }

  if (temporal) {
    if (TEMPORAL_FRAMES.includes(temporal.frame)) {
      dims.temporalFrame = temporal.frame;
    }
    dims.temporalRelation = temporal.relation ?? null;
    dims.temporalAnchor = temporal.anchor ?? null;

    if (temporal.aspect) {
      dims.aspect = temporal.aspect;
    } else if (model.aspect) {
      dims.aspect = model.aspect;
    }
  } else if (model.aspect) {
    dims.aspect = model.aspect;
  }

  // ── 4. Epistemic default ────────────────────────────────
  if (dims.epistemic === null) {
    dims.epistemic = 'fact';
  }

  // ── 5. Defaults finais ──────────────────────────────────
  if (!dims.voice) dims.voice = _neutralVoice();
  if (!dims.form || !DISCOURSE_FORMS.includes(dims.form)) {
    dims.form = _neutralForm();
  }

  return dims;
}

/**
 * Estatísticas das dimensões para diagnóstico.
 * @param {Object} dims
 * @returns {Object}
 */
export function dimensionsStats(dims) {
  if (!dims) return { hasVoice: false, hasFocalization: false, form: null };
  return {
    voice: dims.voice?.kind ?? null,
    focalization: dims.focalization?.kind ?? null,
    focalizationTarget: dims.focalization?.targetId ?? null,
    form: dims.form ?? null,
    tense: dims.tense ?? null,
    aspect: dims.aspect ?? null,
    modality: dims.modality ?? null,
    negation: dims.negation ?? null,
    epistemic: dims.epistemic ?? null,
    temporalFrame: dims.temporalFrame ?? null,
    temporalRelation: dims.temporalRelation ?? null,
    hasTemporalAnchor: !!dims.temporalAnchor,
  };
}

/**
 * Verifica se uma voz é "personagem" (usado para desambiguação em UI).
 * @param {Object} dims
 * @returns {boolean}
 */
export function isCharacterVoice(dims) {
  return dims?.voice?.kind === 'character';
}

/**
 * Lista os IDs de constructions com configuração explícita.
 * @returns {string[]}
 */
export function configuredConstructionIds() {
  return Object.keys(_CONSTRUCTION_DIMENSIONS).sort();
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const Dimensions = Object.freeze({
  extractDimensions,
  dimensionsStats,
  isCharacterVoice,
  configuredConstructionIds,
});