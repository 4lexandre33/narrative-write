/**
 * @file test-battery.js
 * @module diagnostics
 * @description Orquestrador da bateria completa de testes automáticos.
 * @imports diagnostics/scenario-library, diagnostics/sandbox,
 *          diagnostics/regression-runner, diagnostics/golden-baseline,
 *          diagnostics/test-reporter, diagnostics/smoke-tests,
 *          diagnostics/fuzzer, diagnostics/replay-engine,
 *          diagnostics/contract-guard, diagnostics/invariant-checker,
 *          diagnostics/system-canary
 * @importedBy diagnostics/index (Onda 5), systems/diagnostics-system (Onda 5)
 * @level 9
 *
 * ═══════════════════════════════════════════════════════════════════
 * AS 8 FASES
 * ═══════════════════════════════════════════════════════════════════
 *
 *   #  Fase         Verifica                                      Custo
 *   ─  ──────────   ──────────────────────────────────────────── ─────
 *   0  canary       sandbox registra os mesmos 32 sistemas do boot baixo
 *   1  smoke        10 testes de sanidade do motor               baixo
 *   2  contracts    pré/pós-condições em métodos críticos        baixo
 *   3  invariants   12 invariantes estruturais                   médio
 *   4  scenarios    55 cenários determinísticos (isolados)       médio
 *   5  fuzz         N comandos aleatórios (seed)                 alto
 *   6  replay       gravação + reprodução + comparação           médio
 *   7  regression   compara estado contra baseline salvo         baixo
 *
 * ═══════════════════════════════════════════════════════════════════
 * Fase 0 — canary (adicionada na Fase 2 da auditoria 25/09/2026)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Compara a lista de sistemas do boot (lida de
 * `window.__NarrativeApp.machine.systems`) com a lista estática
 * `SANDBOX_SYSTEM_NAMES`. Se divergirem, as fases `narrative`,
 * `phrase` e `diagnostics` da ScenarioLibrary estariam testando
 * contra um sandbox incompleto — falso positivo. O canário é a
 * primeira linha de defesa.
 *
 * Se `window.__NarrativeApp` não existir (ambiente Node, testes
 * programáticos), a fase é pulada com `skipped: true`.
 *
 * ═══════════════════════════════════════════════════════════════════
 * PRESETS
 * ═══════════════════════════════════════════════════════════════════
 *
 *   'all' / 'full'   → todas as 8 fases (~6s)
 *   'fast'           → canary + smoke + contracts + scenarios (~2s)
 *   'minimal'        → canary + smoke (~400ms)
 *   'thorough'       → alias de 'all'
 *   'scenarios,fuzz' → lista explícita
 *
 * ═══════════════════════════════════════════════════════════════════
 * DETERMINISMO
 * ═══════════════════════════════════════════════════════════════════
 *
 *   - Toda fase rodada em sandbox isolado (Machine nova por fase)
 *   - Fuzz usa `seed` determinística (mulberry32)
 *   - Sem timers, sem `Math.random()` fora do Fuzzer
 *   - Duas execuções com mesma seed → resultados idênticos
 *
 * ═══════════════════════════════════════════════════════════════════
 * ISOLAMENTO DE FALHAS
 * ═══════════════════════════════════════════════════════════════════
 *
 *   - Cada fase é envolvida em try/catch; exceção = PhaseResult{ ok:false }
 *   - Bateria continua para a próxima fase
 *   - `stopOnFirstFailure: true` interrompe após a primeira falha
 *   - Sandbox sempre descartado em `finally`
 */

import { SmokeTests }          from './smoke-tests.js';
import { Fuzzer }              from './fuzzer.js';
import { ReplayEngine }        from './replay-engine.js';
import { ContractGuard }       from './contract-guard.js';
import { InvariantChecker }    from './invariant-checker.js';

import { createSandbox, SANDBOX_SYSTEM_NAMES } from './sandbox.js';
import { SCENARIOS }           from './scenario-library.js';
import { RegressionRunner }    from './regression-runner.js';
import { GoldenBaseline }      from './golden-baseline.js';
import { TestReporter }        from './test-reporter.js';
import { SystemCanary }        from './system-canary.js';

// ══════════════════════════════════════════════════════════════
// Constantes públicas
// ══════════════════════════════════════════════════════════════

/**
 * Ordem canônica das fases.
 * `canary` primeiro — é a linha de base da honestidade do sandbox.
 * @type {ReadonlyArray<string>}
 */
export const PHASE_ORDER = Object.freeze([
  'canary',
  'smoke',
  'contracts',
  'invariants',
  'scenarios',
  'fuzz',
  'replay',
  'regression',
]);

/**
 * Presets nomeados.
 * @type {Readonly<Object<string, ReadonlyArray<string>>>}
 */
export const PHASE_PRESETS = Object.freeze({
  all:      PHASE_ORDER,
  full:     PHASE_ORDER,
  thorough: PHASE_ORDER,
  fast:     Object.freeze(['canary', 'smoke', 'contracts', 'scenarios']),
  minimal:  Object.freeze(['canary', 'smoke']),
});

/**
 * Nome do baseline usado pela fase de regressão.
 * @type {string}
 */
export const REGRESSION_BASELINE_NAME = '__battery_regression__';

/**
 * Comandos determinísticos rodados antes de capturar/comparar o baseline.
 * Alterar esta lista invalida baselines antigos (por design).
 * @type {ReadonlyArray<string>}
 */
export const REGRESSION_COMMANDS = Object.freeze([
  'ent.create.character RegAlpha',
  'ent.create.character RegBeta',
  'ent.create.location RegCidade',
  'link.set.location RegAlpha RegCidade',
  'link.set.location RegBeta RegCidade',
  'link.add.peer RegAlpha RegBeta',
  'mut.add.stats RegAlpha.fear 3',
  'mut.add.stats RegAlpha.courage 5',
  'mut.add.stats RegBeta.fear 1',
  'mut.flag.on RegAlpha alive',
  'mut.push.list RegAlpha.inventory RegSelo',
  'mut.enum RegAlpha.role soldado',
]);

// ══════════════════════════════════════════════════════════════
// TestBattery
// ══════════════════════════════════════════════════════════════

export class TestBattery {
  /**
   * @param {Object} [opts={}]
   * @param {number} [opts.seed=42]           — seed do fuzzer
   * @param {number} [opts.iterations=500]    — iterações do fuzzer
   * @param {Object} [opts.suite=null]        — DiagnosticsSuite (opcional)
   * @param {TestReporter} [opts.reporter=null] — injeta reporter custom
   */
  constructor({
    seed = 42,
    iterations = 500,
    suite = null,
    reporter = null,
  } = {}) {
    this.seed = Number.isFinite(seed) ? seed : 42;
    this.iterations = Number.isFinite(iterations) ? Math.max(1, iterations) : 500;
    this.suite = suite;
    this.reporter = reporter || new TestReporter();

    /** @type {Object|null} último report gerado */
    this.lastReport = null;

    /** @type {boolean} true enquanto a bateria roda */
    this.running = false;
  }

  // ══════════════════════════════════════════════════════════
  // API principal
  // ══════════════════════════════════════════════════════════

  /**
   * Executa as fases solicitadas.
   *
   * @param {Object} [opts={}]
   * @param {string|string[]} [opts.phases='all'] — preset, lista ou CSV
   * @param {Function} [opts.onProgress=null]     — callback({ phase, result, index, total })
   * @param {boolean} [opts.stopOnFirstFailure=false]
   * @returns {Promise<Object>} BatteryReport (ver test-reporter.js)
   */
  async runAll({
    phases = 'all',
    onProgress = null,
    stopOnFirstFailure = false,
  } = {}) {
    if (this.running) {
      return this.lastReport || this.reporter.summarize([], {
        durationMs: 0,
        seed: this.seed,
        iterations: this.iterations,
      });
    }

    this.running = true;
    const t0 = this._now();
    const wanted = this._resolvePhases(phases);
    const results = [];

    try {
      for (let i = 0; i < wanted.length; i++) {
        const phaseName = wanted[i];
        let phaseResult;

        try {
          phaseResult = await this._runPhase(phaseName);
        } catch (err) {
          phaseResult = this._explodedPhase(phaseName, err);
        }

        results.push(phaseResult);

        if (typeof onProgress === 'function') {
          try {
            onProgress({
              phase: phaseName,
              result: phaseResult,
              index: i,
              total: wanted.length,
            });
          } catch { /* isola */ }
        }

        if (stopOnFirstFailure && !phaseResult.ok && !phaseResult.skipped) {
          break;
        }
      }
    } finally {
      this.running = false;
    }

    const durationMs = this._now() - t0;
    const report = this._finalize(results, durationMs);
    this.lastReport = report;
    return report;
  }

  /**
   * Retorna o último report (ou null se nunca rodou).
   * @returns {Object|null}
   */
  getLastReport() {
    return this.lastReport;
  }

  /**
   * Resolve uma spec de fases para lista de nomes válidos.
   * @param {string|string[]} spec
   * @returns {string[]}
   * @private
   */
  _resolvePhases(spec) {
    if (!spec) return [...PHASE_PRESETS.all];

    if (Array.isArray(spec)) {
      const out = spec
        .map(s => String(s).toLowerCase().trim())
        .filter(p => PHASE_ORDER.includes(p));
      return out.length > 0 ? out : [...PHASE_PRESETS.all];
    }

    const key = String(spec).toLowerCase().trim();

    if (PHASE_PRESETS[key]) {
      return [...PHASE_PRESETS[key]];
    }

    const list = key
      .split(',')
      .map(s => s.trim())
      .filter(p => PHASE_ORDER.includes(p));

    return list.length > 0 ? list : [...PHASE_PRESETS.all];
  }

  // ══════════════════════════════════════════════════════════
  // Dispatcher
  // ══════════════════════════════════════════════════════════

  /**
   * @param {string} phase
   * @returns {Promise<Object>}
   * @private
   */
  async _runPhase(phase) {
    switch (phase) {
      case 'canary':     return this._phaseCanary();
      case 'smoke':      return this._phaseSmoke();
      case 'contracts':  return this._phaseContracts();
      case 'invariants': return this._phaseInvariants();
      case 'scenarios':  return this._phaseScenarios();
      case 'fuzz':       return this._phaseFuzz();
      case 'replay':     return this._phaseReplay();
      case 'regression': return this._phaseRegression();
      default:
        return this._skip(phase, `fase desconhecida: ${phase}`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // Fase 0 — Canary
  // ══════════════════════════════════════════════════════════

  /**
   * Compara a lista de sistemas do boot com `SANDBOX_SYSTEM_NAMES`.
   *
   * Objetivo: detectar divergência entre boot e sandbox ANTES de rodar
   * as demais fases. Se o sandbox registrar menos/menos/ordem diferente
   * de sistemas, os cenários das categorias `narrative`, `phrase` e
   * `diagnostics` estariam testando contra um pipeline incompleto.
   *
   * Não cria sandbox — usa a lista estática `SANDBOX_SYSTEM_NAMES`.
   * A verificação de que a lista estática corresponde ao registro de
   * fato acontece implicitamente nas demais fases (smoke, scenarios,
   * etc.), que criam sandboxes reais.
   *
   * @returns {Object} PhaseResult
   * @private
   */
  _phaseCanary() {
    const t0 = this._now();

    const bootNames = this._getBootSystemNames();
    if (!bootNames) {
      return this._skip('canary', 'boot não disponível — pulando comparação');
    }

    const canary = new SystemCanary();
    const report = canary.compare(bootNames, SANDBOX_SYSTEM_NAMES);

    const failures = [];
    if (!report.ok) {
      if (report.missingInSandbox.length > 0) {
        failures.push({
          message: `sandbox não registra: ${report.missingInSandbox.join(', ')}`,
          missing: report.missingInSandbox,
        });
      }
      if (report.extraInSandbox.length > 0) {
        failures.push({
          message: `sandbox registra sistema não presente no boot: ${report.extraInSandbox.join(', ')}`,
          extra: report.extraInSandbox,
        });
      }
      if (report.orderMismatch) {
        failures.push({
          message: 'ordem de registro difere entre boot e sandbox',
        });
      }
    }

    const summary = report.ok
      ? `${report.bootCount} sistemas em sincronia`
      : `${report.bootCount} boot vs ${report.sandboxCount} sandbox`;

    return {
      phase: 'canary',
      ok: report.ok,
      skipped: false,
      reason: null,
      durationMs: this._round(this._now() - t0),
      summary,
      data: {
        bootCount: report.bootCount,
        sandboxCount: report.sandboxCount,
        missingInSandbox: report.missingInSandbox,
        extraInSandbox: report.extraInSandbox,
        orderMismatch: report.orderMismatch,
      },
      failures,
      error: null,
    };
  }

  /**
   * Lê a lista de nomes de sistema registrados no boot.
   *
   * Retorna `null` se o contexto de boot não está disponível
   * (ambiente Node, testes programáticos). Neste caso, a fase é
   * pulada com `skipped: true` em vez de reportar 32 "missing".
   *
   * @returns {string[]|null}
   * @private
   */
  _getBootSystemNames() {
    if (typeof window === 'undefined') return null;

    const app = window.__NarrativeApp;
    if (!app) return null;
    if (!app.machine) return null;
    if (!app.machine.systems) return null;
    if (typeof app.machine.systems.keys !== 'function') return null;

    return Array.from(app.machine.systems.keys());
  }

  // ══════════════════════════════════════════════════════════
  // Fase 1 — Smoke
  // ══════════════════════════════════════════════════════════

  /**
   * Roda os 10 testes básicos do SmokeTests contra um sandbox fresco.
   * @returns {Promise<Object>}
   * @private
   */
  async _phaseSmoke() {
    const t0 = this._now();

    return await this._withSandbox(async (sb) => {
      const persist = sb.machine.systems.get('PersistenceSystem');

      const report = await SmokeTests.run({
        machine: sb.machine,
        world:   sb.world,
        bus:     sb.bus,
        persist,
      });

      return {
        phase: 'smoke',
        ok: report.ok,
        skipped: false,
        reason: null,
        durationMs: this._round(this._now() - t0),
        summary: `${report.passed}/${report.total}`,
        data: {
          passed: report.passed,
          failed: report.failed,
          total: report.total,
          results: report.results.map(r => ({
            name: r.name,
            ok: r.ok,
            ms: r.ms,
            error: r.error ?? null,
          })),
        },
        failures: report.results
          .filter(r => !r.ok)
          .map(r => ({ name: r.name, error: r.error ?? 'falhou' })),
        error: null,
      };
    }, { seedEntities: true });
  }

  // ══════════════════════════════════════════════════════════
  // Fase 2 — Contracts
  // ══════════════════════════════════════════════════════════

  /**
   * Define e envolve os 4 contratos canônicos em métodos do World.
   * @returns {Promise<Object>}
   * @private
   */
  async _phaseContracts() {
    const t0 = this._now();

    return await this._withSandbox(async (sb) => {
      const guard = new ContractGuard({ enabled: true });

      guard.define('world.createEntity', {
        pre: (args) => args && args[0] !== null && typeof args[0] === 'object',
        post: (result) => typeof result === 'string' && result.length > 0,
        description: 'createEntity deve devolver id não vazio',
      });
      guard.define('world.destroyEntity', {
        pre: (args) => typeof args?.[0] === 'string' && args[0].length > 0,
        post: (result) => typeof result === 'boolean',
        description: 'destroyEntity deve devolver boolean',
      });
      guard.define('world.addComponent', {
        pre: (args) =>
          typeof args?.[0] === 'string' && args[0].length > 0 &&
          typeof args?.[1] === 'string' && args[1].length > 0,
        description: 'addComponent precisa id e nome válidos',
      });
      guard.define('world.set', {
        pre: (args) =>
          typeof args?.[0] === 'string' && args[0].length > 0 &&
          typeof args?.[1] === 'string' && args[1].length > 0,
        description: 'world.set precisa id e nome válidos',
      });

      guard.wrap(sb.world, 'createEntity',  'world.createEntity');
      guard.wrap(sb.world, 'destroyEntity', 'world.destroyEntity');
      guard.wrap(sb.world, 'addComponent',  'world.addComponent');
      guard.wrap(sb.world, 'set',           'world.set');

      let validProbeOk = true;
      try {
        const id = sb.world.createEntity({
          Identity: { id: 'CTR-001', name: 'Valid', type: 'custom' },
        });
        sb.world.addComponent(id, 'Tags', { values: ['probe'] });
        sb.world.set(id, 'Tags', { values: ['probe', 'ok'] });
        sb.world.destroyEntity(id);
      } catch {
        validProbeOk = false;
      }
      const validViolations = guard.violations();
      const validCount = validViolations.length;

      try { sb.world.createEntity(null); }            catch { /* esperado */ }
      try { sb.world.destroyEntity(null); }           catch { /* esperado */ }
      try { sb.world.addComponent(null, 'X', {}); }   catch { /* esperado */ }
      try { sb.world.set(null, 'X', {}); }            catch { /* esperado */ }

      const allViolations = guard.violations();
      const totalCount = allViolations.length;
      const invalidCount = totalCount - validCount;

      guard.unwrapAll();
      guard.contracts.clear();

      const pass =
        validProbeOk &&
        validCount === 0 &&
        invalidCount > 0;

      const failures = [];
      if (!validProbeOk) {
        failures.push({ message: 'probe válido lançou exceção inesperada' });
      }
      if (validCount > 0) {
        for (const v of validViolations.slice(0, 5)) {
          failures.push({
            reason: 'falso-positivo',
            message: `${v.contract} violou em chamada válida (${v.type})`,
          });
        }
      }
      if (invalidCount === 0) {
        failures.push({
          message: 'probes inválidos não dispararam nenhuma violação',
        });
      }

      return {
        phase: 'contracts',
        ok: pass,
        skipped: false,
        reason: null,
        durationMs: this._round(this._now() - t0),
        summary: `${validCount} falso-positivo(s), ${invalidCount} detectada(s)`,
        data: {
          validViolations: validCount,
          invalidViolations: invalidCount,
          totalViolations: totalCount,
          sample: allViolations.slice(0, 5).map(v => ({
            contract: v.contract,
            type: v.type,
            message: v.message,
          })),
        },
        failures,
        error: null,
      };
    }, { seedEntities: false });
  }

  // ══════════════════════════════════════════════════════════
  // Fase 3 — Invariants
  // ══════════════════════════════════════════════════════════

  /**
   * Roda uma sequência de mutações no sandbox e checa os 12 invariantes.
   * @returns {Promise<Object>}
   * @private
   */
  async _phaseInvariants() {
    const t0 = this._now();

    return await this._withSandbox(async (sb) => {
      const stressCommands = [
        'ent.create.character Inv1',
        'ent.create.character Inv2',
        'ent.create.location InvLoc',
        'link.set.location Inv1 InvLoc',
        'link.add.peer Inv1 Inv2',
        'mut.add.stats Inv1.fear 5',
        'mut.push.list Inv1.inventory InvItem',
        'mut.flag.on Inv1 alive',
        'mut.enum Inv1.role soldado',
        'inst.mark Inv1',
      ];
      for (const cmd of stressCommands) {
        try { sb.machine.handleLine(cmd); } catch { /* isola */ }
      }

      const checker = new InvariantChecker({ enabled: true });
      checker.attach(sb.bus, {
        machine: sb.machine,
        world:   sb.world,
        ids:     sb.machine.ids,
        links:   sb.machine.links,
      });

      checker.check();

      const violations = checker.violations();
      const stats = checker.stats();

      checker.detach();

      return {
        phase: 'invariants',
        ok: violations.length === 0,
        skipped: false,
        reason: null,
        durationMs: this._round(this._now() - t0),
        summary: `${violations.length} violação(ões)`,
        data: {
          totalViolations: violations.length,
          byCode: stats.byCode ?? {},
          runs: stats.runs ?? 0,
        },
        failures: violations.slice(0, 10).map(v => ({
          code: v.code,
          severity: v.severity,
          message: v.message,
          context: v.context,
        })),
        error: null,
      };
    }, { seedEntities: true });
  }

  // ══════════════════════════════════════════════════════════
  // Fase 4 — Scenarios
  // ══════════════════════════════════════════════════════════

  /**
   * Roda o catálogo completo em modo ISOLADO (sandbox por cenário).
   * @returns {Promise<Object>}
   * @private
   */
  async _phaseScenarios() {
    const t0 = this._now();

    const runner = new RegressionRunner({ seedEntities: true });
    const report = await runner.run({ scenarios: SCENARIOS });

    const summary = RegressionRunner.summarize(report);
    const failures = RegressionRunner.failures(report).slice(0, 20);

    return {
      phase: 'scenarios',
      ok: report.failed === 0,
      skipped: false,
      reason: null,
      durationMs: this._round(this._now() - t0),
      summary: `${report.passed}/${report.total}`,
      data: {
        passed: report.passed,
        failed: report.failed,
        total: report.total,
        byCategory: summary.byCategory,
      },
      failures,
      error: null,
    };
  }

  // ══════════════════════════════════════════════════════════
  // Fase 5 — Fuzz
  // ══════════════════════════════════════════════════════════

  /**
   * Roda N iterações do fuzzer com seed determinística.
   *
   * Critério de aprovação: `crashes.length === 0`.
   *
   * @returns {Promise<Object>}
   * @private
   */
  async _phaseFuzz() {
    const t0 = this._now();

    return await this._withSandbox(async (sb) => {
      const fuzzer = new Fuzzer();

      const result = await fuzzer.run({
        machine: sb.machine,
        iterations: this.iterations,
        seed: this.seed,
        isolate: true,
      });

      if (result.ok === false) {
        return {
          phase: 'fuzz',
          ok: false,
          skipped: false,
          reason: null,
          durationMs: this._round(this._now() - t0),
          summary: 'fuzzer falhou',
          data: null,
          failures: [{ message: result.error ?? 'erro desconhecido' }],
          error: result.error ?? 'fuzzer falhou',
        };
      }

      const findings = result.findings ?? [];
      const crashes = result.crashes ?? [];
      const ok = crashes.length === 0;

      return {
        phase: 'fuzz',
        ok,
        skipped: false,
        reason: null,
        durationMs: this._round(this._now() - t0),
        summary: `${result.iterations} iter · seed ${result.seed} · ${findings.length} findings`,
        data: {
          iterations: result.iterations,
          seed: result.seed,
          findings: findings.length,
          crashes: crashes.length,
          verbsCovered: result.coverage?.verbs?.length ?? 0,
          actionsCovered: result.coverage?.actions?.length ?? 0,
        },
        failures: findings.slice(0, 20).map(f => ({
          iteration: f.iteration,
          command: f.line,
          error: f.error ?? 'desconhecido',
        })),
        error: null,
      };
    }, { seedEntities: true });
  }

  // ══════════════════════════════════════════════════════════
  // Fase 6 — Replay
  // ══════════════════════════════════════════════════════════

  /**
   * Grava uma sequência num sandbox A, reproduz num sandbox B,
   * e compara os estados finais.
   * @returns {Promise<Object>}
   * @private
   */
  async _phaseReplay() {
    const t0 = this._now();
    const engine = new ReplayEngine({ maxSessions: 5 });

    const commands = [
      'ent.create.character ReplayHero',
      'ent.create.location ReplayTown',
      'link.set.location ReplayHero ReplayTown',
      'mut.add.stats ReplayHero.fear 3',
      'mut.push.list ReplayHero.inventory ReplayItem',
      'mut.flag.on ReplayHero alive',
    ];

    // ── Gravação ─────────────────────────────────────────
    const sbA = await createSandbox({ seedEntities: true });
    const sessionName = `__battery_replay_${Date.now().toString(36)}__`;
    const recordErrors = [];

    try {
      engine.startSession(sessionName);

      for (const cmd of commands) {
        try {
          const r = sbA.machine.handleLine(cmd);
          if (r && r.ok === false) {
            recordErrors.push({ command: cmd, error: r.error ?? 'erro' });
          }
        } catch (err) {
          recordErrors.push({ command: cmd, error: err.message });
        }
        engine.record(cmd, { tick: sbA.machine.getTick() });
      }

      const snapshotA = this._captureWorld(sbA.world);
      engine.endSession(snapshotA);
    } finally {
      try { sbA.dispose(); } catch { /* isola */ }
    }

    // ── Reprodução ───────────────────────────────────────
    const session = engine.getSession(sessionName);
    if (!session) {
      return this._skip('replay', 'sessão de gravação não pôde ser criada');
    }

    const sbB = await createSandbox({ seedEntities: true });
    let replayResult;
    try {
      replayResult = engine.replay(session, {
        machine: sbB.machine,
        captureFinal: true,
      });
    } finally {
      try { sbB.dispose(); } catch { /* isola */ }
    }

    // ── Comparação ───────────────────────────────────────
    const diff = session.finalSnapshot && replayResult.actualSnapshot
      ? engine.compare(session.finalSnapshot, replayResult.actualSnapshot)
      : null;

    try { engine.clearSessions(); } catch { /* isola */ }

    const executed = replayResult.executed ?? 0;
    const failed = replayResult.failed ?? 0;
    const equal = diff?.equal === true;
    const ok = replayResult.ok !== false && equal && recordErrors.length === 0;

    const failures = [];
    if (recordErrors.length > 0) {
      for (const e of recordErrors.slice(0, 5)) {
        failures.push({ command: e.command, error: e.error });
      }
    }
    if (diff && diff.equal === false) {
      failures.push({
        message: 'estado final divergiu após replay',
        reason: JSON.stringify(diff.stats ?? {}),
      });
    }

    return {
      phase: 'replay',
      ok,
      skipped: false,
      reason: null,
      durationMs: this._round(this._now() - t0),
      summary: equal ? `estado idêntico (${executed} cmds)` : `diverge (${executed} cmds)`,
      data: {
        executed,
        failed,
        diff: diff?.stats ?? null,
        sessionId: session.id,
      },
      failures,
      error: null,
    };
  }

  // ══════════════════════════════════════════════════════════
  // Fase 7 — Regression
  // ══════════════════════════════════════════════════════════

  /**
   * Roda uma sequência fixa de comandos e compara contra baseline salvo.
   * @returns {Promise<Object>}
   * @private
   */
  async _phaseRegression() {
    const t0 = this._now();

    const baseline = new GoldenBaseline();
    const exists = await baseline.has(REGRESSION_BASELINE_NAME);

    return await this._withSandbox(async (sb) => {
      for (const cmd of REGRESSION_COMMANDS) {
        try { sb.machine.handleLine(cmd); } catch { /* isola */ }
      }

      if (!exists) {
        try {
          await baseline.capture(REGRESSION_BASELINE_NAME, sb.machine, {
            note: 'captura automática pela TestBattery',
            commands: REGRESSION_COMMANDS.length,
          });

          return {
            phase: 'regression',
            ok: true,
            skipped: true,
            reason: 'baseline capturado (primeira execução)',
            durationMs: this._round(this._now() - t0),
            summary: 'baseline capturado',
            data: {
              captured: true,
              name: REGRESSION_BASELINE_NAME,
              commands: REGRESSION_COMMANDS.length,
            },
            failures: [],
            error: null,
          };
        } catch (err) {
          return {
            phase: 'regression',
            ok: false,
            skipped: false,
            reason: null,
            durationMs: this._round(this._now() - t0),
            summary: 'falha ao capturar baseline',
            data: null,
            failures: [{ message: err.message }],
            error: err.message,
          };
        }
      }

      const cmp = await baseline.compare(REGRESSION_BASELINE_NAME, sb.machine);

      return {
        phase: 'regression',
        ok: cmp.equal === true,
        skipped: false,
        reason: null,
        durationMs: this._round(this._now() - t0),
        summary: cmp.equal
          ? `bate "${REGRESSION_BASELINE_NAME}"`
          : `diverge de "${REGRESSION_BASELINE_NAME}"`,
        data: {
          equal: cmp.equal,
          baselineAt: cmp.baselineAt ?? null,
          baselineCount: cmp.baselineCount ?? null,
          currentCount: cmp.currentCount ?? null,
          diff: cmp.diff ?? null,
        },
        failures: cmp.equal
          ? []
          : [{
              message: 'estado diverge do baseline',
              reason: cmp.reason ?? `added=${cmp.diff?.stats?.added ?? 0}, removed=${cmp.diff?.stats?.removed ?? 0}, changed=${cmp.diff?.stats?.changed ?? 0}`,
            }],
        error: null,
      };
    }, { seedEntities: true });
  }

  // ══════════════════════════════════════════════════════════
  // Helpers
  // ══════════════════════════════════════════════════════════

  /**
   * Cria sandbox, roda fn, descarta. Sempre limpa.
   * @template T
   * @param {(sb:Object) => Promise<T>} fn
   * @param {Object} [opts]
   * @returns {Promise<T>}
   * @private
   */
  async _withSandbox(fn, opts = {}) {
    const sb = await createSandbox(opts);
    try {
      return await fn(sb);
    } finally {
      try { sb.dispose(); } catch { /* isola */ }
    }
  }

  /**
   * Captura o estado do World no formato esperado pelo ReplayEngine.
   * @param {Object} world
   * @returns {{ entities:Object, count:number }}
   * @private
   */
  _captureWorld(world) {
    const entities = {};
    for (const id of world.allEntities()) {
      entities[id] = world.componentsOf(id);
    }
    return { entities, count: world.allEntities().length };
  }

  /**
   * Monta um PhaseResult de "pulada".
   * @param {string} phase
   * @param {string} reason
   * @returns {Object}
   * @private
   */
  _skip(phase, reason) {
    return {
      phase,
      ok: true,
      skipped: true,
      reason,
      durationMs: 0,
      summary: `skip: ${reason}`,
      data: null,
      failures: [],
      error: null,
    };
  }

  /**
   * Monta um PhaseResult para uma fase que explodiu antes de rodar.
   * @param {string} phase
   * @param {Error} err
   * @returns {Object}
   * @private
   */
  _explodedPhase(phase, err) {
    return {
      phase,
      ok: false,
      skipped: false,
      reason: null,
      durationMs: 0,
      summary: 'erro fatal na fase',
      data: null,
      failures: [{ message: err?.message ?? String(err) }],
      error: err?.message ?? String(err),
    };
  }

  /**
   * Consolida as fases num report.
   * @param {Array<Object>} phases
   * @param {number} durationMs
   * @returns {Object}
   * @private
   */
  _finalize(phases, durationMs) {
    return this.reporter.summarize(phases, {
      durationMs,
      seed: this.seed,
      iterations: this.iterations,
    });
  }

  /**
   * @returns {number}
   * @private
   */
  _now() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  /**
   * @param {number} n
   * @returns {number}
   * @private
   */
  _round(n) {
    return Math.round(Number(n) * 1000) / 1000;
  }
}