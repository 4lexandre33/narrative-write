/**
 * @file config.js
 * @module diagnostics
 * @description Configuração central da DiagnosticsSuite.
 * @imports — (nenhum)
 * @importedBy diagnostics/index, diagnostics/structured-logger,
 *             diagnostics/flight-recorder, diagnostics/instrumentation
 * @level 9
 *
 * Modos de operação:
 *   off    → nada gravado, zero overhead
 *   light  → eventos-chave apenas (mutations, erros, regras)
 *   full   → tudo: eventos, logs, spans, invariantes, contratos,
 *            expectativas, pipeline, RCA, snapshots
 *   dev    → full + health probes + fuzzer + fault injector + replay
 *
 * Fase 8 — LUME: adicionada categoria `narrative` com eventos do
 * subsistema narrativo.
 *
 * Fase 13.7 — Limpeza (auditoria 25/09/2026):
 *   Removidos `narrativeEventNames`, `isNarrativeEvent` e `categoryOf`
 *   — nunca importados. A categoria `narrative` em
 *   `DIAG_EVENT_CATEGORIES` permanece (é lida por filtros da UI).
 */

/**
 * Modos válidos.
 * @type {ReadonlyArray<string>}
 */
export const DIAG_MODES = Object.freeze(['off', 'light', 'full', 'dev']);

/**
 * Defaults globais da suíte.
 * @type {Readonly<Object>}
 */
export const DIAG_DEFAULTS = Object.freeze({
  mode: 'full',
  ringSize: 10_000,
  logRingSize: 5_000,
  spanRingSize: 2_000,
  includeEvents: true,
  includeLogs: true,
  includeSpans: true,
  autoStart: true,
  timestamp: true,
  sessionId: null,
});

/**
 * Categorização de eventos do bus, para facilitar filtros e agrupamento.
 * Não restringe o que é gravado — só classifica.
 *
 * @type {Readonly<Object<string, ReadonlyArray<string>>>}
 */
export const DIAG_EVENT_CATEGORIES = Object.freeze({
  lifecycle: Object.freeze([
    'boot:complete',
    'machine:reset',
    'machine:restored',
    'world:cleared',
    'world:destroyed',
    'tick:advanced',
    'system:registered',
  ]),
  mutation: Object.freeze([
    'entity:created',
    'entity:destroyed',
    'component:added',
    'component:updated',
    'component:removed',
  ]),
  link: Object.freeze([
    'links:pruned',
    'link-index:rebuilt',
    'link-index:drift',
  ]),
  rule: Object.freeze([
    'rule:fired',
    'rule:skipped',
    'rule:cycle',
    'rule:error',
    'rule:overflow',
    'rule:evaluated',
  ]),
  render: Object.freeze([
    'render:left',
    'render:right',
    'render:annotation',
  ]),
  persist: Object.freeze([
    'persist:flush',
    'persist:saved',
    'persist:failed',
  ]),
  ui: Object.freeze([
    'ui:menu:open',
    'ui:menu:close',
    'ui:snippet:insert',
    'ui:flash-error',
    'ui:roll:start',
    'ui:roll:committed',
    'ui:roll:cancelled',
    'ui:inline:activated',
    'ui:inline:committed',
    'ui:inline:cancelled',
    'ui:shortcut',
    'ui:panel:toggle',
    'ui:panel:left:toggle',
    'ui:panel:right:toggle',
    'ui:history:jump',
    'ui:block:revealed',
  ]),
  export: Object.freeze([
    'export:ready',
  ]),
  diagnostics: Object.freeze([
    'diag:suite:installed',
    'diag:suite:mode-changed',
    'diag:handleLine:start',
    'diag:handleLine:end',
    'diag:system:run',
    'diag:system:error',
    'diag:contract:violated',
    'diag:health:anomaly',
  ]),
  validation: Object.freeze([
    'validation:warnings',
    'validation:soft-fail',
    'pipeline:system-missing',
  ]),
  narrative: Object.freeze([
    'narrative:preview',
    'narrative:suggest',
    'narrative:diagnostic',
    'narrative:act:applied',
    'narrative:act:focus',
    'narrative:degraded',
    'narr:mode:set',
    'narr:mode:changed',
    'narr:override:set',
    'narr:override:clear',
    'narr:override:clearAll',
    'narr:lexicon:forget',
    'narr:lexicon:clearAll',
  ]),
});

/**
 * Cria uma configuração mesclando defaults com overrides.
 * Ignora chaves desconhecidas para evitar poluição.
 * @param {Object} [overrides={}]
 * @returns {Object}
 */
export function createConfig(overrides = {}) {
  const out = { ...DIAG_DEFAULTS };
  for (const [k, v] of Object.entries(overrides || {})) {
    if (Object.prototype.hasOwnProperty.call(DIAG_DEFAULTS, k)) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Detecta se está em ambiente de desenvolvimento.
 * @returns {boolean}
 */
export function isDevEnvironment() {
  if (typeof window === 'undefined') return false;
  try {
    const host = window.location?.hostname ?? '';
    return host === 'localhost' || host === '127.0.0.1' || host === '';
  } catch {
    return false;
  }
}

/**
 * Escolhe o modo default com base no ambiente.
 * @returns {string}
 */
export function pickDefaultMode() {
  return isDevEnvironment() ? 'full' : 'light';
}

/**
 * Matriz de features por modo.
 *
 * @type {Readonly<Object<string, Readonly<Object<string, boolean>>>>}
 */
const MODE_MATRIX = Object.freeze({
  off: Object.freeze({
    events: false, logs: false, spans: false,
    invariants: false, contracts: false,
    expectations: false, pipeline: false,
    rca: false, snapshot: false,
    health: false, fuzz: false, injection: false, replay: false,
  }),
  light: Object.freeze({
    events: true, logs: false, spans: false,
    invariants: false, contracts: false,
    expectations: false, pipeline: false,
    rca: false, snapshot: false,
    health: false, fuzz: false, injection: false, replay: false,
  }),
  full: Object.freeze({
    events: true, logs: true, spans: true,
    invariants: true, contracts: true,
    expectations: true, pipeline: true,
    rca: true, snapshot: true,
    health: false, fuzz: false, injection: false, replay: false,
  }),
  dev: Object.freeze({
    events: true, logs: true, spans: true,
    invariants: true, contracts: true,
    expectations: true, pipeline: true,
    rca: true, snapshot: true,
    health: true, fuzz: true, injection: true, replay: true,
  }),
});

/**
 * Lista de todas as features conhecidas.
 * @type {ReadonlyArray<string>}
 */
export const DIAG_FEATURES = Object.freeze([
  'events', 'logs', 'spans',
  'invariants', 'contracts',
  'expectations', 'pipeline',
  'rca', 'snapshot',
  'health', 'fuzz', 'injection', 'replay',
]);

/**
 * Verifica se um modo inclui uma feature.
 * @param {string} mode
 * @param {string} feature
 * @returns {boolean}
 */
export function modeIncludes(mode, feature) {
  return MODE_MATRIX[mode]?.[feature] ?? false;
}

/**
 * Retorna a matriz completa de um modo.
 * @param {string} mode
 * @returns {Object<string, boolean>}
 */
export function modeMatrix(mode) {
  const m = MODE_MATRIX[mode];
  return m ? { ...m } : {};
}

/**
 * Lista as features ativas num modo.
 * @param {string} mode
 * @returns {string[]}
 */
export function enabledFeatures(mode) {
  const m = MODE_MATRIX[mode];
  if (!m) return [];
  return DIAG_FEATURES.filter((f) => m[f] === true);
}

/**
 * Valida se uma string é um modo conhecido.
 * @param {string} mode
 * @returns {boolean}
 */
export function isValidMode(mode) {
  return DIAG_MODES.includes(mode);
}