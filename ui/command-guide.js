/**
 * @file command-guide.js
 * @module ui
 * @description Painel de comandos organizados por categoria.
 * @imports core/utils/dom
 * @importedBy boot.js
 * @level 12
 *
 * Fase D:
 *   - Aceita `{ container }` opcional. Sem container, usa
 *     `document.body` (histórico). Com container, anexa nele.
 */

import { el, clear } from '../core/utils/dom.js';

export class CommandGuide {
  /**
   * @param {Object} machine
   * @param {Object} [opts={}]
   * @param {HTMLElement} [opts.container=null]
   */
  constructor(machine, { container = null } = {}) {
    this.machine = machine;
    this.visible = false;

    this.node = el('div', { class: 'command-guide' });
    const parent = container || document.body;
    parent.appendChild(this.node);

    this._render();
  }

  open() {
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

  destroy() {
    if (this.node?.parentNode) this.node.parentNode.removeChild(this.node);
  }

  // ── Internos ───────────────────────────────────────────────

  _render() {
    clear(this.node);

    const header = el('div', { class: 'command-guide-header' });
    header.appendChild(el('span', {}, '📖 Comandos'));
    const closeBtn = el('button', { class: 'header-btn' }, '✕');
    closeBtn.addEventListener('click', () => this.close());
    header.appendChild(closeBtn);
    this.node.appendChild(header);

    const content = el('div', { class: 'command-guide-content' });

    const commands = this.machine.registry?.getCommands() ?? [];
    for (const cmd of commands) {
      const section = el('div', { class: 'guide-section' });
      section.appendChild(el('div', { class: 'guide-section-title' }, `${cmd.verb}.`));
      if (cmd.description) {
        section.appendChild(el('div', { class: 'guide-line' }, cmd.description));
      }
      for (const ex of cmd.examples ?? []) {
        section.appendChild(el('div', { class: 'guide-line' }, ex));
      }
      content.appendChild(section);
    }

    this.node.appendChild(content);
  }
}