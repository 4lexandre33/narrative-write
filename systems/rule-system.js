/**
 * @file rule-system.js
 * @module systems
 * @description Regras automáticas — ON/IF/DO com matching por evento.
 * @imports ecs/system, components/rule, core/constants, systems/helpers/guard-evaluator
 * @level 7
 *
 * Fase 3 — Diagnostics: emite `rule:evaluated` sempre, com motivo, para
 * diagnóstico de regras que não disparam. Motivos possíveis:
 *   - meta-missing
 *   - mode-not-auto
 *   - suspended
 *   - rule-component-missing
 *   - on-not-match
 *   - guard-empty
 *   - fired
 */

import { System } from '../ecs/system.js';
import { COMPONENT_NAMES, MAX_DEPTH } from '../core/constants.js';
import { makeIdentity } from '../components/identity.js';
import { makeRule, makeRuleMeta, markFired } from '../components/rule.js';
import { makeMeta } from '../components/meta.js';
import { GuardEvaluator } from './helpers/guard-evaluator.js';

const MAX_ITERATIONS = 1000;

export class RuleSystem extends System {
  constructor() {
    super('RuleSystem');
    this._queue = [];
    this._processing = false;
    /** @type {GuardEvaluator|null} */
    this.guard = null;
  }

  init() {
    this.guard = new GuardEvaluator(this.world, this.links);

    const events = [
      'component:added', 'component:updated', 'component:removed',
      'links:pruned',
      'entity:created', 'entity:destroyed',
    ];
    for (const evt of events) {
      this.on(evt, (payload) => this._onEvent(evt, payload));
    }
  }

  // ── Declaração (rul.add) ────────────────────────────────────

  run(_line, ctx, prev) {
    const ast = prev.ast;
    if (!ast || ast.verb !== 'rul' || ast.action !== 'add') return prev;

    try {
      const shortId = this.ids.generate('rule', ast.name);
      const components = {
        [COMPONENT_NAMES.IDENTITY]: makeIdentity({ id: shortId, name: ast.name, type: 'rule' }),
        [COMPONENT_NAMES.RULE]: makeRule({ on: ast.on, if: ast.ifExpr, do: ast.doExpr }),
        [COMPONENT_NAMES.RULE_META]: makeRuleMeta({
          declaredAt: ctx.tick,
          mode: ast.opts?.mode || 'auto',
          tag: ast.opts?.tag,
        }),
        [COMPONENT_NAMES.META]: makeMeta({ builtin: false, tick: ctx.tick }),
      };
      this.world.createEntity(components, { id: shortId });
      return { ...prev, ok: true, mutated: true, rule: { id: shortId, name: ast.name, declaredAt: ctx.tick } };
    } catch (err) {
      return { ...prev, ok: false, halt: true, error: err.message };
    }
  }

  // ── Firing ────────────────────────────────────────────────

  /**
   * @private
   */
  _onEvent(evt, payload) {
    if (this._processing) {
      this._queue.push({ evt, payload, depth: 0 });
      return;
    }
    this._queue.push({ evt, payload, depth: 0 });
    this._drain();
  }

  /**
   * @private
   */
  _drain() {
    this._processing = true;
    let safety = 0;

    while (this._queue.length && safety < MAX_ITERATIONS) {
      safety++;
      const item = this._queue.shift();
      if (item.depth > MAX_DEPTH) {
        this.bus.emit('rule:cycle', { depth: item.depth });
        continue;
      }
      try {
        this._processItem(item);
      } catch (err) {
        this.bus.emit('rule:error', { evt: item.evt, error: err.message });
      }
    }

    if (safety >= MAX_ITERATIONS) {
      this.bus.emit('rule:overflow', { iterations: safety, remaining: this._queue.length });
      this._queue.length = 0;
    }

    this._processing = false;
  }

  /**
   * @private
   */
  _processItem(item) {
    const rules = this.world.query(COMPONENT_NAMES.RULE);

    for (const ruleId of rules) {
      const meta = this.world.get(ruleId, COMPONENT_NAMES.RULE_META);
      const rule = this.world.get(ruleId, COMPONENT_NAMES.RULE);

      // ── Captura do invisível ─────────────────────────────
      if (!meta) {
        this.bus.emit('rule:evaluated', {
          rule: ruleId, reason: 'meta-missing', fired: false,
        });
        continue;
      }
      if (meta.mode !== 'auto') {
        this.bus.emit('rule:evaluated', {
          rule: ruleId, reason: 'mode-not-auto', mode: meta.mode, fired: false,
        });
        continue;
      }
      if (meta.suspended === true) {
        this.bus.emit('rule:evaluated', {
          rule: ruleId, reason: 'suspended', fired: false,
        });
        continue;
      }
      if (!rule) {
        this.bus.emit('rule:evaluated', {
          rule: ruleId, reason: 'rule-component-missing', fired: false,
        });
        continue;
      }
      if (!this._onMatches(rule.on, item)) {
        this.bus.emit('rule:evaluated', {
          rule: ruleId, reason: 'on-not-match',
          on: rule.on, evt: item.evt, fired: false,
        });
        continue;
      }

      const matches = this.guard
        ? this.guard.evaluate(rule.if, item, meta)
        : [];

      if (matches.length === 0) {
        this.bus.emit('rule:evaluated', {
          rule: ruleId, reason: 'guard-empty',
          if: rule.if, fired: false,
        });
        this.bus.emit('rule:skipped', { rule: ruleId, reason: 'guard-false' });
        continue;
      }

      for (const target of matches) {
        this._applyDo(rule.do, target, item);
      }

      this.world.set(
        ruleId,
        COMPONENT_NAMES.RULE_META,
        markFired(meta, this.getTick(), 'auto')
      );

      this.bus.emit('rule:evaluated', {
        rule: ruleId, reason: 'fired', fired: true, affected: matches,
      });
      this.bus.emit('rule:fired', { rule: ruleId, affected: matches });
    }
  }

  /**
   * @private
   */
  _onMatches(onExpr, item) {
    if (!onExpr) return false;
    if (onExpr === item.evt) return true;

    const id = item.payload?.id;
    if (!id) return false;

    if (id === onExpr) return true;

    const type = this.world.get(id, COMPONENT_NAMES.IDENTITY)?.type;
    if (type && type === onExpr) return true;

    return false;
  }

  /**
   * @private
   */
  _applyDo(doExpr, target, item) {
    if (!doExpr) return;

    const lines = String(doExpr)
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    const vars = {
      new: target,
      newEntity: target,
      this: target,
      target,
      entity: target,
    };

    for (const raw of lines) {
      const cmd = this._interpolate(raw, vars);
      if (!cmd) continue;

      let parsed;
      try {
        const parse = this.machine.systems.get('ParseSystem');
        if (!parse) continue;
        const res = parse.parse(cmd);
        if (!res?.ok) continue;
        parsed = res.ast;
      } catch {
        continue;
      }

      try {
        switch (parsed.verb) {
          case 'mut': {
            const mutSys = this.machine.systems.get('MutationSystem');
            if (mutSys) mutSys.run(cmd, {}, { ast: parsed, ok: true });
            break;
          }
          case 'link': {
            const linkSys = this.machine.systems.get('LinkSystem');
            if (linkSys) linkSys.run(cmd, {}, { ast: parsed, ok: true });
            break;
          }
          case 'kno': {
            const knoSys = this.machine.systems.get('KnowledgeSystem');
            if (knoSys) knoSys.run(cmd, { tick: this.getTick() }, { ast: parsed, ok: true });
            break;
          }
          default:
            break;
        }
      } catch {
        // isola erro por linha
      }
    }
  }

  /**
   * @private
   */
  _interpolate(line, vars) {
    return String(line).replace(/\{([^}]+)\}/g, (m, name) => {
      const key = name.trim();
      return Object.prototype.hasOwnProperty.call(vars, key)
        ? vars[key]
        : m;
    });
  }
}