/**
 * @file seed-system.js
 * @module systems
 * @description Popula dados iniciais na primeira execução.
 * @imports ecs/system, schemas/builtin-seeds
 * @level 7
 */

import { System } from '../ecs/system.js';
import { getBuiltinSeeds } from '../schemas/builtin-seeds.js';

export class SeedSystem extends System {
  constructor() { super('SeedSystem'); }

  run(_line, _ctx, prev) { return prev; }

  seed() {
    const seeds = getBuiltinSeeds();
    for (const { id, components } of seeds) {
      if (this.world.hasEntity(id)) continue;
      this.world.createEntity(components, { id });
    }
    return { seeded: seeds.length };
  }
}