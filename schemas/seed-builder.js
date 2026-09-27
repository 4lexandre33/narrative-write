/**
 * @file seed-builder.js
 * @module schemas
 * @description Converte seeds brutos em specs normalizadas, valida e agrupa.
 * @imports core/constants, components/identity, components/meta
 * @importedBy schemas/bootstrap
 * @level 9
 */

import { COMPONENT_NAMES, ENTITY_TYPES } from '../core/constants.js';
import { makeMeta } from '../components/meta.js';
import { isIdentity } from '../components/identity.js';

export class SeedBuilder {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.tick='T0'] — tick em que os seeds são criados
   */
  constructor({ tick = 'T0' } = {}) {
    this.tick = tick;
    this.errors = [];
    this.warnings = [];
  }

  // ── Construção ──────────────────────────────────────────────

  /**
   * Normaliza uma lista de seeds brutos.
   * Retorna specs prontas para `world.createEntity`.
   *
   * @param {Array<{id:string, components:Object}>} rawSeeds
   * @returns {Array<{id:string, components:Object}>}
   */
  build(rawSeeds = []) {
    this.errors = [];
    this.warnings = [];
    const out = [];

    const seenIds = new Set();
    const seenShortcodes = new Set();

    for (const raw of rawSeeds) {
      const spec = this._normalize(raw);
      const validation = this._validate(spec, seenIds, seenShortcodes);

      if (!validation.ok) {
        this.errors.push({ raw, error: validation.error });
        continue;
      }

      seenIds.add(spec.id);
      const shortId = spec.components[COMPONENT_NAMES.IDENTITY]?.id;
      if (shortId) seenShortcodes.add(shortId);

      out.push(spec);
    }

    return out;
  }

  // ── Normalização ────────────────────────────────────────────

  /**
   * @private
   */
  _normalize(raw) {
    if (!raw || typeof raw !== 'object') {
      return { id: null, components: {} };
    }

    const id = String(raw.id ?? '');
    const components = { ...(raw.components ?? {}) };

    // Garante Meta — Fase 3: usa tick, não wall-clock
    if (!components[COMPONENT_NAMES.META]) {
      components[COMPONENT_NAMES.META] = makeMeta({ builtin: true, tick: this.tick });
    } else {
      components[COMPONENT_NAMES.META] = {
        createdAt: components[COMPONENT_NAMES.META].createdAt ?? this.tick,
        updatedAt: components[COMPONENT_NAMES.META].updatedAt ?? this.tick,
        builtin: true,
        dirty: false,
      };
    }

    return { id, components };
  }

  // ── Validação ───────────────────────────────────────────────

  /**
   * @private
   */
  _validate(spec, seenIds, seenShortcodes) {
    if (!spec.id || typeof spec.id !== 'string') {
      return { ok: false, error: 'id ausente ou inválido' };
    }
    if (seenIds.has(spec.id)) {
      return { ok: false, error: `id duplicado: ${spec.id}` };
    }

    const identity = spec.components[COMPONENT_NAMES.IDENTITY];
    if (!identity) {
      return { ok: false, error: `Identity ausente em ${spec.id}` };
    }
    if (!isIdentity(identity)) {
      return { ok: false, error: `Identity malformada em ${spec.id}` };
    }
    if (seenShortcodes.has(identity.id)) {
      return { ok: false, error: `shortcode duplicado: ${identity.id}` };
    }
    if (!ENTITY_TYPES.includes(identity.type) && !this._isSeedOnlyType(identity.type)) {
      this.warnings.push({
        id: spec.id,
        warning: `tipo desconhecido: ${identity.type}`,
      });
    }

    return { ok: true };
  }

  /**
   * @private
   */
  _isSeedOnlyType(type) {
    return [
      'package', 'category', 'set',
      'phrase', 'placeholder-term',
    ].includes(type);
  }

  // ── Agrupamento ─────────────────────────────────────────────

  /**
   * Agrupa specs por `Identity.type`.
   * @param {Array} specs
   * @returns {Object<string, Array>}
   */
  groupByType(specs = []) {
    const groups = {};
    for (const spec of specs) {
      const type = spec.components[COMPONENT_NAMES.IDENTITY]?.type ?? 'custom';
      if (!groups[type]) groups[type] = [];
      groups[type].push(spec);
    }
    return groups;
  }

  /**
   * Conta specs por tipo.
   * @param {Array} specs
   * @returns {Object<string, number>}
   */
  countByType(specs = []) {
    const counts = {};
    for (const spec of specs) {
      const type = spec.components[COMPONENT_NAMES.IDENTITY]?.type ?? 'custom';
      counts[type] = (counts[type] ?? 0) + 1;
    }
    return counts;
  }

  // ── Ordenação topológica ────────────────────────────────────

  /**
   * Ordena specs para que pais venham antes de filhos.
   * Detecta `Links.parent` para ordenar.
   * @param {Array} specs
   * @returns {Array}
   */
  orderByHierarchy(specs = []) {
    const byId = new Map(specs.map(s => [s.id, s]));
    const ordered = [];
    const visited = new Set();
    const visiting = new Set();

    const visit = (spec) => {
      if (visited.has(spec.id)) return;
      if (visiting.has(spec.id)) {
        this.warnings.push({ id: spec.id, warning: 'ciclo na hierarquia de seeds' });
        return;
      }
      visiting.add(spec.id);

      const parent = spec.components[COMPONENT_NAMES.LINKS]?.parent;
      if (parent && byId.has(parent)) {
        visit(byId.get(parent));
      }
      visiting.delete(spec.id);
      visited.add(spec.id);
      ordered.push(spec);
    };

    for (const spec of specs) visit(spec);
    return ordered;
  }

  // ── Relatório ───────────────────────────────────────────────

  /**
   * Resumo da última execução de `build()`.
   * @returns {{errors:Array, warnings:Array}}
   */
  report() {
    return { errors: [...this.errors], warnings: [...this.warnings] };
  }

  /**
   * Limpa erros e warnings.
   */
  reset() {
    this.errors = [];
    this.warnings = [];
  }
}