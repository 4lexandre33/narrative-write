/**
 * @file placeholders.js
 * @module components
 * @description Definições de placeholders tipados (template).
 * @imports core/constants
 * @importedBy systems/template-system, editor/inline-template
 * @level 4
 */

import { COMPONENT_NAMES } from '../core/constants.js';

export const PLACEHOLDER_DEFS = COMPONENT_NAMES.PLACEHOLDER_DEFS;

/**
 * Tipos válidos de placeholder.
 */
export const PLACEHOLDER_TYPES = [
  'entity.character',
  'entity.location',
  'entity.item',
  'entity.faction',
  'entity.custom',
  'enum',
  'number',
  'text',
  'date',
];

/**
 * Cria PlaceholderDefs.
 * @param {Array<{name:string,type:string,opts?:any}>} defs
 * @returns {Object}
 */
export function makePlaceholderDefs(defs = []) {
  const normalized = (Array.isArray(defs) ? defs : [])
    .filter(d => d && d.name)
    .map(d => ({
      name: String(d.name),
      type: PLACEHOLDER_TYPES.includes(d.type) ? d.type : 'text',
      opts: d.opts ?? null,
    }));
  return { defs: normalized };
}

/**
 * Verifica se um valor é PlaceholderDefs válido.
 * @param {any} v
 * @returns {boolean}
 */
export function isPlaceholderDefs(v) {
  return !!v && typeof v === 'object' && Array.isArray(v.defs);
}

/**
 * Lista os nomes dos placeholders.
 * @param {Object} defs
 * @returns {string[]}
 */
export function names(defs) {
  return (defs?.defs || []).map(d => d.name);
}

/**
 * Busca um placeholder por nome.
 * @param {Object} defs
 * @param {string} name
 * @returns {Object|null}
 */
export function findDef(defs, name) {
  return (defs?.defs || []).find(d => d.name === name) || null;
}

/**
 * Verifica se um placeholder é do tipo entidade.
 * @param {Object} def
 * @returns {boolean}
 */
export function isEntityDef(def) {
  return !!def && typeof def.type === 'string' && def.type.startsWith('entity.');
}

/**
 * Verifica se um placeholder é enum.
 * @param {Object} def
 * @returns {boolean}
 */
export function isEnumDef(def) {
  return def?.type === 'enum';
}

/**
 * Verifica se um placeholder é number.
 * @param {Object} def
 * @returns {boolean}
 */
export function isNumberDef(def) {
  return def?.type === 'number';
}