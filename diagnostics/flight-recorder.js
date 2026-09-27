/**
 * @file flight-recorder.js
 * @module diagnostics
 * @description Ring buffer de eventos do bus. Sobrevive a reset() do Machine.
 * @imports — (nenhum)
 * @importedBy diagnostics/index
 * @level 9
 *
 * Diferença do structured-logger:
 *   - logger → mensagens curadas ("restore falhou")
 *   - recorder → TODOS os eventos do bus e do pipeline, com payload
 *
 * Uso:
 *   const rec = new FlightRecorder({ sessionId, maxEvents: 10000 });
 *   rec.attach(bus, { machine });
 *   rec.last(100);
 *   rec.toNDJSON();
 */

export class FlightRecorder {
  /**
   * @param {Object} [opts={}]
   * @param {string} [opts.sessionId]
   * @param {number} [opts.maxEvents=10000]
   * @param {boolean} [opts.enabled=true]
   * @param {boolean} [opts.includePayload=true]
   */
  constructor({ sessionId = null, maxEvents = 10_000, enabled = true, includePayload = true } = {}) {
    this.sessionId = sessionId || `r-${Date.now().toString(36)}`;
    this.maxEvents = Math.max(1, maxEvents);
    this.enabled = !!enabled;
    this.includePayload = !!includePayload;

    /** @type {Array<Object>} */
    this.events = [];
    this.seq = 0;

    /** @type {Map<string, number>} */
    this.counters = new Map();

    /** @type {Array<Function>} */
    this._unsubs = [];

    /** @type {Object|null} */
    this._machine = null;

    /** @type {Object|null} */
    this._bus = null;

    this._startedAt = Date.now();
  }

  // ── Anexar ao bus ───────────────────────────────────────────

  /**
   * Anexa o recorder a um EventBus.
   * @param {Object} bus — EventBus
   * @param {Object} [opts={}]
   * @param {Object} [opts.machine] — Machine (opcional, para ler tick)
   * @returns {FlightRecorder} this
   */
  attach(bus, { machine = null } = {}) {
    if (!bus || typeof bus.on !== 'function') {
      throw new Error('[FlightRecorder] bus inválido');
    }
    if (this._bus === bus) return this;

    this.detach();

    this._bus = bus;
    this._machine = machine;

    // Wildcard
    const unsub = bus.on('*', ({ event, payload }) => {
      this.record(event, payload);
    });
    this._unsubs.push(unsub);

    return this;
  }

  /**
   * Remove listeners.
   */
  detach() {
    for (const unsub of this._unsubs) {
      try { unsub(); } catch { /* noop */ }
    }
    this._unsubs = [];
    this._bus = null;
  }

  // ── Registro ────────────────────────────────────────────────

  /**
   * Registra um evento.
   * @param {string} event
   * @param {any} [payload=null]
   * @returns {Object|null}
   */
  record(event, payload = null) {
    if (!this.enabled) return null;

    const entry = {
      seq: ++this.seq,
      ts: Date.now(),
      sessionId: this.sessionId,
      event: String(event),
      tick: this._machine?.getTick?.() ?? null,
      payload: this.includePayload ? this._safe(payload) : null,
    };

    this._push(entry);
    this._bumpCounter(event);

    return entry;
  }

  /**
   * Atalho para eventos internos da suíte.
   * Prefixa com `diag:` automaticamente.
   * @param {string} kind
   * @param {any} [data=null]
   * @returns {Object|null}
   */
  recordCustom(kind, data = null) {
    return this.record(`diag:${kind}`, data);
  }

  // ── Consultas ───────────────────────────────────────────────

  /**
   * Filtra eventos.
   * @param {Object} [opts={}]
   * @param {string} [opts.event] — nome exato
   * @param {number} [opts.since=0] — timestamp mínimo
   * @param {string} [opts.tick] — filtra por tick
   * @param {number} [opts.limit] — últimas N
   * @returns {Array<Object>}
   */
  entries({ event = null, since = 0, tick = null, limit = null } = {}) {
    let out = this.events;
    if (event) out = out.filter(e => e.event === event);
    if (tick) out = out.filter(e => e.tick === tick);
    if (since > 0) out = out.filter(e => e.ts >= since);
    if (Number.isFinite(limit) && limit > 0) out = out.slice(-limit);
    return out;
  }

  /**
   * Últimas N entradas.
   * @param {number} [n=100]
   * @returns {Array<Object>}
   */
  last(n = 100) {
    const k = Math.max(1, Math.floor(n));
    return this.events.slice(-k);
  }

  /**
   * Mapa de contagens por evento.
   * @returns {Object<string, number>}
   */
  counts() {
    const out = {};
    for (const [k, v] of this.counters) out[k] = v;
    return out;
  }

  /**
   * Contagem de um evento específico.
   * @param {string} event
   * @returns {number}
   */
  countOf(event) {
    return this.counters.get(event) ?? 0;
  }

  /**
   * Estatísticas resumidas.
   * @returns {{ total:number, inBuffer:number, maxEvents:number, uniqueEvents:number, uptimeMs:number }}
   */
  stats() {
    return {
      total: this.seq,
      inBuffer: this.events.length,
      maxEvents: this.maxEvents,
      uniqueEvents: this.counters.size,
      uptimeMs: Date.now() - this._startedAt,
    };
  }

  /**
   * Cópia do buffer.
   * @returns {Array<Object>}
   */
  dump() {
    return [...this.events];
  }

  // ── Serialização ────────────────────────────────────────────

  /**
   * Serializa o buffer inteiro em NDJSON.
   * @returns {string}
   */
  toNDJSON() {
    const lines = [];
    for (const e of this.events) {
      try {
        lines.push(JSON.stringify(e));
      } catch {
        // ignora entradas não-serializáveis
      }
    }
    return lines.join('\n');
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
   * Limpa o buffer e os contadores.
   */
  clear() {
    this.events.length = 0;
    this.counters.clear();
  }

  /**
   * Limpa tudo, incluindo listeners.
   */
  destroy() {
    this.detach();
    this.clear();
    this.seq = 0;
    this.enabled = false;
  }

  // ── Internos ────────────────────────────────────────────────

  /**
   * @private
   */
  _push(entry) {
    this.events.push(entry);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }

  /**
   * @private
   */
  _bumpCounter(event) {
    const n = (this.counters.get(event) ?? 0) + 1;
    this.counters.set(event, n);
  }

  /**
   * Deep clone seguro, com fallback para payloads não-serializáveis
   * (funções, circular, Map/Set, DOM, etc.).
   * @private
   */
  _safe(payload) {
    if (payload === null || payload === undefined) return null;

    if (typeof payload === 'string' || typeof payload === 'number' || typeof payload === 'boolean') {
      return payload;
    }

    try {
      return JSON.parse(JSON.stringify(payload));
    } catch {
      // Fallback: resumo tipo
      return {
        _unsafe: true,
        _type: typeof payload,
        _ctor: payload?.constructor?.name ?? null,
        _keys: typeof payload === 'object' && payload !== null
          ? Object.keys(payload).slice(0, 20)
          : null,
      };
    }
  }
}