/**
 * @file identity-system.js
 * @module systems
 * @description Handles id.show / id.rename / id.describe / id.retype.
 * @imports ecs/system, core/constants
 * @level 7
 */

import { System } from '../ecs/system.js';
import { COMPONENT_NAMES, ENTITY_TYPES } from '../core/constants.js';

export class IdentitySystem extends System {
  constructor() { super('IdentitySystem'); }

  run(_line, _ctx, prev) {
    const ast = prev.ast;
    if (!ast || ast.verb !== 'id') return prev;

    try {
      switch (ast.action) {
        case 'show':     return this._show(prev, ast);
        case 'rename':   return this._update(prev, ast, 'name');
        case 'describe': return this._update(prev, ast, 'description');
        case 'retype':   return this._retype(prev, ast);
        default:         return prev;
      }
    } catch (err) {
      return { ...prev, ok: false, halt: true, error: err.message };
    }
  }

  _show(prev, ast) {
    const target = this.resolve(ast.target);
    if (!target) return { ...prev, ok: false, halt: true, error: `entidade não encontrada: ${ast.target}` };
    return { ...prev, ok: true, right: {
      kind: 'card',
      title: 'Identidade',
      data: this.world.get(target, COMPONENT_NAMES.IDENTITY),
    }};
  }

  _update(prev, ast, field) {
    const target = this.resolve(ast.target);
    if (!target) return { ...prev, ok: false, halt: true, error: `entidade não encontrada: ${ast.target}` };

    const before = this.world.get(target, COMPONENT_NAMES.IDENTITY);
    this.world.set(target, COMPONENT_NAMES.IDENTITY, { [field]: ast.value });
    const after = this.world.get(target, COMPONENT_NAMES.IDENTITY);

    return { ...prev, ok: true, mutated: true, identity: {
      op: ast.action, target, field,
      before: before?.[field], after: after?.[field],
    }};
  }

  _retype(prev, ast) {
    if (!ENTITY_TYPES.includes(ast.value)) {
      return { ...prev, ok: false, halt: true, error: `tipo inválido: ${ast.value}` };
    }
    const target = this.resolve(ast.target);
    if (!target) return { ...prev, ok: false, halt: true, error: `entidade não encontrada: ${ast.target}` };

    const before = this.world.get(target, COMPONENT_NAMES.IDENTITY);
    this.world.set(target, COMPONENT_NAMES.IDENTITY, { type: ast.value });
    return { ...prev, ok: true, mutated: true, identity: {
      op: 'retype', target, field: 'type',
      before: before?.type, after: ast.value,
    }};
  }
}