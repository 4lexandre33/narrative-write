/**
 * @file operations.js
 * @module narrative-language/ir
 * @description DEPRECATED — use `catalog.js`.
 *
 * A partir do Estágio 10 (migração Norma C), este arquivo é um
 * compatibility shim para consumidores que ainda importam os nomes
 * antigos (`OPERATIONS_CATALOG`, `operationNames`, `colorFor`, etc.).
 *
 * A fonte canônica de verdade é `catalog.js`, que expõe:
 *   - CATALOG
 *   - OPERATIONS (D1..D8 com subtipos, eixos e traits)
 *   - TRAITS
 *   - ALIASES
 *   - e funções de consulta (`operationIds`, `subtypeIds`, ...)
 *
 * Este arquivo será removido em uma versão futura.
 * @imports narrative-language/ir/catalog
 * @importedBy consumidores legados
 * @level N0
 */

import {
  OPERATIONS,
  TRAITS,
  ALIASES,
  operationIds,
  getOperation,
  labelForOperation,
  colorForOperation,
  roleForOperation,
  isCoordinator as _isCoordinator,
  subtypeIds,
  isValidSubtype as _isValidSubtype,
  findSubtypeOwner,
  getSubtype,
  labelForSubtype,
  parentOf,
  traitsForSubtype,
  axisNames,
  isValidAxis,
  isValidAxisValue,
  axisValues,
  isValidTrait,
  labelForTrait,
  traitNames,
  resolveAlias,
  isAlias,
  catalogStats as _catalogStats,
  allSubtypes as _allSubtypes,
  allAxes as _allAxes,
} from './catalog.js';

// ══════════════════════════════════════════════════════════════
// AVISO DE DEPRECAÇÃO (uma vez por sessão)
// ══════════════════════════════════════════════════════════════

let _warned = false;

/**
 * Emite um aviso único de depreciação.
 * @private
 */
function _warnDeprecation() {
  if (_warned) return;
  _warned = true;
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(
      '[narrative-language] operations.js está DEPRECADO. ' +
      'Use catalog.js (Catálogo Canônico Norma C) em vez dele. ' +
      'Veja narrative-language/README.md §2 (Modelo Canônico).'
    );
  }
}

// ══════════════════════════════════════════════════════════════
// RE-EXPORTS COMPATÍVEIS
// ══════════════════════════════════════════════════════════════

/**
 * @deprecated Use `OPERATIONS` de `catalog.js`.
 * @type {Readonly<Object>}
 */
export const OPERATIONS_CATALOG = OPERATIONS;

/**
 * @deprecated Use `TRAITS` de `catalog.js`.
 * @type {Readonly<Object>}
 */
export const TRAITS_LEGACY = TRAITS;

/**
 * @deprecated Use `ALIASES` de `catalog.js`.
 * @type {Readonly<Object>}
 */
export const ALIASES_LEGACY = ALIASES;

// ══════════════════════════════════════════════════════════════
// FUNÇÕES RENOMEADAS (nomes v1 → v2)
// ══════════════════════════════════════════════════════════════

/**
 * @deprecated Use `operationIds()`.
 * @returns {string[]}
 */
export function operationNames() {
  _warnDeprecation();
  return operationIds();
}

/**
 * @deprecated Use `subtypeIds(op)`.
 * @param {string} op
 * @returns {string[]}
 */
export function subtypeNames(op) {
  _warnDeprecation();
  return subtypeIds(op);
}

/**
 * @deprecated Use `colorForOperation(op)`.
 * @param {string} op
 * @returns {string|null}
 */
export function colorFor(op) {
  _warnDeprecation();
  return colorForOperation(op);
}

/**
 * @deprecated Use `labelForOperation(op)`.
 * @param {string} op
 * @returns {string}
 */
export function labelFor(op) {
  _warnDeprecation();
  return labelForOperation(op);
}

/**
 * @deprecated Use `isCoordinator(op)` de `catalog.js`.
 * @param {string} op
 * @returns {boolean}
 */
export function isCoordinatorLegacy(op) {
  _warnDeprecation();
  return _isCoordinator(op);
}

// ══════════════════════════════════════════════════════════════
// FUNÇÕES COM ASSINATURA DIFERENTE
// ══════════════════════════════════════════════════════════════

/**
 * v1 devolvia `{ operation, subtype, spec }`.
 * v2 (`findSubtypeOwner`) devolve `{ operation, subtype }`.
 * Reconstruímos o `spec` via `getSubtype`.
 *
 * @deprecated Use `getSubtype(st)` + `findSubtypeOwner(st)`.
 * @param {string} st
 * @returns {{ operation:string, subtype:string, spec:Object }|null}
 */
export function findSubtype(st) {
  _warnDeprecation();
  const owner = findSubtypeOwner(st);
  if (!owner) return null;
  const spec = getSubtype(st);
  if (!spec) return null;
  return { operation: owner.operation, subtype: st, spec };
}

/**
 * @deprecated Use `isValidSubtype(op, st)` de `catalog.js`.
 * @param {string} op
 * @param {string} st
 * @returns {boolean}
 */
export function isValidSubtype(op, st) {
  _warnDeprecation();
  return _isValidSubtype(op, st);
}

/**
 * @deprecated Use `allSubtypes()` de `catalog.js`.
 * @returns {Array<Object>}
 */
export function allSubtypes() {
  _warnDeprecation();
  return _allSubtypes();
}

/**
 * @deprecated Use `catalogStats()` de `catalog.js`.
 * @returns {Object}
 */
export function catalogStats() {
  _warnDeprecation();
  return _catalogStats();
}

/**
 * @deprecated Use `allAxes()` de `catalog.js`.
 * @returns {Array<Object>}
 */
export function allAxes() {
  _warnDeprecation();
  return _allAxes();
}

// ══════════════════════════════════════════════════════════════
// RE-EXPORTS DIRETOS (mesmo nome, sem aviso adicional)
// ══════════════════════════════════════════════════════════════

export {
  getOperation,
  labelForSubtype,
  parentOf,
  traitsForSubtype,
  axisNames,
  isValidAxis,
  isValidAxisValue,
  axisValues,
  isValidTrait,
  labelForTrait,
  traitNames,
  resolveAlias,
  isAlias,
  roleForOperation,
};

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

/**
 * @deprecated Use `Catalog` de `catalog.js`.
 */
export const Operations = Object.freeze({
  OPERATIONS_CATALOG,
  operationNames,
  subtypeNames,
  isValidSubtype,
  findSubtype,
  allSubtypes,
  catalogStats,
  colorFor,
  labelFor,
  isCoordinatorLegacy,
  getOperation,
  labelForSubtype,
  parentOf,
  traitsForSubtype,
  axisNames,
  isValidAxis,
  isValidAxisValue,
  axisValues,
  isValidTrait,
  labelForTrait,
  traitNames,
  resolveAlias,
  isAlias,
  roleForOperation,
  allAxes,
});