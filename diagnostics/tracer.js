/**
 * @file tracer.js
 * @module diagnostics
 * @description Árvore de spans hierárquicos (estilo OpenTelemetry simplificado).
 * @imports — (nenhum)
 * @importedBy diagnostics/index (Fase 4+), systems/diagnostics-system (Fase 4)
 * @level 9
 *
 * Modelo:
 *   Trace  = uma execução de handleLine (ou operação de alto nível)
 *   Span   = uma operação dentro da trace (ex: system.run('ParseSystem'))
 *
 * Hierarquia:
 *   trace
 *     └─ rootSpan
 *          ├─ childSpan
 *          │    └─ grandchildSpan
 *          └─ childSpan
 *
 * API:
 *   startTrace(name, attrs) → traceId
 *   startSpan(traceId, name, attrs, parentId?) → spanId
 *   endSpan(spanId, attrs?)
 *   recordException(spanId, error)
 *   addEvent(spanId, name, attrs)
 *
 * Consultas:
 *   getTrace(traceId) / getSpan(spanId) / getTree(traceId)
 *   getRecentTraces(n) / getSpansOfTrace(traceId)
 *   stats() / toJSON() / clear()
 */

/**
 * Gera um id curto e único.
 * @param {string} prefix
 * @returns {string}
 * @private
 */
function genId(prefix) {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${t}${r}`;
}

/**
 * Timestamp monotônico em ms.
 * @returns {number}
 * @private
 */
function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export class Tracer {
  /**
   * @param {Object} [opts={}]
   * @param {number} [opts.maxTraces=100] — número máximo de traces no ring buffer
   * @param {boolean} [opts.enabled=true]
   */
  constructor({ maxTraces = 100, enabled = true } = {}) {
    this.maxTraces = Math.max(1, maxTraces);
    this.enabled = !!enabled;

    /** @type {Map<string, Object>} traceId → TraceMeta */
    this.traces = new Map();

    /** @type {Map<string, Object>} spanId → Span */
    this.spans = new Map();

    /** @type {Array<string>} ordem de inserção dos traceIds */
    this._traceOrder = [];

    /** @type {Object|null} rastreia a última trace aberta */
    this._activeTraceId = null;

    this._counter = 0;
  }

  // ── Ciclo de vida da trace ──────────────────────────────────

  /**
   * Inicia uma nova trace.
   * @param {string} name
   * @param {Object} [attrs={}]
   * @returns {string} traceId
   */
  startTrace(name, attrs = {}) {
    if (!this.enabled) return '';

    const id = genId('tr');
    const trace = {
      id,
      name: String(name || 'trace'),
      startTs: now(),
      endTs: null,
      durationMs: null,
      rootSpanId: null,
      spanIds: [],
      attrs: { ...attrs },
    };

    this.traces.set(id, trace);
    this._traceOrder.push(id);
    this._activeTraceId = id;
    this._evict();

    return id;
  }

  /**
   * Finaliza uma trace.
   * @param {string} traceId
   * @param {Object} [attrs={}]
   * @returns {Object|null}
   */
  endTrace(traceId, attrs = {}) {
    const trace = this.traces.get(traceId);
    if (!trace) return null;

    trace.endTs = now();
    trace.durationMs = this._round(trace.endTs - trace.startTs);
    Object.assign(trace.attrs, attrs);

    if (this._activeTraceId === traceId) {
      this._activeTraceId = null;
    }
    return trace;
  }

  // ── Ciclo de vida do span ───────────────────────────────────

  /**
   * Inicia um novo span.
   * @param {string} traceId
   * @param {string} name
   * @param {Object} [attrs={}]
   * @param {string} [parentId] — se omitido, usa o último span aberto na trace
   * @returns {string} spanId
   */
  startSpan(traceId, name, attrs = {}, parentId = undefined) {
    if (!this.enabled) return '';

    const trace = this.traces.get(traceId);
    if (!trace) return '';

    let resolvedParent = parentId;
    if (resolvedParent === undefined) {
      // Usa o span mais recente que ainda está aberto
      for (let i = trace.spanIds.length - 1; i >= 0; i--) {
        const candidate = this.spans.get(trace.spanIds[i]);
        if (candidate && candidate.endTs === null) {
          resolvedParent = candidate.id;
          break;
        }
      }
      if (resolvedParent === undefined) resolvedParent = null;
    }

    const id = genId('sp');
    const span = {
      id,
      traceId,
      parentId: resolvedParent,
      name: String(name || 'span'),
      startTs: now(),
      endTs: null,
      durationMs: null,
      attrs: { ...attrs },
      events: [],
      exceptions: [],
      children: [],
    };

    this.spans.set(id, span);
    trace.spanIds.push(id);

    if (span.parentId === null) {
      if (trace.rootSpanId === null) {
        trace.rootSpanId = id;
      }
    } else {
      const parent = this.spans.get(span.parentId);
      if (parent) parent.children.push(id);
    }

    this._counter++;
    return id;
  }

  /**
   * Finaliza um span.
   * @param {string} spanId
   * @param {Object} [attrs={}]
   * @returns {Object|null}
   */
  endSpan(spanId, attrs = {}) {
    const span = this.spans.get(spanId);
    if (!span) return null;
    if (span.endTs !== null) return span;

    span.endTs = now();
    span.durationMs = this._round(span.endTs - span.startTs);
    Object.assign(span.attrs, attrs);
    return span;
  }

  /**
   * Registra uma exceção num span.
   * @param {string} spanId
   * @param {Error|Object|string} error
   * @returns {Object|null}
   */
  recordException(spanId, error) {
    const span = this.spans.get(spanId);
    if (!span) return null;

    const entry = {
      ts: now(),
      message: String(error?.message ?? error ?? 'erro desconhecido'),
      name: String(error?.name ?? 'Error'),
      stack: typeof error?.stack === 'string'
        ? error.stack.split('\n').slice(0, 6).join(' | ')
        : null,
    };
    span.exceptions.push(entry);
    return entry;
  }

  /**
   * Adiciona um evento a um span.
   * @param {string} spanId
   * @param {string} name
   * @param {Object} [attrs={}]
   * @returns {Object|null}
   */
  addEvent(spanId, name, attrs = {}) {
    const span = this.spans.get(spanId);
    if (!span) return null;

    const entry = {
      ts: now(),
      name: String(name),
      attrs: { ...attrs },
    };
    span.events.push(entry);
    return entry;
  }

  // ── Consultas ───────────────────────────────────────────────

  /**
   * Retorna metadados de uma trace.
   * @param {string} traceId
   * @returns {Object|null}
   */
  getTrace(traceId) {
    const trace = this.traces.get(traceId);
    return trace ? { ...trace, spanIds: [...trace.spanIds], attrs: { ...trace.attrs } } : null;
  }

  /**
   * Retorna um span.
   * @param {string} spanId
   * @returns {Object|null}
   */
  getSpan(spanId) {
    const span = this.spans.get(spanId);
    return span ? this._copySpan(span) : null;
  }

  /**
   * Retorna todos os spans de uma trace.
   * @param {string} traceId
   * @returns {Array<Object>}
   */
  getSpansOfTrace(traceId) {
    const trace = this.traces.get(traceId);
    if (!trace) return [];
    return trace.spanIds
      .map(id => this.spans.get(id))
      .filter(Boolean)
      .map(s => this._copySpan(s));
  }

  /**
   * Retorna a árvore hierárquica de uma trace.
   * @param {string} traceId
   * @returns {Object|null}
   */
  getTree(traceId) {
    const trace = this.traces.get(traceId);
    if (!trace) return null;

    const root = trace.rootSpanId ? this.spans.get(trace.rootSpanId) : null;
    return {
      trace: this.getTrace(traceId),
      root: root ? this._buildTreeNode(root) : null,
    };
  }

  /**
   * Últimas N traces.
   * @param {number} [n=10]
   * @returns {Array<Object>}
   */
  getRecentTraces(n = 10) {
    const k = Math.max(1, Math.floor(n));
    const ids = this._traceOrder.slice(-k);
    return ids.map(id => this.getTrace(id)).filter(Boolean);
  }

  /**
   * Todas as traces.
   * @returns {Array<Object>}
   */
  getAllTraces() {
    return this._traceOrder.map(id => this.getTrace(id)).filter(Boolean);
  }

  /**
   * Estatísticas resumidas.
   * @returns {{ traces:number, spans:number, maxTraces:number, activeTraceId:string|null, uptimeMs:number }}
   */
  stats() {
    return {
      traces: this.traces.size,
      spans: this.spans.size,
      maxTraces: this.maxTraces,
      activeTraceId: this._activeTraceId,
      uptimeMs: 0,
    };
  }

  /**
   * Retorna a trace atualmente aberta.
   * @returns {string|null}
   */
  activeTraceId() {
    return this._activeTraceId;
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
   * Limpa tudo.
   */
  clear() {
    this.traces.clear();
    this.spans.clear();
    this._traceOrder = [];
    this._activeTraceId = null;
    this._counter = 0;
  }

  /**
   * Destrói.
   */
  destroy() {
    this.clear();
    this.enabled = false;
  }

  // ── Serialização ────────────────────────────────────────────

  /**
   * Serializa tudo em JSON.
   * @returns {Object}
   */
  toJSON() {
    return {
      stats: this.stats(),
      traces: this.getAllTraces().map(t => ({
        ...t,
        tree: this.getTree(t.id),
      })),
    };
  }

  // ── Internos ────────────────────────────────────────────────

  /**
   * @private
   */
  _copySpan(span) {
    return {
      id: span.id,
      traceId: span.traceId,
      parentId: span.parentId,
      name: span.name,
      startTs: span.startTs,
      endTs: span.endTs,
      durationMs: span.durationMs,
      attrs: { ...span.attrs },
      events: span.events.map(e => ({ ...e, attrs: { ...e.attrs } })),
      exceptions: span.exceptions.map(e => ({ ...e })),
      children: [...span.children],
    };
  }

  /**
   * @private
   */
  _buildTreeNode(span) {
    const node = this._copySpan(span);
    node.children = span.children
      .map(id => this.spans.get(id))
      .filter(Boolean)
      .map(child => this._buildTreeNode(child));
    return node;
  }

  /**
   * @private
   */
  _evict() {
    while (this.traces.size > this.maxTraces) {
      const oldestId = this._traceOrder.shift();
      const oldTrace = this.traces.get(oldestId);
      if (!oldTrace) continue;

      for (const spanId of oldTrace.spanIds) {
        this.spans.delete(spanId);
      }
      this.traces.delete(oldestId);
    }
  }

  /**
   * @private
   */
  _round(n) {
    return Math.round(Number(n) * 1000) / 1000;
  }
}