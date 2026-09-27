/**
 * @file pipeline-report.js
 * @module diagnostics
 * @description Relatório por comando: quais sistemas rodaram, em que ordem, com que resultado.
 * @imports — (nenhum)
 * @importedBy diagnostics/index (Fase 4+), systems/diagnostics-system (Fase 4)
 * @level 9
 *
 * Uso típico (pelo DiagnosticsSystem na Fase 4):
 *   const traceId = report.begin(traceId, line, kind);
 *   for (const sys of ranSystems) {
 *     report.recordSystem(traceId, sys.name, { ms, ok, mutated, halt, error });
 *   }
 *   report.end(traceId, finalResult, expectedPipelineOrder);
 *
 * API:
 *   begin / recordSystem / end
 *   get / getAll / getSlowest / getWithAnomalies
 *   stats / toJSON / clear
 */

const DEFAULT_SLOW_MS = 50;

export class PipelineReport {
  /**
   * @param {Object} [opts={}]
   * @param {number} [opts.maxReports=100]
   * @param {number} [opts.slowThresholdMs=50]
   * @param {boolean} [opts.enabled=true]
   */
  constructor({ maxReports = 100, slowThresholdMs = DEFAULT_SLOW_MS, enabled = true } = {}) {
    this.maxReports = Math.max(1, maxReports);
    this.slowThresholdMs = Math.max(1, slowThresholdMs);
    this.enabled = !!enabled;

    /** @type {Map<string, Object>} traceId → Report */
    this.reports = new Map();

    /** @type {Array<string>} */
    this._order = [];
  }

  // ── Ciclo de vida ───────────────────────────────────────────

  /**
   * Inicia um relatório para uma trace.
   * @param {string} traceId
   * @param {string} line
   * @param {string} kind
   * @returns {Object|null}
   */
  begin(traceId, line, kind) {
    if (!this.enabled) return null;
    if (!traceId) return null;

    const report = {
      traceId,
      line: String(line ?? ''),
      kind: kind ?? null,
      startedAt: Date.now(),
      endedAt: null,
      durationMs: null,
      systems: [],
      skipped: [],
      final: null,
      anomalies: [],
    };

    this.reports.set(traceId, report);
    this._order.push(traceId);
    this._evict();

    return report;
  }

  /**
   * Registra a execução de um sistema.
   * @param {string} traceId
   * @param {string} name
   * @param {Object} info — { ms, ok, mutated, halt, error }
   */
  recordSystem(traceId, name, info = {}) {
    const report = this.reports.get(traceId);
    if (!report) return;

    const ms = Number(info.ms) || 0;
    const entry = {
      name: String(name),
      ms: Math.round(ms * 1000) / 1000,
      ok: info.ok !== false,
      mutated: info.mutated === true,
      halt: info.halt === true,
      error: info.error ?? null,
    };

    report.systems.push(entry);

    if (entry.ok === false) {
      report.anomalies.push(`system ${name} returned ok:false`);
    }
    if (entry.halt === true) {
      report.anomalies.push(`system ${name} halted pipeline`);
    }
    if (entry.error) {
      report.anomalies.push(`system ${name} error: ${entry.error}`);
    }
    if (entry.ms > this.slowThresholdMs) {
      report.anomalies.push(`system ${name} slow (${entry.ms.toFixed(1)}ms > ${this.slowThresholdMs}ms)`);
    }
  }

  /**
   * Finaliza o relatório.
   * @param {string} traceId
   * @param {Object} finalResult — resultado final de machine.handleLine
   * @param {string[]} [expectedOrder] — ordem esperada de sistemas (para detectar skipped)
   */
  end(traceId, finalResult, expectedOrder = null) {
    const report = this.reports.get(traceId);
    if (!report) return;

    report.endedAt = Date.now();
    report.durationMs = report.endedAt - report.startedAt;
    report.final = {
      ok: finalResult?.ok !== false,
      mutated: finalResult?.mutated === true,
      halt: finalResult?.halt === true,
      error: finalResult?.error ?? null,
    };

    // Detecta sistemas esperados que não rodaram
    if (Array.isArray(expectedOrder) && expectedOrder.length > 0) {
      const ran = new Set(report.systems.map(s => s.name));
      const skipped = expectedOrder.filter(n => !ran.has(n));
      // Remove duplicatas de DiagnosticsSystem (aparece duas vezes)
      const uniqueSkipped = Array.from(new Set(skipped));
      report.skipped = uniqueSkipped;
      if (uniqueSkipped.length > 0) {
        report.anomalies.push(`systems skipped: ${uniqueSkipped.join(', ')}`);
      }
    }
  }

  // ── Consultas ───────────────────────────────────────────────

  /**
   * Retorna um relatório.
   * @param {string} traceId
   * @returns {Object|null}
   */
  get(traceId) {
    const r = this.reports.get(traceId);
    return r ? this._copy(r) : null;
  }

  /**
   * Todos os relatórios.
   * @returns {Array<Object>}
   */
  getAll() {
    return this._order.map(id => this.get(id)).filter(Boolean);
  }

  /**
   * N relatórios mais lentos.
   * @param {number} [n=10]
   * @returns {Array<Object>}
   */
  getSlowest(n = 10) {
    const sorted = this.getAll()
      .filter(r => r.durationMs !== null)
      .sort((a, b) => b.durationMs - a.durationMs);
    return sorted.slice(0, Math.max(1, n));
  }

  /**
   * Relatórios com anomalias.
   * @returns {Array<Object>}
   */
  getWithAnomalies() {
    return this.getAll().filter(r => r.anomalies.length > 0);
  }

  /**
   * Estatísticas.
   * @returns {Object}
   */
  stats() {
    const all = this.getAll();
    const withAnomalies = all.filter(r => r.anomalies.length > 0);
    const durations = all.map(r => r.durationMs).filter(d => typeof d === 'number');
    const avg = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;
    const max = durations.length > 0 ? Math.max(...durations) : 0;

    return {
      total: all.length,
      withAnomalies: withAnomalies.length,
      avgDurationMs: Math.round(avg * 1000) / 1000,
      maxDurationMs: max,
      slowThresholdMs: this.slowThresholdMs,
      maxReports: this.maxReports,
    };
  }

  /**
   * Serializa.
   * @returns {Object}
   */
  toJSON() {
    return {
      stats: this.stats(),
      reports: this.getAll(),
    };
  }

  // ── Controle ────────────────────────────────────────────────

  /**
   * Liga/desliga.
   * @param {boolean} v
   */
  setEnabled(v) {
    this.enabled = !!v;
  }

  /**
   * Define o threshold de lentidão.
   * @param {number} ms
   */
  setSlowThreshold(ms) {
    if (Number.isFinite(ms) && ms > 0) {
      this.slowThresholdMs = ms;
    }
  }

  /**
   * Limpa.
   */
  clear() {
    this.reports.clear();
    this._order = [];
  }

  /**
   * Destrói.
   */
  destroy() {
    this.clear();
    this.enabled = false;
  }

  // ── Internos ────────────────────────────────────────────────

  /**
   * @private
   */
  _copy(report) {
    return {
      traceId: report.traceId,
      line: report.line,
      kind: report.kind,
      startedAt: report.startedAt,
      endedAt: report.endedAt,
      durationMs: report.durationMs,
      systems: report.systems.map(s => ({ ...s })),
      skipped: [...report.skipped],
      final: report.final ? { ...report.final } : null,
      anomalies: [...report.anomalies],
    };
  }

  /**
   * @private
   */
  _evict() {
    while (this.reports.size > this.maxReports) {
      const oldestId = this._order.shift();
      this.reports.delete(oldestId);
    }
  }
}