/**
 * @file roll-overlay.js
 * @module ui
 * @description Overlay fullscreen para o roll mode (sorteio com Space).
 * @imports core/utils/dom
 * @importedBy boot.js
 * @level 12
 *
 * Fase D:
 *   - Aceita `{ container, target }` opcional. Sem container, usa
 *     `document.body` (histórico). Com container, anexa nele.
 *   - `destroy()` remove o listener de `this.target` e o nó do DOM.
 */

import { el, clear } from '../core/utils/dom.js';

export class RollOverlay {
  /**
   * @param {Object} machine
   * @param {Object} [opts={}]
   * @param {HTMLElement} [opts.container=null]
   * @param {EventTarget} [opts.target=document]
   */
  constructor(machine, { container = null, target = document } = {}) {
    this.machine = machine;
    this.target = target;
    this.sequence = [];
    this.fixed = [];
    this.currentLine = 0;
    this.currentText = '';
    this.ticker = null;
    this.intervalMs = 800;
    this.visible = false;

    /** @type {Function|null} */
    this.picker = null;

    /** @type {Function|null} */
    this._onKeydown = null;

    this.node = el('div', { class: 'roll-overlay' });
    const parent = container || document.body;
    parent.appendChild(this.node);

    this._wireEvents();
  }

  // ── Configuração ───────────────────────────────────────────

  setPicker(fn) {
    this.picker = typeof fn === 'function' ? fn : null;
  }

  setSequence(seq) {
    this.sequence = Array.isArray(seq) ? [...seq] : [];
  }

  // ── Ciclo de vida ──────────────────────────────────────────

  start(opts = {}) {
    this.stop(false);

    if (Array.isArray(opts.sequence) && opts.sequence.length > 0) {
      this.sequence = [...opts.sequence];
    }
    if (typeof opts.picker === 'function') {
      this.picker = opts.picker;
    }
    if (Number.isFinite(opts.interval)) {
      this.intervalMs = Math.max(100, opts.interval);
    }

    if (this.sequence.length === 0) {
      this.sequence = ['dado'];
    }

    this.fixed = [];
    this.currentLine = 0;
    this.visible = true;

    this.currentText = this._pickForCurrent();
    this._render();
    this.node.classList.add('visible');

    this._startTicker();
  }

  fixCurrent() {
    if (!this.visible) return;

    this.fixed[this.currentLine] = this.currentText;

    if (this.currentLine >= this.sequence.length - 1) {
      this._commit();
      return;
    }

    this.currentLine++;
    this.currentText = this._pickForCurrent();
    this._stopTicker();
    this._startTicker();
    this._render();
  }

  stop(commit = false) {
    this._stopTicker();
    this.visible = false;
    this.node.classList.remove('visible');
    this._render();

    if (commit && this.fixed.length > 0) {
      this.machine.bus.emit('ui:roll:committed', { lines: this.fixed });
    } else {
      this.machine.bus.emit('ui:roll:cancelled');
    }
  }

  destroy() {
    this.stop(false);
    if (this._onKeydown && this.target) {
      try { this.target.removeEventListener('keydown', this._onKeydown); }
      catch { /* isola */ }
      this._onKeydown = null;
    }
    if (this.node?.parentNode) this.node.parentNode.removeChild(this.node);
  }

  // ── Internos ───────────────────────────────────────────────

  _startTicker() {
    this._stopTicker();
    this.ticker = setInterval(() => {
      this.currentText = this._pickForCurrent();
      this._render();
    }, this.intervalMs);
  }

  _stopTicker() {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  _pickForCurrent() {
    const cat = this.sequence[this.currentLine];
    if (this.picker) {
      try {
        return String(this.picker(cat) ?? '...');
      } catch {
        return '...';
      }
    }
    return '...';
  }

  _commit() {
    this._stopTicker();
    this.visible = false;
    this.node.classList.remove('visible');

    const lines = this.fixed.filter(Boolean);
    if (lines.length > 0) {
      this.machine.bus.emit('ui:roll:committed', { lines });
    }
  }

  _render() {
    clear(this.node);

    const header = el('div', { class: 'roll-header' }, '🎲 Modo Rolagem');
    this.node.appendChild(header);

    const linesWrap = el('div', { class: 'roll-lines' });

    this.sequence.forEach((cat, i) => {
      let cls = 'roll-line';
      let text = '';

      if (i < this.currentLine) {
        cls += ' roll-fixed';
        text = this.fixed[i] ?? '...';
      } else if (i === this.currentLine) {
        cls += ' roll-active';
        text = this.currentText || '...';
      } else {
        cls += ' roll-pending';
        text = 'aguardando...';
      }

      const row = el('div', { class: cls });
      row.appendChild(el('span', { class: 'roll-cat-badge' }, cat));
      row.appendChild(el('span', { class: 'roll-text' }, text));
      linesWrap.appendChild(row);
    });

    this.node.appendChild(linesWrap);

    const footer = el('div', { class: 'roll-footer' },
      'Space para fixar · Esc para cancelar');
    this.node.appendChild(footer);
  }

  _wireEvents() {
    if (!this.target) return;
    this._onKeydown = (e) => {
      if (!this.visible) return;
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        this.fixCurrent();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this.stop(false);
      }
    };
    this.target.addEventListener('keydown', this._onKeydown);
  }
}