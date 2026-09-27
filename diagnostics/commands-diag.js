/**
 * @file commands-diag.js
 * @module diagnostics
 * @description Handlers dos comandos `diag.*`. Despachados pelo DiagnosticsSystem.
 * @imports diagnostics/smoke-tests
 * @importedBy systems/diagnostics-system
 * @level 9
 *
 * Fase 13.7 — Refatoração estrutural (auditoria 25/09/2026):
 *   Removido o import estático de `NarrativeDiagHandlers`. Agora o
 *   `NarrativeSystem` registra um handler próprio via
 *   `bus.emit('diag:handler:register', { verb: 'narrative', handler })`
 *   no seu `init()`. Este arquivo consulta o Map antes do switch.
 *
 *   Isso elimina o acoplamento direto `systems/` → `narrative-language/`
 *   (que o README do LUME declara como fronteira).
 *
 * Contrato:
 *   - `dispatch(prev, ast)` recebe o result acumulado + AST.
 *   - Cada handler devolve `{ ...prev, ok, mutated, right?, ... }`.
 *   - Handlers assíncronos emitem `render:right` e devolvem "em progresso".
 *   - NUNCA lançam para fora.
 *   - `registerHandler(verb, handler)` permite extensão externa.
 */

import { SmokeTests } from './smoke-tests.js';

// ══════════════════════════════════════════════════════════════
// CLASSE
// ══════════════════════════════════════════════════════════════

export class DiagnosticsCommands {
  /**
   * @param {Object} system — instância de DiagnosticsSystem
   */
  constructor(system) {
    if (!system) throw new Error('[DiagnosticsCommands] system obrigatório');
    this.system = system;

    /**
     * Handlers externos registrados via `diag:handler:register`.
     * Mapa verb → (prev, ast) => result.
     * @type {Map<string, Function>}
     * @private
     */
    this._handlers = new Map();

    this._smokeRunning = false;
    this._fuzzRunning = false;
    this._bundleBuilding = false;
    this._testRunning = false;
  }

  get machine() { return this.system.machine; }
  get world()   { return this.system.world; }
  get bus()     { return this.system.bus; }

  // ══════════════════════════════════════════════════════════
  // Registro de handlers externos (Fase 13.7)
  // ══════════════════════════════════════════════════════════

  /**
   * Registra um handler para um subcomando `diag.<verb>`.
   * Idempotente (sobrescreve).
   *
   * @param {string} verb — ex: 'narrative'
   * @param {Function} handler — (prev, ast) => SystemResult parcial
   * @returns {boolean}
   */
  registerHandler(verb, handler) {
    if (typeof verb !== 'string' || !verb) return false;
    if (typeof handler !== 'function') return false;
    this._handlers.set(verb, handler);
    return true;
  }

  /**
   * Remove um handler registrado.
   * @param {string} verb
   * @returns {boolean}
   */
  unregisterHandler(verb) {
    return this._handlers.delete(verb);
  }

  /**
   * Lista verbs com handler registrado.
   * @returns {string[]}
   */
  listRegisteredHandlers() {
    return Array.from(this._handlers.keys()).sort();
  }

  // ══════════════════════════════════════════════════════════
  // Dispatch
  // ══════════════════════════════════════════════════════════

  dispatch(prev, ast) {
    const action = ast?.action;
    if (!action) {
      return { ...prev, ok: false, halt: true, error: 'diag sem ação' };
    }

    // 1. Handlers externos registrados via bus
    const registered = this._handlers.get(action);
    if (typeof registered === 'function') {
      try {
        return registered(prev, ast);
      } catch (err) {
        return {
          ...prev, ok: false, halt: true,
          error: `handler "${action}" falhou: ${err?.message ?? String(err)}`,
        };
      }
    }

    // 2. Handlers built-in
    try {
      switch (action) {
        case 'status':     return this.status(prev);
        case 'on':         return this.toggle(prev, true);
        case 'off':        return this.toggle(prev, false);
        case 'mode':       return this.mode(prev, ast);
        case 'flight':     return this.flight(prev, ast);
        case 'counts':     return this.counts(prev);
        case 'logs':       return this.logs(prev, ast);
        case 'traces':     return this.traces(prev, ast);
        case 'invariants': return this.invariants(prev, ast);
        case 'contracts':  return this.contracts(prev, ast);
        case 'health':     return this.health(prev);
        case 'rules':      return this.rules(prev, ast);
        case 'smoke':      return this.smoke(prev);
        case 'snapshot':   return this.snapshot(prev);
        case 'clear':      return this.clear(prev);

        case 'rca':        return this.rca(prev, ast);
        case 'inject':     return this.inject(prev, ast);
        case 'fuzz':       return this.fuzz(prev, ast);
        case 'replay':     return this.replay(prev, ast);
        case 'bundle':     return this.bundle(prev, ast);

        case 'test':       return this.test(prev, ast);
        case 'baseline':   return this.baseline(prev, ast);

        // NOTA: `narrative` NÃO está aqui. É registrado via bus
        // pelo NarrativeSystem. Se o sistema narrativo não estiver
        // no pipeline, o dispatch retorna o erro abaixo.

        default:
          return {
            ...prev, ok: false, halt: true,
            error: `diag.${action} não suportado`,
          };
      }
    } catch (err) {
      return {
        ...prev, ok: false, halt: true,
        error: err?.message ?? String(err),
      };
    }
  }

  // ══════════════════════════════════════════════════════════
  // Fase 4
  // ══════════════════════════════════════════════════════════

  status(prev) {
    const suite = this._getSuite();
    if (!suite) return this._noSuite(prev);
    const st = suite.status();
    return {
      ...prev, ok: true, mutated: false,
      right: {
        kind: 'diagnostics',
        title: '🔬 diag.status',
        data: { status: {
          installed: st.installed,
          mode: st.mode,
          sessionId: st.sessionId,
          uptimeMs: st.uptimeMs,
          env: st.env,
          recorderTotal: st.recorder?.total ?? 0,
          recorderInBuffer: st.recorder?.inBuffer ?? 0,
          loggerSize: st.logger?.size ?? 0,
          wrappedSystems: st.instrumentation?.systems?.length ?? 0,
          tracerTraces: st.tracer?.traces ?? 0,
          invariantViolations: st.checker?.totalViolations ?? 0,
          contractViolations: st.contracts?.totalViolations ?? 0,
          healthAnomalies: st.health?.anomalies ?? 0,
          expectationFailures: st.expectations?.failures ?? 0,
          pipelineReports: st.pipelineReport?.total ?? 0,
          replaySessions: st.replayEngine?.sessions ?? 0,
          injectionsActive: st.faultInjector?.active ?? 0,
        }},
        sticky: true,
      },
    };
  }

  toggle(prev, on) {
    const suite = this._getSuite();
    if (!suite) return this._noSuite(prev);
    if (on) suite.start(); else suite.stop();
    return {
      ...prev, ok: true, mutated: false,
      right: {
        kind: 'diagnostics',
        title: on ? '🔬 diag.on' : '🔬 diag.off',
        data: { status: { mode: suite.getMode(), enabled: on } },
        sticky: true,
      },
    };
  }

  mode(prev, ast) {
    const suite = this._getSuite();
    if (!suite) return this._noSuite(prev);
    const mode = ast.value;
    if (!mode) return { ...prev, ok: false, halt: true, error: 'uso: diag.mode <off|light|full|dev>' };
    suite.setMode(mode);
    return {
      ...prev, ok: true, mutated: false,
      right: {
        kind: 'diagnostics',
        title: `🔬 modo → ${mode}`,
        data: { status: {
          mode: suite.getMode(),
          recorderEnabled: suite.recorder.enabled,
          loggerEnabled: suite.logger.enabled,
          tracerEnabled: suite.tracer.enabled,
          checkerEnabled: suite.checker.enabled,
          contractsEnabled: suite.contracts.enabled,
          healthEnabled: suite.health.enabled,
        }},
        sticky: true,
      },
    };
  }

  flight(prev, ast) {
    const suite = this._getSuite();
    if (!suite) return this._noSuite(prev);
    const n = ast.opts?.n ? parseInt(ast.opts.n, 10) : 100;
    const events = suite.flight(Number.isFinite(n) ? n : 100);
    return {
      ...prev, ok: true, mutated: false,
      right: { kind: 'diagnostics', title: `🔬 diag.flight (${events.length})`, data: { events }, sticky: true },
    };
  }

  counts(prev) {
    const suite = this._getSuite();
    if (!suite) return this._noSuite(prev);
    const counts = suite.eventCounts();
    return {
      ...prev, ok: true, mutated: false,
      right: { kind: 'diagnostics', title: `🔬 diag.counts (${Object.keys(counts).length} tipos)`, data: { counts }, sticky: true },
    };
  }

  logs(prev, ast) {
    const suite = this._getSuite();
    if (!suite) return this._noSuite(prev);
    const n = ast.opts?.n ? parseInt(ast.opts.n, 10) : 100;
    const level = ast.opts?.level ?? null;
    const logs = suite.logs(Number.isFinite(n) ? n : 100, level);
    return {
      ...prev, ok: true, mutated: false,
      right: { kind: 'diagnostics', title: `🔬 diag.logs${level ? ` [${level}]` : ''} (${logs.length})`, data: { logs }, sticky: true },
    };
  }

  traces(prev, ast) {
    const suite = this._getSuite();
    if (!suite) return this._noSuite(prev);
    const tracer = suite.tracer;
    if (!tracer) return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: '🔬 diag.traces', data: { raw: 'Tracer indisponível.' } } };
    const n = ast.opts?.n ? parseInt(ast.opts.n, 10) : 10;
    const traces = tracer.getRecentTraces(Number.isFinite(n) ? n : 10);
    const stats = tracer.stats();
    const rows = traces.map(t => {
      const tree = tracer.getTree(t.id);
      return { seq: t.startTs, event: t.name, tick: null, payload: { traceId: t.id, durationMs: t.durationMs, spanCount: t.spanIds?.length ?? 0, hasError: !!tree?.root?.exceptions?.length } };
    });
    return {
      ...prev, ok: true, mutated: false,
      right: { kind: 'diagnostics', title: `🔬 diag.traces (${rows.length}/${stats.traces})`, data: { status: stats, events: rows }, sticky: true },
    };
  }

  invariants(prev, ast) {
    const suite = this._getSuite();
    if (!suite) return this._noSuite(prev);
    const checker = suite.checker;
    if (!checker) return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: '🔬 diag.invariants', data: { raw: 'InvariantChecker indisponível.' } } };
    try { checker.check(); } catch { /* isola */ }
    const n = ast.opts?.n ? parseInt(ast.opts.n, 10) : 20;
    const list = checker.violations({ limit: Number.isFinite(n) ? n : 20 });
    const stats = checker.stats();
    return {
      ...prev, ok: true, mutated: false,
      right: { kind: 'diagnostics', title: `🔬 diag.invariants (${list.length}/${stats.totalViolations})`, data: { status: stats, events: list.map(v => ({ seq: v.ts, event: v.code, tick: v.tick, payload: { severity: v.severity, message: v.message, context: v.context } })) }, sticky: true },
    };
  }

  contracts(prev, ast) {
    const suite = this._getSuite();
    if (!suite) return this._noSuite(prev);
    const guard = suite.contracts;
    if (!guard) return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: '🔬 diag.contracts', data: { raw: 'ContractGuard indisponível.' } } };
    const n = ast.opts?.n ? parseInt(ast.opts.n, 10) : 20;
    const list = guard.violations(Number.isFinite(n) ? n : 20);
    const stats = guard.stats();
    return {
      ...prev, ok: true, mutated: false,
      right: { kind: 'diagnostics', title: `🔬 diag.contracts (${list.length}/${stats.totalViolations})`, data: { status: stats, events: list.map(v => ({ seq: v.ts, event: `contract:${v.type}`, tick: null, payload: { contract: v.contract, message: v.message } })) }, sticky: true },
    };
  }

  health(prev) {
    const suite = this._getSuite();
    if (!suite) return this._noSuite(prev);
    const probes = suite.health;
    if (!probes) return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: '🔬 diag.health', data: { raw: 'HealthProbes indisponível.' } } };
    return {
      ...prev, ok: true, mutated: false,
      right: { kind: 'diagnostics', title: '🔬 diag.health', data: { status: probes.stats(), events: probes.detectedAnomalies(20).map(a => ({ seq: a.ts, event: a.code, tick: null, payload: { severity: a.severity, message: a.message, context: a.context } })) }, sticky: true },
    };
  }

  rules(prev, ast) {
    const suite = this._getSuite();
    if (!suite) return this._noSuite(prev);
    const n = ast.opts?.n ? parseInt(ast.opts.n, 10) : 30;
    const events = suite.eventsByType('rule:evaluated', Number.isFinite(n) ? n : 30);
    const fired = events.filter(e => e.payload?.fired === true).length;
    const skipped = events.length - fired;
    return {
      ...prev, ok: true, mutated: false,
      right: { kind: 'diagnostics', title: `🔬 diag.rules (fired: ${fired}, skipped: ${skipped})`, data: { status: { total: events.length, fired, skipped }, events: events.map(e => ({ seq: e.seq, event: e.event, tick: e.tick, payload: e.payload })) }, sticky: true },
    };
  }

  smoke(prev) {
    if (this._smokeRunning) {
      return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: '🔬 diag.smoke', data: { raw: 'Smoke tests já estão rodando...' } } };
    }
    this._smokeRunning = true;
    const persist = this.machine?.systems?.get?.('PersistenceSystem') ?? null;
    const bus = this.bus;
    SmokeTests.run({ machine: this.machine, world: this.world, bus, persist })
      .then(report => {
        bus.emit('render:right', {
          kind: 'diagnostics',
          title: `🔬 smoke ${report.ok ? '✓' : '✗'} (${report.passed}/${report.total})`,
          data: { status: { ok: report.ok, passed: report.passed, failed: report.failed, total: report.total }, events: report.results.map(r => ({ seq: null, event: r.name, tick: null, payload: { ok: r.ok, ms: r.ms, error: r.error ?? null } })) },
          sticky: true,
        });
      })
      .catch(err => {
        bus.emit('render:right', { kind: 'diagnostics', title: '🔬 diag.smoke — erro', data: { raw: err.message } });
      })
      .finally(() => { this._smokeRunning = false; });
    return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: '🔬 diag.smoke', data: { raw: 'Rodando smoke tests...' } } };
  }

  snapshot(prev) {
    const suite = this._getSuite();
    if (!suite) return this._noSuite(prev);
    const snap = suite.snapshot();
    const json = JSON.stringify(snap, null, 2);
    return {
      ...prev, ok: true, mutated: false,
      right: { kind: 'diagnostics', title: `🔬 diag.snapshot (${(json.length / 1024).toFixed(1)} KB)`, data: { status: snap.meta, raw: json.slice(0, 5000) + (json.length > 5000 ? '\n... (truncado)' : '') }, sticky: true },
    };
  }

  clear(prev) {
    const suite = this._getSuite();
    if (!suite) return this._noSuite(prev);
    suite.clear();
    return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: '🔬 diag.clear', data: { status: { cleared: true } } } };
  }

  // ══════════════════════════════════════════════════════════
  // Fase 5/6
  // ══════════════════════════════════════════════════════════

  rca(prev, ast) {
    const suite = this._getSuite();
    if (!suite) return this._noSuite(prev);
    const rca = suite.rca;
    if (!rca) return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: '🔬 diag.rca', data: { raw: 'RootCauseAnalyzer indisponível.' } } };
    const n = ast.opts?.n ? parseInt(ast.opts.n, 10) : 30;
    const recent = suite.flight(Number.isFinite(n) ? n : 30);
    const errorEvent = recent.slice().reverse().find(e => e.event === 'system:error' || e.event === 'rule:error' || e.event === 'persist:failed');
    if (errorEvent) {
      const report = rca.analyze({ error: errorEvent.payload?.error ?? errorEvent.payload?.message ?? 'erro', line: errorEvent.payload?.line ?? null, traceId: errorEvent.payload?.traceId ?? null, recorder: suite.recorder, tracer: suite.tracer, checker: suite.checker, machine: this.machine, world: this.world });
      const markdown = rca.toMarkdown(report);
      return {
        ...prev, ok: true, mutated: false,
        right: { kind: 'diagnostics', title: `🔬 diag.rca — ${report.probableCause.category}`, data: { status: { category: report.probableCause.category, confidence: `${(report.probableCause.confidence * 100).toFixed(0)}%`, summary: report.summary }, events: report.evidence.slice(-10).map(e => ({ seq: e.ts, event: e.kind, tick: null, payload: { text: e.text } })), raw: markdown }, sticky: true },
      };
    }
    return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: '🔬 diag.rca — nenhum erro recente', data: { status: { analyzed: 0 }, raw: `Nenhum erro recente. Últimos ${recent.length} eventos inspecionados.` }, sticky: true } };
  }

  inject(prev, ast) {
    const suite = this._getSuite();
    if (!suite) return this._noSuite(prev);
    const injector = suite.faultInjector;
    if (!injector) return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: '🔬 diag.inject', data: { raw: 'FaultInjector indisponível.' } } };
    const positional = ast.positional ?? [];
    const kind = positional[0] ?? ast.opts?.kind ?? null;
    if (!kind) return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: `🔬 diag.inject (${injector.list().length} ativas)`, data: { status: injector.stats(), events: injector.list().map(i => ({ seq: i.startedAt, event: i.kind, tick: null, payload: { id: i.id, target: i.target, remainingMs: i.remainingMs } })) }, sticky: true } };
    if (kind === 'help' || kind === 'kinds') return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: '🔬 diag.inject — kinds válidos', data: { raw: 'slow | throw | drop | corrupt | stale | missing\nSintaxe: diag.inject <kind> [target] [ms=X] [probability=0..1]' }, sticky: true } };
    if (kind === 'list') return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: `🔬 diag.inject list (${injector.list().length})`, data: { status: injector.stats(), events: injector.list().map(i => ({ seq: i.startedAt, event: i.kind, tick: null, payload: { id: i.id, target: i.target, remainingMs: i.remainingMs } })) }, sticky: true } };
    if (kind === 'clear' || kind === 'ejectAll') { const n = injector.ejectAll(); return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: `🔬 diag.inject clear (${n})`, data: { status: { removed: n } } } }; }
    if (kind === 'eject') { const id = positional[1]; if (!id) return { ...prev, ok: false, halt: true, error: 'uso: diag.inject eject <id>' }; const ok = injector.eject(id); return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: `🔬 diag.inject eject ${id}`, data: { status: { ok } } } }; }
    const target = positional[1] ?? ast.opts?.target ?? null;
    const result = injector.inject(kind, { target, ms: ast.opts?.ms ? parseInt(ast.opts.ms, 10) : 300, probability: ast.opts?.probability ? parseFloat(ast.opts.probability) : 1, ttlMs: ast.opts?.ttlMs ? parseInt(ast.opts.ttlMs, 10) : undefined, component: ast.opts?.component, message: ast.opts?.message });
    if (result.ok === false) return { ...prev, ok: false, halt: true, error: result.error };
    return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: `🔬 diag.inject ${kind}${target ? ` em ${target}` : ''}`, data: { status: { id: result.id, kind: result.kind, target: result.target, expiresInMs: result.expiresAt - Date.now() }, raw: `Injeção ativa.` }, sticky: true } };
  }

  fuzz(prev, ast) {
    if (this._fuzzRunning) return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: '🔬 diag.fuzz', data: { raw: 'Fuzzer já está rodando...' } } };
    const suite = this._getSuite();
    if (!suite) return this._noSuite(prev);
    const fuzzer = suite.fuzzer;
    if (!fuzzer) return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: '🔬 diag.fuzz', data: { raw: 'Fuzzer indisponível.' } } };
    const positional = ast.positional ?? [];
    const iterations = positional[0] ? parseInt(positional[0], 10) : 500;
    const seed = ast.opts?.seed ? parseInt(ast.opts.seed, 10) : undefined;
    this._fuzzRunning = true;
    const bus = this.bus;
    fuzzer.run({ machine: this.machine, iterations: Number.isFinite(iterations) ? iterations : 500, seed: Number.isFinite(seed) ? seed : null, isolate: true })
      .then(result => {
        if (result.ok === false) { bus.emit('render:right', { kind: 'diagnostics', title: '🔬 diag.fuzz — erro', data: { raw: result.error } }); return; }
        bus.emit('render:right', {
          kind: 'diagnostics',
          title: `🔬 diag.fuzz — ${result.findings.length} findings / ${result.iterations} iter (seed ${result.seed})`,
          data: { status: { iterations: result.iterations, findings: result.findings.length, crashes: result.crashes.length, durationMs: result.durationMs, seed: result.seed, verbsCovered: result.coverage.verbs.length, actionsCovered: result.coverage.actions.length }, events: result.findings.slice(0, 40).map(f => ({ seq: f.iteration, event: f.threw ? 'throw' : 'halt', tick: f.tick, payload: { line: f.line, error: f.error } })), raw: result.findings.length === 0 ? '✅ Nenhum crash encontrado.' : null },
          sticky: true,
        });
      })
      .catch(err => { bus.emit('render:right', { kind: 'diagnostics', title: '🔬 diag.fuzz — erro', data: { raw: err.message } }); })
      .finally(() => { this._fuzzRunning = false; });
    return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: '🔬 diag.fuzz', data: { raw: `Rodando ${iterations} iterações...` } } };
  }

  replay(prev, ast) {
    const suite = this._getSuite();
    if (!suite) return this._noSuite(prev);
    const engine = suite.replayEngine;
    if (!engine) return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: '🔬 diag.replay', data: { raw: 'ReplayEngine indisponível.' } } };
    const positional = ast.positional ?? [];
    const sub = positional[0] ?? (ast.subtype ?? 'list');

    if (sub === 'start') {
      const name = positional[1] ?? null;
      const session = engine.startSession(name);
      return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: `🔬 diag.replay start — ${session.id}`, data: { status: { sessionId: session.id, recording: true }, raw: `Gravação iniciada. Use \`diag.replay stop\`.` }, sticky: true } };
    }
    if (sub === 'stop') {
      const session = engine.endSession();
      if (!session) return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: '🔬 diag.replay stop', data: { raw: 'Nenhuma sessão ativa.' } } };
      return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: `🔬 diag.replay stop — ${session.id}`, data: { status: { sessionId: session.id, commandCount: session.commands.length, durationMs: session.endedAt - session.startedAt } }, sticky: true } };
    }
    if (sub === 'clear') { engine.clearSessions(); return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: '🔬 diag.replay clear', data: { status: { cleared: true } } } }; }
    if (sub === 'export') {
      const id = positional[1]; if (!id) return { ...prev, ok: false, halt: true, error: 'uso: diag.replay export <id>' };
      const json = engine.exportSession(id, true);
      if (!json) return { ...prev, ok: false, halt: true, error: `sessão não encontrada: ${id}` };
      return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: `🔬 diag.replay export ${id}`, data: { status: { sessionId: id, size: json.length }, raw: json.slice(0, 4000) }, sticky: true } };
    }
    if (sub === 'run') {
      const id = positional[1]; if (!id) return { ...prev, ok: false, halt: true, error: 'uso: diag.replay run <id>' };
      const session = engine.getSession(id);
      if (!session) return { ...prev, ok: false, halt: true, error: `sessão não encontrada: ${id}` };
      const result = engine.replay(session, { machine: this.machine, captureFinal: true });
      const diff = session.finalSnapshot && result.actualSnapshot ? engine.compare(session.finalSnapshot, result.actualSnapshot) : null;
      return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: `🔬 diag.replay run ${id} (${result.executed} cmds)`, data: { status: { executed: result.executed, failed: result.failed, durationMs: result.durationMs, equal: diff?.equal ?? null }, events: result.errors.slice(0, 20).map(e => ({ seq: e.seq, event: 'error', tick: e.tick, payload: { line: e.line, error: e.error } })) }, sticky: true } };
    }
    const sessions = engine.listSessions();
    return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: `🔬 diag.replay (${sessions.length} sessões)`, data: { status: { recording: engine.isRecording(), activeId: engine.activeSession?.id ?? null, total: sessions.length }, events: sessions.map(s => ({ seq: s.startedAt, event: s.id, tick: null, payload: { commands: s.commandCount, durationMs: s.durationMs, ended: !!s.endedAt } })) }, sticky: true } };
  }

  bundle(prev, ast) {
    if (this._bundleBuilding) return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: '🔬 diag.bundle', data: { raw: 'Bundle já está sendo construído...' } } };
    const suite = this._getSuite();
    if (!suite) return this._noSuite(prev);
    const builder = suite.reportBuilder;
    if (!builder) return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: '🔬 diag.bundle', data: { raw: 'ReportBuilder indisponível.' } } };
    const name = ast.positional?.[0] ?? `bundle-${Date.now().toString(36)}`;
    this._bundleBuilding = true;
    try {
      const bundle = builder.build({
        name,
        includeWorld: ast.opts?.includeWorld !== 'false',
        includeTimelines: ast.opts?.includeTimelines !== 'false',
        includeSnapshots: ast.opts?.includeSnapshots === 'true',
        includeEvents: ast.opts?.includeEvents !== 'false',
        includeLogs: ast.opts?.includeLogs !== 'false',
        includeTraces: ast.opts?.includeTraces !== 'false',
        includeExpectations: ast.opts?.includeExpectations !== 'false',
        includePipeline: ast.opts?.includePipeline !== 'false',
        includeInvariants: ast.opts?.includeInvariants !== 'false',
        includeContracts: ast.opts?.includeContracts !== 'false',
        includeHealth: ast.opts?.includeHealth !== 'false',
        includeSession: ast.opts?.includeSession !== 'false',
        includeRca: ast.opts?.includeRca !== 'false',
        includeSchemas: ast.opts?.includeSchemas !== 'false',
        userNote: ast.opts?.note ?? null,
      });
      const size = builder.estimate(bundle);
      const dl = builder.download(bundle, ast.opts?.format === 'ndjson' ? 'ndjson' : 'json');
      return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: `🔬 diag.bundle — ${name}`, data: { status: { name, sections: bundle.meta?.sectionKeys?.length ?? 0, sizeBytes: size, filename: dl.filename ?? '(falha)', downloadOk: dl.ok }, raw: `Bundle: ${(size / 1024).toFixed(1)} KB\n${dl.ok ? `Download: ${dl.filename}` : 'Falha no download'}` }, sticky: true } };
    } catch (err) {
      return { ...prev, ok: false, halt: true, error: `falha no bundle: ${err.message}` };
    } finally {
      this._bundleBuilding = false;
    }
  }

  // ══════════════════════════════════════════════════════════
  // Onda 5
  // ══════════════════════════════════════════════════════════

  test(prev, ast) {
    if (this._testRunning) return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: '🧪 diag.test', data: { raw: 'Bateria já está rodando.' } } };
    const suite = this._getSuite();
    if (!suite) return this._noSuite(prev);
    if (typeof suite.runBattery !== 'function') return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: '🧪 diag.test', data: { raw: 'runBattery() indisponível.' } } };
    const phases = ast.positional?.[0] ?? ast.opts?.phases ?? 'all';
    const seed = ast.opts?.seed ? parseInt(ast.opts.seed, 10) : 42;
    const iterations = ast.opts?.iterations ? parseInt(ast.opts.iterations, 10) : 500;
    this._testRunning = true;
    const bus = this.bus;
    const t0 = Date.now();
    const initialPayload = { kind: 'diagnostics', title: `🧪 Bateria iniciada — ${phases}`, data: { raw: `Fases: ${phases}\nSeed: ${seed}\nIterações: ${iterations}` }, sticky: true };
    bus.emit('render:right', initialPayload);
    suite.runBattery({
      phases, seed, iterations,
      onProgress: ({ phase, result, index, total }) => {
        const icon = result.skipped ? '⏭' : (result.ok ? '✅' : '❌');
        bus.emit('test:battery:progress', { phase, index, total, ok: result.ok, skipped: result.skipped, summary: result.summary, durationMs: result.durationMs });
        bus.emit('render:right', { kind: 'diagnostics', title: `🧪 [${index + 1}/${total}] ${icon} ${phase} — ${result.summary}`, data: { raw: `Fase atual: ${phase}\n${index + 1} de ${total}` }, sticky: true });
      },
    })
      .then(report => {
        const durationMs = Date.now() - t0;
        const ok = report.summary?.ok === true;
        const passCount = report.summary?.totalPassed ?? 0;
        const failCount = report.summary?.totalFailed ?? 0;
        const skipCount = report.summary?.totalSkipped ?? 0;
        bus.emit('render:right', { kind: 'diagnostics', title: `🧪 Bateria ${ok ? '✓ APROVADA' : '✗ REPROVADA'} — ${passCount}✓ ${failCount}✗ ${skipCount}⏭`, data: { testReport: report, status: { ok, passed: passCount, failed: failCount, skipped: skipCount, durationMs, seed: report.meta?.seed ?? seed } }, sticky: true });
        bus.emit('test:battery:complete', report);
      })
      .catch(err => { bus.emit('render:right', { kind: 'diagnostics', title: '🧪 diag.test — erro', data: { raw: err?.message ?? String(err) } }); bus.emit('test:battery:error', { error: err?.message ?? String(err) }); })
      .finally(() => { this._testRunning = false; });
    return { ...prev, ok: true, mutated: false, right: initialPayload };
  }

  baseline(prev, ast) {
    const suite = this._getSuite();
    if (!suite) return this._noSuite(prev);
    const sub = String(ast.positional?.[0] ?? ast.subtype ?? 'list').toLowerCase();
    const name = ast.positional?.[1] ?? ast.opts?.name ?? null;
    const bus = this.bus;
    import('./golden-baseline.js').then(({ GoldenBaseline }) => {
      const baseline = new GoldenBaseline();
      switch (sub) {
        case 'list': return baseline.list().then(list => { bus.emit('render:right', { kind: 'diagnostics', title: `📦 Baselines (${list.length})`, data: { status: { count: list.length }, events: list.map(b => ({ seq: b.capturedAt, event: b.name, tick: b.tick, payload: { entityCount: b.entityCount, hash: b.hash } })), raw: list.length === 0 ? 'Nenhum baseline.' : null }, sticky: true }); });
        case 'capture': { if (!name) throw new Error('uso: diag.baseline capture <name>'); return baseline.capture(name, this.machine, { tick: this.machine.getTick(), source: 'diag.baseline' }).then(result => { bus.emit('render:right', { kind: 'diagnostics', title: `📦 Baseline — ${result.name}`, data: { status: { name: result.name, capturedAt: result.capturedAt, entityCount: result.entityCount }, raw: `Baseline "${result.name}" salvo.` }, sticky: true }); }); }
        case 'compare': { if (!name) throw new Error('uso: diag.baseline compare <name>'); return baseline.compare(name, this.machine).then(cmp => { const equal = cmp.equal === true; bus.emit('render:right', { kind: 'diagnostics', title: `📦 ${equal ? '✓' : '✗'} ${name}`, data: { status: { equal, baselineAt: cmp.baselineAt ?? null, baselineCount: cmp.baselineCount ?? null, currentCount: cmp.currentCount ?? null, reason: cmp.reason ?? null }, counts: cmp.diff?.stats ?? null, raw: equal ? `Idêntico a "${name}".` : `Diverge de "${name}".` }, sticky: true }); }); }
        case 'delete': { if (!name) throw new Error('uso: diag.baseline delete <name>'); return baseline.delete(name).then(() => { bus.emit('render:right', { kind: 'diagnostics', title: `📦 Baseline removido — ${name}`, data: { status: { name, deleted: true } } }); }); }
        case 'clear': return baseline.clear().then(n => { bus.emit('render:right', { kind: 'diagnostics', title: `📦 Baselines removidos (${n})`, data: { status: { removed: n } } }); });
        case 'stats': return baseline.stats().then(s => { bus.emit('render:right', { kind: 'diagnostics', title: `📦 Baselines — ${s.count} salvos`, data: { status: { count: s.count, totalBytes: s.totalBytes, totalKB: (s.totalBytes / 1024).toFixed(1) } }, sticky: true }); });
        default: throw new Error(`sub desconhecido: "${sub}"`);
      }
    }).catch(err => { bus.emit('render:right', { kind: 'diagnostics', title: `📦 diag.baseline ${sub} — erro`, data: { raw: err?.message ?? String(err) } }); });
    return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: `📦 diag.baseline ${sub}`, data: { raw: 'Processando...' } } };
  }

  // ══════════════════════════════════════════════════════════
  // Helpers
  // ══════════════════════════════════════════════════════════

  _getSuite() {
    if (typeof window === 'undefined') return null;
    const app = window.__NarrativeApp;
    if (!app || !app.diag) return null;
    return app.diag;
  }

  _noSuite(prev) {
    return { ...prev, ok: true, mutated: false, right: { kind: 'diagnostics', title: '🔬 DiagnosticsSuite indisponível', data: { raw: 'Verifique window.__NarrativeApp.diag.' } } };
  }
}