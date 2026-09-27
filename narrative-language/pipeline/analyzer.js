/**
 * @file analyzer.js
 * @module narrative-language/pipeline
 * @description Análise linguística completa de uma sentença: extrai
 *              sujeito, predicado, objetos, complementos, papéis semânticos,
 *              tempo, aspecto, modalidade, negação e voz.
 * @imports narrative-language/pt-br/lexicon,
 *          narrative-language/pt-br/constructions,
 *          narrative-language/ir/schema
 * @importedBy narrative-language/pipeline/interpreter,
 *             narrative-language/acts/dimensions,
 *             narrative-language/acts/classifier,
 *             narrative-language/index
 * @level N2
 *
 * Fase 10 — LUME: enriquecido com
 *   - `_detectAbsoluteMarkers`: marcadores temporais absolutos e relativos
 *     (`ontem`, `anos antes`, `mais tarde`, `de repente`, `durante`, ...).
 *   - `_detectAspect` expandido: 6 categorias completas (concluded, ongoing,
 *     habitual, durative, iterative, punctual).
 *   - `_detectModality` expandido: detecção composta (poder + tentar,
 *     poder + conseguir) e verbos de intenção.
 *   - Model ganha campo `absoluteMarkers` (array de marcadores com posição).
 *
 * Nunca lança. Em entrada degenerada, devolve modelo vazio mas válido.
 */

import {
  Lexicon,
  typeOf as lexTypeOf,
  classOf as lexClassOf,
  variantFor as lexVariantFor,
} from '../pt-br/lexicon.js';
import { matchConstruction } from '../pt-br/constructions.js';
import {
  SEMANTIC_ROLES,
  ASPECT_KINDS,
  MODALITY_KINDS,
  NEGATION_KINDS,
} from '../ir/schema.js';

// ══════════════════════════════════════════════════════════════
// CONSTANTES INTERNAS
// ══════════════════════════════════════════════════════════════

const _SUBJECT_POS = Object.freeze(['PROPN', 'NOUN', 'PRON']);
const _OBJECT_POS = Object.freeze(['PROPN', 'NOUN']);

const _NEG_MARKERS = Object.freeze([
  'não', 'nao', 'nunca', 'jamais', 'nem', 'tampouco', 'sequer',
]);

/**
 * Modalizadores adverbiais.
 * @type {ReadonlyArray<{lemma:string, modality:string}>}
 */
const _MODAL_ADVERBS = Object.freeze([
  { lemma: 'talvez',         modality: 'possibility' },
  { lemma: 'provavelmente',  modality: 'probability' },
  { lemma: 'possivelmente',  modality: 'possibility' },
  { lemma: 'certamente',     modality: 'certainty' },
  { lemma: 'decerto',        modality: 'certainty' },
  { lemma: 'porventura',     modality: 'doubt' },
  { lemma: 'acaso',          modality: 'doubt' },
]);

/**
 * Verbos modais. A ordem importa quando múltiplos verbos aparecem.
 * Os mais específicos vêm primeiro.
 * @type {ReadonlyArray<{lemma:string, modality:string}>}
 */
const _MODAL_VERBS = Object.freeze([
  // Intenção (L5 — mais específico)
  { lemma: 'pretender',   modality: 'intention' },
  { lemma: 'tencionar',   modality: 'intention' },
  { lemma: 'intencionar', modality: 'intention' },
  { lemma: 'planejar',    modality: 'intention' },
  { lemma: 'decidir',     modality: 'intention' },

  // Tentativa / capacidade
  { lemma: 'tentar',      modality: 'attempt' },
  { lemma: 'conseguir',   modality: 'capability' },

  // Possibilidade / obrigação / desejo
  { lemma: 'poder',       modality: 'possibility' },
  { lemma: 'dever',       modality: 'obligation' },
  { lemma: 'querer',      modality: 'desire' },
  { lemma: 'desejar',     modality: 'desire' },
  { lemma: 'saber',       modality: 'capability' },
]);

/**
 * Verbos de aproximação subjetiva.
 * @type {ReadonlyArray<string>}
 */
const _APPEARANCE_VERBS = Object.freeze([
  'parecer', 'aparentar', 'assemelhar',
]);

/**
 * Marcadores temporais absolutos e relativos.
 * Extraídos como array com posição no texto original.
 * @type {ReadonlyArray<{ pattern:RegExp, kind:string, weight:number }>}
 */
const _TEMPORAL_MARKER_PATTERNS = Object.freeze([
  // Absolutos — presente discursivo
  { pattern: /\bhoje\b/i,                     kind: 'absolute-present', weight: 0.92 },
  { pattern: /\bagora\b/i,                    kind: 'absolute-present', weight: 0.92 },
  { pattern: /\bneste\s+momento\b/i,          kind: 'absolute-present', weight: 0.90 },
  { pattern: /\bontem\b/i,                    kind: 'absolute-past',    weight: 0.92 },
  { pattern: /\bna\s+v[ée]spera\b/i,          kind: 'absolute-past',    weight: 0.90 },
  { pattern: /\bamanh[ãa]\b/i,                kind: 'absolute-future',  weight: 0.92 },

  // Retrospectivos
  { pattern: /\b(anos|d[ée]cadas|s[ée]culos)\s+antes\b/i, kind: 'relative-retrospective', weight: 0.95 },
  { pattern: /\bmuito\s+tempo\s+atr[áa]s\b/i,             kind: 'relative-retrospective', weight: 0.92 },
  { pattern: /\btempo\s+atr[áa]s\b/i,                     kind: 'relative-retrospective', weight: 0.88 },
  { pattern: /\bantes\s+disso\b/i,                        kind: 'relative-retrospective', weight: 0.90 },
  { pattern: /\bantes\s+daquilo\b/i,                      kind: 'relative-retrospective', weight: 0.90 },

  // Antecipatórios
  { pattern: /\bmais\s+tarde\b/i,                                     kind: 'relative-anticipatory', weight: 0.95 },
  { pattern: /\b(anos|d[ée]cadas|s[ée]culos|dias?|meses?)\s+depois\b/i, kind: 'relative-anticipatory', weight: 0.95 },
  { pattern: /\bdepois\s+disso\b/i,                                   kind: 'relative-anticipatory', weight: 0.90 },
  { pattern: /\bdepois\s+daquilo\b/i,                                 kind: 'relative-anticipatory', weight: 0.90 },
  { pattern: /\blogo\s+depois\b/i,                                    kind: 'relative-anticipatory', weight: 0.88 },

  // Simultaneidade
  { pattern: /\benquanto\s+isso\b/i,          kind: 'simultaneous', weight: 0.93 },
  { pattern: /\bao\s+mesmo\s+tempo\b/i,       kind: 'simultaneous', weight: 0.92 },
  { pattern: /\bsimultaneamente\b/i,          kind: 'simultaneous', weight: 0.90 },
  { pattern: /\bnaquele\s+momento\b/i,        kind: 'simultaneous', weight: 0.88 },

  // Aspecto — punctual
  { pattern: /\bde\s+repente\b/i,             kind: 'punctual', weight: 0.88 },
  { pattern: /\bsubitamente\b/i,              kind: 'punctual', weight: 0.88 },
  { pattern: /\bde\s+s[úu]bito\b/i,           kind: 'punctual', weight: 0.88 },
  { pattern: /\bnaquele\s+instante\b/i,       kind: 'punctual', weight: 0.90 },

  // Aspecto — durative
  { pattern: /\bdurante\b/i,                  kind: 'durative', weight: 0.85 },
  { pattern: /\bao\s+longo\s+de\b/i,          kind: 'durative', weight: 0.88 },

  // Aspecto — habitual
  { pattern: /\bsempre\b/i,                   kind: 'habitual', weight: 0.85 },
  { pattern: /\bcostumeiramente\b/i,          kind: 'habitual', weight: 0.88 },
  { pattern: /\bhabitualmente\b/i,            kind: 'habitual', weight: 0.88 },
  { pattern: /\btodas\s+as\s+(noites|manh[ãa]s|tardes|vezes)\b/i, kind: 'habitual', weight: 0.90 },
  { pattern: /\btodos\s+os\s+(dias|meses|anos)\b/i,               kind: 'habitual', weight: 0.90 },

  // Aspecto — iterative
  { pattern: /\bde\s+novo\b/i,                kind: 'iterative', weight: 0.88 },
  { pattern: /\boutra\s+vez\b/i,              kind: 'iterative', weight: 0.88 },
  { pattern: /\brepetidamente\b/i,            kind: 'iterative', weight: 0.90 },
  { pattern: /\btornou\s+a\b/i,               kind: 'iterative', weight: 0.85 },
  { pattern: /\bvoltou\s+a\b/i,               kind: 'iterative', weight: 0.85 },
]);

// ══════════════════════════════════════════════════════════════
// TYPEDEFS
// ══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} SubjectRef
 * @property {string} surface
 * @property {string} lemma
 * @property {string} pos
 * @property {number} tokenIndex
 */

/**
 * @typedef {Object} ObjectRef
 * @property {string} surface
 * @property {string} lemma
 * @property {string} pos
 * @property {string|null} class
 * @property {number} tokenIndex
 */

/**
 * @typedef {Object} TemporalMarker
 * @property {string} marker
 * @property {string} kind
 * @property {number} weight
 * @property {number} position
 */

/**
 * @typedef {Object} LinguisticModel
 * @property {string} sentenceId
 * @property {string} raw
 * @property {SubjectRef|null} subject
 * @property {string|null} predicate
 * @property {string|null} predicateLemma
 * @property {ObjectRef[]} objects
 * @property {Object<string, any>} complements
 * @property {string|null} tense
 * @property {string|null} aspect
 * @property {string|null} modality
 * @property {string|null} negation
 * @property {Object<string, string>} semanticRoles
 * @property {'active'|'passive'|'reflexive'} voice
 * @property {Object|null} construction
 * @property {TemporalMarker[]} absoluteMarkers   — Fase 10
 * @property {Array<Object>} tokens
 * @property {Array<Object>} diagnostics
 */

// ══════════════════════════════════════════════════════════════
// UTILITÁRIOS INTERNOS
// ══════════════════════════════════════════════════════════════

function _isPunct(t) {
  return t && t.pos === 'PUNCT';
}

function _findFirstVerb(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].pos === 'VERB') return i;
  }
  return -1;
}

function _findLastVerb(tokens) {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].pos === 'VERB') return i;
  }
  return -1;
}

function _canBeSubject(t) {
  return _SUBJECT_POS.includes(t.pos);
}

function _canBeObject(t) {
  return _OBJECT_POS.includes(t.pos);
}

function _skipBackDeterminers(tokens, endIdx) {
  let i = endIdx;
  while (i > 0 && (tokens[i - 1].pos === 'DET' || tokens[i - 1].pos === 'ADP')) i--;
  return i;
}

function _detectSubject(tokens, verbIdx) {
  if (verbIdx <= 0) {
    for (let i = verbIdx + 1; i < tokens.length; i++) {
      if (_canBeSubject(tokens[i])) {
        return _mkSubjectRef(tokens[i], i);
      }
    }
    return null;
  }

  for (let i = verbIdx - 1; i >= 0; i--) {
    const t = tokens[i];
    if (_isPunct(t)) continue;
    if (t.pos === 'DET' || t.pos === 'ADP' || t.pos === 'CCONJ' || t.pos === 'SCONJ') continue;
    if (_canBeSubject(t)) {
      return _mkSubjectRef(t, i);
    }
  }
  return null;
}

function _mkSubjectRef(token, index) {
  return {
    surface: token.text,
    lemma: token.lemma,
    pos: token.pos,
    tokenIndex: index,
  };
}

function _detectObjects(tokens, verbIdx) {
  const out = [];
  let i = verbIdx + 1;

  while (i < tokens.length) {
    const t = tokens[i];
    if (_isPunct(t)) break;

    if (t.pos === 'DET' || t.pos === 'ADP') { i++; continue; }
    if (t.pos === 'VERB') break;

    if (_canBeObject(t)) {
      out.push(_mkObjectRef(t, i));
      i++;
      continue;
    }

    if (t.pos === 'ADJ') { i++; continue; }

    i++;
  }

  return out;
}

function _mkObjectRef(token, index) {
  const cls = lexClassOf(token.lemma) ?? null;
  return {
    surface: token.text,
    lemma: token.lemma,
    pos: token.pos,
    class: cls,
    tokenIndex: index,
  };
}

function _mapSemanticRoles(subject, predicateLemma, objects) {
  const roles = {};
  if (!predicateLemma) {
    if (subject) roles.agent = subject.lemma;
    return roles;
  }

  const entry = Lexicon.lookupLemma(predicateLemma);

  if (!entry) {
    if (subject) roles.agent = subject.lemma;
    if (objects[0]) roles.theme = objects[0].lemma;
    return roles;
  }

  const expectedRoles = Array.isArray(entry.roles) ? entry.roles : [];

  let variantRole = null;
  if (Array.isArray(entry.variants) && objects[0]?.class) {
    const v = lexVariantFor(predicateLemma, objects[0].class);
    if (v?.role) variantRole = v.role;
  }

  const args = [subject, ...objects].filter(Boolean);
  for (let i = 0; i < args.length; i++) {
    const role = expectedRoles[i];
    if (role && SEMANTIC_ROLES.includes(role)) {
      roles[role] = args[i].lemma;
    }
  }

  if (variantRole && objects[0] && SEMANTIC_ROLES.includes(variantRole)) {
    for (const [k, v] of Object.entries(roles)) {
      if (v === objects[0].lemma && k !== variantRole) delete roles[k];
    }
    roles[variantRole] = objects[0].lemma;
  }

  return roles;
}

function _detectTense(tokens, verbIdx) {
  if (verbIdx < 0) return { tense: null, mood: null };
  const v = tokens[verbIdx];
  const f = v.features ?? {};
  return {
    tense: f.tense ?? null,
    mood: f.mood ?? null,
  };
}

/**
 * Detecta aspecto com 6 categorias.
 *
 * Regras (ordem de precedência):
 *   1. `já` + perfect past → concluded
 *   2. gerúndio (`-ndo`) → ongoing
 *   3. `repetidamente`, `de novo`, `outra vez`, `tornou/voltou a` → iterative
 *   4. `durante`, `por X tempo`, `ao longo de` → durative
 *   5. `de repente`, `subitamente`, `de súbito`, `naquele instante` → punctual
 *   6. `sempre`, `todas/todos`, `costumeiramente`, `habitualmente` → habitual
 *
 * @param {Array} tokens
 * @param {number} verbIdx
 * @returns {string|null}
 */
function _detectAspect(tokens, verbIdx) {
  if (!Array.isArray(tokens) || tokens.length === 0) return null;

  const texts = tokens.map((t) => (t.text ?? '').toLowerCase());
  const lemmas = tokens.map((t) => (t.lemma ?? '').toLowerCase());

  // 1. Concluded: já + perfect past
  const hasJa = texts.includes('já') || texts.includes('ja');
  const v = verbIdx >= 0 ? tokens[verbIdx] : null;
  const isPerfectPast = v?.features?.tense === 'past' &&
    v.features?.aspect !== 'ongoing' &&
    !(v.text ?? '').toLowerCase().endsWith('va');

  if (hasJa && isPerfectPast) return 'concluded';

  // 2. Ongoing: gerúndio próximo do verbo
  if (verbIdx >= 0) {
    for (let i = verbIdx; i < tokens.length && i < verbIdx + 4; i++) {
      const txt = (tokens[i].text ?? '').toLowerCase();
      if (txt.endsWith('ndo')) return 'ongoing';
    }
  }

  // 3. Iterative
  if (texts.some((t) => ['repetidamente', 'repetidas'].includes(t))) return 'iterative';
  for (let i = 0; i < texts.length - 1; i++) {
    if (texts[i] === 'de' && texts[i + 1] === 'novo') return 'iterative';
    if (texts[i] === 'outra' && texts[i + 1] === 'vez') return 'iterative';
  }
  for (let i = 0; i < lemmas.length - 1; i++) {
    if ((lemmas[i] === 'tornar' || lemmas[i] === 'voltar') && lemmas[i + 1] === 'a') {
      return 'iterative';
    }
  }

  // 4. Durative
  if (texts.includes('durante')) return 'durative';
  if (texts.includes('longo')) {
    const idx = texts.indexOf('longo');
    if (idx > 0 && texts[idx - 1] === 'ao') return 'durative';
  }
  if (texts.includes('por')) {
    const timeWords = ['hora', 'horas', 'dia', 'dias', 'mês', 'meses',
                       'ano', 'anos', 'semana', 'semanas',
                       'minuto', 'minutos', 'segundo', 'segundos'];
    if (texts.some((t) => timeWords.includes(t))) return 'durative';
  }

  // 5. Punctual
  for (let i = 0; i < texts.length - 1; i++) {
    if (texts[i] === 'de' && texts[i + 1] === 'repente') return 'punctual';
    if (texts[i] === 'de' && texts[i + 1] === 'súbito') return 'punctual';
    if (texts[i] === 'de' && texts[i + 1] === 'subito') return 'punctual';
  }
  if (texts.includes('subitamente')) return 'punctual';
  for (let i = 0; i < texts.length - 1; i++) {
    if (texts[i] === 'naquele' && texts[i + 1] === 'instante') return 'punctual';
  }

  // 6. Habitual
  if (texts.some((t) => ['sempre', 'costumeiramente', 'habitualmente', 'geralmente'].includes(t))) {
    return 'habitual';
  }
  for (let i = 0; i < texts.length - 1; i++) {
    if ((texts[i] === 'todas' || texts[i] === 'todos') &&
        ['as', 'os', 'dias', 'noites', 'manhãs', 'tardes', 'vezes'].includes(texts[i + 1])) {
      return 'habitual';
    }
  }

  return null;
}

/**
 * Detecta negação. Devolve o kind específico, não boolean.
 *
 * @param {Array} tokens
 * @returns {string|null}
 */
function _detectNegation(tokens) {
  const texts = tokens.map((t) => (t.text?.toLowerCase() ?? ''));

  if (texts.includes('nunca') || texts.includes('jamais')) return 'never';
  if (texts.includes('nem') || texts.includes('tampouco')) return 'nor';

  for (let i = 0; i < texts.length - 1; i++) {
    if (texts[i] === 'ainda' && texts[i + 1] === 'não') return 'not-yet';
    if (texts[i] === 'já' && texts[i + 1] === 'não') return 'no-longer';
  }

  if (texts.includes('sem')) return 'without';
  if (texts.includes('não') || texts.includes('nao')) return 'not';

  return null;
}

/**
 * Detecta modalidade com suporte a construções compostas.
 *
 * Novos (Fase 10):
 *   - `poder + tentar` → attempt (tentar domina)
 *   - `poder + conseguir` → capability
 *   - `poder + ter + particípio` → possibility (mantém)
 *   - verbos de intenção: pretender, tencionar, planejar, decidir
 *
 * @param {Array} tokens
 * @returns {string|null}
 */
function _detectModality(tokens) {
  // ── 1. Advérbios modais (alta prioridade em contexto) ────
  for (const t of tokens) {
    const lemma = (t.lemma ?? '').toLowerCase();
    const text = (t.text ?? '').toLowerCase();
    for (const m of _MODAL_ADVERBS) {
      if (lemma === m.lemma || text === m.lemma) return m.modality;
    }
  }

  // ── 2. Verbos modais simples ────────────────────────────
  const verbsWithIdx = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].pos !== 'VERB') continue;
    const lemma = (tokens[i].lemma ?? '').toLowerCase();
    for (const m of _MODAL_VERBS) {
      if (lemma === m.lemma) {
        verbsWithIdx.push({ lemma, modality: m.modality, idx: i });
        break;
      }
    }
  }

  if (verbsWithIdx.length === 0) return null;

  // ── 3. Detecção composta ────────────────────────────────
  // Se há múltiplos modais, o mais específico ganha.
  // Ex: "poder tentar" → attempt (não possibility)
  const priority = [
    'intention',
    'attempt',
    'capability',
    'obligation',
    'desire',
    'possibility',
  ];

  let best = null;
  let bestPriority = priority.length;
  for (const v of verbsWithIdx) {
    const p = priority.indexOf(v.modality);
    if (p >= 0 && p < bestPriority) {
      bestPriority = p;
      best = v;
    }
  }

  return best ? best.modality : verbsWithIdx[0].modality;
}

/**
 * Detecta voz. Passiva: 'ser' + particípio.
 * @param {Array} tokens
 * @returns {'active'|'passive'|'reflexive'}
 */
function _detectVoice(tokens) {
  const hasSe = tokens.some((t) => t.text?.toLowerCase() === 'se');
  if (hasSe && tokens.some((t) => t.pos === 'VERB')) return 'reflexive';

  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];
    if (t.lemma === 'ser' && next?.pos === 'ADJ' &&
        /(ado|ada|ados|adas|ido|ida|idos|idas)$/i.test(next.text ?? '')) {
      return 'passive';
    }
  }

  return 'active';
}

function _detectComplements(tokens, verbIdx) {
  const comps = {
    predicative: null,
    adverbial: null,
    oblique: null,
  };

  if (verbIdx < 0) return comps;

  const v = tokens[verbIdx];
  const STATE_VERBS = ['ser', 'estar', 'ficar', 'parecer', 'tornar', 'virar'];
  if (STATE_VERBS.includes(v.lemma)) {
    for (let i = verbIdx + 1; i < tokens.length; i++) {
      if (tokens[i].pos === 'ADJ') {
        comps.predicative = tokens[i].lemma;
        break;
      }
      if (_isPunct(tokens[i])) break;
    }
  }

  for (let i = verbIdx + 1; i < tokens.length; i++) {
    if (tokens[i].pos === 'ADV') {
      comps.adverbial = tokens[i].lemma;
      break;
    }
  }

  return comps;
}

function _mkDiag(code, message, span = null) {
  return {
    severity: 'info',
    phase: 'syntactic',
    code,
    message,
    sourceSpan: span,
    suggestions: [],
    related: [],
  };
}

// ══════════════════════════════════════════════════════════════
// MARCADORES TEMPORAIS (Fase 10)
// ══════════════════════════════════════════════════════════════

/**
 * Detecta marcadores temporais absolutos e relativos.
 * Varre o texto cru com regex e produz array posicional.
 *
 * @param {string} raw
 * @returns {Array<{ marker:string, kind:string, weight:number, position:number }>}
 */
function _detectAbsoluteMarkers(raw) {
  const s = String(raw ?? '');
  if (!s) return [];

  const out = [];
  const seen = new Set();

  for (const entry of _TEMPORAL_MARKER_PATTERNS) {
    // Necessário reset do lastIndex por causa da flag `g`? Não usamos `g`.
    const m = entry.pattern.exec(s);
    if (!m) continue;
    const text = m[0].trim();
    const key = `${entry.kind}|${text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      marker: text,
      kind: entry.kind,
      weight: entry.weight,
      position: typeof m.index === 'number' ? m.index : 0,
    });
  }

  out.sort((a, b) => a.position - b.position);
  return out;
}

// ══════════════════════════════════════════════════════════════
// API PRINCIPAL
// ══════════════════════════════════════════════════════════════

/**
 * Analisa uma sentença.
 *
 * @param {Object} sentence
 * @param {Object} nlp
 * @param {Object} [ctx={}]
 * @returns {LinguisticModel}
 */
export function analyze(sentence, nlp, ctx = {}) {
  if (!sentence || typeof sentence.raw !== 'string') {
    return _emptyModel('', []);
  }

  const raw = sentence.raw;
  const tokens = Array.isArray(nlp?.tokens) ? nlp.tokens : [];

  // ── Construção reconhecida ──────────────────────────────
  let construction = null;
  try {
    construction = matchConstruction(raw);
  } catch { /* isola */ }

  // ── Extração base ───────────────────────────────────────
  const verbIdx = _findFirstVerb(tokens);
  const subject = _detectSubject(tokens, verbIdx);
  const objects = _detectObjects(tokens, verbIdx);
  const predicate = verbIdx >= 0 ? tokens[verbIdx].text : null;
  const predicateLemma = verbIdx >= 0 ? tokens[verbIdx].lemma : null;

  const semanticRoles = _mapSemanticRoles(subject, predicateLemma, objects);
  const { tense } = _detectTense(tokens, verbIdx);
  const aspect = _detectAspect(tokens, verbIdx);
  const modality = _detectModality(tokens);
  const negation = _detectNegation(tokens);
  const voice = _detectVoice(tokens);
  const complements = _detectComplements(tokens, verbIdx);

  // ── Marcadores temporais (Fase 10) ──────────────────────
  const absoluteMarkers = _detectAbsoluteMarkers(raw);

  // ── Diagnósticos locais ─────────────────────────────────
  const diagnostics = [];
  if (verbIdx < 0) {
    diagnostics.push(_mkDiag(
      'SYN_NO_VERB',
      'Sentença sem predicado verbal claro',
      sentence.source ?? null
    ));
  }
  if (!subject && verbIdx >= 0) {
    diagnostics.push(_mkDiag(
      'SYN_AMBIGUOUS_SUBJECT',
      'Sujeito elíptico não resolvível pela heurística',
      sentence.source ?? null
    ));
  }

  return {
    sentenceId: sentence.id ?? '',
    raw,
    subject,
    predicate,
    predicateLemma,
    objects,
    complements,
    tense,
    aspect: aspect && ASPECT_KINDS.includes(aspect) ? aspect : null,
    modality: modality && MODALITY_KINDS.includes(modality) ? modality : null,
    negation: negation && NEGATION_KINDS.includes(negation) ? negation : null,
    semanticRoles,
    voice,
    construction,
    absoluteMarkers,
    tokens,
    diagnostics,
  };
}

function _emptyModel(sentenceId, diagnostics) {
  return {
    sentenceId,
    raw: '',
    subject: null,
    predicate: null,
    predicateLemma: null,
    objects: [],
    complements: { predicative: null, adverbial: null, oblique: null },
    tense: null,
    aspect: null,
    modality: null,
    negation: null,
    semanticRoles: {},
    voice: 'active',
    construction: null,
    absoluteMarkers: [],
    tokens: [],
    diagnostics: diagnostics ?? [],
  };
}

/**
 * Estatísticas de análise para diagnóstico.
 * @param {LinguisticModel} m
 * @returns {Object}
 */
export function analyzeStats(m) {
  return {
    hasSubject: !!m.subject,
    hasPredicate: !!m.predicateLemma,
    objectCount: m.objects.length,
    roleCount: Object.keys(m.semanticRoles).length,
    hasConstruction: !!m.construction,
    tense: m.tense,
    aspect: m.aspect,
    modality: m.modality,
    negation: m.negation,
    voice: m.voice,
    temporalMarkerCount: Array.isArray(m.absoluteMarkers) ? m.absoluteMarkers.length : 0,
    temporalMarkerKinds: Array.isArray(m.absoluteMarkers)
      ? m.absoluteMarkers.map((x) => x.kind)
      : [],
    diagCount: m.diagnostics.length,
  };
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const Analyzer = Object.freeze({
  analyze,
  analyzeStats,
});