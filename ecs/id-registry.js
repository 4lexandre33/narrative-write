/**
 * @file id-registry.js
 * @module ecs
 * @description Registry central de shortcodes. Delega para ShortcodeId, mas mantém lookup reverso shortcode→id interno.
 * @imports ecs/shortcode-id
 * @importedBy context-machine/machine, boot
 * @level 5
 */

import { ShortcodeId } from './shortcode-id.js';

export class IdRegistry {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.maxSlug=3]
   */
  constructor({ maxSlug = 3 } = {}) {
    /** @type {ShortcodeId} */
    this.shortcodes = new ShortcodeId({ maxSlug });

    /**
     * Mapa reverso: shortcode → id interno do World.
     * @type {Map<string, string>}
     */
    this.byShortcode = new Map();

    /**
     * Mapa direto: id interno → shortcode.
     * @type {Map<string, string>}
     */
    this.byEntityId = new Map();
  }

  // ── Registro ────────────────────────────────────────────────

  /**
   * Registra a associação entre id interno e shortcode.
   * Idempotente.
   * @param {string} entityId
   * @param {string} shortcode
   * @returns {boolean} true se novo
   */
  register(entityId, shortcode) {
    if (!entityId || !shortcode) return false;

    const existingShort = this.byShortcode.get(shortcode);
    if (existingShort === entityId) return false;
    if (existingShort && existingShort !== entityId) {
      throw new Error(
        `[IdRegistry] shortcode "${shortcode}" já associado a "${existingShort}"`
      );
    }

    this.byShortcode.set(shortcode, entityId);
    this.byEntityId.set(entityId, shortcode);
    this.shortcodes.register(shortcode);
    return true;
  }

  /**
   * Remove associação.
   * Idempotente.
   * @param {string} entityId
   * @returns {boolean}
   */
  unregister(entityId) {
    const shortcode = this.byEntityId.get(entityId);
    if (!shortcode) return false;

    this.byEntityId.delete(entityId);
    this.byShortcode.delete(shortcode);
    this.shortcodes.unregister(shortcode);
    return true;
  }

  // ── Consultas ───────────────────────────────────────────────

  /**
   * Shortcode a partir do id interno.
   * @param {string} entityId
   * @returns {string|null}
   */
  getShortcode(entityId) {
    return this.byEntityId.get(entityId) ?? null;
  }

  /**
   * Id interno a partir do shortcode.
   * @param {string} shortcode
   * @returns {string|null}
   */
  getEntityId(shortcode) {
    return this.byShortcode.get(shortcode) ?? null;
  }

  /**
   * Verifica se um shortcode está registrado.
   * @param {string} shortcode
   * @returns {boolean}
   */
  hasShortcode(shortcode) {
    return this.byShortcode.has(shortcode);
  }

  /**
   * Verifica se um id interno tem shortcode.
   * @param {string} entityId
   * @returns {boolean}
   */
  hasEntity(entityId) {
    return this.byEntityId.has(entityId);
  }

  /**
   * Lista todos os shortcodes.
   * @returns {string[]}
   */
  allShortcodes() {
    return Array.from(this.byShortcode.keys());
  }

  /**
   * Lista todos os ids internos.
   * @returns {string[]}
   */
  allEntityIds() {
    return Array.from(this.byEntityId.keys());
  }

  /**
   * Número total de associações.
   * @returns {number}
   */
  size() {
    return this.byShortcode.size;
  }

  // ── Geração ─────────────────────────────────────────────────

  /**
   * Gera um novo shortcode (não registra).
   * @param {string} type
   * @param {string} name
   * @returns {string}
   */
  generate(type, name) {
    return this.shortcodes.generate(type, name);
  }

  /**
   * Gera um novo shortcode e registra imediatamente.
   * @param {string} entityId
   * @param {string} type
   * @param {string} name
   * @returns {string} shortcode gerado
   */
  generateAndRegister(entityId, type, name) {
    const shortcode = this.shortcodes.generate(type, name);
    this.byShortcode.set(shortcode, entityId);
    this.byEntityId.set(entityId, shortcode);
    return shortcode;
  }

  /**
   * Dry-run: gera sem registrar.
   * @param {string} type
   * @param {string} name
   * @returns {string}
   */
  peek(type, name) {
    return this.shortcodes.peek(type, name);
  }

  // ── Manutenção ──────────────────────────────────────────────

  /**
   * Reconstrói o registry a partir de um World.
   * Varre todos os Identity.id e mapeia para ids internos.
   * @param {Object} world
   */
  rebuildFromWorld(world) {
    this.clear();
    if (!world || typeof world.allEntities !== 'function') return;

    for (const id of world.allEntities()) {
      const identity = world.get(id, 'Identity');
      if (identity?.id) {
        try {
          this.register(id, identity.id);
        } catch (err) {
          // shortcode duplicado — só loga e ignora (audit vai pegar)
          console.warn('[IdRegistry] shortcode duplicado:', identity.id, err.message);
        }
      }
    }
  }

  /**
   * Substitui todo o estado por um conjunto de pares.
   * @param {Array<{entityId:string, shortcode:string}>} pairs
   */
  reset(pairs = []) {
    this.clear();
    for (const { entityId, shortcode } of pairs) {
      if (entityId && shortcode) {
        try {
          this.register(entityId, shortcode);
        } catch {
          // ignora duplicatas
        }
      }
    }
  }

  // ── Ciclo de vida ───────────────────────────────────────────

  /**
   * Limpa todas as associações.
   */
  clear() {
    this.byShortcode.clear();
    this.byEntityId.clear();
    this.shortcodes.destroy();
  }

  /**
   * Destrói o registry.
   */
  destroy() {
    this.clear();
  }

  /**
   * Estatísticas resumidas.
   * @returns {{shortcodes:number, entities:number}}
   */
  stats() {
    return {
      shortcodes: this.byShortcode.size,
      entities: this.byEntityId.size,
    };
  }
}