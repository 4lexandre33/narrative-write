/**
 * @file knowledge-system.js
 * @module systems
 * @description Handles kno.learn/forget/show/at.
 * @imports ecs/system, components/knowledge, core/constants, core/utils/time
 * @level 7
 */

import { System } from '../ecs/system.js';
import { COMPONENT_NAMES } from '../core/constants.js';
import * as Know from '../components/knowledge.js';
import { tickToNumber } from '../core/utils/time.js';

export class KnowledgeSystem extends System {
  constructor() { super('KnowledgeSystem'); }

  run(_line, ctx, prev) {
    const ast = prev.ast;
    if (!ast || ast.verb !== 'kno') return prev;

    const target = this.resolve(ast.target);
    if (!target) return { ...prev, ok: false, halt: true, error: `entidade não encontrada: ${ast.target}` };

    try {
      switch (ast.action) {
        case 'learn':  return this._learn(prev, ast, target, ctx);
        case 'forget': return this._forget(prev, ast, target);
        case 'show':   return this._show(prev, ast, target);
        case 'at':     return this._at(prev, ast, target);
        default:       return prev;
      }
    } catch (err) {
      return { ...prev, ok: false, halt: true, error: err.message };
    }
  }

  _learn(prev, ast, target, ctx) {
    let knows = this.world.get(target, COMPONENT_NAMES.KNOWS);
    if (!knows) {
      this.world.addComponent(target, COMPONENT_NAMES.KNOWS, Know.makeKnows());
      knows = this.world.get(target, COMPONENT_NAMES.KNOWS);
    }
    if (Know.knowsFact(knows, ast.fact)) return { ...prev, ok: true, mutated: false, noop: true };
    const next = Know.learn(knows, ast.fact, ctx.tick);
    this.world.set(target, COMPONENT_NAMES.KNOWS, next);
    return { ...prev, ok: true, mutated: true, knowledge: {
      op: 'learn', target, fact: ast.fact, learnedAt: ctx.tick,
    }};
  }

  _forget(prev, ast, target) {
    const knows = this.world.get(target, COMPONENT_NAMES.KNOWS);
    if (!knows || !Know.knowsFact(knows, ast.fact)) {
      return { ...prev, ok: true, mutated: false, noop: true };
    }
    this.world.set(target, COMPONENT_NAMES.KNOWS, Know.forget(knows, ast.fact));
    return { ...prev, ok: true, mutated: true, knowledge: { op: 'forget', target, fact: ast.fact }};
  }

  _show(prev, ast, target) {
    const knows = this.world.get(target, COMPONENT_NAMES.KNOWS);
    const rows = knows ? Know.facts(knows) : [];
    return { ...prev, ok: true, right: { kind: 'table', title: `O que ${ast.target} sabe`, data: rows }};
  }

  _at(prev, ast, target) {
    const knows = this.world.get(target, COMPONENT_NAMES.KNOWS);
    if (!knows) return { ...prev, ok: true, right: { kind: 'table', title: 'Nada', data: [] }};
    const cutoff = ast.opts?.at ? tickToNumber(ast.opts.at) : Infinity;
    const rows = Know.facts(knows).filter(f => tickToNumber(f.learnedAt) <= cutoff);
    return { ...prev, ok: true, right: { kind: 'table', title: `O que ${ast.target} sabia em ${ast.opts.at}`, data: rows }};
  }
}