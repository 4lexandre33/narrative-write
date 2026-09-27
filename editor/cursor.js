/**
 * @file cursor.js
 * @module editor
 * @description Mede a posição real do cursor dentro de um textarea.
 * @imports core/utils/dom
 * @importedBy editor/editor, ui/floating-menu
 * @level 11
 */

import { measureText } from '../core/utils/dom.js';

export class CursorTracker {
  /**
   * @param {HTMLTextAreaElement} textarea
   */
  constructor(textarea) {
    this.textarea = textarea;
    this._canvas = null;
  }

  /**
   * Retorna a posição do cursor em coordenadas de viewport.
   * @returns {{ x:number, y:number }}
   */
  getPosition() {
    if (!this.textarea) return { x: 0, y: 0 };
    const ta = this.textarea;
    const rect = ta.getBoundingClientRect();
    const style = window.getComputedStyle(ta);

    const paddingLeft = parseInt(style.paddingLeft, 10) || 0;
    const paddingTop = parseInt(style.paddingTop, 10) || 0;
    const borderLeft = parseInt(style.borderLeftWidth, 10) || 0;
    const borderTop = parseInt(style.borderTopWidth, 10) || 0;
    const lineHeight = parseInt(style.lineHeight, 10) || this._lineHeight(style);

    const value = ta.value || '';
    const cursorPos = ta.selectionStart ?? value.length;

    const beforeCursor = value.substring(0, cursorPos);
    const lines = beforeCursor.split('\n');
    const currentLineIdx = lines.length - 1;
    const currentLine = lines[currentLineIdx];

    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const innerWidth = ta.clientWidth - borderLeft
      - (parseInt(style.borderRightWidth, 10) || 0)
      - paddingLeft - (parseInt(style.paddingRight, 10) || 0);

    let wrapped = 0;
    for (let i = 0; i < currentLineIdx; i++) {
      wrapped += this._wrapCount(lines[i], innerWidth, font) - 1;
    }

    const currentWrap = this._wrapCount(currentLine, innerWidth, font);
    let finalX;

    if (currentWrap <= 1) {
      finalX = measureText(currentLine, font);
    } else {
      const words = currentLine.split(' ');
      let acc = 0;
      let xInLine = 0;
      for (let i = 0; i < words.length; i++) {
        const w = words[i] + (i < words.length - 1 ? ' ' : '');
        const ww = measureText(w, font);
        if (acc + ww > innerWidth && acc > 0) {
          acc = ww;
          xInLine = ww;
        } else {
          acc += ww;
          xInLine = acc;
        }
      }
      finalX = xInLine;
    }

    const scrollLeft = ta.scrollLeft || 0;
    const scrollTop = ta.scrollTop || 0;

    const x = rect.left + borderLeft + paddingLeft + finalX - scrollLeft;
    const y = rect.top + borderTop + paddingTop
      + ((currentLineIdx + wrapped + (currentWrap - 1)) * lineHeight)
      - scrollTop;

    return { x, y };
  }

  /**
   * Calcula quantas linhas visuais uma linha ocupa.
   * @param {string} line
   * @param {number} innerWidth
   * @param {string} font
   * @returns {number}
   * @private
   */
  _wrapCount(line, innerWidth, font) {
    if (!line) return 1;
    const width = measureText(line, font);
    if (width <= innerWidth) return 1;

    const words = line.split(' ');
    let acc = 0;
    let visualLines = 1;

    for (let i = 0; i < words.length; i++) {
      const w = words[i] + (i < words.length - 1 ? ' ' : '');
      const ww = measureText(w, font);
      if (acc + ww > innerWidth && acc > 0) {
        visualLines++;
        acc = ww;
      } else {
        acc += ww;
      }
    }
    return visualLines;
  }

  /**
   * Altura de linha quando `lineHeight` é `normal`.
   * @param {CSSStyleDeclaration} style
   * @returns {number}
   * @private
   */
  _lineHeight(style) {
    const fs = parseInt(style.fontSize, 10) || 14;
    return Math.round(fs * 1.4);
  }

  /**
   * Libera referências.
   * Fase C — usado pelo UI test harness para evitar leaks entre cenários.
   */
  destroy() {
    this.textarea = null;
    this._canvas = null;
  }
}