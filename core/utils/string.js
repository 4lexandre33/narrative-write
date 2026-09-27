/**
 * @file string.js
 * @module core/utils
 * @description Helpers de string — slug, normalize, capitalize, prefix, diacritics.
 * @imports — (nenhum)
 * @importedBy ecs/shortcode-id, systems/search-system, systems/identity-system, ui/*
 * @level 0
 */

/**
 * Remove acentos/diacríticos de uma string.
 * @param {string} str
 * @returns {string}
 */
export function stripDiacritics(str) {
  if (typeof str !== 'string') return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normaliza uma string: minúsculas, sem acentos, trim.
 * @param {string} str
 * @returns {string}
 */
export function normalize(str) {
  return stripDiacritics(String(str || '')).toLowerCase().trim();
}

/**
 * Gera um slug a partir de um nome.
 * Remove acentos, mantém letras/números, trunca em maxLen.
 * @param {string} name
 * @param {number} [maxLen=3]
 * @returns {string}
 */
export function slug(name, maxLen = 3) {
  const clean = stripDiacritics(String(name || ''))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!clean) return 'XXX';
  return clean.slice(0, maxLen);
}

/**
 * Capitaliza a primeira letra.
 * @param {string} str
 * @returns {string}
 */
export function capitalize(str) {
  const s = String(str || '');
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Verifica se uma string começa com algum dos prefixos.
 * @param {string} str
 * @param {string[]} prefixes
 * @returns {boolean}
 */
export function startsWithAny(str, prefixes) {
  const s = String(str || '');
  for (const p of prefixes || []) {
    if (s.startsWith(p)) return true;
  }
  return false;
}

/**
 * Adiciona padding à esquerda até o comprimento desejado.
 * @param {string|number} str
 * @param {number} len
 * @param {string} [ch='0']
 * @returns {string}
 */
export function padLeft(str, len, ch = '0') {
  const s = String(str);
  if (s.length >= len) return s;
  return ch.repeat(len - s.length) + s;
}

/**
 * Adiciona padding à direita até o comprimento desejado.
 * @param {string|number} str
 * @param {number} len
 * @param {string} [ch=' ']
 * @returns {string}
 */
export function padRight(str, len, ch = ' ') {
  const s = String(str);
  if (s.length >= len) return s;
  return s + ch.repeat(len - s.length);
}

/**
 * Trunca uma string com ellipsis.
 * @param {string} str
 * @param {number} maxLen
 * @param {string} [ellipsis='…']
 * @returns {string}
 */
export function truncate(str, maxLen, ellipsis = '…') {
  const s = String(str || '');
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - ellipsis.length) + ellipsis;
}

/**
 * Escapa uma string para uso em RegExp.
 * @param {string} str
 * @returns {string}
 */
export function escapeRegExp(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Conta ocorrências de uma substring.
 * @param {string} str
 * @param {string} sub
 * @returns {number}
 */
export function countOccurrences(str, sub) {
  if (!sub) return 0;
  const s = String(str || '');
  let n = 0;
  let i = 0;
  while ((i = s.indexOf(sub, i)) !== -1) {
    n++;
    i += sub.length;
  }
  return n;
}

/**
 * Extrai candidato de atalho de uma linha até o cursor.
 * Última "palavra" (delimitada por espaço).
 * @param {string} text
 * @param {number} cursorPos
 * @returns {string}
 */
export function extractShortcutCandidate(text, cursorPos) {
  const safeText = String(text || '');
  const pos = typeof cursorPos === 'number' ? cursorPos : safeText.length;
  const before = safeText.substring(0, pos);
  const lines = before.split('\n');
  const line = lines[lines.length - 1] || '';

  if (line.includes('=')) {
    const eqIdx = line.lastIndexOf('=');
    const prefix = line.substring(0, eqIdx);
    const lastSpace = Math.max(prefix.lastIndexOf(' '), prefix.lastIndexOf('\t'));
    return line.substring(lastSpace + 1).trimStart();
  }

  const lastSpace = line.lastIndexOf(' ');
  return lastSpace >= 0 ? line.substring(lastSpace + 1) : line;
}

/**
 * Separa uma string por vírgulas, trim, remove vazios.
 * @param {string} str
 * @returns {string[]}
 */
export function splitCsv(str) {
  return String(str || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Junta itens com separador, removendo vazios.
 * @param {string[]} items
 * @param {string} [sep=', ']
 * @returns {string}
 */
export function joinClean(items, sep = ', ') {
  return (items || []).filter(Boolean).join(sep);
}