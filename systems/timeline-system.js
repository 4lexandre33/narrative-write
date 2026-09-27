/**
 * @file timeline-system.js
 * @module systems
 * @description Snapshots + entries. Coração da memória do mundo.
 * @imports ecs/system, ecs/snapshot, core/constants
 * @level 7
 */

import { System } from '../ecs/system.js';
import { Snapshot } from '../ecs/snapshot.js';

export class TimelineSystem extends System {
  constructor() {
    super('TimelineSystem');
    this.entries = [];
    this.snapshots = new Map();
    /** @type {Map<string, Array>} */
    this.timelines = new Map([['main', { entries: this.entries, snapshots: this.snapshots }]]);
    this.activeTimeline = 'main';
  }

  init() {
    const snap = Snapshot.take(this.world, { tick: this.getTick(), timeline: this.activeTimeline });
    this.entries.push({ tick: this.getTick(), kind: 'init', snapshot: snap, diff: null, mutation: null });
    this.snapshots.set(this.getTick(), snap);
  }

  run(_line, _ctx, prev) {
    if (!prev.mutated) return prev;

    const tick = this.getTick();
    const snap = Snapshot.take(this.world, { tick, timeline: this.activeTimeline });
    const previous = this.snapshots.size > 0
      ? Array.from(this.snapshots.values())[this.snapshots.size - 1]
      : null;
    const diff = previous ? Snapshot.diff(previous, snap) : null;

    const entry = {
      tick,
      timeline: this.activeTimeline,
      kind: prev.created ? 'entity-created' : 'mutation',
      created: prev.created ?? null,
      mutation: prev.mutation ?? null,
      link: prev.link ?? null,
      snapshot: snap,
      diff,
      recordedAt: Date.now(),
    };

    this.entries.push(entry);
    this.snapshots.set(tick, snap);
    this.bus.emit('timeline:recorded', entry);

    return { ...prev, timelineEntry: entry, diff };
  }

  getTimeline(name = null) {
    const tl = name ? this.timelines.get(name) : this.timelines.get(this.activeTimeline);
    return tl?.entries ?? [];
  }

  getSnapshot(tick, name = null) {
    const tl = name ? this.timelines.get(name) : this.timelines.get(this.activeTimeline);
    return tl?.snapshots.get(tick) ?? null;
  }

  getLastTick(name = null) {
    const entries = this.getTimeline(name);
    return entries.length ? entries[entries.length - 1].tick : 'T0';
  }

  createTimeline(name, { snapshots, base, point, createdAt }) {
    const entries = [];
    for (const [tick, snap] of snapshots) {
      entries.push({ tick, kind: 'checkpoint', snapshot: snap, diff: null, mutation: null });
    }
    this.timelines.set(name, { entries, snapshots: new Map(snapshots), base, point, createdAt });
    return { name, base, point, entries: entries.length };
  }

  switchTo(name) {
    if (!this.timelines.has(name)) throw new Error(`timeline não existe: ${name}`);
    this.activeTimeline = name;
    const tl = this.timelines.get(name);
    this.entries = tl.entries;
    this.snapshots = tl.snapshots;
    return { name, lastTick: this.getLastTick(name) };
  }

  deleteTimeline(name) {
    if (name === 'main') throw new Error('não pode apagar main');
    if (!this.timelines.has(name)) throw new Error(`timeline não existe: ${name}`);
    this.timelines.delete(name);
  }

  listTimelines() {
    const out = [];
    for (const [name, tl] of this.timelines) {
      out.push({
        name, base: tl.base ?? null, point: tl.point ?? null,
        ticks: tl.entries.length, active: name === this.activeTimeline,
      });
    }
    return out;
  }

  size() { return this.entries.length; }
  clear() { this.entries.length = 0; this.snapshots.clear(); }
}