/**
 * @file overrides.js
 * @module narrative-language
 * @description Persistência e consulta de overrides de referência do autor.
 *              Um override associa um span textual (identificado por chave
 *              canônica) a uma entidade escolhida, com TTL e contador de uso.
 * @imports core/constants (NARRATIVE_STORAGE_KEYS)
 * @importedBy systems/narrative-system,
 *             narrative-language/index (re-export)
 * @level N1
 *
 * Formato de armazenamento (JSON em `narr:narrative:overrides`):
 *   {
 *     "s1.t3":      { chose:"maria", rejected:["joao"], ts:1712345678901, ttl:2592000000, uses:3 },
 *     "s1.o42":     { chose:"maria", rejected:["joao"], ts:1712345678901, ttl:2592000000, uses:1 },
 *     "default.t15":{ chose:"carlos", rejected:[],       ts:1712345678901, ttl:2592000000, uses:1 }
 *   }
 *
 * Determinismo: loadOverrides() devolve o mesmo Map para o mesmo storage.
 * Ordenação de chaves é lexicográfica quando serializado.
 *
 * Nunca lança. Storage indisponível → memória efêmera.
 */

import { NARRATIVE_STORAGE_KEYS } from '../core/constants.js';

// ══════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════

/**
 * TTL default de um override: 30 dias em ms.
 * @type {number}
 */
export const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Limite de overrides mantidos. Ao exceder, os mais antigos (por ts) são
 * removidos primeiro.
 * @type {number}
 */
export const MAX_OVERRIDES = 1000;

/**
 * Formato aceito de chaves de span:
 *   <sentenceId>.t<tokenIndex>   — canônico do resolver (F2)
 *   <sentenceId>.o<offset>       — canônico por offset (F6 → normalizado)
 *   <qualquer>.<...>             — aceito como veio
 * @type {RegExp}
 * @private
 */
const _SPAN_KEY_RE = /^[\w-]+\.(t|o)\d+$/;

// ══════════════════════════════════════════════════════════════
// BACKING STORE
// ══════════════════════════════════════════════════════════════

/**
 * Fallback em memória para ambientes sem localStorage.
 * @type {Map<string, string>}
 * @private
 */
const _memStore = new Map();

/**
 * @returns {boolean}
 * @private
 */
function _hasLocalStorage() {
  try {
    if (typeof localStorage === 'undefined') return false;
    const probe = '__narr_ovr_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * @private
 */
function _readRaw() {
  try {
    const key = NARRATIVE_STORAGE_KEYS.OVERRIDES;
    if (_hasLocalStorage()) return localStorage.getItem(key);
    return _memStore.get(key) ?? null;
  } catch {
    return null;
  }
}

/**
 * @private
 */
function _writeRaw(str) {
  try {
    const key = NARRATIVE_STORAGE_KEYS.OVERRIDES;
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

/**
 * @private
 */
function _removeRaw() {
  try {
    const key = NARRATIVE_STORAGE_KEYS.OVERRIDES;
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
 * Verifica se uma entrada de override expirou.
 * @param {Object} entry
 * @param {number} now
 * @returns {boolean}
 * @private
 */
function _isExpired(entry, now) {
  if (!entry || typeof entry.ts !== 'number') return true;
  const ttl = typeof entry.ttl === 'number' && entry.ttl > 0
    ? entry.ttl
    : DEFAULT_TTL_MS;
  return (now - entry.ts) > ttl;
}

/**
 * Sanitiza uma entrada antes de gravar.
 * @param {Object} raw
 * @returns {Object|null}
 * @private
 */
function _sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const chose = typeof raw.chose === 'string' ? raw.chose : null;
  if (!chose) return null;

  const rejected = Array.isArray(raw.rejected)
    ? raw.rejected.filter((x) => typeof x === 'string' && x !== chose)
    : [];

  const ts = typeof raw.ts === 'number' && raw.ts > 0 ? raw.ts : Date.now();
  const ttl = typeof raw.ttl === 'number' && raw.ttl > 0 ? raw.ttl : DEFAULT_TTL_MS;
  const uses = typeof raw.uses === 'number' && raw.uses >= 0 ? raw.uses : 0;

  return { chose, rejected, ts, ttl, uses };
}

// ══════════════════════════════════════════════════════════════
// API PRINCIPAL
// ══════════════════════════════════════════════════════════════

/**
 * Carrega todos os overrides persistidos, aplicando prune de expirados.
 * Devolve um Map<spanKey, Override>.
 *
 * @returns {Map<string, Object>}
 */
export function loadOverrides() {
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

  const now = Date.now();
  const out = new Map();
  let pruned = false;

  for (const [k, v] of Object.entries(parsed)) {
    if (typeof k !== 'string' || !k) continue;
    const entry = _sanitize(v);
    if (!entry) { pruned = true; continue; }
    if (_isExpired(entry, now)) { pruned = true; continue; }
    out.set(k, entry);
  }

  // Aplica limite máximo, removendo os mais antigos por ts
  if (out.size > MAX_OVERRIDES) {
    const sorted = Array.from(out.entries()).sort((a, b) => a[1].ts - b[1].ts);
    const toRemove = sorted.slice(0, out.size - MAX_OVERRIDES);
    for (const [k] of toRemove) out.delete(k);
    pruned = true;
  }

  // Se houve prune, persiste a versão limpa
  if (pruned) {
    _persistMap(out);
  }

  return out;
}

/**
 * Salva um override para um spanKey. Merge com o mapa em storage.
 * Aceita também um mapa inteiro opcional para reconciliar em uma gravação.
 *
 * @param {string} spanKey
 * @param {Object} opts
 * @param {string} opts.chose
 * @param {string[]} [opts.rejected=[]]
 * @param {number} [opts.ttl]
 * @returns {boolean} — true se gravou
 */
export function saveOverride(spanKey, opts = {}) {
  if (typeof spanKey !== 'string' || !spanKey) return false;

  const sanitized = _sanitize({
    chose: opts.chose,
    rejected: opts.rejected ?? [],
    ts: Date.now(),
    ttl: opts.ttl ?? DEFAULT_TTL_MS,
    uses: 0,
  });
  if (!sanitized) return false;

  // Carrega, muta, grava
  const map = loadOverrides();
  map.set(spanKey, sanitized);
  return _persistMap(map);
}

/**
 * Remove um override específico.
 * @param {string} spanKey
 * @returns {boolean}
 */
export function clearOverride(spanKey) {
  if (typeof spanKey !== 'string' || !spanKey) return false;
  const map = loadOverrides();
  const removed = map.delete(spanKey);
  if (removed) _persistMap(map);
  return removed;
}

/**
 * Remove todos os overrides.
 * @returns {number} — quantidade removida
 */
export function clearAllOverrides() {
  const map = loadOverrides();
  const n = map.size;
  _removeRaw();
  return n;
}

/**
 * Incrementa o contador de uso de um override existente.
 * Não lança se o override não existir.
 * @param {string} spanKey
 * @param {Map<string, Object>} [map] — mapa em memória (evita re-leitura)
 * @returns {boolean}
 */
export function touchOverride(spanKey, map = null) {
  const working = map ?? loadOverrides();
  const entry = working.get(spanKey);
  if (!entry) return false;
  working.set(spanKey, { ...entry, uses: (entry.uses ?? 0) + 1 });
  if (!map) _persistMap(working);
  return true;
}

/**
 * Persiste o mapa atual. Chamada internamente e por quem usa touchOverride.
 * @param {Map<string, Object>} map
 * @returns {boolean}
 * @private
 */
function _persistMap(map) {
  const now = Date.now();
  const out = {};
  const entries = Array.from(map.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  for (const [k, v] of entries) {
    if (_isExpired(v, now)) continue;
    out[k] = v;
  }

  try {
    return _writeRaw(JSON.stringify(out));
  } catch {
    return false;
  }
}

/**
 * Força a persistência de um mapa em memória.
 * Usado pelo NarrativeSystem para sincronizar após mutações.
 * @param {Map<string, Object>} map
 * @returns {boolean}
 */
export function persistMap(map) {
  if (!(map instanceof Map)) return false;
  return _persistMap(map);
}

// ══════════════════════════════════════════════════════════════
// CONSULTAS
// ══════════════════════════════════════════════════════════════

/**
 * Busca o override aplicável a um conjunto de chaves candidatas.
 * A primeira chave com match ganha. Devolve `{ key, entry }` ou null.
 *
 * @param {string[]} keys
 * @param {Map<string, Object>} map
 * @returns {{ key:string, entry:Object }|null}
 */
export function findOverride(keys, map) {
  if (!Array.isArray(keys) || keys.length === 0) return null;
  if (!(map instanceof Map)) return null;

  const now = Date.now();
  for (const k of keys) {
    if (typeof k !== 'string' || !k) continue;
    const entry = map.get(k);
    if (!entry) continue;
    if (_isExpired(entry, now)) {
      map.delete(k);
      continue;
    }
    return { key: k, entry };
  }
  return null;
}

/**
 * Lista todos os overrides (ordenados por ts desc).
 * @returns {Array<{ key:string, chose:string, rejected:string[], ts:number, uses:number, ttl:number }>}
 */
export function listOverrides() {
  const map = loadOverrides();
  const out = [];
  for (const [k, v] of map) {
    out.push({
      key: k,
      chose: v.chose,
      rejected: v.rejected,
      ts: v.ts,
      uses: v.uses,
      ttl: v.ttl,
    });
  }
  out.sort((a, b) => b.ts - a.ts);
  return out;
}

/**
 * Verifica se uma chave tem override.
 * @param {string} spanKey
 * @param {Map<string, Object>} [map]
 * @returns {boolean}
 */
export function hasOverride(spanKey, map = null) {
  const m = map ?? loadOverrides();
  return m.has(spanKey);
}

/**
 * Remove overrides expirados do storage. Devolve quantos foram removidos.
 * @returns {number}
 */
export function pruneExpired() {
  const before = loadOverrides();
  const n = before.size;
  _persistMap(before);
  const after = loadOverrides();
  return n - after.size;
}

// ══════════════════════════════════════════════════════════════
// ESTATÍSTICAS
// ══════════════════════════════════════════════════════════════

/**
 * Estatísticas resumidas.
 * @returns {Object}
 */
export function stats() {
  const map = loadOverrides();
  let totalUses = 0;
  let oldest = Infinity;
  let newest = 0;
  for (const v of map.values()) {
    totalUses += v.uses ?? 0;
    if (v.ts < oldest) oldest = v.ts;
    if (v.ts > newest) newest = v.ts;
  }
  return {
    count: map.size,
    maxEntries: MAX_OVERRIDES,
    defaultTtlMs: DEFAULT_TTL_MS,
    totalUses,
    oldestTs: Number.isFinite(oldest) ? oldest : null,
    newestTs: newest > 0 ? newest : null,
  };
}

/**
 * Reset para testes. Limpa storage + memória.
 * @internal
 */
export function _resetForTests() {
  _memStore.clear();
  try {
    if (_hasLocalStorage()) {
      localStorage.removeItem(NARRATIVE_STORAGE_KEYS.OVERRIDES);
    }
  } catch { /* isola */ }
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const Overrides = Object.freeze({
  DEFAULT_TTL_MS,
  MAX_OVERRIDES,
  loadOverrides,
  saveOverride,
  clearOverride,
  clearAllOverrides,
  touchOverride,
  persistMap,
  findOverride,
  listOverrides,
  hasOverride,
  pruneExpired,
  stats,
  _resetForTests,
});