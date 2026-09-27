/**
 * @file focus-manager.js
 * @module ui
 * @description Gerencia ciclo de foco entre painéis (Tab/Shift+Tab).
 * @imports core/utils/dom
 * @importedBy ui/keyboard-router
 * @level 12
 */

import { focusSilently } from '../core/utils/dom.js';

export class FocusManager {
  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.panelLeft
   * @param {HTMLElement} opts.panelRight
   * @param {HTMLElement} opts.editor
   */
  constructor({ panelLeft, panelRight, editor }) {
    this.order = [
      { name: 'editor', el: editor },
      { name: 'panel-left', el: panelLeft },
      { name: 'panel-right', el: panelRight },
    ];
    this.current = 0;
  }

  cycle(direction = 1) {
    const len = this.order.length;
    this.current = (this.current + direction + len) % len;
    this._applyFocus();
    return this.order[this.current].name;
  }

  focus(name) {
    const idx = this.order.findIndex(o => o.name === name);
    if (idx < 0) return null;
    this.current = idx;
    this._applyFocus();
    return name;
  }

  focusEditor() {
    this.focus('editor');
  }

  currentPanel() {
    return this.order[this.current]?.name ?? 'editor';
  }

  /**
   * Libera recursos.
   * Fase C — remove a classe `panel-focus` de todos os elementos
   * e esvazia a ordem. Usado pelo UI test harness.
   */
  destroy() {
    for (const item of this.order) {
      if (!item.el) continue;
      try { item.el.classList.remove('panel-focus'); } catch { /* isola */ }
    }
    this.order = [];
    this.current = 0;
  }

  // ── Internos ───────────────────────────────────────────────

  _applyFocus() {
    for (let i = 0; i < this.order.length; i++) {
      const item = this.order[i];
      if (!item.el) continue;
      if (i === this.current) {
        item.el.classList.add('panel-focus');
        focusSilently(item.el);
      } else {
        item.el.classList.remove('panel-focus');
      }
    }
  }
}