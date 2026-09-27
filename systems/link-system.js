/**
 * @file link-system.js
 * @module systems
 * @description Handles link.set/add/pull/clear.
 * @imports ecs/system, components/links, core/constants
 * @level 7
 */

import { System } from '../ecs/system.js';
import { COMPONENT_NAMES } from '../core/constants.js';
import * as Links from '../components/links.js';

export class LinkSystem extends System {
  constructor() { super('LinkSystem'); }

  run(_line, _ctx, prev) {
    const ast = prev.ast;
    if (!ast || ast.verb !== 'link') return prev;
    if (!['set', 'add', 'pull', 'clear'].includes(ast.action)) return prev;

    const from = this.resolve(ast.from);
    if (!from) return { ...prev, ok: false, halt: true, error: `origem não existe: ${ast.from}` };

    const to = ast.to ? this.resolve(ast.to) : null;
    if (ast.action !== 'clear' && !to) {
      return { ...prev, ok: false, halt: true, error: `destino não existe: ${ast.to}` };
    }

    const links = this.world.get(from, COMPONENT_NAMES.LINKS) || {};
    const before = Links.getTargets(links, ast.rel);
    let next;

    if (ast.action === 'set') next = Links.setLink(links, ast.rel, to);
    else if (ast.action === 'add') next = Links.addLink(links, ast.rel, to);
    else if (ast.action === 'pull') next = Links.pullLink(links, ast.rel, to);
    else if (ast.action === 'clear') next = Links.clearLink(links, ast.rel);

    if (this.world.has(from, COMPONENT_NAMES.LINKS)) this.world.set(from, COMPONENT_NAMES.LINKS, next);
    else this.world.addComponent(from, COMPONENT_NAMES.LINKS, next);

    if (this.links) this.links.reindex(from, this.world.get(from, COMPONENT_NAMES.LINKS));

    return { ...prev, ok: true, mutated: true, link: {
      action: ast.action, rel: ast.rel, from, to,
      before, after: Links.getTargets(next, ast.rel),
    }};
  }
}