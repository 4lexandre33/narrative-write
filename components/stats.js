/**
 * @file stats.js
 * @module components
 * @description Mapa numérico de atributos.
 * @imports core/constants
 * @importedBy systems/mutation-system, systems/inheritance-system, systems/query-system
 * @level 4
 */

import { COMPONENT_NAMES } from '../core/constants.js';

export const STATS = COMPONENT_NAMES.STATS;

/**
 * Verifica se um valor é Stats válido.
 * @param {any} v
 * @returns {boolean}
 */
export function isStats(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Cria Stats a partir de um objeto, forçando valores numéricos.
 * @param {Object} [data={}]
 * @returns {Object}
 */
export function makeStats(data = {}) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

/**
 * Lê um campo de Stats.
 * @param {Object} stats
 * @param {string} field
 * @returns {number}
 */
export function getStat(stats, field) {
  const n = stats?.[field];
  return Number.isFinite(n) ? n : 0;
}

/**
 * Verifica se um campo está definido em Stats.
 * @param {Object} stats
 * @param {string} field
 * @returns {boolean}
 */
export function hasStat(stats, field) {
  return stats && Object.prototype.hasOwnProperty.call(stats, field);
}

/**
 * Aplica soma.
 * @param {Object} stats
 * @param {string} field
 * @param {number} amount
 * @returns {Object}
 */
export function addStat(stats, field, amount) {
  const before = getStat(stats, field);
  const after = before + Number(amount);
  return { ...(stats || {}), [field]: after };
}

/**
 * Aplica subtração.
 * @param {Object} stats
 * @param {string} field
 * @param {number} amount
 * @returns {Object}
 */
export function subStat(stats, field, amount) {
  return addStat(stats, field, -Number(amount));
}

/**
 * Aplica set (substitui).
 * @param {Object} stats
 * @param {string} field
 * @param {number} value
 * @returns {Object}
 */
export function setStat(stats, field, value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`[Stats] valor não numérico: ${value}`);
  }
  return { ...(stats || {}), [field]: n };
}

/**
 * Lista os campos de Stats.
 * @param {Object} stats
 * @returns {string[]}
 */
export function fields(stats) {
  return stats ? Object.keys(stats) : [];
}