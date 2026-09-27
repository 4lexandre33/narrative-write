/**
 * @file regression-runner.js
 * @module diagnostics
 * @description Executa cenários determinísticos e valida expectativas.
 * @imports core/utils/object (deepEqual),
 *          diagnostics/sandbox (createSandbox),
 *          diagnostics/scenario-library (validateScenario)
 * @importedBy diagnostics/test-battery
 * @level 9
 *
 * Modelo:
 *   - Cada cenário = { name, category, setup[], commands[], expect{} }
 *   - Modo ISOLADO (padrão): novo sandbox por cenário. Garante zero
 *     interferência entre cenários.
 *   - Modo SHARED (explícito): todos os cenários rodam contra o mesmo
 *     `machine` fornecido. O caller assume a responsabilidade por resetar.
 *
 * Expectativas suportadas (ver scenario-library.js):
 *   expect.allOk            — todos os comandos devem passar (default true)
 *   expect.noHalt           — nenhum comando pode halt (default true)
 *   expect.expectFailuresAt — índices (0-based) que PODEM falhar
 *   expect.minEntities      — delta de entidades >= N (contado do início)
 *   expect.entityExists     — ids que devem existir ao final
 *   expect.entityMissing    — ids que NÃO podem existir ao final
 *   expect.finalState       — mapa path → valor (deepEqual)
 *
 * Formato de um ScenarioResult:
 *   {
 *     name, category, description,
 *     ok:           boolean,
 *     durationMs:   number,
 *     setup:        CommandResult[],   // não checados
 *     commands:     CommandResult[],   // checados
 *     expectations: { passed:number, failed:number, failures:Failure[] },
 *     finalState:   Object|null,       // leituras de expect.finalState
 *     error:        string|null,       // erro de topo (cenário explodiu)
 *   }
 *
 * Formato de um CommandResult:
 *   {
 *     index:   number,
 *     command: string,
 *     ok:      boolean,
 *     halt:    boolean,
 *     error:   string|null,
 *     mutated: boolean,
 *     tick:    string|null,
 *   }
 *
 * Formato de um Failure:
 *   {
 *     kind:     'expectation',
 *     check:    string,     // 'allOk' | 'noHalt' | 'minEntities' | ...
 *     expected: any,
 *     actual:   any,
 *     message:  string,
 *   }
 */

import { deepEqual } from '../core/utils/object.js';
import { createSandbox } from './sandbox.js';
import { validateScenario } from './scenario-library.js';

// ══════════════════════════════════════════════════════════════
// Constantes
// ══════════════════════════════════════════════════════════════

/**
 * Mapa de aliases usados em `expect.finalState`.
 * Path: `<entityId>.<alias>.<field>` → componente real.
 * @type {Readonly<Object<string,string>>}
 */
const ALIAS_TO_COMPONENT = Object.freeze({
  stats:    'Stats',
  flags:    'Flags',
  enums:    'Enums',
  texts:    'Texts',
  lists:    'Lists',
  links:    'Links',
  knows:    'Knows',
  tags:     'Tags',
  meta:     'Meta',
  identity: 'Identity',
  body:     'Body',
  trigger:  'Trigger',
});

// ══════════════════════════════════════════════════════════════
// RegressionRunner
// ══════════════════════════════════════════════════════════════

export class RegressionRunner {
  /**
   * @param {Object} [opts={}]
   * @param {boolean} [opts.seedEntities=true] — passa para createSandbox
   */
  constructor({ seedEntities = true } = {}) {
    this.seedEntities = seedEntities !== false;
  }

  // ══════════════════════════════════════════════════════════
  // API principal
  // ══════════════════════════════════════════════════════════

  /**
   * Executa uma lista de cenários.
   *
   * @param {Object} opts
   * @param {Array<Object>} opts.scenarios — catálogo (SCENARIOS)
   * @param {Object} [opts.machine=null]   — se fornecido, modo SHARED; senão ISOLADO
   * @param {Function} [opts.onProgress=null] — callback({ scenario, index, total, result })
   * @param {boolean} [opts.stopOnFirstFailure=false]
   * @returns {Promise<{
   *   passed:number,
   *   failed:number,
   *   total:number,
   *   durationMs:number,
   *   results:Array<Object>,
   * }>}
   */
  async run({
    scenarios,
    machine = null,
    onProgress = null,
    stopOnFirstFailure = false,
  } = {}) {
    const list = Array.isArray(scenarios) ? scenarios : [];
    const t0 = now();
    const results = [];

    for (let i = 0; i < list.length; i++) {
      const scenario = list[i];

      let sandbox = null;
      let activeMachine = machine;

      // ── Modo ISOLADO: cria sandbox por cenário ────────────
      if (!machine) {
        try {
          sandbox = await createSandbox({ seedEntities: this.seedEntities });
          activeMachine = sandbox.machine;
        } catch (err) {
          results.push(this._explodedScenario(
            scenario,
            `falha ao criar sandbox: ${err.message}`
          ));
          if (typeof onProgress === 'function') {
            safeCallback(onProgress, { scenario, index: i, total: list.length, result: results[results.length - 1] });
          }
          if (stopOnFirstFailure) break;
          continue;
        }
      }

      // ── Executa o cenário ─────────────────────────────────
      let result;
      try {
        result = this._runScenario(scenario, activeMachine);
      } catch (err) {
        result = this._explodedScenario(scenario, err.message);
      } finally {
        if (sandbox) {
          try { sandbox.dispose(); } catch { /* isola */ }
        }
      }

      results.push(result);

      if (typeof onProgress === 'function') {
        safeCallback(onProgress, { scenario, index: i, total: list.length, result });
      }

      if (stopOnFirstFailure && !result.ok) break;
    }

    const passed = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;

    return {
      passed,
      failed,
      total: results.length,
      durationMs: round(now() - t0),
      results,
    };
  }

  // ══════════════════════════════════════════════════════════
  // Execução de um cenário
  // ══════════════════════════════════════════════════════════

  /**
   * Roda um cenário completo contra um machine.
   *
   * @param {Object} scenario
   * @param {Object} machine
   * @returns {Object} ScenarioResult
   * @private
   */
  _runScenario(scenario, machine) {
    const t0 = now();

    // ── Validação defensiva do cenário ────────────────────
    const v = validateScenario(scenario);
    if (!v.ok) {
      return {
        name: scenario?.name ?? '(inválido)',
        category: scenario?.category ?? '?',
        description: scenario?.description ?? '',
        ok: false,
        durationMs: round(now() - t0),
        setup: [],
        commands: [],
        expectations: { passed: 0, failed: 1, failures: [{
          kind: 'expectation',
          check: 'scenarioShape',
          expected: 'valido',
          actual: v.errors.join('; '),
          message: `cenário malformado: ${v.errors.join('; ')}`,
        }]},
        finalState: null,
        error: null,
      };
    }

    // ── Marca o estado inicial para medir delta de entidades ─
    const initialCount = machine.world.allEntities().length;

    // ── Setup (não checado) ────────────────────────────────
    const setupResults = this._runCommands(
      scenario.setup ?? [],
      machine,
      /* haltOnError */ false
    );

    // ── Comandos principais ────────────────────────────────
    const commandResults = this._runCommands(
      scenario.commands ?? [],
      machine,
      /* haltOnError */ false
    );

    // ── Aplica expectativas ────────────────────────────────
    const failures = [];

    // 1. allOk / expectFailuresAt / noHalt
    const cmdFailures = this._checkCommandExpectations(commandResults, scenario.expect ?? {});
    failures.push(...cmdFailures);

    // 2. minEntities (delta desde o início)
    const currentCount = machine.world.allEntities().length;
    const delta = currentCount - initialCount;
    const minEntities = scenario.expect?.minEntities;
    if (Number.isFinite(minEntities) && delta < minEntities) {
      failures.push({
        kind: 'expectation',
        check: 'minEntities',
        expected: `>= ${minEntities}`,
        actual: delta,
        message: `delta de entidades foi ${delta}, esperado >= ${minEntities}`,
      });
    }

    // 3. entityExists
    if (Array.isArray(scenario.expect?.entityExists)) {
      for (const id of scenario.expect.entityExists) {
        if (!machine.world.hasEntity(id)) {
          failures.push({
            kind: 'expectation',
            check: 'entityExists',
            expected: true,
            actual: false,
            message: `entidade "${id}" deveria existir mas não existe`,
          });
        }
      }
    }

    // 4. entityMissing
    if (Array.isArray(scenario.expect?.entityMissing)) {
      for (const id of scenario.expect.entityMissing) {
        if (machine.world.hasEntity(id)) {
          failures.push({
            kind: 'expectation',
            check: 'entityMissing',
            expected: false,
            actual: true,
            message: `entidade "${id}" não deveria existir mas existe`,
          });
        }
      }
    }

    // 5. finalState
    let finalState = null;
    if (scenario.expect?.finalState && typeof scenario.expect.finalState === 'object') {
      const stateCheck = this._checkFinalState(machine, scenario.expect.finalState);
      failures.push(...stateCheck.failures);
      finalState = stateCheck.readValues;
    }

    return {
      name: scenario.name,
      category: scenario.category,
      description: scenario.description ?? '',
      ok: failures.length === 0,
      durationMs: round(now() - t0),
      setup: setupResults,
      commands: commandResults,
      expectations: {
        passed: (scenario.expect?.finalState ? Object.keys(scenario.expect.finalState).length : 0)
              + (Array.isArray(scenario.expect?.entityExists) ? scenario.expect.entityExists.length : 0)
              + (Array.isArray(scenario.expect?.entityMissing) ? scenario.expect.entityMissing.length : 0)
              + (Number.isFinite(scenario.expect?.minEntities) ? 1 : 0)
              - failures.length,
        failed: failures.length,
        failures,
      },
      finalState,
      error: null,
    };
  }

  // ══════════════════════════════════════════════════════════
  // Execução de comandos
  // ══════════════════════════════════════════════════════════

  /**
   * Roda uma lista de comandos e devolve resultados normalizados.
   * Nunca lança — erros viram CommandResult com ok:false.
   *
   * @param {string[]} commands
   * @param {Object} machine
   * @param {boolean} haltOnError — se true, para no primeiro erro
   * @returns {Array<Object>}
   * @private
   */
  _runCommands(commands, machine, haltOnError = false) {
    const out = [];

    for (let i = 0; i < commands.length; i++) {
      const raw = commands[i];
      const entry = {
        index: i,
        command: String(raw),
        ok: true,
        halt: false,
        error: null,
        mutated: false,
        tick: null,
      };

      try {
        const result = machine.handleLine(raw);
        if (result && typeof result === 'object') {
          entry.ok = result.ok !== false;
          entry.halt = result.halt === true;
          entry.error = result.error ?? null;
          entry.mutated = result.mutated === true;
          entry.tick = result.tick ?? machine.getTick?.() ?? null;
        }
      } catch (err) {
        entry.ok = false;
        entry.halt = true;
        entry.error = err.message;
      }

      out.push(entry);

      if (haltOnError && !entry.ok) break;
    }

    return out;
  }

  // ══════════════════════════════════════════════════════════
  // Validação de comandos
  // ══════════════════════════════════════════════════════════

  /**
   * Aplica expect.allOk / expect.noHalt / expect.expectFailuresAt.
   * @param {Array<Object>} commandResults
   * @param {Object} expect
   * @returns {Array<Object>} falhas
   * @private
   */
  _checkCommandExpectations(commandResults, expect) {
    const failures = [];
    const allowedFails = new Set(Array.isArray(expect.expectFailuresAt) ? expect.expectFailuresAt : []);
    const expectAllOk = expect.allOk !== false;   // default true
    const expectNoHalt = expect.noHalt !== false; // default true

    for (let i = 0; i < commandResults.length; i++) {
      const r = commandResults[i];
      const allowedToFail = allowedFails.has(i);

      // Regra 1: se não pode falhar, deve passar
      if (!allowedToFail && !r.ok) {
        failures.push({
          kind: 'expectation',
          check: 'allOk',
          expected: 'ok:true',
          actual: `ok:false (${r.error ?? 'sem erro'})`,
          message: `comando #${i} "${r.command}" falhou quando deveria passar`,
        });
      }

      // Regra 2: se está em expectFailuresAt, DEVE ter falhado
      if (allowedToFail && r.ok) {
        failures.push({
          kind: 'expectation',
          check: 'expectFailuresAt',
          expected: 'ok:false',
          actual: 'ok:true',
          message: `comando #${i} "${r.command}" passou quando deveria falhar`,
        });
      }

      // Regra 3: noHalt — só checa em comandos que passaram
      if (expectNoHalt && r.halt && r.ok) {
        failures.push({
          kind: 'expectation',
          check: 'noHalt',
          expected: 'halt:false',
          actual: 'halt:true',
          message: `comando #${i} "${r.command}" haltou o pipeline sem erro`,
        });
      }
    }

    // Regra 4: allOk:false sem expectFailuresAt → pelo menos 1 deve falhar
    if (!expectAllOk && allowedFails.size === 0) {
      const anyFailed = commandResults.some(r => !r.ok);
      if (!anyFailed) {
        failures.push({
          kind: 'expectation',
          check: 'allOk',
          expected: 'pelo menos 1 falha',
          actual: '0 falhas',
          message: 'allOk:false mas todos os comandos passaram',
        });
      }
    }

    return failures;
  }

  // ══════════════════════════════════════════════════════════
  // Validação de estado final
  // ══════════════════════════════════════════════════════════

  /**
   * Compara cada path esperado contra o valor real no mundo.
   * @param {Object} machine
   * @param {Object} expectedMap — { 'path.to.field': valorEsperado }
   * @returns {{ failures:Array<Object>, readValues:Object }}
   * @private
   */
  _checkFinalState(machine, expectedMap) {
    const failures = [];
    const readValues = {};

    for (const [path, expected] of Object.entries(expectedMap)) {
      const actual = this._readPath(machine.world, path);
      readValues[path] = actual;

      if (!deepEqual(actual, expected)) {
        failures.push({
          kind: 'expectation',
          check: 'finalState',
          expected,
          actual,
          message: `path "${path}": esperado ${format(expected)}, obtido ${format(actual)}`,
        });
      }
    }

    return { failures, readValues };
  }

  // ══════════════════════════════════════════════════════════
  // Resolução de paths
  // ══════════════════════════════════════════════════════════

  /**
   * Lê um valor do World por path pontilhado.
   *
   * Formato: `<entityId>.<componentAlias>[.<field>...]`
   * Ex: 'Kaelin.stats.fear', 'Mira.links.inventory', 'Kaelin.flags.values'
   *
   * @param {Object} world
   * @param {string} path
   * @returns {any}
   * @private
   */
  _readPath(world, path) {
    if (!path || typeof path !== 'string') return undefined;

    const parts = path.split('.');
    if (parts.length < 2) {
      // apenas entityId → devolve todos os componentes
      return world.componentsOf(parts[0]);
    }

    const entityId = parts[0];
    const alias = parts[1];
    const compName = ALIAS_TO_COMPONENT[alias];

    if (!compName) return undefined;

    const comp = world.get(entityId, compName);
    if (comp === null) return undefined;

    if (parts.length === 2) return comp;

    // Navega no restante do path
    let cur = comp;
    for (let i = 2; i < parts.length; i++) {
      if (cur === null || cur === undefined) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  // ══════════════════════════════════════════════════════════
  // Helpers
  // ══════════════════════════════════════════════════════════

  /**
   * Cria um ScenarioResult para um cenário que explodiu antes/durante.
   * @private
   */
  _explodedScenario(scenario, message) {
    return {
      name: scenario?.name ?? '(sem nome)',
      category: scenario?.category ?? '?',
      description: scenario?.description ?? '',
      ok: false,
      durationMs: 0,
      setup: [],
      commands: [],
      expectations: {
        passed: 0,
        failed: 1,
        failures: [{
          kind: 'expectation',
          check: 'scenarioExecution',
          expected: 'execução limpa',
          actual: message,
          message,
        }],
      },
      finalState: null,
      error: message,
    };
  }

  // ══════════════════════════════════════════════════════════
  // Diagnóstico
  // ══════════════════════════════════════════════════════════

  /**
   * Resumo tabular de um relatório de run.
   * @param {Object} report
   * @returns {Object}
   */
  static summarize(report) {
    if (!report) return null;
    const byCategory = {};
    for (const r of report.results ?? []) {
      if (!byCategory[r.category]) {
        byCategory[r.category] = { passed: 0, failed: 0 };
      }
      if (r.ok) byCategory[r.category].passed++;
      else byCategory[r.category].failed++;
    }
    return {
      passed: report.passed,
      failed: report.failed,
      total: report.total,
      durationMs: report.durationMs,
      byCategory,
    };
  }

  /**
   * Lista as falhas de um relatório em formato plano.
   * @param {Object} report
   * @returns {Array<Object>}
   */
  static failures(report) {
    const out = [];
    for (const r of report?.results ?? []) {
      if (r.ok) continue;
      for (const f of r.expectations?.failures ?? []) {
        out.push({
          scenario: r.name,
          category: r.category,
          check: f.check,
          message: f.message,
          expected: f.expected,
          actual: f.actual,
        });
      }
    }
    return out;
  }
}

// ══════════════════════════════════════════════════════════════
// Utilidades privadas
// ══════════════════════════════════════════════════════════════

/**
 * @private
 */
function now() {
  return (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
}

/**
 * @private
 */
function round(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

/**
 * @private
 */
function format(v) {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  try {
    const s = JSON.stringify(v);
    return s.length <= 120 ? s : s.slice(0, 117) + '...';
  } catch {
    return String(v);
  }
}

/**
 * @private
 */
function safeCallback(fn, payload) {
  try { fn(payload); } catch { /* isola */ }
}