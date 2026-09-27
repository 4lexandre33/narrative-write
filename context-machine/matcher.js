/**
 * @file matcher.js
 * @module context-machine
 * @description Resolve triggers de snippet (`.` no editor) combinando builtin + user.
 * @imports core/constants
 * @importedBy context-machine/machine
 * @level 10
 */

import { COMPONENT_NAMES } from '../core/constants.js';

export class Matcher {
  /**
   * @param {Object} world
   * @param {Object} registry  — Registry (N2)
   */
  constructor(world, registry) {
    this.world = world;
    this.registry = registry;
  }

  /**
   * Encontra snippets cujo trigger começa pelo prefixo.
   * Retorna itens ordenados por especificidade (mais longo primeiro).
   *
   * @param {string} prefix
   * @returns {Array<{
   *   id: string,
   *   trigger: string,
   *   type: string,
   *   source: 'user'|'builtin',
   *   body: string,
   *   def: Object|null
   * }>}
   */
  findTrigger(prefix) {
    if (!prefix) return [];
    const out = [];

    // User snippets do World
    for (const id of this.world.query(COMPONENT_NAMES.TRIGGER)) {
      const trigger = this.world.get(id, COMPONENT_NAMES.TRIGGER)?.value;
      if (!trigger || !trigger.startsWith(prefix)) continue;

      const type = this.world.get(id, COMPONENT_NAMES.SNIPPET_TYPE)?.value ?? 'text';
      const body = this.world.get(id, COMPONENT_NAMES.BODY)?.text ?? '';
      const defs = this.world.get(id, COMPONENT_NAMES.PLACEHOLDER_DEFS) ?? null;
      const runs = this.world.get(id, COMPONENT_NAMES.RUNS) ?? null;
      const menu = this.world.get(id, COMPONENT_NAMES.MENU_OPTS) ?? null;

      out.push({
        id,
        trigger,
        type,
        source: 'user',
        body,
        def: { defs: defs?.defs ?? null, runs: runs?.cmds ?? null, menu: menu?.options ?? null },
      });
    }

    // Builtin snippets do Registry
    for (const def of this.registry?.getSnippets() ?? []) {
      const trigger = def.trigger;
      if (!trigger || !trigger.startsWith(prefix)) continue;
      // Só incluir se não colidir com user
      if (out.some(o => o.trigger === trigger)) continue;

      out.push({
        id: `builtin:${trigger}`,
        trigger,
        type: def.kind ?? 'menu',
        source: 'builtin',
        body: def.description ?? '',
        def,
      });
    }

    // Ordena por especificidade (mais longo primeiro) e user > builtin
    out.sort((a, b) => {
      if (a.trigger.length !== b.trigger.length) {
        return b.trigger.length - a.trigger.length;
      }
      if (a.source !== b.source) return a.source === 'user' ? -1 : 1;
      return a.trigger.localeCompare(b.trigger);
    });

    return out;
  }

  /**
   * Verifica se um trigger exato existe.
   * @param {string} trigger
   * @returns {boolean}
   */
  hasTrigger(trigger) {
    if (!trigger) return false;
    if (this.registry?.hasSnippet(trigger)) return true;
    for (const id of this.world.query(COMPONENT_NAMES.TRIGGER)) {
      if (this.world.get(id, COMPONENT_NAMES.TRIGGER)?.value === trigger) return true;
    }
    return false;
  }

  /**
   * Retorna o snippet exato (user priority).
   * @param {string} trigger
   * @returns {Object|null}
   */
  resolveExact(trigger) {
    for (const id of this.world.query(COMPONENT_NAMES.TRIGGER)) {
      if (this.world.get(id, COMPONENT_NAMES.TRIGGER)?.value === trigger) {
        return {
          id,
          trigger,
          type: this.world.get(id, COMPONENT_NAMES.SNIPPET_TYPE)?.value ?? 'text',
          source: 'user',
          body: this.world.get(id, COMPONENT_NAMES.BODY)?.text ?? '',
        };
      }
    }
    const builtin = this.registry?.getSnippet(trigger);
    if (builtin) {
      return { id: `builtin:${trigger}`, trigger, type: builtin.kind ?? 'menu', source: 'builtin', body: builtin.description ?? '' };
    }
    return null;
  }

  /**
   * Sugere submenus para um menu aberto.
   * @param {string} prefix
   * @returns {Array}
   */
  suggestSubmenus(prefix) {
    const all = this.findTrigger(prefix);
    return all.filter(item => item.trigger !== prefix && item.trigger.startsWith(prefix));
  }

  /**
   * Lista todos os triggers disponíveis.
   * @returns {string[]}
   */
  allTriggers() {
    const set = new Set();
    for (const id of this.world.query(COMPONENT_NAMES.TRIGGER)) {
      const trigger = this.world.get(id, COMPONENT_NAMES.TRIGGER)?.value;
      if (trigger) set.add(trigger);
    }
    for (const def of this.registry?.getSnippets() ?? []) {
      if (def.trigger) set.add(def.trigger);
    }
    return Array.from(set).sort();
  }
}