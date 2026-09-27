/**
 * @file link-index.js
 * @module ecs
 * @description Índice bidirecional de links. Forward (de A para B) e reverse (de B para A).
 * @imports core/constants
 * @importedBy context-machine/machine, systems/link-system, systems/link-query-system, systems/audit-system
 * @level 3
 *
 * Fase 3 — Diagnostics: emite `link-index:drift` se, durante rebuild(),
 * o número de arestas cair sem que entidades tenham sido destruídas.
 */

import { COMPONENT_NAMES } from '../core/constants.js';

export class LinkIndex {
  /**
   * @param {EventBus} bus — assina eventos para auto-manter-se sincronizado
   */
  constructor(bus) {
    this.bus = bus;

    /**
     * forward: Map<fromId, Map<rel, Set<toId>>>
     * @type {Map<string, Map<string, Set<string>>>}
     */
    this.forward = new Map();

    /**
     * reverse: Map<toId, Set<{from:string, rel:string}>>
     * @type {Map<string, Set<{from:string, rel:string}>>}
     */
    this.reverse = new Map();

    /** @type {Array<Function>} */
    this._unsubs = [];

    if (bus) {
      this._wire();
    }
  }

  // ── Assinatura de eventos ───────────────────────────────────

  /**
   * @private
   */
  _wire() {
    this._unsubs.push(
      this.bus.on('component:added', ({ id, name, data }) => {
        if (name === COMPONENT_NAMES.LINKS) {
          this._deindex(id);
          this._indexAll(id, data);
        }
      })
    );

    this._unsubs.push(
      this.bus.on('component:updated', ({ id, name, next }) => {
        if (name === COMPONENT_NAMES.LINKS) {
          this._deindex(id);
          if (next) this._indexAll(id, next);
        }
      })
    );

    this._unsubs.push(
      this.bus.on('component:removed', ({ id, name }) => {
        if (name === COMPONENT_NAMES.LINKS) {
          this._deindex(id);
        }
      })
    );

    this._unsubs.push(
      this.bus.on('entity:destroyed', ({ id }) => {
        this._deindex(id);
      })
    );
  }

  // ── Consultas ───────────────────────────────────────────────

  from(id, rel) {
    const fwd = this.forward.get(id);
    if (!fwd) return rel ? [] : [];

    if (rel) {
      return Array.from(fwd.get(rel) || []);
    }

    const out = [];
    for (const [r, set] of fwd) {
      for (const to of set) {
        out.push({ rel: r, to });
      }
    }
    return out;
  }

  to(id) {
    const rev = this.reverse.get(id);
    if (!rev) return [];
    return Array.from(rev);
  }

  has(from, rel, to) {
    return this.forward.get(from)?.get(rel)?.has(to) ?? false;
  }

  hasAnyOutgoing(id) {
    return (this.forward.get(id)?.size ?? 0) > 0;
  }

  hasAnyIncoming(id) {
    return (this.reverse.get(id)?.size ?? 0) > 0;
  }

  count() {
    let n = 0;
    for (const fwd of this.forward.values()) {
      for (const set of fwd.values()) n += set.size;
    }
    return n;
  }

  allRels() {
    const rels = new Set();
    for (const fwd of this.forward.values()) {
      for (const rel of fwd.keys()) rels.add(rel);
    }
    return Array.from(rels);
  }

  // ── Reindexação ─────────────────────────────────────────────

  reindex(id, links) {
    this._deindex(id);
    if (links) this._indexAll(id, links);
  }

  /**
   * Reconstrói o índice completo a partir de um World.
   * Emite `link-index:drift` se as arestas caírem sem entidades destruídas.
   * @param {Object} world
   */
  rebuild(world) {
    const beforeEdges = this.count();
    const beforeEntities = world?.entities?.size ?? 0;

    this.forward.clear();
    this.reverse.clear();

    if (!world || typeof world.allEntities !== 'function') return;

    for (const id of world.allEntities()) {
      const links = world.get(id, COMPONENT_NAMES.LINKS);
      if (links) this._indexAll(id, links);
    }

    const afterEdges = this.count();
    const afterEntities = world?.entities?.size ?? 0;

    // ── Captura do invisível ─────────────────────────────
    // Drift = arestas caíram sem que entidades tenham sido destruídas.
    if (afterEdges < beforeEdges && afterEntities >= beforeEntities) {
      this.bus?.emit('link-index:drift', {
        before: beforeEdges,
        after: afterEdges,
        edges: afterEdges,
        delta: afterEdges - beforeEdges,
        entitiesBefore: beforeEntities,
        entitiesAfter: afterEntities,
      });
    }

    this.bus?.emit('link-index:rebuilt', {
      forward: this.forward.size,
      reverse: this.reverse.size,
      edges: afterEdges,
    });
  }

  // ── Índices internos ────────────────────────────────────────

  /**
   * @private
   */
  _indexAll(from, links) {
    if (!links || typeof links !== 'object') return;

    for (const [rel, value] of Object.entries(links)) {
      const targets = Array.isArray(value) ? value : [value];
      for (const to of targets) {
        if (typeof to === 'string' && to) {
          this._addEdge(from, rel, to);
        }
      }
    }
  }

  /**
   * @private
   */
  _deindex(from) {
    const fwd = this.forward.get(from);
    if (!fwd) return;

    for (const [rel, targets] of fwd) {
      for (const to of targets) {
        const rev = this.reverse.get(to);
        if (!rev) continue;

        for (const entry of Array.from(rev)) {
          if (entry.from === from && entry.rel === rel) {
            rev.delete(entry);
          }
        }
        if (rev.size === 0) {
          this.reverse.delete(to);
        }
      }
    }
    this.forward.delete(from);
  }

  /**
   * @private
   */
  _addEdge(from, rel, to) {
    if (!this.forward.has(from)) {
      this.forward.set(from, new Map());
    }
    const fwd = this.forward.get(from);
    if (!fwd.has(rel)) {
      fwd.set(rel, new Set());
    }
    fwd.get(rel).add(to);

    if (!this.reverse.has(to)) {
      this.reverse.set(to, new Set());
    }
    this.reverse.get(to).add({ from, rel });
  }

  // ── Ciclo de vida ───────────────────────────────────────────

  clear() {
    this.forward.clear();
    this.reverse.clear();
  }

  destroy() {
    for (const unsub of this._unsubs) {
      try { unsub(); } catch { /* noop */ }
    }
    this._unsubs = [];
    this.clear();
  }

  stats() {
    return {
      forward: this.forward.size,
      reverse: this.reverse.size,
      edges: this.count(),
      rels: this.allRels().length,
    };
  }
}