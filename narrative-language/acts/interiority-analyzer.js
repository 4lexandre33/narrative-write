/**
 * @file interiority-analyzer.js
 * @module narrative-language/acts
 * @description Análise dedicada de interioridade. Detecta verbos e
 *              construções que dão acesso à vida interna de uma
 *              consciência: emoções, sensações, pensamentos, desejos,
 *              intenções, memórias, imaginação, crenças, dúvidas,
 *              expectativas, percepção subjetiva.
 * @imports narrative-language/ir/schema,
 *          narrative-language/pt-br/lexicon
 * @importedBy narrative-language/acts/classifier,
 *             narrative-language/pipeline/interpreter (via hints)
 * @level N3
 *
 * Contrato:
 *   analyzeInteriority(model, resolution, ctx) → InteriorityResult
 *   interiorityStats(result)                   → Object
 *   listCategories()                           → string[]
 *
 * InteriorityResult shape:
 *   {
 *     acts: InteriorityAct[],   — pode ser vazio
 *     primary: InteriorityAct|null,
 *     confidence: number,       — confiança agregada
 *   }
 *
 * InteriorityAct shape:
 *   {
 *     category: string,        — ver INTERIORITY_CATEGORIES
 *     holder: string|null,     — quem experiencia
 *     holderId: string|null,   — entityId (se resolver)
 *     content: string|null,    — sobre o quê
 *     verb: string,            — lemma do verbo
 *     surface: string,         — verbo como aparece
 *     confidence: number,
 *     evidence: Evidence[],
 *   }
 *
 * Determinismo: nenhuma chamada a Math.random/wall-clock. Nunca lança.
 */

import { classOf as lexClassOf, lookupLemma } from '../pt-br/lexicon.js';

// ══════════════════════════════════════════════════════════════
// CATEGORIAS
// ══════════════════════════════════════════════════════════════

/**
 * Categorias canônicas de interioridade.
 * @type {ReadonlyArray<string>}
 */
export const INTERIORITY_CATEGORIES = Object.freeze([
  'emotion',
  'sensation',
  'thought',
  'desire',
  'intention',
  'memory',
  'imagination',
  'belief',
  'doubt',
  'expectation',
  'subjective-perception',
]);

/**
 * Léxico curado: lema do verbo → categoria de interioridade.
 * Cada verbo tem peso próprio (0..1) indicando a força do sinal.
 *
 * @type {Readonly<Object<string, { category:string, weight:number }>>}
 * @private
 */
const _INTERIORITY_VERBS = Object.freeze({
  // ── Emoção ─────────────────────────────────────────────
  'amar':       { category: 'emotion', weight: 0.95 },
  'odiar':      { category: 'emotion', weight: 0.95 },
  'temer':      { category: 'emotion', weight: 0.95 },
  'gostar':     { category: 'emotion', weight: 0.90 },
  'detestar':   { category: 'emotion', weight: 0.90 },
  'sofrer':     { category: 'emotion', weight: 0.90 },
  'alegrar':    { category: 'emotion', weight: 0.88 },
  'entristecer':{ category: 'emotion', weight: 0.88 },
  'confiar':    { category: 'emotion', weight: 0.85 },
  'desconfiar': { category: 'emotion', weight: 0.85 },

  // ── Sensação ───────────────────────────────────────────
  'sentir':     { category: 'sensation', weight: 0.85 },
  'doer':       { category: 'sensation', weight: 0.90 },
  'arder':      { category: 'sensation', weight: 0.88 },
  'tremer':     { category: 'sensation', weight: 0.85 },

  // ── Pensamento ─────────────────────────────────────────
  'pensar':     { category: 'thought', weight: 0.85 },
  'refletir':   { category: 'thought', weight: 0.88 },
  'cogitar':    { category: 'thought', weight: 0.88 },
  'considerar': { category: 'thought', weight: 0.82 },
  'ponderar':   { category: 'thought', weight: 0.85 },

  // ── Desejo ─────────────────────────────────────────────
  'querer':     { category: 'desire', weight: 0.95 },
  'desejar':    { category: 'desire', weight: 0.95 },
  'pretender':  { category: 'desire', weight: 0.90 },
  'ansiar':     { category: 'desire', weight: 0.88 },
  'almejar':    { category: 'desire', weight: 0.88 },

  // ── Intenção ───────────────────────────────────────────
  'decidir':    { category: 'intention', weight: 0.88 },
  'planejar':   { category: 'intention', weight: 0.90 },
  'tencionar':  { category: 'intention', weight: 0.88 },
  'intencionar':{ category: 'intention', weight: 0.85 },

  // ── Memória ────────────────────────────────────────────
  'lembrar':    { category: 'memory', weight: 0.92 },
  'recordar':   { category: 'memory', weight: 0.92 },
  'esquecer':   { category: 'memory', weight: 0.90 },
  'relembrar':  { category: 'memory', weight: 0.90 },

  // ── Imaginação ─────────────────────────────────────────
  'imaginar':   { category: 'imagination', weight: 0.90 },
  'fantasiar':  { category: 'imagination', weight: 0.90 },
  'sonhar':     { category: 'imagination', weight: 0.85 },

  // ── Crença ─────────────────────────────────────────────
  'achar':      { category: 'belief', weight: 0.88 },
  'acreditar':  { category: 'belief', weight: 0.90 },
  'crer':       { category: 'belief', weight: 0.88 },
  'supor':      { category: 'belief', weight: 0.85 },
  'julgar':     { category: 'belief', weight: 0.85 },

  // ── Dúvida ─────────────────────────────────────────────
  'duvidar':    { category: 'doubt', weight: 0.90 },
  'questionar': { category: 'doubt', weight: 0.82 },
  'hesitar':    { category: 'doubt', weight: 0.85 },

  // ── Expectativa ────────────────────────────────────────
  'esperar':    { category: 'expectation', weight: 0.85 },
  'aguardar':   { category: 'expectation', weight: 0.82 },
  'prever':     { category: 'expectation', weight: 0.85 },
  'antever':    { category: 'expectation', weight: 0.85 },

  // ── Percepção subjetiva ────────────────────────────────
  'parecer':    { category: 'subjective-perception', weight: 0.85 },
  'aparentar':  { category: 'subjective-perception', weight: 0.82 },
});

/**
 * Verbos que podem ser ambíguos entre categorias. A resolução depende
 * do tipo do objeto — ver `_resolveCategoryAmbiguity`.
 * @type {ReadonlyArray<string>}
 * @private
 */
const _AMBIGUOUS_VERBS = Object.freeze(['sentir', 'ver', 'ouvir']);

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function _mkEvidence(source, value, reason, weight) {
  return {
    source: String(source ?? ''),
    value: String(value ?? ''),
    reason: String(reason ?? ''),
    weight: Math.max(0, Math.min(1, weight)),
  };
}

function _norm(s) {
  return String(s ?? '').trim().toLowerCase();
}

/**
 * Resolve ambiguidade de verbos como `sentir` pelo tipo do objeto.
 *
 * @param {string} lemma
 * @param {Object|null} objectRef
 * @returns {string} — categoria resolvida
 * @private
 */
function _resolveCategoryAmbiguity(lemma, objectRef) {
  const entry = _INTERIORITY_VERBS[lemma];
  if (!entry) return 'thought';

  // Só resolve se for um verbo ambíguo
  if (!_AMBIGUOUS_VERBS.includes(lemma)) return entry.category;

  if (!objectRef) return entry.category;

  const objClass = objectRef.class ?? lexClassOf(objectRef.lemma ?? '');
  if (objClass === 'emotion') return 'emotion';
  if (objClass === 'sensation') return 'sensation';
  if (objClass === 'body-part') return 'sensation';
  if (objClass === 'object' || objClass === 'place') {
    return 'subjective-perception';
  }

  // Default: sensação (categoria mais comum para "sentir")
  return entry.category;
}

/**
 * Tenta resolver um nome para entityId usando `resolution`.
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
// DETECÇÃO POR TOKEN
// ══════════════════════════════════════════════════════════════

/**
 * Varre tokens e encontra cada verbo de interioridade.
 * Produz um ato por ocorrência, com holder extraído do sujeito mais
 * próximo à esquerda do verbo.
 *
 * @param {Object} model
 * @param {Object} resolution
 * @returns {Array<Object>}
 * @private
 */
function _detectByTokens(model, resolution) {
  const out = [];
  const tokens = Array.isArray(model.tokens) ? model.tokens : [];
  const objects = Array.isArray(model.objects) ? model.objects : [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.pos !== 'VERB') continue;

    const lemma = _norm(t.lemma ?? t.text ?? '');
    const entry = _INTERIORITY_VERBS[lemma];
    if (!entry) continue;

    // ── Encontra holder (sujeito mais próximo à esquerda) ──
    let holder = null;
    let holderTokenIdx = -1;
    for (let j = i - 1; j >= 0; j--) {
      const cand = tokens[j];
      if (!cand) continue;
      if (cand.pos === 'PROPN' || cand.pos === 'NOUN' || cand.pos === 'PRON') {
        holder = cand.text;
        holderTokenIdx = j;
        break;
      }
      // Para depois de um verbo (outra oração)
      if (cand.pos === 'VERB') break;
    }

    // Se não achou holder à esquerda, tenta o sujeito global
    if (!holder && model.subject?.surface) {
      holder = model.subject.surface;
    }

    // ── Encontra objeto (o conteúdo experienciado) ────────
    let content = null;
    let objectRef = null;
    for (let j = i + 1; j < tokens.length; j++) {
      const cand = tokens[j];
      if (!cand) continue;
      if (cand.pos === 'NOUN' || cand.pos === 'PROPN') {
        content = cand.text;
        objectRef = {
          lemma: cand.lemma,
          class: lexClassOf(cand.lemma ?? ''),
        };
        break;
      }
      // Verbo no meio quebra a busca (oração seguinte)
      if (cand.pos === 'VERB') break;
      if (cand.pos === 'PUNCT') break;
    }

    // Se não achou token, tenta usar o primeiro objeto do modelo
    if (!content && objects.length > 0) {
      const obj = objects[0];
      content = obj.surface;
      objectRef = { lemma: obj.lemma, class: obj.class };
    }

    // ── Resolve categoria (pode ser ambígua) ──────────────
    const category = _resolveCategoryAmbiguity(lemma, objectRef);

    // ── Constrói evidências ───────────────────────────────
    const evidence = [
      _mkEvidence(
        'lexicon',
        lemma,
        `verbo de interioridade "${lemma}" → ${category}`,
        entry.weight
      ),
    ];

    if (holder) {
      const holderId = _resolveName(holder, resolution);
      evidence.push(_mkEvidence(
        'syntax',
        holder,
        `holder extraído do sujeito próximo`,
        holderId ? 0.90 : 0.65
      ));
    }

    if (objectRef?.class) {
      evidence.push(_mkEvidence(
        'lexicon',
        objectRef.class,
        `classe do objeto "${objectRef.class}"`,
        0.75
      ));
    }

    // ── Confiança ─────────────────────────────────────────
    let confidence = entry.weight;
    if (!holder) confidence = Math.min(confidence, 0.65);
    if (!content) confidence = Math.min(confidence, 0.72);
    if (_AMBIGUOUS_VERBS.includes(lemma) && !objectRef?.class) {
      confidence = Math.min(confidence, 0.70);
    }

    out.push({
      category,
      holder: holder || null,
      holderId: holder ? _resolveName(holder, resolution) : null,
      content: content || null,
      verb: lemma,
      surface: t.text,
      confidence: Math.round(confidence * 100) / 100,
      evidence,
    });
  }

  return out;
}

// ══════════════════════════════════════════════════════════════
// DETECÇÃO POR CONSTRUCTION
// ══════════════════════════════════════════════════════════════

/**
 * Mapeamento de construction ID → categoria de interioridade.
 * @type {Readonly<Object<string, string>>}
 * @private
 */
const _CONSTRUCTION_CATEGORY = Object.freeze({
  'x-sentiu-y':      'sensation',
  'x-queria-y':      'desire',
  'x-lembrou-de-y':  'memory',
  'x-sabia-que-y':   'thought',
  'x-achava-que-y':  'belief',
  'maybe-error':     'doubt',
  'para-x-parecia-y':'subjective-perception',
  'para-x-y-era-z':  'subjective-perception',
});

/**
 * Detecta interioridade via construction reconhecida.
 * Devolve um ato sintético com base nos grupos capturados.
 *
 * @param {Object} model
 * @param {Object} resolution
 * @returns {Object|null}
 * @private
 */
function _detectByConstruction(model, resolution) {
  const construction = model?.construction;
  if (!construction || typeof construction.id !== 'string') return null;

  const category = _CONSTRUCTION_CATEGORY[construction.id];
  if (!category) return null;

  const g = construction.groups ?? {};
  const holder = g.experiencer ?? g.holder ?? g.focalizer ?? null;
  const content = g.object ?? g.proposition ?? g.content ?? null;

  const evidence = [
    _mkEvidence(
      'construction',
      construction.id,
      `construção reconhecida → ${category}`,
      typeof construction.confidence === 'number'
        ? construction.confidence
        : 0.90
    ),
  ];

  if (holder) {
    evidence.push(_mkEvidence(
      'syntax',
      holder,
      'holder extraído da construction',
      _resolveName(holder, resolution) ? 0.92 : 0.70
    ));
  }

  let confidence = typeof construction.confidence === 'number'
    ? construction.confidence
    : 0.90;
  if (!holder) confidence = Math.min(confidence, 0.70);

  return {
    category,
    holder: holder || null,
    holderId: holder ? _resolveName(holder, resolution) : null,
    content: content || null,
    verb: construction.id,
    surface: construction.id,
    confidence: Math.round(confidence * 100) / 100,
    evidence,
  };
}

// ══════════════════════════════════════════════════════════════
// DEDUPLICAÇÃO
// ══════════════════════════════════════════════════════════════

/**
 * Deduplica atos por (category, verb, holder).
 * Se houver duplicata, mantém o de maior confiança.
 *
 * @param {Array} acts
 * @returns {Array}
 * @private
 */
function _dedupe(acts) {
  const seen = new Map();
  for (const a of acts) {
    if (!a) continue;
    const key = `${a.category}|${a.verb}|${_norm(a.holder ?? '')}`;
    const existing = seen.get(key);
    if (!existing || a.confidence > existing.confidence) {
      seen.set(key, a);
    }
  }
  return Array.from(seen.values());
}

// ══════════════════════════════════════════════════════════════
// API PÚBLICA
// ══════════════════════════════════════════════════════════════

/**
 * Analisa a interioridade de um modelo linguístico.
 *
 * Combina detecção por tokens (varredura) com detecção por construction
 * (padrões reconhecidos) e deduplica.
 *
 * @param {Object} model
 * @param {Object} resolution
 * @param {Object} [ctx={}]
 * @returns {{
 *   acts: Array<Object>,
 *   primary: Object|null,
 *   confidence: number,
 * }}
 */
export function analyzeInteriority(model, resolution, ctx = {}) {
  const empty = { acts: [], primary: null, confidence: 0 };
  if (!model || typeof model !== 'object') return empty;

  const byTokens = _detectByTokens(model, resolution);
  const byConstruction = _detectByConstruction(model, resolution);

  const combined = [
    ...byTokens,
    ...(byConstruction ? [byConstruction] : []),
  ];

  if (combined.length === 0) return empty;

  const acts = _dedupe(combined);

  // Ordena por confiança desc (determinismo via secundário)
  acts.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return String(a.verb).localeCompare(String(b.verb));
  });

  const primary = acts[0] ?? null;

  // Confiança agregada: média das confianças dos atos
  const confidence = Math.round(
    (acts.reduce((s, a) => s + a.confidence, 0) / acts.length) * 100
  ) / 100;

  return { acts, primary, confidence };
}

/**
 * Devolve estatísticas do resultado de interioridade.
 * @param {Object} result
 * @returns {Object}
 */
export function interiorityStats(result) {
  if (!result || !Array.isArray(result.acts)) {
    return { count: 0, categories: [], avgConfidence: 0 };
  }
  const cats = new Set();
  let sum = 0;
  for (const a of result.acts) {
    cats.add(a.category);
    sum += a.confidence ?? 0;
  }
  return {
    count: result.acts.length,
    categories: Array.from(cats).sort(),
    avgConfidence: result.acts.length > 0
      ? Math.round((sum / result.acts.length) * 100) / 100
      : 0,
    hasPrimary: result.primary !== null,
  };
}

/**
 * Verifica se há interioridade detectável.
 * @param {Object} model
 * @param {Object} resolution
 * @param {Object} [ctx={}]
 * @returns {boolean}
 */
export function hasInteriority(model, resolution, ctx = {}) {
  return analyzeInteriority(model, resolution, ctx).acts.length > 0;
}

/**
 * Lista os lemas de verbo reconhecidos.
 * @returns {string[]}
 */
export function listInteriorityVerbs() {
  return Object.keys(_INTERIORITY_VERBS).sort();
}

/**
 * Devolve a categoria associada a um lemma, ou null.
 * @param {string} lemma
 * @returns {string|null}
 */
export function categoryFor(lemma) {
  const key = _norm(lemma);
  const entry = _INTERIORITY_VERBS[key];
  return entry?.category ?? null;
}

/**
 * Devolve o peso associado a um lemma, ou 0.
 * @param {string} lemma
 * @returns {number}
 */
export function weightFor(lemma) {
  const key = _norm(lemma);
  const entry = _INTERIORITY_VERBS[key];
  return entry?.weight ?? 0;
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const InteriorityAnalyzer = Object.freeze({
  INTERIORITY_CATEGORIES,
  analyzeInteriority,
  interiorityStats,
  hasInteriority,
  listInteriorityVerbs,
  categoryFor,
  weightFor,
});