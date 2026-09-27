/**
 * @file flags.js
 * @module components
 * @description Conjunto de flags booleanas (presença = true).
 * @imports core/constants
 * @importedBy systems/mutation-system, systems/inheritance-system, systems/rule-system
 * @level 4
 */

import { COMPONENT_NAMES } from '../core/constants.js';

export const FLAGS = COMPONENT_NAMES.FLAGS;

/**
 * Cria Flags a partir de array ou Set.
 * @param {string[]|Set<string>} [values=[]]
 * @returns {Object}
 */
export function makeFlags(values = []) {
  const arr = Array.isArray(values) ? values : Array.from(values);
  return { values: [...new Set(arr.filter(Boolean).map(String))] };
}

/**
 * Verifica se um valor é Flags válido.
 * @param {any} v
 * @returns {boolean}
 */
export function isFlags(v) {
  return !!v && typeof v === 'object' && Array.isArray(v.values);
}

/**
 * Verifica se um flag está ativo.
 * @param {Object} flags
 * @param {string} flag
 * @returns {boolean}
 */
export function hasFlag(flags, flag) {
  return Array.isArray(flags?.values) && flags.values.includes(flag);
}

/**
 * Liga um flag (idempotente).
 * @param {Object} flags
 * @param {string} flag
 * @returns {Object}
 */
export function flagOn(flags, flag) {
  const before = Array.isArray(flags?.values) ? flags.values : [];
  if (before.includes(flag)) return { values: [...before] };
  return { values: [...before, flag] };
}

/**
 * Desliga um flag (idempotente).
 * @param {Object} flags
 * @param {string} flag
 * @returns {Object}
 */
export function flagOff(flags, flag) {
  const before = Array.isArray(flags?.values) ? flags.values : [];
  return { values: before.filter(f => f !== flag) };
}

/**
 * Lista os flags ativos.
 * @param {Object} flags
 * @returns {string[]}
 */
export function flagValues(flags) {
  return Array.isArray(flags?.values) ? [...flags.values] : [];
}