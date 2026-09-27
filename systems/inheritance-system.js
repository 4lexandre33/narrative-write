/**
 * @file inheritance-system.js
 * @module systems
 * @description Handles inst.chain/resolve/reparent/unset/policy.
 * @imports ecs/system, components/instantiation, core/constants, core/utils/object
 * @level 7
 */

import { System } from '../ecs/system.js';
import { COMPONENT_NAMES, NEVER_HERITABLE, MERGE_MODES, MERGE_DEFAULT } from '../core/constants.js';
import { deepMerge, deepClone } from '../core/utils/object.js';

export class InheritanceSystem extends System {
  constructor() { super('InheritanceSystem'); }

  run(_line, ctx, prev) {
    const ast = prev.ast;
    if (!ast || ast.verb !== 'inst') return prev;
    if (!['chain', 'resolve', 'reparent', 'unset', 'policy'].includes(ast.action)) return prev;

    try {
      switch (ast.action) {
        case 'chain':    return this._chain(prev, ast);
        case 'resolve':  return this._resolve(prev, ast);
        case 'reparent': return this._reparent(prev, ast, ctx);
        case 'unset':    return this._unset(prev, ast, ctx);
        case 'policy':   return this._policy(prev, ast, ctx);
        default:         return prev;
      }
    } catch (err) {
      return { ...prev, ok: false, halt: true, error: err.message };
    }
  }

  _buildChain(id) {
    const chain = [];
    const seen = new Set();
    let cur = id;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      chain.push(cur);
      const derives = this.world.get(cur, COMPONENT_NAMES.DERIVES_FROM)?.ids ?? [];
      const instanceOf = this.world.get(cur, COMPONENT_NAMES.INSTANCE_OF)?.id;
      cur = derives[0] ?? instanceOf ?? null;
    }
    return chain;
  }

  _chain(prev, ast) {
    const target = this.resolve(ast.target);
    if (!target) return { ...prev, ok: false, halt: true, error: `entidade não encontrada: ${ast.target}` };
    const chain = this._buildChain(target);
    const tree = this._chainToTree(chain);
    return { ...prev, ok: true, right: { kind: 'tree', title: `Cadeia de ${ast.target}`, data: tree }};
  }

  _chainToTree(chain) {
    let node = null;
    for (let i = chain.length - 1; i >= 0; i--) {
      const ident = this.world.get(chain[i], COMPONENT_NAMES.IDENTITY);
      node = { node: ident?.name ?? chain[i], id: chain[i], children: node ? [node] : [] };
    }
    return node;
  }

  _resolve(prev, ast) {
    const target = this.resolve(ast.target);
    if (!target) return { ...prev, ok: false, halt: true, error: `entidade não encontrada: ${ast.target}` };

    const chain = this._buildChain(target);
    const policy = this._mergePolicyChain(chain);
    const result = {};
    const origins = {};

    // Resolve raiz → folha
    for (let i = chain.length - 1; i >= 0; i--) {
      const levelId = chain[i];
      for (const compName of this.world.entities.get(levelId)) {
        if (NEVER_HERITABLE.has(compName)) continue;
        const data = this.world.get(levelId, compName);
        const strat = this._strategyFor(policy, compName);
        result[compName] = result[compName]
          ? deepMerge(result[compName], data, { strategy: strat })
          : deepClone(data);
      }
    }

    // Aplica tombstones
    const tombstones = this.world.get(target, COMPONENT_NAMES.TOMBSTONES) || {};
    for (const [comp, fields] of Object.entries(tombstones)) {
      if (!result[comp]) continue;
      for (const field of fields) delete result[comp][field];
    }

    // Calcula origem por campo
    for (const [compName, compData] of Object.entries(result)) {
      origins[compName] = {};
      for (const field of Object.keys(compData)) {
        for (const levelId of chain) {
          const levelData = this.world.get(levelId, compName);
          if (levelData && Object.prototype.hasOwnProperty.call(levelData, field)) {
            origins[compName][field] = this.world.get(levelId, COMPONENT_NAMES.IDENTITY)?.name ?? levelId;
            break;
          }
        }
      }
    }

    return { ...prev, ok: true, right: {
      kind: 'resolve',
      title: `Estado resolvido de ${ast.target}`,
      data: { resolved: result, origins, chain: chain.map(id => this.world.get(id, COMPONENT_NAMES.IDENTITY)?.name ?? id) },
    }};
  }

  _mergePolicyChain(chain) {
    const merged = { ...MERGE_DEFAULT };
    for (const id of chain) {
      const policy = this.world.get(id, COMPONENT_NAMES.MERGE_POLICY);
      if (policy) Object.assign(merged, policy);
    }
    return merged;
  }

  _strategyFor(policy, compName) {
    return policy[compName] ?? 'override';
  }

  _reparent(prev, ast, ctx) {
    const target = this.resolve(ast.target);
    if (!target) return { ...prev, ok: false, halt: true, error: `entidade não encontrada: ${ast.target}` };

    const derivesRaw = ast.opts.derives;
    if (!derivesRaw) return { ...prev, ok: false, halt: true, error: 'opts.derives obrigatório' };

    const newDerives = derivesRaw.split(',').map(s => s.trim()).filter(Boolean)
      .map(ref => this.resolve(ref))
      .filter(Boolean);

    const before = this.world.get(target, COMPONENT_NAMES.DERIVES_FROM)?.ids ?? [];
    this.world.set(target, COMPONENT_NAMES.DERIVES_FROM, { ids: newDerives });

    // Marca descendentes
    const descendants = this._findDescendants(target);
    for (const desc of descendants) {
      if (!this.world.has(desc, COMPONENT_NAMES.STALE)) {
        this.world.addComponent(desc, COMPONENT_NAMES.STALE, {
          value: true, at: ctx.tick, cause: 'reparent',
        });
      }
    }
    return { ...prev, ok: true, mutated: true, reparented: {
      target, before, after: newDerives, staleMarked: descendants.length,
    }};
  }

  _unset(prev, ast, ctx) {
    const target = this.resolve(ast.target);
    if (!target) return { ...prev, ok: false, halt: true, error: `entidade não encontrada: ${ast.target}` };

    const dot = ast.path.indexOf('.');
    if (dot <= 0) return { ...prev, ok: false, halt: true, error: 'path inválido' };
    const comp = ast.path.slice(0, dot);
    const field = ast.path.slice(dot + 1);
    const compName = this._compName(comp);
    if (!compName) return { ...prev, ok: false, halt: true, error: `componente inválido: ${comp}` };

    const before = this.world.get(target, COMPONENT_NAMES.TOMBSTONES) || {};
    const fields = new Set(before[compName] || []);
    fields.add(field);

    const next = { ...before, [compName]: Array.from(fields) };
    if (this.world.has(target, COMPONENT_NAMES.TOMBSTONES)) this.world.set(target, COMPONENT_NAMES.TOMBSTONES, next);
    else this.world.addComponent(target, COMPONENT_NAMES.TOMBSTONES, next);

    // Eager resolve — remove campo
    const cur = this.world.get(target, compName);
    if (cur && field in cur) {
      const clone = { ...cur };
      delete clone[field];
      this.world.set(target, compName, clone);
    }

    return { ...prev, ok: true, mutated: true, tombstoned: { target, component: compName, field }};
  }

  _policy(prev, ast, ctx) {
    const target = this.resolve(ast.target);
    if (!target) return { ...prev, ok: false, halt: true, error: `entidade não encontrada: ${ast.target}` };

    const updates = {};
    for (const [k, v] of Object.entries(ast.opts)) {
      const compName = this._compName(k);
      if (!compName) continue;
      if (!MERGE_MODES[compName]?.includes(v)) {
        return { ...prev, ok: false, halt: true, error: `modo inválido: ${k}=${v}` };
      }
      updates[compName] = v;
    }

    const before = this.world.get(target, COMPONENT_NAMES.MERGE_POLICY) || {};
    const after = { ...before, ...updates };

    if (this.world.has(target, COMPONENT_NAMES.MERGE_POLICY)) this.world.set(target, COMPONENT_NAMES.MERGE_POLICY, after);
    else this.world.addComponent(target, COMPONENT_NAMES.MERGE_POLICY, after);

    const descendants = this._findDescendants(target);
    for (const desc of descendants) {
      if (!this.world.has(desc, COMPONENT_NAMES.STALE)) {
        this.world.addComponent(desc, COMPONENT_NAMES.STALE, { value: true, at: ctx.tick, cause: 'policy' });
      }
    }
    return { ...prev, ok: true, mutated: true, policyChanged: { target, before, after }};
  }

  _findDescendants(id) {
    const out = [];
    const seen = new Set();
    const queue = [id];
    while (queue.length) {
      const cur = queue.shift();
      for (const other of this.world.allEntities()) {
        if (seen.has(other) || other === id) continue;
        const instOf = this.world.get(other, COMPONENT_NAMES.INSTANCE_OF)?.id;
        const derives = this.world.get(other, COMPONENT_NAMES.DERIVES_FROM)?.ids ?? [];
        if (instOf === cur || derives.includes(cur)) {
          seen.add(other);
          out.push(other);
          queue.push(other);
        }
      }
    }
    return out;
  }

  _compName(short) {
    const map = { stats: 'Stats', flags: 'Flags', enums: 'Enums', texts: 'Texts', lists: 'Lists', tags: 'Tags' };
    return map[short] ?? null;
  }
}