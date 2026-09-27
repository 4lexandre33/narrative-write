/**
 * @file modal.js
 * @module ui
 * @description Modal genérico — open/close/confirm/alert/prompt.
 * @imports core/utils/dom
 * @importedBy boot.js, ui/*
 * @level 12
 *
 * Uso:
 *   const modal = new ModalManager();
 *
 *   // Genérico
 *   const value = await modal.open({
 *     title: 'Confirmar',
 *     body: 'Deseja apagar?',
 *     actions: [
 *       { label: 'Cancelar', type: 'ghost',   value: false },
 *       { label: 'Apagar',   type: 'danger',  value: true  },
 *     ],
 *   });
 *
 *   // Atalhos
 *   await modal.confirm('Apagar', 'Tem certeza?', { danger: true });
 *   await modal.alert('Aviso', 'Algo aconteceu.');
 *   const nome = await modal.prompt('Renomear', 'Kaelin');
 *
 * Refatoração Fase B:
 *   O construtor aceita `{ container }` opcional. Sem container, o
 *   overlay é anexado a `document.body` (comportamento histórico).
 *   Com container, é anexado nele — usado pelo UI test harness para
 *   isolar cenários em iframe.
 */

import { el, clear } from '../core/utils/dom.js';

export class ModalManager {
  /**
   * @param {Object} [opts={}]
   * @param {HTMLElement} [opts.container=null]
   */
  constructor({ container = null } = {}) {
    this.node = el('div', { class: 'modal-overlay' });
    const parent = container || document.body;
    parent.appendChild(this.node);

    this.visible = false;
    /** @type {Function|null} */
    this._resolve = null;
    /** @type {Function|null} */
    this._onKeydown = null;

    // Fechar ao clicar fora da caixa
    this.node.addEventListener('click', (e) => {
      if (e.target === this.node && this._dismissible) {
        this.close(null);
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  // API principal
  // ══════════════════════════════════════════════════════════

  /**
   * Abre um modal genérico.
   * @param {Object} opts
   * @param {string} [opts.title='']
   * @param {string|Node} [opts.body='']
   * @param {Array<{
   *   label:string,
   *   type?:'primary'|'danger'|'ghost',
   *   value?:any,
   *   readInput?:()=>any
   * }>} [opts.actions=[]]
   * @param {boolean} [opts.dismissible=true] — permite fechar com Esc/clique fora
   * @returns {Promise<any>}
   */
  open({ title = '', body = '', actions = [], dismissible = true } = {}) {
    // Se já existe um aberto, resolve com null antes
    if (this._resolve) this.close(null);

    this._dismissible = dismissible;

    return new Promise((resolve) => {
      this._resolve = resolve;
      this._render({ title, body, actions });

      this.visible = true;
      this.node.classList.add('visible');

      this._onKeydown = (e) => {
        if (e.key === 'Escape' && this._dismissible) {
          e.preventDefault();
          e.stopPropagation();
          this.close(null);
        }
      };
      document.addEventListener('keydown', this._onKeydown, true);

      const firstBtn = this.node.querySelector('.modal-btn');
      if (firstBtn) setTimeout(() => firstBtn.focus(), 30);
    });
  }

  /**
   * Modal de confirmação.
   * @param {string} title
   * @param {string} message
   * @param {Object} [opts]
   * @param {string} [opts.confirmLabel='Confirmar']
   * @param {string} [opts.cancelLabel='Cancelar']
   * @param {boolean} [opts.danger=false]
   * @returns {Promise<boolean>}
   */
  confirm(title, message, {
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    danger = false,
  } = {}) {
    return this.open({
      title,
      body: message,
      actions: [
        { label: cancelLabel, type: 'ghost', value: false },
        { label: confirmLabel, type: danger ? 'danger' : 'primary', value: true },
      ],
    });
  }

  /**
   * Modal de alerta (um botão).
   * @param {string} title
   * @param {string} message
   * @param {Object} [opts]
   * @param {string} [opts.okLabel='OK']
   * @returns {Promise<true>}
   */
  alert(title, message, { okLabel = 'OK' } = {}) {
    return this.open({
      title,
      body: message,
      actions: [{ label: okLabel, type: 'primary', value: true }],
    });
  }

  /**
   * Modal de input de texto.
   * @param {string} title
   * @param {string} [defaultValue='']
   * @param {Object} [opts]
   * @param {string} [opts.placeholder='']
   * @param {string} [opts.okLabel='OK']
   * @param {string} [opts.cancelLabel='Cancelar']
   * @returns {Promise<string|null>} — null se cancelado
   */
  prompt(title, defaultValue = '', {
    placeholder = '',
    okLabel = 'OK',
    cancelLabel = 'Cancelar',
  } = {}) {
    const input = el('input', {
      type: 'text',
      value: String(defaultValue ?? ''),
      placeholder,
      style: {
        width: '100%',
        padding: '8px 10px',
        border: '1px solid var(--border-mid)',
        borderRadius: 'var(--radius-sm)',
        fontFamily: 'var(--font-sans)',
        fontSize: '13px',
        boxSizing: 'border-box',
      },
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.close(input.value);
      }
    });

    setTimeout(() => input.focus(), 40);

    return this.open({
      title,
      body: input,
      actions: [
        { label: cancelLabel, type: 'ghost', value: null },
        { label: okLabel, type: 'primary', readInput: () => input.value },
      ],
    });
  }

  /**
   * Fecha o modal com um valor.
   * @param {any} [value=null]
   */
  close(value = null) {
    if (!this.visible) return;

    this.visible = false;
    this.node.classList.remove('visible');

    if (this._onKeydown) {
      document.removeEventListener('keydown', this._onKeydown, true);
      this._onKeydown = null;
    }

    const resolve = this._resolve;
    this._resolve = null;

    if (typeof resolve === 'function') {
      resolve(value);
    }
  }

  /**
   * Destrói o modal — remove o nó do DOM.
   */
  destroy() {
    this.close(null);
    if (this.node?.parentNode) {
      this.node.parentNode.removeChild(this.node);
    }
  }

  // ══════════════════════════════════════════════════════════
  // Internos
  // ══════════════════════════════════════════════════════════

  _render({ title, body, actions }) {
    clear(this.node);

    const box = el('div', { class: 'modal-box' });

    if (title) {
      box.appendChild(el('div', { class: 'modal-title' }, String(title)));
    }

    const bodyNode = el('div', { class: 'modal-body' });
    if (body instanceof Node) {
      bodyNode.appendChild(body);
    } else {
      bodyNode.textContent = String(body ?? '');
    }
    box.appendChild(bodyNode);

    if (Array.isArray(actions) && actions.length > 0) {
      const actionsNode = el('div', { class: 'modal-actions' });
      for (const act of actions) {
        const cls = `modal-btn ${act.type ?? 'ghost'}`;
        const btn = el('button', { class: cls }, String(act.label ?? 'OK'));

        btn.addEventListener('click', () => {
          const value = typeof act.readInput === 'function'
            ? act.readInput()
            : (act.value !== undefined ? act.value : null);
          this.close(value);
        });

        actionsNode.appendChild(btn);
      }
      box.appendChild(actionsNode);
    }

    this.node.appendChild(box);
  }
}