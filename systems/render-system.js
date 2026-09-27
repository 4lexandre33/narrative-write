/**
 * @file render-system.js
 * @module systems
 * @description Empurra resultados para os três painéis.
 * @imports ecs/system
 * @level 7
 */

import { System } from '../ecs/system.js';

export class RenderSystem extends System {
  constructor() { super('RenderSystem'); }

  run(_line, _ctx, prev) {
    if (prev.left) this.bus.emit('render:left', prev.left);
    if (prev.right) this.bus.emit('render:right', prev.right);
    if (prev.annotation) this.bus.emit('render:annotation', prev.annotation);

    if (prev.mutated) {
      const highlight = [];
      if (prev.created?.id) highlight.push(prev.created.id);
      if (prev.mutation?.target) highlight.push(prev.mutation.target);
      if (prev.link?.from) highlight.push(prev.link.from);
      if (prev.instance?.id) highlight.push(prev.instance.id);
      if (prev.destroyed) highlight.push(prev.destroyed);
      if (highlight.length) {
        this.bus.emit('render:left', { kind: 'highlight', ids: highlight });
      }
    }
    return prev;
  }
}