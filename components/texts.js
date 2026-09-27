/**
 * @file texts.js
 * @module components
 * @description Mapa de strings livres (bio, notas).
 * @imports core/constants
 * @importedBy systems/mutation-system, systems/audit-system
 * @level 4
 */

import { COMPONENT_NAMES } from '../core/constants.js';

export const TEXTS = COMPONENT_NAMES.TEXTS;

/**
 * Cria Texts a partir de um objeto.
 * @param {Object} [data={}]
 * @returns {Object}
 */
export function makeTexts(data = {}) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && v !== null) out[k] = String(v);
  }
  return out;
}

/**
 * Verifica se um valor é Texts válido.
 * @param {any} v
 * @returns {boolean}
 */
export function isTexts(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Lê um texto.
 * @param {Object} texts
 * @param {string} field
 * @returns {string}
 */
export function getText(texts, field) {
  return texts?.[field] ?? '';
}

/**
 * Define um texto (substitui).
 * @param {Object} texts
 * @param {string} field
 * @param {string} value
 * @returns {Object}
 */
export function setText(texts, field, value) {
  return { ...(texts || {}), [field]: String(value ?? '') };
}

/**
 * Concatena a um texto existente.
 * @param {Object} texts
 * @param {string} field
 * @param {string} suffix
 * @param {string} [sep=' ']
 * @returns {Object}
 */
export function concatText(texts, field, suffix, sep = ' ') {
  const before = getText(texts, field);
  const next = before ? `${before}${sep}${suffix}` : String(suffix);
  return { ...(texts || {}), [field]: next };
}

/**
 * Lista os campos.
 * @param {Object} texts
 * @returns {string[]}
 */
export function fields(texts) {
  return texts ? Object.keys(texts) : [];
}