/**
 * @file floating-menu.js
 * @module ui
 * @description Menu flutuante acionado por `.` no editor.
 *              Suporta dois modos:
 *                - 'snippet'  → triggers de snippets (comportamento histórico)
 *                - 'hierarchy'→ autocomplete de caminho hierárquico (Fase 13)
 * @imports core/utils/dom
 * @importedBy boot.js
 * @level 12
 *
 * Fase 13 — Autocomplete hierárquico:
 *   `open({ ..., mode:'hierarchy', insertRange })` e itens com `body`
 *   disparam `ui:snippet:insert` com `replaceRange` para que o editor
 *   substitua o `partial` digitado pelo nome completo.
 */

import { el, clear } from '../core/utils/dom.js';

export class FloatingMenu {
  /**
   * @param {Object} machine
   * @param {Object} [opts={}]
   * @param {HTMLElement} [opts.container=null]
   */
  constructor(machine, { container = null } = {}) {
    this.machine = machine;
    this.items = [];
    this.selected = 0;
    this.cursor = { x: 0, y: 0 };
    this.visible = false;
    this.trigger = '';
    this.mode = 'snippet';
    /** @type {{from:number,to:number}|null} */
    this.insertRange = null;

    this.node = el('div', { class: 'narrative-floating-menu' });
    const parent = container || document.body;
    parent.appendChild(this.node);

    this._wireEvents();
  }

  /**
   * Abre o menu.
   * @param {Object} opts
   * @param {string} opts.trigger
   * @param {Array} opts.items
   * @param {{x:number,y:number}} opts.cursor
   * @param {'snippet'|'hierarchy'} [opts.mode='snippet']
   * @param {{from:number,to:number}|null} [opts.insertRange=null]
   */
  open({ trigger, items, cursor, mode = 'snippet', insertRange = null }) {
    if (!Array.isArray(items) || items.length === 0) {
      this.close();
      return;
    }
    this.trigger = trigger;
    this.items = items;
    this.selected = 0;
    this.cursor = cursor ?? { x: 0, y: 0 };
    this.mode = mode;
    this.insertRange = insertRange;
    this.visible = true;

    this._render();
    this._position();
    this.node.classList.add('visible');
    this.node.classList.toggle('mode-hierarchy', mode === 'hierarchy');
    this.node.classList.toggle('mode-snippet', mode !== 'hierarchy');
  }

  /**
   * Atualiza a lista de itens.
   * @param {Array} items
   */
  update(items) {
    this.items = items ?? [];
    this.selected = 0;
    this._render();
    if (this.items.length === 0) this.close();
  }

  /**
   * Fecha o menu.
   */
  close() {
    this.visible = false;
    this.items = [];
    this.selected = 0;
    this.mode = 'snippet';
    this.insertRange = null;
    this.node.classList.remove('visible');
    this.node.classList.remove('mode-hierarchy');
    this.node.classList.remove('mode-snippet');
  }

  /**
   * Move a seleção.
   * @param {number} dir
   */
  moveSelection(dir) {
    const len = this.items.length;
    if (len === 0) return;
    this.selected = (this.selected + dir + len) % len;
    this._render();
    this._scrollToSelected();
  }

  /**
   * Retorna o item selecionado.
   * @returns {Object|null}
   */
  getSelected() {
    return this.items[this.selected] ?? null;
  }

  /**
   * Confirma o item selecionado.
   *
   * Ordem de execução:
   *   1. Menu com options → expande em sub-itens (não fecha).
   *   2. Fecha o menu.
   *   3. Se `run` → executa via machine.handleLine.
   *   4. Se `body` → emite `ui:snippet:insert` com `replaceRange`.
   *
   * @returns {boolean}
   */
  confirm() {
    const item = this.getSelected();
    if (!item) return false;

    // ── Caso 1: snippet de menu → expande ──────────────────
    const opts = item.def?.menu;
    if (Array.isArray(opts) && opts.length > 0 && !item._isSubItem) {
      this.items = opts.map(o => ({
        trigger: o.label ?? o.key,
        type: 'text',
        source: 'option',
        body: o.body ?? o.label ?? o.key,
        run: o.run ?? null,
        _isSubItem: true,
      }));
      this.selected = 0;
      this._render();
      this._position();
      return true;
    }

    // ── Caso 2/3: fecha PRIMEIRO e depois executa ──────────
    const body = item.body;
    const run = item.run;
    const replaceRange = this.insertRange;   // captura antes de close()

    this.close();

    if (run) {
      try {
        this.machine.handleLine(run);
      } catch (err) {
        console.error('[FloatingMenu] erro ao executar run:', run, err);
      }
    }

    if (body) {
      this.machine.bus.emit('ui:snippet:insert', {
        text: body,
        replaceRange,
      });
    }

    return true;
  }

  // ── Internos ───────────────────────────────────────────────

  _render() {
    clear(this.node);

    const headerText = this.mode === 'hierarchy'
      ? `Caminho: ${this.trigger || '(raiz)'}`
      : (this.trigger ? `Snippets com "${this.trigger}"` : 'Snippets');
    this.node.appendChild(el('div', { class: 'menu-header' }, headerText));

    if (this.items.length === 0) {
      this.node.appendChild(el('div', { class: 'menu-empty' }, 'Nenhum resultado'));
      return;
    }

    this.items.forEach((item, i) => {
      const cls = ['menu-item'];
      if (i === this.selected) cls.push('selected');

      const node = el('div', { class: cls.join(' '), 'data-index': String(i) });
      node.appendChild(el('span', { class: 'menu-item-label' }, item.trigger));

      // Badge de tipo (hierarquia)
      if (this.mode === 'hierarchy' && item.type) {
        node.appendChild(el('span', {
          class: `menu-item-badge badge-${item.type}`,
        }, item.type));
      }

      // Shortcode (hierarquia) ou source (snippet)
      if (this.mode === 'hierarchy' && item.shortId) {
        node.appendChild(el('span', { class: 'menu-item-meta' }, item.shortId));
      } else if (this.mode !== 'hierarchy' && !item._isSubItem) {
        const source = item.source === 'user' ? 'user' : 'builtin';
        node.appendChild(el('span', { class: 'menu-item-meta' }, source));
      }

      // Ícone de navegação: se tem filhos, mostra seta
      if (this.mode === 'hierarchy' && item.hasChildren) {
        node.appendChild(el('span', { class: 'menu-item-arrow' }, '›'));
      }

      // Snippet sub-item com run mostra raio
      if (item._isSubItem && item.run) {
        node.appendChild(el('span', { class: 'menu-item-meta' }, '⚡'));
      }

      this.node.appendChild(node);
    });
  }

  _position() {
    const w = this.node.offsetWidth || 260;
    const h = this.node.offsetHeight || 200;
    let { x, y } = this.cursor;

    if (x + w > window.innerWidth - 10) x = window.innerWidth - w - 10;
    if (y + h > window.innerHeight - 10) y = y - h - 20;
    if (x < 10) x = 10;
    if (y < 10) y = 10;

    this.node.style.left = `${x}px`;
    this.node.style.top = `${y}px`;
  }

  _scrollToSelected() {
    const node = this.node.querySelector(`.menu-item[data-index="${this.selected}"]`);
    if (node) node.scrollIntoView({ block: 'nearest' });
  }

  _wireEvents() {
    this.node.addEventListener('click', (e) => {
      const item = e.target.closest('.menu-item');
      if (!item) return;
      this.selected = parseInt(item.dataset.index, 10);
      this.confirm();
    });
  }

  destroy() {
    if (this.node?.parentNode) this.node.parentNode.removeChild(this.node);
  }
}