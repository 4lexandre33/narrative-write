/**
 * @file instrumentation.js
 * @module diagnostics
 * @description Envolve machine.handleLine e cada system.run com hooks de captura.
 * @imports — (nenhum)
 * @importedBy diagnostics/index
 * @level 9
 *
 * Contrato:
 *   - Zero mudança comportamental: os sistemas veem os mesmos args e retorno.
 *   - Reversível: uninstrumentMachine() restaura os métodos originais.
 *   - Isolado: falha em qualquer classe de diagnóstico nunca quebra o pipeline.
 *
 * O que é capturado:
 *   Recorder:
 *     - handleLine:start  → linha, timestamp
 *     - handleLine:end    → duração, ok, mutated, halt, error, kind, traceId
 *     - system:run        → nome, duração, ok, mutated, halt, traceId
 *     - system:error      → nome, stack, linha
 *
 *   Tracer:
 *     - startTrace('handleLine') / endTrace
 *     - startSpan(name) / endSpan / recordException por sistema
 *
 *   PipelineReport:
 *     - begin(traceId, line) / end(traceId, finalResult, expectedOrder)
 *     - recordSystem(traceId, name, {ms, ok, mutated, halt, error})
 *
 *   ReplayEngine:
 *     - record(line, {tick}) no início de cada handleLine
 *
 *   ExpectationTracker:
 *     - declare(line, ast, ctx) após ParseSystem produzir AST
 *     - recordEvent(commandId, event, payload) via wildcard do bus
 *     - observe(commandId, result, {tickAfter}) no fim do handleLine
 *
 *   RootCauseAnalyzer:
 *     - analyze({...}) ao capturar exceção em handleLine ou system.run
 */

export class Instrumentation {
  /**
   * @param {Object} opts
   * @param {Object} [opts.recorder]
   * @param {Object} [opts.logger]
   * @param {Object} [opts.tracer]
   * @param {Object} [opts.expectations]
   * @param {Object} [opts.pipelineReport]
   * @param {Object} [opts.replayEngine]
   * @param {Object} [opts.rca]
   * @param {boolean} [opts.enabled=true]
   */
  constructor({
    recorder = null,
    logger = null,
    tracer = null,
    expectations = null,
    pipelineReport = null,
    replayEngine = null,
    rca = null,
    enabled = true,
  } = {}) {
    this.recorder = recorder;
    this.logger = logger;
    this.tracer = tracer;
    this.expectations = expectations;
    this.pipelineReport = pipelineReport;
    this.replayEngine = replayEngine;
    this.rca = rca;
    this.enabled = !!enabled;

    /** @type {Map<string, Function>} */
    this._originals = new Map();

    /** @type {Object|null} */
    this._machine = null;

    /** @type {Array<Object>} pilha de contextos de comando (para nesting) */
    this._commandStack = [];

    /** @type {Function|null} unsubscribe do wildcard do bus */
    this._busUnsub = null;

    this._wrapped = false;
    this._startedAt = null;
  }

  // ══════════════════════════════════════════════════════════
  // Instrumentação
  // ══════════════════════════════════════════════════════════

  /**
   * Envolve o Machine inteiro: handleLine + todos os systems.
   * Idempotente — segunda chamada não faz nada.
   *
   * @param {Object} machine
   * @returns {Instrumentation} this
   */
  instrumentMachine(machine) {
    if (!machine) throw new Error('[Instrumentation] machine inválido');
    if (this._wrapped) return this;

    this._machine = machine;
    this._startedAt = Date.now();

    this._wrapHandleLine(machine);
    this._wrapAllSystems(machine);
    this._wireBusForExpectations(machine);

    this._wrapped = true;

    this.logger?.info('instrumentation', 'machine instrumentado', {
      systems: machine.systems?.size ?? 0,
    });

    return this;
  }

  /**
   * Restaura os métodos originais.
   * @returns {Instrumentation} this
   */
  uninstrumentMachine() {
    if (!this._machine || !this._wrapped) return this;

    // Wildcard do bus (expectations)
    this._unwireBus();

    // handleLine
    const origHandle = this._originals.get('machine.handleLine');
    if (origHandle) {
      this._machine.handleLine = origHandle;
    }

    // systems
    if (this._machine.systems) {
      for (const [name, system] of this._machine.systems) {
        const key = `system.${name}`;
        const original = this._originals.get(key);
        if (original) {
          system.run = original;
        }
      }
    }

    this._originals.clear();
    this._commandStack = [];
    this._wrapped = false;
    this._machine = null;

    return this;
  }

  // ══════════════════════════════════════════════════════════
  // Consultas
  // ══════════════════════════════════════════════════════════

  isWrapped() {
    return this._wrapped;
  }

  wrappedCount() {
    return this._originals.size;
  }

  wrappedSystems() {
    const out = [];
    for (const key of this._originals.keys()) {
      if (key.startsWith('system.')) out.push(key.slice(7));
    }
    return out;
  }

  uptimeMs() {
    return this._startedAt ? Date.now() - this._startedAt : 0;
  }

  // ══════════════════════════════════════════════════════════
  // Controle
  // ══════════════════════════════════════════════════════════

  /**
   * Liga/desliga captura sem remover os wrappers.
   * @param {boolean} v
   */
  setEnabled(v) {
    this.enabled = !!v;
  }

  // ══════════════════════════════════════════════════════════
  // Internos — wrappers
  // ══════════════════════════════════════════════════════════

  /**
   * @private
   */
  _wrapHandleLine(machine) {
    if (typeof machine.handleLine !== 'function') return;

    const original = machine.handleLine.bind(machine);
    const self = this;

    machine.handleLine = function instrumentedHandleLine(line) {
      if (!self.enabled) {
        return original(line);
      }

      const startedAt = self._now();
      const lineStr = String(line ?? '');

      // ── 1. Recorder: handleLine:start ────────────────────
      self._safeRecord('handleLine:start', { line: lineStr });

      // ── 2. Tracer: startTrace ────────────────────────────
      const traceId = self._safeCall(() =>
        self.tracer?.startTrace('handleLine', { line: lineStr })
      ) || null;

      // ── 3. PipelineReport: begin ─────────────────────────
      const reportId = self._safeCall(() =>
        self.pipelineReport?.begin(traceId, lineStr, null)
      ) || null;

      // ── 4. ReplayEngine: record ──────────────────────────
      self._safeCall(() =>
        self.replayEngine?.record(lineStr, { tick: self._getTick() })
      );

      // Contexto de comando empilhado (para nesting via CommandRunner)
      const cmdContext = {
        traceId,
        reportId,
        commandId: null,
        ast: null,
        line: lineStr,
      };
      self._commandStack.push(cmdContext);

      let result;
      let error = null;

      try {
        result = original(line);
        return result;
      } catch (err) {
        error = err;

        // ── RCA: análise causal ────────────────────────────
        self._safeCall(() =>
          self.rca?.analyze({
            error: err,
            line: lineStr,
            traceId,
            recorder: self.recorder,
            tracer: self.tracer,
            checker: null,
            machine,
            world: machine.world,
          })
        );

        self._safeLog('error', 'instrumentation', `handleLine lançou: ${err.message}`, {
          line: lineStr,
          stack: self._shortStack(err),
        });
        self._safeRecord('system:error', {
          system: 'handleLine',
          line: lineStr,
          error: err.message,
          traceId,
        });
        throw err;
      } finally {
        self._commandStack.pop();

        const ms = self._round(self._now() - startedAt);

        // ── 5. ExpectationTracker: observe ─────────────────
        if (cmdContext.commandId && self.expectations) {
          self._safeCall(() =>
            self.expectations.observe(cmdContext.commandId, result ?? {}, {
              tickAfter: self._getTick(),
            })
          );
        }

        // ── 6. PipelineReport: end ─────────────────────────
        if (reportId && self.pipelineReport) {
          const expectedOrder = self._getExpectedOrder(machine, result);
          self._safeCall(() =>
            self.pipelineReport.end(reportId, result ?? {}, expectedOrder)
          );
        }

        // ── 7. Tracer: endTrace ────────────────────────────
        if (traceId && self.tracer) {
          self._safeCall(() =>
            self.tracer.endTrace(traceId, {
              ok: result?.ok !== false,
              mutated: result?.mutated === true,
              error: error ? error.message : (result?.error ?? null),
            })
          );
        }

        // ── 8. Recorder: handleLine:end ────────────────────
        self._safeRecord('handleLine:end', {
          line: lineStr,
          ms,
          ok: result?.ok !== false,
          mutated: result?.mutated === true,
          halt: result?.halt === true,
          kind: result?.kind ?? null,
          error: result?.error ?? (error ? error.message : null),
          traceId,
        });
      }
    };

    this._originals.set('machine.handleLine', original);
  }

  /**
   * @private
   */
  _wrapAllSystems(machine) {
    if (!machine.systems || typeof machine.systems[Symbol.iterator] !== 'function') {
      return;
    }

    for (const [name, system] of machine.systems) {
      if (!system || typeof system.run !== 'function') continue;
      this._wrapSystem(name, system);
    }
  }

  /**
   * @private
   */
  _wrapSystem(name, system) {
    const original = system.run.bind(system);
    const self = this;

    system.run = function instrumentedRun(line, ctx, prev) {
      if (!self.enabled) {
        return original(line, ctx, prev);
      }

      const startedAt = self._now();
      const lineStr = String(line ?? '');
      const cmdCtx = self._currentCmdContext();
      const traceId = cmdCtx?.traceId ?? null;
      const reportId = cmdCtx?.reportId ?? null;

      // ── Tracer: startSpan ────────────────────────────────
      const spanId = (traceId && self.tracer)
        ? self._safeCall(() => self.tracer.startSpan(traceId, name))
        : null;

      let result;
      let error = null;

      try {
        result = original(line, ctx, prev);
        return result;
      } catch (err) {
        error = err;

        self._safeLog('error', 'instrumentation', `system ${name} lançou`, {
          line: lineStr,
          error: err.message,
          stack: self._shortStack(err),
        });
        self._safeRecord('system:error', {
          system: name,
          line: lineStr,
          error: err.message,
          traceId,
        });

        // RCA também em erro de sistema
        self._safeCall(() =>
          self.rca?.analyze({
            error: err,
            line: lineStr,
            traceId,
            recorder: self.recorder,
            tracer: self.tracer,
          })
        );

        throw err;
      } finally {
        const ms = self._round(self._now() - startedAt);

        // ── Tracer: endSpan + recordException ──────────────
        if (spanId && self.tracer) {
          if (error) {
            self._safeCall(() => self.tracer.recordException(spanId, error));
          }
          self._safeCall(() =>
            self.tracer.endSpan(spanId, {
              ms,
              ok: result?.ok !== false,
              mutated: result?.mutated === true,
              halt: result?.halt === true,
            })
          );
        }

        // ── PipelineReport: recordSystem ───────────────────
        if (reportId && self.pipelineReport) {
          self._safeCall(() =>
            self.pipelineReport.recordSystem(reportId, name, {
              ms,
              ok: result?.ok !== false,
              mutated: result?.mutated === true,
              halt: result?.halt === true,
              error: error ? error.message : (result?.error ?? null),
            })
          );
        }

        // ── ExpectationTracker: declare após ParseSystem ───
        if (
          name === 'ParseSystem' &&
          cmdCtx &&
          !cmdCtx.commandId &&
          result?.ast &&
          self.expectations
        ) {
          const commandId = self._safeCall(() =>
            self.expectations.declare(lineStr, result.ast, {
              kind: result.kind ?? null,
              tick: self._getTick(),
            })
          );
          if (commandId) {
            cmdCtx.commandId = commandId;
            cmdCtx.ast = result.ast;
          }
        }

        // ── Recorder: system:run ───────────────────────────
        self._safeRecord('system:run', {
          system: name,
          line: lineStr,
          ms,
          ok: result?.ok !== false,
          mutated: result?.mutated === true,
          halt: result?.halt === true,
          hasError: !!error,
          traceId,
        });
      }
    };

    this._originals.set(`system.${name}`, original);
  }

  // ══════════════════════════════════════════════════════════
  // Internos — bus wildcard para ExpectationTracker
  // ══════════════════════════════════════════════════════════

  /**
   * Anexa um wildcard ao bus para alimentar recordEvent do ExpectationTracker.
   * @param {Object} machine
   * @private
   */
  _wireBusForExpectations(machine) {
    if (!this.expectations) return;
    if (!machine?.bus || typeof machine.bus.on !== 'function') return;
    if (this._busUnsub) return;

    const self = this;
    this._busUnsub = machine.bus.on('*', ({ event, payload }) => {
      const cmdCtx = self._currentCmdContext();
      if (!cmdCtx || !cmdCtx.commandId) return;
      self._safeCall(() =>
        self.expectations.recordEvent(cmdCtx.commandId, event, payload)
      );
    });
  }

  /**
   * Remove o wildcard.
   * @private
   */
  _unwireBus() {
    if (this._busUnsub) {
      try { this._busUnsub(); } catch { /* noop */ }
      this._busUnsub = null;
    }
  }

  // ══════════════════════════════════════════════════════════
  // Internos — contexto e utilidades
  // ══════════════════════════════════════════════════════════

  /**
   * Retorna o contexto de comando atual (topo da pilha) ou null.
   * @returns {Object|null}
   * @private
   */
  _currentCmdContext() {
    if (this._commandStack.length === 0) return null;
    return this._commandStack[this._commandStack.length - 1];
  }

  /**
   * Tick atual do Machine.
   * @returns {string}
   * @private
   */
  _getTick() {
    return this._machine?.state?.tick ?? 'T0';
  }

  /**
   * Deriva a ordem esperada de sistemas a partir do Machine.
   * @param {Object} machine
   * @param {Object} result
   * @returns {string[]|null}
   * @private
   */
  _getExpectedOrder(machine, result) {
    try {
      const kind = result?.kind;
      if (!kind || !machine?.pipeline) return null;
      if (typeof machine.pipeline.orderFor !== 'function') return null;
      return machine.pipeline.orderFor(kind);
    } catch {
      return null;
    }
  }

  /**
   * Executa `fn()` com try/catch, devolvendo `null` em erro.
   * @param {Function} fn
   * @returns {any}
   * @private
   */
  _safeCall(fn) {
    try {
      return fn();
    } catch {
      return null;
    }
  }

  /**
   * Nunca lança. Se o recorder falhar, ignora.
   * @private
   */
  _safeRecord(kind, data) {
    try {
      this.recorder?.recordCustom?.(kind, data);
    } catch {
      // isolado
    }
  }

  /**
   * Nunca lança.
   * @private
   */
  _safeLog(level, module, msg, data) {
    try {
      this.logger?.[level]?.(module, msg, data);
    } catch {
      // isolado
    }
  }

  /**
   * @private
   */
  _now() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  /**
   * @private
   */
  _round(n) {
    return Math.round(Number(n) * 1000) / 1000;
  }

  /**
   * Retorna as 5 primeiras linhas do stack trace.
   * @private
   */
  _shortStack(err) {
    if (!err || typeof err.stack !== 'string') return null;
    return err.stack.split('\n').slice(0, 5).join(' | ');
  }
}