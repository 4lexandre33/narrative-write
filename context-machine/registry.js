/**
 * @file registry.js
 * @module context-machine
 * @description Catálogo de metadata: componentes, snippets e comandos.
 * Usado para help, autocomplete e documentação — não é fonte de verdade do ECS.
 * @imports — (nenhum)
 * @importedBy context-machine/machine, systems/help-system, schemas/builtin-*
 * @level 2
 */

export class Registry {
  constructor() {
    /** @type {Map<string, Object>} */
    this.components = new Map();
    /** @type {Map<string, Object>} */
    this.snippets = new Map();
    /** @type {Map<string, Object>} */
    this.commands = new Map();
  }

  // ── Componentes ─────────────────────────────────────────────

  /**
   * Registra metadata de um componente.
   * @param {string} name
   * @param {Object} schema — { fields, notes, example, builtin }
   */
  defineComponent(name, schema = {}) {
    if (typeof name !== 'string' || !name) {
      throw new Error('[Registry] nome de componente inválido');
    }
    this.components.set(name, { name, ...schema });
  }

  hasComponent(name) {
    return this.components.has(name);
  }

  getComponent(name) {
    return this.components.get(name) || null;
  }

  getComponents() {
    return Array.from(this.components.values());
  }

  componentNames() {
    return Array.from(this.components.keys());
  }

  // ── Snippets ────────────────────────────────────────────────

  /**
   * Registra metadata de um snippet.
   * @param {string} trigger — ex: 'ent.' ou 'mut.add.'
   * @param {Object} def — { description, kind, examples, builtin }
   */
  defineSnippet(trigger, def = {}) {
    if (typeof trigger !== 'string' || !trigger) {
      throw new Error('[Registry] trigger de snippet inválido');
    }
    this.snippets.set(trigger, { trigger, ...def });
  }

  hasSnippet(trigger) {
    return this.snippets.has(trigger);
  }

  getSnippet(trigger) {
    return this.snippets.get(trigger) || null;
  }

  getSnippets() {
    return Array.from(this.snippets.values());
  }

  /**
   * Snippets cujo trigger começa com um prefixo.
   * @param {string} prefix
   * @returns {Object[]}
   */
  findSnippetsByPrefix(prefix) {
    const out = [];
    for (const [trigger, def] of this.snippets) {
      if (trigger.startsWith(prefix)) out.push(def);
    }
    return out;
  }

  // ── Comandos ────────────────────────────────────────────────

  /**
   * Registra metadata de um comando.
   * @param {string} verb — ex: 'ent', 'mut', 'link'
   * @param {Object} meta — { description, subverbs, examples, builtin }
   */
  defineCommand(verb, meta = {}) {
    if (typeof verb !== 'string' || !verb) {
      throw new Error('[Registry] verbo inválido');
    }
    this.commands.set(verb, { verb, ...meta });
  }

  hasCommand(verb) {
    return this.commands.has(verb);
  }

  getCommand(verb) {
    return this.commands.get(verb) || null;
  }

  getCommands() {
    return Array.from(this.commands.values());
  }

  commandVerbs() {
    return Array.from(this.commands.keys());
  }

  // ── Ciclo de vida ───────────────────────────────────────────

  /**
   * Limpa tudo (components + snippets + commands).
   */
  clear() {
    this.components.clear();
    this.snippets.clear();
    this.commands.clear();
  }

  /**
   * Estatísticas resumidas.
   * @returns {{components:number, snippets:number, commands:number}}
   */
  stats() {
    return {
      components: this.components.size,
      snippets: this.snippets.size,
      commands: this.commands.size,
    };
  }

  /**
   * Retorna cópia serializável de todo o catálogo.
   * @returns {Object}
   */
  toJSON() {
    return {
      components: this.getComponents(),
      snippets: this.getSnippets(),
      commands: this.getCommands(),
    };
  }
}