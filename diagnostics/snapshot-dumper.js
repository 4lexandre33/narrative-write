/**
 * @file snapshot-dumper.js
 * @module diagnostics
 * @description Dump completo do estado do mundo para diagnóstico e IA.
 * @imports core/constants
 * @importedBy diagnostics/index (Fase 6+), systems/diagnostics-system (Fase 6+)
 * @level 9
 *
 * Captura:
 *   - meta: sessão, timestamps, tick, timeline, versão
 *   - world: todas as entidades e componentes
 *   - timelines: nomes, ticks, snapshots (opcional)
 *   - indexes: IdRegistry e LinkIndex
 *   - machine: state + lista de sistemas
 *   - registry: schemas de componente + metadata (comandos/snippets)
 *
 * Uso:
 *   const dumper = new SnapshotDumper();
 *   dumper.attach({ machine, world, persist });
 *   const dump = dumper.dump({ includeSnapshots: false });
 *   dumper.dumpJSON();
 *   dumper.dumpCompact();   // versão enxuta para exibição
 *   dumper.estimate(dump);  // bytes aproximados
 */

import { COMPONENT_NAMES } from '../core/constants.js';

export class SnapshotDumper {
  /**
   * @param {Object} [opts={}]
   * @param {boolean} [opts.includeEmptyComponents=false]
   * @param {boolean} [opts.includeTimelines=true]
   * @param {boolean} [opts.includeIndexes=true]
   * @param {boolean} [opts.includeRegistry=true]
   * @param {boolean} [opts.includeSnapshots=false] — inclui snapshots completos (grande)
   */
  constructor({
    includeEmptyComponents = false,
    includeTimelines = true,
    includeIndexes = true,
    includeRegistry = true,
    includeSnapshots = false,
  } = {}) {
    this.includeEmptyComponents = !!includeEmptyComponents;
    this.includeTimelines = includeTimelines !== false;
    this.includeIndexes = includeIndexes !== false;
    this.includeRegistry = includeRegistry !== false;
    this.includeSnapshots = !!includeSnapshots;

    this._machine = null;
    this._world = null;
    this._persist = null;
  }

  // ── Anexar ──────────────────────────────────────────────────

  /**
   * Anexa dependências.
   * @param {Object} deps
   * @param {Object} deps.machine
   * @param {Object} deps.world
   * @param {Object} [deps.persist]
   * @returns {SnapshotDumper}
   */
  attach({ machine, world, persist = null } = {}) {
    if (!machine || !world) {
      throw new Error('[SnapshotDumper] machine e world obrigatórios');
    }
    this._machine = machine;
    this._world = world;
    this._persist = persist;
    return this;
  }

  /**
   * Remove dependências.
   */
  detach() {
    this._machine = null;
    this._world = null;
    this._persist = null;
  }

  /**
   * Verifica se está anexado.
   * @returns {boolean}
   */
  isAttached() {
    return this._machine !== null && this._world !== null;
  }

  // ── Dump principal ──────────────────────────────────────────

  /**
   * Produz o dump completo.
   * @param {Object} [opts={}]
   * @param {boolean} [opts.includeSnapshots]
   * @param {any} [opts.includeDiagnostics] — dados extras a anexar
   * @returns {Object}
   */
  dump(opts = {}) {
    if (!this.isAttached()) {
      throw new Error('[SnapshotDumper] não anexado');
    }

    const out = {
      meta: this._captureMeta(opts),
      world: this._captureWorld(opts),
    };

    if (this.includeTimelines) {
      out.timelines = this._captureTimelines(opts);
    }

    if (this.includeIndexes) {
      out.indexes = this._captureIndexes();
    }

    out.machine = this._captureMachine();

    if (this.includeRegistry) {
      out.registry = this._captureRegistry();
    }

    if (opts.includeDiagnostics) {
      out.diagnostics = opts.includeDiagnostics;
    }

    return out;
  }

  /**
   * Dump em JSON pretty.
   * @param {Object} [opts={}]
   * @returns {string}
   */
  dumpJSON(opts = {}) {
    return JSON.stringify(this.dump(opts), null, 2);
  }

  /**
   * Dump compacto — só contagens e chaves, sem dados completos.
   * Útil para exibição rápida no painel.
   * @returns {Object}
   */
  dumpCompact() {
    if (!this.isAttached()) {
      throw new Error('[SnapshotDumper] não anexado');
    }

    const world = this._world;
    const machine = this._machine;

    const componentCounts = {};
    for (const name of world.componentNames()) {
      componentCounts[name] = world.componentCount(name);
    }

    return {
      meta: this._captureMeta(),
      summary: {
        entities: world.entities.size,
        components: world.components.size,
        componentCounts,
        tick: machine.state?.tick ?? null,
        timeline: machine.state?.timeline ?? null,
        systems: machine.systems?.size ?? 0,
        idsRegistered: machine.ids?.byShortcode?.size ?? 0,
        linksEdges: typeof machine.links?.count === 'function'
          ? machine.links.count()
          : 0,
      },
    };
  }

  /**
   * Estima tamanho em bytes do dump.
   * @param {Object} dump
   * @returns {number}
   */
  estimate(dump) {
    if (!dump) return 0;
    try {
      return JSON.stringify(dump).length;
    } catch {
      return -1;
    }
  }

  // ── Captura: meta ───────────────────────────────────────────

  /**
   * @private
   */
  _captureMeta(opts = {}) {
    const sessionId = opts.sessionId
      ?? this._machine?.diagnostics?.sessionId
      ?? this._machine?.state?.sessionId
      ?? null;

    return {
      sessionId,
      timestamp: Date.now(),
      isoTimestamp: new Date().toISOString(),
      tick: this._machine.state?.tick ?? null,
      tickNumber: this._machine.state?.tickNumber ?? null,
      timeline: this._machine.state?.timeline ?? null,
      appVersion: '1.0',
      appName: 'narrative-ecs',
    };
  }

  // ── Captura: world ──────────────────────────────────────────

  /**
   * @private
   */
  _captureWorld(opts = {}) {
    const world = this._world;
    const entities = {};
    const empty = [];
    const ids = world.allEntities();

    for (const id of ids) {
      const comps = world.componentsOf(id);
      if (!comps || Object.keys(comps).length === 0) {
        empty.push(id);
        if (this.includeEmptyComponents) entities[id] = {};
        continue;
      }

      if (opts.sanitize) {
        entities[id] = this._sanitize(comps);
      } else {
        entities[id] = comps;
      }
    }

    return {
      entities,
      count: ids.length,
      emptyEntities: empty,
      componentNames: world.componentNames(),
    };
  }

  // ── Captura: timelines ──────────────────────────────────────

  /**
   * @private
   */
  _captureTimelines(opts = {}) {
    const timeline = this._machine.systems?.get?.('TimelineSystem');
    if (!timeline) return null;

    const includeSnapshots = opts.includeSnapshots ?? this.includeSnapshots;

    const out = {
      active: timeline.activeTimeline,
      list: [],
      snapshots: {},
    };

    for (const [name, tl] of timeline.timelines) {
      out.list.push({
        name,
        base: tl.base ?? null,
        point: tl.point ?? null,
        createdAt: tl.createdAt ?? null,
        ticks: tl.entries?.length ?? 0,
        active: name === timeline.activeTimeline,
      });

      const tickList = tl.snapshots
        ? Array.from(tl.snapshots.keys())
        : [];

      const entrySummary = (tl.entries || []).map(e => ({
        tick: e.tick,
        kind: e.kind,
        mutation: e.mutation ? {
          op: e.mutation.op,
          kind: e.mutation.kind,
          target: e.mutation.target,
          path: e.mutation.path,
        } : null,
        link: e.link ? {
          action: e.link.action,
          rel: e.link.rel,
          from: e.link.from,
          to: e.link.to ?? null,
        } : null,
        created: e.created ? { id: e.created.id } : null,
      }));

      if (includeSnapshots) {
        const fullSnapshots = {};
        for (const [tick, snap] of tl.snapshots) {
          fullSnapshots[tick] = snap;
        }
        out.snapshots[name] = {
          tickList,
          entries: entrySummary,
          full: fullSnapshots,
        };
      } else {
        out.snapshots[name] = {
          tickList,
          entries: entrySummary,
        };
      }
    }

    return out;
  }

  // ── Captura: indexes ────────────────────────────────────────

  /**
   * @private
   */
  _captureIndexes() {
    const out = {};

    const ids = this._machine.ids;
    if (ids) {
      out.ids = {
        byShortcode: this._mapToPlain(ids.byShortcode),
        byEntityId: this._mapToPlain(ids.byEntityId),
        size: ids.byShortcode?.size ?? 0,
      };
    }

    const links = this._machine.links;
    if (links) {
      out.links = {
        forwardSize: links.forward?.size ?? 0,
        reverseSize: links.reverse?.size ?? 0,
        edges: typeof links.count === 'function' ? links.count() : 0,
        rels: typeof links.allRels === 'function' ? links.allRels() : [],
      };
    }

    return out;
  }

  // ── Captura: machine ────────────────────────────────────────

  /**
   * @private
   */
  _captureMachine() {
    const m = this._machine;
    const systems = m.systems ? Array.from(m.systems.keys()) : [];

    return {
      state: {
        tick: m.state?.tick ?? null,
        tickNumber: m.state?.tickNumber ?? null,
        timeline: m.state?.timeline ?? null,
        play: m.state?.play === true,
        roll: m.state?.roll ?? null,
        focusedEntity: m.state?.focusedEntity ?? null,
      },
      systems,
      systemCount: systems.length,
    };
  }

  // ── Captura: registry ───────────────────────────────────────

  /**
   * @private
   */
  _captureRegistry() {
    const out = {};

    // ComponentRegistry (schemas)
    const worldReg = this._world.registry;
    if (worldReg && typeof worldReg.all === 'function') {
      out.componentSchemas = worldReg.all();
    }

    // Registry (metadata)
    const machReg = this._machine.registry;
    if (machReg) {
      out.metadata = {
        components: (machReg.getComponents?.() ?? []).map(c => c.name),
        snippets: (machReg.getSnippets?.() ?? []).map(s => s.trigger),
        commands: (machReg.getCommands?.() ?? []).map(c => c.verb),
      };
    }

    return out;
  }

  // ── Internos ────────────────────────────────────────────────

  /**
   * Converte Map em objeto plano.
   * @private
   */
  _mapToPlain(map) {
    if (!map || typeof map.entries !== 'function') return {};
    const out = {};
    for (const [k, v] of map) out[k] = v;
    return out;
  }

  /**
   * Remove funções e símbolos para permitir serialização.
   * @private
   */
  _sanitize(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'function') return '[Function]';
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(v => this._sanitize(v));

    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = this._sanitize(v);
    }
    return out;
  }
}