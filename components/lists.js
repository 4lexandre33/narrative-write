/**
 * @file lists.js
 * @module components
 * @description Mapa de arrays de strings.
 * @imports core/constants
 * @importedBy systems/mutation-system, systems/inheritance-system
 * @level 4
 */

import { COMPONENT_NAMES } from '../core/constants.js';

export const LISTS = COMPONENT_NAMES.LISTS;

/**
 * Cria Lists a partir de um objeto de arrays.
 * @param {Object} [data={}]
 * @returns {Object}
 */
export function makeLists(data = {}) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) {
      out[k] = [...v];
    } else if (v !== undefined && v !== null) {
      out[k] = [String(v)];
    }
  }
  return out;
}

/**
 * Verifica se um valor é Lists válido.
 * @param {any} v
 * @returns {boolean}
 */
export function isLists(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Lê uma lista.
 * @param {Object} lists
 * @param {string} field
 * @returns {string[]}
 */
export function getList(lists, field) {
  const v = lists?.[field];
  return Array.isArray(v) ? [...v] : [];
}

/**
 * Aplica push (idempotente).
 * @param {Object} lists
 * @param {string} field
 * @param {string} item
 * @returns {Object}
 */
export function pushList(lists, field, item) {
  const before = getList(lists, field);
  if (before.includes(item)) return { ...(lists || {}), [field]: before };
  return { ...(lists || {}), [field]: [...before, item] };
}

/**
 * Aplica pull (idempotente).
 * @param {Object} lists
 * @param {string} field
 * @param {string} item
 * @returns {Object}
 */
export function pullList(lists, field, item) {
  const before = getList(lists, field);
  const next = before.filter(x => x !== item);
  return { ...(lists || {}), [field]: next };
}

/**
 * Substitui uma lista inteira.
 * @param {Object} lists
 * @param {string} field
 * @param {string[]} values
 * @returns {Object}
 */
export function setList(lists, field, values) {
  const arr = Array.isArray(values) ? [...values] : [];
  return { ...(lists || {}), [field]: arr };
}

/**
 * Lista os campos.
 * @param {Object} lists
 * @returns {string[]}
 */
export function fields(lists) {
  return lists ? Object.keys(lists) : [];
}