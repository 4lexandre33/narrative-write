/**
 * @file rule-executor.js
 * @module systems/helpers
 * @description Aplica o DO de uma regra para um alvo, usando CommandRunner.
 * @imports systems/helpers/command-runner
 * @importedBy systems/rule-system
 * @level 8
 */

import { CommandRunner } from './command-runner.js';

export class RuleExecutor {
  /**
   * @param {Object} machine
   * @param {Object} world
   * @param {Object} bus
   */
  constructor(machine, world, bus) {
    this.machine = machine;
    this.world = world;
    this.bus = bus;
    this.runner = new CommandRunner(machine);
  }

  /**
   * Aplica o bloco DO para um alvo específico.
   *
   * @param {string} doExpr  — pode ter várias linhas
   * @param {string} target  — id interno da entidade alvo
   * @param {Object} [vars={}]  — variáveis extras de substituição
   * @param {number} [depth=0]
   * @returns {{ ok:boolean, applied:number, errors:string[] }}
   */
  apply(doExpr, target, vars = {}, depth = 0) {
    if (!doExpr) return { ok: true, applied: 0, errors: [] };

    const lines = String(doExpr)
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    const results = [];
    const errors = [];

    for (const raw of lines) {
      const line = this._interpolate(raw, target, vars);
      const res = this.runner.run(line);
      results.push(res);
      if (!res?.ok) errors.push(res?.error || 'erro desconhecido');
    }

    return {
      ok: errors.length === 0,
      applied: results.filter(r => r?.mutated).length,
      errors,
      results,
    };
  }

  /**
   * Verifica se um DO é executável (sintaxe válida).
   * @param {string} doExpr
   * @returns {{ ok:boolean, error?:string }}
   */
  validate(doExpr) {
    if (!doExpr) return { ok: false, error: 'DO vazio' };
    const lines = String(doExpr).split('\n').map(s => s.trim()).filter(Boolean);
    if (lines.length === 0) return { ok: false, error: 'DO vazio' };

    const parse = this.machine.systems?.get('ParseSystem');
    if (!parse) return { ok: true }; // não dá para validar sem parser

    for (const line of lines) {
      const probe = line.replace(/\{[^}]+\}/g, 'X');
      const res = parse.parse(probe);
      if (!res.ok) return { ok: false, error: res.error };
    }
    return { ok: true };
  }

  // ── Interpolação ────────────────────────────────────────────

  _interpolate(line, target, vars) {
    const table = {
      this: target,
      target,
      new: target,
      ...vars,
    };
    return String(line).replace(/\{([^}]+)\}/g, (m, name) => {
      const key = name.trim();
      if (Object.prototype.hasOwnProperty.call(table, key)) {
        return table[key];
      }
      return m;
    });
  }
}