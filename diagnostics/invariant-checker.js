/**
 * @file invariant-checker.js
 * @module diagnostics
 * @description Valida invariantes que nunca devem quebrar, após cada mutação.
 * @imports core/constants, core/utils/time
 * @importedBy diagnostics/index (Fase 4+), systems/diagnostics-system (Fase 4)
 * @level 9
 *
 * Uso:
 *   const checker = new InvariantChecker();
 *   checker.attach(bus, { machine, world, ids, links });
 *   checker.check();          // roda tudo agora
 *   checker.violations();     // histórico
 *   checker.stats();          // resumo
 */

import { COMPONENT_NAMES } from '../core/constants.js';
import { tickToNumber } from '../core/utils/time.js';

export class InvariantChecker {
  /**
   * @param {Object} [opts={}]
   * @param {number} [opts.maxViolations=200]
   * @param {number} [opts.debounceMs=80]
   * @param {boolean} [opts.enabled=true]
   */
  constructor({ maxViolations = 200, debounceMs = 80, enabled = true } = {}) {
    this.maxViolations = Math.max(1, maxViolations);
    this.debounceMs = Math.max(0, debounceMs);
    this.enabled = !!enabled;

    /** @type {Array<Object>} */
    this.history = [];

    /** @type {Map<string, number>} */
    this.countsByCode = new Map();

    /** @type {Array<Function>} */
    this._unsubs = [];

    this._machine = null;
    this._world = null;
    this._ids = null;
    this._links = null;

    this._timer = null;
    this._scheduled = false;

    this._runs = 0;
    this._totalViolations = 0;
  }

  // ── Anexar ao bus ───────────────────────────────────────────

  /**
   * @param {Object} bus
   * @param {Object} deps
   * @param {Object} deps.machine
   * @param {Object} deps.world
   * @param {Object} [deps.ids]
   * @param {Object} [deps.links]
   * @returns {InvariantChecker}
   */
  attach(bus, { machine, world, ids = null, links = null } = {}) {
    if (!bus || typeof bus.on !== 'function') {
      throw new Error('[InvariantChecker] bus inválido');
    }
    if (!machine || !world) {
      throw new Error('[InvariantChecker] machine e world obrigatórios');
    }
    if (this._machine) this.detach();

    this._machine = machine;
    this._world = world;
    this._ids = ids ?? machine.ids ?? null;
    this._links = links ?? machine.links ?? null;

    const trigger = () => this.schedule();

    this._unsubs.push(bus.on('entity:created', trigger));
    this._unsubs.push(bus.on('entity:destroyed', trigger));
    this._unsubs.push(bus.on('component:added', trigger));
    this._unsubs.push(bus.on('component:updated', trigger));
    this._unsubs.push(bus.on('component:removed', trigger));
    this._unsubs.push(bus.on('links:pruned', trigger));
    this._unsubs.push(bus.on('tick:advanced', trigger));

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
    this._machine = null;
    this._world = null;
    this._ids = null;
    this._links = null;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._scheduled = false;
  }

  // ── Agendamento ─────────────────────────────────────────────

  /**
   * Agenda uma verificação (debounced).
   */
  schedule() {
    if (!this.enabled) return;
    if (this._scheduled) return;
    this._scheduled = true;

    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this._scheduled = false;
      this._timer = null;
      try {
        this.check();
      } catch {
        // isola erro do checker
      }
    }, this.debounceMs);
  }

  // ── Execução ────────────────────────────────────────────────

  /**
   * Roda todas as invariantes e grava violações.
   * @returns {Array<Object>} violações encontradas nesta passagem
   */
  check() {
    if (!this._world || !this._machine) return [];

    this._runs++;

    const found = [];

    this._safeRun(found, () => this._checkIdentityPresent());
    this._safeRun(found, () => this._checkIdentityFields());
    this._safeRun(found, () => this._checkShortcodesConsistency());
    this._safeRun(found, () => this._checkLinksDangling());
    this._safeRun(found, () => this._checkInstanceOfValid());
    this._safeRun(found, () => this._checkDerivesFromAcyclic());
    this._safeRun(found, () => this._checkTickNumberConsistency());
    this._safeRun(found, () => this._checkTimelineHasSnapshot());
    this._safeRun(found, () => this._checkNoUndefinedComponents());
    this._safeRun(found, () => this._checkIdentityCountMatches());
    this._safeRun(found, () => this._checkLinkIndexBounds());
    this._safeRun(found, () => this._checkTextsNotNull());

    for (const v of found) {
      v.ts = Date.now();
      v.tick = this._machine.getTick?.() ?? null;
      this._record(v);
    }

    return found;
  }

  // ── Consultas ───────────────────────────────────────────────

  /**
   * Violações registradas (mais recentes primeiro).
   * @param {Object} [opts={}]
   * @param {string} [opts.code]
   * @param {string} [opts.severity]
   * @param {number} [opts.limit]
   * @returns {Array<Object>}
   */
  violations({ code = null, severity = null, limit = null } = {}) {
    let out = this.history;
    if (code) out = out.filter(v => v.code === code);
    if (severity) out = out.filter(v => v.severity === severity);
    out = out.slice().reverse();
    if (Number.isFinite(limit) && limit > 0) out = out.slice(0, limit);
    return out.map(v => ({ ...v, context: { ...v.context } }));
  }

  /**
   * Estatísticas.
   * @returns {Object}
   */
  stats() {
    return {
      runs: this._runs,
      totalViolations: this._totalViolations,
      inHistory: this.history.length,
      maxViolations: this.maxViolations,
      byCode: Object.fromEntries(this.countsByCode),
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
      violations: this.violations(),
    };
  }

  // ── Controle ────────────────────────────────────────────────

  setEnabled(v) { this.enabled = !!v; }

  clear() {
    this.history = [];
    this.countsByCode.clear();
    this._runs = 0;
    this._totalViolations = 0;
  }

  destroy() {
    this.detach();
    this.clear();
    this.enabled = false;
  }

  // ── Invariantes ─────────────────────────────────────────────

  /** @private */
  _checkIdentityPresent() {
    const violations = [];
    for (const id of this._world.allEntities()) {
      if (!this._world.has(id, COMPONENT_NAMES.IDENTITY)) {
        violations.push({
          code: 'IDENTITY_MISSING',
          severity: 'error',
          message: `entidade "${id}" não tem Identity`,
          context: { entityId: id },
        });
      }
    }
    return violations;
  }

  /** @private */
  _checkIdentityFields() {
    const violations = [];
    for (const id of this._world.allEntities()) {
      const ident = this._world.get(id, COMPONENT_NAMES.IDENTITY);
      if (!ident) continue;
      if (typeof ident.id !== 'string' || ident.id.length === 0) {
        violations.push({
          code: 'IDENTITY_INVALID_ID',
          severity: 'error',
          message: `Identity.id vazio em "${id}"`,
          context: { entityId: id, id: ident.id },
        });
      }
      if (typeof ident.name !== 'string' || ident.name.length === 0) {
        violations.push({
          code: 'IDENTITY_INVALID_NAME',
          severity: 'error',
          message: `Identity.name vazio em "${id}"`,
          context: { entityId: id, name: ident.name },
        });
      }
    }
    return violations;
  }

  /** @private */
  _checkShortcodesConsistency() {
    if (!this._ids) return [];
    const violations = [];
    for (const [shortcode, entityId] of this._ids.byShortcode) {
      if (!this._world.hasEntity(entityId)) {
        violations.push({
          code: 'SHORTCODE_ORPHAN',
          severity: 'error',
          message: `shortcode "${shortcode}" aponta para entidade inexistente "${entityId}"`,
          context: { shortcode, entityId },
        });
      }
    }
    return violations;
  }

  /** @private */
  _checkLinksDangling() {
    const violations = [];
    const ids = new Set(this._world.allEntities());
    for (const id of this._world.allEntities()) {
      const links = this._world.get(id, COMPONENT_NAMES.LINKS);
      if (!links) continue;
      for (const [rel, value] of Object.entries(links)) {
        const targets = Array.isArray(value) ? value : [value];
        for (const to of targets) {
          if (typeof to !== 'string' || !to) continue;
          if (!ids.has(to)) {
            violations.push({
              code: 'LINK_DANGLING',
              severity: 'error',
              message: `link "${rel}" de "${id}" aponta para "${to}" inexistente`,
              context: { from: id, rel, to },
            });
          }
        }
      }
    }
    return violations;
  }

  /** @private */
  _checkInstanceOfValid() {
    const violations = [];
    for (const id of this._world.allEntities()) {
      const instOf = this._world.get(id, COMPONENT_NAMES.INSTANCE_OF);
      if (!instOf?.id) continue;
      if (!this._world.hasEntity(instOf.id)) {
        violations.push({
          code: 'INSTANCE_OF_ORPHAN',
          severity: 'error',
          message: `InstanceOf de "${id}" aponta para "${instOf.id}" inexistente`,
          context: { entityId: id, blueprint: instOf.id },
        });
      } else if (!this._world.has(instOf.id, COMPONENT_NAMES.IS_BLUEPRINT)) {
        violations.push({
          code: 'INSTANCE_OF_NOT_BLUEPRINT',
          severity: 'warning',
          message: `InstanceOf de "${id}" aponta para "${instOf.id}" que não é blueprint`,
          context: { entityId: id, blueprint: instOf.id },
        });
      }
    }
    return violations;
  }

  /** @private */
  _checkDerivesFromAcyclic() {
    const violations = [];
    const entities = this._world.allEntities();
    const visited = new Set();
    const inStack = new Set();

    const visit = (id, path) => {
      if (inStack.has(id)) {
        violations.push({
          code: 'DERIVES_FROM_CYCLE',
          severity: 'error',
          message: `ciclo em DerivesFrom: ${path.join(' → ')} → ${id}`,
          context: { cycle: [...path, id] },
        });
        return;
      }
      if (visited.has(id)) return;
      inStack.add(id);
      const derives = this._world.get(id, COMPONENT_NAMES.DERIVES_FROM)?.ids ?? [];
      for (const parent of derives) {
        if (this._world.hasEntity(parent)) {
          visit(parent, [...path, id]);
        }
      }
      inStack.delete(id);
      visited.add(id);
    };

    for (const id of entities) visit(id, []);
    return violations;
  }

  /** @private */
  _checkTickNumberConsistency() {
    const st = this._machine.state;
    if (!st) return [];
    const expected = tickToNumber(st.tick);
    if (st.tickNumber !== expected) {
      return [{
        code: 'TICK_NUMBER_MISMATCH',
        severity: 'error',
        message: `state.tickNumber (${st.tickNumber}) ≠ tickToNumber(${st.tick}) (${expected})`,
        context: { tick: st.tick, tickNumber: st.tickNumber, expected },
      }];
    }
    return [];
  }

  /** @private */
  _checkTimelineHasSnapshot() {
    const timeline = this._machine.systems?.get?.('TimelineSystem');
    if (!timeline) return [];
    const violations = [];
    for (const [name, tl] of timeline.timelines) {
      if (!tl.snapshots || tl.snapshots.size === 0) {
        violations.push({
          code: 'TIMELINE_EMPTY',
          severity: 'error',
          message: `timeline "${name}" sem snapshots`,
          context: { timeline: name },
        });
      }
    }
    return violations;
  }

  /** @private */
  _checkNoUndefinedComponents() {
    const violations = [];
    for (const [name, map] of this._world.components) {
      for (const [id, data] of map) {
        if (data === undefined) {
          violations.push({
            code: 'COMPONENT_UNDEFINED',
            severity: 'error',
            message: `componente "${name}" da entidade "${id}" está undefined`,
            context: { entityId: id, component: name },
          });
        }
      }
    }
    return violations;
  }

  /** @private */
  _checkIdentityCountMatches() {
    const entities = this._world.entities.size;
    const identityCount = this._world.componentCount(COMPONENT_NAMES.IDENTITY);
    if (entities !== identityCount) {
      return [{
        code: 'IDENTITY_COUNT_MISMATCH',
        severity: 'warning',
        message: `${entities} entidades mas ${identityCount} com Identity`,
        context: { entities, identityCount },
      }];
    }
    return [];
  }

  /** @private */
  _checkLinkIndexBounds() {
    if (!this._links) return [];
    if (this._links.forward.size > this._world.entities.size) {
      return [{
        code: 'LINK_INDEX_OVERSIZE',
        severity: 'warning',
        message: `LinkIndex.forward (${this._links.forward.size}) > entidades (${this._world.entities.size})`,
        context: {
          forward: this._links.forward.size,
          entities: this._world.entities.size,
        },
      }];
    }
    return [];
  }

  /** @private */
  _checkTextsNotNull() {
    const violations = [];
    for (const id of this._world.allEntities()) {
      const texts = this._world.get(id, COMPONENT_NAMES.TEXTS);
      if (!texts) continue;
      for (const [k, v] of Object.entries(texts)) {
        if (v === null || v === undefined) {
          violations.push({
            code: 'TEXT_NULL_VALUE',
            severity: 'warning',
            message: `Texts.${k} de "${id}" é null/undefined`,
            context: { entityId: id, field: k },
          });
        }
      }
    }
    return violations;
  }

  // ── Internos ────────────────────────────────────────────────

  /** @private */
  _safeRun(out, fn) {
    try {
      const res = fn();
      if (Array.isArray(res)) {
        for (const v of res) out.push(v);
      }
    } catch (err) {
      out.push({
        code: 'INVARIANT_CHECK_ERROR',
        severity: 'error',
        message: `erro em invariante: ${err.message}`,
        context: { stack: (err.stack ?? '').split('\n').slice(0, 3).join(' | ') },
      });
    }
  }

  /** @private */
  _record(v) {
    this._totalViolations++;
    const n = (this.countsByCode.get(v.code) ?? 0) + 1;
    this.countsByCode.set(v.code, n);

    this.history.push(v);
    while (this.history.length > this.maxViolations) this.history.shift();
  }
}