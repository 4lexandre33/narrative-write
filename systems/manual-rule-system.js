/**
 * @file manual-rule-system.js
 * @module systems
 * @description Handles rul.run/sim/list/find/show/off/on/del.
 * @imports ecs/system, components/rule, core/constants
 * @level 7
 *
 * Fase 13.7 — Stubs → Funcionalidades (auditoria 25/09/2026):
 *   `_sim` era um eco que retornava `{ effect: rule.do }` sem simular
 *   nada. Agora:
 *     1. Tira snapshot do mundo atual.
 *     2. Cria sandbox isolado via import dinâmico de
 *        `diagnostics/sandbox.js` (import estático causaria ciclo,
 *        pois sandbox importa todos os systems).
 *     3. Repopula o sandbox com o estado atual.
 *     4. Resolve alvos via GuardEvaluator do RuleSystem.
 *     5. Aplica o DO em cada alvo DENTRO do sandbox.
 *     6. Compara componentes antes/depois.
 *     7. Emite o diff via `render:right` (assíncrono).
 *
 *   O mundo real NUNCA é mutado. Nenhum tick avança.
 */

import { System } from '../ecs/system.js';
import { COMPONENT_NAMES } from '../core/constants.js';
import { deepClone, deepEqual } from '../core/utils/object.js';

export class ManualRuleSystem extends System {
  constructor() { super('ManualRuleSystem'); }

  run(_line, _ctx, prev) {
    const ast = prev.ast;
    if (!ast || ast.verb !== 'rul') return prev;
    if (!['run', 'sim', 'list', 'find', 'show', 'off', 'on', 'del'].includes(ast.action)) return prev;

    try {
      switch (ast.action) {
        case 'list': return this._list(prev);
        case 'find': return this._find(prev, ast);
        case 'show': return this._show(prev, ast);
        case 'sim':  return this._sim(prev, ast);
        case 'run':  return this._run(prev, ast);
        case 'off':  return this._off(prev, ast);
        case 'on':   return this._on(prev, ast);
        case 'del':  return this._del(prev, ast);
        default:     return prev;
      }
    } catch (err) {
      return { ...prev, ok: false, halt: true, error: err.message };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Lookup
  // ═══════════════════════════════════════════════════════════

  _findRule(name) {
    return this.world.query(COMPONENT_NAMES.RULE)
      .find(id => {
        const ident = this.world.get(id, COMPONENT_NAMES.IDENTITY);
        return ident?.name === name || ident?.id === name;
      });
  }

  // ═══════════════════════════════════════════════════════════
  // List / find / show
  // ═══════════════════════════════════════════════════════════

  _list(prev) {
    const rows = this.world.query(COMPONENT_NAMES.RULE).map(id => {
      const ident = this.world.get(id, COMPONENT_NAMES.IDENTITY);
      const meta = this.world.get(id, COMPONENT_NAMES.RULE_META);
      return {
        id: ident?.id,
        name: ident?.name,
        mode: meta?.mode,
        firedCount: meta?.firedCount ?? 0,
        declaredAt: meta?.declaredAt,
      };
    });
    return { ...prev, ok: true, right: { kind: 'table', title: `Regras (${rows.length})`, data: rows } };
  }

  _find(prev, ast) {
    const q = String(ast.query || '').toLowerCase();
    const rows = this.world.query(COMPONENT_NAMES.RULE)
      .filter(id => {
        const name = this.world.get(id, COMPONENT_NAMES.IDENTITY)?.name || '';
        const rule = this.world.get(id, COMPONENT_NAMES.RULE);
        return name.toLowerCase().includes(q)
          || rule?.on?.toLowerCase().includes(q)
          || rule?.do?.toLowerCase().includes(q);
      })
      .map(id => {
        const ident = this.world.get(id, COMPONENT_NAMES.IDENTITY);
        return { name: ident?.name, id: ident?.id };
      });
    return { ...prev, ok: true, right: { kind: 'table', title: `Regras com "${ast.query}"`, data: rows } };
  }

  _show(prev, ast) {
    const ruleId = this._findRule(ast.name);
    if (!ruleId) return { ...prev, ok: false, halt: true, error: `regra não encontrada: ${ast.name}` };
    return {
      ...prev, ok: true,
      right: {
        kind: 'card', title: ast.name,
        data: {
          identity: this.world.get(ruleId, COMPONENT_NAMES.IDENTITY),
          rule: this.world.get(ruleId, COMPONENT_NAMES.RULE),
          meta: this.world.get(ruleId, COMPONENT_NAMES.RULE_META),
        },
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // rul.sim — Fase 13.7
  // ═══════════════════════════════════════════════════════════

  /**
   * Simula a execução da regra em sandbox isolado.
   *
   * Retorna imediatamente um payload "Simulando..." e emite o
   * resultado real via `render:right` quando o sandbox terminar.
   *
   * @param {Object} prev
   * @param {Object} ast
   * @returns {Object}
   * @private
   */
  _sim(prev, ast) {
    const ruleId = this._findRule(ast.name);
    if (!ruleId) {
      return { ...prev, ok: false, halt: true, error: `regra não encontrada: ${ast.name}` };
    }
    const rule = this.world.get(ruleId, COMPONENT_NAMES.RULE);
    if (!rule) {
      return { ...prev, ok: false, halt: true, error: `regra sem componente Rule` };
    }

    // 1. Resolve alvos
    const ruleSys = this.machine?.systems?.get?.('RuleSystem');
    const guard = ruleSys?.guard;
    let targets = [];
    try {
      if (guard) {
        targets = guard.evaluate(rule.if || 'true', { evt: 'manual:sim', payload: {}, depth: 0 });
      }
    } catch { /* isola */ }

    if (targets.length === 0) {
      return {
        ...prev, ok: true, mutated: false,
        right: {
          kind: 'table',
          title: `Simulação: ${ast.name}`,
          data: [{ info: 'Nenhum alvo casou o IF' }],
          sticky: true,
        },
      };
    }

    // 2. Snapshot do estado atual
    const state = this._snapshotWorldState();
    const tick = this.getTick();
    const tickNumber = this.machine?.state?.tickNumber ?? 0;

    const bus = this.bus;
    const t0 = this._now();

    // 3. Async — cria sandbox e aplica
    import('../diagnostics/sandbox.js')
      .then(async ({ createSandbox }) => {
        const sb = await createSandbox({ seedEntities: false });
        try {
          // Repopula o sandbox com o estado real
          for (const [id, comps] of Object.entries(state.entities)) {
            try {
              sb.world.createEntity(deepClone(comps), { id });
            } catch { /* entidade corrompida — pula */ }
          }
          sb.machine.state.tick = tick;
          sb.machine.state.tickNumber = tickNumber;

          const results = [];
          for (const target of targets) {
            const before = sb.world.componentsOf(target);
            if (!before) continue;

            const doExpr = String(rule.do).replace(/\{[^}]+\}/g, target);
            const lines = doExpr.split('\n').map((s) => s.trim()).filter(Boolean);
            const errors = [];

            for (const line of lines) {
              try {
                const r = sb.machine.handleLine(line);
                if (r && r.ok === false && r.error) errors.push(r.error);
              } catch (err) {
                errors.push(err.message);
              }
            }

            const after = sb.world.componentsOf(target) ?? {};
            const changes = _diffComponents(before, after);
            results.push({ target, changes, errors });
          }

          const durationMs = this._round(this._now() - t0);

          bus.emit('render:right', {
            kind: 'table',
            title: `Simulação: ${ast.name} (${results.length} alvos, ${durationMs}ms)`,
            data: results.map((r) => ({
              alvo: r.target,
              mudancas: r.changes.length,
              erros: r.errors.length,
              detalhe: _truncate(JSON.stringify(r.changes), 220),
            })),
            sticky: true,
          });
        } catch (err) {
          bus.emit('render:right', {
            kind: 'diagnostics',
            title: `Simulação falhou: ${ast.name}`,
            data: { raw: err?.message ?? String(err) },
          });
        } finally {
          try { sb.dispose(); } catch { /* isola */ }
        }
      })
      .catch((err) => {
        bus.emit('render:right', {
          kind: 'diagnostics',
          title: `Simulação falhou: ${ast.name}`,
          data: { raw: err?.message ?? String(err) },
        });
      });

    return {
      ...prev, ok: true, mutated: false,
      right: {
        kind: 'table',
        title: `Simulando ${ast.name}...`,
        data: [{ info: `${targets.length} alvo(s) serão testados` }],
        sticky: true,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // rul.run
  // ═══════════════════════════════════════════════════════════

  _run(prev, ast) {
    const ruleId = this._findRule(ast.name);
    if (!ruleId) return { ...prev, ok: false, halt: true, error: `regra não encontrada: ${ast.name}` };
    const rule = this.world.get(ruleId, COMPONENT_NAMES.RULE);
    const meta = this.world.get(ruleId, COMPONENT_NAMES.RULE_META);

    const target = ast.opts?.em ? this.resolve(ast.opts.em) : null;
    const targets = target ? [target] : this.world.query('Identity');

    let affected = 0;
    for (const t of targets) {
      const doExpr = String(rule.do).replace(/\{[^}]+\}/g, t);
      try {
        const parse = this.machine.systems.get('ParseSystem');
        const parsed = parse?.parse(doExpr);
        if (parsed?.ok && parsed.ast.verb === 'mut') {
          const mutSys = this.machine.systems.get('MutationSystem');
          mutSys.run(doExpr, {}, { ast: parsed.ast, ok: true });
          affected++;
        }
      } catch { /* ignora */ }
    }

    this.world.set(ruleId, COMPONENT_NAMES.RULE_META, {
      ...meta,
      firedCount: (meta?.firedCount ?? 0) + 1,
      lastFiredAt: this.getTick(),
      lastTrigger: 'manual',
    });
    return { ...prev, ok: true, mutated: true, rule: { id: ruleId, trigger: 'manual', affected } };
  }

  // ═══════════════════════════════════════════════════════════
  // off / on / del
  // ═══════════════════════════════════════════════════════════

  _off(prev, ast) {
    const ruleId = this._findRule(ast.name);
    if (!ruleId) return { ...prev, ok: false, halt: true, error: `regra não encontrada: ${ast.name}` };
    const meta = this.world.get(ruleId, COMPONENT_NAMES.RULE_META);
    this.world.set(ruleId, COMPONENT_NAMES.RULE_META, { ...meta, suspended: true });
    return { ...prev, ok: true, mutated: true, rule: { id: ruleId, suspended: true } };
  }

  _on(prev, ast) {
    const ruleId = this._findRule(ast.name);
    if (!ruleId) return { ...prev, ok: false, halt: true, error: `regra não encontrada: ${ast.name}` };
    const meta = this.world.get(ruleId, COMPONENT_NAMES.RULE_META);
    this.world.set(ruleId, COMPONENT_NAMES.RULE_META, { ...meta, suspended: false });
    return { ...prev, ok: true, mutated: true, rule: { id: ruleId, suspended: false } };
  }

  _del(prev, ast) {
    const ruleId = this._findRule(ast.name);
    if (!ruleId) return { ...prev, ok: false, halt: true, error: `regra não encontrada: ${ast.name}` };
    this.world.destroyEntity(ruleId);
    return { ...prev, ok: true, mutated: true, deleted: ruleId };
  }

  // ═══════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════

  /**
   * Snapshot de todos os componentes do mundo, para repopular um sandbox.
   * @returns {{ entities:Object<string,Object> }}
   * @private
   */
  _snapshotWorldState() {
    const entities = {};
    for (const id of this.world.allEntities()) {
      entities[id] = deepClone(this.world.componentsOf(id));
    }
    return { entities };
  }

  _now() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  _round(n) {
    return Math.round(Number(n) * 1000) / 1000;
  }
}

// ══════════════════════════════════════════════════════════════
// HELPERS DE MÓDULO
// ══════════════════════════════════════════════════════════════

/**
 * Compara dois mapas de componentes e devolve lista de mudanças.
 * @param {Object} before
 * @param {Object} after
 * @returns {Array<{component:string, op:'added'|'removed'|'changed'}>}
 * @private
 */
function _diffComponents(before, after) {
  const a = before ?? {};
  const b = after ?? {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = [];

  for (const k of keys) {
    const hasA = Object.prototype.hasOwnProperty.call(a, k);
    const hasB = Object.prototype.hasOwnProperty.call(b, k);

    if (hasA && !hasB) {
      out.push({ component: k, op: 'removed' });
    } else if (!hasA && hasB) {
      out.push({ component: k, op: 'added' });
    } else if (!deepEqual(a[k], b[k])) {
      out.push({ component: k, op: 'changed' });
    }
  }

  out.sort((x, y) => x.component.localeCompare(y.component));
  return out;
}

/**
 * Trunca uma string.
 * @param {string} s
 * @param {number} n
 * @returns {string}
 * @private
 */
function _truncate(s, n) {
  const str = String(s ?? '');
  if (str.length <= n) return str;
  return str.slice(0, n - 1) + '…';
}