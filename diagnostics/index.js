/**
 * @file index.js
 * @module diagnostics
 * @description DiagnosticsSuite — orquestrador central.
 * @imports diagnostics/config, diagnostics/structured-logger,
 *          diagnostics/flight-recorder, diagnostics/instrumentation,
 *          diagnostics/tracer, diagnostics/invariant-checker,
 *          diagnostics/contract-guard, diagnostics/health-probes,
 *          diagnostics/expectation-tracker, diagnostics/pipeline-report,
 *          diagnostics/snapshot-dumper, diagnostics/replay-engine,
 *          diagnostics/root-cause-analyzer, diagnostics/fuzzer,
 *          diagnostics/fault-injector, diagnostics/report-builder,
 *          diagnostics/test-battery
 * @importedBy boot.js
 * @level 9
 *
 * Uso no boot.js:
 *   const diag = new DiagnosticsSuite();
 *   diag.install(machine, world, bus, { persist });
 *   window.__NarrativeApp.diag = diag;
 *
 * Comandos públicos:
 *   diag.start() / stop() / setMode(mode)
 *   diag.status()
 *   diag.flight(n) / logs(n) / eventsByType(evt) / eventCounts()
 *   diag.snapshot() / toNDJSON() / clear()
 *   diag.runBattery(opts) / getLastBatteryReport()
 *   diag.detach() / destroy()
 *
 * Estado da arte:
 *   - Fase 1: logger + recorder + instrumentation
 *   - Fase 4: comandos diag.* básicos
 *   - Fase 5: Tracer, InvariantChecker, ContractGuard, HealthProbes,
 *             ExpectationTracker, PipelineReport, SnapshotDumper
 *   - Fase 6: ReplayEngine, RootCauseAnalyzer, Fuzzer, FaultInjector,
 *             ReportBuilder
 *   - Onda 5: TestBattery (bateria de testes automáticos)
 */

import {
  createConfig,
  pickDefaultMode,
  isDevEnvironment,
  modeIncludes,
  isValidMode,
  DIAG_MODES,
} from './config.js';

import { StructuredLogger } from './structured-logger.js';
import { FlightRecorder } from './flight-recorder.js';
import { Instrumentation } from './instrumentation.js';

// ── Fase 5 ─────────────────────────────────────────────────────
import { Tracer } from './tracer.js';
import { InvariantChecker } from './invariant-checker.js';
import { ContractGuard } from './contract-guard.js';
import { HealthProbes } from './health-probes.js';
import { ExpectationTracker } from './expectation-tracker.js';
import { PipelineReport } from './pipeline-report.js';
import { SnapshotDumper } from './snapshot-dumper.js';

// ── Fase 6 ─────────────────────────────────────────────────────
import { ReplayEngine } from './replay-engine.js';
import { RootCauseAnalyzer } from './root-cause-analyzer.js';
import { Fuzzer } from './fuzzer.js';
import { FaultInjector } from './fault-injector.js';
import { ReportBuilder } from './report-builder.js';

// ── Onda 5 — Bateria de testes automáticos ─────────────────────
import { TestBattery } from './test-battery.js';

// ══════════════════════════════════════════════════════════════
// Aliases de feature → feature da MODE_MATRIX
// ══════════════════════════════════════════════════════════════

const FEATURE_ALIASES = Object.freeze({
  expectations: 'invariants',
  pipeline:     'spans',
  replay:       'events',
  rca:          'contracts',
  snapshot:     'invariants',
});

export class DiagnosticsSuite {
  /**
   * @param {Object} [opts={}]
   * @param {string} [opts.mode] — 'off' | 'light' | 'full' | 'dev'
   * @param {string} [opts.sessionId]
   * @param {number} [opts.ringSize=10000]
   * @param {number} [opts.logRingSize=5000]
   * @param {boolean} [opts.autoStart=true]
   */
  constructor(opts = {}) {
    const base = {
      mode: opts.mode ?? pickDefaultMode(),
      sessionId: opts.sessionId ?? null,
      ringSize: opts.ringSize ?? 10_000,
      logRingSize: opts.logRingSize ?? 5_000,
      autoStart: opts.autoStart !== false,
    };
    this.config = createConfig(base);

    if (!isValidMode(this.config.mode)) {
      throw new Error(`[DiagnosticsSuite] modo inválido: ${this.config.mode}`);
    }

    this.sessionId = this.config.sessionId || this._genSessionId();

    // ── Fase 1 ─────────────────────────────────────────────
    /** @type {StructuredLogger} */
    this.logger = new StructuredLogger({
      sessionId: this.sessionId,
      maxEntries: this.config.logRingSize,
      enabled: modeIncludes(this.config.mode, 'logs'),
    });

    /** @type {FlightRecorder} */
    this.recorder = new FlightRecorder({
      sessionId: this.sessionId,
      maxEvents: this.config.ringSize,
      enabled: modeIncludes(this.config.mode, 'events'),
      includePayload: true,
    });

    // ── Fase 5 ─────────────────────────────────────────────
    /** @type {Tracer} */
    this.tracer = new Tracer({
      maxTraces: 100,
      enabled: this._featureEnabled('spans'),
    });

    /** @type {InvariantChecker} */
    this.checker = new InvariantChecker({
      enabled: this._featureEnabled('invariants'),
    });

    /** @type {ContractGuard} */
    this.contracts = new ContractGuard({
      bus: null,
      enabled: this._featureEnabled('contracts'),
    });

    /** @type {HealthProbes} */
    this.health = new HealthProbes({
      intervalMs: 5_000,
      enabled: this._featureEnabled('health'),
      bus: null,
    });

    /** @type {ExpectationTracker} */
    this.expectations = new ExpectationTracker({
      enabled: this._featureEnabled('expectations'),
    });

    /** @type {PipelineReport} */
    this.pipelineReport = new PipelineReport({
      slowThresholdMs: 50,
      enabled: this._featureEnabled('pipeline'),
    });

    /** @type {SnapshotDumper} */
    this.snapshotDumper = new SnapshotDumper();

    // ── Fase 6 ─────────────────────────────────────────────
    /** @type {ReplayEngine} */
    this.replayEngine = new ReplayEngine({
      autoRecord: this._featureEnabled('replay'),
    });

    /** @type {RootCauseAnalyzer} */
    this.rca = new RootCauseAnalyzer();

    /** @type {Fuzzer} */
    this.fuzzer = new Fuzzer();

    /** @type {FaultInjector} */
    this.faultInjector = new FaultInjector({
      bus: null,
      machine: null,
    });

    /** @type {ReportBuilder} */
    this.reportBuilder = new ReportBuilder();

    /** @type {TestBattery|null} — criado lazy em runBattery() */
    this.testBattery = null;

    // ── Instrumentation (recebe TODAS as deps) ─────────────
    /** @type {Instrumentation} */
    this.instrumentation = new Instrumentation({
      recorder: this.recorder,
      logger: this.logger,
      tracer: this.tracer,
      expectations: this.expectations,
      pipelineReport: this.pipelineReport,
      replayEngine: this.replayEngine,
      rca: this.rca,
      enabled: modeIncludes(this.config.mode, 'events'),
    });

    this.installed = false;
    this.machine = null;
    this.world = null;
    this.bus = null;
    this.persist = null;

    /** @type {Array<Function>} */
    this._unsubs = [];

    this._startedAt = null;
  }

  // ══════════════════════════════════════════════════════════
  // Instalação
  // ══════════════════════════════════════════════════════════

  /**
   * Anexa a suíte ao Machine.
   * Idempotente — segunda chamada não faz nada.
   *
   * @param {Object} machine
   * @param {Object} world
   * @param {Object} bus
   * @param {Object} [opts={}]
   * @param {Object} [opts.persist] — PersistenceSystem (opcional)
   * @returns {DiagnosticsSuite} this
   */
  install(machine, world, bus, opts = {}) {
    if (this.installed) {
      this.logger.warn('suite', 'install() chamado duas vezes — ignorando');
      return this;
    }
    if (!machine || !bus) {
      throw new Error('[DiagnosticsSuite] machine e bus obrigatórios');
    }

    this.machine = machine;
    this.world = world;
    this.bus = bus;
    this.persist = opts.persist ?? null;

    // ── 1. Recorder assina o bus (wildcard) ────────────────
    this.recorder.attach(bus, { machine });

    // ── 2. Alimenta bus nas classes que precisam ───────────
    if (!this.contracts.bus) this.contracts.bus = bus;
    if (!this.health.bus) this.health.bus = bus;
    this.faultInjector.attach(bus, machine);

    // ── 3. Instrumenta handleLine + systems ────────────────
    this.instrumentation.instrumentMachine(machine);

    // ── 4. Attach das classes de saúde e análise ───────────
    this.checker.attach(bus, {
      machine,
      world,
      ids: machine.ids ?? null,
      links: machine.links ?? null,
    });

    this.health.start({
      machine,
      world,
      persist: this.persist,
    });

    this.snapshotDumper.attach({
      machine,
      world,
      persist: this.persist,
    });

    // ── 5. Contratos em métodos críticos ───────────────────
    this._defineAndWrapContracts(world, machine);

    // ── 6. ReportBuilder recebe todas as deps ──────────────
    this.reportBuilder.attach({
      machine,
      world,
      persist: this.persist,
      recorder: this.recorder,
      logger: this.logger,
      tracer: this.tracer,
      checker: this.checker,
      contracts: this.contracts,
      health: this.health,
      expectations: this.expectations,
      pipelineReport: this.pipelineReport,
      snapshotDumper: this.snapshotDumper,
      replayEngine: this.replayEngine,
      rca: this.rca,
    });

    // ── 7. Wire de logging por evento ──────────────────────
    this._wireLogging();

    this.installed = true;
    this._startedAt = Date.now();

    this.logger.info('suite', 'DiagnosticsSuite instalado', {
      mode: this.config.mode,
      sessionId: this.sessionId,
      env: isDevEnvironment() ? 'dev' : 'prod',
    });

    this.recorder.recordCustom('suite:installed', {
      mode: this.config.mode,
      sessionId: this.sessionId,
    });

    return this;
  }

  /**
   * Remove a suíte do Machine.
   */
  detach() {
    // Contratos primeiro (restaura métodos do World)
    this.contracts.unwrapAll();

    // Instrumentation (restaura handleLine + systems)
    this.instrumentation.uninstrumentMachine();

    // Health probes
    this.health.stop();

    // Checker / FaultInjector / SnapshotDumper
    this.checker.detach();
    this.faultInjector.detach?.();
    this.snapshotDumper.detach();

    // Recorder
    this.recorder.detach();

    // Listeners de logging
    for (const unsub of this._unsubs) {
      try { unsub(); } catch { /* noop */ }
    }
    this._unsubs = [];

    this.installed = false;
    this.logger.info('suite', 'detached');
  }

  /**
   * Destrói a suíte completamente.
   */
  destroy() {
    this.detach();

    this.recorder.destroy();
    this.logger.destroy();
    this.tracer.destroy();
    this.checker.destroy();
    this.contracts.destroy();
    this.health.destroy();
    this.expectations.destroy();
    this.pipelineReport.destroy();
    this.snapshotDumper.detach();
    this.replayEngine.clearSessions();
    this.fuzzer.ejectAll?.();
    this.faultInjector.destroy();
    this.reportBuilder.detach();

    this.machine = null;
    this.world = null;
    this.bus = null;
    this.persist = null;
  }

  // ══════════════════════════════════════════════════════════
  // Controle de modo
  // ══════════════════════════════════════════════════════════

  /**
   * Liga captura (respeitando o modo atual).
   */
  start() {
    this.recorder.setEnabled(modeIncludes(this.config.mode, 'events'));
    this.logger.setEnabled(modeIncludes(this.config.mode, 'logs'));
    this.instrumentation.setEnabled(modeIncludes(this.config.mode, 'events'));

    this.tracer.setEnabled(this._featureEnabled('spans'));
    this.checker.setEnabled(this._featureEnabled('invariants'));
    this.contracts.setEnabled(this._featureEnabled('contracts'));
    this.health.setEnabled(this._featureEnabled('health'));
    this.expectations.setEnabled(this._featureEnabled('expectations'));
    this.pipelineReport.setEnabled(this._featureEnabled('pipeline'));

    this.logger.info('suite', 'started');
    return this;
  }

  /**
   * Desliga captura sem remover wrappers.
   */
  stop() {
    this.recorder.setEnabled(false);
    this.logger.setEnabled(false);
    this.instrumentation.setEnabled(false);

    this.tracer.setEnabled(false);
    this.checker.setEnabled(false);
    this.contracts.setEnabled(false);
    this.health.setEnabled(false);
    this.expectations.setEnabled(false);
    this.pipelineReport.setEnabled(false);

    this.logger.info('suite', 'stopped');
    return this;
  }

  /**
   * Troca o modo.
   * @param {'off'|'light'|'full'|'dev'} mode
   */
  setMode(mode) {
    if (!isValidMode(mode)) {
      throw new Error(`[DiagnosticsSuite] modo inválido: ${mode}`);
    }
    this.config.mode = mode;

    this.recorder.setEnabled(modeIncludes(mode, 'events'));
    this.logger.setEnabled(modeIncludes(mode, 'logs'));
    this.instrumentation.setEnabled(modeIncludes(mode, 'events'));

    this.tracer.setEnabled(this._featureEnabled('spans'));
    this.checker.setEnabled(this._featureEnabled('invariants'));
    this.contracts.setEnabled(this._featureEnabled('contracts'));
    this.health.setEnabled(this._featureEnabled('health'));
    this.expectations.setEnabled(this._featureEnabled('expectations'));
    this.pipelineReport.setEnabled(this._featureEnabled('pipeline'));

    this.logger.info('suite', `mode → ${mode}`);
    this.recorder.recordCustom('suite:mode-changed', { mode });
    return this;
  }

  /**
   * Retorna o modo atual.
   * @returns {string}
   */
  getMode() {
    return this.config.mode;
  }

  /**
   * Lista os modos válidos.
   * @returns {string[]}
   */
  static modes() {
    return [...DIAG_MODES];
  }

  // ══════════════════════════════════════════════════════════
  // Consultas
  // ══════════════════════════════════════════════════════════

  /**
   * Status completo da suíte.
   * @returns {Object}
   */
  status() {
    return {
      installed: this.installed,
      mode: this.config.mode,
      sessionId: this.sessionId,
      uptimeMs: this._startedAt ? Date.now() - this._startedAt : 0,
      env: isDevEnvironment() ? 'dev' : 'prod',

      recorder: this._safeStats(this.recorder),
      logger: {
        size: this.logger.size(),
        minLevel: this.logger.minLevel,
      },
      instrumentation: {
        wrapped: this.instrumentation.isWrapped(),
        wrappedCount: this.instrumentation.wrappedCount(),
        systems: this.instrumentation.wrappedSystems(),
      },

      tracer: this._safeStats(this.tracer),
      checker: this._safeStats(this.checker),
      contracts: this._safeStats(this.contracts),
      health: this._safeStats(this.health),
      expectations: this._safeStats(this.expectations),
      pipelineReport: this._safeStats(this.pipelineReport),

      snapshotDumper: {
        attached: typeof this.snapshotDumper.isAttached === 'function'
          ? this.snapshotDumper.isAttached()
          : false,
      },
      replayEngine: {
        recording: this.replayEngine.isRecording(),
        sessions: this.replayEngine.size(),
      },
      fuzzer: this._safeStats(this.fuzzer),
      faultInjector: this._safeStats(this.faultInjector),
      reportBuilder: {
        attached: !!this.reportBuilder._machine,
      },
      testBattery: this.testBattery
        ? {
            configured: true,
            seed: this.testBattery.seed,
            iterations: this.testBattery.iterations,
            running: this.testBattery.running,
            lastReport: this.testBattery.lastReport
              ? {
                  ok: this.testBattery.lastReport.summary?.ok ?? null,
                  passed: this.testBattery.lastReport.summary?.totalPassed ?? 0,
                  failed: this.testBattery.lastReport.summary?.totalFailed ?? 0,
                  skipped: this.testBattery.lastReport.summary?.totalSkipped ?? 0,
                  durationMs: this.testBattery.lastReport.meta?.durationMs ?? 0,
                  generatedAt: this.testBattery.lastReport.meta?.generatedAtISO ?? null,
                }
              : null,
          }
        : {
            configured: false,
          },
    };
  }

  /**
   * Últimos N eventos do flight recorder.
   * @param {number} [n=100]
   * @returns {Array<Object>}
   */
  flight(n = 100) {
    return this.recorder.last(n);
  }

  /**
   * Últimos N logs.
   * @param {number} [n=100]
   * @param {string} [level=null]
   * @returns {Array<Object>}
   */
  logs(n = 100, level = null) {
    return this.logger.entries({ limit: n, level });
  }

  /**
   * Eventos filtrados por nome.
   * @param {string} event
   * @param {number} [limit=100]
   * @returns {Array<Object>}
   */
  eventsByType(event, limit = 100) {
    return this.recorder.entries({ event, limit });
  }

  /**
   * Contagens por tipo de evento.
   * @returns {Object<string, number>}
   */
  eventCounts() {
    return this.recorder.counts();
  }

  // ══════════════════════════════════════════════════════════
  // Bateria de testes (Onda 5)
  // ══════════════════════════════════════════════════════════

  /**
   * Roda a bateria de testes automáticos.
   *
   * Cria o `TestBattery` na primeira chamada (lazy). Em chamadas
   * subsequentes, reutiliza a instância e permite reconfigurar
   * `seed` e `iterations` via opts.
   *
   * @param {Object} [opts={}]
   * @param {string|string[]} [opts.phases='all'] — preset ('all'|'fast'|'minimal') ou lista
   * @param {number} [opts.seed=42]               — seed do fuzzer
   * @param {number} [opts.iterations=500]        — iterações do fuzzer
   * @param {Function} [opts.onProgress=null]     — callback({ phase, result, index, total })
   * @param {boolean} [opts.stopOnFirstFailure=false]
   * @returns {Promise<Object>} BatteryReport (ver test-reporter.js)
   */
  async runBattery(opts = {}) {
    if (!this.testBattery) {
      this.testBattery = new TestBattery({
        seed: opts.seed ?? 42,
        iterations: opts.iterations ?? 500,
        suite: this,
      });
    } else {
      // Permite reconfigurar entre execuções
      if (Number.isFinite(opts.seed)) {
        this.testBattery.seed = opts.seed;
      }
      if (Number.isFinite(opts.iterations)) {
        this.testBattery.iterations = Math.max(1, opts.iterations);
      }
    }

    this.logger.info('suite', 'battery iniciada', {
      phases: opts.phases ?? 'all',
      seed: this.testBattery.seed,
      iterations: this.testBattery.iterations,
    });

    const report = await this.testBattery.runAll(opts);

    this.logger.info('suite', 'battery concluída', {
      ok: report?.summary?.ok ?? null,
      passed: report?.summary?.totalPassed ?? 0,
      failed: report?.summary?.totalFailed ?? 0,
      skipped: report?.summary?.totalSkipped ?? 0,
      durationMs: report?.meta?.durationMs ?? 0,
    });

    return report;
  }

  /**
   * Retorna o último relatório da bateria (ou null).
   * @returns {Object|null}
   */
  getLastBatteryReport() {
    return this.testBattery?.lastReport ?? null;
  }

  // ══════════════════════════════════════════════════════════
  // Output
  // ══════════════════════════════════════════════════════════

  /**
   * Snapshot completo do estado da suíte.
   * @returns {Object}
   */
  snapshot() {
    const snap = {
      meta: {
        sessionId: this.sessionId,
        mode: this.config.mode,
        generatedAt: new Date().toISOString(),
        uptimeMs: this._startedAt ? Date.now() - this._startedAt : 0,
      },
      status: this.status(),

      recorder: {
        stats: this.recorder.stats(),
        events: this.recorder.dump(),
      },
      logger: {
        size: this.logger.size(),
        entries: this.logger.dump(),
      },
    };

    snap.tracer = this._safeToJSON(this.tracer);
    snap.invariants = this._safeToJSON(this.checker);
    snap.contracts = this._safeToJSON(this.contracts);
    snap.health = this._safeToJSON(this.health);
    snap.expectations = this._safeToJSON(this.expectations);
    snap.pipeline = this._safeToJSON(this.pipelineReport);

    snap.replay = this._safeCall(() => ({
      recording: this.replayEngine.isRecording(),
      sessions: this.replayEngine.listSessions(),
      activeCommands: this.replayEngine.activeSession?.commands ?? [],
    }), null);

    snap.fuzzer = this._safeStats(this.fuzzer);
    snap.injections = this._safeStats(this.faultInjector);

    snap.snapshotDumper = this._safeCall(
      () => this.snapshotDumper.dumpCompact(),
      null
    );

    if (this.testBattery?.lastReport) {
      snap.testBattery = {
        summary: this.testBattery.lastReport.summary,
        meta: this.testBattery.lastReport.meta,
        phases: this.testBattery.lastReport.phases.map(p => ({
          phase: p.phase,
          ok: p.ok,
          skipped: p.skipped,
          durationMs: p.durationMs,
          summary: p.summary,
          failureCount: Array.isArray(p.failures) ? p.failures.length : 0,
        })),
      };
    }

    return snap;
  }

  /**
   * Serializa tudo em NDJSON (eventos + logs + violações).
   * @returns {string}
   */
  toNDJSON() {
    const lines = [];

    lines.push(JSON.stringify({
      kind: 'meta',
      sessionId: this.sessionId,
      mode: this.config.mode,
      generatedAt: new Date().toISOString(),
    }));

    for (const e of this.recorder.dump()) {
      try {
        lines.push(JSON.stringify({ kind: 'event', ...e }));
      } catch { /* ignora */ }
    }

    for (const l of this.logger.dump()) {
      try {
        lines.push(JSON.stringify({ kind: 'log', ...l }));
      } catch { /* ignora */ }
    }

    this._appendNDJSONSafe(lines, 'trace', () =>
      this.tracer.getAllTraces().map(t => ({
        id: t.id,
        name: t.name,
        durationMs: t.durationMs,
        spanCount: t.spanIds?.length ?? 0,
      }))
    );

    this._appendNDJSONSafe(lines, 'invariant', () => this.checker.violations());
    this._appendNDJSONSafe(lines, 'contract',  () => this.contracts.violations());
    this._appendNDJSONSafe(lines, 'health',    () => this.health.detectedAnomalies());
    this._appendNDJSONSafe(lines, 'expectation', () => this.expectations.getFailures());
    this._appendNDJSONSafe(lines, 'pipeline',  () => this.pipelineReport.getWithAnomalies());

    this._appendNDJSONSafe(lines, 'injection', () =>
      this.faultInjector.list?.() ?? []
    );

    return lines.join('\n');
  }

  /**
   * Limpa buffers (mantém instrumentação e modo).
   */
  clear() {
    this.recorder.clear();
    this.logger.clear();
    this.tracer.clear();
    this.checker.clear();
    this.contracts.clear();
    this.health.clear();
    this.expectations.clear();
    this.pipelineReport.clear();
    this.logger.info('suite', 'buffers limpos');
    return this;
  }

  // ══════════════════════════════════════════════════════════
  // Internos
  // ══════════════════════════════════════════════════════════

  /**
   * Verifica se uma feature está habilitada no modo atual,
   * resolvendo aliases para a MODE_MATRIX.
   * @param {string} feature
   * @returns {boolean}
   * @private
   */
  _featureEnabled(feature) {
    const target = FEATURE_ALIASES[feature] ?? feature;
    return modeIncludes(this.config.mode, target);
  }

  /**
   * Define e aplica contratos em métodos críticos do World e Machine.
   * @private
   */
  _defineAndWrapContracts(world, machine) {
    if (!this.contracts.enabled) return;

    // world.createEntity
    this.contracts.define('world.createEntity', {
      pre: (args) => args && args[0] !== null && typeof args[0] === 'object',
      post: (result) => typeof result === 'string' && result.length > 0,
      description: 'createEntity deve devolver id não vazio',
    });
    this.contracts.wrap(world, 'createEntity', 'world.createEntity');

    // world.destroyEntity
    this.contracts.define('world.destroyEntity', {
      pre: (args) => typeof args?.[0] === 'string' && args[0].length > 0,
      post: (result) => typeof result === 'boolean',
      description: 'destroyEntity deve devolver boolean',
    });
    this.contracts.wrap(world, 'destroyEntity', 'world.destroyEntity');

    // world.addComponent
    this.contracts.define('world.addComponent', {
      pre: (args) =>
        typeof args?.[0] === 'string' && args[0].length > 0 &&
        typeof args?.[1] === 'string' && args[1].length > 0,
      description: 'addComponent precisa id e nome válidos',
    });
    this.contracts.wrap(world, 'addComponent', 'world.addComponent');

    // world.set
    this.contracts.define('world.set', {
      pre: (args) =>
        typeof args?.[0] === 'string' && args[0].length > 0 &&
        typeof args?.[1] === 'string' && args[1].length > 0,
      description: 'world.set precisa id e nome válidos',
    });
    this.contracts.wrap(world, 'set', 'world.set');
  }

  /**
   * Registra handlers de logging por evento do bus.
   * @private
   */
  _wireLogging() {
    if (!this.bus) return;

    const wire = (evt, level, msg) => {
      const unsub = this.bus.on(evt, (payload) => {
        this.logger[level]('events', msg, payload);
      });
      this._unsubs.push(unsub);
    };

    // Informações
    wire('boot:complete',        'info',  'boot completo');
    wire('machine:reset',        'info',  'machine reset');
    wire('machine:restored',     'info',  'machine restaurado');
    wire('world:cleared',        'info',  'world limpo');
    wire('links:pruned',         'info',  'links podados');
    wire('stale:propagated',     'info',  'stale propagado');
    wire('export:ready',         'info',  'export pronto');
    wire('rule:fired',           'info',  'regra disparou');

    // Warnings
    wire('rule:overflow',        'warn',  'rule overflow');
    wire('rule:cycle',           'warn',  'ciclo de regra detectado');
    wire('validation:warnings',  'warn',  'warnings de validação');
    wire('validation:soft-fail', 'warn',  'validação soft-fail');
    wire('link-index:drift',     'warn',  'drift no link-index');
    wire('pipeline:system-missing', 'warn', 'sistema ausente no pipeline');
    wire('diag:contract:violated', 'warn', 'contrato violado');
    wire('diag:health:anomaly',    'warn', 'anomalia de saúde');

    // Erros
    wire('persist:failed',       'error', 'falha ao persistir');
    wire('rule:error',           'error', 'erro em regra');
  }

  /**
   * Executa `fn()` com try/catch, devolvendo `fallback` em erro.
   * @private
   */
  _safeCall(fn, fallback = null) {
    try {
      return fn();
    } catch {
      return fallback;
    }
  }

  /**
   * Chama `.stats()` de uma classe com segurança.
   * @private
   */
  _safeStats(instance) {
    if (!instance || typeof instance.stats !== 'function') return null;
    try {
      return instance.stats();
    } catch {
      return null;
    }
  }

  /**
   * Chama `.toJSON()` de uma classe com segurança.
   * @private
   */
  _safeToJSON(instance) {
    if (!instance || typeof instance.toJSON !== 'function') return null;
    try {
      return instance.toJSON();
    } catch {
      return null;
    }
  }

  /**
   * Anexa um bloco NDJSON a partir de um array de entradas.
   * @private
   */
  _appendNDJSONSafe(lines, kind, producer) {
    let entries;
    try {
      entries = producer();
    } catch {
      return;
    }
    if (!Array.isArray(entries)) return;

    for (const e of entries) {
      try {
        lines.push(JSON.stringify({ kind, ...e }));
      } catch { /* ignora entrada não serializável */ }
    }
  }

  /**
   * Gera um sessionId curto.
   * @returns {string}
   * @private
   */
  _genSessionId() {
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 6);
    return `diag-${t}-${r}`;
  }
}

// ══════════════════════════════════════════════════════════════
// Factory
// ══════════════════════════════════════════════════════════════

/**
 * Cria uma nova DiagnosticsSuite.
 * @param {Object} [opts]
 * @returns {DiagnosticsSuite}
 */
export function createDiagnosticsSuite(opts = {}) {
  return new DiagnosticsSuite(opts);
}

// ══════════════════════════════════════════════════════════════
// Re-exports
// ══════════════════════════════════════════════════════════════

export { StructuredLogger } from './structured-logger.js';
export { FlightRecorder } from './flight-recorder.js';
export { Instrumentation } from './instrumentation.js';
export { Tracer } from './tracer.js';
export { InvariantChecker } from './invariant-checker.js';
export { ContractGuard } from './contract-guard.js';
export { HealthProbes } from './health-probes.js';
export { ExpectationTracker } from './expectation-tracker.js';
export { PipelineReport } from './pipeline-report.js';
export { SnapshotDumper } from './snapshot-dumper.js';
export { ReplayEngine } from './replay-engine.js';
export { RootCauseAnalyzer } from './root-cause-analyzer.js';
export { Fuzzer } from './fuzzer.js';
export { FaultInjector } from './fault-injector.js';
export { ReportBuilder } from './report-builder.js';
export { TestBattery, PHASE_ORDER, PHASE_PRESETS } from './test-battery.js';

export {
  DIAG_MODES,
  DIAG_DEFAULTS,
  DIAG_EVENT_CATEGORIES,
  createConfig,
  isDevEnvironment,
  pickDefaultMode,
  modeIncludes,
  isValidMode,
} from './config.js';