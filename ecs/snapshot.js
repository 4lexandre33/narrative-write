/**
 * @file snapshot.js
 * @module ecs
 * @description Captura, restaura, clona e compara estado do World.
 * @imports core/constants, core/utils/object, core/utils/time
 * @importedBy systems/timeline-system, systems/fork-system, systems/diff-system, systems/persistence-system, ui/history-panel
 * @level 5
 */

import { COMPONENT_NAMES } from '../core/constants.js';
import { deepClone, deepEqual, deepFreeze } from '../core/utils/object.js';
import { nowISO } from '../core/utils/time.js';

export class Snapshot {
  // ── Captura ─────────────────────────────────────────────────

  /**
   * Tira um snapshot do estado atual do World.
   * @param {Object} world
   * @param {Object} [meta={}]
   * @param {string} [meta.tick='T0']
   * @param {string} [meta.timeline='main']
   * @param {Object} [meta.extra]
   * @param {boolean} [meta.freeze=true] — congela o snapshot para imutabilidade
   * @returns {Object} SnapshotData
   */
  static take(world, meta = {}) {
    if (!world || typeof world.allEntities !== 'function') {
      throw new Error('[Snapshot] world inválido');
    }

    const tick = String(meta.tick ?? 'T0');
    const timeline = String(meta.timeline ?? 'main');
    const freeze = meta.freeze !== false;

    const entities = {};
    const ids = world.allEntities();

    for (const id of ids) {
      const comps = world.componentsOf(id);
      if (comps) {
        entities[id] = deepClone(comps);
      }
    }

    const snapshot = {
      version: 1,
      takenAt: nowISO(),
      tick,
      timeline,
      entities,
      schemas: typeof world.registry?.all === 'function'
        ? world.registry.all()
        : [],
      metadata: {
        entityCount: ids.length,
        estimatedBytes: Snapshot.estimate({ entities }),
        isClone: false,
        isCheckpoint: false,
        ...(meta.extra || {}),
      },
    };

    return freeze ? deepFreeze(snapshot) : snapshot;
  }

  // ── Restauração ─────────────────────────────────────────────

  /**
   * Restaura um snapshot no World.
   * @param {Object} world
   * @param {Object} snapshot
   * @param {Object} [opts={}]
   * @param {boolean} [opts.clear=true] — limpa World antes de restaurar
   * @param {boolean} [opts.emitEvents=false] — emite entity:created/component:added
   * @returns {Object} world
   */
  static restore(world, snapshot, opts = {}) {
    if (!world || typeof world.createEntity !== 'function') {
      throw new Error('[Snapshot] world inválido');
    }
    if (!Snapshot.isValid(snapshot)) {
      throw new Error('[Snapshot] snapshot inválido');
    }

    const { clear = true, emitEvents = false } = opts;

    if (clear) {
      world.clear();
    }

    for (const [id, comps] of Object.entries(snapshot.entities || {})) {
      world.createEntity(emitEvents ? comps : { ...comps }, { id });
    }

    return world;
  }

  // ── Clone ───────────────────────────────────────────────────

  /**
   * Clone profundo de um snapshot. Independente do original.
   * @param {Object} snapshot
   * @param {Object} [meta={}] — campos que sobrescrevem no metadata
   * @returns {Object} novo SnapshotData
   */
  static clone(snapshot, meta = {}) {
    if (!Snapshot.isValid(snapshot)) {
      throw new Error('[Snapshot] snapshot inválido');
    }

    const cloned = deepClone(snapshot);
    cloned.takenAt = nowISO();
    cloned.metadata = {
      ...cloned.metadata,
      ...meta,
      isClone: true,
      clonedFrom: snapshot.takenAt,
    };

    return deepFreeze(cloned);
  }

  // ── Diff ────────────────────────────────────────────────────

  /**
   * Compara dois snapshots.
   * @param {Object} a
   * @param {Object} b
   * @returns {Object} DiffResult
   */
  static diff(a, b) {
    if (!Snapshot.isValid(a) || !Snapshot.isValid(b)) {
      throw new Error('[Snapshot] snapshots inválidos para diff');
    }

    const idsA = new Set(Object.keys(a.entities || {}));
    const idsB = new Set(Object.keys(b.entities || {}));

    const added = [];
    const removed = [];
    const changed = [];

    for (const id of idsB) {
      if (!idsA.has(id)) added.push(id);
    }
    for (const id of idsA) {
      if (!idsB.has(id)) removed.push(id);
    }

    for (const id of idsA) {
      if (!idsB.has(id)) continue;

      const ca = a.entities[id] || {};
      const cb = b.entities[id] || {};
      const keys = new Set([...Object.keys(ca), ...Object.keys(cb)]);
      const patch = {};

      for (const compName of keys) {
        const dataA = ca[compName];
        const dataB = cb[compName];

        if (dataA === undefined && dataB !== undefined) {
          patch[compName] = { op: 'added', after: deepClone(dataB) };
        } else if (dataA !== undefined && dataB === undefined) {
          patch[compName] = { op: 'removed', before: deepClone(dataA) };
        } else if (!deepEqual(dataA, dataB)) {
          patch[compName] = {
            op: 'changed',
            before: deepClone(dataA),
            after: deepClone(dataB),
          };
        }
      }

      if (Object.keys(patch).length > 0) {
        changed.push({ id, patch });
      }
    }

    const stats = {
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      unchanged: idsA.size - changed.length - removed.length,
      total: added.length + removed.length + changed.length,
    };

    return deepFreeze({
      from: { tick: a.tick, takenAt: a.takenAt },
      to: { tick: b.tick, takenAt: b.takenAt },
      added,
      removed,
      changed,
      stats,
      computedAt: Date.now(),
    });
  }

  /**
   * Diff filtrado por uma única entidade.
   * @param {Object} a
   * @param {Object} b
   * @param {string} entityId
   * @returns {Object|null} patch da entidade ou null
   */
  static diffEntity(a, b, entityId) {
    if (!entityId) return null;

    const ca = a?.entities?.[entityId];
    const cb = b?.entities?.[entityId];

    if (!ca && !cb) return null;

    const keys = new Set([
      ...Object.keys(ca || {}),
      ...Object.keys(cb || {}),
    ]);
    const patch = {};

    for (const compName of keys) {
      const dataA = ca?.[compName];
      const dataB = cb?.[compName];

      if (dataA === undefined && dataB !== undefined) {
        patch[compName] = { op: 'added', after: deepClone(dataB) };
      } else if (dataA !== undefined && dataB === undefined) {
        patch[compName] = { op: 'removed', before: deepClone(dataA) };
      } else if (!deepEqual(dataA, dataB)) {
        patch[compName] = {
          op: 'changed',
          before: deepClone(dataA),
          after: deepClone(dataB),
        };
      }
    }

    if (Object.keys(patch).length === 0) return null;

    return deepFreeze({ id: entityId, patch });
  }

  /**
   * Diff filtrado por componente(s).
   * @param {Object} a
   * @param {Object} b
   * @param {string[]} componentNames
   * @returns {Object} DiffResult filtrado
   */
  static diffComponents(a, b, componentNames = []) {
    const full = Snapshot.diff(a, b);
    const wanted = new Set(componentNames);

    const changed = full.changed
      .map(({ id, patch }) => {
        const filtered = {};
        for (const [comp, data] of Object.entries(patch)) {
          if (wanted.has(comp)) filtered[comp] = data;
        }
        return Object.keys(filtered).length ? { id, patch: filtered } : null;
      })
      .filter(Boolean);

    const stats = {
      added: full.stats.added,
      removed: full.stats.removed,
      changed: changed.length,
      total: full.stats.added + full.stats.removed + changed.length,
    };

    return deepFreeze({ ...full, changed, stats });
  }

  // ── Utilidades ──────────────────────────────────────────────

  /**
   * Valida a forma de um snapshot.
   * @param {any} s
   * @returns {boolean}
   */
  static isValid(s) {
    return !!s
      && typeof s === 'object'
      && s.version === 1
      && typeof s.tick === 'string'
      && typeof s.timeline === 'string'
      && s.entities
      && typeof s.entities === 'object';
  }

  /**
   * Estima tamanho em bytes (sem stringify real).
   * Aproximação: soma de comprimentos de chaves e valores serializados.
   * @param {Object} snapshot
   * @returns {number}
   */
  static estimate(snapshot) {
    if (!snapshot?.entities) return 0;
    let bytes = 0;
    for (const [id, comps] of Object.entries(snapshot.entities)) {
      bytes += id.length;
      for (const [name, data] of Object.entries(comps || {})) {
        bytes += name.length;
        bytes += _estimateValue(data);
      }
    }
    return bytes;
  }

  /**
   * Congela profundamente um snapshot (idempotente).
   * @param {Object} snapshot
   * @returns {Object}
   */
  static freeze(snapshot) {
    return deepFreeze(snapshot);
  }
}

/**
 * Estima bytes de um valor recursivamente.
 * @param {any} v
 * @returns {number}
 * @private
 */
function _estimateValue(v) {
  if (v === null || v === undefined) return 4;
  if (typeof v === 'number') return 8;
  if (typeof v === 'boolean') return 5;
  if (typeof v === 'string') return v.length + 2;

  if (Array.isArray(v)) {
    let n = 2;
    for (const item of v) n += _estimateValue(item) + 1;
    return n;
  }

  if (typeof v === 'object') {
    let n = 2;
    for (const [k, val] of Object.entries(v)) {
      n += k.length + 3 + _estimateValue(val) + 1;
    }
    return n;
  }

  return 8;
}