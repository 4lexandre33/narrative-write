/**
 * @file narrative-overlay.js
 * @module ui
 * @description Overlay flutuante para correção de referências ambíguas
 *              e (Camada 5) para correção de operação/subtipo.
 * @imports core/utils/dom, ui/operation-picker
 * @importedBy boot.js
 * @level 12
 *
 * ═══════════════════════════════════════════════════════════════
 * CAMADA 5 — INTEGRAÇÃO COM O OPERATION PICKER
 * ═══════════════════════════════════════════════════════════════
 *
 * Adicionado um botão "Corrigir classificação" que abre o
 * `OperationPicker` no modo adequado:
 *
 *   - Se o act tem `proposition.predicateLemma` → modo verb-subtype
 *     para corrigir o D-number do verbo.
 *   - Se o act tem `construction.id` → modo construction-op para
 *     corrigir a operação da construction.
 *
 * O picker emite `narr:learn:verb-subtype:request` ou
 * `narr:learn:construction-op:request` no bus. O NarrativeSystem
 * escuta e persiste no user-lexicon.
 *
 * Modos de operação do overlay:
 *   - `openReference()` — comportamento original (correção de referência)
 *   - `openAct()`       — NOVO: correção de classificação de um act
 *   - `close(chose)`    — fecha; emite `narr:override:set` se chose
 *
 * Para retrocompatibilidade, `open()` é alias de `openReference()`.
 */

import { el, clear } from '../core/utils/dom.js';
import { OperationPicker } from './operation-picker.js';

// ══════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════

const _RECOMMENDED_THRESHOLD = 0.75;

// ══════════════════════════════════════════════════════════════
// CLASSE
// ══════════════════════════════════════════════════════════════

export class NarrativeOverlay {
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

    this.node = el('div', { class: 'narrative-overlay' });
    const parent = container || document.body;
    parent.appendChild(this.node);

    this.win = parent.ownerDocument?.defaultView
      ?? this.target?.defaultView
      ?? window;

    this.node.addEventListener('click', (e) => {
      if (e.target === this.node) this.close(null);
    });

    // ── Operation picker (Camada 5) ────────────────────────
    this.operationPicker = new OperationPicker(machine, {
      container: parent,
      target,
    });
  }

  // ── API pública — referência ───────────────────────────

  /**
   * Abre o overlay para correção de referência ambígua.
   * Aceita tanto `open()` (retrocompatível) quanto `openReference()`.
   */
  open({ spanKey, candidates, current = null, sourceSpan = null, sentenceId = null } = {}) {
    return this.openReference({ spanKey, candidates, current, sourceSpan, sentenceId });
  }

  /**
   * Abre o overlay para correção de referência ambígua.
   *
   * @param {Object} opts
   * @param {string} opts.spanKey
   * @param {Array} opts.candidates
   * @param {string|null} [opts.current]
   * @param {Object} [opts.sourceSpan]
   * @param {string} [opts.sentenceId]
   */
  openReference({ spanKey, candidates, current = null, sourceSpan = null, sentenceId = null } = {}) {
    if (!spanKey) return;
    if (!Array.isArray(candidates) || candidates.length === 0) return;

    this.payload = {
      mode: 'reference',
      spanKey,
      candidates: [...candidates],
      current,
      sourceSpan,
      sentenceId,
      learn: false,
    };

    const anchor = this._resolveAnchor(sourceSpan);
    this._render();
    this._position(anchor);
    this.visible = true;
    this.node.classList.add('visible');

    this._bindEsc();
    this._focusFirst();
  }

  /**
   * Abre o overlay para correção de classificação de um act.
   * Modo novo da Camada 5.
   *
   * @param {Object} opts
   * @param {Object} opts.act
   * @param {Object} [opts.sourceSpan]
   */
  openAct({ act, sourceSpan = null } = {}) {
    if (!act || typeof act !== 'object') return;

    const lemma = act?.proposition?.predicateLemma ?? null;
    const constructionId = act?.constructionId ?? act?.provenance?.constructionId ?? null;
    const currentOp = Array.isArray(act.operations) && act.operations.length > 0
      ? act.operations[0]
      : null;
    const currentSubtype = this._primarySubtype(act);

    if (!lemma && !constructionId) {
      // Sem verbos nem construction → nada a corrigir
      return;
    }

    this.payload = {
      mode: 'act',
      act,
      lemma,
      constructionId,
      currentOp,
      currentSubtype,
      sourceSpan: sourceSpan ?? act.source ?? null,
    };

    const anchor = this._resolveAnchor(this.payload.sourceSpan);
    this._render();
    this._position(anchor);
    this.visible = true;
    this.node.classList.add('visible');

    this._bindEsc();
    this._focusFirst();
  }

  /**
   * Fecha o overlay.
   * @param {string|null} chose — só relevante no modo 'reference'
   */
  close(chose = null) {
    if (!this.visible) return;

    this.visible = false;
    this.node.classList.remove('visible');

    if (this._onKeydown) {
      try { this.target.removeEventListener('keydown', this._onKeydown, true); }
      catch { /* isola */ }
      this._onKeydown = null;
    }

    const payload = this.payload;
    this.payload = null;

    // Só emite override se for modo 'reference'
    if (chose && payload && payload.mode === 'reference') {
      const rejected = payload.candidates
        .map((c) => c.entityId)
        .filter((id) => id !== chose);

      try {
        this.machine.bus.emit('narr:override:set', {
          spanKey: payload.spanKey,
          chose,
          rejected,
          learn: payload.learn === true,
        });
      } catch { /* isola */ }
    }
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
    this.close(null);
    try { this.operationPicker?.destroy?.(); } catch { /* isola */ }
    if (this.node?.parentNode) {
      this.node.parentNode.removeChild(this.node);
    }
  }

  // ── Internos — bind ────────────────────────────────────

  _bindEsc() {
    this._onKeydown = (e) => {
      if (!this.visible) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close(null);
      }
    };
    try { this.target.addEventListener('keydown', this._onKeydown, true); }
    catch { /* isola */ }
  }

  _focusFirst() {
    setTimeout(() => {
      const first = this.node.querySelector('.narrative-candidate, .act-picker-btn');
      if (first && typeof first.focus === 'function') first.focus();
    }, 30);
  }

  // ── Internos — helpers ─────────────────────────────────

  _primarySubtype(act) {
    const subs = act?.subtypes;
    if (!subs || typeof subs !== 'object') return null;
    for (const [dOp, sub] of Object.entries(subs)) {
      const id = typeof sub === 'string' ? sub : sub?.id;
      if (id) return id;
    }
    return null;
  }

  // ── Internos — posicionamento ──────────────────────────

  _resolveAnchor(sourceSpan) {
    if (!sourceSpan) return null;

    try {
      const doc = this.node.ownerDocument;
      const ta = doc.querySelector('.editor-input');
      if (!ta) return null;

      const rect = ta.getBoundingClientRect();
      const style = doc.defaultView?.getComputedStyle(ta);
      const lineHeight = parseInt(style?.lineHeight ?? '20', 10) || 20;
      const paddingTop = parseInt(style?.paddingTop ?? '14', 10) || 14;

      const text = ta.value ?? '';
      const before = text.slice(0, sourceSpan.start);
      const lineIdx = (before.match(/\n/g) || []).length;

      const x = rect.left + 40;
      const y = rect.top + paddingTop + (lineIdx * lineHeight);

      return { x, y };
    } catch {
      return null;
    }
  }

  _position(anchor) {
    const w = this.node.offsetWidth || 320;
    const h = this.node.offsetHeight || 200;
    const vw = this.win.innerWidth;
    const vh = this.win.innerHeight;

    if (!anchor) {
      this.node.style.left = `${Math.max(10, (vw - w) / 2)}px`;
      this.node.style.top = `${Math.max(10, (vh - h) / 2)}px`;
      return;
    }

    let { x, y } = anchor;
    if (x + w > vw - 10) x = vw - w - 10;
    if (y + h > vh - 10) y = y - h - 20;
    if (x < 10) x = 10;
    if (y < 10) y = 10;

    this.node.style.left = `${x}px`;
    this.node.style.top = `${y}px`;
  }

  // ── Internos — render ─────────────────────────────────

  _render() {
    clear(this.node);
    const p = this.payload;
    if (!p) return;

    if (p.mode === 'reference') {
      this._renderReference();
    } else if (p.mode === 'act') {
      this._renderAct();
    }
  }

  // ── Render — modo referência ───────────────────────────

  _renderReference() {
    const p = this.payload;

    const header = el('div', { class: 'narrative-overlay-header' });
    header.appendChild(el('span', {}, '⚠ Referência ambígua'));
    const closeBtn = el('button', {
      class: 'narrative-overlay-close',
      title: 'Fechar (Esc)',
    }, '✕');
    closeBtn.addEventListener('click', () => this.close(null));
    header.appendChild(closeBtn);
    this.node.appendChild(header);

    if (p.sourceSpan?.raw) {
      const ctx = el('div', { class: 'narrative-overlay-context' });
      ctx.textContent = `"${p.sourceSpan.raw}"`;
      this.node.appendChild(ctx);
    }

    const question = el('div', { class: 'narrative-overlay-question' }, 'A que se refere?');
    this.node.appendChild(question);

    const list = el('div', { class: 'narrative-candidate-list' });

    const sorted = [...p.candidates].sort((a, b) => {
      const sa = typeof a.score === 'number' ? a.score : 0;
      const sb = typeof b.score === 'number' ? b.score : 0;
      if (sb !== sa) return sb - sa;
      return String(a.name ?? '').localeCompare(String(b.name ?? ''));
    });

    const top = sorted[0];
    const topIsDominant = top && typeof top.score === 'number' &&
      top.score >= _RECOMMENDED_THRESHOLD;

    for (const c of sorted) {
      const row = el('button', {
        class: 'narrative-candidate',
        'data-entity-id': c.entityId,
        type: 'button',
      });

      if (c.entityId === p.current) row.classList.add('current');
      if (topIsDominant && c.entityId === top.entityId) row.classList.add('recommended');

      row.appendChild(el('span', { class: 'narrative-candidate-label' },
        String(c.name ?? c.entityId ?? '?')));
      row.appendChild(el('span', { class: 'narrative-candidate-score' },
        typeof c.score === 'number' ? c.score.toFixed(2) : '—'));

      row.addEventListener('click', () => this.close(c.entityId));
      list.appendChild(row);
    }

    this.node.appendChild(list);

    const learnRow = el('label', { class: 'narrative-overlay-learn' });
    const chk = el('input', { type: 'checkbox' });
    chk.checked = p.learn === true;
    chk.addEventListener('change', () => {
      if (this.payload) this.payload.learn = chk.checked;
    });
    learnRow.appendChild(chk);
    learnRow.appendChild(el('span', {}, 'Lembrar esta correção'));
    this.node.appendChild(learnRow);

    const footer = el('div', { class: 'narrative-overlay-footer' });

    const clearAllBtn = el('button', {
      class: 'narrative-overlay-btn ghost',
      type: 'button',
      title: 'Remover todos os overrides persistidos',
    }, '🗑 Esquecer tudo');

    clearAllBtn.addEventListener('click', () => {
      try { this.machine.bus.emit('narr:override:clearAll', {}); } catch { /* isola */ }
      this.close(null);
    });
    footer.appendChild(clearAllBtn);

    const cancelBtn = el('button', {
      class: 'narrative-overlay-btn ghost',
      type: 'button',
    }, 'Cancelar');
    cancelBtn.addEventListener('click', () => this.close(null));
    footer.appendChild(cancelBtn);

    this.node.appendChild(footer);
  }

  // ── Render — modo act (Camada 5) ──────────────────────

  _renderAct() {
    const p = this.payload;
    const act = p.act;

    const header = el('div', { class: 'narrative-overlay-header' });
    header.appendChild(el('span', {}, '🎯 Corrigir classificação'));
    const closeBtn = el('button', {
      class: 'narrative-overlay-close',
      title: 'Fechar (Esc)',
    }, '✕');
    closeBtn.addEventListener('click', () => this.close(null));
    header.appendChild(closeBtn);
    this.node.appendChild(header);

    // Texto da frase
    const raw = act?.source?.raw ?? '';
    if (raw) {
      const ctx = el('div', { class: 'narrative-overlay-context' });
      ctx.textContent = raw.length > 80 ? raw.slice(0, 77) + '…' : raw;
      this.node.appendChild(ctx);
    }

    // Estado atual
    const info = el('div', { class: 'act-picker-current' });
    if (p.currentOp) {
      info.appendChild(el('div', {},
        `Operação atual: ${p.currentOp}`));
    }
    if (p.currentSubtype) {
      info.appendChild(el('div', {},
        `Subtipo atual: ${p.currentSubtype}`));
    }
    if (lemmaLine(p)) info.appendChild(lemmaLine(p));
    this.node.appendChild(info);

    // Botão único que abre o picker
    const actions = el('div', { class: 'narrative-overlay-footer' });

    const openPickerBtn = el('button', {
      class: 'act-picker-btn primary',
      type: 'button',
    }, p.lemma ? 'Corrigir verbo' : 'Corrigir operação');

    openPickerBtn.addEventListener('click', () => {
      // Fecha o overlay atual (sem emitir override)
      const saved = { lemma: p.lemma, constructionId: p.constructionId,
                      currentOp: p.currentOp, currentSubtype: p.currentSubtype };
      this.close(null);
      // Abre o picker
      this.operationPicker.open({
        lemma: saved.lemma,
        constructionId: saved.constructionId,
        currentOp: saved.currentOp,
        currentSubtype: saved.currentSubtype,
      });
    });
    actions.appendChild(openPickerBtn);

    const cancelBtn = el('button', {
      class: 'narrative-overlay-btn ghost',
      type: 'button',
    }, 'Cancelar');
    cancelBtn.addEventListener('click', () => this.close(null));
    actions.appendChild(cancelBtn);

    this.node.appendChild(actions);
  }
}

// ══════════════════════════════════════════════════════════════
// HELPERS DE RENDER
// ══════════════════════════════════════════════════════════════

function lemmaLine(p) {
  if (!p.lemma) return null;
  const d = document.createElement('div');
  d.textContent = `Verbo: ${p.lemma}`;
  return d;
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const NarrativeOverlayCatalog = Object.freeze({
  OperationPicker,
});