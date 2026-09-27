/**
 * @file discourse-analyzer.js
 * @module narrative-language/pipeline
 * @description Análise de relações discursivas entre spans e sentenças.
 *              Detecta sequência, contraste, causa, consequência, tempo,
 *              condição, explicação, concessão, finalidade.
 * @imports narrative-language/pt-br/lexicon
 * @importedBy narrative-language/pipeline/interpreter,
 *             narrative-language/acts/structure-analyzer (F9),
 *             narrative-language/index
 * @level N2
 *
 * Contrato:
 *   analyzeDiscourse(spans, sentences, ctx) → DiscourseRelation[]
 *
 * Determinismo: relações são ordenadas por (fromId asc, kind asc).
 * Duas execuções com a mesma entrada produzem a mesma saída.
 *
 * Nunca lança. Entrada degenerada devolve array vazio.
 */

import { lookupLemma } from '../pt-br/lexicon.js';

// ══════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════

/**
 * Marcadores explícitos de relação discursiva.
 * A ordem importa apenas para debug; matching é por primeiro hit.
 * @type {ReadonlyArray<{ markers:string[], kind:string, confidence:number }>}
 * @private
 */
const _DISCOURSE_MARKERS = Object.freeze([
  // Contraste
  { markers: ['mas', 'porém', 'contudo', 'entretanto', 'todavia'],
    kind: 'contrast', confidence: 0.95 },
  { markers: ['no entanto', 'não obstante', 'em contrapartida', 'por outro lado'],
    kind: 'contrast', confidence: 0.92 },

  // Causa
  { markers: ['porque', 'pois', 'já que', 'visto que', 'posto que'],
    kind: 'cause', confidence: 0.93 },
  { markers: ['por causa de', 'devido a', 'em razão de', 'graças a'],
    kind: 'cause', confidence: 0.90 },

  // Consequência
  { markers: ['portanto', 'logo', 'assim', 'por isso', 'consequentemente'],
    kind: 'consequence', confidence: 0.92 },
  { markers: ['de modo que', 'de forma que', 'tanto que'],
    kind: 'consequence', confidence: 0.88 },

  // Condição
  { markers: ['se', 'caso', 'desde que', 'contanto que', 'a menos que'],
    kind: 'condition', confidence: 0.94 },

  // Tempo
  { markers: ['quando', 'enquanto', 'antes que', 'depois que', 'assim que', 'logo que'],
    kind: 'time', confidence: 0.93 },
  { markers: ['ao mesmo tempo', 'simultaneamente', 'naquele momento'],
    kind: 'time', confidence: 0.88 },

  // Concessão
  { markers: ['embora', 'ainda que', 'mesmo que', 'apesar de', 'se bem que'],
    kind: 'concession', confidence: 0.92 },

  // Finalidade
  { markers: ['para que', 'a fim de que', 'com o objetivo de'],
    kind: 'purpose', confidence: 0.90 },

  // Explicação
  { markers: ['isto é', 'ou seja', 'a saber', 'por exemplo'],
    kind: 'explanation', confidence: 0.85 },

  // Comparação
  { markers: ['como', 'tal como', 'assim como', 'do mesmo modo'],
    kind: 'comparison', confidence: 0.80 },

  // Alternativa
  { markers: ['ou', 'ora', 'quer'],
    kind: 'alternative', confidence: 0.75 },
]);

// ══════════════════════════════════════════════════════════════
// TYPEDEFS
// ══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} DiscourseRelation
 * @property {string} kind
 * @property {string} fromSpanId
 * @property {string} toSpanId
 * @property {string|null} marker
 * @property {number} confidence
 */

// ══════════════════════════════════════════════════════════════
// HELPERS INTERNOS
// ══════════════════════════════════════════════════════════════

/**
 * Procura um marcador discursivo no início (ou muito próximo) de um
 * trecho. Devolve `{ kind, marker, confidence }` ou null.
 *
 * @param {string} text
 * @returns {{ kind:string, marker:string, confidence:number }|null}
 * @private
 */
function _findMarker(text) {
  const lower = String(text ?? '').toLowerCase().trim();
  if (!lower) return null;

  for (const entry of _DISCOURSE_MARKERS) {
    for (const marker of entry.markers) {
      // Marcador no início seguido de espaço ou fim
      if (lower === marker || lower.startsWith(marker + ' ')) {
        return {
          kind: entry.kind,
          marker,
          confidence: entry.confidence,
        };
      }
    }
  }

  return null;
}

/**
 * Consulta o léxico para marcadores do tipo 'discourse'.
 * Complementa a tabela hardcoded com entradas extensíveis.
 *
 * @param {string} text
 * @returns {{ kind:string, marker:string, confidence:number }|null}
 * @private
 */
function _findLexiconMarker(text) {
  const lower = String(text ?? '').toLowerCase().trim();
  if (!lower) return null;

  const firstWord = lower.split(/\s+/)[0];
  const entry = lookupLemma(firstWord);

  if (entry?.type === 'discourse' && entry.relation) {
    return {
      kind: entry.relation,
      marker: firstWord,
      confidence: 0.85,
    };
  }

  return null;
}

/**
 * Determina a relação entre dois spans vizinhos quando nenhum
 * marcador explícito é encontrado.
 *
 * Regras default:
 *   - spans do mesmo pai com relation='subordinate' → 'time' ou 'cause'
 *   - spans do mesmo pai com relation='contrast'    → 'contrast'
 *   - spans do mesmo pai sem relation               → 'sequence'
 *
 * @param {Object} a — span
 * @param {Object} b — span
 * @returns {DiscourseRelation|null}
 * @private
 */
function _inferRelation(a, b) {
  if (!a || !b) return null;

  // Subordinação marcada pelo segmenter
  if (b.relation === 'subordinate') {
    // Olha para o início do span B para adivinhar a natureza
    const bLower = (b.raw ?? '').toLowerCase();
    if (/^(se|caso)\s/.test(bLower)) {
      return { kind: 'condition', fromSpanId: a.id, toSpanId: b.id, marker: null, confidence: 0.75 };
    }
    if (/^(quando|enquanto|antes que|depois que)\s/.test(bLower)) {
      return { kind: 'time', fromSpanId: a.id, toSpanId: b.id, marker: null, confidence: 0.75 };
    }
    if (/^(porque|pois|já que)\s/.test(bLower)) {
      return { kind: 'cause', fromSpanId: a.id, toSpanId: b.id, marker: null, confidence: 0.78 };
    }
    if (/^(embora|ainda que|mesmo que)\s/.test(bLower)) {
      return { kind: 'concession', fromSpanId: a.id, toSpanId: b.id, marker: null, confidence: 0.75 };
    }
    return { kind: 'time', fromSpanId: a.id, toSpanId: b.id, marker: null, confidence: 0.55 };
  }

  // Contraste marcado pelo segmenter
  if (b.relation === 'contrast') {
    return { kind: 'contrast', fromSpanId: a.id, toSpanId: b.id, marker: null, confidence: 0.80 };
  }

  // Default
  return { kind: 'sequence', fromSpanId: a.id, toSpanId: b.id, marker: null, confidence: 0.60 };
}

/**
 * Ordena relações de forma estável.
 * @param {DiscourseRelation[]} rels
 * @returns {DiscourseRelation[]}
 * @private
 */
function _sortRelations(rels) {
  return [...rels].sort((a, b) => {
    if (a.fromSpanId !== b.fromSpanId) return a.fromSpanId.localeCompare(b.fromSpanId);
    if (a.toSpanId !== b.toSpanId) return a.toSpanId.localeCompare(b.toSpanId);
    return a.kind.localeCompare(b.kind);
  });
}

// ══════════════════════════════════════════════════════════════
// ANÁLISE DENTRO DE UMA SENTENÇA
// ══════════════════════════════════════════════════════════════

/**
 * Analisa relações entre spans da mesma sentença.
 *
 * @param {Array} spans — Span[] da mesma sentença
 * @returns {DiscourseRelation[]}
 * @private
 */
function _analyzeWithinSentence(spans) {
  const out = [];
  if (!Array.isArray(spans) || spans.length < 2) return out;

  // Ordena spans por id para garantir progressão lógica
  const sorted = [...spans].sort((a, b) => a.id.localeCompare(b.id));

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];

    // Tenta marcador explícito no início do span B
    const marker = _findMarker(b.raw) ?? _findLexiconMarker(b.raw);
    if (marker) {
      out.push({
        kind: marker.kind,
        fromSpanId: a.id,
        toSpanId: b.id,
        marker: marker.marker,
        confidence: marker.confidence,
      });
      continue;
    }

    // Inferência
    const rel = _inferRelation(a, b);
    if (rel) out.push(rel);
  }

  return out;
}

// ══════════════════════════════════════════════════════════════
// ANÁLISE ENTRE SENTENÇAS
// ══════════════════════════════════════════════════════════════

/**
 * Analisa relações entre sentenças consecutivas.
 *
 * @param {Array} sentences
 * @returns {DiscourseRelation[]}
 * @private
 */
function _analyzeBetweenSentences(sentences) {
  const out = [];
  if (!Array.isArray(sentences) || sentences.length < 2) return out;

  for (let i = 0; i < sentences.length - 1; i++) {
    const a = sentences[i];
    const b = sentences[i + 1];

    // Tenta marcador explícito no início da sentença B
    const marker = _findMarker(b.raw) ?? _findLexiconMarker(b.raw);
    if (marker) {
      out.push({
        kind: marker.kind,
        fromSpanId: `${a.id}.1`,
        toSpanId: `${b.id}.1`,
        marker: marker.marker,
        confidence: marker.confidence,
      });
      continue;
    }

    // Default: sequência
    out.push({
      kind: 'sequence',
      fromSpanId: `${a.id}.1`,
      toSpanId: `${b.id}.1`,
      marker: null,
      confidence: 0.55,
    });
  }

  return out;
}

// ══════════════════════════════════════════════════════════════
// API PRINCIPAL
// ══════════════════════════════════════════════════════════════

/**
 * Analisa relações discursivas.
 *
 * Aceita duas formas de chamada:
 *   analyzeDiscourse({ sentences, spans }, ctx)
 *   analyzeDiscourse(spans, sentences, ctx)
 *
 * @param {Object|Array} input
 * @param {Array} [sentences] — se input é array de spans
 * @param {Object} [ctx={}]
 * @returns {DiscourseRelation[]}
 */
export function analyzeDiscourse(input, sentences, ctx = {}) {
  let spans = [];
  let sentencesList = [];

  // Forma 1: objeto { sentences, spans }
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    spans = Array.isArray(input.spans) ? input.spans : [];
    sentencesList = Array.isArray(input.sentences) ? input.sentences : [];
  } else {
    // Forma 2: (spans, sentences, ctx)
    spans = Array.isArray(input) ? input : [];
    sentencesList = Array.isArray(sentences) ? sentences : [];
  }

  const relations = [];

  // ── Análise 1: dentro de cada sentença ─────────────────
  const bySentence = new Map();
  for (const span of spans) {
    if (!span || typeof span.id !== 'string') continue;
    const sentenceId = span.id.split('.')[0];
    if (!bySentence.has(sentenceId)) bySentence.set(sentenceId, []);
    bySentence.get(sentenceId).push(span);
  }

  for (const [, group] of bySentence) {
    const rels = _analyzeWithinSentence(group);
    relations.push(...rels);
  }

  // ── Análise 2: entre sentenças consecutivas ────────────
  if (sentencesList.length >= 2) {
    const rels = _analyzeBetweenSentences(sentencesList);
    relations.push(...rels);
  }

  // ── Deduplicação (mesma from/to/kind) ──────────────────
  const seen = new Set();
  const deduped = [];
  for (const r of relations) {
    const key = `${r.fromSpanId}->${r.toSpanId}:${r.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }

  return _sortRelations(deduped);
}

/**
 * Devolve estatísticas de análise discursiva.
 * @param {DiscourseRelation[]} rels
 * @returns {Object}
 */
export function discourseStats(rels) {
  if (!Array.isArray(rels) || rels.length === 0) {
    return { total: 0, byKind: {}, avgConfidence: 0 };
  }
  const byKind = {};
  let sumConf = 0;
  for (const r of rels) {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    sumConf += r.confidence ?? 0;
  }
  return {
    total: rels.length,
    byKind,
    avgConfidence: Math.round((sumConf / rels.length) * 100) / 100,
  };
}

/**
 * Devolve os tipos de relação reconhecidos.
 * @returns {string[]}
 */
export function listRelationKinds() {
  const set = new Set();
  for (const entry of _DISCOURSE_MARKERS) set.add(entry.kind);
  set.add('sequence');
  return Array.from(set).sort();
}

/**
 * Devolve todos os marcadores conhecidos para um tipo de relação.
 * @param {string} kind
 * @returns {string[]}
 */
export function markersFor(kind) {
  const out = [];
  for (const entry of _DISCOURSE_MARKERS) {
    if (entry.kind === kind) out.push(...entry.markers);
  }
  return out;
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const DiscourseAnalyzer = Object.freeze({
  analyzeDiscourse,
  discourseStats,
  listRelationKinds,
  markersFor,
});