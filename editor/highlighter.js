/**
 * @file highlighter.js
 * @module editor
 * @description Aplica cores e realces inline ao texto do editor.
 * @imports core/constants, editor/lexer
 * @importedBy editor/editor
 * @level 11
 *
 * Fase 13.7 — Refatoração estrutural (auditoria 25/09/2026):
 *   Adicionado `getNarrativeSpans()` público. Anteriormente o `boot.js`
 *   acessava `highlighter._narrativeSpans` (campo privado por convenção
 *   underscore). Agora existe uma API estável — futuras refatorações
 *   internas do `Highlighter` não quebram consumidores.
 *
 * Contrato público:
 *   setNarrativeSpans(spans)   — define spans narrativos
 *   getNarrativeSpans()        — devolve cópia defensiva
 *   clearNarrativeSpans()      — limpa
 *   spanAt(offset)             — span sob um offset (ou null)
 *   schedule() / render() / sync() / destroy()
 */

import { MARKERS } from '../core/constants.js';
import { Lexer } from './lexer.js';

// ══════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════

const _OP_CLASS = Object.freeze({
  represent:   'hl-narrative-represent',
  describe:    'hl-narrative-describe',
  enunciate:   'hl-narrative-enunciate',
  expose:      'hl-narrative-expose',
  evaluate:    'hl-narrative-evaluate',
  interiorize: 'hl-narrative-interiorize',
  structure:   'hl-narrative-structure',
  focalize:    'hl-narrative-focalize',
});

// ══════════════════════════════════════════════════════════════
// CLASSE
// ══════════════════════════════════════════════════════════════

export class Highlighter {
  /**
   * @param {HTMLTextAreaElement} textarea
   * @param {HTMLElement} backdrop
   */
  constructor(textarea, backdrop) {
    this.textarea = textarea;
    this.backdrop = backdrop;
    this.lexer = new Lexer();

    this._raf = null;

    /** @type {Array} — spans narrativos, ordenados por start */
    this._narrativeSpans = [];
  }

  // ── Ciclo base ────────────────────────────────────────────

  schedule() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      this.render();
    });
  }

  render() {
    if (!this.textarea || !this.backdrop) return;
    const text = this.textarea.value || '';
    this.backdrop.innerHTML = this._buildHTML(text);
  }

  sync() {
    if (!this.textarea || !this.backdrop) return;
    const ta = this.textarea;
    const bd = this.backdrop;
    bd.style.width = `${ta.clientWidth}px`;
    bd.style.height = `${ta.clientHeight}px`;
    bd.scrollTop = ta.scrollTop;
    bd.scrollLeft = ta.scrollLeft;
  }

  // ── API narrativa ────────────────────────────────────────

  /**
   * Define os spans narrativos.
   * @param {Array} spans
   */
  setNarrativeSpans(spans) {
    if (!Array.isArray(spans)) {
      this._narrativeSpans = [];
    } else {
      this._narrativeSpans = spans
        .filter((s) => s && typeof s.start === 'number' && typeof s.end === 'number')
        .map((s) => ({
          id: s.id ?? '',
          start: s.start,
          end: s.end,
          raw: s.raw ?? '',
          operations: Array.isArray(s.operations) ? s.operations : [],
          confidence: typeof s.confidence === 'number' ? s.confidence : 0.5,
          ambiguous: s.ambiguous === true,
          primaryOperation: s.primaryOperation ?? s.operations?.[0] ?? null,
        }))
        .sort((a, b) => a.start - b.start);
    }
    this.schedule();
  }

  /**
   * Devolve cópia defensiva dos spans narrativos.
   *
   * Fase 13.7 — API pública substituta de `_narrativeSpans`.
   *
   * @returns {Array} cópia dos spans
   */
  getNarrativeSpans() {
    return this._narrativeSpans.map((s) => ({
      ...s,
      operations: Array.isArray(s.operations) ? [...s.operations] : [],
    }));
  }

  /**
   * Remove todos os spans narrativos.
   */
  clearNarrativeSpans() {
    if (this._narrativeSpans.length === 0) return;
    this._narrativeSpans = [];
    this.schedule();
  }

  /**
   * Devolve o span narrativo sob um offset, se houver.
   * @param {number} offset
   * @returns {Object|null}
   */
  spanAt(offset) {
    for (const s of this._narrativeSpans) {
      if (offset >= s.start && offset < s.end) return s;
    }
    return null;
  }

  // ── Internos — construção HTML ───────────────────────────

  _buildHTML(text) {
    const raw = String(text ?? '');
    if (this._narrativeSpans.length === 0) {
      const { lines } = this.lexer.analyze(raw);
      return lines.map((line) => this._renderBaseLine(line)).join('\n');
    }

    const lines = raw.split('\n');
    const out = [];
    let offset = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const lineStart = offset;
      const lineEnd = offset + lineText.length;

      out.push(this._renderMixedLine(lineText, lineStart, lineEnd));
      offset = lineEnd + 1;
    }

    return out.join('\n');
  }

  _renderBaseLine(line) {
    if (line.kind === 'command' || line.kind === 'slash-command') {
      return `<span class="hl-command">${this._escape(line.text)}</span>`;
    }
    if (line.kind === 'snippet-trigger') {
      return `<span class="hl-trigger">${this._escape(line.text)}</span>`;
    }
    return this._highlightProse(line.text);
  }

  _renderMixedLine(lineText, lineStart, lineEnd) {
    const overlaps = this._narrativeSpans.filter(
      (s) => s.end > lineStart && s.start < lineEnd
    );

    if (overlaps.length === 0) {
      const lexed = this.lexer.classifyLine(lineText, 0);
      return this._renderBaseLine(lexed);
    }

    overlaps.sort((a, b) => {
      const aLen = a.end - a.start;
      const bLen = b.end - b.start;
      if (aLen !== bLen) return aLen - bLen;
      return a.start - b.start;
    });

    const lineLen = lineText.length;
    const classAt = new Array(lineLen).fill(null);

    for (const span of overlaps) {
      const from = Math.max(span.start, lineStart) - lineStart;
      const to = Math.min(span.end, lineEnd) - lineStart;
      const cls = this._classForSpan(span);

      for (let i = from; i < to; i++) {
        if (classAt[i] === null) classAt[i] = cls;
      }
    }

    let out = '';
    let i = 0;
    while (i < lineLen) {
      const cls = classAt[i];
      let j = i;
      while (j < lineLen && classAt[j] === cls) j++;

      const chunk = lineText.slice(i, j);
      const escaped = this._escape(chunk);

      if (cls === null) {
        out += escaped;
      } else {
        out += `<span class="${cls}">${escaped}</span>`;
      }
      i = j;
    }

    return out;
  }

  _classForSpan(span) {
    const classes = [];

    const op = span.primaryOperation ??
      (Array.isArray(span.operations) ? span.operations[0] : null);

    if (op && _OP_CLASS[op]) classes.push(_OP_CLASS[op]);

    if (span.ambiguous) {
      classes.push('hl-narrative-ambiguous');
    } else if (typeof span.confidence === 'number' && span.confidence < 0.70) {
      classes.push('hl-narrative-low-confidence');
    }

    return classes.length > 0 ? classes.join(' ') : 'hl-narrative-neutral';
  }

  _highlightProse(text) {
    let out = this._escape(text);

    out = out.replace(/\{([^}]+)\}/g, '<span class="hl-placeholder">{$1}</span>');

    out = out.replace(
      new RegExp(`${MARKERS.BLOCK_START}.*?${MARKERS.BLOCK_END}`, 'g'),
      ''
    );

    return out;
  }

  _escape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._narrativeSpans = [];
    if (this.backdrop?.parentNode) {
      this.backdrop.parentNode.removeChild(this.backdrop);
    }
    this.backdrop = null;
    this.textarea = null;
  }
}