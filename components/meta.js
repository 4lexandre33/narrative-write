/**
 * @file meta.js
 * @module components
 * @description Metadata de qualquer entidade (tick de criação/atualização, builtin, dirty).
 * @imports core/constants
 * @importedBy systems/entity-system, systems/instantiation-system,
 *             systems/rule-system, systems/snippet-system, schemas/seed-builder
 * @level 4
 *
 * Fase 3 — Refatoração arquitetural:
 *   `createdAt` e `updatedAt` armazenam **ticks** (ex.: 'T0', 'T5'),
 *   não wall-clock ISO. Motivo: o sistema é determinístico por tick;
 *   `dif`, `frk.merge`, `replay` e `regression` comparam estados entre
 *   execuções. Timestamps de relógio de parede introduzem divergências
 *   espúrias a cada milissegundo — duas execuções da mesma sequência
 *   produzem mundos estruturalmente idênticos mas com `Meta` diferente.
 *   O tick é a coordenada narrativa; é ele que o escritor usa para
 *   referenciar o passado da história.
 *
 *   A informação autoral "quando escrevi isto" continua disponível no
 *   nível do documento, via `PersistenceSystem` (`state.savedAt`).
 */

import { COMPONENT_NAMES } from '../core/constants.js';

export const META = COMPONENT_NAMES.META;

/**
 * Cria Meta com tick de criação = tick de atualização.
 * @param {Object} [opts={}]
 * @param {boolean} [opts.builtin=false]
 * @param {string} [opts.tick='T0'] — tick em que a entidade é criada
 * @returns {Object}
 */
export function makeMeta({ builtin = false, tick = 'T0' } = {}) {
  const t = String(tick || 'T0');
  return {
    createdAt: t,
    updatedAt: t,
    builtin: !!builtin,
    dirty: false,
  };
}

/**
 * Verifica se um valor é Meta válido.
 * @param {any} v
 * @returns {boolean}
 */
export function isMeta(v) {
  return !!v && typeof v === 'object' && typeof v.createdAt === 'string';
}

/**
 * Marca Meta como atualizado no tick dado.
 * @param {Object} meta
 * @param {string} [tick='T0']
 * @returns {Object}
 */
export function touch(meta, tick = 'T0') {
  return { ...(meta || {}), updatedAt: String(tick || 'T0') };
}

/**
 * Marca Meta como dirty (precisa persistir).
 * @param {Object} meta
 * @returns {Object}
 */
export function markDirty(meta) {
  return { ...(meta || {}), dirty: true };
}

/**
 * Limpa flag dirty.
 * @param {Object} meta
 * @returns {Object}
 */
export function markClean(meta) {
  return { ...(meta || {}), dirty: false };
}

/**
 * Verifica se Meta está dirty.
 * @param {Object} meta
 * @returns {boolean}
 */
export function isDirty(meta) {
  return !!meta?.dirty;
}