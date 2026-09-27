/**
 * @file component-registry.js
 * @module ecs
 * @description Registry de schemas de componente. Define defaults,
 *              campos obrigatórios e validações.
 * @imports — (nenhum)
 * @importedBy ecs/world, schemas/builtin-components
 * @level 2
 *
 * Fase 3 — Diagnostics: emite `validation:soft-fail` quando validate()
 * retorna valor que não é `true`, `false`, `undefined` ou `null`.
 * Requer `setBus(bus)` para emitir; sem bus, faz `console.warn`.
 *
 * Fase 13.7 — Limpeza (auditoria 25/09/2026):
 *   O `setBus()` existia mas nunca era chamado — `validation:soft-fail`
 *   caía sempre em `console.warn` e a DiagnosticsSuite nunca capturava
 *   esses eventos. O constructor agora aceita `{ bus }`; o World passa
 *   seu próprio bus em `new ComponentRegistry({ bus: this.bus })`.
 *
 *   `setBus()` continua público para casos onde o bus é definido depois
 *   da construção (warm boot, restore).
 */

export class ComponentRegistry {
  /**
   * @param {Object} [opts={}]
   * @param {Object} [opts.bus=null] — EventBus opcional
   */
  constructor({ bus = null } = {}) {
    /**
     * @type {Map<string, {defaults:Object, required:string[], validate:Function|null}>}
     */
    this.schemas = new Map();

    /** @type {Object|null} */
    this._bus = bus;
  }

  /**
   * Define o bus para emissão de eventos.
   * Idempotente. Sobrescreve bus anterior.
   * @param {Object} bus
   */
  setBus(bus) {
    this._bus = bus;
  }

  // ── Definição ───────────────────────────────────────────────

  /**
   * Define o schema de um componente.
   * @param {string} name
   * @param {Object} [options={}]
   * @param {Object} [options.defaults]
   * @param {string[]} [options.required]
   * @param {Function} [options.validate]
   * @param {Object} [flags={}]
   * @param {boolean} [flags.override=false]
   * @returns {Object} schema
   */
  define(name, options = {}, flags = {}) {
    if (typeof name !== 'string' || !name) {
      throw new Error('[ComponentRegistry] nome do componente inválido');
    }
    if (this.schemas.has(name) && !flags.override) {
      throw new Error(`[ComponentRegistry] componente já definido: ${name}`);
    }

    const schema = {
      defaults: (options.defaults && typeof options.defaults === 'object')
        ? { ...options.defaults }
        : {},
      required: Array.isArray(options.required)
        ? [...options.required]
        : [],
      validate: typeof options.validate === 'function'
        ? options.validate
        : null,
    };

    this.schemas.set(name, schema);
    return schema;
  }

  undefine(name) {
    return this.schemas.delete(name);
  }

  // ── Consultas ───────────────────────────────────────────────

  isDefined(name) {
    return this.schemas.has(name);
  }

  get(name) {
    return this.schemas.get(name) || null;
  }

  all() {
    return Array.from(this.schemas.keys());
  }

  size() {
    return this.schemas.size;
  }

  // ── Materialização ──────────────────────────────────────────

  /**
   * Materializa dados de componente aplicando defaults, checando required
   * e rodando validate. Retorna sempre um objeto NOVO (não muta entrada).
   *
   * Fase 3 — emite `validation:soft-fail` se validate() retornar valor
   * que não seja `true`, `false`, `undefined` ou `null`.
   *
   * @param {string} name
   * @param {Object} [data={}]
   * @returns {Object}
   */
  materialize(name, data = {}) {
    const schema = this.schemas.get(name);

    if (!schema) {
      return { ...data };
    }

    const merged = { ...schema.defaults, ...data };

    for (const field of schema.required) {
      if (merged[field] === undefined || merged[field] === null) {
        throw new Error(
          `[ComponentRegistry] "${name}" requer campo "${field}"`
        );
      }
    }

    if (schema.validate) {
      const result = schema.validate(merged);

      if (result === false) {
        throw new Error(
          `[ComponentRegistry] "${name}" falhou na validação`
        );
      }

      // ── Captura do invisível ─────────────────────────────
      // validate() retornou algo que não é true/false/undefined/null.
      // Hoje esse valor é silenciosamente ignorado.
      if (result !== true && result !== undefined && result !== null && result !== false) {
        this._emitSoftFail(name, merged, result);
      }
    }

    return merged;
  }

  check(name, data = {}) {
    try {
      this.materialize(name, data);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ── Ciclo de vida ───────────────────────────────────────────

  clear() {
    this.schemas.clear();
  }

  toJSON() {
    const out = {};
    for (const [name, schema] of this.schemas) {
      out[name] = {
        defaults: { ...schema.defaults },
        required: [...schema.required],
      };
    }
    return out;
  }

  // ── Internos ────────────────────────────────────────────────

  /**
   * @private
   */
  _emitSoftFail(component, data, returned) {
    const payload = {
      component,
      data: this._safeValue(data),
      returned: this._safeValue(returned),
    };

    if (this._bus && typeof this._bus.emit === 'function') {
      try {
        this._bus.emit('validation:soft-fail', payload);
        return;
      } catch { /* cai no warn */ }
    }

    if (typeof console !== 'undefined') {
      console.warn('[ComponentRegistry] validation:soft-fail', payload);
    }
  }

  /**
   * @private
   */
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