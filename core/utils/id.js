/**
 * @file id.js
 * @module core/utils
 * @description Helpers de id — random, base64url, hash, uuid.
 * @imports — (nenhum)
 * @importedBy ecs/shortcode-id, ecs/snapshot, systems/export-system
 * @level 0
 */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Gera um id aleatório curto.
 * Formato: `<prefix><timestamp36><random>`.
 * @param {string} [prefix='e']
 * @returns {string}
 */
export function randomId(prefix = 'e') {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}${t}${r}`;
}

/**
 * Gera um UUID v4.
 * Usa crypto.randomUUID se disponível.
 * @returns {string}
 */
export function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // fallback RFC4122 v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Codifica string UTF-8 para base64url (sem padding).
 * @param {string} str
 * @returns {string}
 */
export function base64urlEncode(str) {
  try {
    const utf8 = unescape(encodeURIComponent(String(str)));
    const b64 = btoa(utf8);
    return b64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  } catch {
    return '';
  }
}

/**
 * Decodifica string base64url (sem padding) para UTF-8.
 * @param {string} encoded
 * @returns {string}
 */
export function base64urlDecode(encoded) {
  if (!encoded) return '';
  try {
    const normalized = String(encoded)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const utf8 = atob(padded);
    return decodeURIComponent(escape(utf8));
  } catch {
    return '';
  }
}

/**
 * Hash simples (djb2) → base36.
 * Uso: agrupamento, cache keys, dedup leve. Não é criptográfico.
 * @param {string} str
 * @returns {string}
 */
export function shortHash(str) {
  const s = String(str || '');
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Gera bytes aleatórios como Uint8Array.
 * @param {number} n
 * @returns {Uint8Array}
 */
export function randomBytes(n) {
  const arr = new Uint8Array(n);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < n; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return arr;
}

/**
 * Gera uma string aleatória de comprimento n (base64url chars).
 * @param {number} n
 * @returns {string}
 */
export function randomString(n) {
  const bytes = randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i++) {
    out += BASE64_ALPHABET[bytes[i] % BASE64_ALPHABET.length];
  }
  return out;
}