/**
 * @file hierarchy.js
 * @module core/utils
 * @description Resolução de caminhos hierárquicos + sugestões para
 *              autocomplete. Sintaxe: Pacote.Categoria.Conjunto.Frase.
 * @imports core/constants
 * @importedBy systems/phrase-system, systems/entity-system, editor/editor
 * @level 0
 *
 * Fase 13 — Ajuste: `body` das sugestões ganha `.` no final APENAS se
 * o nó tem filhos.
 *
 * Fase 13.7 — Limpeza (auditoria 25/09/2026):
 *   `hierarchicalTypes()` retornava um array hardcoded, duplicando
 *   `HIERARCHICAL_TYPES` de `core/constants.js`. Qualquer divergência
 *   entre os dois quebrava silenciosamente. Agora importa de
 *   `constants.js` (fonte única de verdade).
 *
 * Determinismo: sem Math.random / wall-clock. Nunca lança.
 */

import { COMPONENT_NAMES, HIERARCHICAL_TYPES } from '../constants.js';

// ══════════════════════════════════════════════════════════════
// MATCHING
// ══════════════════════════════════════════════════════════════

function _matchesRef(world, id, segment) {
  if (!id || !segment) return false;
  const ident = world.get(id, COMPONENT_NAMES.IDENTITY);
  if (!ident) return false;

  const normalized = String(segment).replace(/_/g, ' ');

  return (
    ident.name === segment ||
    ident.name === normalized ||
    ident.id === segment ||
    id === segment
  );
}

function _childrenOf(world, id) {
  const out = [];
  for (const other of world.allEntities()) {
    if (other === id) continue;
    const links = world.get(other, COMPONENT_NAMES.LINKS);
    if (links?.parent === id) out.push(other);
  }
  return out;
}

function _entitiesOfType(world, type) {
  const out = [];
  for (const id of world.allEntities()) {
    const ident = world.get(id, COMPONENT_NAMES.IDENTITY);
    if (ident?.type === type) out.push(id);
  }
  return out;
}

// ══════════════════════════════════════════════════════════════
// RESOLUÇÃO
// ══════════════════════════════════════════════════════════════

export function resolvePath(world, ref) {
  if (!world || typeof ref !== 'string' || !ref) return null;
  const trimmed = ref.trim();

  if (world.hasEntity(trimmed)) return trimmed;

  for (const id of world.allEntities()) {
    const ident = world.get(id, COMPONENT_NAMES.IDENTITY);
    if (ident?.id === trimmed) return id;
  }

  if (!trimmed.includes('.')) {
    const matches = world.allEntities().filter(id =>
      _matchesRef(world, id, trimmed)
    );
    return matches.length === 1 ? matches[0] : null;
  }

  const parts = trimmed.split('.').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  let candidates = world.allEntities();

  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i];
    const isLast = i === parts.length - 1;

    const matched = candidates.filter(id => _matchesRef(world, id, segment));
    if (matched.length === 0) return null;

    if (isLast) {
      return matched.length === 1 ? matched[0] : null;
    }

    const children = [];
    for (const m of matched) children.push(..._childrenOf(world, m));
    if (children.length === 0) return null;
    candidates = children;
  }

  return null;
}

export function listCandidates(world, ref) {
  if (!world || typeof ref !== 'string' || !ref) return [];
  const trimmed = ref.trim();

  const matches = world.allEntities().filter(id =>
    _matchesRef(world, id, trimmed)
  );

  return matches.map(id => {
    const ident = world.get(id, COMPONENT_NAMES.IDENTITY);
    return {
      id,
      name: ident?.name ?? id,
      shortId: ident?.id ?? '',
      type: ident?.type ?? '?',
      path: buildPath(world, id),
    };
  });
}

export function buildPath(world, id) {
  if (!world || !id) return '';

  const parts = [];
  const seen = new Set();
  let cur = id;

  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const ident = world.get(cur, COMPONENT_NAMES.IDENTITY);
    if (ident?.name) {
      parts.unshift(String(ident.name).replace(/\s+/g, '_'));
    } else if (ident?.id) {
      parts.unshift(ident.id);
    }
    const links = world.get(cur, COMPONENT_NAMES.LINKS);
    cur = links?.parent ?? null;
  }

  return parts.join('.');
}

export function buildParentPath(world, id) {
  if (!world || !id) return '';
  const links = world.get(id, COMPONENT_NAMES.LINKS);
  if (!links?.parent) return '';
  return buildPath(world, links.parent);
}

export function sameParent(world, a, b) {
  if (!world || !a || !b) return false;
  const pa = world.get(a, COMPONENT_NAMES.LINKS)?.parent ?? null;
  const pb = world.get(b, COMPONENT_NAMES.LINKS)?.parent ?? null;
  return pa !== null && pa === pb;
}

// ══════════════════════════════════════════════════════════════
// SUGESTÕES
// ══════════════════════════════════════════════════════════════

/**
 * Constrói sugestão para uma entidade. Adiciona `.` no `body` APENAS
 * se o nó tem filhos.
 * @private
 */
function _toSuggestion(world, id) {
  const ident = world.get(id, COMPONENT_NAMES.IDENTITY);
  if (!ident) return null;

  const normalized = String(ident.name).replace(/\s+/g, '_');
  const hasKids = _childrenOf(world, id).length > 0;

  return {
    id,
    trigger: ident.name,
    type: ident.type,
    source: 'hierarchy',
    shortId: ident.id,
    path: buildPath(world, id),
    body: normalized + (hasKids ? '.' : ''),
    hasChildren: hasKids,
    description: '',
  };
}

/**
 * Sugere filhos de um caminho. Se o caminho está vazio, sugere os packages.
 *
 * @param {Object} world
 * @param {string[]} segments
 * @returns {Array<Object>}
 */
export function suggestChildren(world, segments) {
  if (!world) return [];

  if (!Array.isArray(segments) || segments.length === 0) {
    return _entitiesOfType(world, 'package')
      .map(id => _toSuggestion(world, id))
      .filter(Boolean)
      .sort((a, b) => a.trigger.localeCompare(b.trigger));
  }

  const path = segments.join('.');
  const parentId = resolvePath(world, path);
  if (!parentId) return [];

  return _childrenOf(world, parentId)
    .map(id => _toSuggestion(world, id))
    .filter(Boolean)
    .sort((a, b) => a.trigger.localeCompare(b.trigger));
}

/**
 * Lista os tipos hierárquicos.
 *
 * Fase 13.7 — delega para `HIERARCHICAL_TYPES` de `core/constants.js`.
 * Retorna cópia defensiva para que o consumidor não mute o frozen.
 *
 * @returns {string[]}
 */
export function hierarchicalTypes() {
  return [...HIERARCHICAL_TYPES];
}

export function isHierarchical(type) {
  return HIERARCHICAL_TYPES.includes(type);
}

export const Hierarchy = Object.freeze({
  resolvePath,
  listCandidates,
  buildPath,
  buildParentPath,
  sameParent,
  suggestChildren,
  hierarchicalTypes,
  isHierarchical,
});