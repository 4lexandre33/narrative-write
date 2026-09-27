/**
 * @file search-query-system.js
 * @module systems
 * @description Executa o verbo `sea` — busca textual com operadores.
 * @imports ecs/system, core/constants
 * @level 7
 *
 * Sintaxe:
 *   sea.find   "<expr>"                      busca global
 *   sea.in     <categoria> "<expr>"          busca sob uma categoria (via Links.parent)
 *   sea.tag    <tag>                         lista entidades com uma tag
 *   sea.help                                 cheatsheet dos operadores
 *
 * Operadores (delegados ao SearchSystem):
 *   termo         TERM     busca por palavra
 *   a,b           AND
 *   a/b           OR
 *   a|b           XOR
 *   !a            NOT
 *   'frase'       PHRASE
 *   a<b / a>b     BEFORE / AFTER
 *   a-3/b         NEAR (distância 3)
 */

import { System } from '../ecs/system.js';
import { COMPONENT_NAMES } from '../core/constants.js';

export class SearchQuerySystem extends System {
  constructor() { super('SearchQuerySystem'); }

  run(_line, _ctx, prev) {
    const ast = prev.ast;
    if (!ast || ast.verb !== 'sea') return prev;

    try {
      switch (ast.action) {
        case 'find': return this._find(prev, ast);
        case 'in':   return this._in(prev, ast);
        case 'tag':  return this._tag(prev, ast);
        case 'help': return this._help(prev);
        default:     return prev;
      }
    } catch (err) {
      return { ...prev, ok: false, halt: true, error: err.message };
    }
  }

  // ── Ações ──────────────────────────────────────────────────

  /**
   * Busca global em todas as entidades.
   * @private
   */
  _find(prev, ast) {
    const expr = ast.query || '';
    const predicate = this._compile(expr);

    const matches = [];
    for (const id of this.world.allEntities()) {
      const projection = this._project(id);
      if (!projection) continue;
      if (predicate(projection)) {
        matches.push(this._row(id));
      }
    }

    return { ...prev, ok: true, right: {
      kind: 'table',
      title: `🔍 "${expr}" (${matches.length})`,
      data: matches,
      sticky: true,
    }};
  }

  /**
   * Busca restrita aos descendentes de uma categoria.
   * @private
   */
  _in(prev, ast) {
    const categoryName = ast.subtype;
    const expr = ast.query || '';

    if (!categoryName) {
      return { ...prev, ok: false, halt: true, error: 'uso: sea.in <categoria> "expressão"' };
    }

    const categoryId = this.resolve(categoryName);
    if (!categoryId) {
      return { ...prev, ok: false, halt: true, error: `categoria não encontrada: ${categoryName}` };
    }

    const scope = this._collectDescendants(categoryId);
    const predicate = this._compile(expr);

    const matches = [];
    for (const id of scope) {
      const projection = this._project(id);
      if (!projection) continue;
      if (predicate(projection)) {
        matches.push(this._row(id));
      }
    }

    const ident = this.world.get(categoryId, COMPONENT_NAMES.IDENTITY);
    return { ...prev, ok: true, right: {
      kind: 'table',
      title: `🔍 ${ident?.name ?? categoryName} → "${expr}" (${matches.length})`,
      data: matches,
      sticky: true,
    }};
  }

  /**
   * Lista entidades que possuem uma tag específica.
   * @private
   */
  _tag(prev, ast) {
    const tag = ast.tag;
    if (!tag) return { ...prev, ok: false, halt: true, error: 'uso: sea.tag <tag>' };

    const matches = [];
    for (const id of this.world.allEntities()) {
      const tags = this.world.get(id, COMPONENT_NAMES.TAGS);
      if (tags?.values && tags.values.includes(tag)) {
        matches.push(this._row(id));
      }
    }

    return { ...prev, ok: true, right: {
      kind: 'table',
      title: `🏷️ "${tag}" (${matches.length})`,
      data: matches,
      sticky: true,
    }};
  }

  /**
   * Cheatsheet dos operadores.
   * @private
   */
  _help(prev) {
    return { ...prev, ok: true, right: {
      kind: 'card',
      title: '🔍 Busca — operadores',
      data: {
        'termo':          'busca por palavra',
        'a,b':            'AND (a e b)',
        'a/b':            'OR (a ou b)',
        'a|b':            'XOR (a ou b, não ambos)',
        '!a':             'NOT (sem a)',
        "'frase exata'":  'match de frase',
        'a<b':            'a antes de b',
        'a>b':            'a depois de b',
        'a-3/b':          'a em até 3 palavras de b',
        '—':              '—',
        'sea.find "x"':   'busca global',
        'sea.in cat "x"': 'busca sob categoria',
        'sea.tag t':      'lista entidades com tag',
      },
    }};
  }

  // ── Helpers internos ───────────────────────────────────────

  /**
   * Compila uma expressão usando o SearchSystem.
   * Retorna um predicado `(text) => boolean`.
   * @private
   */
  _compile(expr) {
    const search = this.machine?.systems?.get('SearchSystem');
    if (!search) {
      // Fallback: substring simples, case-insensitive
      const needle = String(expr || '').toLowerCase().trim();
      if (!needle) return () => true;
      return (text) => String(text || '').toLowerCase().includes(needle);
    }
    const predicate = search.compile(expr || '');
    return (text) => predicate(String(text || '').toLowerCase());
  }

  /**
   * Projeta uma entidade num único texto pesquisável.
   * Inclui Identity, Texts, Tags, Flags, Enums, Lists, Body.
   * @private
   */
  _project(id) {
    const world = this.world;
    const parts = [];

    const ident = world.get(id, COMPONENT_NAMES.IDENTITY);
    if (ident) {
      if (ident.name)        parts.push(ident.name);
      if (ident.id)          parts.push(ident.id);
      if (ident.description) parts.push(ident.description);
      if (ident.type)        parts.push(ident.type);
    }

    const texts = world.get(id, COMPONENT_NAMES.TEXTS);
    if (texts) {
      for (const v of Object.values(texts)) {
        if (v != null) parts.push(String(v));
      }
    }

    const tags = world.get(id, COMPONENT_NAMES.TAGS);
    if (tags?.values) {
      for (const t of tags.values) parts.push(String(t));
    }

    const flags = world.get(id, COMPONENT_NAMES.FLAGS);
    if (flags?.values) {
      for (const f of flags.values) parts.push(String(f));
    }

    const enums = world.get(id, COMPONENT_NAMES.ENUMS);
    if (enums) {
      for (const v of Object.values(enums)) {
        if (v != null) parts.push(String(v));
      }
    }

    const lists = world.get(id, COMPONENT_NAMES.LISTS);
    if (lists) {
      for (const arr of Object.values(lists)) {
        if (Array.isArray(arr)) {
          for (const item of arr) parts.push(String(item));
        }
      }
    }

    const body = world.get(id, COMPONENT_NAMES.BODY);
    if (body?.text) parts.push(String(body.text));

    return parts.join(' ');
  }

  /**
   * Linha tabular de uma entidade.
   * @private
   */
  _row(id) {
    const ident = this.world.get(id, COMPONENT_NAMES.IDENTITY);
    return {
      id:   ident?.id   ?? id,
      name: ident?.name ?? id,
      type: ident?.type ?? '?',
    };
  }

  /**
   * Coleta descendentes de uma entidade via `Links.parent` (BFS).
   * Inclui a própria raiz na lista.
   * @private
   */
  _collectDescendants(rootId) {
    const out = [rootId];
    const seen = new Set([rootId]);
    const queue = [rootId];

    while (queue.length) {
      const cur = queue.shift();

      for (const id of this.world.allEntities()) {
        if (seen.has(id)) continue;

        const links = this.world.get(id, COMPONENT_NAMES.LINKS);
        if (!links) continue;

        const parent = links.parent;
        const parents = Array.isArray(parent) ? parent : (parent ? [parent] : []);

        if (parents.includes(cur)) {
          seen.add(id);
          out.push(id);
          queue.push(id);
        }
      }
    }

    return out;
  }
}