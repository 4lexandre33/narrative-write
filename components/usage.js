/**
 * @file usage.js
 * @module components
 * @description Contador de uso (para snippets, frases).
 * @imports core/constants
 * @importedBy — (atualmente nenhum)
 * @level 4
 *
 * Fase 13.7 — Limpeza (auditoria 25/09/2026):
 *   Removidas as funções `increment`, `decrement` e `value` — nunca
 *   importadas em nenhum lugar. O incremento de contador não é
 *   implementado no código atual (snippets não registram uso).
 *
 *   `USAGE_COUNT` e `makeUsageCount` são mantidos porque definem o
 *   formato canônico do componente e são usados indiretamente via
 *   `COMPONENT_NAMES.USAGE_COUNT` no `schemas/builtin-components.js`.
 *
 *   O arquivo permanece neste caminho para manter a simetria com os
 *   demais `components/*.js` (cada um define um componente).
 */

import { COMPONENT_NAMES } from '../core/constants.js';

export const USAGE_COUNT = COMPONENT_NAMES.USAGE_COUNT;

/**
 * Cria UsageCount.
 * @param {number} [value=0]
 * @returns {Object}
 */
export function makeUsageCount(value = 0) {
  return { value: Number(value) || 0 };
}