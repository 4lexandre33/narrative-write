/**
 * @file focalization-analyzer.js
 * @module narrative-language/acts
 * @description Análise dedicada de focalização. Detecta marcadores
 *              explícitos ("Para X", "segundo X"), marcadores verbais
 *              ("X achava que", "X viu que") e construções compostas
 *              ("Para João, a sala parecia enorme"). Produz um objeto
 *              de focalização com evidências rastreáveis.
 * @imports narrative-language/ir/schema,
 *          narrative-language/pt-br/lexicon
 * @importedBy narrative-language/acts/classifier,
 *             narrative-language/pipeline/interpreter (via hints),
 *             narrative-language/acts/dimensions (potencial)
 * @level N3
 *
 * Contrato:
 *   analyzeFocalization(model, resolution, ctx) → Focalization|null
 *   extractFocalizationMarkers(sentence)        → Marker[]
 *   listFocalizationMarkers()                   → string[]
 *
 * Focalization shape:
 *   {
 *     kind: 'character' | 'narrator' | 'external' | 'omniscient',
 *     targetId: string|null,   — nome ou entityId
 *     targetLemma: string|null,
 *     marker: string|null,     — 'para' | 'segundo' | 'achava' | ...
 *     confidence: number,      — [0, 1]
 *     evidence: Evidence[],
 *     source: 'construction' | 'marker' | 'verb' | 'none',
 *   }
 *
 * Determinismo: nenhuma chamada a Math.random ou wall-clock.
 * Nunca lança.
 */

import { FOCALIZATION_KINDS } from '../ir/schema.js';

// ══════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════

/**
 * Marcadores preposicionais de focalização explícita.
 * A ordem importa: os mais longos casam primeiro.
 * @type {ReadonlyArray<{ pattern:RegExp, marker:string, weight:number }>}
 * @private
 */
const _PREPOSITIONAL_MARKERS = Object.freeze([
  { pattern: /^do\s+ponto\s+de\s+vista\s+de\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)/i,
    marker: 'do ponto de vista de', weight: 0.95 },
  { pattern: /^na\s+perspectiva\s+de\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)/i,
    marker: 'na perspectiva de', weight: 0.94 },
  { pattern: /^de\s+acordo\s+com\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)/i,
    marker: 'de acordo com', weight: 0.92 },
  { pattern: /^para\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\b/i,
    marker: 'para', weight: 0.90 },
  { pattern: /^segundo\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\b/i,
    marker: 'segundo', weight: 0.90 },
  { pattern: /^conforme\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\b/i,
    marker: 'conforme', weight: 0.88 },
]);

/**
 * Verbos de percepção/cognição que introduzem focalização verbal.
 * Cada verbo associa-se a uma categoria de focalização implícita.
 * @type {ReadonlyArray<{ lemma:string, pattern:RegExp, weight:number }>}
 * @private
 */
const _VERBAL_MARKERS = Object.freeze([
  // Cognitivos com crença/opinião — focalização forte
  { lemma: 'achar',       pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(achava|achou|acha)\s+que\b/i,     weight: 0.90 },
  { lemma: 'acreditar',   pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(acreditava|acreditou|acredita)\s+que\b/i, weight: 0.90 },
  { lemma: 'pensar',      pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(pensava|pensou|pensa)\s+que\b/i,   weight: 0.88 },
  { lemma: 'imaginar',    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(imaginava|imaginou|imagina)\s+que\b/i, weight: 0.86 },
  { lemma: 'supor',       pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(supunha|supôs|supõe)\s+que\b/i,   weight: 0.86 },
  { lemma: 'julgar',      pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(julgava|julgou|julga)\s+que\b/i,   weight: 0.86 },
  { lemma: 'duvidar',     pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(duvidava|duvidou|duvida)\s+que\b/i, weight: 0.85 },

  // Percepção visual/auditiva — focalização média
  { lemma: 'ver',         pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(viu|via|vê)\s+que\b/i,       weight: 0.82 },
  { lemma: 'ouvir',       pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(ouviu|ouvia|ouve)\s+que\b/i, weight: 0.82 },
  { lemma: 'notar',       pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(notou|notava|nota)\s+que\b/i, weight: 0.84 },
  { lemma: 'perceber',    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(percebeu|percebia|percebe)\s+que\b/i, weight: 0.84 },
  { lemma: 'observar',    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(observou|observava|observa)\s+que\b/i, weight: 0.82 },

  // Experienciais — focalização forte (a experiência é do experienciador)
  { lemma: 'sentir',      pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(sentiu|sentia|sente)\s+que\b/i, weight: 0.88 },
  { lemma: 'lembrar',     pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(lembrou|lembrava|lembra)\s+que\b/i, weight: 0.84 },

  // Modalização negativa — focalização forte por contraste
  { lemma: 'saber',       pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+n[ãa]o\s+(sabia|soube|sabe)\s+que\b/i, weight: 0.90 },
  { lemma: 'ver',         pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+n[ãa]o\s+(viu|via|vê)\b/i, weight: 0.88 },
]);

/**
 * Palavras de aparência que, sozinhas, indicam percepção subjetiva.
 * @type {ReadonlyArray<string>}
 * @private
 */
const _APPEARANCE_WORDS = Object.freeze([
  'parecer', 'aparentar', 'assemelhar', 'surgir', 'mostrar-se',
]);

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * Cria evidência no formato canônico.
 * @private
 */
function _mkEvidence(source, value, reason, weight) {
  return {
    source,
    value: String(value ?? ''),
    reason: String(reason ?? ''),
    weight: Math.max(0, Math.min(1, weight)),
  };
}

/**
 * Extrai o primeiro token que se parece com um nome próprio.
 * @private
 */
function _looksLikeProperName(s) {
  return /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+$/.test(String(s ?? '').trim());
}

/**
 * Normaliza um nome para comparação (lowercase, trim).
 * @private
 */
function _norm(s) {
  return String(s ?? '').trim().toLowerCase();
}

/**
 * Tenta resolver uma referência nominal para entityId usando `resolution`.
 * Se não encontrar, devolve null (o nome fica como targetId mesmo).
 * @private
 */
function _resolveName(name, resolution) {
  if (!name || !resolution?.references) return null;
  const target = _norm(name);
  for (const ref of resolution.references) {
    if (ref.kind !== 'entity' || !ref.entityId) continue;
    if (_norm(ref.raw) === target || _norm(ref.lemma) === target) {
      return ref.entityId;
    }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════
// EXTRAÇÃO DE MARCADORES
// ══════════════════════════════════════════════════════════════

/**
 * Tenta casar marcadores preposicionais no início da sentença.
 * Devolve o primeiro hit, ou null.
 *
 * @param {string} sentence
 * @returns {{ marker:string, target:string, weight:number }|null}
 * @private
 */
function _matchPrepositional(sentence) {
  const s = String(sentence ?? '').trim();
  if (!s) return null;

  for (const entry of _PREPOSITIONAL_MARKERS) {
    const m = entry.pattern.exec(s);
    if (m && m[1] && _looksLikeProperName(m[1])) {
      return {
        marker: entry.marker,
        target: m[1].trim(),
        weight: entry.weight,
      };
    }
  }
  return null;
}

/**
 * Tenta casar marcadores verbais no início da sentença.
 *
 * @param {string} sentence
 * @returns {{ marker:string, target:string, weight:number }|null}
 * @private
 */
function _matchVerbal(sentence) {
  const s = String(sentence ?? '').trim();
  if (!s) return null;

  for (const entry of _VERBAL_MARKERS) {
    const m = entry.pattern.exec(s);
    if (m && m[1] && _looksLikeProperName(m[1])) {
      return {
        marker: entry.lemma,
        target: m[1].trim(),
        weight: entry.weight,
      };
    }
  }
  return null;
}

/**
 * Detecta percepção subjetiva por aparência: `X parecia Y`, `parecia a X`.
 *
 * @param {Object} model
 * @returns {{ marker:string, target:string|null, weight:number }|null}
 * @private
 */
function _matchAppearance(model) {
  if (!model || typeof model !== 'object') return null;
  const lemma = String(model.predicateLemma ?? '').toLowerCase();
  if (!_APPEARANCE_WORDS.includes(lemma)) return null;

  // Se há focalização prévia via construção, retorna-a
  const g = model.construction?.groups;
  if (g?.focalizer) {
    return {
      marker: 'aparecer-para',
      target: String(g.focalizer),
      weight: 0.90,
    };
  }

  return {
    marker: 'aparecer-generico',
    target: null,
    weight: 0.65,
  };
}

/**
 * Combina construções já reconhecidas com a focalização.
 * @private
 */
function _matchConstruction(model) {
  if (!model?.construction?.groups) return null;
  const g = model.construction.groups;

  const target = g.focalizer ?? g.perceiver ?? g.holder ?? null;
  if (!target) return null;

  return {
    marker: model.construction.id,
    target: String(target),
    weight: typeof model.construction.confidence === 'number'
      ? model.construction.confidence
      : 0.90,
  };
}

// ══════════════════════════════════════════════════════════════
// API PÚBLICA
// ══════════════════════════════════════════════════════════════

/**
 * Extrai marcadores de focalização de uma sentença (sem resolver).
 * Útil para debug e para UI de inspeção.
 *
 * @param {string} sentence
 * @returns {Array<{ source:string, marker:string, target:string|null, weight:number }>}
 */
export function extractFocalizationMarkers(sentence) {
  const out = [];

  const prep = _matchPrepositional(sentence);
  if (prep) out.push({ source: 'prepositional', ...prep });

  const verb = _matchVerbal(sentence);
  if (verb) out.push({ source: 'verbal', ...verb });

  return out;
}

/**
 * Analisa a focalização de um modelo linguístico.
 *
 * Ordem de prioridade (mais forte primeiro):
 *   1. Construction (ex: para-x-parecia-y) — já captura o alvo
 *   2. Marcador verbal explícito (ex: "X achava que")
 *   3. Marcador preposicional explícito (ex: "Para X")
 *   4. Percepção por aparência (ex: "parecia")
 *
 * Devolve `null` se nada for encontrado com confiança mínima.
 *
 * @param {Object} model
 * @param {Object} resolution
 * @param {Object} [ctx={}]
 * @returns {{
 *   kind:string,
 *   targetId:string|null,
 *   targetLemma:string|null,
 *   marker:string|null,
 *   confidence:number,
 *   evidence:Array<{source:string,value:string,reason:string,weight:number}>,
 *   source:string,
 * }|null}
 */
export function analyzeFocalization(model, resolution, ctx = {}) {
  if (!model || typeof model !== 'object') return null;

  const evidence = [];
  let chosen = null;
  let sourceKind = 'none';

  // ── 1. Construction ────────────────────────────────────
  const fromConstruction = _matchConstruction(model);
  if (fromConstruction) {
    chosen = fromConstruction;
    sourceKind = 'construction';
    evidence.push(_mkEvidence(
      'construction',
      fromConstruction.marker,
      'construção com focalizador explícito',
      fromConstruction.weight
    ));
  }

  // ── 2. Marcador verbal (mais forte que preposicional isolada) ──
  const sentenceRaw = model.raw ?? '';
  const fromVerb = _matchVerbal(sentenceRaw);
  if (fromVerb && (!chosen || fromVerb.weight > chosen.weight)) {
    chosen = fromVerb;
    sourceKind = 'verb';
    evidence.push(_mkEvidence(
      'syntax',
      fromVerb.marker,
      `verbo de focalização "${fromVerb.marker}"`,
      fromVerb.weight
    ));
  }

  // ── 3. Marcador preposicional ──────────────────────────
  const fromPrep = _matchPrepositional(sentenceRaw);
  if (fromPrep && (!chosen || fromPrep.weight > chosen.weight)) {
    chosen = fromPrep;
    sourceKind = 'marker';
    evidence.push(_mkEvidence(
      'syntax',
      fromPrep.marker,
      `marcador preposicional "${fromPrep.marker}"`,
      fromPrep.weight
    ));
  }

  // ── 4. Aparência ───────────────────────────────────────
  const fromAppearance = _matchAppearance(model);
  if (fromAppearance && (!chosen)) {
    chosen = fromAppearance;
    sourceKind = 'appearance';
    evidence.push(_mkEvidence(
      'lexicon',
      fromAppearance.marker,
      'verbo de aparência indica percepção subjetiva',
      fromAppearance.weight
    ));
  }

  if (!chosen) return null;

  // ── Resolve o target ───────────────────────────────────
  const targetRaw = chosen.target;
  let targetId = null;
  let targetLemma = null;

  if (targetRaw) {
    const resolved = _resolveName(targetRaw, resolution);
    targetId = resolved ?? targetRaw;      // nome bruto se não resolver
    targetLemma = _norm(targetRaw);

    evidence.push(_mkEvidence(
      'context',
      targetRaw,
      resolved ? 'focalizador resolvido para entidade conhecida'
               : 'focalizador não resolvido — usando nome bruto',
      resolved ? 0.95 : 0.60
    ));
  }

  // ── Determina o `kind` ─────────────────────────────────
  let kind = 'character';
  if (!targetId) {
    kind = 'narrator';   // sem alvo claro → narrador padrão
  }
  if (!FOCALIZATION_KINDS.includes(kind)) {
    kind = 'narrator';
  }

  // ── Confiança agregada ─────────────────────────────────
  let confidence = chosen.weight;
  if (!targetId) confidence = Math.min(confidence, 0.55);

  return {
    kind,
    targetId,
    targetLemma,
    marker: chosen.marker,
    confidence: Math.round(confidence * 100) / 100,
    evidence,
    source: sourceKind,
  };
}

/**
 * Verifica se um modelo tem focalização explícita.
 * Atalho para `analyzeFocalization(...) !== null`.
 *
 * @param {Object} model
 * @param {Object} resolution
 * @param {Object} [ctx={}]
 * @returns {boolean}
 */
export function hasExplicitFocalization(model, resolution, ctx = {}) {
  return analyzeFocalization(model, resolution, ctx) !== null;
}

/**
 * Lista os marcadores preposicionais reconhecidos (para testes e help).
 * @returns {string[]}
 */
export function listFocalizationMarkers() {
  const out = [];
  for (const entry of _PREPOSITIONAL_MARKERS) {
    out.push(entry.marker);
  }
  for (const entry of _VERBAL_MARKERS) {
    if (!out.includes(entry.lemma)) out.push(entry.lemma);
  }
  return out.sort();
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const FocalizationAnalyzer = Object.freeze({
  analyzeFocalization,
  hasExplicitFocalization,
  extractFocalizationMarkers,
  listFocalizationMarkers,
});