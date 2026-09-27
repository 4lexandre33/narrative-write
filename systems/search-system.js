/**
 * @file search-system.js
 * @module systems
 * @description Motor de busca com operadores , / | ! " " ~ < > ; %.
 * @imports ecs/system, core/utils/string
 * @level 7
 */

import { System } from '../ecs/system.js';
import { escapeRegExp } from '../core/utils/string.js';

export class SearchSystem extends System {
  constructor() { super('SearchSystem'); }

  run(_line, _ctx, prev) {
    // Sistema passivo — expõe métodos para outros sistemas usarem.
    // Não roda no pipeline principal.
    return prev;
  }

  compile(expr) {
    const text = String(expr || '').trim();
    if (!text) return () => true;
    const ast = this._parse(text);
    return (searchable) => this._evaluate(ast, String(searchable || '').toLowerCase());
  }

  evaluate(expr, searchable) {
    return this.compile(expr)(searchable);
  }

  // ── Parser ────────────────────────────────────────────────

  _parse(expr) {
    if (expr.includes(',')) {
      const parts = this._splitBy(expr, ',');
      return { op: 'AND', children: parts.map(p => this._parse(p.trim())) };
    }
    if (expr.includes('|')) {
      const parts = this._splitBy(expr, '|');
      return { op: 'XOR', children: parts.map(p => this._parse(p.trim())) };
    }
    if (expr.includes('/')) {
      const parts = this._splitBy(expr, '/');
      return { op: 'OR', children: parts.map(p => this._parse(p.trim())) };
    }
    if (expr.startsWith('!')) {
      return { op: 'NOT', child: this._parse(expr.slice(1).trim()) };
    }
    const nearMatch = expr.match(/^(.+?)-(\d+)\/(.+)$/);
    if (nearMatch) {
      return { op: 'NEAR', a: nearMatch[1].trim(), dist: parseInt(nearMatch[2], 10), b: nearMatch[3].trim() };
    }
    const beforeMatch = expr.match(/^(.+?)<(.+)$/);
    if (beforeMatch) return { op: 'BEFORE', a: beforeMatch[1].trim(), b: beforeMatch[2].trim() };
    const afterMatch = expr.match(/^(.+?)>(.+)$/);
    if (afterMatch) return { op: 'AFTER', a: afterMatch[1].trim(), b: afterMatch[2].trim() };
    if (expr.startsWith("'") && expr.endsWith("'") && expr.length > 2) {
      return { op: 'PHRASE', phrase: expr.slice(1, -1).trim().toLowerCase() };
    }
    return { op: 'TERM', term: expr.toLowerCase() };
  }

  _evaluate(ast, text) {
    switch (ast.op) {
      case 'AND': return ast.children.every(c => this._evaluate(c, text));
      case 'OR':  return ast.children.some(c => this._evaluate(c, text));
      case 'XOR': return ast.children.filter(c => this._evaluate(c, text)).length === 1;
      case 'NOT': return !this._evaluate(ast.child, text);
      case 'NEAR': return this._near(text, ast.a.toLowerCase(), ast.b.toLowerCase(), ast.dist);
      case 'BEFORE': return this._before(text, ast.a.toLowerCase(), ast.b.toLowerCase());
      case 'AFTER': return this._after(text, ast.a.toLowerCase(), ast.b.toLowerCase());
      case 'PHRASE': {
        const norm = text.replace(/[\n\r]+/g, ' ').replace(/[^\w]+/g, ' ').replace(/\s+/g, ' ').trim();
        return norm.includes(ast.phrase);
      }
      case 'TERM': {
        const re = new RegExp(`(^|\\s)${escapeRegExp(ast.term)}`);
        return re.test(text);
      }
      default: return false;
    }
  }

  _near(text, a, b, dist) {
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      if (!words[i].includes(a)) continue;
      for (let j = i + 1; j <= Math.min(words.length - 1, i + dist); j++) {
        if (words[j].includes(b)) return true;
      }
    }
    return false;
  }

  _before(text, a, b) {
    const ia = text.indexOf(a), ib = text.indexOf(b);
    return ia >= 0 && ib >= 0 && ia < ib;
  }

  _after(text, a, b) {
    const ia = text.indexOf(a), ib = text.indexOf(b);
    return ia >= 0 && ib >= 0 && ia > ib;
  }

  _splitBy(text, char) {
    const parts = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === "'" && text[i - 1] !== '\\') inQuotes = !inQuotes;
      if (ch === char && !inQuotes) {
        parts.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    parts.push(current);
    return parts;
  }
}