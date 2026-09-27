/**
 * @file epistemic-analyzer.js
 * @module narrative-language/acts
 * @description Análise dedicada de epistemologia narrativa. Distingue
 *              fato, percepção, conhecimento, crença, memória e ignorância.
 *              Essencial para não colapsar "Maria estava atrás da porta"
 *              (fato) com "João achava que Maria estava atrás da porta"
 *              (crença) nem com "João viu Maria atrás da porta" (percepção).
 * @imports narrative-language/ir/schema,
 *          narrative-language/pt-br/lexicon
 * @importedBy narrative-language/acts/classifier,
 *             narrative-language/acts/dimensions (potencial),
 *             narrative-language/pipeline/interpreter (via hints)
 * @level N3
 *
 * Contrato:
 *   analyzeEpistemic(model, resolution, ctx) → EpistemicResult
 *   epistemicStats(result)                   → Object
 *   categoryFor(verb)                        → string|null
 *   listEpistemicVerbs()                     → string[]
 *
 * EpistemicResult:
 *   {
 *     acts: EpistemicAct[],
 *     primary: EpistemicAct|null,
 *     confidence: number,
 *   }
 *
 * EpistemicAct:
 *   {
 *     category: 'fact'|'perception'|'knowledge'|'belief'|'memory'|'ignorance',
 *     holder: string|null,        — quem experiencia/acredita/sabe
 *     holderId: string|null,      — entityId resolvido
 *     proposition: string|null,   — conteúdo (o que é sabido/acreditado)
 *     verb: string,               — verbo que introduziu
 *     surface: string,            — texto do verbo
 *     confidence: number,
 *     evidence: Evidence[],
 *   }
 *
 * Fato é o default quando nada é detectado — o caller (classifier) trata
 * `acts.length === 0` como fato explícito.
 *
 * Determinismo: nenhuma chamada a Math.random ou wall-clock. Nunca lança.
 */

import { EPISTEMIC_KINDS } from '../ir/schema.js';

// ══════════════════════════════════════════════════════════════
// PADRÕES
// ══════════════════════════════════════════════════════════════

/**
 * Padrões de detecção por categoria. Ordem importa apenas para debug —
 * matching é independente e cada padrão é testado.
 *
 * @type {ReadonlyArray<{ pattern:RegExp, category:string, verb:string, weight:number }>}
 * @private
 */
const _EPISTEMIC_PATTERNS = Object.freeze([
  // ── Conhecimento ──────────────────────────────────────
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(sabia|soube|sabe)\s+que\s+(.+?)\.?$/i,
    category: 'knowledge', verb: 'saber', weight: 0.94,
  },
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(conhecia|conheceu|conhece)\s+(.+?)\.?$/i,
    category: 'knowledge', verb: 'conhecer', weight: 0.90,
  },
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(entendia|entendeu|entende)\s+que\s+(.+?)\.?$/i,
    category: 'knowledge', verb: 'entender', weight: 0.88,
  },
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(compreendia|compreendeu|compreende)\s+que\s+(.+?)\.?$/i,
    category: 'knowledge', verb: 'compreender', weight: 0.88,
  },

  // ── Crença ────────────────────────────────────────────
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(achava|achou|acha)\s+que\s+(.+?)\.?$/i,
    category: 'belief', verb: 'achar', weight: 0.92,
  },
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(pensava|pensou|pensa)\s+que\s+(.+?)\.?$/i,
    category: 'belief', verb: 'pensar', weight: 0.90,
  },
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(acreditava|acreditou|acredita)\s+que\s+(.+?)\.?$/i,
    category: 'belief', verb: 'acreditar', weight: 0.92,
  },
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(cria|creu|cr[êe])\s+que\s+(.+?)\.?$/i,
    category: 'belief', verb: 'crer', weight: 0.88,
  },
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(supunha|sup[ôo]s|sup[õo]e)\s+que\s+(.+?)\.?$/i,
    category: 'belief', verb: 'supor', weight: 0.86,
  },
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(julgava|julgou|julga)\s+que\s+(.+?)\.?$/i,
    category: 'belief', verb: 'julgar', weight: 0.85,
  },
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(imaginava|imaginou|imagina)\s+que\s+(.+?)\.?$/i,
    category: 'belief', verb: 'imaginar', weight: 0.84,
  },

  // ── Percepção ─────────────────────────────────────────
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(viu|via|v[êe])\s+(.+?)\.?$/i,
    category: 'perception', verb: 'ver', weight: 0.88,
  },
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(ouviu|ouvia|ouve)\s+(.+?)\.?$/i,
    category: 'perception', verb: 'ouvir', weight: 0.88,
  },
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(notou|notava|nota)\s+que\s+(.+?)\.?$/i,
    category: 'perception', verb: 'notar', weight: 0.90,
  },
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(percebeu|percebia|percebe)\s+que\s+(.+?)\.?$/i,
    category: 'perception', verb: 'perceber', weight: 0.90,
  },
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(observou|observava|observa)\s+que\s+(.+?)\.?$/i,
    category: 'perception', verb: 'observar', weight: 0.88,
  },
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(olhou\s+para|olhava\s+para|olha\s+para)\s+(.+?)\.?$/i,
    category: 'perception', verb: 'olhar', weight: 0.85,
  },

  // ── Memória ───────────────────────────────────────────
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(lembrou|lembrava|lembra)\s+de\s+(.+?)\.?$/i,
    category: 'memory', verb: 'lembrar', weight: 0.92,
  },
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(lembrou|lembrava|lembra)\s+que\s+(.+?)\.?$/i,
    category: 'memory', verb: 'lembrar', weight: 0.90,
  },
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(recordou|recordava|recorda)\s+(de\s+)?(.+?)\.?$/i,
    category: 'memory', verb: 'recordar', weight: 0.90,
  },
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(esqueceu|esquecia|esquece)\s+(de\s+)?(.+?)\.?$/i,
    category: 'memory', verb: 'esquecer', weight: 0.90,
  },

  // ── Ignorância (conhecimento negado) ──────────────────
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+n[ãa]o\s+(sabia|soube|sabe)\s+que\s+(.+?)\.?$/i,
    category: 'ignorance', verb: 'saber', weight: 0.94,
  },
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+n[ãa]o\s+(conhecia|conheceu|conhece)\s+(.+?)\.?$/i,
    category: 'ignorance', verb: 'conhecer', weight: 0.90,
  },
  {
    pattern: /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(desconhecia|desconheceu|desconhece)\s+(.+?)\.?$/i,
    category: 'ignorance', verb: 'desconhecer', weight: 0.92,
  },
]);

/**
 * Mapeamento de construction ID → categoria epistêmica.
 * @type {Readonly<Object<string, string>>}
 * @private
 */
const _CONSTRUCTION_CATEGORY = Object.freeze({
  'x-sabia-que-y':   'knowledge',
  'x-achava-que-y':  'belief',
  'x-viu-y':         'perception',
  'x-lembrou-de-y':  'memory',
});

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
 * Resolve um nome para entityId via `resolution.references`.
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

/**
 * Verifica se a categoria é válida.
 * @private
 */
function _isValidCategory(c) {
  return EPISTEMIC_KINDS.includes(c);
}

// ══════════════════════════════════════════════════════════════
// DETECÇÃO POR PADRÃO
// ══════════════════════════════════════════════════════════════

/**
 * Varre o texto cru e casa padrões epistêmicos.
 * Devolve um ato por match (ou vazio se nada casar).
 *
 * @param {string} raw
 * @param {Object} resolution
 * @returns {Array<Object>}
 * @private
 */
function _detectByPattern(raw, resolution) {
  const s = String(raw ?? '').trim();
  if (!s) return [];

  const out = [];

  for (const entry of _EPISTEMIC_PATTERNS) {
    const m = entry.pattern.exec(s);
    if (!m) continue;

    const holderRaw = (m[1] ?? '').trim();
    // Para "olhou para", o grupo 2 é uma frase; para "lembrou de", grupo 3 é o objeto.
    const lastGroupIdx = m.length - 1;
    const proposition = (m[lastGroupIdx] ?? '').trim() || null;

    if (!holderRaw) continue;
    if (!_isValidCategory(entry.category)) continue;

    const evidence = [
      _mkEvidence(
        'syntax',
        entry.verb,
        `padrão epistêmico "${entry.verb}" → ${entry.category}`,
        entry.weight
      ),
      _mkEvidence(
        'syntax',
        holderRaw,
        `holder extraído do sujeito`,
        _resolveName(holderRaw, resolution) ? 0.90 : 0.65
      ),
    ];

    out.push({
      category: entry.category,
      holder: holderRaw,
      holderId: _resolveName(holderRaw, resolution),
      proposition,
      verb: entry.verb,
      surface: entry.verb,
      confidence: Math.round(entry.weight * 100) / 100,
      evidence,
    });

    break;   // primeira correspondência ganha
  }

  return out;
}

// ══════════════════════════════════════════════════════════════
// DETECÇÃO POR CONSTRUCTION
// ══════════════════════════════════════════════════════════════

/**
 * Detecta categoria epistêmica via construction reconhecida.
 *
 * @param {Object} model
 * @param {Object} resolution
 * @returns {Array<Object>}
 * @private
 */
function _detectByConstruction(model, resolution) {
  const construction = model?.construction;
  if (!construction || typeof construction.id !== 'string') return [];

  const category = _CONSTRUCTION_CATEGORY[construction.id];
  if (!category || !_isValidCategory(category)) return [];

  const g = construction.groups ?? {};
  const holder = g.holder ?? g.perceiver ?? g.speaker ?? null;
  const proposition = g.proposition ?? g.target ?? g.content ?? null;

  const evidence = [
    _mkEvidence(
      'construction',
      construction.id,
      `construction → ${category}`,
      typeof construction.confidence === 'number' ? construction.confidence : 0.90
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

  return [{
    category,
    holder: holder || null,
    holderId: holder ? _resolveName(holder, resolution) : null,
    proposition: proposition || null,
    verb: construction.id,
    surface: construction.id,
    confidence: Math.round(confidence * 100) / 100,
    evidence,
  }];
}

// ══════════════════════════════════════════════════════════════
// DEDUPLICAÇÃO
// ══════════════════════════════════════════════════════════════

/**
 * Deduplica atos por (category, holder). Mantém o de maior confiança.
 * @private
 */
function _dedupe(acts) {
  const seen = new Map();
  for (const a of acts) {
    if (!a) continue;
    const key = `${a.category}|${_norm(a.holder ?? '')}`;
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
 * Analisa a epistemologia de um modelo linguístico.
 *
 * Combina detecção por padrão (regex sobre texto cru) com detecção por
 * construction, deduplica e ordena por confiança.
 *
 * Se nada casar, devolve `acts: []` — o caller (classifier) trata como
 * fato explícito.
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
export function analyzeEpistemic(model, resolution, ctx = {}) {
  const empty = { acts: [], primary: null, confidence: 0 };
  if (!model || typeof model !== 'object') return empty;

  const raw = String(model.raw ?? '');
  if (!raw) return empty;

  const byPattern = _detectByPattern(raw, resolution);
  const byConstruction = _detectByConstruction(model, resolution);

  const combined = [...byPattern, ...byConstruction];
  if (combined.length === 0) return empty;

  const acts = _dedupe(combined);

  acts.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return String(a.holder ?? '').localeCompare(String(b.holder ?? ''));
  });

  const primary = acts[0] ?? null;
  const confidence = Math.round(
    (acts.reduce((s, a) => s + a.confidence, 0) / acts.length) * 100
  ) / 100;

  return { acts, primary, confidence };
}

/**
 * Verifica se há epistemologia não-factual detectável.
 * @param {Object} model
 * @param {Object} resolution
 * @param {Object} [ctx={}]
 * @returns {boolean}
 */
export function hasExplicitEpistemic(model, resolution, ctx = {}) {
  const r = analyzeEpistemic(model, resolution, ctx);
  return r.acts.length > 0;
}

/**
 * Devolve a categoria associada a um verbo (lemma), ou null.
 * @param {string} verb
 * @returns {string|null}
 */
export function categoryFor(verb) {
  const key = _norm(verb);
  for (const entry of _EPISTEMIC_PATTERNS) {
    if (entry.verb === key) return entry.category;
  }
  return null;
}

/**
 * Lista os verbos epistêmicos reconhecidos.
 * @returns {string[]}
 */
export function listEpistemicVerbs() {
  const set = new Set();
  for (const entry of _EPISTEMIC_PATTERNS) set.add(entry.verb);
  return Array.from(set).sort();
}

/**
 * Estatísticas de um resultado.
 * @param {Object} result
 * @returns {Object}
 */
export function epistemicStats(result) {
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
 * Lista as categorias epistêmicas canônicas.
 * @returns {string[]}
 */
export function listCategories() {
  return [...EPISTEMIC_KINDS];
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const EpistemicAnalyzer = Object.freeze({
  analyzeEpistemic,
  hasExplicitEpistemic,
  categoryFor,
  listEpistemicVerbs,
  listCategories,
  epistemicStats,
});