/**
 * @file lexer.js
 * @module editor
 * @description Separa texto, comandos, snippets e placeholders numa linha.
 *              Também detecta contextos para autocomplete:
 *                - detectTrigger         → snippets (`per.`)
 *                - detectCommandContext  → ações (`phr.` / `diag.narrative.`)
 *                - detectArgContext      → argumentos (`phr.show Base.`)
 *
 * Fase 13 — Regra estrita: TODOS os detectores de popup só retornam
 * `valid: true` quando o caractere IMEDIATAMENTE antes do cursor é `.`.
 *
 * Fase 13.1 — Fix de prioridade: `detectCommandContext` valida que o
 * verbo pertence a `KNOWN_PREFIXES`. Sem isso, qualquer `x.` era
 * capturado como comando, bloqueando snippets como `per.`.
 *
 * @imports core/constants, core/utils/string
 * @importedBy editor/editor, editor/highlighter, context-machine/router
 * @level 11
 */

import { KNOWN_PREFIXES, MARKERS } from '../core/constants.js';
import { extractShortcutCandidate } from '../core/utils/string.js';

export class Lexer {
  constructor() {
    this.prefixes = KNOWN_PREFIXES;
    // Set de prefixos para lookup O(1)
    this.prefixSet = new Set(KNOWN_PREFIXES);
  }

  // ══════════════════════════════════════════════════════════
  // CLASSIFICAÇÃO BÁSICA
  // ══════════════════════════════════════════════════════════

  analyze(text) {
    const rawLines = String(text ?? '').split('\n');
    const lines = rawLines.map((line, index) => this.classifyLine(line, index));
    return { lines, totalLines: lines.length };
  }

  classifyLine(line, index = 0) {
    const trimmed = line.trim();
    if (!trimmed) return { text: line, kind: 'empty', index };

    if (trimmed.startsWith('/')) {
      return { text: line, kind: 'slash-command', command: trimmed.slice(1), index };
    }

    for (const prefix of this.prefixes) {
      if (trimmed === prefix || trimmed.startsWith(`${prefix}.`)) {
        return { text: line, kind: 'command', command: trimmed, index };
      }
    }

    if (/^[a-z][a-z0-9._]*\.$/i.test(trimmed)) {
      return { text: line, kind: 'snippet-trigger', trigger: trimmed, index };
    }

    return { text: line, kind: 'prose', index };
  }

  // ══════════════════════════════════════════════════════════
  // HELPERS DE LINHA
  // ══════════════════════════════════════════════════════════

  /**
   * Extrai a linha atual e verifica se o cursor está no fim dela.
   * @private
   */
  _lineAt(text, cursorPos) {
    const safeText = String(text ?? '');
    const pos = typeof cursorPos === 'number' ? cursorPos : safeText.length;
    const before = safeText.substring(0, pos);
    const lineStart = before.lastIndexOf('\n') + 1;
    const line = before.substring(lineStart);

    const after = safeText.substring(pos);
    const nextNL = after.indexOf('\n');
    const tail = nextNL === -1 ? after : after.slice(0, nextNL);
    const cursorAtEnd = tail.trim().length === 0;

    return { line, lineStart, cursorAtEnd };
  }

  // ══════════════════════════════════════════════════════════
  // SNIPPET TRIGGER
  // ══════════════════════════════════════════════════════════

  shortcutAtCursor(text, cursorPos) {
    return extractShortcutCandidate(text, cursorPos);
  }

  /**
   * Detecta trigger de snippet (`per.` no final do cursor).
   * Requer que o último caractere seja `.`.
   */
  detectTrigger(text, cursorPos) {
    const safeText = String(text ?? '');
    const pos = typeof cursorPos === 'number' ? cursorPos : safeText.length;
    const before = safeText.substring(0, pos);
    const lines = before.split('\n');
    const line = lines[lines.length - 1] || '';

    if (!line.endsWith('.')) return { valid: false };
    if (/\.\s$/.test(line)) return { valid: false };

    const candidate = extractShortcutCandidate(safeText, pos);
    if (!candidate) return { valid: false };

    const eqIdx = line.lastIndexOf('=');
    if (eqIdx >= 0) {
      const afterEq = line.substring(eqIdx);
      const quotes = (afterEq.match(/'/g) || []).length;
      if (quotes % 2 === 1) return { valid: false };
    }

    if (!candidate.includes('.')) return { valid: false };
    if (!candidate.endsWith('.')) return { valid: false };

    const start = pos - candidate.length;
    return { valid: true, trigger: candidate, start };
  }

  // ══════════════════════════════════════════════════════════
  // COMMAND CONTEXT
  // ══════════════════════════════════════════════════════════

  /**
   * Detecta quando o cursor está logo após um `.` num cabeçalho de comando.
   *
   * REGRA CRÍTICA: o verbo PRECISA estar em KNOWN_PREFIXES. Sem isso,
   * qualquer `x.` (incluindo snippets como `per.`) era capturado como
   * comando, bloqueando o pipeline de snippet.
   *
   * Exemplos válidos:
   *   'phr.'             → verb='phr'
   *   'diag.'            → verb='diag'
   *   'diag.narrative.'  → verb='diag', subaction='narrative'
   *   'mut.add.'         → verb='mut', subaction='add'
   *
   * Exemplos inválidos:
   *   'per.'             → 'per' NÃO é verbo → cai em snippet
   *   'kaelin.'          → 'kaelin' NÃO é verbo → cai em snippet/prose
   *   'phr'              → sem ponto
   *   'phr.sh'           → sem ponto final
   */
  detectCommandContext(text, cursorPos) {
    const { line, lineStart, cursorAtEnd } = this._lineAt(text, cursorPos);
    if (!cursorAtEnd) return { valid: false };

    // Regra estrita: último char precisa ser `.`
    if (!line.endsWith('.')) return { valid: false };

    const m = line.match(/^([a-z]+)\.([a-z0-9.]*)$/);
    if (!m) return { valid: false };

    const verb = m[1];
    const rest = m[2];

    // ── FIX: valida que verbo é conhecido ──────────────────
    if (!this.prefixSet.has(verb)) {
      return { valid: false };
    }

    const body = rest.slice(0, -1);

    if (!body) {
      return {
        valid: true,
        verb,
        maybeSubaction: null,
        partial: '',
        fullPrefix: line,
        lineStart,
      };
    }

    return {
      valid: true,
      verb,
      maybeSubaction: body,
      partial: '',
      fullPrefix: line,
      lineStart,
    };
  }

  // ══════════════════════════════════════════════════════════
  // ARG CONTEXT
  // ══════════════════════════════════════════════════════════

  /**
   * Detecta quando o cursor está logo após um `.` nos argumentos.
   *
   * Também valida que o verbo é conhecido (mesma razão).
   *
   * Exemplos válidos:
   *   'phr.show Base.'
   *   'phr.show Base.Apresentação.'
   *   'phr.list parent=Base.'
   *
   * Exemplos inválidos:
   *   'per.foo Base.'  → 'per' não é verbo
   *   'phr.show Base'  → sem ponto final
   */
  detectArgContext(text, cursorPos) {
    const { line, lineStart, cursorAtEnd } = this._lineAt(text, cursorPos);
    if (!cursorAtEnd) return { valid: false };

    if (!line.endsWith('.')) return { valid: false };

    const m = line.match(/^([a-z]+)\.([a-z0-9.]+)(\s+)(.*)$/);
    if (!m) return { valid: false };

    const verb = m[1];
    const action = m[2];
    const args = m[4];

    // ── FIX: valida verbo ──────────────────────────────────
    if (!this.prefixSet.has(verb)) {
      return { valid: false };
    }

    // ── Extrai "caminho" ───────────────────────────────────
    let pathRaw = args;
    let hadParent = false;

    const parentMatch = args.match(/(?:^|\s)parent=([^\s]*)$/);
    if (parentMatch) {
      pathRaw = parentMatch[1];
      hadParent = true;
    } else if (args.includes(' ')) {
      pathRaw = args.split(/\s+/)[0];
    }

    // Regra estrita: pathRaw precisa terminar em `.`
    if (!pathRaw || !pathRaw.endsWith('.')) return { valid: false };

    const fullPath = pathRaw.slice(0, -1);
    const segments = fullPath ? fullPath.split('.').filter(Boolean) : [];

    return {
      valid: true,
      verb,
      action,
      segments,
      partial: '',
      fullPrefix: pathRaw,
      hadParent,
      lineStart,
    };
  }

  // ══════════════════════════════════════════════════════════
  // UTILITÁRIOS
  // ══════════════════════════════════════════════════════════

  stripMarkers(text) {
    const markers = Object.values(MARKERS);
    let out = String(text ?? '');
    for (const m of markers) {
      while (out.includes(m)) out = out.replace(m, '');
    }
    out = out.replace(/[\u200b\u200c\u200d\u2063\u2064\u2062]/g, '');
    return out;
  }

  extractPlaceholderNames(text) {
    const names = [];
    const seen = new Set();
    const re = /\{([^}]+)\}/g;
    let m;
    while ((m = re.exec(String(text ?? ''))) !== null) {
      const name = m[1].trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    }
    return names;
  }

  hasHiddenBlock(text) {
    return String(text ?? '').includes(MARKERS.BLOCK_START);
  }

  findHiddenBlockAt(text, cursorPos) {
    const source = String(text ?? '');
    const pos = typeof cursorPos === 'number' ? cursorPos : source.length;

    let scan = 0;
    while (scan < source.length) {
      const start = source.indexOf(MARKERS.BLOCK_START, scan);
      if (start === -1) break;

      const payloadEnd = source.indexOf(MARKERS.PAYLOAD_END, start + MARKERS.BLOCK_START.length);
      if (payloadEnd === -1) { scan = start + MARKERS.BLOCK_START.length; continue; }

      const contentStart = payloadEnd + MARKERS.PAYLOAD_END.length;
      const close = source.indexOf(MARKERS.BLOCK_END, contentStart);
      if (close === -1) { scan = payloadEnd + MARKERS.PAYLOAD_END.length; continue; }

      const end = close + MARKERS.BLOCK_END.length;
      if (pos >= start && pos <= end) {
        return {
          start,
          end,
          contentStart,
          contentEnd: close,
          hiddenPayload: source.substring(start + MARKERS.BLOCK_START.length, payloadEnd),
        };
      }
      scan = end;
    }
    return null;
  }
}