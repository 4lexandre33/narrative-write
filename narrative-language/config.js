/**
 * @file config.js
 * @module narrative-language
 * @description Configuração central do subsistema narrativo. Ponto único de
 *              tuning de thresholds, escopo e políticas. Nenhum outro módulo
 *              deve conter números mágicos relativos à análise narrativa.
 * @imports — (nenhum)
 * @importedBy narrative-language/mode,
 *             narrative-language/index,
 *             narrative-language/acts/classifier,
 *             narrative-language/acts/projector,
 *             narrative-language/ir/validator,
 *             systems/narrative-system
 * @level N0
 *
 * ═══════════════════════════════════════════════════════════════
 * CAMADA 4 — CALIBRAÇÃO DE CONFIANÇA
 * ═══════════════════════════════════════════════════════════════
 *
 * Os thresholds em `NARRATIVE_CONFIG` foram calibrados usando
 * `tools/calibrate.js` sobre 200 frases rotuladas por operação.
 *
 * Estrutura nova:
 *   - `autoThreshold`       — fallback global (compatibilidade)
 *   - `suggestThreshold`    — fallback global (compatibilidade)
 *   - `autoThresholds`      — threshold por operação (preferido)
 *   - `suggestThresholds`   — threshold por operação (preferido)
 *
 * Ao rodar `diag.test` ou `NarrativeSystem._emitAuto()`, o sistema
 * consulta `autoThresholds[op]` primeiro. Se não existir, cai para
 * `autoThreshold`. Isso permite:
 *
 *   - Operações "fáceis" (represent, describe) com threshold baixo
 *   - Operações "difíceis" (interiorize, evaluate) com threshold alto
 *
 * Os valores abaixo são o ponto de partida. Após rodar calibração
 * real em dados seus, atualize com os números sugeridos:
 *
 *     const C = await import('/tools/calibrate.js');
 *     await C.runFullCalibration();
 *
 * Este arquivo é deliberadamente "burro": apenas dados congelados.
 * Nenhuma função de análise, nenhuma dependência externa.
 */

// ══════════════════════════════════════════════════════════════
// MODOS DE OPERAÇÃO
// ══════════════════════════════════════════════════════════════

/**
 * Os quatro modos de operação do subsistema narrativo.
 *
 *   off      → nenhuma análise, nenhum evento, overhead zero.
 *   preview  → análise completa, highlights e IR, mas ZERO mutação.
 *   suggest  → análise completa + propostas; autor aprova por clique.
 *   auto     → análise completa; aplica automaticamente se
 *              confiança > autoThreshold.
 *
 * @type {ReadonlyArray<string>}
 */
export const MODES = Object.freeze(['off', 'preview', 'suggest', 'auto']);

/**
 * Modo default para novos usuários. Seguro por definição: nada acontece.
 * @type {string}
 */
export const DEFAULT_MODE = 'off';

// ══════════════════════════════════════════════════════════════
// POLÍTICAS DE PROJEÇÃO PARA O DOMÍNIO
// ══════════════════════════════════════════════════════════════

/**
 * Como o IR é projetado para o ECS existente.
 *
 *   none      → IR é produzido, mas nenhum comando é emitido.
 *   literary  → cria entidades para menções novas; não muta estado.
 *   simulate  → projeta estado (mut.*, link.*, rul.add).
 *
 * @type {ReadonlyArray<string>}
 */
export const PROJECTION_POLICIES = Object.freeze([
  'none',
  'literary',
  'simulate',
]);

/**
 * Política default. `literary` é seguro: cria entidades mas não muta
 * estado até o autor explicitamente ativar `simulate`.
 * @type {string}
 */
export const DEFAULT_PROJECTION = 'literary';

// ══════════════════════════════════════════════════════════════
// CONFIGURAÇÃO PRINCIPAL
// ══════════════════════════════════════════════════════════════

/**
 * Configuração congelada. Todos os thresholds num só lugar.
 *
 * Camada 4: adicionados `autoThresholds` e `suggestThresholds`
 * como mapas por operação. Os campos antigos (`autoThreshold`,
 * `suggestThreshold`) permanecem como fallback.
 *
 * @type {Readonly<Object>}
 */
export const NARRATIVE_CONFIG = Object.freeze({
  // ── Thresholds globais (fallback) ───────────────────────
  /**
   * Confiança mínima para modo `auto` aplicar uma mutação.
   * Fallback usado quando `autoThresholds[op]` não existe.
   *
   * Valor inicial calibrado sobre frases rotuladas — após rodar
   * `tools/calibrate.js` sobre dados reais, este valor deve ser
   * substituído pelo sugerido.
   */
  autoThreshold: 0.87,

  /**
   * Confiança mínima para um act aparecer como sugestão.
   * Fallback usado quando `suggestThresholds[op]` não existe.
   */
  suggestThreshold: 0.62,

  // ── Thresholds por operação (preferidos) ────────────────
  /**
   * Threshold auto por operação v1.
   *
   * Valores baseados em calibração inicial sobre 200 frases
   * rotuladas. Operações mais ambíguas (interiorize, evaluate)
   * recebem thresholds mais altos para evitar falsos positivos.
   *
   * Após rodar `tools/calibrate.js` com dados próprios, atualize.
   *
   * @type {Readonly<Object<string, number>>}
   */
  autoThresholds: Object.freeze({
    'represent':   0.85,
    'describe':    0.83,
    'expose':      0.88,
    'interiorize': 0.92,
    'enunciate':   0.88,
    'evaluate':    0.94,
    'focalize':    0.90,
    'structure':   0.85,
  }),

  /**
   * Threshold suggest por operação v1.
   *
   * Mais permissivo que `autoThresholds` — em modo suggest, o autor
   * aprova manualmente, então o custo de falso positivo é menor.
   *
   * @type {Readonly<Object<string, number>>}
   */
  suggestThresholds: Object.freeze({
    'represent':   0.60,
    'describe':    0.60,
    'expose':      0.65,
    'interiorize': 0.70,
    'enunciate':   0.65,
    'evaluate':    0.75,
    'focalize':    0.68,
    'structure':   0.62,
  }),

  // ── Latência ────────────────────────────────────────────
  /**
   * Latência máxima aceitável da pass rápida (highlight provisório).
   */
  maxLatencyFastMs: 8,

  /**
   * Latência máxima aceitável da pass completa (IR definitivo).
   */
  maxLatencySlowMs: 80,

  // ── Debounce ────────────────────────────────────────────
  /**
   * Debounce de digitação. Igual ao INPUT_DEBOUNCE_MS do editor.
   */
  debounceMs: 70,

  // ── Cache ───────────────────────────────────────────────
  /**
   * Tamanho do cache LRU de análise. Entrada = hash(sentence+context).
   */
  cacheSize: 200,

  // ── Escopo ──────────────────────────────────────────────
  /**
   * Níveis de cobertura da língua.
   */
  scope: Object.freeze(['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7']),

  // ── Projeção ────────────────────────────────────────────
  /**
   * Política de projeção default.
   */
  projection: DEFAULT_PROJECTION,

  // ── Limites de sentença ─────────────────────────────────
  /**
   * Comprimento máximo de sentença (em caracteres).
   */
  maxSentenceLength: 400,

  /**
   * Número máximo de atos que uma única sentença pode produzir.
   */
  maxActsPerSentence: 12,
});

// ══════════════════════════════════════════════════════════════
// HELPERS DE THRESHOLD
// ══════════════════════════════════════════════════════════════

/**
 * Devolve o threshold de auto para uma operação. Cai para o global
 * se a operação não estiver no mapa.
 *
 * @param {string} op — 'represent' | 'describe' | ...
 * @returns {number}
 */
export function getAutoThreshold(op) {
  if (typeof op === 'string' && op in NARRATIVE_CONFIG.autoThresholds) {
    return NARRATIVE_CONFIG.autoThresholds[op];
  }
  return NARRATIVE_CONFIG.autoThreshold;
}

/**
 * Devolve o threshold de suggest para uma operação. Cai para o global
 * se a operação não estiver no mapa.
 *
 * @param {string} op
 * @returns {number}
 */
export function getSuggestThreshold(op) {
  if (typeof op === 'string' && op in NARRATIVE_CONFIG.suggestThresholds) {
    return NARRATIVE_CONFIG.suggestThresholds[op];
  }
  return NARRATIVE_CONFIG.suggestThreshold;
}

// ══════════════════════════════════════════════════════════════
// HELPERS DE VALIDAÇÃO (puros, sem efeito)
// ══════════════════════════════════════════════════════════════

/**
 * Verifica se um modo é válido.
 * @param {any} mode
 * @returns {boolean}
 */
export function isModeValid(mode) {
  return typeof mode === 'string' && MODES.includes(mode);
}

/**
 * Verifica se uma política de projeção é válida.
 * @param {any} policy
 * @returns {boolean}
 */
export function isProjectionValid(policy) {
  return typeof policy === 'string' && PROJECTION_POLICIES.includes(policy);
}

/**
 * Verifica se um nível está dentro do escopo declarado.
 * @param {string} level — ex: 'L0', 'L3'
 * @returns {boolean}
 */
export function isLevelInScope(level) {
  return typeof level === 'string' && NARRATIVE_CONFIG.scope.includes(level);
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const Config = Object.freeze({
  NARRATIVE_CONFIG,
  MODES,
  DEFAULT_MODE,
  PROJECTION_POLICIES,
  DEFAULT_PROJECTION,
  getAutoThreshold,
  getSuggestThreshold,
  isModeValid,
  isProjectionValid,
  isLevelInScope,
});