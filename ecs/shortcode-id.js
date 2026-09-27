/**
 * @file shortcode-id.js
 * @module ecs
 * @description Gerador de shortcodes únicos e legíveis (ex: CHR-KAE).
 * @imports core/constants, core/utils/string
 * @importedBy ecs/world, systems/entity-system, systems/instantiation-system, context-machine/machine
 * @level 1
 */

import { TYPE_PREFIX, SHORTCODE_SEPARATOR } from '../core/constants.js';
import { slug } from '../core/utils/string.js';

export class ShortcodeId {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.maxSlug=3] — comprimento do slug (ex: 'KAE')
   * @param {Set<string>} [opts.taken] — conjunto inicial de ids ocupados
   * @param {number} [opts.maxSuffix=99] — limite de sufixos (-2, -3, ...)
   */
  constructor({ maxSlug = 3, taken = new Set(), maxSuffix = 99 } = {}) {
    this.maxSlug = maxSlug;
    this.maxSuffix = maxSuffix;
    /** @type {Set<string>} */
    this.taken = new Set(taken);
  }

  // ── Consultas ───────────────────────────────────────────────

  /**
   * Verifica se um shortcode já está registrado.
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    return this.taken.has(id);
  }

  /**
   * Conta quantos shortcodes estão registrados.
   * @returns {number}
   */
  count() {
    return this.taken.size;
  }

  /**
   * Lista todos os shortcodes registrados.
   * @returns {string[]}
   */
  all() {
    return Array.from(this.taken);
  }

  // ── Registro ────────────────────────────────────────────────

  /**
   * Registra um shortcode existente (para restaurar estado).
   * @param {string} id
   * @returns {boolean} true se adicionado, false se já existia
   */
  register(id) {
    if (!id || typeof id !== 'string') return false;
    if (this.taken.has(id)) return false;
    this.taken.add(id);
    return true;
  }

  /**
   * Remove um shortcode do conjunto (para destruir entidade).
   * @param {string} id
   * @returns {boolean} true se removido
   */
  unregister(id) {
    return this.taken.delete(id);
  }

  // ── Geração ─────────────────────────────────────────────────

  /**
   * Gera um shortcode único para uma entidade.
   * Formato: `<PREFIX>-<SLUG>` (ex: 'CHR-KAE').
   * Se colidir, adiciona sufixo: `CHR-KAE-2`, `CHR-KAE-3`, ...
   * @param {string} type — tipo da entidade ('character', 'location', ...)
   * @param {string} name — nome humano (ex: 'Kaelin')
   * @returns {string}
   */
  generate(type, name) {
    const prefix = TYPE_PREFIX[type] || TYPE_PREFIX.custom;
    const baseSlug = this._slug(name);
    const base = `${prefix}${SHORTCODE_SEPARATOR}${baseSlug}`;

    // Sem colisão
    if (!this.taken.has(base)) {
      this.taken.add(base);
      return base;
    }

    // Colisão: adiciona sufixo numérico
    for (let n = 2; n <= this.maxSuffix; n++) {
      const candidate = `${base}${SHORTCODE_SEPARATOR}${n}`;
      if (!this.taken.has(candidate)) {
        this.taken.add(candidate);
        return candidate;
      }
    }

    // Fallback extremo: adiciona timestamp
    const fallback = `${base}${SHORTCODE_SEPARATOR}${Date.now().toString(36)}`;
    this.taken.add(fallback);
    return fallback;
  }

  /**
   * Gera shortcode SEM registrar (dry-run).
   * Útil para previews sem efeito colateral.
   * @param {string} type
   * @param {string} name
   * @returns {string}
   */
  peek(type, name) {
    const prefix = TYPE_PREFIX[type] || TYPE_PREFIX.custom;
    const baseSlug = this._slug(name);
    const base = `${prefix}${SHORTCODE_SEPARATOR}${baseSlug}`;

    if (!this.taken.has(base)) return base;

    for (let n = 2; n <= this.maxSuffix; n++) {
      const candidate = `${base}${SHORTCODE_SEPARATOR}${n}`;
      if (!this.taken.has(candidate)) return candidate;
    }

    return `${base}${SHORTCODE_SEPARATOR}?`;
  }

  // ── Manutenção ──────────────────────────────────────────────

  /**
   * Substitui todo o conjunto de ids.
   * Usado por restore/boot.
   * @param {Iterable<string>} ids
   */
  reset(ids = []) {
    this.taken = new Set(ids);
  }

  /**
   * Reconstrói o conjunto a partir de um World.
   * Varre todos os Identity.id e registra.
   * @param {{allEntities: Function, get: Function}} world
   */
  rebuildFromWorld(world) {
    this.taken.clear();
    if (!world || typeof world.allEntities !== 'function') return;

    for (const id of world.allEntities()) {
      const identity = world.get(id, 'Identity');
      if (identity?.id) {
        this.taken.add(identity.id);
      }
    }
  }

  /**
   * Destrói o objeto — limpa o conjunto.
   */
  destroy() {
    this.taken.clear();
  }

  // ── Interno ─────────────────────────────────────────────────

  /**
   * Slug a partir do nome. Delega para utils/string.
   * @param {string} name
   * @returns {string}
   * @private
   */
  _slug(name) {
    return slug(name, this.maxSlug);
  }
}