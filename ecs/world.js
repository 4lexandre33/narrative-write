/**
 * @file world.js
 * @module ecs
 * @description Coração do ECS — armazena entidades, componentes e sistemas.
 * @imports ecs/event-bus, ecs/component-registry, ecs/query-cache,
 *          ecs/query-parser, core/utils/id
 * @importedBy todos os systems, context-machine/machine, editor/*, ui/*
 * @level 3
 *
 * Fase 13.7 — Limpeza (auditoria 25/09/2026):
 *   - Removido `update(dt)` (M-8). Nenhum sistema implementa `update()`;
 *     nenhum código chamava `world.update()`. Era API morta.
 *   - `createEntity` agora é transacional: se `addComponent` lançar no
 *     meio da criação, os componentes já adicionados são removidos e a
 *     entidade é apagada antes de propagar o erro. Sem isso, um erro em
 *     `addComponent` deixava lixo no `entities` (sem componentes).
 *   - `ComponentRegistry` recebe `bus` no constructor (I-3). Antes, o
 *     `setBus()` existia mas nunca era chamado — `validation:soft-fail`
 *     caía sempre em `console.warn` e nunca no bus da aplicação.
 */

import { EventBus } from './event-bus.js';
import { ComponentRegistry } from './component-registry.js';
import { QueryCache } from './query-cache.js';
import { parseQuery, matchesQuery } from './query-parser.js';
import { randomId } from '../core/utils/id.js';

export class World {
  /**
   * @param {Object} [opts]
   * @param {EventBus} [opts.bus] — barramento de eventos; cria um novo se ausente
   * @param {string} [opts.idPrefix='e'] — prefixo dos ids automáticos
   * @param {number} [opts.queryCacheSize=256] — tamanho do cache de queries
   */
  constructor({ bus, idPrefix = 'e', queryCacheSize = 256 } = {}) {
    /** @type {EventBus} */
    this.bus = bus || new EventBus();

    /**
     * ComponentRegistry já recebe o bus — Fase 13.7.
     * @type {ComponentRegistry}
     */
    this.registry = new ComponentRegistry({ bus: this.bus });

    /** @type {QueryCache} */
    this.queryCache = new QueryCache({ maxSize: queryCacheSize });

    /** @type {Map<string, Set<string>>} id → Set<componentName> */
    this.entities = new Map();

    /** @type {Map<string, Map<string, Object>>} componentName → Map<id, data> */
    this.components = new Map();

    /** @type {Array} */
    this.systems = [];

    /** @type {string} */
    this.idPrefix = idPrefix;

    /** @type {boolean} */
    this.destroyed = false;
  }

  // ── Entidades ───────────────────────────────────────────────

  /**
   * Cria uma nova entidade.
   *
   * Fase 13.7 — transacional: se algum `addComponent` falhar, faz
   * rollback (remove componentes já adicionados + apaga a entidade)
   * antes de propagar o erro. `entity:created` só é emitido no sucesso.
   *
   * @param {Object} [components={}] — mapa nome→dados
   * @param {Object} [opts={}]
   * @param {string} [opts.id] — id explícito; se ausente, gerado
   * @returns {string} id da entidade
   */
  createEntity(components = {}, opts = {}) {
    this._assertAlive();

    const id = opts.id || randomId(this.idPrefix);

    if (typeof id !== 'string' || !id) {
      throw new Error(`[World] id inválido: ${id}`);
    }
    if (this.entities.has(id)) {
      throw new Error(`[World] entidade já existe: ${id}`);
    }

    this.entities.set(id, new Set());

    const names = [];
    try {
      for (const [name, data] of Object.entries(components)) {
        this.addComponent(id, name, data);
        names.push(name);
      }
    } catch (err) {
      // Rollback: remove componentes adicionados parcialmente e apaga a entidade
      for (const name of names) {
        const map = this.components.get(name);
        if (map) map.delete(id);
      }
      this.entities.delete(id);
      throw err;
    }

    this.bus.emit('entity:created', { id, components: names });
    return id;
  }

  /**
   * Destrói uma entidade e todos os seus componentes.
   * @param {string} id
   * @returns {boolean} true se removida
   */
  destroyEntity(id) {
    this._assertAlive();
    if (!this.entities.has(id)) return false;

    const names = Array.from(this.entities.get(id));
    const removed = {};

    for (const name of names) {
      const data = this.components.get(name)?.get(id);
      if (data) removed[name] = data;
      this.components.get(name)?.delete(id);
    }

    this.entities.delete(id);
    this.bus.emit('entity:destroyed', { id, components: removed });
    return true;
  }

  /**
   * Verifica se uma entidade existe.
   * @param {string} id
   * @returns {boolean}
   */
  hasEntity(id) {
    return this.entities.has(id);
  }

  /**
   * Lista todas as entidades.
   * @returns {string[]}
   */
  allEntities() {
    return Array.from(this.entities.keys());
  }

  /**
   * Número total de entidades.
   * @returns {number}
   */
  entityCount() {
    return this.entities.size;
  }

  // ── Componentes ─────────────────────────────────────────────

  /**
   * Adiciona um componente a uma entidade.
   * Se o componente já existir, é substituído.
   * @param {string} id
   * @param {string} name
   * @param {Object} [data={}]
   * @returns {Object} dados materializados
   */
  addComponent(id, name, data = {}) {
    this._assertAlive();

    if (!this.entities.has(id)) {
      throw new Error(`[World] entidade inexistente: ${id}`);
    }
    if (typeof name !== 'string' || !name) {
      throw new Error('[World] nome de componente inválido');
    }

    const materialized = this.registry.isDefined(name)
      ? this.registry.materialize(name, data)
      : { ...data };

    if (!this.components.has(name)) {
      this.components.set(name, new Map());
    }
    this.components.get(name).set(id, materialized);
    this.entities.get(id).add(name);

    this.bus.emit('component:added', { id, name, data: materialized });
    return materialized;
  }

  /**
   * Remove um componente de uma entidade.
   * @param {string} id
   * @param {string} name
   * @returns {boolean}
   */
  removeComponent(id, name) {
    this._assertAlive();
    if (!this.entities.has(id)) return false;

    const map = this.components.get(name);
    if (!map) return false;

    const removed = map.delete(id);
    if (removed) {
      this.entities.get(id).delete(name);
      this.bus.emit('component:removed', { id, name });
    }
    return removed;
  }

  /**
   * Lê um componente.
   * @param {string} id
   * @param {string} name
   * @returns {Object|null}
   */
  get(id, name) {
    return this.components.get(name)?.get(id) ?? null;
  }

  /**
   * Verifica se uma entidade possui um componente.
   * @param {string} id
   * @param {string} name
   * @returns {boolean}
   */
  has(id, name) {
    return this.entities.get(id)?.has(name) ?? false;
  }

  /**
   * Aplica um patch (merge raso) em um componente.
   * @param {string} id
   * @param {string} name
   * @param {Object} patch
   * @returns {Object} dados atualizados
   */
  set(id, name, patch) {
    this._assertAlive();

    const current = this.get(id, name);
    if (!current) {
      throw new Error(`[World] "${name}" não existe em "${id}"`);
    }

    const merged = { ...current, ...patch };
    const materialized = this.registry.isDefined(name)
      ? this.registry.materialize(name, merged)
      : merged;

    this.components.get(name).set(id, materialized);
    this.bus.emit('component:updated', {
      id,
      name,
      patch,
      next: materialized,
    });
    return materialized;
  }

  /**
   * Retorna cópia de todos os componentes de uma entidade.
   * @param {string} id
   * @returns {Object|null}
   */
  componentsOf(id) {
    if (!this.entities.has(id)) return null;
    const out = {};
    for (const name of this.entities.get(id)) {
      out[name] = this.get(id, name);
    }
    return out;
  }

  /**
   * Lista todos os nomes de componente presentes no World.
   * @returns {string[]}
   */
  componentNames() {
    return Array.from(this.components.keys());
  }

  /**
   * Conta quantas entidades têm um componente.
   * @param {string} name
   * @returns {number}
   */
  componentCount(name) {
    return this.components.get(name)?.size ?? 0;
  }

  // ── Query ───────────────────────────────────────────────────

  /**
   * Executa uma query "A,B,!C".
   * @param {string} expr
   * @returns {string[]}
   */
  query(expr) {
    this._assertAlive();

    const parsed = expr
      ? this.queryCache.parse(expr)
      : { must: [], mustNot: [] };

    const out = [];
    for (const [id, comps] of this.entities) {
      if (matchesQuery(comps, parsed)) out.push(id);
    }
    return out;
  }

  /**
   * Conta quantas entidades casam com uma query.
   * @param {string} expr
   * @returns {number}
   */
  countQuery(expr) {
    const parsed = expr
      ? this.queryCache.parse(expr)
      : { must: [], mustNot: [] };

    let n = 0;
    for (const [, comps] of this.entities) {
      if (matchesQuery(comps, parsed)) n++;
    }
    return n;
  }

  /**
   * Primeira entidade que casa com a query, ou null.
   * @param {string} expr
   * @returns {string|null}
   */
  findOne(expr) {
    const parsed = expr
      ? this.queryCache.parse(expr)
      : { must: [], mustNot: [] };

    for (const [id, comps] of this.entities) {
      if (matchesQuery(comps, parsed)) return id;
    }
    return null;
  }

  // ── Sistemas ────────────────────────────────────────────────

  /**
   * Registra um sistema. Chama `init()` imediatamente após injeção.
   * @param {Object} system
   * @returns {Object} o sistema
   */
  registerSystem(system) {
    this._assertAlive();

    if (!system || typeof system.run !== 'function') {
      throw new Error('[World] sistema inválido (precisa de .run)');
    }

    system.world = this;
    system.bus = this.bus;
    this.systems.push(system);

    if (typeof system.init === 'function') {
      system.init();
    }

    this.bus.emit('system:registered', { name: system.name });
    return system;
  }

  /**
   * Número de sistemas registrados.
   * @returns {number}
   */
  systemCount() {
    return this.systems.length;
  }

  // ── Ciclo de vida ───────────────────────────────────────────

  /**
   * Limpa tudo — entidades, componentes, sistemas, cache.
   * Emite 'world:cleared'.
   */
  clear() {
    this.entities.clear();
    this.components.clear();
    this.systems.length = 0;
    this.queryCache.clear();
    this.bus.emit('world:cleared', {});
  }

  /**
   * Destrói o World — bloqueia operações futuras.
   */
  destroy() {
    this.clear();
    this.registry.clear();
    this.destroyed = true;
    this.bus.emit('world:destroyed', {});
  }

  /**
   * Estatísticas resumidas.
   * @returns {{entities:number, components:number, systems:number, queryCacheHitRate:number}}
   */
  stats() {
    return {
      entities: this.entities.size,
      components: this.components.size,
      systems: this.systems.length,
      queryCacheHitRate: this.queryCache.stats().hitRate,
    };
  }

  // ── Interno ─────────────────────────────────────────────────

  /**
   * @private
   */
  _assertAlive() {
    if (this.destroyed) {
      throw new Error('[World] instância destruída');
    }
  }
}