/**
 * @file user-lexicon.js
 * @module narrative-language
 * @description Léxico aprendido pelo autor. Diferente de `overrides.js`
 *              (span-level), aqui é lemma-level (agnóstico a posição).
 * @imports core/constants (NARRATIVE_STORAGE_KEYS)
 * @importedBy systems/narrative-system,
 *             narrative-language/pipeline/resolver,
 *             narrative-language/acts/subtype-detector,
 *             narrative-language/index (re-export)
 * @level N1
 *
 * ═══════════════════════════════════════════════════════════════
 * CAMADA 5 — APRENDIZADO DO AUTOR
 * ═══════════════════════════════════════════════════════════════
 *
 * O léxico do usuário agora suporta TRÊS KINDS de aprendizado:
 *
 *   1. 'reference'       — lemma → entityId (comportamento original)
 *                          "ele" → "maria"
 *
 *   2. 'verb-subtype'    — verbo → D-number
 *                          "esgueirar" → "D1.2"
 *                          "perscrutar" → "D4.1"
 *
 *   3. 'construction-op' — constructionId → operação v1
 *                          "relative-clause-restrictive" → "describe"
 *
 * Todos os kinds compartilham:
 *   { kind, prefer, context, ts, uses }
 *
 * O campo `kind` distingue o uso. Entradas antigas (sem kind) são
 * tratadas como 'reference' por retrocompatibilidade.
 *
 * No `subtype-detector`, a estratégia `_fromUserLexicon` consulta
 * este léxico com PRIORIDADE MÁXIMA (acima de construction). O autor
 * é a fonte mais confiável — se ele corrigiu uma vez, o sistema
 * obedece.
 *
 * ═══════════════════════════════════════════════════════════════
 * FORMATO DE ARMAZENAMENTO
 * ═══════════════════════════════════════════════════════════════
 *
 *   {
 *     "ele": {
 *       kind: "reference",
 *       prefer: "maria",
 *       context: null,
 *       ts: 1712345678901,
 *       uses: 5
 *     },
 *     "esgueirar": {
 *       kind: "verb-subtype",
 *       prefer: "D1.2",
 *       context: null,
 *       ts: 1712345678901,
 *       uses: 3
 *     },
 *     "relative-clause-restrictive": {
 *       kind: "construction-op",
 *       prefer: "describe",
 *       context: null,
 *       ts: 1712345678901,
 *       uses: 1
 *     }
 *   }
 *
 * Determinismo: loadUserLexicon() é estável; boosting é determinístico.
 * Nunca lança.
 */

import { NARRATIVE_STORAGE_KEYS } from '../core/constants.js';

// ══════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════

/**
 * Incremento de score aplicado ao candidato preferido do autor.
 * @type {number}
 */
export const LEXICON_BOOST = 0.30;

/**
 * Incremento de confiança para verbos/subtypes aprendidos.
 * Mais alto que o boost de referência, porque o autor aqui está
 * classificando explicitamente — a evidência é mais forte.
 * @type {number}
 */
export const LEARNED_CONFIDENCE = 0.99;

/**
 * Limite de entradas mantidas. Ao exceder, as menos usadas são
 * removidas.
 * @type {number}
 */
export const MAX_LEXICON_ENTRIES = 500;

/**
 * Kinds válidos.
 * @type {ReadonlyArray<string>}
 */
export const KINDS = Object.freeze([
  'reference',
  'verb-subtype',
  'construction-op',
]);

/**
 * Operações v1 válidas (para validação de construction-op).
 * @type {ReadonlyArray<string>}
 */
const _V1_OPERATIONS = Object.freeze([
  'represent', 'describe', 'expose', 'interiorize',
  'enunciate', 'evaluate', 'focalize', 'structure',
]);

/**
 * Regex de D-number canônico.
 * @type {RegExp}
 */
const _DNUMBER_RE = /^D\d+(\.\d+[a-z]?)?$/;

// ══════════════════════════════════════════════════════════════
// BACKING STORE
// ══════════════════════════════════════════════════════════════

/** @type {Map<string, string>} @private */
const _memStore = new Map();

/** @returns {boolean} @private */
function _hasLocalStorage() {
  try {
    if (typeof localStorage === 'undefined') return false;
    const probe = '__narr_lex_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** @private */
function _readRaw() {
  try {
    const key = NARRATIVE_STORAGE_KEYS.USER_LEXICON;
    if (_hasLocalStorage()) return localStorage.getItem(key);
    return _memStore.get(key) ?? null;
  } catch {
    return null;
  }
}

/** @private */
function _writeRaw(str) {
  try {
    const key = NARRATIVE_STORAGE_KEYS.USER_LEXICON;
    if (_hasLocalStorage()) {
      localStorage.setItem(key, str);
      return true;
    }
    _memStore.set(key, str);
    return true;
  } catch {
    return false;
  }
}

/** @private */
function _removeRaw() {
  try {
    const key = NARRATIVE_STORAGE_KEYS.USER_LEXICON;
    if (_hasLocalStorage()) {
      localStorage.removeItem(key);
      return true;
    }
    _memStore.delete(key);
    return true;
  } catch {
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * Valida uma entrada bruta.
 * Aceita tanto entradas antigas (sem kind → 'reference') quanto novas.
 *
 * @param {any} raw
 * @returns {Object|null}
 * @private
 */
function _sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const kind = KINDS.includes(raw.kind) ? raw.kind : 'reference';
  const prefer = typeof raw.prefer === 'string' ? raw.prefer : null;
  if (!prefer) return null;

  // ── Validação por kind ────────────────────────────────
  if (kind === 'verb-subtype') {
    if (!_DNUMBER_RE.test(prefer)) return null;
  } else if (kind === 'construction-op') {
    if (!_V1_OPERATIONS.includes(prefer)) return null;
  }

  const context = typeof raw.context === 'string' && raw.context.length > 0
    ? raw.context
    : null;
  const ts = typeof raw.ts === 'number' && raw.ts > 0 ? raw.ts : Date.now();
  const uses = typeof raw.uses === 'number' && raw.uses >= 0 ? raw.uses : 0;

  return { kind, prefer, context, ts, uses };
}

/**
 * Normaliza um lemma/chave para lookup.
 * @param {string} s
 * @returns {string}
 * @private
 */
function _norm(s) {
  return String(s ?? '').trim().toLowerCase();
}

// ══════════════════════════════════════════════════════════════
// API PRINCIPAL
// ══════════════════════════════════════════════════════════════

/**
 * Carrega o léxico do autor. Devolve Map<key, Entry>.
 *
 * @returns {Map<string, Object>}
 */
export function loadUserLexicon() {
  const raw = _readRaw();
  if (!raw) return new Map();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Map();
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return new Map();
  }

  const out = new Map();
  let pruned = false;

  for (const [k, v] of Object.entries(parsed)) {
    const key = _norm(k);
    if (!key) { pruned = true; continue; }
    const entry = _sanitize(v);
    if (!entry) { pruned = true; continue; }
    out.set(key, entry);
  }

  if (out.size > MAX_LEXICON_ENTRIES) {
    const sorted = Array.from(out.entries()).sort((a, b) => {
      if (a[1].uses !== b[1].uses) return a[1].uses - b[1].uses;
      return a[1].ts - b[1].ts;
    });
    const toRemove = sorted.slice(0, out.size - MAX_LEXICON_ENTRIES);
    for (const [k] of toRemove) out.delete(k);
    pruned = true;
  }

  if (pruned) _persistMap(out);

  return out;
}

/**
 * Persiste um mapa completo.
 * @param {Map<string, Object>} map
 * @returns {boolean}
 */
export function persistMap(map) {
  if (!(map instanceof Map)) return false;
  return _persistMap(map);
}

/** @private */
function _persistMap(map) {
  const out = {};
  const entries = Array.from(map.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  for (const [k, v] of entries) {
    if (!k) continue;
    out[k] = v;
  }
  try {
    return _writeRaw(JSON.stringify(out));
  } catch {
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
// APRENDIZADO — REFERÊNCIA (comportamento original)
// ══════════════════════════════════════════════════════════════

/**
 * Aprende uma preferência de referência: para `lemma`, prefira `entityId`.
 *
 * @param {string} lemma
 * @param {string} entityId
 * @param {Object} [opts={}]
 * @param {string|null} [opts.context]
 * @returns {boolean}
 */
export function learn(lemma, entityId, opts = {}) {
  const key = _norm(lemma);
  if (!key) return false;
  if (typeof entityId !== 'string' || !entityId) return false;

  return _upsertEntry(key, {
    kind: 'reference',
    prefer: entityId,
    context: opts.context ?? null,
  });
}

// ══════════════════════════════════════════════════════════════
// APRENDIZADO — VERB → SUBTYPE (Camada 5)
// ══════════════════════════════════════════════════════════════

/**
 * Aprende que um verbo pertence a um subtipo canônico.
 *
 * Uso típico: o autor vê que "esgueirar" foi classificado como
 * `represent` por fallback, e corrige manualmente para `D1.2`.
 *
 * @param {string} lemma
 * @param {string} dnumber        — ex: 'D1.2'
 * @param {Object} [opts={}]
 * @param {string|null} [opts.context]
 * @returns {boolean}
 */
export function learnVerbSubtype(lemma, dnumber, opts = {}) {
  const key = _norm(lemma);
  if (!key) return false;
  if (typeof dnumber !== 'string' || !_DNUMBER_RE.test(dnumber)) return false;

  return _upsertEntry(key, {
    kind: 'verb-subtype',
    prefer: dnumber,
    context: opts.context ?? null,
  });
}

// ══════════════════════════════════════════════════════════════
// APRENDIZADO — CONSTRUCTION → OPERAÇÃO (Camada 5)
// ══════════════════════════════════════════════════════════════

/**
 * Aprende que uma construction pertence a uma operação v1.
 *
 * Uso típico: o autor discorda que "relative-clause-restrictive"
 * seja `describe` e prefere `expose`.
 *
 * @param {string} constructionId — ex: 'relative-clause-restrictive'
 * @param {string} operation      — ex: 'describe'
 * @param {Object} [opts={}]
 * @param {string|null} [opts.context]
 * @returns {boolean}
 */
export function learnConstructionOp(constructionId, operation, opts = {}) {
  const key = _norm(constructionId);
  if (!key) return false;
  if (typeof operation !== 'string' || !_V1_OPERATIONS.includes(operation)) return false;

  return _upsertEntry(key, {
    kind: 'construction-op',
    prefer: operation,
    context: opts.context ?? null,
  });
}

// ══════════════════════════════════════════════════════════════
// UPSERT INTERNO
// ══════════════════════════════════════════════════════════════

/**
 * Insere ou atualiza uma entrada. Se já existir com o mesmo
 * `kind`+`prefer`, incrementa `uses`. Senão, substitui.
 *
 * @param {string} key
 * @param {Object} entry
 * @returns {boolean}
 * @private
 */
function _upsertEntry(key, entry) {
  const map = loadUserLexicon();
  const current = map.get(key);

  if (current && current.kind === entry.kind && current.prefer === entry.prefer) {
    map.set(key, {
      ...current,
      uses: (current.uses ?? 0) + 1,
      ts: Date.now(),
    });
  } else {
    map.set(key, {
      kind: entry.kind,
      prefer: entry.prefer,
      context: entry.context ?? null,
      ts: Date.now(),
      uses: 1,
    });
  }

  return _persistMap(map);
}

// ══════════════════════════════════════════════════════════════
// REMOÇÃO
// ══════════════════════════════════════════════════════════════

/**
 * Remove a preferência de uma chave (qualquer kind).
 * @param {string} key
 * @returns {boolean}
 */
export function forget(key) {
  const k = _norm(key);
  if (!k) return false;
  const map = loadUserLexicon();
  const removed = map.delete(k);
  if (removed) _persistMap(map);
  return removed;
}

/**
 * Remove todas as preferências de um kind.
 * @param {string} kind
 * @returns {number}
 */
export function forgetByKind(kind) {
  if (!KINDS.includes(kind)) return 0;
  const map = loadUserLexicon();
  let removed = 0;
  for (const [k, v] of map) {
    if (v.kind === kind) {
      map.delete(k);
      removed++;
    }
  }
  if (removed > 0) _persistMap(map);
  return removed;
}

/**
 * Remove todas as preferências.
 * @returns {number}
 */
export function clearUserLexicon() {
  const map = loadUserLexicon();
  const n = map.size;
  _removeRaw();
  return n;
}

// ══════════════════════════════════════════════════════════════
// CONSULTAS
// ══════════════════════════════════════════════════════════════

/**
 * Devolve a preferência de uma chave, ou null.
 * @param {string} key
 * @param {Map<string, Object>} [map]
 * @returns {Object|null}
 */
export function getPreference(key, map = null) {
  const k = _norm(key);
  if (!k) return null;
  const m = map ?? loadUserLexicon();
  return m.get(k) ?? null;
}

/**
 * Verifica se o autor aprendeu algo para a chave.
 * @param {string} key
 * @param {Map<string, Object>} [map]
 * @returns {boolean}
 */
export function hasPreference(key, map = null) {
  return getPreference(key, map) !== null;
}

/**
 * Devolve a preferência de referência de um lemma, ou null.
 * Compatível com a API antiga.
 * @param {string} lemma
 * @param {Map<string, Object>} [map]
 * @returns {Object|null}
 */
export function getReferencePreference(lemma, map = null) {
  const entry = getPreference(lemma, map);
  if (!entry || entry.kind !== 'reference') return null;
  return entry;
}

/**
 * Devolve o D-number aprendido para um verbo, ou null.
 * @param {string} lemma
 * @param {Map<string, Object>} [map]
 * @returns {string|null}
 */
export function getVerbSubtype(lemma, map = null) {
  const entry = getPreference(lemma, map);
  if (!entry || entry.kind !== 'verb-subtype') return null;
  return entry.prefer;
}

/**
 * Devolve a operação aprendida para uma construction, ou null.
 * @param {string} constructionId
 * @param {Map<string, Object>} [map]
 * @returns {string|null}
 */
export function getConstructionOp(constructionId, map = null) {
  const entry = getPreference(constructionId, map);
  if (!entry || entry.kind !== 'construction-op') return null;
  return entry.prefer;
}

// ══════════════════════════════════════════════════════════════
// BOOSTING (para o resolver)
// ══════════════════════════════════════════════════════════════

/**
 * Boost a aplicar a um candidato de resolução de referência.
 * Só se aplica a kind='reference'.
 *
 * @param {string} lemma
 * @param {string} entityId
 * @param {Map<string, Object>} [map]
 * @returns {number}
 */
export function boostFor(lemma, entityId, map = null) {
  const pref = getReferencePreference(lemma, map);
  if (!pref) return 0;
  if (pref.prefer !== entityId) return 0;
  return LEXICON_BOOST;
}

// ══════════════════════════════════════════════════════════════
// LISTAGENS
// ══════════════════════════════════════════════════════════════

/**
 * Lista todas as preferências, ordenadas por (kind, uses desc, ts desc).
 * @returns {Array<Object>}
 */
export function listPreferences() {
  const map = loadUserLexicon();
  const out = [];
  for (const [k, v] of map) {
    out.push({
      lemma: k,
      kind: v.kind,
      prefer: v.prefer,
      context: v.context,
      ts: v.ts,
      uses: v.uses,
    });
  }
  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    if (b.uses !== a.uses) return b.uses - a.uses;
    return b.ts - a.ts;
  });
  return out;
}

/**
 * Lista preferências de um kind específico.
 * @param {string} kind
 * @returns {Array<Object>}
 */
export function listByKind(kind) {
  return listPreferences().filter((p) => p.kind === kind);
}

// ══════════════════════════════════════════════════════════════
// ESTATÍSTICAS
// ══════════════════════════════════════════════════════════════

/**
 * @returns {Object}
 */
export function stats() {
  const map = loadUserLexicon();

  const byKind = { reference: 0, 'verb-subtype': 0, 'construction-op': 0 };
  let totalUses = 0;
  let withContext = 0;

  for (const v of map.values()) {
    totalUses += v.uses ?? 0;
    if (v.context) withContext++;
    if (v.kind in byKind) byKind[v.kind]++;
  }

  return {
    count: map.size,
    maxEntries: MAX_LEXICON_ENTRIES,
    lexiconBoost: LEXICON_BOOST,
    learnedConfidence: LEARNED_CONFIDENCE,
    totalUses,
    withContext,
    byKind,
  };
}

/**
 * Reset para testes.
 * @internal
 */
export function _resetForTests() {
  _memStore.clear();
  try {
    if (_hasLocalStorage()) {
      localStorage.removeItem(NARRATIVE_STORAGE_KEYS.USER_LEXICON);
    }
  } catch { /* isola */ }
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const UserLexicon = Object.freeze({
  LEXICON_BOOST,
  LEARNED_CONFIDENCE,
  MAX_LEXICON_ENTRIES,
  KINDS,

  loadUserLexicon,
  persistMap,
  learn,
  learnVerbSubtype,
  learnConstructionOp,
  forget,
  forgetByKind,
  clearUserLexicon,

  getPreference,
  hasPreference,
  getReferencePreference,
  getVerbSubtype,
  getConstructionOp,
  boostFor,

  listPreferences,
  listByKind,
  stats,
  _resetForTests,
});