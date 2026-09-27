/**
 * @file merge-resolver.js
 * @module systems/helpers
 * @description Resolve herança cumulativa (cadeia de blueprints).
 * @imports core/constants, core/utils/object
 * @importedBy systems/inheritance-system
 * @level 8
 *
 * Algoritmo:
 *   1. Constrói a cadeia folha → raiz.
 *   2. Coleta política de merge de cada nível.
 *   3. Itera da raiz → folha, aplicando merge por componente.
 *   4. Aplica tombstones da folha.
 *   5. Rastreia a origem de cada campo.
 */

import { COMPONENT_NAMES, NEVER_HERITABLE, MERGE_DEFAULT } from '../../core/constants.js';
import { deepMerge, deepClone } from '../../core/utils/object.js';

export class MergeResolver {
  /**
   * @param {Object} world
   */
  constructor(world) {
    this.world = world;
  }

  /**
   * Resolve o estado efetivo de uma entidade.
   *
   * @param {string} entityId
   * @returns {{
   *   resolved: Object,
   *   origins: Object,
   *   chain: string[],
   *   chainNames: string[],
   *   policy: Object
   * }}
   */
  resolve(entityId) {
    const chain = this.buildChain(entityId);
    const policy = this.collectPolicy(chain);
    const resolved = {};
    const origins = {};

    // raiz → folha
    for (let i = chain.length - 1; i >= 0; i--) {
      const levelId = chain[i];
      const comps = this.world.componentsOf(levelId) || {};

      for (const [compName, data] of Object.entries(comps)) {
        if (NEVER_HERITABLE.has(compName)) continue;

        const strategy = this.strategyFor(policy, compName);
        if (!resolved[compName]) {
          resolved[compName] = deepClone(data);
        } else {
          resolved[compName] = deepMerge(resolved[compName], data, { strategy });
        }
      }
    }

    // tombstones
    const tombstones = this.world.get(entityId, COMPONENT_NAMES.TOMBSTONES) || {};
    for (const [compName, fields] of Object.entries(tombstones)) {
      if (!resolved[compName]) continue;
      for (const field of fields) {
        delete resolved[compName][field];
      }
    }

    // origem por campo
    for (const [compName, compData] of Object.entries(resolved)) {
      origins[compName] = {};
      for (const field of Object.keys(compData)) {
        for (const levelId of chain) {
          const levelData = this.world.get(levelId, compName);
          if (levelData && Object.prototype.hasOwnProperty.call(levelData, field)) {
            const ident = this.world.get(levelId, COMPONENT_NAMES.IDENTITY);
            origins[compName][field] = ident?.name ?? levelId;
            break;
          }
        }
      }
    }

    const chainNames = chain.map(id =>
      this.world.get(id, COMPONENT_NAMES.IDENTITY)?.name ?? id
    );

    return { resolved, origins, chain, chainNames, policy };
  }

  // ── Cadeia ──────────────────────────────────────────────────

  /**
   * Constrói a cadeia folha → raiz.
   * @param {string} id
   * @returns {string[]}
   */
  buildChain(id) {
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

  /**
   * Coleta política de merge cumulativa ao longo da cadeia.
   * @param {string[]} chain
   * @returns {Object}
   */
  collectPolicy(chain) {
    const merged = { ...MERGE_DEFAULT };
    for (const id of chain) {
      const policy = this.world.get(id, COMPONENT_NAMES.MERGE_POLICY);
      if (policy) Object.assign(merged, policy);
    }
    return merged;
  }

  /**
   * Retorna a estratégia de merge para um componente.
   * @param {Object} policy
   * @param {string} compName
   * @returns {string}
   */
  strategyFor(policy, compName) {
    return policy[compName] ?? 'override';
  }

  // ── Descendentes ────────────────────────────────────────────

  /**
   * Encontra todos os descendentes (diretos e indiretos).
   * @param {string} rootId
   * @returns {string[]}
   */
  findDescendants(rootId) {
    const out = [];
    const seen = new Set();
    const queue = [rootId];

    while (queue.length) {
      const cur = queue.shift();
      for (const id of this.world.allEntities()) {
        if (seen.has(id) || id === rootId) continue;
        const instOf = this.world.get(id, COMPONENT_NAMES.INSTANCE_OF)?.id;
        const derives = this.world.get(id, COMPONENT_NAMES.DERIVES_FROM)?.ids ?? [];
        if (instOf === cur || derives.includes(cur)) {
          seen.add(id);
          out.push(id);
          queue.push(id);
        }
      }
    }
    return out;
  }

  /**
   * Verifica se reparent criaria ciclo.
   * @param {string} target
   * @param {string} newParent
   * @returns {boolean}
   */
  wouldCycle(target, newParent) {
    if (target === newParent) return true;
    const parentChain = this.buildChain(newParent);
    return parentChain.includes(target);
  }
}