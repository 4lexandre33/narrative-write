/**
 * @file fault-injector.js
 * @module diagnostics
 * @description Injeta falhas controladas para testar robustez (modo dev).
 * @imports core/constants
 * @importedBy diagnostics/index (Fase 6+), systems/diagnostics-system (Fase 6+)
 * @level 9
 *
 * Tipos de injeção:
 *   slow     → adiciona delay em system.run
 *   throw    → força exceção em system.run
 *   drop     → suprime emissão de eventos do bus
 *   corrupt  → corrompe um componente após addComponent
 *   stale    → força marcação Stale indevida
 *   missing  → simula sistema ausente no pipeline
 *
 * Uso:
 *   const inj = new FaultInjector({ bus, machine });
 *   inj.inject('slow', { target: 'MutationSystem', ms: 300 });
 *   inj.inject('throw', { target: 'RuleSystem' });
 *   inj.list();
 *   inj.eject('slow');
 *   inj.ejectAll();
 *
 * Segurança:
 *   - Cada injeção tem TTL (default 30s) — auto-remove.
 *   - `dev` mode obrigatório: ignora se não estiver em `dev`.
 *   - Cada injeção é reversível (unwrap).
 */

import { COMPONENT_NAMES } from '../core/constants.js';

const DEFAULT_TTL_MS = 30_000;
const MAX_ACTIVE = 10;

const INJECTION_KINDS = Object.freeze(['slow', 'throw', 'drop', 'corrupt', 'stale', 'missing']);

export class FaultInjector {
  /**
   * @param {Object} [opts={}]
   * @param {Object} [opts.bus]
   * @param {Object} [opts.machine]
   * @param {number} [opts.defaultTtlMs=30000]
   * @param {boolean} [opts.allowInProd=false]
   */
  constructor({
    bus = null,
    machine = null,
    defaultTtlMs = DEFAULT_TTL_MS,
    allowInProd = false,
  } = {}) {
    this.bus = bus;
    this.machine = machine;
    this.defaultTtlMs = Math.max(1000, defaultTtlMs);
    this.allowInProd = !!allowInProd;

    /** @type {Map<string, Object>} id → injection */
    this.active = new Map();

    /** @type {Array<Object>} */
    this.log = [];

    this._idCounter = 0;
  }

  // ── Anexar ──────────────────────────────────────────────────

  /**
   * Anexa bus e machine.
   * @param {Object} bus
   * @param {Object} machine
   * @returns {FaultInjector}
   */
  attach(bus, machine = null) {
    this.bus = bus || this.bus;
    this.machine = machine || this.machine;
    return this;
  }

  // ── Diagnóstico de ambiente ─────────────────────────────────

  /**
   * @returns {boolean}
   */
  isDevMode() {
    if (this.allowInProd) return true;
    if (typeof window === 'undefined') return false;
    try {
      const app = window.__NarrativeApp;
      const mode = app?.diag?.getMode?.();
      return mode === 'dev';
    } catch {
      return false;
    }
  }

  // ── API principal ───────────────────────────────────────────

  /**
   * Injeta uma falha.
   * @param {'slow'|'throw'|'drop'|'corrupt'|'stale'|'missing'} kind
   * @param {Object} [opts={}]
   * @param {string} [opts.target] — nome do sistema ou do evento
   * @param {number} [opts.ms=300] — para 'slow'
   * @param {number} [opts.ttlMs] — tempo de vida
   * @param {number} [opts.probability=1] — 0..1
   * @param {Object} [opts.payload] — para 'corrupt'
   * @returns {Object} injection ou { ok: false, error }
   */
  inject(kind, opts = {}) {
    if (!INJECTION_KINDS.includes(kind)) {
      return { ok: false, error: `kind inválido: ${kind}` };
    }
    if (!this.isDevMode()) {
      return { ok: false, error: 'fault injection requer modo dev' };
    }
    if (this.active.size >= MAX_ACTIVE) {
      return { ok: false, error: `máximo de ${MAX_ACTIVE} injeções simultâneas` };
    }

    const id = this._nextId(kind);
    const ttlMs = Math.max(1000, Number(opts.ttlMs) || this.defaultTtlMs);

    const injection = {
      id,
      kind,
      target: opts.target ?? null,
      params: { ...opts, ttlMs },
      startedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      removeFn: null,
      timer: null,
    };

    const setup = this._setupInjection(injection);
    if (setup.ok === false) {
      return setup;
    }
    injection.removeFn = setup.removeFn ?? null;

    injection.timer = setTimeout(() => {
      try { this.eject(id); } catch { /* isola */ }
    }, ttlMs);

    this.active.set(id, injection);
    this._recordLog('inject', injection);

    return {
      ok: true,
      id,
      kind,
      target: injection.target,
      expiresAt: injection.expiresAt,
    };
  }

  /**
   * Remove uma injeção.
   * @param {string} id
   * @returns {boolean}
   */
  eject(id) {
    const inj = this.active.get(id);
    if (!inj) return false;

    try { inj.removeFn?.(); } catch { /* isola */ }
    if (inj.timer) clearTimeout(inj.timer);

    this.active.delete(id);
    this._recordLog('eject', inj);
    return true;
  }

  /**
   * Remove todas as injeções.
   * @returns {number}
   */
  ejectAll() {
    let n = 0;
    for (const id of Array.from(this.active.keys())) {
      if (this.eject(id)) n++;
    }
    return n;
  }

  /**
   * Lista as injeções ativas.
   * @returns {Array<Object>}
   */
  list() {
    const now = Date.now();
    return Array.from(this.active.values()).map(i => ({
      id: i.id,
      kind: i.kind,
      target: i.target,
      startedAt: i.startedAt,
      expiresAt: i.expiresAt,
      remainingMs: Math.max(0, i.expiresAt - now),
      params: { ...i.params },
    }));
  }

  /**
   * Histórico de injeções/ejeções.
   * @param {number} [limit=50]
   * @returns {Array<Object>}
   */
  history(limit = 50) {
    const out = this.log.slice(-Math.max(1, limit));
    return out.map(e => ({ ...e, params: e.params ? { ...e.params } : null }));
  }

  /**
   * Estatísticas.
   * @returns {Object}
   */
  stats() {
    return {
      active: this.active.size,
      totalInjections: this.log.filter(e => e.action === 'inject').length,
      totalEjections: this.log.filter(e => e.action === 'eject').length,
      kinds: INJECTION_KINDS,
      devMode: this.isDevMode(),
      maxActive: MAX_ACTIVE,
      defaultTtlMs: this.defaultTtlMs,
    };
  }

  /**
   * Destrói (remove tudo).
   */
  destroy() {
    this.ejectAll();
    this.log = [];
    this.bus = null;
    this.machine = null;
  }

  // ── Setup por tipo ──────────────────────────────────────────

  /**
   * @private
   */
  _setupInjection(injection) {
    switch (injection.kind) {
      case 'slow':     return this._setupSlow(injection);
      case 'throw':    return this._setupThrow(injection);
      case 'drop':     return this._setupDrop(injection);
      case 'corrupt':  return this._setupCorrupt(injection);
      case 'stale':    return this._setupStale(injection);
      case 'missing':  return this._setupMissing(injection);
      default:         return { ok: false, error: `kind não implementado: ${injection.kind}` };
    }
  }

  /**
   * Envolve system.run para adicionar delay.
   * @private
   */
  _setupSlow({ target, params }) {
    const systems = this._systemsToPatch(target);
    if (systems.length === 0) {
      return { ok: false, error: `nenhum sistema para "slow"${target ? ` (${target})` : ''}` };
    }

    const ms = Math.max(1, Number(params.ms) || 300);
    const probability = this._clampProb(params.probability);

    const restores = [];
    for (const [name, system] of systems) {
      const original = system.run.bind(system);
      system.run = function slowRun(...args) {
        if (Math.random() < probability) {
          const until = Date.now() + ms;
          while (Date.now() < until) { /* busy wait — intencional */ }
        }
        return original(...args);
      };
      restores.push(() => { system.run = original; });
    }

    return {
      ok: true,
      removeFn: () => { for (const r of restores) r(); },
    };
  }

  /**
   * Envolve system.run para lançar.
   * @private
   */
  _setupThrow({ target, params }) {
    const systems = this._systemsToPatch(target);
    if (systems.length === 0) {
      return { ok: false, error: `nenhum sistema para "throw"` };
    }

    const probability = this._clampProb(params.probability);
    const message = String(params.message || '[FaultInjector] throw forçado');

    const restores = [];
    for (const [name, system] of systems) {
      const original = system.run.bind(system);
      system.run = function throwRun(...args) {
        if (Math.random() < probability) {
          throw new Error(`${message} (em ${name})`);
        }
        return original(...args);
      };
      restores.push(() => { system.run = original; });
    }

    return {
      ok: true,
      removeFn: () => { for (const r of restores) r(); },
    };
  }

  /**
   * Intercepta bus.emit e suprime o evento alvo.
   * @private
   */
  _setupDrop({ target, params }) {
    if (!this.bus || typeof this.bus.emit !== 'function') {
      return { ok: false, error: 'bus indisponível para "drop"' };
    }
    if (!target) {
      return { ok: false, error: '"drop" requer target (nome do evento)' };
    }

    const probability = this._clampProb(params.probability);
    const bus = this.bus;
    const original = bus.emit.bind(bus);
    let dropped = 0;

    bus.emit = function dropEmit(event, payload) {
      if (event === target && Math.random() < probability) {
        dropped++;
        return;
      }
      return original(event, payload);
    };

    return {
      ok: true,
      removeFn: () => { bus.emit = original; },
      getDropped: () => dropped,
    };
  }

  /**
   * Corrompe um componente após `component:added`.
   * @private
   */
  _setupCorrupt({ params }) {
    if (!this.bus) {
      return { ok: false, error: 'bus indisponível para "corrupt"' };
    }
    const component = params.component || COMPONENT_NAMES.STATS;
    const probability = this._clampProb(params.probability);
    const payloadPatch = params.payload ?? { __injected: true };

    const unsub = this.bus.on('component:added', ({ id, name }) => {
      if (name !== component) return;
      if (Math.random() >= probability) return;
      try {
        const world = this.machine?.world;
        if (!world) return;
        const current = world.get(id, name);
        if (!current) return;
        world.set(id, name, payloadPatch);
      } catch { /* isola */ }
    });

    return {
      ok: true,
      removeFn: () => { try { unsub(); } catch { /* noqa */ } },
    };
  }

  /**
   * Marca entidades como Stale após entity:created.
   * @private
   */
  _setupStale({ params }) {
    if (!this.bus) {
      return { ok: false, error: 'bus indisponível para "stale"' };
    }
    const probability = this._clampProb(params.probability);
    const limit = Math.max(1, Number(params.limit) || 5);
    let marked = 0;

    const unsub = this.bus.on('entity:created', ({ id }) => {
      if (Math.random() >= probability) return;
      if (marked >= limit) return;
      try {
        const world = this.machine?.world;
        if (!world) return;
        if (world.has(id, COMPONENT_NAMES.STALE)) return;
        world.addComponent(id, COMPONENT_NAMES.STALE, {
          value: true,
          at: this.machine?.getTick?.() ?? 'T0',
          cause: '[FaultInjector] stale',
        });
        marked++;
      } catch { /* isola */ }
    });

    return {
      ok: true,
      removeFn: () => { try { unsub(); } catch { /* noqa */ } },
    };
  }

  /**
   * Remove um sistema temporariamente do machine.
   * @private
   */
  _setupMissing({ target }) {
    if (!this.machine || !target) {
      return { ok: false, error: '"missing" requer machine + target' };
    }
    const systems = this.machine.systems;
    if (!systems || !systems.has(target)) {
      return { ok: false, error: `sistema não encontrado: ${target}` };
    }

    const original = systems.get(target);
    systems.delete(target);

    return {
      ok: true,
      removeFn: () => { if (!systems.has(target)) systems.set(target, original); },
    };
  }

  // ── Helpers ─────────────────────────────────────────────────

  /**
   * @private
   */
  _systemsToPatch(target) {
    if (!this.machine || !this.machine.systems) return [];
    if (target) {
      const s = this.machine.systems.get(target);
      return s ? [[target, s]] : [];
    }
    return Array.from(this.machine.systems.entries());
  }

  /**
   * @private
   */
  _clampProb(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 1;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  /**
   * @private
   */
  _nextId(kind) {
    this._idCounter++;
    const t = Date.now().toString(36);
    return `inj-${kind}-${this._idCounter}-${t}`;
  }

  /**
   * @private
   */
  _recordLog(action, injection) {
    this.log.push({
      action,
      id: injection.id,
      kind: injection.kind,
      target: injection.target,
      ts: Date.now(),
      params: { ...injection.params },
    });
    if (this.log.length > 200) this.log.shift();
  }

  /**
   * Kinds válidos.
   * @returns {string[]}
   */
  static kinds() {
    return [...INJECTION_KINDS];
  }
}