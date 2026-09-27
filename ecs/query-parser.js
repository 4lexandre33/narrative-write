/**
 * @file query-parser.js
 * @module ecs
 * @description Parser do DSL de query — "A,B,!C" (must A e B, sem C).
 * @imports — (nenhum)
 * @importedBy ecs/world, ecs/query-cache
 * @level 1
 */

/**
 * Parseia uma expressão de query.
 *
 * Sintaxe:
 *   "A"          → todas com componente A
 *   "A,B"        → todas com A e B
 *   "!C"         → todas sem C
 *   "A,!C"       → com A, sem C
 *   ""           → todas
 *
 * Espaços são tolerados: " A , B , ! C " === "A,B,!C".
 *
 * @param {string} expr
 * @returns {{must: string[], mustNot: string[]}}
 */
export function parseQuery(expr) {
  if (typeof expr !== 'string') {
    throw new TypeError('[QueryParser] expressão deve ser string');
  }

  const must = [];
  const mustNot = [];
  const parts = expr.split(',').map(s => s.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.startsWith('!')) {
      const name = part.slice(1).trim();
      if (name) mustNot.push(name);
    } else {
      must.push(part);
    }
  }

  return { must, mustNot };
}

/**
 * Verifica se um conjunto de componentes casa com uma query parseada.
 * @param {Set<string>} componentSet
 * @param {{must: string[], mustNot: string[]}} parsed
 * @returns {boolean}
 */
export function matchesQuery(componentSet, parsed) {
  if (!componentSet || !parsed) return false;

  for (const name of parsed.must) {
    if (!componentSet.has(name)) return false;
  }
  for (const name of parsed.mustNot) {
    if (componentSet.has(name)) return false;
  }
  return true;
}

/**
 * Serializa uma query parseada de volta para string.
 * Útil para debug e cache keys.
 * @param {{must: string[], mustNot: string[]}} parsed
 * @returns {string}
 */
export function stringifyQuery(parsed) {
  if (!parsed) return '';
  const parts = [];
  for (const m of parsed.must || []) parts.push(m);
  for (const n of parsed.mustNot || []) parts.push(`!${n}`);
  return parts.join(',');
}

/**
 * Verifica se uma query é vazia (não filtra nada).
 * @param {{must: string[], mustNot: string[]}} parsed
 * @returns {boolean}
 */
export function isEmptyQuery(parsed) {
  if (!parsed) return true;
  return (parsed.must?.length ?? 0) === 0
      && (parsed.mustNot?.length ?? 0) === 0;
}

/**
 * Compara duas queries parseadas por igualdade estrutural.
 * @param {Object} a
 * @param {Object} b
 * @returns {boolean}
 */
export function queriesEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;

  const mustA = [...(a.must || [])].sort();
  const mustB = [...(b.must || [])].sort();
  if (mustA.length !== mustB.length) return false;
  for (let i = 0; i < mustA.length; i++) {
    if (mustA[i] !== mustB[i]) return false;
  }

  const notA = [...(a.mustNot || [])].sort();
  const notB = [...(b.mustNot || [])].sort();
  if (notA.length !== notB.length) return false;
  for (let i = 0; i < notA.length; i++) {
    if (notA[i] !== notB[i]) return false;
  }

  return true;
}