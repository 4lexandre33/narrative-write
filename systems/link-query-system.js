/**
 * @file link-query-system.js
 * @module systems
 * @description Handles link.where/to/from/tree.
 * @imports ecs/system, core/constants
 * @level 7
 *
 * Fase 13.7 — Bugfix P0-3 (auditoria 25/09/2026):
 *   `_where`, `_to` e `_from` liam `this.world.get(to, 'Type')`,
 *   mas o componente `Type` NÃO EXISTE. A coluna "type" sempre
 *   mostrava `'?'`.
 *
 *   Correção: ler `Identity.type` do componente canônico.
 */

import { System } from '../ecs/system.js';
import { COMPONENT_NAMES } from '../core/constants.js';

export class LinkQuerySystem extends System {
  constructor() { super('LinkQuerySystem'); }

  run(_line, _ctx, prev) {
    const ast = prev.ast;
    if (!ast || ast.verb !== 'link') return prev;
    if (!['where', 'to', 'from', 'tree'].includes(ast.action)) return prev;

    try {
      switch (ast.action) {
        case 'where': return this._where(prev, ast);
        case 'to':    return this._to(prev, ast);
        case 'from':  return this._from(prev, ast);
        case 'tree':  return this._tree(prev, ast);
        default:      return prev;
      }
    } catch (err) {
      return { ...prev, ok: false, halt: true, error: err.message };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // AÇÕES
  // ═══════════════════════════════════════════════════════════

  _where(prev, ast) {
    const from = this.resolve(ast.target);
    if (!from) {
      return { ...prev, ok: false, halt: true, error: `entidade não encontrada: ${ast.target}` };
    }
    const out = this.links.from(from);
    return {
      ...prev,
      ok: true,
      right: {
        kind: 'table',
        title: `Links de ${ast.target}`,
        data: out.map(({ rel, to }) => ({
          rel,
          to,
          type: this._typeOf(to),
        })),
      },
    };
  }

  _to(prev, ast) {
    const from = this.resolve(ast.from);
    if (!from) {
      return { ...prev, ok: false, halt: true, error: `origem não existe: ${ast.from}` };
    }
    const targets = this.links.from(from, ast.rel);
    return {
      ...prev,
      ok: true,
      right: {
        kind: 'table',
        title: `${ast.from}.${ast.rel} → ${targets.length} alvo(s)`,
        data: targets.map(to => ({
          to,
          type: this._typeOf(to),
        })),
      },
    };
  }

  _from(prev, ast) {
    const to = this.resolve(ast.target);
    if (!to) {
      return { ...prev, ok: false, halt: true, error: `entidade não encontrada: ${ast.target}` };
    }
    const incoming = this.links.to(to);
    return {
      ...prev,
      ok: true,
      right: {
        kind: 'table',
        title: `Quem aponta para ${ast.target}`,
        data: incoming.map(({ from, rel }) => ({
          from,
          rel,
          type: this._typeOf(from),
        })),
      },
    };
  }

  _tree(prev, ast) {
    const from = this.resolve(ast.from);
    if (!from) {
      return { ...prev, ok: false, halt: true, error: `entidade não encontrada: ${ast.from}` };
    }
    const depth = Math.max(1, parseInt(ast.opts?.depth ?? '3', 10) || 3);
    const seen = new Set();
    const tree = this._walk(from, depth, seen);
    return {
      ...prev,
      ok: true,
      right: {
        kind: 'tree',
        title: `Árvore a partir de ${ast.from}`,
        data: tree,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  /**
   * Devolve o tipo da entidade a partir de `Identity.type`.
   * Retorna `'?'` se a entidade não tem Identity.
   *
   * @param {string} id
   * @returns {string}
   * @private
   */
  _typeOf(id) {
    if (!id) return '?';
    const ident = this.world.get(id, COMPONENT_NAMES.IDENTITY);
    return ident?.type ?? '?';
  }

  _walk(id, depth, seen) {
    if (depth <= 0) {
      return { id, children: [] };
    }
    if (seen.has(id)) {
      return { id, cycle: true, children: [] };
    }
    seen.add(id);

    const node = { id, children: [] };
    for (const { rel, to } of this.links.from(id)) {
      node.children.push({ rel, ...this._walk(to, depth - 1, seen) });
    }
    return node;
  }
}