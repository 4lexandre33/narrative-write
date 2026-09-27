/**
 * @file wire.js
 * @module diagnostics
 * @description Centraliza attach/start/unwire das classes de diagnóstico.
 * @imports — (nenhum)
 * @importedBy diagnostics/index
 * @level 9
 *
 * Responsabilidade única: pegar uma DiagnosticsSuite já instanciada (com
 * suas 15 classes internas prontas) e conectá-la ao Machine/World/Bus/Persist.
 *
 * A ordem importa. Este módulo garante:
 *   1. FaultInjector — anexa ao bus/machine primeiro (não envolve nada)
 *   2. Instrumentation — envolve handleLine + systems (com todas as deps)
 *   3. InvariantChecker — assina eventos do bus
 *   4. HealthProbes — inicia timer de 5s
 *   5. SnapshotDumper — guarda referências
 *   6. ContractGuard — define + aplica 4 contratos em métodos do World
 *   7. ReportBuilder — recebe todas as deps
 *   8. Logging por evento — 18 wires de logging no bus
 *
 * Reversão (`unwire()`) faz a ordem inversa e restaura todos os métodos.
 *
 * Uso dentro do DiagnosticsSuite:
 *   import { DiagnosticsWire } from './wire.js';
 *
 *   // no constructor:
 *   this._wire = new DiagnosticsWire(this);
 *
 *   // no install():
 *   const result = this._wire.wire({ machine, world, bus, persist });
 *   if (!result.ok) throw new Error(`[DiagnosticsSuite] wire falhou: ${result.error}`);
 *
 *   // no detach():
 *   this._wire.unwire();
 *
 * Segurança:
 *   - `wire()` é idempotente: segunda chamada devolve `{ ok: true, alreadyWired: true }`
 *   - Se falhar no meio, faz rollback parcial via `_safeUnwireAll()`
 *   - Cada attach é try/catch'ado individualmente (uma classe quebrada não derruba as outras)
 *   - `unwire()` é idempotente também
 */

export class DiagnosticsWire {
  /**
   * @param {Object} suite — DiagnosticsSuite já construída
   */
  constructor(suite) {
    if (!suite) {
      throw new Error('[DiagnosticsWire] suite obrigatória');
    }
    this.suite = suite;
    this._wired = false;
    this._wiredAt = null;
    /** @type {Array<Function>} */
    this._unwireFns = [];
  }

  // ══════════════════════════════════════════════════════════
  // Ciclo de vida
  // ══════════════════════════════════════════════════════════

  /**
   * Conecta toda a suíte ao Machine.
   *
   * @param {Object} deps
   * @param {Object} deps.machine
   * @param {Object} deps.world
   * @param {Object} deps.bus
   * @param {Object} [deps.persist] — PersistenceSystem (opcional)
   * @returns {{ ok:boolean, alreadyWired?:boolean, results?:Object, wiredAt?:number, error?:string }}
   */
  wire({ machine, world, bus, persist = null }) {
    if (this._wired) {
      return { ok: true, alreadyWired: true };
    }
    if (!machine || !world || !bus) {
      return { ok: false, error: 'machine, world e bus obrigatórios' };
    }

    const s = this.suite;
    const results = {
      faultInjector:   false,
      instrumentation: false,
      checker:         false,
      health:          false,
      snapshotDumper:  false,
      contracts:       { defined: 0, wrapped: 0 },
      reportBuilder:   false,
      loggingWires:    0,
    };

    try {
      // ── 1. FaultInjector (só anexa refs) ────────────────
      if (s.faultInjector) {
        try {
          if (typeof s.faultInjector.attach === 'function') {
            s.faultInjector.attach(bus, machine);
          } else {
            s.faultInjector.bus = bus;
            s.faultInjector.machine = machine;
          }
          results.faultInjector = true;
        } catch { /* isola */ }
      }

      // ── 2. Bus nas classes que usam wildcard ────────────
      if (s.contracts && !s.contracts.bus) s.contracts.bus = bus;
      if (s.health && !s.health.bus) s.health.bus = bus;

      // ── 3. Instrumentation ─────────────────────────────
      if (s.instrumentation) {
        try {
          s.instrumentation.instrumentMachine(machine);
          results.instrumentation = true;
        } catch { /* isola */ }
      }

      // ── 4. InvariantChecker ────────────────────────────
      if (s.checker) {
        try {
          s.checker.attach(bus, {
            machine,
            world,
            ids: machine.ids ?? null,
            links: machine.links ?? null,
          });
          results.checker = true;
        } catch { /* isola */ }
      }

      // ── 5. HealthProbes ────────────────────────────────
      if (s.health) {
        try {
          s.health.start({ machine, world, persist });
          results.health = true;
        } catch { /* isola */ }
      }

      // ── 6. SnapshotDumper ──────────────────────────────
      if (s.snapshotDumper) {
        try {
          s.snapshotDumper.attach({ machine, world, persist });
          results.snapshotDumper = true;
        } catch { /* isola */ }
      }

      // ── 7. ContractGuard: define + wrap ────────────────
      if (s.contracts && s.contracts.enabled) {
        results.contracts = this._defineAndWrapContracts(world);
      }

      // ── 8. ReportBuilder ───────────────────────────────
      if (s.reportBuilder) {
        try {
          s.reportBuilder.attach({
            machine,
            world,
            persist,
            recorder:       s.recorder,
            logger:         s.logger,
            tracer:         s.tracer,
            checker:        s.checker,
            contracts:      s.contracts,
            health:         s.health,
            expectations:   s.expectations,
            pipelineReport: s.pipelineReport,
            snapshotDumper: s.snapshotDumper,
            replayEngine:   s.replayEngine,
            rca:            s.rca,
          });
          results.reportBuilder = true;
        } catch { /* isola */ }
      }

      // ── 9. Logging por evento ──────────────────────────
      results.loggingWires = this._wireLogging(bus);

      this._wired = true;
      this._wiredAt = Date.now();

      return {
        ok: true,
        results,
        wiredAt: this._wiredAt,
      };
    } catch (err) {
      // Rollback parcial: tenta desfazer tudo que já foi feito
      this._safeUnwireAll();
      return {
        ok: false,
        error: err.message,
        results,
      };
    }
  }

  /**
   * Desconecta toda a suíte.
   * @returns {{ ok:boolean, alreadyUnwired?:boolean }}
   */
  unwire() {
    if (!this._wired) {
      return { ok: true, alreadyUnwired: true };
    }
    this._safeUnwireAll();
    this._wired = false;
    this._wiredAt = null;
    return { ok: true };
  }

  // ══════════════════════════════════════════════════════════
  // Consultas
  // ══════════════════════════════════════════════════════════

  /**
   * @returns {boolean}
   */
  isWired() {
    return this._wired;
  }

  /**
   * @returns {number|null} timestamp do último wire bem-sucedido
   */
  wiredAt() {
    return this._wiredAt;
  }

  /**
   * Estatísticas internas.
   * @returns {Object}
   */
  stats() {
    return {
      wired: this._wired,
      wiredAt: this._wiredAt,
      unwireFnCount: this._unwireFns.length,
    };
  }

  // ══════════════════════════════════════════════════════════
  // Internos — contratos
  // ══════════════════════════════════════════════════════════

  /**
   * Define e aplica os 4 contratos default sobre o World.
   * @param {Object} world
   * @returns {{ defined:number, wrapped:number }}
   * @private
   */
  _defineAndWrapContracts(world) {
    const guard = this.suite.contracts;
    if (!guard || !world) return { defined: 0, wrapped: 0 };

    const specs = [
      {
        name: 'world.createEntity',
        method: 'createEntity',
        pre: (args) => args && args[0] !== null && typeof args[0] === 'object',
        post: (result) => typeof result === 'string' && result.length > 0,
        description: 'createEntity deve devolver id não vazio',
      },
      {
        name: 'world.destroyEntity',
        method: 'destroyEntity',
        pre: (args) => typeof args?.[0] === 'string' && args[0].length > 0,
        post: (result) => typeof result === 'boolean',
        description: 'destroyEntity deve devolver boolean',
      },
      {
        name: 'world.addComponent',
        method: 'addComponent',
        pre: (args) =>
          typeof args?.[0] === 'string' && args[0].length > 0 &&
          typeof args?.[1] === 'string' && args[1].length > 0,
        post: null,
        description: 'addComponent precisa id e nome válidos',
      },
      {
        name: 'world.set',
        method: 'set',
        pre: (args) =>
          typeof args?.[0] === 'string' && args[0].length > 0 &&
          typeof args?.[1] === 'string' && args[1].length > 0,
        post: null,
        description: 'world.set precisa id e nome válidos',
      },
    ];

    let defined = 0;
    let wrapped = 0;

    for (const spec of specs) {
      try {
        guard.define(spec.name, {
          pre: spec.pre,
          post: spec.post,
          description: spec.description,
        });
        defined++;
      } catch { /* isola */ }

      try {
        if (typeof world[spec.method] === 'function') {
          guard.wrap(world, spec.method, spec.name);
          wrapped++;
        }
      } catch { /* isola */ }
    }

    return { defined, wrapped };
  }

  // ══════════════════════════════════════════════════════════
  // Internos — logging
  // ══════════════════════════════════════════════════════════

  /**
   * Assina 18 eventos do bus, roteando para o StructuredLogger.
   * @param {Object} bus
   * @returns {number} — quantidade de wires efetivados
   * @private
   */
  _wireLogging(bus) {
    const s = this.suite;
    if (!bus || !s.logger) return 0;

    const specs = [
      // info
      ['boot:complete',              'info',  'boot completo'],
      ['machine:reset',              'info',  'machine reset'],
      ['machine:restored',           'info',  'machine restaurado'],
      ['world:cleared',              'info',  'world limpo'],
      ['links:pruned',               'info',  'links podados'],
      ['stale:propagated',           'info',  'stale propagado'],
      ['export:ready',               'info',  'export pronto'],
      ['rule:fired',                 'info',  'regra disparou'],

      // warn
      ['rule:overflow',              'warn',  'rule overflow'],
      ['rule:cycle',                 'warn',  'ciclo de regra detectado'],
      ['validation:warnings',        'warn',  'warnings de validação'],
      ['validation:soft-fail',       'warn',  'validação soft-fail'],
      ['link-index:drift',           'warn',  'drift no link-index'],
      ['pipeline:system-missing',    'warn',  'sistema ausente no pipeline'],
      ['diag:contract:violated',     'warn',  'contrato violado'],
      ['diag:health:anomaly',        'warn',  'anomalia de saúde'],

      // error
      ['persist:failed',             'error', 'falha ao persistir'],
      ['rule:error',                 'error', 'erro em regra'],
    ];

    let count = 0;
    for (const [evt, level, msg] of specs) {
      try {
        const unsub = bus.on(evt, (payload) => {
          try {
            s.logger[level]('events', msg, payload);
          } catch { /* isola */ }
        });
        this._unwireFns.push(unsub);
        count++;
      } catch { /* isola */ }
    }

    return count;
  }

  // ══════════════════════════════════════════════════════════
  // Internos — reversão
  // ══════════════════════════════════════════════════════════

  /**
   * Desfaz tudo na ordem inversa ao wire.
   * Nunca lança — cada passo é isolado.
   * @private
   */
  _safeUnwireAll() {
    const s = this.suite;

    // ── 1. Logging wires primeiro (para não logar o desmonte) ──
    for (const fn of this._unwireFns) {
      try { fn(); } catch { /* isola */ }
    }
    this._unwireFns = [];

    // ── 2. Contracts (restaura métodos do World) ────────
    try {
      if (s.contracts && typeof s.contracts.unwrapAll === 'function') {
        s.contracts.unwrapAll();
      }
    } catch { /* isola */ }

    // ── 3. Instrumentation (restaura handleLine + systems) ──
    try {
      if (s.instrumentation && typeof s.instrumentation.uninstrumentMachine === 'function') {
        s.instrumentation.uninstrumentMachine();
      }
    } catch { /* isola */ }

    // ── 4. HealthProbes (para timer) ────────────────────
    try {
      if (s.health && typeof s.health.stop === 'function') {
        s.health.stop();
      }
    } catch { /* isola */ }

    // ── 5. InvariantChecker ─────────────────────────────
    try {
      if (s.checker && typeof s.checker.detach === 'function') {
        s.checker.detach();
      }
    } catch { /* isola */ }

    // ── 6. SnapshotDumper ───────────────────────────────
    try {
      if (s.snapshotDumper && typeof s.snapshotDumper.detach === 'function') {
        s.snapshotDumper.detach();
      }
    } catch { /* isola */ }

    // ── 7. FaultInjector ────────────────────────────────
    try {
      if (s.faultInjector && typeof s.faultInjector.detach === 'function') {
        s.faultInjector.detach();
      }
    } catch { /* isola */ }

    // ── 8. ReportBuilder ────────────────────────────────
    try {
      if (s.reportBuilder && typeof s.reportBuilder.detach === 'function') {
        s.reportBuilder.detach();
      }
    } catch { /* isola */ }
  }
}