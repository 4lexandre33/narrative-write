/**
 * @file mutation-system.js
 * @module systems
 * @description Handles mut.* — altera Stats, Flags, Enums, Texts, Lists.
 * @imports ecs/system, components/*, core/constants
 * @level 7
 */

import { System } from '../ecs/system.js';
import { COMPONENT_NAMES } from '../core/constants.js';
import * as Stats from '../components/stats.js';
import * as Flags from '../components/flags.js';
import * as Enums from '../components/enums.js';
import * as Lists from '../components/lists.js';
import * as Texts from '../components/texts.js';

export class MutationSystem extends System {
  constructor() { super('MutationSystem'); }

  run(_line, _ctx, prev) {
    const ast = prev.ast;
    if (!ast || ast.verb !== 'mut') return prev;

    const target = this.resolve(ast.target);
    if (!target) return { ...prev, ok: false, halt: true, error: `entidade não existe: ${ast.target}` };

    try {
      const mutation = this._apply(ast, target);
      return { ...prev, ok: true, mutated: !mutation.noop, mutation };
    } catch (err) {
      return { ...prev, ok: false, halt: true, error: err.message };
    }
  }

  _apply(ast, target) {
    const { action, subtype, path, value } = ast;
    if (action === 'add' && subtype === 'stats') return this._addStat(target, path, value);
    if (action === 'set' && subtype === 'stats') return this._setStat(target, path, value);
    if (action === 'sub' && subtype === 'stats') return this._addStat(target, path, -Number(value));
    if (action === 'push' && subtype === 'list') return this._pushList(target, path, value);
    if (action === 'pull' && subtype === 'list') return this._pullList(target, path, value);
    if (action === 'flag' && subtype === 'on') return this._flag(target, 'on', ast.flag);
    if (action === 'flag' && subtype === 'off') return this._flag(target, 'off', ast.flag);
    if (action === 'enum') return this._enum(target, path, value);
    if (action === 'text') return this._text(target, path, value);
    throw new Error(`mut.${action} não suportado`);
  }

  _addStat(target, field, rawValue) {
    const amount = Number(rawValue);
    if (!Number.isFinite(amount)) throw new Error(`valor numérico inválido: ${rawValue}`);
    let stats = this.world.get(target, COMPONENT_NAMES.STATS);
    if (!stats) {
      this.world.addComponent(target, COMPONENT_NAMES.STATS, { [field]: 0 });
      stats = this.world.get(target, COMPONENT_NAMES.STATS);
    }
    const before = Stats.getStat(stats, field);
    const after = Stats.addStat(stats, field, amount);
    this.world.set(target, COMPONENT_NAMES.STATS, after);
    return { op: 'add', kind: 'stat', target, path: `stats.${field}`, before, after: after[field], value: amount };
  }

  _setStat(target, field, rawValue) {
    const n = Number(rawValue);
    if (!Number.isFinite(n)) throw new Error(`valor numérico inválido: ${rawValue}`);
    let stats = this.world.get(target, COMPONENT_NAMES.STATS);
    if (!stats) {
      this.world.addComponent(target, COMPONENT_NAMES.STATS, { [field]: n });
      return { op: 'set', kind: 'stat', target, path: `stats.${field}`, before: null, after: n };
    }
    const before = stats[field] ?? null;
    this.world.set(target, COMPONENT_NAMES.STATS, Stats.setStat(stats, field, n));
    return { op: 'set', kind: 'stat', target, path: `stats.${field}`, before, after: n };
  }

  _pushList(target, field, item) {
    let lists = this.world.get(target, COMPONENT_NAMES.LISTS);
    if (!lists) {
      this.world.addComponent(target, COMPONENT_NAMES.LISTS, { [field]: [item] });
      return { op: 'push', kind: 'list', target, path: `lists.${field}`, before: [], after: [item], item };
    }
    const before = Lists.getList(lists, field);
    const after = Lists.pushList(lists, field, item);
    this.world.set(target, COMPONENT_NAMES.LISTS, after);
    return { op: 'push', kind: 'list', target, path: `lists.${field}`,
      before, after: after[field], item,
      noop: before.length === after[field].length };
  }

  _pullList(target, field, item) {
    const lists = this.world.get(target, COMPONENT_NAMES.LISTS);
    if (!lists) return { op: 'pull', kind: 'list', target, path: `lists.${field}`, before: [], after: [], item, noop: true };
    const before = Lists.getList(lists, field);
    const after = Lists.pullList(lists, field, item);
    this.world.set(target, COMPONENT_NAMES.LISTS, after);
    return { op: 'pull', kind: 'list', target, path: `lists.${field}`,
      before, after: after[field], item };
  }

  _flag(target, op, flag) {
    let flags = this.world.get(target, COMPONENT_NAMES.FLAGS);
    if (!flags) {
      const initial = op === 'on' ? [flag] : [];
      this.world.addComponent(target, COMPONENT_NAMES.FLAGS, { values: initial });
      return { op: `flag.${op}`, kind: 'flag', target, path: 'flags', before: [], after: initial, flag };
    }
    const before = Flags.flagValues(flags);
    const after = op === 'on' ? Flags.flagOn(flags, flag) : Flags.flagOff(flags, flag);
    this.world.set(target, COMPONENT_NAMES.FLAGS, after);
    return { op: `flag.${op}`, kind: 'flag', target, path: 'flags',
      before, after: after.values, flag,
      noop: before.length === after.values.length };
  }

  _enum(target, field, value) {
    let enums = this.world.get(target, COMPONENT_NAMES.ENUMS);
    if (!enums) {
      this.world.addComponent(target, COMPONENT_NAMES.ENUMS, { [field]: value });
      return { op: 'enum', kind: 'enum', target, path: `enums.${field}`, before: null, after: value };
    }
    const before = enums[field] ?? null;
    this.world.set(target, COMPONENT_NAMES.ENUMS, Enums.setEnum(enums, field, value));
    return { op: 'enum', kind: 'enum', target, path: `enums.${field}`, before, after: value };
  }

  _text(target, field, value) {
    let texts = this.world.get(target, COMPONENT_NAMES.TEXTS);
    if (!texts) {
      this.world.addComponent(target, COMPONENT_NAMES.TEXTS, { [field]: value });
      return { op: 'text', kind: 'text', target, path: `texts.${field}`, before: null, after: value };
    }
    const before = texts[field] ?? null;
    this.world.set(target, COMPONENT_NAMES.TEXTS, Texts.setText(texts, field, value));
    return { op: 'text', kind: 'text', target, path: `texts.${field}`, before, after: value };
  }
}