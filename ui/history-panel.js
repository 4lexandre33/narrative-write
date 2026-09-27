/**
 * @file history-panel.js
 * @module ui
 * @description Painel de histórico navegável (Ctrl+H).
 * @imports core/utils/dom
 * @importedBy boot.js
 * @level 12
 *
 * Fase D:
 *   - Aceita `{ container, target }` opcional.
 *   - `destroy()` remove o nó do DOM.
 *
 * Fase 13.7 — Fiação órfã (auditoria 25/09/2026):
 *   - Implementado filtro do input de busca (S-7). Antes o input era
 *     renderizado mas nunca escutava `input` — digitar não filtrava.
 *   - Removido listener `keydown` local (S-8). Era redundante com o
 *     `KeyboardRouter`, que escuta em capture phase e faz
 *     `e.stopPropagation()` quando o painel está visível — o listener
 *     local (capture=false) nunca era alcançado.
 *   - `moveSelection()` agora opera sobre `visibleEntries` (filtrado).
 */

import { el, clear } from '../core/utils/dom.js';

export class HistoryPanel {
  /**
   * @param {Object} machine
   * @param {Object} [opts={}]
   * @param {HTMLElement} [opts.container=null]
   * @param {EventTarget} [opts.target=document]
   */
  constructor(machine, { container = null, target = document } = {}) {
    this.machine = machine;
    this.target = target;
    this.visible = false;
    this.selected = 0;

    /** @type {Array<Object>} entradas completas (não filtradas) */
    this.entries = [];

    /** @type {Array<Object>} entradas visíveis (após filtro) */
    this.visibleEntries = [];

    /** @type {string} query atual do filtro */
    this.filterQuery = '';

    this.node = el('div', { class: 'history-panel' });
    const parent = container || document.body;
    parent.appendChild(this.node);
  }

  // ═══════════════════════════════════════════════════════════
  // API pública
  // ═══════════════════════════════════════════════════════════

  open() {
    const timeline = this.machine.systems.get('TimelineSystem');
    const entries = timeline?.getTimeline() ?? [];
    this.entries = entries.slice().reverse();
    this.visibleEntries = [...this.entries];
    this.filterQuery = '';
    this.selected = 0;
    this.visible = true;
    this._render();
    this.node.classList.add('visible');
  }

  close() {
    this.visible = false;
    this.node.classList.remove('visible');
  }

  toggle() {
    if (this.visible) this.close();
    else this.open();
  }

  /**
   * Aplica filtro textual. Atualiza `visibleEntries` e re-renderiza.
   * @param {string} query
   */
  filter(query) {
    const q = String(query ?? '').toLowerCase().trim();
    this.filterQuery = q;
    if (!q) {
      this.visibleEntries = [...this.entries];
    } else {
      this.visibleEntries = this.entries.filter((entry) => {
        const haystack = this._summarize(entry).toLowerCase();
        return haystack.includes(q);
      });
    }
    // Reset da seleção para o topo da lista filtrada
    this.selected = 0;
    this._render();
  }

  moveSelection(dir) {
    const len = this.visibleEntries.length;
    if (len === 0) return;
    this.selected = Math.max(0, Math.min(len - 1, this.selected + dir));
    this._render();
    this._scrollToSelected();
  }

  jumpToSelected() {
    const entry = this.visibleEntries[this.selected];
    if (!entry) return;
    try {
      this.machine.restoreFrom(entry.tick);
      this.machine.bus.emit('ui:history:jump', { tick: entry.tick });
    } catch (err) {
      this.machine.bus.emit('ui:flash-error', { message: err.message });
    }
  }

  destroy() {
    if (this.node?.parentNode) this.node.parentNode.removeChild(this.node);
  }

  // ═══════════════════════════════════════════════════════════
  // Internos
  // ═══════════════════════════════════════════════════════════

  _render() {
    clear(this.node);

    const totalCount = this.entries.length;
    const shown = this.visibleEntries.length;
    const headerText = shown === totalCount
      ? `Histórico (${totalCount})`
      : `Histórico (${shown}/${totalCount})`;

    const header = el('div', { class: 'history-header' }, headerText);
    const closeBtn = el('button', { class: 'header-btn' }, '✕');
    closeBtn.addEventListener('click', () => this.close());
    header.appendChild(closeBtn);
    this.node.appendChild(header);

    // Search input
    const search = el('div', { class: 'history-search' });
    const input = el('input', {
      type: 'text',
      placeholder: 'Buscar...',
      value: this.filterQuery,
    });

    input.addEventListener('input', () => {
      this.filter(input.value);
      // Re-foca o input após re-render (o filtro reconstrói o DOM)
      setTimeout(() => {
        const newInput = this.node.querySelector('.history-search input');
        if (newInput) {
          newInput.focus();
          // Coloca o cursor no fim do valor
          const len = newInput.value.length;
          try { newInput.setSelectionRange(len, len); } catch { /* isola */ }
        }
      }, 0);
    });

    search.appendChild(input);
    this.node.appendChild(search);

    // Lista
    const list = el('div', { class: 'history-list' });

    if (this.visibleEntries.length === 0) {
      list.appendChild(el('div', { class: 'history-empty' },
        this.filterQuery ? 'Nada corresponde à busca' : 'Sem histórico'));
    } else {
      this.visibleEntries.forEach((entry, i) => {
        const cls = ['history-entry'];
        if (i === this.selected) cls.push('selected');
        if (entry.metadata?.undone) cls.push('undone');
        if (entry.tick === this.machine.getTick()) cls.push('current');

        const row = el('div', { class: cls.join(' '), 'data-index': String(i) });
        row.appendChild(el('span', { class: 'history-entry-tick' }, entry.tick));
        row.appendChild(el('span', { class: 'history-entry-summary' }, this._summarize(entry)));
        list.appendChild(row);
      });
    }

    this.node.appendChild(list);

    // Footer
    const footer = el('div', { class: 'history-footer' },
      `↑↓ navegar · Enter ir · Esc fechar · ${shown} entradas`);
    this.node.appendChild(footer);

    this._bindListEvents();
  }

  _summarize(entry) {
    if (entry.kind === 'init') return 'snapshot inicial';
    if (entry.mutation) {
      return `${entry.mutation.op} ${entry.mutation.target}.${entry.mutation.path}`;
    }
    if (entry.created) return `create ${entry.created.id}`;
    if (entry.link) return `link.${entry.link.action} ${entry.link.from}`;
    return entry.kind;
  }

  _scrollToSelected() {
    const row = this.node.querySelector(`.history-entry[data-index="${this.selected}"]`);
    if (row && typeof row.scrollIntoView === 'function') {
      try { row.scrollIntoView({ block: 'nearest' }); } catch { /* isola */ }
    }
  }

  _bindListEvents() {
    this.node.querySelectorAll('.history-entry').forEach((node) => {
      node.addEventListener('click', () => {
        this.selected = parseInt(node.dataset.index, 10);
        this.jumpToSelected();
      });
    });
  }
}