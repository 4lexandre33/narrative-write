/**
 * @file inline-annotation.js
 * @module editor
 * @description Anotações à margem do editor (ex: `▏T5 · fear 2→5`).
 * @imports core/utils/dom
 * @importedBy editor/editor
 * @level 11
 */

import { el, clear } from '../core/utils/dom.js';

export class InlineAnnotation {
  /**
   * @param {HTMLElement} container — elemento ao lado do editor
   */
  constructor(container) {
    this.container = container;
    this.annotations = [];
    this._render();
  }

  /**
   * Adiciona uma anotação.
   * @param {Object} ann
   * @param {string} ann.tick
   * @param {string} ann.text
   * @param {number} ann.line   — número da linha do editor
   */
  add(ann) {
    this.annotations.push({ ...ann, id: this._nextId() });
    this._render();
  }

  /**
   * Remove todas as anotações de um tick.
   * @param {string} tick
   */
  removeByTick(tick) {
    this.annotations = this.annotations.filter(a => a.tick !== tick);
    this._render();
  }

  /**
   * Substitui todas as anotações.
   * @param {Array} list
   */
  set(list = []) {
    this.annotations = list.map(a => ({ ...a, id: this._nextId() }));
    this._render();
  }

  /**
   * Limpa tudo.
   */
  clear() {
    this.annotations = [];
    this._render();
  }

  /**
   * Retorna lista de anotações atuais.
   * @returns {Array}
   */
  list() {
    return [...this.annotations];
  }

  /**
   * Libera recursos.
   * Fase C — usado pelo UI test harness.
   */
  destroy() {
    this.annotations = [];
    if (this.container) {
      clear(this.container);
    }
    this.container = null;
  }

  // ── Internos ───────────────────────────────────────────────

  _nextId() {
    return `ann-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  _render() {
    if (!this.container) return;
    clear(this.container);
    for (const a of this.annotations) {
      const node = el('div', {
        class: 'editor-annotation',
        'data-line': String(a.line ?? 0),
        'data-tick': a.tick,
        title: `Clique para revelar o comando de ${a.tick}`,
      }, `▏${a.tick} · ${a.text}`);
      this.container.appendChild(node);
    }
  }
}