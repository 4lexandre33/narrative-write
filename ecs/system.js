/**
 * @file system.js
 * @module ecs
 * @description Classe base de todos os sistemas.
 * @imports — (nenhum)
 * @importedBy todos os systems/* (28 ficheiros)
 * @level 5
 */

export class System {
  /**
   * @param {string} name — nome único do sistema (usado no pipeline)
   */
  constructor(name) {
    if (!name || typeof name !== 'string') {
      throw new Error('[System] nome obrigatório');
    }

    /** @type {string} */
    this.name = name;

    /** @type {Object|null} — injetado por World.registerSystem */
    this.world = null;

    /** @type {EventBus|null} — injetado por World.registerSystem */
    this.bus = null;

    /** @type {Object|null} — injetado por Machine.registerSystem */
    this.machine = null;

    /** @type {Object|null} — LinkIndex, injetado por Machine.registerSystem */
    this.links = null;

    /** @type {Object|null} — ShortcodeId, injetado por Machine.registerSystem */
    this.ids = null;
  }

  // ── Ciclo de vida (opcional nas subclasses) ─────────────────

  /**
   * Chamado após injeção de dependências.
   * Subclasses podem sobrescrever para assinar eventos, pré-computar.
   */
  init() {}

  /**
   * Chamado em cada frame (se o Machine decidir rodar ticks).
   * Maioria dos sistemas não precisa.
   * @param {number} _dt
   */
  update(_dt) {}

  /**
   * Ponto de entrada do sistema no pipeline.
   * Subclasses DEVEM sobrescrever.
   *
   * @param {string} line — linha do editor
   * @param {Object} ctx — contexto (tick, timeline, kind, raw, linkIndex, ids)
   * @param {Object} prev — resultado acumulado dos sistemas anteriores
   * @returns {Object} SystemResult (parcial ou completo)
   */
  run(_line, _ctx, prev) {
    return prev;
  }

  // ── Helpers de conveniência ─────────────────────────────────

  /**
   * Atalho para world.query.
   * @param {string} expr
   * @returns {string[]}
   */
  q(expr) {
    return this.world.query(expr);
  }

  /**
   * Atalho para world.findOne.
   * @param {string} expr
   * @returns {string|null}
   */
  findOne(expr) {
    return this.world.findOne(expr);
  }

  /**
   * Atalho para bus.on.
   * @param {string} event
   * @param {Function} handler
   * @returns {Function} unsubscribe
   */
  on(event, handler) {
    return this.bus.on(event, handler);
  }

  /**
   * Atalho para bus.emit.
   * @param {string} event
   * @param {any} [payload]
   */
  emit(event, payload) {
    return this.bus.emit(event, payload);
  }

  /**
   * Atalho para world.get.
   * @param {string} id
   * @param {string} name
   * @returns {Object|null}
   */
  get(id, name) {
    return this.world.get(id, name);
  }

  /**
   * Atalho para world.set.
   * @param {string} id
   * @param {string} name
   * @param {Object} patch
   * @returns {Object}
   */
  set(id, name, patch) {
    return this.world.set(id, name, patch);
  }

  /**
   * Atalho para world.has.
   * @param {string} id
   * @param {string} name
   * @returns {boolean}
   */
  has(id, name) {
    return this.world.has(id, name);
  }

  /**
   * Atalho para world.hasEntity.
   * @param {string} id
   * @returns {boolean}
   */
  hasEntity(id) {
    return this.world.hasEntity(id);
  }

  /**
   * Atalho para world.componentsOf.
   * @param {string} id
   * @returns {Object|null}
   */
  componentsOf(id) {
    return this.world.componentsOf(id);
  }

  /**
   * Atalho para world.addComponent.
   * @param {string} id
   * @param {string} name
   * @param {Object} [data]
   * @returns {Object}
   */
  addComponent(id, name, data = {}) {
    return this.world.addComponent(id, name, data);
  }

  /**
   * Atalho para world.removeComponent.
   * @param {string} id
   * @param {string} name
   * @returns {boolean}
   */
  removeComponent(id, name) {
    return this.world.removeComponent(id, name);
  }

  /**
   * Atalho para world.createEntity.
   * @param {Object} [components]
   * @param {Object} [opts]
   * @returns {string}
   */
  createEntity(components = {}, opts = {}) {
    return this.world.createEntity(components, opts);
  }

  /**
   * Atalho para world.destroyEntity.
   * @param {string} id
   * @returns {boolean}
   */
  destroyEntity(id) {
    return this.world.destroyEntity(id);
  }

  // ── Utilidades internas ─────────────────────────────────────

  /**
   * Retorna o tick atual do Machine (ou 'T0').
   * @returns {string}
   */
  getTick() {
    return this.machine?.state?.tick ?? 'T0';
  }

  /**
   * Retorna a timeline ativa.
   * @returns {string}
   */
  getTimeline() {
    return this.machine?.state?.timeline ?? 'main';
  }

  /**
   * Resolve uma referência (nome ou shortcode) para o id interno.
   * Usa World + Identity.
   * @param {string} ref
   * @returns {string|null}
   */
  resolve(ref) {
    if (!ref) return null;
    if (this.world.hasEntity(ref)) return ref;

    for (const id of this.world.allEntities()) {
      const ident = this.world.get(id, 'Identity');
      if (ident?.id === ref) return id;
    }
    return null;
  }

  /**
   * Resolve referência; lança erro se não encontrada.
   * @param {string} ref
   * @returns {string}
   */
  resolveOrThrow(ref) {
    const id = this.resolve(ref);
    if (!id) throw new Error(`[${this.name}] entidade não encontrada: ${ref}`);
    return id;
  }

  /**
   * Resolve múltiplas referências.
   * @param {string[]} refs
   * @returns {string[]}
   */
  resolveMany(refs = []) {
    const out = [];
    for (const ref of refs) {
      const id = this.resolve(ref);
      if (id) out.push(id);
    }
    return out;
  }
}