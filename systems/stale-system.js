/**
 * @file stale-system.js
 * @module systems
 * @description Propaga marcação Stale quando blueprint muda.
 * @imports ecs/system, core/constants
 * @level 7
 */

import { System } from '../ecs/system.js';
import { COMPONENT_NAMES } from '../core/constants.js';

export class StaleSystem extends System {
  constructor() { super('StaleSystem'); }

  init() {
    this.on('component:updated', (e) => this._maybeMark(e));
    this.on('component:added',   (e) => this._maybeMark(e));
  }

  run(_line, _ctx, prev) { return prev; }

  _maybeMark({ id, name }) {
    if (!id) return;
    if (!this.world.has(id, COMPONENT_NAMES.IS_BLUEPRINT)) return;

    const tick = this.getTick();
    const descendants = this._walkDescendants(id);
    for (const d of descendants) {
      if (this.world.has(d, COMPONENT_NAMES.STALE)) continue;
      this.world.addComponent(d, COMPONENT_NAMES.STALE, {
        value: true, at: tick, cause: `${id}.${name}`,
      });
    }
    if (descendants.length > 0) {
      this.bus.emit('stale:propagated', { source: id, field: name, marked: descendants });
    }
  }

  _walkDescendants(rootId) {
    const out = [];
    const seen = new Set();
    const queue = [rootId];
    while (queue.length) {
      const cur = queue.shift();
      for (const id of this.world.allEntities()) {
        if (seen.has(id) || id === rootId) continue;
        const instOf = this.world.get(id, COMPONENT_NAMES.INSTANCE_OF)?.id;
        const derives = this.world.get(id, COMPONENT_NAMES.DERIVES_FROM)?.ids ?? [];
        if (instOf === cur || derives.includes(cur)) {
          seen.add(id);
          out.push(id);
          queue.push(id);
        }
      }
    }
    return out;
  }
}