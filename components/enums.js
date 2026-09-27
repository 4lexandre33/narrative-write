/**
 * @file enums.js
 * @module components
 * @description Mapa de escolha única (string por campo).
 * @imports core/constants
 * @importedBy systems/mutation-system, systems/inheritance-system
 * @level 4
 */

import { COMPONENT_NAMES } from '../core/constants.js';

export const ENUMS = COMPONENT_NAMES.ENUMS;

/**
 * Cria Enums a partir de um objeto.
 * @param {Object} [data={}]
 * @returns {Object}
 */
export function makeEnums(data = {}) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && v !== null && v !== '') {
      out[k] = String(v);
    }
  }
  return out;
}

/**
 * Verifica se um valor é Enums válido.
 * @param {any} v
 * @returns {boolean}
 */
export function isEnums(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Lê um valor de enum.
 * @param {Object} enums
 * @param {string} field
 * @returns {string|null}
 */
export function getEnum(enums, field) {
  return enums?.[field] ?? null;
}

/**
 * Define um valor de enum.
 * @param {Object} enums
 * @param {string} field
 * @param {string} value
 * @returns {Object}
 */
export function setEnum(enums, field, value) {
  if (value === null || value === undefined || value === '') {
    const out = { ...(enums || {}) };
    delete out[field];
    return out;
  }
  return { ...(enums || {}), [field]: String(value) };
}

/**
 * Lista os campos.
 * @param {Object} enums
 * @returns {string[]}
 */
export function fields(enums) {
  return enums ? Object.keys(enums) : [];
}