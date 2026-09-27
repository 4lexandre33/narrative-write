/**
 * @file knowledge.js
 * @module components
 * @description O que uma entidade sabe — mapa fato→tick.
 * @imports core/constants
 * @importedBy systems/knowledge-system
 * @level 4
 */

import { COMPONENT_NAMES } from '../core/constants.js';

export const KNOWS = COMPONENT_NAMES.KNOWS;

/**
 * Cria Knows vazio.
 * @returns {Object}
 */
export function makeKnows() {
  return { facts: {} };
}

/**
 * Verifica se um valor é Knows válido.
 * @param {any} v
 * @returns {boolean}
 */
export function isKnows(v) {
  return !!v && typeof v === 'object' && v.facts && typeof v.facts === 'object';
}

/**
 * Verifica se uma entidade sabe um fato.
 * @param {Object} knows
 * @param {string} fact
 * @returns {boolean}
 */
export function knowsFact(knows, fact) {
  return !!knows?.facts && Object.prototype.hasOwnProperty.call(knows.facts, fact);
}

/**
 * Tick em que um fato foi aprendido (ou null).
 * @param {Object} knows
 * @param {string} fact
 * @returns {string|null}
 */
export function learnedAt(knows, fact) {
  return knows?.facts?.[fact] ?? null;
}

/**
 * Registra o aprendizado de um fato (idempotente).
 * @param {Object} knows
 * @param {string} fact
 * @param {string} tick
 * @returns {Object}
 */
export function learn(knows, fact, tick) {
  const facts = { ...(knows?.facts || {}) };
  if (Object.prototype.hasOwnProperty.call(facts, fact)) {
    return { facts };
  }
  facts[fact] = String(tick);
  return { facts };
}

/**
 * Remove um fato (idempotente).
 * @param {Object} knows
 * @param {string} fact
 * @returns {Object}
 */
export function forget(knows, fact) {
  const facts = { ...(knows?.facts || {}) };
  delete facts[fact];
  return { facts };
}

/**
 * Lista todos os fatos.
 * @param {Object} knows
 * @returns {Array<{fact:string, learnedAt:string}>}
 */
export function facts(knows) {
  if (!knows?.facts) return [];
  return Object.entries(knows.facts).map(([fact, at]) => ({ fact, learnedAt: at }));
}