/**
 * @file tags.js
 * @module components
 * @description Conjunto de strings livres (tags).
 * @imports core/constants
 * @importedBy systems/mutation-system, systems/search-system
 * @level 4
 */

import { COMPONENT_NAMES } from '../core/constants.js';

export const TAGS = COMPONENT_NAMES.TAGS;

/**
 * Cria Tags a partir de array.
 * @param {string[]|Set<string>} [values=[]]
 * @returns {Object}
 */
export function makeTags(values = []) {
  const arr = Array.isArray(values) ? values : Array.from(values);
  return { values: [...new Set(arr.filter(Boolean).map(String))] };
}

/**
 * Verifica se um valor é Tags válido.
 * @param {any} v
 * @returns {boolean}
 */
export function isTags(v) {
  return !!v && typeof v === 'object' && Array.isArray(v.values);
}

/**
 * Verifica se uma tag está presente.
 * @param {Object} tags
 * @param {string} tag
 * @returns {boolean}
 */
export function hasTag(tags, tag) {
  return Array.isArray(tags?.values) && tags.values.includes(tag);
}

/**
 * Adiciona uma tag (idempotente).
 * @param {Object} tags
 * @param {string} tag
 * @returns {Object}
 */
export function addTag(tags, tag) {
  const before = Array.isArray(tags?.values) ? tags.values : [];
  if (before.includes(tag)) return { values: [...before] };
  return { values: [...before, tag] };
}

/**
 * Remove uma tag (idempotente).
 * @param {Object} tags
 * @param {string} tag
 * @returns {Object}
 */
export function removeTag(tags, tag) {
  const before = Array.isArray(tags?.values) ? tags.values : [];
  return { values: before.filter(t => t !== tag) };
}

/**
 * Lista as tags.
 * @param {Object} tags
 * @returns {string[]}
 */
export function tagValues(tags) {
  return Array.isArray(tags?.values) ? [...tags.values] : [];
}