/**
 * @file toast.js
 * @module ui
 * @description Notificações temporárias no canto inferior direito.
 * @imports core/utils/dom
 * @importedBy boot.js, ui/*
 * @level 12
 *
 * Fase 13.6 — Dedup por chave:
 *   `show(msg, { key })` — se já existe um toast com a mesma chave,
 *   atualiza o conteúdo em lugar (não cria novo) e reinicia o timer.
 *   `dismiss(key)` — remove programaticamente por chave.
 *
 *   Isso evita empilhamento quando o mesmo diagnóstico é emitido
 *   repetidamente durante a digitação.
 */

import { el, clear } from '../core/utils/dom.js';

export class ToastManager {
  /**
   * @param {HTMLElement} [container]
   */
  constructor(container = null) {
    this.container = container || this._createContainer();
    /** @type {HTMLElement[]} */
    this.active = [];
    /** @type {Map<string, HTMLElement>} key → node */
    this._keyed = new Map();
    /** @type {WeakMap<HTMLElement, number>} node → timer id */
    this._timers = new WeakMap();
    /** @type {WeakMap<HTMLElement, number>} node → duration */
    this._durations = new WeakMap();

    this.max = 4;
    this.defaultDuration = 3000;
  }

  /**
   * Mostra um toast. Se `key` for passado e já existir um toast com a
   * mesma chave, atualiza o existente em vez de criar novo.
   *
   * @param {string} message
   * @param {Object} [opts]
   * @param {'info'|'success'|'warning'|'error'} [opts.type='info']
   * @param {number} [opts.duration=3000]
   * @param {string|null} [opts.key=null]
   * @returns {HTMLElement}
   */
  show(message, opts = {}) {
    const {
      type = 'info',
      duration = this.defaultDuration,
      key = null,
    } = opts;

    // ── Dedup: se key existe, atualiza ─────────────────────
    if (key && this._keyed.has(key)) {
      const node = this._keyed.get(key);
      if (node && node.parentNode) {
        node.textContent = String(message);
        node.className = `toast ${type}`;

        // Reinicia timer
        const oldTimer = this._timers.get(node);
        if (oldTimer) clearTimeout(oldTimer);

        const newTimer = setTimeout(() => {
          this._remove(node);
        }, duration);
        this._timers.set(node, newTimer);
        this._durations.set(node, duration);

        return node;
      }
      // Node foi removido; limpa a entrada
      this._keyed.delete(key);
    }

    // ── Cria novo ──────────────────────────────────────────
    const node = el('div', { class: `toast ${type}` }, String(message));
    node.style.pointerEvents = 'auto';

    if (key) {
      node.dataset.toastKey = key;
      this._keyed.set(key, node);
    }

    this.container.appendChild(node);
    this.active.push(node);

    // Descarta o mais antigo se ultrapassar max
    while (this.active.length > this.max) {
      const oldest = this.active.shift();
      this._remove(oldest);
    }

    const timeout = setTimeout(() => {
      this._remove(node);
    }, duration);
    this._timers.set(node, timeout);
    this._durations.set(node, duration);

    node.addEventListener('click', () => {
      const t = this._timers.get(node);
      if (t) clearTimeout(t);
      this._remove(node);
    });

    return node;
  }

  /**
   * Atalhos por tipo.
   */
  info(msg, d, key)    { return this.show(msg, { type: 'info',    duration: d, key }); }
  success(msg, d, key) { return this.show(msg, { type: 'success', duration: d, key }); }
  warning(msg, d, key) { return this.show(msg, { type: 'warning', duration: d, key }); }
  error(msg, d, key)   { return this.show(msg, { type: 'error',   duration: d ?? 5000, key }); }

  /**
   * Remove um toast por chave.
   * @param {string} key
   * @returns {boolean}
   */
  dismiss(key) {
    if (!key) return false;
    const node = this._keyed.get(key);
    if (!node) return false;

    this._keyed.delete(key);
    this._remove(node);
    return true;
  }

  /**
   * Verifica se um toast existe por chave.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    const node = this._keyed.get(key);
    return !!node && !!node.parentNode;
  }

  /**
   * Limpa todos os toasts.
   */
  clear() {
    for (const node of [...this.active]) this._remove(node);
    this.active = [];
    this._keyed.clear();
  }

  // ── Internos ───────────────────────────────────────────────

  _createContainer() {
    const c = el('div', { class: 'toast-container' });
    document.body.appendChild(c);
    return c;
  }

  _remove(node) {
    if (!node || !node.parentNode) return;

    const idx = this.active.indexOf(node);
    if (idx >= 0) this.active.splice(idx, 1);

    // Limpa timer
    const t = this._timers.get(node);
    if (t) clearTimeout(t);

    // Limpa keyed
    const key = node.dataset.toastKey;
    if (key && this._keyed.get(key) === node) {
      this._keyed.delete(key);
    }

    node.classList.add('fadeout');
    setTimeout(() => {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 200);
  }

  destroy() {
    this.clear();
    if (this.container?.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}