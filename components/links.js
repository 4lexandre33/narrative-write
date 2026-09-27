/**
 * @file links.js
 * @module components
 * @description Arestas nomeadas — relações entre entidades.
 * @imports core/constants
 * @importedBy systems/link-system, systems/link-query-system, ecs/link-index
 * @level 4
 */

import { COMPONENT_NAMES } from '../core/constants.js';

export const LINKS = COMPONENT_NAMES.LINKS;

/**
 * Cria um Links vazio.
 * @returns {Object}
 */
export function emptyLinks() {
  return {};
}

/**
 * Verifica se um valor é Links válido.
 * @param {any} v
 * @returns {boolean}
 */
export function isLinks(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Verifica se uma relação é multi (array) num Links.
 * @param {Object} links
 * @param {string} rel
 * @returns {boolean}
 */
export function isMultiRel(links, rel) {
  if (!links) return false;
  return Array.isArray(links[rel]);
}

/**
 * Retorna os alvos de uma relação como array (sempre).
 * @param {Object} links
 * @param {string} rel
 * @returns {string[]}
 */
export function getTargets(links, rel) {
  if (!links || !(rel in links)) return [];
  const v = links[rel];
  return Array.isArray(v) ? [...v] : [v];
}

/**
 * Retorna a relação como single (primeiro alvo) ou null.
 * @param {Object} links
 * @param {string} rel
 * @returns {string|null}
 */
export function getSingleTarget(links, rel) {
  if (!links || !(rel in links)) return null;
  const v = links[rel];
  if (Array.isArray(v)) return v[0] || null;
  return v;
}

/**
 * Aplica `set` (substitui) numa relação.
 * Retorna novo objeto (não muta).
 * @param {Object} links
 * @param {string} rel
 * @param {string} to
 * @returns {Object}
 */
export function setLink(links, rel, to) {
  if (!rel || !to) throw new Error('[Links] rel e to obrigatórios');
  return { ...(links || {}), [rel]: to };
}

/**
 * Aplica `add` (adiciona a multi, ou promove single para multi).
 * Idempotente.
 * @param {Object} links
 * @param {string} rel
 * @param {string} to
 * @returns {Object}
 */
export function addLink(links, rel, to) {
  if (!rel || !to) throw new Error('[Links] rel e to obrigatórios');
  const current = links?.[rel];

  if (current === undefined) {
    return { ...(links || {}), [rel]: [to] };
  }
  if (Array.isArray(current)) {
    if (current.includes(to)) return { ...links };
    return { ...links, [rel]: [...current, to] };
  }
  if (current === to) return { ...links };
  return { ...links, [rel]: [current, to] };
}

/**
 * Aplica `pull` (remove item ou chave).
 * Idempotente.
 * @param {Object} links
 * @param {string} rel
 * @param {string} to
 * @returns {Object}
 */
export function pullLink(links, rel, to) {
  if (!rel || !to) throw new Error('[Links] rel e to obrigatórios');
  if (!links || !(rel in links)) return { ...(links || {}) };

  const current = links[rel];

  if (Array.isArray(current)) {
    const next = current.filter(x => x !== to);
    if (next.length === current.length) return { ...links };
    return { ...links, [rel]: next };
  }
  if (current === to) {
    const out = { ...links };
    delete out[rel];
    return out;
  }
  return { ...links };
}

/**
 * Aplica `clear` (remove chave inteira).
 * Idempotente.
 * @param {Object} links
 * @param {string} rel
 * @returns {Object}
 */
export function clearLink(links, rel) {
  if (!rel) throw new Error('[Links] rel obrigatório');
  if (!links || !(rel in links)) return { ...(links || {}) };
  const out = { ...links };
  delete out[rel];
  return out;
}

/**
 * Lista todas as relações de um Links.
 * @param {Object} links
 * @returns {string[]}
 */
export function rels(links) {
  if (!links) return [];
  return Object.keys(links);
}

/**
 * Conta o número total de arestas em Links.
 * @param {Object} links
 * @returns {number}
 */
export function edgeCount(links) {
  if (!links) return 0;
  let n = 0;
  for (const v of Object.values(links)) {
    n += Array.isArray(v) ? v.length : (v ? 1 : 0);
  }
  return n;
}