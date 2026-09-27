/**
 * @file pipeline.js
 * @module context-machine
 * @description Define a ordem dos sistemas por tipo de entrada.
 * @imports — (nenhum)
 * @importedBy context-machine/machine
 * @level 10
 *
 * Fase 2 — Diagnostics: `'DiagnosticsSystem'` é inserido em duas posições
 * no pipeline `command`:
 *   - PRIMEIRA: para capturar o início da execução (linha crua, timestamp)
 *   - ÚLTIMA:  para capturar o resultado final após todos os sistemas
 *
 * Fase 5 — LUME: `'NarrativeSystem'` é inserido em:
 *   - `command`: APÓS `CommandSystem`, para tratar `narr.*`
 *   - `prose`:   substitui o array vazio. Toda prosa passa por aqui.
 *
 * Fase 13 — Hierarquia: `'PhraseSystem'` inserido após `ManualRuleSystem`
 * para tratar `phr.*`.
 */

const PIPELINES = Object.freeze({
  command: Object.freeze([
    // ── Diagnóstico: início ─────────────────────────────────
    'DiagnosticsSystem',

    // ── Pipeline funcional ──────────────────────────────────
    'ParseSystem',
    'CommandSystem',

    // ── Narrativa natural (narr.* apenas) ───────────────────
    'NarrativeSystem',

    'EntitySystem',
    'IdentitySystem',
    'InstantiationSystem',
    'InheritanceSystem',
    'MutationSystem',
    'LinkSystem',
    'LinkQuerySystem',
    'QuerySystem',
    'SearchQuerySystem',
    'KnowledgeSystem',
    'SnippetSystem',
    'TemplateSystem',
    'RuleSystem',
    'ManualRuleSystem',
    'PhraseSystem',        // ← Fase 13 — phr.*
    'TimelineSystem',
    'StaleSystem',
    'AuditSystem',
    'ForkSystem',
    'DiffSystem',
    'ValidationSystem',
    'ExportSystem',
    'HelpSystem',
    'RenderSystem',
    'PersistenceSystem',

    // ── Diagnóstico: fim ────────────────────────────────────
    'DiagnosticsSystem',
  ]),
  'slash-command': Object.freeze([
    'ParseSystem',
    'SlashCommandSystem',
    'RenderSystem',
    'PersistenceSystem',
  ]),
  prose: Object.freeze([
    // ── Narrativa natural (Fase 5) ──────────────────────────
    'NarrativeSystem',
  ]),
  empty: Object.freeze([]),
});

export class Pipeline {
  constructor() {
    this.orders = { ...PIPELINES };
  }

  /**
   * Retorna a ordem dos sistemas para um tipo.
   * @param {string} kind
   * @returns {string[]}
   */
  orderFor(kind) {
    return [...(this.orders[kind] || [])];
  }

  /**
   * Verifica se um tipo tem pipeline registrado.
   * @param {string} kind
   * @returns {boolean}
   */
  has(kind) {
    return Array.isArray(this.orders[kind]);
  }

  /**
   * Tamanho do pipeline para um tipo.
   * @param {string} kind
   * @returns {number}
   */
  size(kind) {
    return (this.orders[kind] || []).length;
  }

  /**
   * Insere um sistema em posição específica (para extensões futuras).
   * @param {string} kind
   * @param {string} systemName
   * @param {number} [index=-1]  — -1 = append
   */
  insert(kind, systemName, index = -1) {
    if (!this.orders[kind]) this.orders[kind] = [];
    const list = [...this.orders[kind]];
    if (index < 0) list.push(systemName);
    else list.splice(index, 0, systemName);
    this.orders[kind] = list;
  }

  /**
   * Remove um sistema de todos os pipelines.
   * @param {string} systemName
   */
  remove(systemName) {
    for (const kind of Object.keys(this.orders)) {
      this.orders[kind] = this.orders[kind].filter(s => s !== systemName);
    }
  }

  /**
   * Lista todos os tipos registrados.
   * @returns {string[]}
   */
  kinds() {
    return Object.keys(this.orders);
  }
}