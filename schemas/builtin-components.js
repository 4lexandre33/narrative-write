/**
 * @file builtin-components.js
 * @module schemas
 * @description Registra os 25 schemas de componente builtin no ComponentRegistry.
 * @imports core/constants
 * @importedBy boot
 * @level 6
 */

import { COMPONENT_NAMES } from '../core/constants.js';

/**
 * Registra todos os schemas de componente builtin.
 * Idempotente se registry estiver limpo.
 *
 * @param {import('../ecs/component-registry.js').ComponentRegistry} registry
 */
export function registerBuiltinComponents(registry) {
  if (!registry || typeof registry.define !== 'function') {
    throw new Error('[builtin-components] registry inválido');
  }

  // ── Identity ──────────────────────────────────────────────
  registry.define(COMPONENT_NAMES.IDENTITY, {
    defaults: { description: '', type: 'custom' },
    required: ['id', 'name'],
    validate: (d) =>
      typeof d.id === 'string' && d.id.length > 0 &&
      typeof d.name === 'string' && d.name.length > 0,
  });

  // ── Links ─────────────────────────────────────────────────
  registry.define(COMPONENT_NAMES.LINKS, {
    defaults: {},
    required: [],
    validate: (d) => d && typeof d === 'object' && !Array.isArray(d),
  });

  // ── Stats ─────────────────────────────────────────────────
  registry.define(COMPONENT_NAMES.STATS, {
    defaults: {},
    required: [],
    validate: (d) => d && typeof d === 'object' && !Array.isArray(d),
  });

  // ── Flags ─────────────────────────────────────────────────
  registry.define(COMPONENT_NAMES.FLAGS, {
    defaults: { values: [] },
    required: ['values'],
    validate: (d) => Array.isArray(d.values),
  });

  // ── Enums ─────────────────────────────────────────────────
  registry.define(COMPONENT_NAMES.ENUMS, {
    defaults: {},
    required: [],
    validate: (d) => d && typeof d === 'object' && !Array.isArray(d),
  });

  // ── Tags ──────────────────────────────────────────────────
  registry.define(COMPONENT_NAMES.TAGS, {
    defaults: { values: [] },
    required: ['values'],
    validate: (d) => Array.isArray(d.values),
  });

  // ── Lists ─────────────────────────────────────────────────
  registry.define(COMPONENT_NAMES.LISTS, {
    defaults: {},
    required: [],
    validate: (d) => d && typeof d === 'object' && !Array.isArray(d),
  });

  // ── Texts ─────────────────────────────────────────────────
  registry.define(COMPONENT_NAMES.TEXTS, {
    defaults: {},
    required: [],
    validate: (d) => d && typeof d === 'object' && !Array.isArray(d),
  });

  // ── IsBlueprint ───────────────────────────────────────────
  registry.define(COMPONENT_NAMES.IS_BLUEPRINT, {
    defaults: { value: true },
    required: [],
    validate: (d) => typeof d.value === 'boolean',
  });

  // ── InstanceOf ────────────────────────────────────────────
  registry.define(COMPONENT_NAMES.INSTANCE_OF, {
    defaults: {},
    required: ['id'],
    validate: (d) => typeof d.id === 'string' && d.id.length > 0,
  });

  // ── InstanceCounter ───────────────────────────────────────
  registry.define(COMPONENT_NAMES.INSTANCE_COUNTER, {
    defaults: { value: 0 },
    required: [],
    validate: (d) => Number.isFinite(d.value),
  });

  // ── InstanceConfig ────────────────────────────────────────
  registry.define(COMPONENT_NAMES.INSTANCE_CONFIG, {
    defaults: {
      namePattern: '{bp} {n}',
      idPattern: '{bp}-{n}',
      startAt: 1,
      pad: 0,
    },
    required: [],
    validate: (d) =>
      typeof d.namePattern === 'string' &&
      typeof d.idPattern === 'string' &&
      Number.isFinite(d.startAt) &&
      Number.isFinite(d.pad),
  });

  // ── DerivesFrom ───────────────────────────────────────────
  registry.define(COMPONENT_NAMES.DERIVES_FROM, {
    defaults: { ids: [] },
    required: ['ids'],
    validate: (d) => Array.isArray(d.ids),
  });

  // ── MergePolicy ───────────────────────────────────────────
  registry.define(COMPONENT_NAMES.MERGE_POLICY, {
    defaults: {},
    required: [],
    validate: (d) => d && typeof d === 'object' && !Array.isArray(d),
  });

  // ── Tombstones ────────────────────────────────────────────
  registry.define(COMPONENT_NAMES.TOMBSTONES, {
    defaults: {},
    required: [],
    validate: (d) => d && typeof d === 'object' && !Array.isArray(d),
  });

  // ── Stale ─────────────────────────────────────────────────
  registry.define(COMPONENT_NAMES.STALE, {
    defaults: { value: true, cause: '' },
    required: ['value', 'at'],
    validate: (d) => d.value === true && typeof d.at === 'string',
  });

  // ── Orphaned ──────────────────────────────────────────────
  registry.define(COMPONENT_NAMES.ORPHANED, {
    defaults: { value: true, cause: '' },
    required: ['value', 'at'],
    validate: (d) => d.value === true && typeof d.at === 'string',
  });

  // ── Rule ──────────────────────────────────────────────────
  registry.define(COMPONENT_NAMES.RULE, {
    defaults: { if: 'true' },
    required: ['on', 'do'],
    validate: (d) =>
      typeof d.on === 'string' && d.on.length > 0 &&
      typeof d.do === 'string' && d.do.length > 0,
  });

  // ── RuleMeta ──────────────────────────────────────────────
  registry.define(COMPONENT_NAMES.RULE_META, {
    defaults: {
      mode: 'auto',
      tag: null,
      firedCount: 0,
      lastFiredAt: null,
      lastTrigger: null,
    },
    required: ['declaredAt'],
    validate: (d) =>
      typeof d.declaredAt === 'string' &&
      ['auto', 'manual'].includes(d.mode),
  });

  // ── Trigger ───────────────────────────────────────────────
  registry.define(COMPONENT_NAMES.TRIGGER, {
    defaults: {},
    required: ['value'],
    validate: (d) => typeof d.value === 'string' && d.value.length > 0,
  });

  // ── Body ──────────────────────────────────────────────────
  registry.define(COMPONENT_NAMES.BODY, {
    defaults: { text: '' },
    required: [],
    validate: (d) => typeof d.text === 'string',
  });

  // ── SnippetType ───────────────────────────────────────────
  registry.define(COMPONENT_NAMES.SNIPPET_TYPE, {
    defaults: {},
    required: ['value'],
    validate: (d) => ['text', 'template', 'menu', 'command'].includes(d.value),
  });

  // ── PlaceholderDefs ───────────────────────────────────────
  registry.define(COMPONENT_NAMES.PLACEHOLDER_DEFS, {
    defaults: { defs: [] },
    required: ['defs'],
    validate: (d) => Array.isArray(d.defs),
  });

  // ── Runs ──────────────────────────────────────────────────
  registry.define(COMPONENT_NAMES.RUNS, {
    defaults: { cmds: [] },
    required: ['cmds'],
    validate: (d) => Array.isArray(d.cmds),
  });

  // ── MenuOpts ──────────────────────────────────────────────
  registry.define(COMPONENT_NAMES.MENU_OPTS, {
    defaults: { options: [] },
    required: ['options'],
    validate: (d) => Array.isArray(d.options),
  });

  // ── UsageCount ────────────────────────────────────────────
  registry.define(COMPONENT_NAMES.USAGE_COUNT, {
    defaults: { value: 0 },
    required: [],
    validate: (d) => Number.isFinite(d.value) && d.value >= 0,
  });

  // ── Knows ─────────────────────────────────────────────────
  registry.define(COMPONENT_NAMES.KNOWS, {
    defaults: { facts: {} },
    required: ['facts'],
    validate: (d) => d.facts && typeof d.facts === 'object',
  });

  // ── Meta ──────────────────────────────────────────────────
  registry.define(COMPONENT_NAMES.META, {
    defaults: {
      builtin: false,
      dirty: false,
    },
    required: ['createdAt', 'updatedAt'],
    validate: (d) =>
      typeof d.createdAt === 'string' &&
      typeof d.updatedAt === 'string',
  });

  // ── SeedMeta ──────────────────────────────────────────────
  registry.define(COMPONENT_NAMES.SEED_META, {
    defaults: { version: '1.0', counts: {} },
    required: ['seededAt'],
    validate: (d) => typeof d.seededAt === 'string',
  });

  // ── BlueprintFields (não está em COMPONENT_NAMES, mas é usado) ─
  registry.define('BlueprintFields', {
    defaults: { copy: null, override: {} },
    required: [],
    validate: (d) =>
      (d.copy === null || Array.isArray(d.copy)) &&
      d.override && typeof d.override === 'object',
  });

  return registry;
}