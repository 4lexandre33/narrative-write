/**
 * @file validation-system.js
 * @module systems
 * @description Valida unicidade, refs e ciclos pós-mutação.
 * @imports ecs/system, core/constants
 * @level 7
 */

import { System } from '../ecs/system.js';
import { COMPONENT_NAMES } from '../core/constants.js';

export class ValidationSystem extends System {
  constructor() { super('ValidationSystem'); }

  run(_line, _ctx, prev) {
    if (!prev.mutated) return prev;
    const warnings = [];

    // Unicidade de shortcode
    const byId = new Map();
    for (const id of this.world.allEntities()) {
      const shortId = this.world.get(id, COMPONENT_NAMES.IDENTITY)?.id;
      if (!shortId) continue;
      if (byId.has(shortId) && byId.get(shortId) !== id) {
        warnings.push(`shortcode duplicado: ${shortId}`);
      }
      byId.set(shortId, id);
    }

    if (warnings.length > 0) {
      this.bus.emit('validation:warnings', { warnings });
    }
    return prev;
  }
}