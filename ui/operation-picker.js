/**
 * @file operation-picker.js
 * @module ui
 * @description Overlay flutuante para correção de operação/subtipo
 *              de uma frase. Parte da Camada 5.
 * @imports core/utils/dom
 * @importedBy ui/narrative-overlay
 * @level 12
 *
 * ═══════════════════════════════════════════════════════════════
 * CONTRATO
 * ═══════════════════════════════════════════════════════════════
 *
 *   const picker = new OperationPicker(machine, { container });
 *
 *   picker.open({
 *     lemma: 'esgueirar',              // para verb-subtype
 *     currentSubtype: 'D1.2',          // opcional
 *     currentOp: 'represent',          // opcional
 *     constructionId: null,            // se for construction-op
 *     onConfirm: (choice) => { ... },  // callback
 *   });
 *
 *   picker.close();
 *   picker.isVisible();
 *   picker.destroy();
 *
 * O picker emite no bus:
 *   `narr:learn:verb-subtype:request` — quando o usuário confirma
 *                                        uma correção de verbo
 *   `narr:learn:construction-op:request` — idem para construction
 *
 * Ao confirmar, chama `onConfirm({ kind, prefer })` se fornecido.
 */

import { el, clear } from '../core/utils/dom.js';

// ══════════════════════════════════════════════════════════════
// CATÁLOGO DE OPERAÇÕES E SUBTIPOS
// ══════════════════════════════════════════════════════════════

/**
 * Operações v1 com rótulos PT-BR.
 * @type {ReadonlyArray<{ id:string, label:string, color:string }>}
 */
const _OPERATIONS = Object.freeze([
  { id: 'represent',   label: 'Representar', color: '#4a90e2' },
  { id: 'describe',    label: 'Descrever',   color: '#38a169' },
  { id: 'expose',      label: 'Expor',       color: '#d69e2e' },
  { id: 'interiorize', label: 'Interiorizar',color: '#6b46c1' },
  { id: 'enunciate',   label: 'Enunciar',    color: '#805ad5' },
  { id: 'evaluate',    label: 'Avaliar',     color: '#d53f8c' },
  { id: 'focalize',    label: 'Focalizar',   color: '#2c5282' },
  { id: 'structure',   label: 'Estruturar',  color: '#718096' },
]);

/**
 * Subtipos canônicos com rótulos.
 * @type {ReadonlyArray<{ id:string, op:string, label:string }>}
 */
const _SUBTYPES = Object.freeze([
  // D1
  { id: 'D1.1', op: 'represent', label: 'Acontecimento' },
  { id: 'D1.2', op: 'represent', label: 'Ação' },
  { id: 'D1.3', op: 'represent', label: 'Estado-em-cena' },
  { id: 'D1.4', op: 'represent', label: 'Mudança-em-cena' },
  { id: 'D1.5', op: 'represent', label: 'Processo' },
  { id: 'D1.6', op: 'represent', label: 'Conduta Fisiológica' },
  { id: 'D1.7', op: 'represent', label: 'Fenômeno Atmosférico' },

  // D2
  { id: 'D2.1', op: 'describe', label: 'Entidade/Corpo' },
  { id: 'D2.2', op: 'describe', label: 'Espaço' },
  { id: 'D2.3', op: 'describe', label: 'Objeto' },
  { id: 'D2.4', op: 'describe', label: 'Gesto/Porte' },
  { id: 'D2.5', op: 'describe', label: 'Atmosfera' },

  // D3
  { id: 'D3.1', op: 'expose', label: 'Contextualizar' },
  { id: 'D3.2', op: 'expose', label: 'Anteceder' },
  { id: 'D3.3', op: 'expose', label: 'Conceituar' },
  { id: 'D3.4a', op: 'expose', label: 'Explicar — Causal' },
  { id: 'D3.4b', op: 'expose', label: 'Explicar — Procedural' },
  { id: 'D3.4c', op: 'expose', label: 'Explicar — Condicional' },
  { id: 'D3.4d', op: 'expose', label: 'Explicar — Final' },
  { id: 'D3.5', op: 'expose', label: 'Especificar' },
  { id: 'D3.6', op: 'expose', label: 'Relacionar' },

  // D4
  { id: 'D4.1', op: 'interiorize', label: 'Percepção' },
  { id: 'D4.2', op: 'interiorize', label: 'Cognição' },
  { id: 'D4.3', op: 'interiorize', label: 'Crença/Dúvida' },
  { id: 'D4.4', op: 'interiorize', label: 'Memória' },
  { id: 'D4.5', op: 'interiorize', label: 'Imaginação' },
  { id: 'D4.6', op: 'interiorize', label: 'Emoção' },
  { id: 'D4.7', op: 'interiorize', label: 'Desejo' },
  { id: 'D4.8', op: 'interiorize', label: 'Intenção' },
  { id: 'D4.9', op: 'interiorize', label: 'Decisão-interna' },
  { id: 'D4.10', op: 'interiorize', label: 'Planejamento' },

  // D5
  { id: 'D5.1', op: 'enunciate', label: 'Assertivo' },
  { id: 'D5.2', op: 'enunciate', label: 'Interrogativo' },
  { id: 'D5.3', op: 'enunciate', label: 'Diretivo' },
  { id: 'D5.4', op: 'enunciate', label: 'Comissivo' },
  { id: 'D5.5', op: 'enunciate', label: 'Expressivo' },
  { id: 'D5.6', op: 'enunciate', label: 'Declarativo' },
  { id: 'D5.7', op: 'enunciate', label: 'Fático' },

  // D6
  { id: 'D6.1', op: 'evaluate', label: 'Juízo Ético/Prático' },
  { id: 'D6.2', op: 'evaluate', label: 'Juízo Epistêmico' },
  { id: 'D6.3', op: 'evaluate', label: 'Interpretar' },
  { id: 'D6.4', op: 'evaluate', label: 'Ironia/Contraste' },
  { id: 'D6.5', op: 'evaluate', label: 'Comentar' },
  { id: 'D6.6', op: 'evaluate', label: 'Refletir' },
]);

// ══════════════════════════════════════════════════════════════
// CLASSE
// ══════════════════════════════════════════════════════════════

export class OperationPicker {
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

    /** @type {Object|null} */
    this.payload = null;

    /** @type {Function|null} */
    this._onKeydown = null;

    this.node = el('div', { class: 'operation-picker' });
    const parent = container || document.body;
    parent.appendChild(this.node);

    this.win = parent.ownerDocument?.defaultView
      ?? this.target?.defaultView
      ?? window;

    // Fecha ao clicar fora
    this.node.addEventListener('click', (e) => {
      if (e.target === this.node) this.close();
    });
  }

  // ── API pública ─────────────────────────────────────────

  /**
   * Abre o picker.
   *
   * @param {Object} opts
   * @param {string} [opts.lemma]
   * @param {string} [opts.currentSubtype]
   * @param {string} [opts.currentOp]
   * @param {string} [opts.constructionId]
   * @param {string} [opts.title]
   * @param {Function} [opts.onConfirm]
   */
  open(opts = {}) {
    this.payload = {
      lemma: opts.lemma ?? null,
      constructionId: opts.constructionId ?? null,
      currentSubtype: opts.currentSubtype ?? null,
      currentOp: opts.currentOp ?? null,
      title: opts.title ?? null,
      onConfirm: typeof opts.onConfirm === 'function' ? opts.onConfirm : null,
      mode: null,               // 'subtype' | 'operation'
      selectedOp: null,
    };

    // Determina o modo: se lemma → subtype; se constructionId → operation
    if (this.payload.lemma) {
      this.payload.mode = 'subtype';
      this.payload.selectedOp =
        this._opFromSubtype(this.payload.currentSubtype) ??
        this.payload.currentOp ??
        'represent';
    } else if (this.payload.constructionId) {
      this.payload.mode = 'operation';
      this.payload.selectedOp = this.payload.currentOp ?? 'represent';
    } else {
      return;
    }

    this._render();
    this._position();
    this.visible = true;
    this.node.classList.add('visible');

    this._onKeydown = (e) => {
      if (!this.visible) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    };
    try { this.target.addEventListener('keydown', this._onKeydown, true); }
    catch { /* isola */ }

    setTimeout(() => {
      const first = this.node.querySelector('.op-picker-item');
      if (first) first.focus();
    }, 30);
  }

  /**
   * Fecha o picker.
   */
  close() {
    if (!this.visible) return;

    this.visible = false;
    this.node.classList.remove('visible');

    if (this._onKeydown) {
      try { this.target.removeEventListener('keydown', this._onKeydown, true); }
      catch { /* isola */ }
      this._onKeydown = null;
    }

    this.payload = null;
  }

  /**
   * @returns {boolean}
   */
  isVisible() {
    return this.visible;
  }

  /**
   * Remove do DOM.
   */
  destroy() {
    this.close();
    if (this.node?.parentNode) {
      this.node.parentNode.removeChild(this.node);
    }
  }

  // ── Internos ────────────────────────────────────────────

  _opFromSubtype(subtypeId) {
    if (!subtypeId || typeof subtypeId !== 'string') return null;
    const m = /^(D\d+)/.exec(subtypeId);
    if (!m) return null;
    const map = {
      D1: 'represent', D2: 'describe', D3: 'expose', D4: 'interiorize',
      D5: 'enunciate', D6: 'evaluate', D7: 'focalize', D8: 'structure',
    };
    return map[m[1]] ?? null;
  }

  _position() {
    const w = this.node.offsetWidth || 360;
    const h = this.node.offsetHeight || 400;
    const vw = this.win.innerWidth;
    const vh = this.win.innerHeight;
    const x = Math.max(10, (vw - w) / 2);
    const y = Math.max(10, (vh - h) / 2);
    this.node.style.left = `${x}px`;
    this.node.style.top = `${y}px`;
  }

  _render() {
    clear(this.node);
    const p = this.payload;
    if (!p) return;

    // Header
    const header = el('div', { class: 'op-picker-header' });
    const title = p.title
      ?? (p.mode === 'subtype'
        ? `Corrigir classificação de "${p.lemma}"`
        : `Corrigir operação de "${p.constructionId}"`);
    header.appendChild(el('span', {}, title));

    const closeBtn = el('button', {
      class: 'op-picker-close',
      title: 'Fechar (Esc)',
    }, '✕');
    closeBtn.addEventListener('click', () => this.close());
    header.appendChild(closeBtn);
    this.node.appendChild(header);

    // Contexto
    if (p.currentSubtype || p.currentOp) {
      const ctx = el('div', { class: 'op-picker-context' });
      ctx.textContent = p.currentSubtype
        ? `Atual: ${p.currentSubtype}`
        : `Atual: ${p.currentOp}`;
      this.node.appendChild(ctx);
    }

    // ── Modo operação (constructions) ─────────────────────
    if (p.mode === 'operation') {
      this._renderOperationList();
    }
    // ── Modo subtype (verbos) ─────────────────────────────
    else if (p.mode === 'subtype') {
      this._renderSubtypeList();
    }
  }

  _renderOperationList() {
    const p = this.payload;
    const list = el('div', { class: 'op-picker-list' });

    for (const op of _OPERATIONS) {
      const selected = op.id === p.selectedOp;
      const row = el('button', {
        class: `op-picker-item ${selected ? 'selected' : ''}`,
        'data-op': op.id,
        type: 'button',
      });
      const dot = el('span', { class: 'op-picker-dot' });
      dot.style.background = op.color;
      row.appendChild(dot);
      row.appendChild(el('span', { class: 'op-picker-label' }, op.label));
      row.appendChild(el('span', { class: 'op-picker-id' }, op.id));

      row.addEventListener('click', () => {
        p.selectedOp = op.id;
        p.currentOp = op.id;
        this._render();
      });
      list.appendChild(row);
    }

    this.node.appendChild(list);
    this._renderFooter();
  }

  _renderSubtypeList() {
    const p = this.payload;
    const list = el('div', { class: 'op-picker-list' });

    // Filtra subtipos pela operação selecionada
    const filtered = _SUBTYPES.filter((s) => s.op === p.selectedOp);

    // Mostra as operações como tabs no topo
    const tabs = el('div', { class: 'op-picker-tabs' });
    for (const op of _OPERATIONS) {
      const isActive = op.id === p.selectedOp;
      const tab = el('button', {
        class: `op-picker-tab ${isActive ? 'active' : ''}`,
        type: 'button',
      }, op.label);
      tab.style.borderBottomColor = isActive ? op.color : 'transparent';
      tab.addEventListener('click', () => {
        p.selectedOp = op.id;
        this._render();
      });
      tabs.appendChild(tab);
    }
    this.node.appendChild(tabs);

    for (const st of filtered) {
      const selected = st.id === p.currentSubtype;
      const row = el('button', {
        class: `op-picker-item ${selected ? 'selected' : ''}`,
        'data-subtype': st.id,
        type: 'button',
      });
      row.appendChild(el('span', { class: 'op-picker-label' }, st.label));
      row.appendChild(el('span', { class: 'op-picker-id' }, st.id));

      row.addEventListener('click', () => {
        p.currentSubtype = st.id;
        this._confirm(st.id);
      });
      list.appendChild(row);
    }

    if (filtered.length === 0) {
      list.appendChild(el('div', { class: 'op-picker-empty' },
        'Nenhum subtipo nesta operação (D7 e D8 só têm eixos)'));
    }

    this.node.appendChild(list);
    this._renderFooter();
  }

  _renderFooter() {
    const p = this.payload;
    const footer = el('div', { class: 'op-picker-footer' });

    const cancelBtn = el('button', {
      class: 'op-picker-btn ghost',
      type: 'button',
    }, 'Cancelar');
    cancelBtn.addEventListener('click', () => this.close());
    footer.appendChild(cancelBtn);

    // Botão "Salvar" só aparece no modo operation (subtype salva por click)
    if (p.mode === 'operation') {
      const saveBtn = el('button', {
        class: 'op-picker-btn primary',
        type: 'button',
      }, 'Salvar');
      saveBtn.addEventListener('click', () => {
        if (p.selectedOp) this._confirm(p.selectedOp);
      });
      footer.appendChild(saveBtn);
    }

    this.node.appendChild(footer);
  }

  /**
   * Aplica a escolha.
   * @param {string} prefer
   * @private
   */
  _confirm(prefer) {
    const p = this.payload;
    if (!p) return;

    // ── Emite evento no bus ────────────────────────────────
    try {
      if (p.mode === 'subtype' && p.lemma) {
        this.machine.bus.emit('narr:learn:verb-subtype:request', {
          lemma: p.lemma,
          dnumber: prefer,
        });
      } else if (p.mode === 'operation' && p.constructionId) {
        this.machine.bus.emit('narr:learn:construction-op:request', {
          constructionId: p.constructionId,
          operation: prefer,
        });
      }
    } catch (err) {
      console.warn('[OperationPicker] falha ao emitir aprendizado:', err);
    }

    // ── Callback ───────────────────────────────────────────
    if (typeof p.onConfirm === 'function') {
      try {
        p.onConfirm({
          kind: p.mode === 'subtype' ? 'verb-subtype' : 'construction-op',
          prefer,
          lemma: p.lemma,
          constructionId: p.constructionId,
        });
      } catch (err) {
        console.warn('[OperationPicker] onConfirm falhou:', err);
      }
    }

    this.close();
  }
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const OperationPickerCatalog = Object.freeze({
  OPERATIONS: _OPERATIONS,
  SUBTYPES: _SUBTYPES,
});