/**
 * @file expression-evaluator.js
 * @module systems/helpers
 * @description Avalia expressões booleanas simples usadas em regras (IF).
 * @imports core/constants
 * @importedBy systems/helpers/guard-evaluator
 * @level 8
 *
 * Sintaxe suportada:
 *   A = B                     igualdade
 *   A != B                    diferença
 *   A > N  /  A < N           comparação numérica
 *   A >= N / A <= N           comparação numérica
 *   A ~ /regex/               match regex
 *   A                         campo existe (truthy)
 *   !A                        negação
 *   A AND B / A OR B          combinadores
 *   A in B                    A presente em B (array)
 *   A contains B              A contém B (string)
 *   true / false              literais
 *
 * Resolução de paths:
 *   this.stats.fear           → lê Stats.fear da entidade em ctx.entity/this/target
 *   newEntity.name            → lê Identity.name da entidade em ctx.newEntity
 *   Cinza.weather             → lê o primeiro campo "weather" que existir em
 *                                qualquer componente de "Cinza"
 *   type                      → se ctx.entity existe, lê Identity.type
 */

import { COMPONENT_NAMES } from '../../core/constants.js';

export class ExpressionEvaluator {
  /**
   * @param {Object} world
   */
  constructor(world) {
    this.world = world;

    /**
     * Aliases de componente de primeiro nível.
     * Se o path começa com um destes, o acesso é direto.
     * @type {Object<string,string>}
     */
    this.aliases = {
      stats: 'Stats',
      flags: 'Flags',
      enums: 'Enums',
      texts: 'Texts',
      lists: 'Lists',
      links: 'Links',
      tags:  'Tags',
      knows: 'Knows',
      meta:  'Meta',
      identity: 'Identity',
    };
  }

  // ── API principal ───────────────────────────────────────────

  /**
   * Avalia uma expressão completa contra um contexto.
   *
   * @param {string} expr
   * @param {Object} ctx — { entity, this, target, new, newEntity, evt, payload, ... }
   * @returns {boolean}
   */
  evaluate(expr, ctx = {}) {
    const text = String(expr ?? 'true').trim();
    if (!text || text === 'true') return true;
    if (text === 'false') return false;

    // OR (menor precedência)
    const orParts = this._splitTop(text, ' OR ');
    if (orParts.length > 1) {
      return orParts.some(p => this.evaluate(p, ctx));
    }

    // AND
    const andParts = this._splitTop(text, ' AND ');
    if (andParts.length > 1) {
      return andParts.every(p => this.evaluate(p, ctx));
    }

    // NOT (prefixo)
    if (text.startsWith('NOT ')) {
      return !this.evaluate(text.slice(4), ctx);
    }
    if (text.startsWith('!')) {
      return !this.evaluate(text.slice(1), ctx);
    }

    return this._evaluateLeaf(text, ctx);
  }

  // ── Folha: comparações ──────────────────────────────────────

  /**
   * @private
   */
  _evaluateLeaf(text, ctx) {
    // contains
    let m = text.match(/^(.+?)\s+contains\s+(.+)$/);
    if (m) {
      const a = this._resolveValue(m[1], ctx);
      const b = this._resolveValue(m[2], ctx);
      return String(a ?? '').includes(String(b ?? ''));
    }

    // in
    m = text.match(/^(.+?)\s+in\s+(.+)$/);
    if (m) {
      const a = this._resolveValue(m[1], ctx);
      const b = this._resolveValue(m[2], ctx);
      if (Array.isArray(b)) return b.includes(a);
      if (typeof b === 'string') return b.includes(String(a ?? ''));
      return false;
    }

    // regex match:  A ~ /re/flags
    m = text.match(/^(.+?)\s*~\s*\/(.+)\/(\w*)$/);
    if (m) {
      const value = String(this._resolveValue(m[1], ctx) ?? '');
      try {
        const re = new RegExp(m[2], m[3] || '');
        return re.test(value);
      } catch {
        return false;
      }
    }

    // comparação:  A op B
    m = text.match(/^(.+?)\s*(>=|<=|!=|>|<|=)\s*(.+)$/);
    if (m) {
      const left = this._resolveValue(m[1], ctx);
      const op = m[2];
      const right = this._resolveValue(m[3], ctx);
      return this._compare(left, op, right);
    }

    // termo simples (truthy)
    const value = this._resolveValue(text, ctx);
    return this._isTruthy(value);
  }

  // ── Resolução de valores ────────────────────────────────────

  /**
   * @private
   */
  _resolveValue(raw, ctx) {
    const token = String(raw).trim();

    // literais
    if (token === 'true') return true;
    if (token === 'false') return false;
    if (token === 'null') return null;

    // número
    if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token);

    // string entre aspas
    if ((token.startsWith('"') && token.endsWith('"')) ||
        (token.startsWith("'") && token.endsWith("'"))) {
      return token.slice(1, -1);
    }

    // variável de contexto (this, target, entity, new, newEntity, evt, payload)
    if (Object.prototype.hasOwnProperty.call(ctx, token)) {
      return ctx[token];
    }

    // path: Entity.field[.sub]
    const dot = token.indexOf('.');
    if (dot > 0) {
      const entityRef = token.slice(0, dot);
      const path = token.slice(dot + 1);
      const entityId = this._resolveEntity(entityRef, ctx);
      if (!entityId) return null;
      return this._readPath(entityId, path);
    }

    // palavra simples (sem ponto) — tenta ler do Identity da entidade atual
    if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(token)) {
      const currentId = ctx.entity ?? ctx.this ?? ctx.target;
      if (currentId && this.world.hasEntity(currentId)) {
        const ident = this.world.get(currentId, COMPONENT_NAMES.IDENTITY);
        if (ident && Object.prototype.hasOwnProperty.call(ident, token)) {
          return ident[token];
        }
      }
    }

    // referência a entidade (nome curto ou shortcode)
    const id = this._resolveEntity(token, ctx);
    if (id) return id;

    // fallback: devolve o token como string literal
    return token;
  }

  /**
   * Resolve uma referência (variável de contexto, id interno ou shortcode)
   * para o id interno da entidade.
   * @private
   */
  _resolveEntity(ref, ctx) {
    if (!ref) return null;

    // variável de contexto
    if (Object.prototype.hasOwnProperty.call(ctx, ref)) {
      const v = ctx[ref];
      if (typeof v === 'string' && this.world.hasEntity(v)) return v;
      if (v?.id && this.world.hasEntity(v.id)) return v.id;
    }

    // id interno
    if (this.world.hasEntity(ref)) return ref;

    // shortcode (Identity.id)
    for (const id of this.world.allEntities()) {
      const ident = this.world.get(id, COMPONENT_NAMES.IDENTITY);
      if (ident?.id === ref) return id;
    }

    return null;
  }

  /**
   * Lê um path dentro de uma entidade.
   *
   * Se o primeiro segmento é um alias conhecido (`stats`, `flags`, …), o acesso
   * é direto ao componente correspondente.
   *
   * Caso contrário, varre TODOS os componentes da entidade procurando
   * um campo com aquele nome — cobre `newEntity.name` (Identity.name),
   * `Cinza.weather` (enums/texts/stats), etc.
   *
   * @param {string} entityId
   * @param {string} path
   * @returns {any}
   * @private
   */
  _readPath(entityId, path) {
    if (!path) return null;
    const parts = String(path).split('.');
    const head = parts[0];
    const compName = this.aliases[head];

    // Caso A: alias conhecido → acesso direto
    if (compName) {
      const comp = this.world.get(entityId, compName);
      if (comp == null) return null;

      if (parts.length === 1) return comp;

      let cur = comp;
      for (let i = 1; i < parts.length; i++) {
        if (cur == null) return null;
        cur = cur[parts[i]];
      }
      return cur;
    }

    // Caso B: sem alias → varre todos os componentes procurando o campo
    const comps = this.world.componentsOf(entityId);
    if (!comps) return null;

    for (const data of Object.values(comps)) {
      if (data == null || typeof data !== 'object') continue;
      if (!Object.prototype.hasOwnProperty.call(data, head)) continue;

      let cur = data[head];
      for (let i = 1; i < parts.length; i++) {
        if (cur == null) return null;
        cur = cur[parts[i]];
      }
      return cur;
    }

    return null;
  }

  // ── Comparadores ────────────────────────────────────────────

  /**
   * @private
   */
  _compare(a, op, b) {
    const na = Number(a);
    const nb = Number(b);
    const numeric = Number.isFinite(na) && Number.isFinite(nb);

    switch (op) {
      case '=':  return numeric ? na === nb : a === b;
      case '!=': return numeric ? na !== nb : a !== b;
      case '>':  return numeric && na > nb;
      case '<':  return numeric && na < nb;
      case '>=': return numeric && na >= nb;
      case '<=': return numeric && na <= nb;
      default:   return false;
    }
  }

  /**
   * @private
   */
  _isTruthy(v) {
    if (v === null || v === undefined || v === false) return false;
    if (v === true) return true;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return v.length > 0;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }

  // ── Split de operador no nível de topo ──────────────────────

  /**
   * Divide `text` por `sep` respeitando parênteses e aspas.
   * @private
   */
  _splitTop(text, sep) {
    const out = [];
    let depth = 0;
    let inQuotes = false;
    let buf = '';
    let i = 0;

    while (i < text.length) {
      const ch = text[i];

      if (ch === "'" || ch === '"') {
        inQuotes = !inQuotes;
        buf += ch;
        i++;
        continue;
      }
      if (!inQuotes) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (depth === 0 && text.startsWith(sep, i)) {
          out.push(buf);
          buf = '';
          i += sep.length;
          continue;
        }
      }
      buf += ch;
      i++;
    }
    out.push(buf);
    return out.map(s => s.trim());
  }
}