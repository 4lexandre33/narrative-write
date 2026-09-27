/**
 * @file structured-logger.js
 * @module diagnostics
 * @description Logger NDJSON com níveis, sessão e ring buffer.
 * @imports — (nenhum)
 * @importedBy diagnostics/index
 * @level 9
 *
 * Cada entrada é um objeto NDJSON com:
 *   { seq, ts, sessionId, level, module, msg, data }
 *
 * Uso:
 *   logger.info('boot', 'app iniciado', { version: '1.0' });
 *   logger.error('parse', 'falha em token', { line: '...', error: '...' });
 */

/**
 * Níveis válidos, ordenados por severidade crescente.
 * @type {ReadonlyArray<string>}
 */
export const LOG_LEVELS = Object.freeze(['debug', 'info', 'warn', 'error']);

/**
 * Logger estruturado em memória, com ring buffer e listeners.
 */
export class StructuredLogger {
  /**
   * @param {Object} [opts={}]
   * @param {string} [opts.sessionId]
   * @param {number} [opts.maxEntries=5000]
   * @param {boolean} [opts.enabled=true]
   * @param {string} [opts.minLevel='debug']
   */
  constructor({ sessionId = null, maxEntries = 5_000, enabled = true, minLevel = 'debug' } = {}) {
    this.sessionId = sessionId || StructuredLogger.generateSessionId();
    this.maxEntries = Math.max(1, maxEntries);
    this.enabled = !!enabled;
    this.minLevel = LOG_LEVELS.includes(minLevel) ? minLevel : 'debug';

    /** @type {Array<Object>} */
    this.buffer = [];
    this.seq = 0;

    /** @type {Set<Function>} */
    this.listeners = new Set();

    this._createdAt = Date.now();
  }

  // ── API principal ───────────────────────────────────────────

  /**
   * Registra uma entrada.
   * @param {'debug'|'info'|'warn'|'error'} level
   * @param {string} module
   * @param {string} msg
   * @param {any} [data=null]
   * @returns {Object|null} entrada gravada ou null se filtrada
   */
  log(level, module, msg, data = null) {
    if (!this.enabled) return null;
    if (!this._passesMinLevel(level)) return null;

    const entry = {
      seq: ++this.seq,
      ts: Date.now(),
      sessionId: this.sessionId,
      level: String(level),
      module: String(module || 'app'),
      msg: String(msg ?? ''),
      data: data === undefined ? null : data,
    };

    this._push(entry);
    return entry;
  }

  /**
   * Atalhos por nível.
   */
  debug(module, msg, data) { return this.log('debug', module, msg, data); }
  info(module, msg, data)  { return this.log('info', module, msg, data); }
  warn(module, msg, data)  { return this.log('warn', module, msg, data); }
  error(module, msg, data) { return this.log('error', module, msg, data); }

  // ── Consultas ───────────────────────────────────────────────

  /**
   * Retorna entradas filtradas.
   * @param {Object} [opts={}]
   * @param {string} [opts.level] — filtra por nível exato
   * @param {string} [opts.module] — filtra por módulo
   * @param {number} [opts.since=0] — timestamp mínimo
   * @param {number} [opts.limit] — máximo de entradas (últimas N)
   * @returns {Array<Object>}
   */
  entries({ level = null, module = null, since = 0, limit = null } = {}) {
    let out = this.buffer;
    if (level) out = out.filter(e => e.level === level);
    if (module) out = out.filter(e => e.module === module);
    if (since > 0) out = out.filter(e => e.ts >= since);
    if (Number.isFinite(limit) && limit > 0) out = out.slice(-limit);
    return out;
  }

  /**
   * Retorna todas as entradas (cópia).
   * @returns {Array<Object>}
   */
  dump() {
    return [...this.buffer];
  }

  /**
   * Número de entradas atualmente em buffer.
   * @returns {number}
   */
  size() {
    return this.buffer.length;
  }

  /**
   * Timestamp de criação.
   * @returns {number}
   */
  createdAt() {
    return this._createdAt;
  }

  // ── Serialização ────────────────────────────────────────────

  /**
   * Serializa o buffer inteiro em NDJSON (uma linha JSON por entrada).
   * @returns {string}
   */
  toNDJSON() {
    const lines = [];
    for (const e of this.buffer) {
      try {
        lines.push(JSON.stringify(e));
      } catch {
        // entrada não-serializável — ignora
      }
    }
    return lines.join('\n');
  }

  // ── Assinatura ──────────────────────────────────────────────

  /**
   * Registra um listener que recebe cada nova entrada.
   * @param {(entry: Object) => void} fn
   * @returns {Function} unsubscribe
   */
  onEntry(fn) {
    if (typeof fn !== 'function') return () => {};
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ── Controle ────────────────────────────────────────────────

  /**
   * Liga/desliga o logger.
   * @param {boolean} v
   */
  setEnabled(v) {
    this.enabled = !!v;
  }

  /**
   * Define o nível mínimo.
   * @param {'debug'|'info'|'warn'|'error'} level
   */
  setMinLevel(level) {
    if (LOG_LEVELS.includes(level)) this.minLevel = level;
  }

  /**
   * Limpa o buffer (mantém contadores e listeners).
   */
  clear() {
    this.buffer.length = 0;
  }

  /**
   * Limpa tudo, incluindo listeners.
   */
  destroy() {
    this.buffer.length = 0;
    this.listeners.clear();
    this.enabled = false;
  }

  // ── Internos ────────────────────────────────────────────────

  /**
   * @private
   */
  _push(entry) {
    this.buffer.push(entry);
    if (this.buffer.length > this.maxEntries) {
      this.buffer.shift();
    }

    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // isola erro do listener
      }
    }
  }

  /**
   * @private
   */
  _passesMinLevel(level) {
    const minIdx = LOG_LEVELS.indexOf(this.minLevel);
    const curIdx = LOG_LEVELS.indexOf(level);
    if (minIdx < 0 || curIdx < 0) return true;
    return curIdx >= minIdx;
  }

  // ── Estático ────────────────────────────────────────────────

  /**
   * Gera um sessionId curto.
   * @returns {string}
   */
  static generateSessionId() {
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 6);
    return `s-${t}-${r}`;
  }
}