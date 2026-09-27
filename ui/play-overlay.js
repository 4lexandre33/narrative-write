/**
 * @file play-overlay.js
 * @module ui
 * @description Modo jogo interativo — terminal onde regras dirigem a narrativa.
 * @imports core/utils/dom
 * @importedBy boot.js
 * @level 12
 *
 * Fase D:
 *   - Aceita `{ container, target }` opcional.
 *   - `destroy()` remove o listener de `this.target` e o nó do DOM.
 */

import { el, clear } from '../core/utils/dom.js';

export class PlayOverlay {
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
    this.history = [];

    /** @type {Function|null} */
    this._onKeydown = null;

    this.node = el('div', { class: 'play-overlay' });
    const parent = container || document.body;
    parent.appendChild(this.node);

    this._wireEvents();
  }

  enter() {
    this.visible = true;
    this.machine.state.play = true;
    this.node.classList.add('visible');

    this._render();
    this._appendText('Você está em um lugar desconhecido.');
    this._focusInput();
  }

  exit() {
    this.visible = false;
    this.machine.state.play = false;
    this.node.classList.remove('visible');
  }

  toggle() {
    if (this.visible) this.exit();
    else this.enter();
  }

  destroy() {
    this.exit();
    if (this._onKeydown && this.target) {
      try { this.target.removeEventListener('keydown', this._onKeydown); }
      catch { /* isola */ }
      this._onKeydown = null;
    }
    if (this.node?.parentNode) this.node.parentNode.removeChild(this.node);
  }

  // ── Internos ───────────────────────────────────────────────

  _render() {
    clear(this.node);

    const header = el('div', { class: 'play-header' },
      '📖 Modo Jogo · /editor para sair');
    this.node.appendChild(header);

    this.textArea = el('div', { class: 'play-text' });
    this.node.appendChild(this.textArea);

    const inputRow = el('div', { class: 'play-input-row' });
    inputRow.appendChild(el('span', { class: 'prompt' }, '>'));
    this.input = el('input', { type: 'text' });
    inputRow.appendChild(this.input);
    this.node.appendChild(inputRow);

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const value = this.input.value.trim();
        this.input.value = '';
        if (value) this._submit(value);
      }
    });
  }

  _appendText(text) {
    this.history.push(text);
    if (!this.textArea) return;
    const line = el('div', {}, text);
    this.textArea.appendChild(line);
    this.textArea.scrollTop = this.textArea.scrollHeight;
  }

  _submit(value) {
    this._appendText(`> ${value}`);
    const result = this.machine.handleLine(value);
    if (!result.ok) {
      this._appendText(`⚠ ${result.error ?? 'erro'}`);
    }
  }

  _focusInput() {
    setTimeout(() => this.input?.focus(), 50);
  }

  _wireEvents() {
    if (!this.target) return;
    this._onKeydown = (e) => {
      if (!this.visible) return;
      if (e.key === 'Escape') { e.preventDefault(); this.exit(); }
    };
    this.target.addEventListener('keydown', this._onKeydown);
  }
}