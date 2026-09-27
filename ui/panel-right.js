/**
 * @file panel-right.js
 * @module ui
 * @description Dispatcher do painel direito. Delega renderização para
 *              `ui/renderers/*` por `payload.kind`.
 * @imports core/utils/dom, ui/renderers/*
 * @importedBy boot.js
 * @level 12
 *
 * Fase 13.7 — Refatoração estrutural (auditoria 25/09/2026):
 *   Este arquivo tinha 44 KB. Dividido em:
 *     - este dispatcher (~200 linhas)
 *     - renderers/card-renderer.js
 *     - renderers/table-renderer.js
 *     - renderers/narrative-renderer.js
 *     - renderers/diagnostics-renderer.js
 *
 *   Os renderers são funções puras `(payload, ctx) => HTMLElement`.
 *   `ctx` expõe `machine`, `emit`, `handleLine`, `appendActions`,
 *   `formatValue`, `alertMessage`.
 *
 * Fase 13.7 — Bugfix (auditoria 25/09/2026):
 *   A chave `tutorial-card` no objeto `_DISPATCH` estava sem aspas.
 *   Como contém um hífen (`-`), o parser JavaScript lia
 *   `tutorial-card` como `tutorial - card` — SyntaxError no topo do
 *   módulo, quebrando o carregamento de `panel-right.js` e, por
 *   consequência, todo o bootstrap da UI.
 *
 *   Correção: chave entre aspas. Padronizado também o alinhamento
 *   do objeto para evitar futuras regressões do mesmo tipo.
 */

import { el, clear } from '../core/utils/dom.js';

import * as Card from './renderers/card-renderer.js';
import * as Table from './renderers/table-renderer.js';
import * as Narrative from './renderers/narrative-renderer.js';
import * as Diagnostics from './renderers/diagnostics-renderer.js';

// ══════════════════════════════════════════════════════════════
// DISPATCHER
// ══════════════════════════════════════════════════════════════
//
// Mapa `kind → função de renderização`.
//
// ATENÇÃO: chaves que contêm `-` (hífen) DEVEM estar entre aspas.
// `tutorial-card` sem aspas vira expressão aritmética e quebra o
// parser no carregamento do módulo.

/**
 * @type {Readonly<Object<string, Function>>}
 * @private
 */
const _DISPATCH = Object.freeze({
  // ── Cards ───────────────────────────────────────────────
  'card':          Card.renderCard,
  'confirm':       Card.renderConfirm,
  'tutorial-card': Card.renderTutorial,
  'resolve':       Card.renderResolve,
  'menu':          Card.renderMenu,
  'diff':          Card.renderDiff,
  'graph':         Card.renderGraph,

  // ── Tabelas ─────────────────────────────────────────────
  'table':  Table.renderTable,
  'alerts': Table.renderAlerts,
  'tree':   Table.renderTree,

  // ── Narrativa / Diagnostics ─────────────────────────────
  'narrative':   Narrative.renderNarrative,
  'diagnostics': Diagnostics.renderDiagnostics,
});

// ══════════════════════════════════════════════════════════════
// CLASSE
// ══════════════════════════════════════════════════════════════

export class PanelRight {
  /**
   * @param {Object} machine
   * @param {HTMLElement} container
   */
  constructor(machine, container) {
    this.machine = machine;
    this.container = container;
    this.container.classList.add('panel-right');
    this.payload = null;
    this._render();
  }

  // ── API pública ────────────────────────────────────────────

  /**
   * Atualiza o painel com um novo payload.
   * @param {Object} payload
   */
  update(payload) {
    if (!payload) return;
    this.payload = payload;
    this._render();
  }

  /**
   * Limpa o painel.
   */
  close() {
    this.payload = null;
    this._render();
  }

  /**
   * Remove os filhos do container.
   * Fase C — usado pelo UI test harness.
   */
  destroy() {
    clear(this.container);
    this.payload = null;
  }

  // ── Internos ───────────────────────────────────────────────

  /**
   * @private
   */
  _render() {
    clear(this.container);

    if (!this.payload) {
      this.container.appendChild(
        el('div', { class: 'tree-empty' }, 'Sem resultados')
      );
      return;
    }

    const renderer = _DISPATCH[this.payload.kind] ?? Card.renderGeneric;
    const ctx = this._ctx();

    try {
      const node = renderer(this.payload, ctx);
      if (node) this.container.appendChild(node);
    } catch (err) {
      this.container.appendChild(
        el('div', { class: 'tree-empty' },
          `Erro ao renderizar: ${err.message}`)
      );
      console.error('[PanelRight] renderer falhou:', err);
    }
  }

  /**
   * Constrói o contexto passado aos renderers.
   * @returns {Object}
   * @private
   */
  _ctx() {
    return {
      machine: this.machine,
      emit: (event, payload) => this.machine.bus.emit(event, payload),
      handleLine: (line) => this.machine.handleLine(line),
      appendActions: this._appendActions.bind(this),
      formatValue: this._formatValue.bind(this),
      alertMessage: this._alertMessage.bind(this),
    };
  }

  /**
   * Anexa uma linha de botões de ação a um card.
   * @private
   */
  _appendActions(card, actions) {
    if (!Array.isArray(actions) || actions.length === 0) return;

    const row = el('div', { class: 'result-actions' });
    for (const act of actions) {
      const btn = el('button', { class: 'result-action-btn' }, act.label);
      btn.addEventListener('click', () => {
        if (!act.run) return;
        try {
          this.machine.handleLine(act.run);
        } catch (err) {
          console.error('[PanelRight] ação falhou:', act.run, err);
        }
      });
      row.appendChild(btn);
    }
    card.appendChild(row);
  }

  /**
   * Formata um valor para exibição em card/tabela.
   * @private
   */
  _formatValue(v) {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'object') {
      try {
        return JSON.stringify(v);
      } catch {
        return '[objeto]';
      }
    }
    return String(v);
  }

  /**
   * Monta a descrição textual de um alerta de auditoria.
   * @private
   */
  _alertMessage(alert) {
    if (!alert || typeof alert !== 'object') return '';

    // Se o alerta já tem `message` (auditoria enriquecida), usa direto
    if (typeof alert.message === 'string' && alert.message.length > 0) {
      return alert.message;
    }

    const parts = [];
    if (alert.from)     parts.push(`from: ${alert.from}`);
    if (alert.rel)      parts.push(`rel: ${alert.rel}`);
    if (alert.to)       parts.push(`to: ${alert.to}`);
    if (alert.instance) parts.push(`inst: ${alert.instance}`);
    if (alert.rule)     parts.push(`rule: ${alert.rule}`);
    if (alert.shortId)  parts.push(`id: ${alert.shortId}`);

    if (parts.length > 0) return parts.join(' · ');

    try {
      return JSON.stringify(alert);
    } catch {
      return '(alerta não serializável)';
    }
  }
}