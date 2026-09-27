/**
 * @file persistence-system.js
 * @module systems
 * @description Flush debounced do estado para storage, com compressão opcional.
 * @imports ecs/system, core/constants, data/compression
 * @level 7
 */

import { System } from '../ecs/system.js';
import { DEBOUNCE_MS, STORAGE_KEYS } from '../core/constants.js';
import { Compression } from '../data/compression.js';

export class PersistenceSystem extends System {
  constructor() {
    super('PersistenceSystem');
    this.adapter = null;
    this._timer = null;
    this.lastFlushAt = null;
  }

  init() {
    this.on('persist:flush', () => this.schedule());
    this.on('tick:advanced', () => this.schedule());
  }

  setAdapter(adapter) {
    this.adapter = adapter;
  }

  run(_line, _ctx, prev) {
    return prev;
  }

  // ── API de carregamento ────────────────────────────────────

  /**
   * Lê e descomprime `world:main`.
   * Retorna o objeto de estado já parseado, ou `null` se ausente.
   *
   * @returns {Promise<Object|null>}
   */
  async loadWorld() {
    if (!this.adapter) return null;
    const raw = await this.adapter.get(STORAGE_KEYS.WORLD_MAIN);
    if (!raw) return null;

    const json = await Compression.decompress(raw);
    if (!json) return null;

    try {
      return JSON.parse(json);
    } catch (err) {
      throw new Error(`[persist] payload corrompido: ${err.message}`);
    }
  }

  // ── Flush ─────────────────────────────────────────────────

  /**
   * Agenda um flush com debounce.
   */
  schedule() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), DEBOUNCE_MS);
  }

  /**
   * Serializa e persiste o estado atual.
   * Aplica compressão se disponível e registra em `meta:compression`.
   *
   * @param {string} [reason='debounced']
   * @returns {Promise<{ ok:boolean, error?:string, size?:number, compressed?:boolean }>}
   */
  async flush(reason = 'debounced') {
    if (!this.adapter) return { ok: false, error: 'sem adapter' };

    try {
      const state = this._serializeState();
      const json = JSON.stringify(state);
      const payload = await Compression.compress(json);
      const compressed = Compression.isCompressed(payload);

      await this.adapter.set(STORAGE_KEYS.WORLD_MAIN, payload);
      await this.adapter.set(STORAGE_KEYS.META_LAST_TICK, this.getTick());
      await this.adapter.set(
        STORAGE_KEYS.META_COMPRESSION,
        compressed ? 'gzip' : 'none'
      );

      this.lastFlushAt = Date.now();
      this.bus.emit('persist:saved', {
        tick: this.getTick(),
        reason,
        size: payload.length,
        compressed,
      });

      return { ok: true, size: payload.length, compressed };
    } catch (err) {
      this.bus.emit('persist:failed', { error: err.message });
      return { ok: false, error: err.message };
    }
  }

  // ── Serialização ──────────────────────────────────────────

  /**
   * Monta o objeto de estado a partir do World e das timelines.
   * @returns {Object}
   * @private
   */
  _serializeState() {
    const timeline = this.machine?.systems?.get('TimelineSystem');

    const state = {
      version: 1,
      savedAt: Date.now(),
      tick: this.getTick(),
      timeline: this.getTimeline(),
      world: {},
      timelines: {},
    };

    for (const id of this.world.allEntities()) {
      state.world[id] = this.world.componentsOf(id);
    }

    if (timeline) {
      for (const [name, tl] of timeline.timelines) {
        state.timelines[name] = {
          entries: tl.entries.map(e => ({
            tick: e.tick,
            kind: e.kind,
            mutation: e.mutation ?? null,
            link: e.link ?? null,
            created: e.created ?? null,
          })),
          snapshots: Object.fromEntries(tl.snapshots),
        };
      }
    }

    return state;
  }
}