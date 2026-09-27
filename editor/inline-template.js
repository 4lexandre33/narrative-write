/**
 * @file inline-template.js
 * @module editor
 * @description Modo de edição inline de placeholders de um template.
 * @imports core/constants, core/utils/dom, core/utils/id
 * @importedBy editor/editor
 * @level 11
 */

import { COMPONENT_NAMES } from '../core/constants.js';
import { el, clear } from '../core/utils/dom.js';
import { base64urlEncode, base64urlDecode } from '../core/utils/id.js';

export class InlineTemplate {
  /**
   * @param {HTMLElement} container — container overlay sobre o editor
   * @param {Object} machine
   */
  constructor(container, machine) {
    this.container = container;
    this.machine = machine;
    this.active = null;
    /** @type {Map<string, string>} */
    this.values = new Map();
    this._handlers = {};
  }

  // ── Ciclo de vida ──────────────────────────────────────────

  /**
   * Ativa o modo template.
   */
  activate({ trigger, body, defs, range, textarea, initialValues = null }) {
    this.active = {
      trigger,
      body,
      defs,
      range,
      textarea,
      originalText: textarea.value,
      currentIndex: 0,
    };
    this.values.clear();

    for (const def of defs) {
      const initial = initialValues?.[def.name] ?? '';
      this.values.set(def.name, initial);
    }

    this._render();
  }

  /**
   * Cancela e restaura o texto original.
   */
  cancel() {
    if (!this.active) return;
    const { textarea, range, originalText } = this.active;
    if (textarea && originalText !== undefined) {
      textarea.value = originalText;
      textarea.selectionStart = range.start;
      textarea.selectionEnd = range.start;
    }
    this._destroy();
  }

  /**
   * Finaliza: interpola e substitui o range no textarea.
   */
  commit() {
    if (!this.active) return { ok: false };

    const { body, textarea, range } = this.active;
    let rendered = String(body || '');
    for (const [name, value] of this.values) {
      const re = new RegExp(`\\{\\s*${this._escapeRe(name)}\\s*\\}`, 'g');
      rendered = rendered.replace(re, value || name);
    }

    const values = Object.fromEntries(this.values);
    const before = textarea.value.substring(0, range.start);
    const after = textarea.value.substring(range.end);
    textarea.value = before + rendered + after;

    const cursor = range.start + rendered.length;
    textarea.selectionStart = cursor;
    textarea.selectionEnd = cursor;

    this._destroy();
    return { ok: true, rendered, values };
  }

  /**
   * Move o foco para o próximo campo.
   */
  next() {
    if (!this.active) return;
    const len = this.active.defs.length;
    this.active.currentIndex = (this.active.currentIndex + 1) % len;
    this._render();
    this._focusCurrent();
  }

  /**
   * Volta ao campo anterior.
   */
  prev() {
    if (!this.active) return;
    const len = this.active.defs.length;
    this.active.currentIndex = (this.active.currentIndex - 1 + len) % len;
    this._render();
    this._focusCurrent();
  }

  /**
   * Define o valor de um campo.
   */
  setValue(name, value) {
    this.values.set(name, String(value ?? ''));
    this._render();
  }

  /**
   * Verifica se está ativo.
   */
  isActive() {
    return this.active != null;
  }

  /**
   * Valores atuais.
   */
  currentValues() {
    return Object.fromEntries(this.values);
  }

  /**
   * Libera recursos.
   * Fase C — usado pelo UI test harness.
   */
  destroy() {
    this._destroy();
    this.container = null;
    this.machine = null;
  }

  // ── Handlers ───────────────────────────────────────────────

  onKey(onKey) {
    this._handlers.key = onKey;
  }

  onCommit(onCommit) {
    this._handlers.commit = onCommit;
  }

  // ── Internos ───────────────────────────────────────────────

  _render() {
    if (!this.container || !this.active) return;
    clear(this.container);
    this.container.style.display = 'block';

    const { defs, currentIndex } = this.active;
    const wrapper = el('div', { class: 'inline-template-wrapper' });

    for (let i = 0; i < defs.length; i++) {
      const def = defs[i];
      const isCurrent = i === currentIndex;
      const value = this.values.get(def.name) ?? '';

      const field = el('span', {
        class: `inline-field ${isCurrent ? 'current' : ''}`,
        'data-field': def.name,
      }, value || `{${def.name}}`);

      field.addEventListener('click', () => {
        this.active.currentIndex = i;
        this._render();
        this._focusCurrent();
      });

      wrapper.appendChild(field);
      if (i < defs.length - 1) wrapper.appendChild(document.createTextNode(' '));
    }

    this.container.appendChild(wrapper);
  }

  _focusCurrent() {
    if (!this.container || !this.active) return;
    const fields = this.container.querySelectorAll('.inline-field');
    const el = fields[this.active.currentIndex];
    if (el) el.focus?.();
  }

  _destroy() {
    this.active = null;
    this.values.clear();
    if (this.container) {
      clear(this.container);
      this.container.style.display = 'none';
    }
  }

  _escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}