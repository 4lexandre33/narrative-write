/**
 * @file constants.js
 * @module core
 * @description Todas as constantes globais — strings mágicas, prefixos, nomes de componente.
 * @imports — (nenhum)
 * @importedBy core/*, ecs/*, components/*, systems/*, ui/*, narrative-language/*
 * @level 0
 *
 * Fase 4 — Diagnostics: `'diag'` em `KNOWN_PREFIXES`.
 * Fase 5 — LUME: `'narr'` em `KNOWN_PREFIXES`.
 * Fase 13 — Hierarquia narrativa: `'phr'` em `KNOWN_PREFIXES`, 5 tipos
 *           expostos em `ENTITY_TYPES`, e `HIERARCHICAL_TYPES` definida.
 *
 * Fase 13.7 — Bugfix I-1 (auditoria 25/09/2026):
 *   `HIERARCHY_LEVELS` misturava `string` e `string[]`:
 *     ['package', 'category', 'set', ['phrase', 'placeholder-term']]
 *   Nenhum consumidor no projeto lidava com o array aninhado. Normalizado
 *   para lista plana (ordem dos níveis, não pares alternativos). Como o
 *   campo é puramente descritivo (não há leitor em runtime), a mudança
 *   não quebra nada.
 *
 * Fase 13.7 — Documentação:
 *   Comentário de `KNOWN_PREFIXES` expandido para refletir que `narr`
 *   aceita a ação `catalog` (adicionada ao `ParseSystem._parseNarr`
 *   na Fase 1 — bugfix P0-5).
 */

// ── Ciclo de vida ──────────────────────────────────────────────
export const TICK_PREFIX = 'T';
export const TIMELINE_DEFAULT = 'main';
export const TIMELINE_MAIN = 'main';
export const MAX_DEPTH = 5;
export const MAX_UNDO = 100;
export const DEBOUNCE_MS = 100;
export const CHECKPOINT_EVERY = 50;
export const KEEP_LAST = 100;
export const INPUT_DEBOUNCE_MS = 70;
export const MAX_CONTEXT_SUGGESTIONS = 120;

// ── Prefixos de shortcode ──────────────────────────────────────
export const TYPE_PREFIX = Object.freeze({
  character:  'CHR',
  location:   'LOC',
  item:       'ITM',
  faction:    'FCT',
  package:    'PKG',
  category:   'CAT',
  set:        'SET',
  event:      'EVT',
  scene:      'SCN',
  snippet:    'SNP',
  template:   'TPL',
  function:   'FUN',
  rule:       'RUL',
  custom:     'CUS',
  // Fase 13 — hierarquia narrativa
  phrase:             'PHR',
  'placeholder-term': 'PTM',
});

export const SHORTCODE_SEPARATOR = '-';

// ── Nomes canônicos de componente ──────────────────────────────
export const COMPONENT_NAMES = Object.freeze({
  IDENTITY:         'Identity',
  LINKS:            'Links',
  STATS:            'Stats',
  FLAGS:            'Flags',
  ENUMS:            'Enums',
  TAGS:             'Tags',
  LISTS:            'Lists',
  TEXTS:            'Texts',
  IS_BLUEPRINT:     'IsBlueprint',
  INSTANCE_OF:      'InstanceOf',
  INSTANCE_COUNTER: 'InstanceCounter',
  INSTANCE_CONFIG:  'InstanceConfig',
  DERIVES_FROM:     'DerivesFrom',
  MERGE_POLICY:     'MergePolicy',
  TOMBSTONES:       'Tombstones',
  STALE:            'Stale',
  ORPHANED:         'Orphaned',
  RULE:             'Rule',
  RULE_META:        'RuleMeta',
  TRIGGER:          'Trigger',
  BODY:             'Body',
  SNIPPET_TYPE:     'SnippetType',
  PLACEHOLDER_DEFS: 'PlaceholderDefs',
  RUNS:             'Runs',
  MENU_OPTS:        'MenuOpts',
  USAGE_COUNT:      'UsageCount',
  KNOWS:            'Knows',
  META:             'Meta',
  SEED_META:        'SeedMeta',
});

// ── Listas de proteção ─────────────────────────────────────────
export const NEVER_HERITABLE = new Set([
  COMPONENT_NAMES.IDENTITY,
  COMPONENT_NAMES.INSTANCE_OF,
  COMPONENT_NAMES.DERIVES_FROM,
  COMPONENT_NAMES.INSTANCE_COUNTER,
  COMPONENT_NAMES.META,
  COMPONENT_NAMES.IS_BLUEPRINT,
]);

export const NEVER_COPY = new Set([
  COMPONENT_NAMES.IDENTITY,
  COMPONENT_NAMES.LINKS,
  COMPONENT_NAMES.INSTANCE_OF,
  COMPONENT_NAMES.META,
  COMPONENT_NAMES.IS_BLUEPRINT,
]);

// ── Políticas de merge por componente ─────────────────────────
export const MERGE_MODES = Object.freeze({
  Stats:  Object.freeze(['override', 'additive', 'multiply', 'min', 'max']),
  Flags:  Object.freeze(['union', 'replace']),
  Tags:   Object.freeze(['union', 'replace']),
  Enums:  Object.freeze(['override']),
  Texts:  Object.freeze(['override', 'concat']),
  Lists:  Object.freeze(['replace', 'union', 'prepend', 'append']),
});

export const MERGE_DEFAULT = Object.freeze({
  Stats: 'override',
  Flags: 'union',
  Tags:  'union',
  Enums: 'override',
  Texts: 'override',
  Lists: 'replace',
});

// ── Tipos de entidade válidos ──────────────────────────────────
export const ENTITY_TYPES = Object.freeze([
  'character',
  'location',
  'item',
  'faction',
  'event',
  'scene',
  'snippet',
  'template',
  'function',
  'rule',
  'custom',
  // Fase 13 — tipos de hierarquia narrativa
  'package',
  'category',
  'set',
  'phrase',
  'placeholder-term',
]);

export const ENTITY_TYPE_LABEL = Object.freeze({
  character: 'Character',
  location:  'Location',
  item:      'Item',
  faction:   'Faction',
  event:     'Event',
  scene:     'Scene',
  snippet:   'Snippet',
  template:  'Template',
  function:  'Function',
  rule:      'Rule',
  custom:    'Custom',
  // Fase 13
  package:             'Package',
  category:            'Category',
  set:                 'Set',
  phrase:              'Phrase',
  'placeholder-term':  'Placeholder Term',
});

/**
 * Fase 13 — Tipos que participam da hierarquia narrativa.
 * Para esses tipos:
 *   - Nomes duplicados em pais diferentes são permitidos (id interno sufixado)
 *   - Resolução aceita caminho hierárquico `A.B.C.D`
 *
 * @type {ReadonlyArray<string>}
 */
export const HIERARCHICAL_TYPES = Object.freeze([
  'package',
  'category',
  'set',
  'phrase',
  'placeholder-term',
]);

/**
 * Níveis da hierarquia narrativa, do mais amplo ao mais específico.
 *
 * Fase 13.7 — Bugfix I-1:
 *   Antes era um array misto (`string` + `string[]`) que representava
 *   pares de tipos "equivalentes" num mesmo nível. Nenhum consumidor
 *   lia esse formato. Normalizado para lista plana na ordem correta
 *   dos níveis. Como o campo é descritivo (sem leitor em runtime),
 *   a mudança é segura.
 *
 * @type {ReadonlyArray<string>}
 */
export const HIERARCHY_LEVELS = Object.freeze([
  'package',
  'category',
  'set',
  'phrase',
  'placeholder-term',
]);

// ── Snippet types ──────────────────────────────────────────────
export const SNIPPET_TYPES = Object.freeze([
  'text',
  'template',
  'menu',
  'command',
]);

// ── Rule modes ─────────────────────────────────────────────────
export const RULE_MODES = Object.freeze(['auto', 'manual']);
export const RULE_TRIGGERS = Object.freeze([
  'component:updated',
  'component:added',
  'component:removed',
  'link:changed',
  'link:pruned',
  'entity:created',
  'entity:destroyed',
  'orphan:detected',
  'rule:fired',
  'knowledge:learned',
  'knowledge:forgotten',
]);

// ── Markers invisíveis (zero-width) ────────────────────────────
export const MARKERS = Object.freeze({
  BLOCK_START:  '\u2063\u2063\u2063',
  PAYLOAD_END:  '\u2063\u2064\u2063',
  BLOCK_END:    '\u2064\u2064\u2064',
  ZERO_BIT:     '\u200b',
  ONE_BIT:      '\u200c',
  REVEAL_START: '\u2062\u2063\u2062',
  REVEAL_END:   '\u2062\u2064\u2062',
});

// ── Prefixos de comando reconhecidos ───────────────────────────
//
// Cada prefixo é o primeiro segmento de um `verbo.subtipo` no editor.
// A lista é usada pelo `Router` (context-machine/router.js) para
// classificar a linha como 'command', e pelo `Lexer` (editor/lexer.js)
// para validar contextos de autocomplete.
//
// Ações disponíveis em cada verbo não são declaradas aqui — vivem nos
// respectivos parsers (`ParseSystem._parse*`) e no catálogo de UI
// (`editor/command-catalog.js`).
//
// Histórico:
//   - Fase 4:  `diag`     — comandos de diagnóstico
//   - Fase 5:  `narr`     — modos narrativos (off/preview/suggest/auto/
//                           status/stats/overrides/lexicon/catalog)
//   - Fase 13: `phr`      — frases da hierarquia narrativa
export const KNOWN_PREFIXES = Object.freeze([
  'ent', 'id', 'inst', 'mut', 'link',
  'que', 'sea', 'at', 'whe', 'tim', 'aud',
  'kno', 'frk', 'dif', 'rul', 'snip',
  'exp', 'help',
  'diag',         // Fase 4
  'narr',         // Fase 5 — ações: off/preview/suggest/auto/status/stats/overrides/lexicon/catalog
  'phr',          // Fase 13
]);

export const SLASH_COMMANDS = Object.freeze([
  'play', 'editor', 'help', 'roll', 'reset', 'save',
]);

// ── Categorias de render ───────────────────────────────────────
export const RENDER_KINDS = Object.freeze({
  TREE:          'tree',
  CARD:          'card',
  TABLE:         'table',
  GRAPH:         'graph',
  DIFF:          'diff',
  ALERTS:        'alerts',
  RESOLVE:       'resolve',
  MENU:          'menu',
  TUTORIAL_CARD: 'tutorial-card',
  CONFIRM:       'confirm',
  DIAGNOSTICS:   'diagnostics',
  NARRATIVE:     'narrative',
});

// ── Storage keys ───────────────────────────────────────────────
export const STORAGE_KEYS = Object.freeze({
  WORLD_MAIN:       'world:main',
  META_LAST_TICK:   'meta:lastTick',
  META_LAST_SAVED:  'meta:lastSavedAt',
  META_SCHEMA:      'meta:schemaVersion',
  META_COMPRESSION: 'meta:compression',
  META_FIRST_RUN:   'meta:firstRunAt',
  META_TIMELINE:    'meta:timeline',
  META_CHECKPOINTS: 'meta:checkpoints',
  ICON_POSITION:    'icon:pos',
  CONFIG_PREFIX:    'config:',
  CHECKPOINT_PREFIX:'checkpoint:',
  CHUNK_PREFIX:     'chunk:',
});

// ── Diagnostics (Fase 4) ───────────────────────────────────────
export const DIAG_MODES = Object.freeze(['off', 'light', 'full', 'dev']);

export const DIAG_STORAGE_KEYS = Object.freeze({
  LAST_BUNDLE: 'diag:lastBundle',
  SESSION_ID:  'diag:sessionId',
  MODE:        'diag:mode',
});

// ── Limites de storage por backend ─────────────────────────────
export const STORAGE_LIMITS = Object.freeze({
  gm:         5_000_000,
  localStorage: 5_000_000,
  indexedDB:  50_000_000,
  sheets:     10_000_000,
});

export const CHUNK_SIZE = 1_000_000;

// ── Schema version ─────────────────────────────────────────────
export const SCHEMA_VERSION = 1;
export const APP_VERSION = '1.0';
export const APP_NAME = 'narrative-ecs';

// ══════════════════════════════════════════════════════════════
// LUME — Narrativa natural PT-BR
// ══════════════════════════════════════════════════════════════

/**
 * Prefixos reservados à linguagem narrativa natural.
 * @type {ReadonlyArray<string>}
 */
export const NARRATIVE_PREFIXES = Object.freeze([
  'narr',
]);

/**
 * Chaves de persistência do subsistema narrativo.
 * @type {Readonly<Object<string,string>>}
 */
export const NARRATIVE_STORAGE_KEYS = Object.freeze({
  MODE:         'narr:narrative:mode',
  OVERRIDES:    'narr:narrative:overrides',
  USER_LEXICON: 'narr:narrative:user-lexicon',
  CACHE_PREFIX: 'narr:narrative:cache:',
});