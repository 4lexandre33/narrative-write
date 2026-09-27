/**
 * @file rule.js
 * @module components
 * @description Componentes de regra — On/If/Do + meta.
 * @imports core/constants
 * @importedBy systems/rule-system, systems/manual-rule-system, systems/audit-system
 * @level 4
 */

import { COMPONENT_NAMES, RULE_MODES } from '../core/constants.js';

export const RULE       = COMPONENT_NAMES.RULE;
export const RULE_META  = COMPONENT_NAMES.RULE_META;

/**
 * Cria Rule.
 * @param {Object} opts
 * @param {string} opts.on
 * @param {string} [opts.if='true']
 * @param {string} opts.do
 * @returns {Object}
 */
export function makeRule({ on, if: ifExpr = 'true', do: doExpr }) {
  if (!on) throw new Error('[Rule] on obrigatório');
  if (!doExpr) throw new Error('[Rule] do obrigatório');
  return {
    on: String(on).trim(),
    if: String(ifExpr || 'true').trim(),
    do: String(doExpr).trim(),
  };
}

/**
 * Cria RuleMeta.
 * @param {Object} opts
 * @param {string} opts.declaredAt — tick
 * @param {string} [opts.mode='auto']
 * @param {string} [opts.tag=null]
 * @returns {Object}
 */
export function makeRuleMeta({ declaredAt, mode = 'auto', tag = null }) {
  if (!RULE_MODES.includes(mode)) {
    throw new Error(`[RuleMeta] modo inválido: ${mode}`);
  }
  return {
    declaredAt: String(declaredAt),
    mode,
    tag: tag ? String(tag) : null,
    firedCount: 0,
    lastFiredAt: null,
    lastTrigger: null,
  };
}

/**
 * Atualiza RuleMeta após um fire.
 * @param {Object} meta
 * @param {string} tick
 * @param {string} [trigger='auto']
 * @returns {Object}
 */
export function markFired(meta, tick, trigger = 'auto') {
  return {
    ...meta,
    firedCount: (meta?.firedCount ?? 0) + 1,
    lastFiredAt: String(tick),
    lastTrigger: trigger,
  };
}

/**
 * Verifica se a regra está em modo automático.
 * @param {Object} meta
 * @returns {boolean}
 */
export function isAuto(meta) {
  return meta?.mode === 'auto';
}

/**
 * Verifica se a regra está em modo manual.
 * @param {Object} meta
 * @returns {boolean}
 */
export function isManual(meta) {
  return meta?.mode === 'manual';
}

/**
 * Verifica se a regra nunca disparou.
 * @param {Object} meta
 * @returns {boolean}
 */
export function neverFired(meta) {
  return (meta?.firedCount ?? 0) === 0;
}