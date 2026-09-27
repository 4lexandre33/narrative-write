/**
 * @file fork-system.js
 * @module systems
 * @description Handles frk.create/switch/list/delete/merge.
 * @imports ecs/system, ecs/snapshot, core/constants
 * @level 7
 */

import { System } from '../ecs/system.js';
import { Snapshot } from '../ecs/snapshot.js';

export class ForkSystem extends System {
  constructor() { super('ForkSystem'); }

  run(_line, _ctx, prev) {
    const ast = prev.ast;
    if (!ast || ast.verb !== 'frk') return prev;
    const timeline = this.machine?.systems?.get('TimelineSystem');
    if (!timeline) return prev;

    try {
      switch (ast.action) {
        case 'create': return this._create(prev, ast, timeline);
        case 'switch': return this._switch(prev, ast, timeline);
        case 'list':   return this._list(prev, timeline);
        case 'delete': return this._delete(prev, ast, timeline);
        case 'merge':  return this._merge(prev, ast, timeline);
        default:       return prev;
      }
    } catch (err) {
      return { ...prev, ok: false, halt: true, error: err.message };
    }
  }

  _create(prev, ast, timeline) {
    if (timeline.timelines.has(ast.name)) {
      return { ...prev, ok: false, halt: true, error: `timeline já existe: ${ast.name}` };
    }
    const base = timeline.activeTimeline;
    const atTick = ast.opts?.at ?? timeline.getLastTick(base);
    const baseEntries = timeline.getTimeline(base);
    const newSnapshots = new Map();
    for (const e of baseEntries) {
      if (parseInt(e.tick.slice(1), 10) > parseInt(atTick.slice(1), 10)) break;
      newSnapshots.set(e.tick, Snapshot.clone(e.snapshot));
    }
    const baseSnap = newSnapshots.get(atTick);
    if (!baseSnap) return { ...prev, ok: false, halt: true, error: `tick não existe em ${base}: ${atTick}` };

    timeline.createTimeline(ast.name, { snapshots: newSnapshots, base, point: atTick, createdAt: this.getTick() });
    Snapshot.restore(this.world, baseSnap, { clear: true });
    timeline.switchTo(ast.name);
    this.machine.state.timeline = ast.name;
    this.machine.state.tick = atTick;
    this.machine.state.tickNumber = parseInt(atTick.slice(1), 10);

    // Reindexa links e ids após restaurar o mundo
    this._rebuildIndexes();

    return { ...prev, ok: true, mutated: true, fork: { name: ast.name, base, at: atTick }};
  }

  _switch(prev, ast, timeline) {
    if (!timeline.timelines.has(ast.name)) {
      return { ...prev, ok: false, halt: true, error: `timeline não existe: ${ast.name}` };
    }
    const lastTick = timeline.getLastTick(ast.name);
    const snap = timeline.getSnapshot(lastTick, ast.name);
    Snapshot.restore(this.world, snap, { clear: true });
    timeline.switchTo(ast.name);
    this.machine.state.timeline = ast.name;
    this.machine.state.tick = lastTick;
    this.machine.state.tickNumber = parseInt(lastTick.slice(1), 10);

    // Reindexa links e ids após restaurar o mundo
    this._rebuildIndexes();

    return { ...prev, ok: true, mutated: false, switched: { to: ast.name, tick: lastTick }};
  }

  _list(prev, timeline) {
    return { ...prev, ok: true, right: { kind: 'table', title: 'Timelines', data: timeline.listTimelines() }};
  }

  _delete(prev, ast, timeline) {
    if (ast.name === 'main') return { ...prev, ok: false, halt: true, error: 'não pode apagar main' };
    if (!timeline.timelines.has(ast.name)) return { ...prev, ok: false, halt: true, error: `timeline não existe: ${ast.name}` };
    const wasActive = timeline.activeTimeline === ast.name;
    timeline.deleteTimeline(ast.name);
    if (wasActive) {
      const lastTick = timeline.getLastTick('main');
      Snapshot.restore(this.world, timeline.getSnapshot(lastTick, 'main'), { clear: true });
      timeline.switchTo('main');
      this.machine.state.timeline = 'main';
      this.machine.state.tick = lastTick;

      // Reindexa links e ids após restaurar o mundo
      this._rebuildIndexes();
    }
    return { ...prev, ok: true, mutated: true, deleted: ast.name };
  }

  _merge(prev, ast, timeline) {
    if (!timeline.timelines.has(ast.name)) return { ...prev, ok: false, halt: true, error: `timeline não existe: ${ast.name}` };
    if (ast.name === timeline.activeTimeline) return { ...prev, ok: false, halt: true, error: 'não pode merge de si mesma' };

    const srcTick = timeline.getLastTick(ast.name);
    const dstTick = timeline.getLastTick(timeline.activeTimeline);
    const snapSrc = timeline.getSnapshot(srcTick, ast.name);
    const snapDst = timeline.getSnapshot(dstTick, timeline.activeTimeline);
    const diff = Snapshot.diff(snapDst, snapSrc);

    for (const id of diff.added) {
      this.world.createEntity(snapSrc.entities[id], { id });
    }
    for (const id of diff.removed) {
      this.world.destroyEntity(id);
    }
    for (const { id, patch } of diff.changed) {
      for (const [comp, data] of Object.entries(patch)) {
        if (data.op === 'added') this.world.addComponent(id, comp, data.after);
        else if (data.op === 'removed') this.world.removeComponent(id, comp);
        else this.world.set(id, comp, data.after);
      }
    }

    // Reindexa links e ids após mutação direta
    this._rebuildIndexes();

    return { ...prev, ok: true, mutated: true, merged: { source: ast.name, target: timeline.activeTimeline, stats: diff.stats }};
  }

  // ── Internos ───────────────────────────────────────────────

  /**
   * Reconstrói LinkIndex e IdRegistry a partir do World atual.
   * Chamado após qualquer restore/merge que troque o estado do mundo.
   * @private
   */
  _rebuildIndexes() {
    if (this.links) this.links.rebuild(this.world);
    if (this.ids) this.ids.rebuildFromWorld(this.world);
    if (this.machine?.links && this.machine.links !== this.links) {
      this.machine.links.rebuild(this.world);
    }
    if (this.machine?.ids && this.machine.ids !== this.ids) {
      this.machine.ids.rebuildFromWorld(this.world);
    }
  }
}