/**
 * @file health-probes.js
 * @module diagnostics
 * @description Sondas de saúde rodando em intervalos, com histórico e detecção de anomalias.
 * @imports — (nenhum)
 * @importedBy diagnostics/index (Fase 4+), systems/diagnostics-system (Fase 4)
 * @level 9
 *
 * Sondas:
 *   - memory: performance.memory.usedJSHeapSize
 *   - entities: world.entities.size
 *   - tick: machine.state.tickNumber
 *   - busHandlers: bus.size()
 *   - persistFreshness: Date.now() - persist.lastFlushAt
 *
 * Anomalias detectadas:
 *   - entidades caíram > 50% em 1 s
 *   - bus handlers mudaram > 200 em 1 s
 *   - memória cresceu > 50 MB em 60 s
 *   - persist sem flush há > 5 min
 */

const DEFAULT_INTERVAL_MS = 5_000;
const MAX_HISTORY = 720; // 1 hora a 5s

export class HealthProbes {
  /**
   * @param {Object} [opts={}]
   * @param {number} [opts.intervalMs=5000]
   * @param {number} [opts.maxHistory=720]
   * @param {boolean} [opts.enabled=true]
   * @param {Object} [opts.bus]
   */
  constructor({ intervalMs = DEFAULT_INTERVAL_MS, maxHistory = MAX_HISTORY, enabled = true, bus = null } = {}) {
    this.intervalMs = Math.max(500, intervalMs);
    this.maxHistory = Math.max(10, maxHistory);
    this.enabled = !!enabled;
    this.bus = bus;

    /** @type {Array<Object>} */
    this.history = [];

    /** @type {Array<Object>} */
    this.anomalies = [];

    this._timer = null;
    this._machine = null;
    this._world = null;
    this._persist = null;
  }

  // ── Ciclo de vida ───────────────────────────────────────────

  /**
   * Inicia as sondas.
   * @param {Object} deps
   * @param {Object} deps.machine
   * @param {Object} deps.world
   * @param {Object} [deps.persist]
   */
  start({ machine, world, persist = null } = {}) {
    this._machine = machine;
    this._world = world;
    this._persist = persist;

    if (!this.enabled) return this;

    this._probe();
    this._timer = setInterval(() => {
      try { this._probe(); } catch { /* isola */ }
    }, this.intervalMs);

    return this;
  }

  /**
   * Para as sondas.
   */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    return this;
  }

  // ── Sondagem ────────────────────────────────────────────────

  /**
   * Executa uma sondagem manual.
   * @returns {Object} snapshot
   */
  probe() {
    return this._probe();
  }

  /** @private */
  _probe() {
    const snap = this._capture();
    this.history.push(snap);
    while (this.history.length > this.maxHistory) this.history.shift();

    const detected = this._detectAnomalies(snap);
    for (const a of detected) {
      this.anomalies.push(a);
      this._emit('diag:health:anomaly', a);
    }
    while (this.anomalies.length > this.maxHistory) this.anomalies.shift();

    return snap;
  }

  /** @private */
  _capture() {
    const mem = this._readMemory();
    return {
      ts: Date.now(),
      memoryBytes: mem,
      entities: this._world?.entities?.size ?? null,
      tick: this._machine?.state?.tickNumber ?? null,
      tickLabel: this._machine?.state?.tick ?? null,
      busHandlers: this._readBusSize(),
      persistAgeMs: this._readPersistAge(),
    };
  }

  // ── Detecção de anomalias ───────────────────────────────────

  /** @private */
  _detectAnomalies(snap) {
    const out = [];
    const prev = this.history.length >= 2 ? this.history[this.history.length - 2] : null;
    if (!prev) return out;

    // Entidades caíram > 50% em 1 s
    if (snap.entities !== null && prev.entities !== null) {
      const dtMs = snap.ts - prev.ts;
      if (dtMs <= 2_000 && prev.entities > 10) {
        const drop = prev.entities - snap.entities;
        if (drop > prev.entities * 0.5) {
          out.push({
            code: 'ENTITIES_DROPPED',
            severity: 'warning',
            message: `entidades caíram de ${prev.entities} para ${snap.entities} em ${dtMs}ms`,
            context: { before: prev.entities, after: snap.entities, dtMs },
          });
        }
      }
    }

    // Bus handlers mudaram drasticamente em 1 s
    if (snap.busHandlers !== null && prev.busHandlers !== null) {
      const dtMs = snap.ts - prev.ts;
      if (dtMs <= 2_000) {
        const delta = Math.abs(snap.busHandlers - prev.busHandlers);
        if (delta > 200) {
          out.push({
            code: 'BUS_HANDLERS_SWING',
            severity: 'warning',
            message: `handlers do bus oscilaram ${delta} em ${dtMs}ms`,
            context: { before: prev.busHandlers, after: snap.busHandlers, delta, dtMs },
          });
        }
      }
    }

    // Persist sem flush > 5 min
    if (snap.persistAgeMs !== null && snap.persistAgeMs > 5 * 60_000) {
      out.push({
        code: 'PERSIST_STALE',
        severity: 'warning',
        message: `último flush há ${Math.round(snap.persistAgeMs / 1000)}s`,
        context: { persistAgeMs: snap.persistAgeMs },
      });
    }

    // Memória cresceu > 50 MB nos últimos 60 s
    if (snap.memoryBytes !== null) {
      const cutoff = snap.ts - 60_000;
      const older = this.history.find(h => h.ts >= cutoff && h.memoryBytes !== null);
      if (older && older.memoryBytes !== null) {
        const growth = snap.memoryBytes - older.memoryBytes;
        if (growth > 50 * 1024 * 1024) {
          out.push({
            code: 'MEMORY_GROWTH',
            severity: 'warning',
            message: `memória cresceu ${(growth / 1024 / 1024).toFixed(1)} MB em 60s`,
            context: { before: older.memoryBytes, after: snap.memoryBytes, growthBytes: growth },
          });
        }
      }
    }

    return out;
  }

  // ── Consultas ───────────────────────────────────────────────

  /**
   * Snapshot atual.
   * @returns {Object|null}
   */
  current() {
    return this.history.length ? { ...this.history[this.history.length - 1] } : null;
  }

  /**
   * Histórico (cópia).
   * @returns {Array<Object>}
   */
  samples() {
    return this.history.map(h => ({ ...h }));
  }

  /**
   * Anomalias detectadas (mais recentes primeiro).
   * @param {number} [limit]
   * @returns {Array<Object>}
   */
  detectedAnomalies(limit = null) {
    const out = this.anomalies.slice().reverse();
    if (Number.isFinite(limit) && limit > 0) return out.slice(0, limit);
    return out;
  }

  /**
   * Estatísticas.
   * @returns {Object}
   */
  stats() {
    const cur = this.current();
    return {
      samples: this.history.length,
      maxHistory: this.maxHistory,
      anomalies: this.anomalies.length,
      intervalMs: this.intervalMs,
      running: this._timer !== null,
      lastSample: cur,
    };
  }

  /**
   * Serializa.
   * @returns {Object}
   */
  toJSON() {
    return {
      stats: this.stats(),
      samples: this.samples(),
      anomalies: this.detectedAnomalies(),
    };
  }

  // ── Controle ────────────────────────────────────────────────

  setEnabled(v) { this.enabled = !!v; }

  clear() {
    this.history = [];
    this.anomalies = [];
  }

  destroy() {
    this.stop();
    this.clear();
    this._machine = null;
    this._world = null;
    this._persist = null;
  }

  // ── Internos ────────────────────────────────────────────────

  /** @private */
  _readMemory() {
    try {
      if (typeof performance !== 'undefined' && performance.memory) {
        return performance.memory.usedJSHeapSize ?? null;
      }
    } catch { /* noop */ }
    return null;
  }

  /** @private */
  _readBusSize() {
    try {
      return this._machine?.bus?.size?.() ?? null;
    } catch {
      return null;
    }
  }

  /** @private */
  _readPersistAge() {
    try {
      const last = this._persist?.lastFlushAt;
      if (typeof last !== 'number') return null;
      return Date.now() - last;
    } catch {
      return null;
    }
  }

  /** @private */
  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') {
      try { this.bus.emit(event, payload); } catch { /* isola */ }
    }
  }
}