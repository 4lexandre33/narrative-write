/**
 * @file panel-left.js
 * @module ui
 * @description Árvore de entidades do mundo.
 * @imports core/constants, core/utils/dom
 * @importedBy boot.js
 * @level 12
 */

import { COMPONENT_NAMES, ENTITY_TYPE_LABEL } from '../core/constants.js';
import { el, clear, onDelegate } from '../core/utils/dom.js';

export class PanelLeft {
  /**
   * @param {Object} machine
   * @param {HTMLElement} container
   */
  constructor(machine, container) {
    this.machine = machine;
    this.container = container;
    this.container.classList.add('panel-left');
    this.selectedId = null;
    this.collapsedGroups = new Set();

    this._wireEvents();
    this.render();
  }

  /**
   * Redesenha a árvore completa.
   */
  render() {
    clear(this.container);

    const world = this.machine.world;
    const entities = world.allEntities();

    const groups = this._groupByType(entities);

    for (const [type, ids] of Object.entries(groups)) {
      const section = this._renderGroup(type, ids);
      this.container.appendChild(section);
    }

    if (entities.length === 0) {
      this.container.appendChild(el('div', { class: 'tree-empty' }, 'Mundo vazio'));
    }
  }

  /**
   * Marca um item como selecionado.
   * @param {string} id
   */
  select(id) {
    this.selectedId = id;
    for (const node of this.container.querySelectorAll('.tree-item')) {
      node.classList.toggle('selected', node.dataset.id === id);
    }
  }

  /**
   * Pulsa visualmente um item.
   * @param {string} id
   */
  pulse(id) {
    const node = this.container.querySelector(`.tree-item[data-id="${CSS.escape(id)}"]`);
    if (!node) return;
    node.classList.remove('pulse');
    void node.offsetWidth;
    node.classList.add('pulse');
  }

  /**
   * Remove um item.
   * @param {string} id
   */
  remove(id) {
    const node = this.container.querySelector(`.tree-item[data-id="${CSS.escape(id)}"]`);
    if (node?.parentNode) node.parentNode.removeChild(node);
  }

  /**
   * Atualiza um item (nome/shortcode).
   * @param {string} id
   */
  updateItem(id) {
    const node = this.container.querySelector(`.tree-item[data-id="${CSS.escape(id)}"]`);
    if (!node) { this.render(); return; }
    const ident = this.machine.world.get(id, COMPONENT_NAMES.IDENTITY);
    if (!ident) return;
    node.querySelector('.item-name').textContent = ident.name;
    node.querySelector('.item-shortcode').textContent = ident.id;
  }

  // ── Internos ───────────────────────────────────────────────

  _groupByType(entities) {
    const groups = {};
    for (const id of entities) {
      const ident = this.machine.world.get(id, COMPONENT_NAMES.IDENTITY);
      const type = ident?.type ?? 'custom';
      if (!groups[type]) groups[type] = [];
      groups[type].push(id);
    }
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => {
        const na = this.machine.world.get(a, COMPONENT_NAMES.IDENTITY)?.name ?? '';
        const nb = this.machine.world.get(b, COMPONENT_NAMES.IDENTITY)?.name ?? '';
        return na.localeCompare(nb);
      });
    }
    return groups;
  }

  _renderGroup(type, ids) {
    const section = el('div', { class: 'tree-section' });
    const label = ENTITY_TYPE_LABEL[type] ?? type;
    const collapsed = this.collapsedGroups.has(type);

    const header = el('div', {
      class: `tree-group-header ${collapsed ? 'collapsed' : ''}`,
      'data-type': type,
    }, `${label} (${ids.length})`);
    section.appendChild(header);

    if (!collapsed) {
      for (const id of ids) {
        section.appendChild(this._renderItem(id));
      }
    }
    return section;
  }

  _renderItem(id) {
    const world = this.machine.world;
    const ident = world.get(id, COMPONENT_NAMES.IDENTITY);
    const isStale = world.has(id, COMPONENT_NAMES.STALE);
    const isOrphan = world.has(id, COMPONENT_NAMES.ORPHANED);

    const cls = ['tree-item'];
    if (isStale) cls.push('stale');
    if (isOrphan) cls.push('orphan');
    if (id === this.selectedId) cls.push('selected');

    const node = el('div', {
      class: cls.join(' '),
      'data-id': id,
      title: `${ident?.name ?? id} (${ident?.id ?? ''})`,
    });

    node.appendChild(el('span', { class: 'item-name' }, ident?.name ?? id));
    node.appendChild(el('span', { class: 'item-shortcode' }, ident?.id ?? ''));

    return node;
  }

  _wireEvents() {
    onDelegate(this.container, '.tree-group-header', 'click', (_e, header) => {
      const type = header.dataset.type;
      if (this.collapsedGroups.has(type)) this.collapsedGroups.delete(type);
      else this.collapsedGroups.add(type);
      this.render();
    });

    onDelegate(this.container, '.tree-item', 'click', (_e, item) => {
      const id = item.dataset.id;
      this.select(id);
      this.machine.handleLine(`id.show ${id}`);
    });
  }

  destroy() {
    clear(this.container);
  }
}