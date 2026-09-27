/**
 * @file editor.js
 * @module editor
 * @description Editor principal — textarea + orquestração de lexer, cursor, highlighter.
 * @imports core/constants, core/utils/dom, core/utils/hierarchy,
 *          editor/lexer, editor/cursor, editor/highlighter,
 *          editor/inline-annotation, editor/inline-template,
 *          editor/command-catalog
 * @importedBy boot.js, ui/*
 * @level 11
 *
 * Fase 13.3 — CRÍTICO: prosa agora é enviada ao Machine.
 *   Antes deste fix, `_handleEnterKey` retornava `false` para linhas de
 *   prosa sem nunca chamar `machine.handleLine`, então o `NarrativeSystem`
 *   nunca analisava nada. Sem análise → sem `narrative:preview` → sem
 *   highlight. O sistema parecia morto em todos os modos narrativos.
 *
 *   Agora:
 *     - `_onInput` agenda análise de prosa (debounce 210ms) sempre que
 *       a linha atual for prosa E todo o textarea for prosa.
 *     - `_handleEnterKey` força flush imediato da análise ao pressionar Enter.
 */

import { MARKERS, INPUT_DEBOUNCE_MS, COMPONENT_NAMES } from '../core/constants.js';
import { el, clear, on } from '../core/utils/dom.js';
import { suggestChildren } from '../core/utils/hierarchy.js';
import { Lexer } from './lexer.js';
import { CursorTracker } from './cursor.js';
import { Highlighter } from './highlighter.js';
import { InlineAnnotation } from './inline-annotation.js';
import { InlineTemplate } from './inline-template.js';
import {
  buildCommandSuggestions,
  getActionSpec,
} from './command-catalog.js';

/**
 * Debounce da análise de prosa (3× o debounce do highlighter).
 * @type {number}
 */
const _PROSE_DEBOUNCE_MS = INPUT_DEBOUNCE_MS * 3;

export class Editor {
  constructor(machine, root) {
    this.machine = machine;
    this.root = root;
    this.lexer = new Lexer();
    this._debounceTimers = new WeakMap();
    this._revealedCall = null;
    this._pendingTemplate = null;
    this._inInputLoop = false;

    /** @type {number|null} Timer do debounce da análise de prosa */
    this._proseDebounce = null;

    /** @type {string|null} Último texto enviado (para evitar re-análise) */
    this._lastProseSent = null;

    this._build();
    this._bindEvents();
  }

  // ══════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════

  focus() { this.textarea?.focus(); }
  getText() { return this.textarea?.value ?? ''; }
  setText(text) {
    if (!this.textarea) return;
    this.textarea.value = String(text ?? '');
    this.highlighter.render();
  }
  getCursor() { return this.textarea?.selectionStart ?? 0; }
  get value() { return this.textarea?.value ?? ''; }
  set value(v) { this.setText(v); }
  annotate(ann) { this.annotations.add(ann); }
  clearAnnotation(tick) { this.annotations.removeByTick(tick); }

  activateTemplate(opts) {
    try {
      this.inline.activate({ ...opts, textarea: this.textarea });
      return true;
    } catch (err) {
      console.warn('[Editor] erro ao ativar template:', err);
      return false;
    }
  }

  cancelTemplate() { this.inline.cancel(); }

  currentTriggerRange() {
    const text = this.getText();
    const cursor = this.getCursor();
    const det = this.lexer.detectTrigger(text, cursor);
    if (!det.valid) return null;
    return { start: det.start, end: cursor };
  }

  insert(text, range = null) {
    if (!this.textarea) return;
    if (range) { this._replaceRange(range.from, range.to, text); return; }

    const cursor = this.getCursor();
    const before = this.textarea.value.substring(0, cursor);
    const after = this.textarea.value.substring(cursor);
    this.textarea.value = before + String(text) + after;
    const next = cursor + String(text).length;
    this.textarea.selectionStart = next;
    this.textarea.selectionEnd = next;
    this.highlighter.render();
    this._safeOnInput();
  }

  replaceRange(from, to, text) { this._replaceRange(from, to, text); }

  destroy() {
    if (this._proseDebounce) {
      clearTimeout(this._proseDebounce);
      this._proseDebounce = null;
    }
    this._unbindEvents();
    this.highlighter?.destroy?.();
    this.cursor?.destroy?.();
    this.annotations?.destroy?.();
    this.inline?.destroy?.();
    clear(this.root);
  }

  // ══════════════════════════════════════════════════════════
  // CONSTRUÇÃO DO DOM
  // ══════════════════════════════════════════════════════════

  _build() {
    clear(this.root);

    const wrapper = el('div', { class: 'editor-wrapper' });

    this.backdrop = el('div', { class: 'editor-backdrop', 'aria-hidden': 'true' });
    wrapper.appendChild(this.backdrop);

    this.textarea = el('textarea', {
      class: 'editor-input',
      spellcheck: 'false',
      placeholder: 'Digite sua prosa ou um comando...',
    });
    wrapper.appendChild(this.textarea);

    this.annotationsEl = el('div', { class: 'editor-annotations' });
    wrapper.appendChild(this.annotationsEl);

    this.inlineEl = el('div', { class: 'editor-inline-template' });
    this.inlineEl.style.display = 'none';
    wrapper.appendChild(this.inlineEl);

    this.root.appendChild(wrapper);

    this.cursor = new CursorTracker(this.textarea);
    this.highlighter = new Highlighter(this.textarea, this.backdrop);
    this.annotations = new InlineAnnotation(this.annotationsEl);
    this.inline = new InlineTemplate(this.inlineEl, this.machine);
  }

  // ══════════════════════════════════════════════════════════
  // EVENTOS
  // ══════════════════════════════════════════════════════════

  _bindEvents() {
    const ta = this.textarea;
    this._handlers = {
      input: () => this._onInput(),
      keydown: (e) => this._onKeyDown(e),
      scroll: () => this.highlighter.sync(),
      blur: () => this._onBlur(),
      focus: () => this._onFocus(),
    };
    on(ta, 'input', this._handlers.input);
    on(ta, 'keydown', this._handlers.keydown);
    on(ta, 'scroll', this._handlers.scroll);
    on(ta, 'blur', this._handlers.blur);
    on(ta, 'focus', this._handlers.focus);
  }

  _unbindEvents() {
    const ta = this.textarea;
    if (!ta || !this._handlers) return;
    ta.removeEventListener('input', this._handlers.input);
    ta.removeEventListener('keydown', this._handlers.keydown);
    ta.removeEventListener('scroll', this._handlers.scroll);
    ta.removeEventListener('blur', this._handlers.blur);
    ta.removeEventListener('focus', this._handlers.focus);
  }

  _safeOnInput() {
    if (this._inInputLoop) return;
    this._inInputLoop = true;
    try { this._onInput(); }
    finally { this._inInputLoop = false; }
  }

  // ══════════════════════════════════════════════════════════
  // PIPELINE DE INPUT
  // ══════════════════════════════════════════════════════════

  _onInput() {
    this.highlighter.schedule();
    const text = this.getText();
    const cursor = this.getCursor();

    // ── 1. COMMAND CONTEXT ─────────────────────────────────
    const cmd = this.lexer.detectCommandContext(text, cursor);
    if (cmd.valid) {
      const items = buildCommandSuggestions(cmd.verb, cmd.maybeSubaction, cmd.partial);
      if (items.length > 0) {
        this.machine.bus.emit('ui:menu:open', {
          trigger: cmd.fullPrefix,
          items,
          cursor: this.cursor.getPosition(),
          mode: 'hierarchy',
          insertRange: { from: cmd.lineStart, to: cursor },
        });
        return;
      }
      this.machine.bus.emit('ui:menu:close');
      return;
    }

    // ── 2. ARG CONTEXT ─────────────────────────────────────
    const arg = this.lexer.detectArgContext(text, cursor);
    if (arg.valid) {
      const spec = getActionSpec(arg.verb, arg.action);
      const wantsHierarchy = spec?.argKind === 'hierarchy' || arg.hadParent === true;
      if (wantsHierarchy) {
        const children = suggestChildren(this.machine.world, arg.segments);
        if (children.length > 0) {
          this.machine.bus.emit('ui:menu:open', {
            trigger: arg.fullPrefix,
            items: children,
            cursor: this.cursor.getPosition(),
            mode: 'hierarchy',
            insertRange: { from: cursor - arg.partial.length, to: cursor },
          });
          return;
        }
      }
      this.machine.bus.emit('ui:menu:close');
      return;
    }

    // ── 3. GUARD DE COMANDO SEM DOT ────────────────────────
    const lineInfo = this._currentLineInfo(text, cursor);
    const kind = this.lexer.classifyLine(lineInfo.trimmed).kind;

    if (kind === 'command' || kind === 'slash-command') {
      this.machine.bus.emit('ui:menu:close');
      return;
    }

    // ── 4. PROSA — agenda análise narrativa ────────────────
    // Só agenda se a linha atual tem conteúdo E todo o textarea é prosa
    if (kind === 'prose' && lineInfo.trimmed.length > 0) {
      this._scheduleProseAnalysis(text);
    }

    // ── 5. SNIPPET TRIGGER ─────────────────────────────────
    const det = this.lexer.detectTrigger(text, cursor);
    if (det.valid) {
      const matches = this.machine.resolveTrigger(det.trigger);
      if (matches.length) {
        this.machine.bus.emit('ui:menu:open', {
          trigger: det.trigger,
          items: matches,
          cursor: this.cursor.getPosition(),
          mode: 'snippet',
          insertRange: { from: det.start, to: cursor },
        });
        return;
      }
    }

    this.machine.bus.emit('ui:menu:close');
  }

  // ══════════════════════════════════════════════════════════
  // ANÁLISE DE PROSA (Fase 13.3)
  // ══════════════════════════════════════════════════════════

  /**
   * Agenda análise narrativa com debounce.
   * @private
   */
  _scheduleProseAnalysis(fullText) {
    if (this._proseDebounce) clearTimeout(this._proseDebounce);

    this._proseDebounce = setTimeout(() => {
      this._proseDebounce = null;
      this._sendProseToMachine(fullText);
    }, _PROSE_DEBOUNCE_MS);
  }

  /**
   * Força flush imediato (usado pelo Enter).
   * @private
   */
  _flushProseAnalysis() {
    if (this._proseDebounce) {
      clearTimeout(this._proseDebounce);
      this._proseDebounce = null;
    }
    this._sendProseToMachine(this.textarea.value);
  }

  /**
   * Envia texto de prosa ao Machine (só se todo o textarea for prosa).
   * @private
   */
  _sendProseToMachine(text) {
    if (!text || !text.trim()) return;

    // Não re-envia se é o mesmo texto da última vez
    if (text === this._lastProseSent) return;

    // Só envia se TODO o textarea for prosa (sem comandos misturados)
    if (!this._isAllProse(text)) return;

    this._lastProseSent = text;

    try {
      this.machine.handleLine(text);
    } catch (err) {
      console.warn('[Editor] prose analysis failed:', err);
    }
  }

  /**
   * Verifica se TODAS as linhas não-vazias são prosa.
   * @private
   */
  _isAllProse(text) {
    const lines = String(text).split('\n').filter(l => l.trim());
    if (lines.length === 0) return false;

    for (const line of lines) {
      const kind = this.lexer.classifyLine(line.trim()).kind;
      if (kind !== 'prose') return false;
    }
    return true;
  }

  // ══════════════════════════════════════════════════════════
  // TECLADO
  // ══════════════════════════════════════════════════════════

  _onKeyDown(e) {
    if (this.inline.isActive()) {
      this._handleInlineTemplateKey(e);
      return;
    }

    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
      e.preventDefault();
      this._toggleReveal();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      if (this._handleEnterKey(e)) return;
    }

    if (e.key === 'Escape') {
      this.machine.bus.emit('ui:menu:close');
    }
  }

  _handleInlineTemplateKey(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) this.inline.prev();
      else this.inline.next();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const res = this.inline.commit();
      if (res.ok) {
        this.machine.bus.emit('ui:inline:committed', res);
        this.highlighter.render();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.inline.cancel();
      this.machine.bus.emit('ui:inline:cancelled');
      return;
    }
  }

  _handleEnterKey(e) {
    const text = this.getText();
    const cursor = this.getCursor();
    const lineInfo = this._currentLineInfo(text, cursor);

    if (!lineInfo.trimmed) return false;

    const kind = this.lexer.classifyLine(lineInfo.trimmed).kind;

    if (kind === 'command' || kind === 'slash-command') {
      e.preventDefault();
      const result = this.machine.handleLine(lineInfo.trimmed);

      if (result.ok !== false) {
        this._replaceLine(lineInfo, '');
      } else {
        this._flashError(lineInfo);
      }

      this.highlighter.render();
      return true;
    }

    if (kind === 'snippet-trigger') {
      e.preventDefault();
      const exact = this.machine.resolveExactTrigger(lineInfo.trimmed);
      if (exact?.source === 'user' && exact.type === 'template') {
        this._resolveTemplateTrigger(lineInfo);
      } else if (exact) {
        this._replaceLine(lineInfo, exact.body || '');
      }
      return true;
    }

    // ── PROSA: flush imediato da análise (Fase 13.3) ──────
    if (kind === 'prose') {
      // Não preventDefault — deixa o browser inserir o newline.
      // A análise roda em seguida via setTimeout(0) para capturar
      // o texto já com a quebra de linha inserida.
      setTimeout(() => {
        this._flushProseAnalysis();
      }, 0);
      return false;
    }

    return false;
  }

  _resolveTemplateTrigger(lineInfo) {
    const trigger = lineInfo.trimmed;
    const id = this.machine.matcher?.resolveExact(trigger)?.id;
    if (!id) return;

    const defs = this.machine.world.get(id, COMPONENT_NAMES.PLACEHOLDER_DEFS)?.defs ?? [];
    const body = this.machine.world.get(id, COMPONENT_NAMES.BODY)?.text ?? '';

    this._replaceLine(lineInfo, '');
    this.activateTemplate({
      trigger, body, defs,
      range: { start: lineInfo.start, end: lineInfo.start },
    });
    this.machine.bus.emit('ui:inline:activated', { trigger, defs });
  }

  _toggleReveal() {
    const text = this.getText();
    const cursor = this.getCursor();
    const block = this.lexer.findHiddenBlockAt(text, cursor);
    if (!block) return;

    const content = text.substring(block.contentStart, block.contentEnd);
    const before = text.substring(0, block.start);
    const after = text.substring(block.end);
    this.textarea.value = before + content + after;
    const pos = block.start + content.length;
    this.textarea.selectionStart = pos;
    this.textarea.selectionEnd = pos;
    this.highlighter.render();
    this.machine.bus.emit('ui:block:revealed', { start: block.start });
  }

  _onBlur() { this.highlighter.sync(); }
  _onFocus() { this.highlighter.sync(); }

  _currentLineInfo(text, cursor) {
    const before = text.substring(0, cursor);
    const lineStart = before.lastIndexOf('\n') + 1;
    const after = text.substring(cursor);
    const nextBreak = after.indexOf('\n');
    const lineEnd = nextBreak === -1 ? text.length : cursor + nextBreak;
    const lineText = text.substring(lineStart, lineEnd);
    return { start: lineStart, end: lineEnd, text: lineText, trimmed: lineText.trim() };
  }

  _replaceLine(lineInfo, replacement) {
    const text = this.textarea.value;
    const before = text.substring(0, lineInfo.start);
    const after = text.substring(lineInfo.end);
    this.textarea.value = before + replacement + after;
    const pos = before.length + replacement.length;
    this.textarea.selectionStart = pos;
    this.textarea.selectionEnd = pos;
  }

  _replaceRange(from, to, text) {
    if (!this.textarea) return;
    const value = this.textarea.value;
    const f = Math.max(0, Math.min(from, value.length));
    const t = Math.max(f, Math.min(to, value.length));
    const before = value.substring(0, f);
    const after = value.substring(t);
    this.textarea.value = before + String(text) + after;
    const next = f + String(text).length;
    this.textarea.selectionStart = next;
    this.textarea.selectionEnd = next;
    this.highlighter.render();
    this._safeAfterProseInsert();
  }

  _safeAfterProseInsert() {
    if (this._inInputLoop) return;
    this._inInputLoop = true;
    try {
      this.highlighter.schedule();
    } finally {
      this._inInputLoop = false;
    }
  }

  _flashError(lineInfo) {
    this.machine.bus.emit('ui:flash-error', { line: lineInfo.start });
  }
}