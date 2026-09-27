/**
 * @file schema-inspector.js
 * @module schemas
 * @description Consultas unificadas sobre os registries (componentes, snippets, comandos).
 * @imports core/constants
 * @importedBy systems/help-system, schemas/bootstrap
 * @level 9
 */

import { KNOWN_PREFIXES, ENTITY_TYPES } from '../core/constants.js';

export class SchemaInspector {
  /**
   * @param {Object} worldRegistry    — ComponentRegistry (N2)
   * @param {Object} machineRegistry  — Registry (N2, catálogo de metadata)
   */
  constructor(worldRegistry, machineRegistry) {
    this.worldRegistry = worldRegistry;
    this.machineRegistry = machineRegistry;
  }

  // ── Componentes ─────────────────────────────────────────────

  /**
   * Descreve um componente (do registry de schemas).
   * @param {string} name
   * @returns {{
   *   name: string,
   *   exists: boolean,
   *   defaults: Object,
   *   required: string[],
   *   meta?: Object
   * }}
   */
  describeComponent(name) {
    const schema = this.worldRegistry?.get(name) ?? null;
    const meta = this.machineRegistry?.getComponent(name) ?? null;
    return {
      name,
      exists: !!schema,
      defaults: schema?.defaults ?? {},
      required: schema?.required ?? [],
      meta,
    };
  }

  /**
   * Lista todos os componentes registrados.
   * @returns {Array}
   */
  listComponents() {
    const names = this.worldRegistry?.all() ?? [];
    return names.map(name => this.describeComponent(name));
  }

  /**
   * Verifica se um componente tem schema.
   * @param {string} name
   * @returns {boolean}
   */
  hasComponent(name) {
    return !!this.worldRegistry?.isDefined(name);
  }

  /**
   * Conta componentes registrados.
   * @returns {number}
   */
  countComponents() {
    return this.worldRegistry?.size() ?? 0;
  }

  // ── Snippets ────────────────────────────────────────────────

  /**
   * Lista snippets conhecidos no Registry de metadata.
   * @returns {Array}
   */
  listSnippets() {
    return this.machineRegistry?.getSnippets() ?? [];
  }

  /**
   * Busca um snippet por trigger exato.
   * @param {string} trigger
   * @returns {Object|null}
   */
  findSnippet(trigger) {
    return this.machineRegistry?.getSnippet(trigger) ?? null;
  }

  /**
   * Snippets cujo trigger começa por um prefixo.
   * @param {string} prefix
   * @returns {Array}
   */
  findSnippetsByPrefix(prefix) {
    if (!prefix) return [];
    return (this.machineRegistry?.getSnippets() ?? [])
      .filter(s => s.trigger.startsWith(prefix))
      .sort((a, b) => a.trigger.localeCompare(b.trigger));
  }

  /**
   * Lista de prefixos builtin conhecidos.
   * @returns {string[]}
   */
  knownPrefixes() {
    return KNOWN_PREFIXES.map(p => `${p}.`);
  }

  // ── Comandos ────────────────────────────────────────────────

  /**
   * Lista todos os comandos.
   * @returns {Array}
   */
  listCommands() {
    return this.machineRegistry?.getCommands() ?? [];
  }

  /**
   * Busca um comando por verbo.
   * @param {string} verb
   * @returns {Object|null}
   */
  findCommand(verb) {
    return this.machineRegistry?.getCommand(verb) ?? null;
  }

  /**
   * Conta comandos registrados.
   * @returns {number}
   */
  countCommands() {
    return this.machineRegistry?.getCommands()?.length ?? 0;
  }

  // ── Agregações ──────────────────────────────────────────────

  /**
   * Resumo completo dos registries.
   * @returns {{
   *   components: number,
   *   snippets: number,
   *   commands: number,
   *   prefixes: number,
   *   types: number
   * }}
   */
  summarize() {
    return {
      components: this.countComponents(),
      snippets: this.listSnippets().length,
      commands: this.countCommands(),
      prefixes: KNOWN_PREFIXES.length,
      types: ENTITY_TYPES.length,
    };
  }

  /**
   * Monta cheatsheet compacto para o autor.
   * @returns {Object}
   */
  buildCheatsheet() {
    return {
      quickCommands: this.listCommands().slice(0, 8).map(c => ({
        c: c.verb ? `${c.verb}.` : '—',
        d: c.description ?? '',
      })),
      snippets: this.listSnippets().slice(0, 10).map(s => ({
        trigger: s.trigger,
        kind: s.kind ?? 'menu',
        description: s.description ?? '',
      })),
      components: this.listComponents().slice(0, 10).map(c => ({
        name: c.name,
        required: c.required,
      })),
    };
  }

  // ── Busca cross-registry ────────────────────────────────────

  /**
   * Busca textual em componentes, snippets e comandos.
   * @param {string} query
   * @returns {{ components:Array, snippets:Array, commands:Array }}
   */
  search(query) {
    const q = String(query || '').toLowerCase();
    if (!q) return { components: [], snippets: [], commands: [] };

    const match = (text) => String(text || '').toLowerCase().includes(q);

    return {
      components: this.listComponents().filter(c =>
        match(c.name) || match(c.meta?.description)
      ),
      snippets: this.listSnippets().filter(s =>
        match(s.trigger) || match(s.description)
      ),
      commands: this.listCommands().filter(c =>
        match(c.verb) || match(c.description)
      ),
    };
  }

  // ── Validação ───────────────────────────────────────────────

  /**
   * Verifica se todos os registries estão populados.
   * @returns {{ ok:boolean, missing:string[] }}
   */
  audit() {
    const missing = [];
    if (this.countComponents() === 0) missing.push('components');
    if (this.listSnippets().length === 0) missing.push('snippets');
    if (this.countCommands() === 0) missing.push('commands');
    return { ok: missing.length === 0, missing };
  }
}