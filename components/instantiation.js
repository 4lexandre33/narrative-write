/**
 * @file instantiation.js
 * @module components
 * @description Componentes de blueprint/instância/herança.
 * @imports core/constants
 * @importedBy systems/instantiation-system, systems/inheritance-system, systems/stale-system
 * @level 4
 */

import { COMPONENT_NAMES, MERGE_DEFAULT } from '../core/constants.js';

export const IS_BLUEPRINT      = COMPONENT_NAMES.IS_BLUEPRINT;
export const INSTANCE_OF       = COMPONENT_NAMES.INSTANCE_OF;
export const INSTANCE_COUNTER  = COMPONENT_NAMES.INSTANCE_COUNTER;
export const INSTANCE_CONFIG   = COMPONENT_NAMES.INSTANCE_CONFIG;
export const DERIVES_FROM      = COMPONENT_NAMES.DERIVES_FROM;
export const MERGE_POLICY      = COMPONENT_NAMES.MERGE_POLICY;
export const TOMBSTONES        = COMPONENT_NAMES.TOMBSTONES;
export const STALE             = COMPONENT_NAMES.STALE;
export const ORPHANED          = COMPONENT_NAMES.ORPHANED;
export const BLUEPRINT_FIELDS  = 'BlueprintFields';

/**
 * Config default de auto-numeração.
 * @returns {Object}
 */
export function defaultInstanceConfig() {
  return {
    namePattern: '{bp} {n}',
    idPattern:   '{bp}-{n}',
    startAt:     1,
    pad:         0,
  };
}

/**
 * Cria IsBlueprint.
 * @param {boolean} [v=true]
 * @returns {Object}
 */
export function makeIsBlueprint(v = true) {
  return { value: !!v };
}

/**
 * Cria InstanceOf apontando para um blueprint.
 * @param {string} blueprintId
 * @returns {Object}
 */
export function makeInstanceOf(blueprintId) {
  if (!blueprintId) throw new Error('[InstanceOf] blueprintId obrigatório');
  return { id: String(blueprintId) };
}

/**
 * Cria InstanceCounter.
 * @param {number} [value=0]
 * @returns {Object}
 */
export function makeInstanceCounter(value = 0) {
  return { value: Number(value) || 0 };
}

/**
 * Cria InstanceConfig.
 * @param {Object} [opts={}]
 * @returns {Object}
 */
export function makeInstanceConfig(opts = {}) {
  return { ...defaultInstanceConfig(), ...opts };
}

/**
 * Cria DerivesFrom.
 * @param {string[]} [ids=[]]
 * @returns {Object}
 */
export function makeDerivesFrom(ids = []) {
  return { ids: Array.isArray(ids) ? [...ids] : [ids] };
}

/**
 * Cria MergePolicy.
 * @param {Object} [policy={}]
 * @returns {Object}
 */
export function makeMergePolicy(policy = {}) {
  return { ...MERGE_DEFAULT, ...policy };
}

/**
 * Cria BlueprintFields.
 * @param {Object} [opts={}]
 * @param {string[]|null} [opts.copy=null]
 * @param {Object} [opts.override={}]
 * @returns {Object}
 */
export function makeBlueprintFields({ copy = null, override = {} } = {}) {
  return {
    copy: Array.isArray(copy) ? [...copy] : null,
    override: { ...override },
  };
}

/**
 * Cria Stale.
 * @param {string} tick
 * @param {string} [cause='']
 * @returns {Object}
 */
export function makeStale(tick, cause = '') {
  return { value: true, at: String(tick), cause: String(cause) };
}

/**
 * Cria Orphaned.
 * @param {string} tick
 * @param {string} [cause='']
 * @returns {Object}
 */
export function makeOrphaned(tick, cause = '') {
  return { value: true, at: String(tick), cause: String(cause) };
}

/**
 * Formata nome de instância com pattern.
 * @param {string} pattern — ex: '{bp} {n}'
 * @param {string} base — nome do blueprint
 * @param {number} n — número
 * @param {number} [pad=0] — zeros à esquerda
 * @returns {string}
 */
export function formatInstanceName(pattern, base, n, pad = 0) {
  const num = pad > 0 ? String(n).padStart(pad, '0') : String(n);
  return String(pattern).replace('{bp}', base).replace('{n}', num);
}