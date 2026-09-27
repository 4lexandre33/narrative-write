/**
 * @file machine.js
 * @module context-machine
 * @description Orquestrador central. Único ponto que conhece todos os sistemas.
 * @imports ecs/event-bus, ecs/world, ecs/link-index, ecs/snapshot, ecs/id-registry,
 *          context-machine/router, context-machine/pipeline, context-machine/registry,
 *          context-machine/matcher, core/constants
 * @importedBy boot.js, editor/*, ui/*
 * @level 10
 *
 * Fase 3 — Diagnostics: emite `pipeline:system-missing` quando um sistema
 * listado no pipeline não está registrado em `this.systems`.
 *
 * Fase 13.7 — Bugfix P0-4 (auditoria 25/09/2026):
 *   `SlashCommandSystem` emitia `machine:reset-requested` em `/reset`,
 *   mas nenhum listener existia. O comando era no-op silencioso.
 *
 *   Correção: `Machine._wireLifecycle()` agora assina o evento e marca
 *   `_pendingReset = true`. Após o pipeline de `handleLine` terminar,
 *   o reset é aplicado. Isso evita mutação do World no MEIO da execução
 *   (por exemplo, `RenderSystem` ou `PersistenceSystem` lendo estado
 *   inconsistente após o reset).
 */

import { EventBus } from '../ecs/event-bus.js';
import { World } from '../ecs/world.js';
import { LinkIndex } from '../ecs/link-index.js';
import { Snapshot } from '../ecs/snapshot.js';
import { IdRegistry } from '../ecs/id-registry.js';
import { Router } from './router.js';
import { Pipeline } from './pipeline.js';
import { Registry } from './registry.js';
import { Matcher } from './matcher.js';

import { COMPONENT_NAMES, TIMELINE_DEFAULT } from '../core/constants.js';
import { tickToNumber, numberToTick } from '../core/utils/time.js';

export class Machine {
  /**
   * @param {Object} [opts]
   * @param {World} [opts.world]
   * @param {EventBus} [opts.bus]
   * @param {string} [opts.idPrefix='e']
   */
  constructor({ world, bus, idPrefix = 'e' } = {}) {
    this.bus = bus ?? new EventBus();
    this.world = world ?? new World({ bus: this.bus, idPrefix });
    if (!this.world.bus) this.world.bus = this.bus;

    this.links = new LinkIndex(this.bus);
    this.ids = new IdRegistry();

    this.router = new Router();
    this.pipeline = new Pipeline();
    this.registry = new Registry();
    this.matcher = new Matcher(this.world, this.registry);

    /** @type {Map<string, Object>} */
    this.systems = new Map();

    /** @type {Object} */
    this.state = {
      tick: 'T0',
      tickNumber: 0,
      timeline: TIMELINE_DEFAULT,
      focusedEntity: null,
      lastResult: null,
      play: false,
      roll: null,
      tutorial: null,
    };

    /**
     * Flag de reset pendente (Fase 13.7 — P0-4).
     * Setada por listener do bus; consumida por `handleLine` após o
     * pipeline. Garante que o reset aconteça entre linhas, não no meio.
     * @type {boolean}
     * @private
     */
    this._pendingReset = false;

    this._wireLifecycle();
    this._rebuildIndexes();
  }

  // ── Sistema ────────────────────────────────────────────────

  registerSystem(system) {
    if (!system || typeof system.run !== 'function') {
      throw new Error('[Machine] sistema inválido (precisa de .run)');
    }

    system.world = this.world;
    system.bus = this.bus;
    system.machine = this;
    system.links = this.links;
    system.ids = this.ids;

    this.systems.set(system.name, system);

    if (typeof system.init === 'function') {
      system.init();
    }
    return system;
  }

  getSystem(name) {
    return this.systems.get(name) ?? null;
  }

  hasSystem(name) {
    return this.systems.has(name);
  }

  // ── Entrada principal ──────────────────────────────────────

  /**
   * Processa uma linha do editor.
   * @param {string} line
   * @returns {Object} SystemResult
   */
  handleLine(line) {
    const kind = this.router.classify(line);
    const order = this.pipeline.orderFor(kind);

    const context = {
      tick: this.state.tick,
      timeline: this.state.timeline,
      kind,
      raw: line,
      linkIndex: this.links,
      ids: this.ids,
    };

    let result = { ok: true, kind, raw: line };

    for (const name of order) {
      const system = this.systems.get(name);
      if (!system) {
        // ── Captura do invisível ─────────────────────────
        this.bus.emit('pipeline:system-missing', {
          name,
          kind,
          raw: line,
        });
        continue;
      }

      let partial;
      try {
        partial = system.run(line, context, result) ?? {};
      } catch (err) {
        partial = { ok: false, error: err.message, halt: true };
      }
      result = { ...result, ...partial };

      if (result.halt) break;
    }

    if (result.mutated && result.ok !== false) {
      this.state.tickNumber += 1;
      this.state.tick = numberToTick(this.state.tickNumber);
      this.bus.emit('tick:advanced', { tick: this.state.tick, previous: context.tick });
      result.tick = this.state.tick;
    }

    // ── Reset pendente (Fase 13.7 — P0-4) ───────────────────
    // Se algum sistema pediu reset durante a execução (via
    // `machine:reset-requested`), aplica agora, DEPOIS do pipeline
    // ter terminado. Isso evita que RenderSystem/PersistenceSystem
    // leiam estado inconsistente após o reset.
    if (this._pendingReset) {
      this._pendingReset = false;
      this.reset();
      result = { ...result, reset: true };
    }

    this.state.lastResult = result;
    return result;
  }

  // ── Snippet trigger ────────────────────────────────────────

  resolveTrigger(prefix) {
    return this.matcher.findTrigger(prefix);
  }

  resolveExactTrigger(trigger) {
    return this.matcher.resolveExact(trigger);
  }

  // ── Undo / restore ─────────────────────────────────────────

  restoreFrom(tick) {
    const timeline = this.systems.get('TimelineSystem');
    const snap = timeline?.getSnapshot(tick);
    if (!snap) {
      throw new Error(`[Machine] snapshot não existe: ${tick}`);
    }

    Snapshot.restore(this.world, snap, { clear: true });
    this.state.tick = tick;
    this.state.tickNumber = tickToNumber(tick);

    this.links.rebuild(this.world);
    this.ids.rebuildFromWorld(this.world);

    this.bus.emit('machine:restored', { tick });
    return { ok: true, tick };
  }

  switchTimeline(name) {
    const timeline = this.systems.get('TimelineSystem');
    if (!timeline) throw new Error('[Machine] TimelineSystem não registrado');
    if (!timeline.timelines.has(name)) {
      throw new Error(`[Machine] timeline não existe: ${name}`);
    }

    const lastTick = timeline.getLastTick(name);
    const snap = timeline.getSnapshot(lastTick, name);

    Snapshot.restore(this.world, snap, { clear: true });
    timeline.switchTo(name);

    this.state.timeline = name;
    this.state.tick = lastTick;
    this.state.tickNumber = tickToNumber(lastTick);

    this.links.rebuild(this.world);
    this.ids.rebuildFromWorld(this.world);

    return { ok: true, tick: lastTick };
  }

  // ── Consultas de estado ────────────────────────────────────

  getTick() {
    return this.state.tick;
  }

  getTimeline() {
    return this.state.timeline;
  }

  isPlayMode() {
    return this.state.play === true;
  }

  isRollMode() {
    return this.state.roll != null;
  }

  // ── Ciclo de vida ──────────────────────────────────────────

  reset() {
    this._pendingReset = false;

    this.world.clear();
    this.links.clear();
    this.ids.clear();

    this.state = {
      tick: 'T0',
      tickNumber: 0,
      timeline: TIMELINE_DEFAULT,
      focusedEntity: null,
      lastResult: null,
      play: false,
      roll: null,
      tutorial: null,
    };

    this.bus.emit('machine:reset', {});
  }

  destroy() {
    this._pendingReset = false;
    this.links.destroy();
    this.world.destroy();
    this.bus.clear();
    this.systems.clear();
  }

  // ── Internos ───────────────────────────────────────────────

  _wireLifecycle() {
    this.bus.on('entity:created', ({ id }) => {
      const ident = this.world.get(id, COMPONENT_NAMES.IDENTITY);
      if (ident?.id) {
        try {
          this.ids.register(id, ident.id);
        } catch (err) {
          console.warn('[Machine] shortcode duplicado:', ident.id, err.message);
        }
      }
    });

    this.bus.on('entity:destroyed', ({ id }) => {
      this.ids.unregister(id);
      this._pruneLinksTo(id);
    });

    // Fase 13.7 — P0-4: escutar pedido de reset (vindo de /reset).
    // Não executa `reset()` aqui — apenas marca. `handleLine` aplica
    // depois do pipeline terminar. Isso protege os sistemas que ainda
    // estão na fila (RenderSystem, PersistenceSystem).
    this.bus.on('machine:reset-requested', () => {
      this._pendingReset = true;
    });
  }

  _rebuildIndexes() {
    this.ids.rebuildFromWorld(this.world);
    this.links.rebuild(this.world);
  }

  _pruneLinksTo(destroyedId) {
    const incoming = this.links.to(destroyedId);
    if (incoming.length === 0) return;

    const pruned = [];

    for (const { from, rel } of incoming) {
      const links = this.world.get(from, COMPONENT_NAMES.LINKS);
      if (!links) continue;

      const value = links[rel];
      if (Array.isArray(value)) {
        const next = value.filter(v => v !== destroyedId);
        if (next.length !== value.length) {
          this.world.set(from, COMPONENT_NAMES.LINKS, { [rel]: next });
          pruned.push({ from, rel, to: destroyedId });
        }
      } else if (value === destroyedId) {
        const next = { ...links };
        delete next[rel];
        this.world.set(from, COMPONENT_NAMES.LINKS, next);
        pruned.push({ from, rel, to: destroyedId });
      }
    }

    if (pruned.length > 0) {
      this.bus.emit('links:pruned', { destroyed: destroyedId, pruned });
    }
  }
}