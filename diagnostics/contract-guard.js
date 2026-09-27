/**
 * @file contract-guard.js
 * @module diagnostics
 * @description Pré/pós-condições em funções críticas (Design by Contract).
 * @imports — (nenhum)
 * @importedBy diagnostics/index (Fase 4+), systems/diagnostics-system (Fase 4)
 * @level 9
 *
 * Uso:
 *   const guard = new ContractGuard({ bus });
 *   guard.define('world.createEntity', {
 *     pre: (components) => typeof components === 'object',
 *     post: (result, args) => typeof result === 'string' && result.length > 0,
 *   });
 *   guard.wrap(world, 'createEntity', 'world.createEntity');
 *   guard.violations();
 */

export class ContractGuard {
  /**
   * @param {Object} [opts={}]
   * @param {Object} [opts.bus] — EventBus opcional (para emitir eventos)
   * @param {number} [opts.maxViolations=200]
   * @param {boolean} [opts.enabled=true]
   */
  constructor({ bus = null, maxViolations = 200, enabled = true } = {}) {
    this.bus = bus;
    this.maxViolations = Math.max(1, maxViolations);
    this.enabled = !!enabled;

    /** @type {Map<string, Object>} */
    this.contracts = new Map();

    /** @type {Array<Object>} */
    this.history = [];

    /** @type {Array<{target:Object, method:string, original:Function}>} */
    this._wrapped = [];

    this._totalViolations = 0;
    this._totalChecks = 0;
  }

  // ── Registro ────────────────────────────────────────────────

  /**
   * Define um contrato.
   * @param {string} name
   * @param {Object} opts
   * @param {(args:any[]) => boolean} [opts.pre]
   * @param {(result:any, args:any[]) => boolean} [opts.post]
   * @param {string} [opts.description]
   * @returns {ContractGuard}
   */
  define(name, { pre = null, post = null, description = '' } = {}) {
    if (typeof name !== 'string' || !name) {
      throw new Error('[ContractGuard] nome inválido');
    }
    this.contracts.set(name, {
      name,
      pre: typeof pre === 'function' ? pre : null,
      post: typeof post === 'function' ? post : null,
      description: String(description || ''),
    });
    return this;
  }

  /**
   * Remove um contrato.
   * @param {string} name
   */
  undefine(name) {
    this.contracts.delete(name);
  }

  // ── Wrap ────────────────────────────────────────────────────

  /**
   * Envolve um método de um objeto para aplicar o contrato.
   * @param {Object} target
   * @param {string} method
   * @param {string} contractName
   * @returns {ContractGuard}
   */
  wrap(target, method, contractName) {
    if (!target || typeof target[method] !== 'function') {
      throw new Error(`[ContractGuard] ${method} não é função`);
    }
    if (!this.contracts.has(contractName)) {
      throw new Error(`[ContractGuard] contrato "${contractName}" não definido`);
    }

    const original = target[method].bind(target);
    const contract = this.contracts.get(contractName);
    const self = this;

    target[method] = function guarded(...args) {
      if (!self.enabled) return original(...args);

      self._totalChecks++;

      // Pre
      if (contract.pre) {
        let preOk = false;
        let preError = null;
        try {
          preOk = contract.pre(args) !== false;
        } catch (err) {
          preError = err.message;
        }
        if (!preOk) {
          self._record({
            type: 'pre',
            contract: contractName,
            message: preError
              ? `pre-condition lançou: ${preError}`
              : `pre-condition falhou`,
            args: self._safeArgs(args),
          });
        }
      }

      // Executa
      let result;
      let execError = null;
      try {
        result = original(...args);
      } catch (err) {
        execError = err;
        self._record({
          type: 'exception',
          contract: contractName,
          message: `exceção em execução: ${err.message}`,
          stack: (err.stack ?? '').split('\n').slice(0, 5).join(' | '),
          args: self._safeArgs(args),
        });
        throw err;
      }

      // Post
      if (contract.post) {
        let postOk = false;
        let postError = null;
        try {
          postOk = contract.post(result, args) !== false;
        } catch (err) {
          postError = err.message;
        }
        if (!postOk) {
          self._record({
            type: 'post',
            contract: contractName,
            message: postError
              ? `post-condition lançou: ${postError}`
              : `post-condition falhou`,
            args: self._safeArgs(args),
            result: self._safeValue(result),
          });
        }
      }

      return result;
    };

    this._wrapped.push({ target, method, original });
    return this;
  }

  /**
   * Restaura todos os métodos envolvidos.
   */
  unwrapAll() {
    for (const { target, method, original } of this._wrapped) {
      target[method] = original;
    }
    this._wrapped = [];
  }

  // ── Consultas ───────────────────────────────────────────────

  /**
   * Violações registradas (mais recentes primeiro).
   * @param {number} [limit]
   * @returns {Array<Object>}
   */
  violations(limit = null) {
    const out = this.history.slice().reverse();
    if (Number.isFinite(limit) && limit > 0) return out.slice(0, limit);
    return out;
  }

  /**
   * Lista os contratos registrados.
   * @returns {Array<Object>}
   */
  list() {
    return Array.from(this.contracts.values()).map(c => ({
      name: c.name,
      description: c.description,
      hasPre: !!c.pre,
      hasPost: !!c.post,
    }));
  }

  /**
   * Estatísticas.
   * @returns {Object}
   */
  stats() {
    return {
      contracts: this.contracts.size,
      wrapped: this._wrapped.length,
      totalChecks: this._totalChecks,
      totalViolations: this._totalViolations,
      inHistory: this.history.length,
      enabled: this.enabled,
    };
  }

  /**
   * Serializa.
   * @returns {Object}
   */
  toJSON() {
    return {
      stats: this.stats(),
      contracts: this.list(),
      violations: this.violations(),
    };
  }

  // ── Controle ────────────────────────────────────────────────

  setEnabled(v) { this.enabled = !!v; }

  clear() {
    this.history = [];
    this._totalViolations = 0;
    this._totalChecks = 0;
  }

  destroy() {
    this.unwrapAll();
    this.contracts.clear();
    this.clear();
    this.enabled = false;
  }

  // ── Internos ────────────────────────────────────────────────

  /** @private */
  _record(v) {
    v.ts = Date.now();
    this._totalViolations++;
    this.history.push(v);
    while (this.history.length > this.maxViolations) this.history.shift();

    this._emit('diag:contract:violated', v);
  }

  /** @private */
  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') {
      try { this.bus.emit(event, payload); } catch { /* isola */ }
    }
  }

  /** @private */
  _safeArgs(args) {
    try {
      return args.map(a => this._safeValue(a));
    } catch {
      return [];
    }
  }

  /** @private */
  _safeValue(v) {
    if (v === null || v === undefined) return v;
    if (typeof v === 'string') return v.slice(0, 200);
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    if (typeof v === 'function') return '[Function]';
    try {
      const s = JSON.stringify(v);
      if (s.length <= 300) return v;
      return { _truncated: true, _preview: s.slice(0, 300) };
    } catch {
      return { _unsafe: true, _type: typeof v };
    }
  }
}