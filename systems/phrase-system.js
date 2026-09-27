/**
 * @file phrase-system.js
 * @module systems
 * @description Handles phr.* — gerenciamento e exibição de frases da
 *              hierarquia narrativa (package → category → set → phrase).
 * @imports ecs/system, core/constants, core/utils/hierarchy
 * @importedBy boot.js
 * @level 7
 *
 * Fase 13 — Comandos:
 *   phr.show <target>                  → card formatado com placeholders destacados
 *   phr.list [parent=<set>]            → tabela de frases (com preview do body)
 *   phr.render <target> [k=v ...]      → interpola placeholders e mostra resultado
 *   phr.find "<termo>"                 → busca em names e bodies
 *   phr.tree <target> [depth=N]        → árvore com preview de body
 *   phr.placeholders <target>          → lista placeholders únicos da frase
 *   phr.set <target> [body=...] [tags=...] [parent=...]
 *                                      → edita campos (body/tags/parent)
 *
 * Aceita referências por:
 *   - Shortcode:        PHR-A1B
 *   - Caminho:          Base.Apresentação.Inimigo.Frase_1
 *   - Nome simples:     "Frase 1"     (só se único)
 *
 * Determinismo: sem Math.random, sem wall-clock.
 */

import { System } from '../ecs/system.js';
import { COMPONENT_NAMES } from '../core/constants.js';
import {
  resolvePath,
  listCandidates,
  buildPath,
} from '../core/utils/hierarchy.js';

export class PhraseSystem extends System {
  constructor() { super('PhraseSystem'); }

  run(_line, _ctx, prev) {
    const ast = prev.ast;
    if (!ast || ast.verb !== 'phr') return prev;

    try {
      switch (ast.action) {
        case 'show':         return this._show(prev, ast);
        case 'list':         return this._list(prev, ast);
        case 'render':       return this._render(prev, ast);
        case 'find':         return this._find(prev, ast);
        case 'tree':         return this._tree(prev, ast);
        case 'placeholders': return this._placeholders(prev, ast);
        case 'set':          return this._set(prev, ast);
        default:
          return { ...prev, ok: false, halt: true, error: `phr.${ast.action} não suportado` };
      }
    } catch (err) {
      return { ...prev, ok: false, halt: true, error: err.message };
    }
  }

  // ══════════════════════════════════════════════════════════
  // phr.show <target>
  // ══════════════════════════════════════════════════════════

  _show(prev, ast) {
    const target = this._resolve(ast.target);
    if (!target) return this._notFound(prev, ast.target);

    const ident = this.world.get(target, COMPONENT_NAMES.IDENTITY);
    const body = this.world.get(target, COMPONENT_NAMES.BODY)?.text ?? '';
    const links = this.world.get(target, COMPONENT_NAMES.LINKS);
    const tags = this.world.get(target, COMPONENT_NAMES.TAGS)?.values ?? [];

    const parentName = links?.parent
      ? this.world.get(links.parent, COMPONENT_NAMES.IDENTITY)?.name ?? links.parent
      : '—';

    const placeholders = this._extractPlaceholders(body);
    const canonicalPath = buildPath(this.world, target);

    return {
      ...prev,
      ok: true,
      right: {
        kind: 'card',
        title: `📝 ${ident?.name ?? target}`,
        data: {
          'caminho':      canonicalPath,
          'shortcode':    ident?.id ?? '—',
          'tipo':         ident?.type ?? '—',
          'parent (set)': parentName,
          'placeholders': placeholders.length > 0 ? placeholders.join(', ') : '(nenhum)',
          'tags':         tags.length > 0 ? tags.join(', ') : '(nenhuma)',
          '— body —':     '',
          'texto':        body || '(vazio)',
        },
        sticky: true,
      },
    };
  }

  // ══════════════════════════════════════════════════════════
  // phr.list [parent=<set>]
  // ══════════════════════════════════════════════════════════

  _list(prev, ast) {
    const parentFilter = ast.opts?.parent ?? null;

    let ids = this._allPhrases();

    if (parentFilter) {
      const parentId = this._resolve(parentFilter);
      if (!parentId) return this._notFound(prev, parentFilter);
      ids = ids.filter(id => {
        const links = this.world.get(id, COMPONENT_NAMES.LINKS);
        return links?.parent === parentId;
      });
    }

    const rows = ids.map(id => {
      const ident = this.world.get(id, COMPONENT_NAMES.IDENTITY);
      const body = this.world.get(id, COMPONENT_NAMES.BODY)?.text ?? '';
      return {
        id: ident?.id ?? '?',
        name: ident?.name ?? '?',
        path: buildPath(this.world, id),
        preview: this._truncate(body, 40),
      };
    });

    const title = parentFilter
      ? `📝 Frases em "${parentFilter}" (${rows.length})`
      : `📝 Frases (${rows.length})`;

    return { ...prev, ok: true, right: { kind: 'table', title, data: rows, sticky: true } };
  }

  // ══════════════════════════════════════════════════════════
  // phr.render <target> [key=value ...]
  // ══════════════════════════════════════════════════════════

  _render(prev, ast) {
    const target = this._resolve(ast.target);
    if (!target) return this._notFound(prev, ast.target);

    const ident = this.world.get(target, COMPONENT_NAMES.IDENTITY);
    const body = this.world.get(target, COMPONENT_NAMES.BODY)?.text ?? '';

    const values = {};
    for (const [k, v] of Object.entries(ast.opts ?? {})) {
      if (k === 'target') continue;
      values[k] = String(v);
    }

    const missing = [];
    const rendered = body.replace(/\{(\w+)\}/g, (_m, key) => {
      if (Object.prototype.hasOwnProperty.call(values, key)) return values[key];
      missing.push(key);
      return `«${key}»`;
    });

    return {
      ...prev,
      ok: true,
      right: {
        kind: 'card',
        title: `📝 ${ident?.name ?? target} — renderizada`,
        data: {
          'caminho':     buildPath(this.world, target),
          'original':    body,
          'renderizada': rendered,
          'faltando':    missing.length > 0 ? missing.join(', ') : '(nenhum)',
        },
        sticky: true,
      },
    };
  }

  // ══════════════════════════════════════════════════════════
  // phr.find "<termo>"
  // ══════════════════════════════════════════════════════════

  _find(prev, ast) {
    const query = String(ast.query ?? '').toLowerCase();
    if (!query) return { ...prev, ok: false, halt: true, error: 'uso: phr.find "termo"' };

    const matches = [];
    for (const id of this._allPhrases()) {
      const ident = this.world.get(id, COMPONENT_NAMES.IDENTITY);
      const body = this.world.get(id, COMPONENT_NAMES.BODY)?.text ?? '';

      const nameHit = (ident?.name ?? '').toLowerCase().includes(query);
      const bodyHit = body.toLowerCase().includes(query);

      if (nameHit || bodyHit) {
        matches.push({
          id: ident?.id ?? '?',
          name: ident?.name ?? '?',
          path: buildPath(this.world, id),
          preview: this._truncate(body, 50),
          onde: nameHit && bodyHit ? 'nome+body' : nameHit ? 'nome' : 'body',
        });
      }
    }

    return {
      ...prev,
      ok: true,
      right: {
        kind: 'table',
        title: `🔍 Frases com "${ast.query}" (${matches.length})`,
        data: matches,
        sticky: true,
      },
    };
  }

  // ══════════════════════════════════════════════════════════
  // phr.tree <target> [depth=N]
  // ══════════════════════════════════════════════════════════

  _tree(prev, ast) {
    const target = this._resolve(ast.target);
    if (!target) return this._notFound(prev, ast.target);

    const depth = Math.max(1, parseInt(ast.opts?.depth ?? '4', 10) || 4);
    const tree = this._walk(target, depth, new Set());

    return { ...prev, ok: true, right: {
      kind: 'tree',
      title: `🌳 ${this.world.get(target, COMPONENT_NAMES.IDENTITY)?.name ?? target}`,
      data: tree,
      sticky: true,
    }};
  }

  // ══════════════════════════════════════════════════════════
  // phr.placeholders <target>
  // ══════════════════════════════════════════════════════════

  _placeholders(prev, ast) {
    const target = this._resolve(ast.target);
    if (!target) return this._notFound(prev, ast.target);

    const body = this.world.get(target, COMPONENT_NAMES.BODY)?.text ?? '';
    const placeholders = this._extractPlaceholders(body);

    const rows = placeholders.map(p => {
      const suggestions = this._suggestFor(p);
      return {
        placeholder: `{${p}}`,
        sugestoes: suggestions.length > 0 ? suggestions.slice(0, 5).join(', ') : '(nenhuma)',
      };
    });

    return { ...prev, ok: true, right: {
      kind: 'table',
      title: `🏷️ Placeholders de "${ast.target}" (${placeholders.length})`,
      data: rows,
      sticky: true,
    }};
  }

  // ══════════════════════════════════════════════════════════
  // phr.set <target> [body=...] [tags=...] [parent=...]
  // ══════════════════════════════════════════════════════════

  _set(prev, ast) {
    const target = this._resolve(ast.target);
    if (!target) return this._notFound(prev, ast.target);

    const opts = ast.opts ?? {};
    const changes = {};

    if (typeof opts.body === 'string') changes.body = opts.body;

    if (typeof opts.tags === 'string') {
      changes.tags = opts.tags.split(',').map(s => s.trim()).filter(Boolean);
    }

    if (typeof opts.parent === 'string') {
      const parentId = this._resolve(opts.parent);
      if (!parentId) return this._notFound(prev, opts.parent);
      changes.parent = parentId;
    }

    if (Object.keys(changes).length === 0) {
      return { ...prev, ok: false, halt: true, error: 'nada a alterar (use body=, tags=, parent=)' };
    }

    if (changes.body !== undefined) {
      if (this.world.has(target, COMPONENT_NAMES.BODY)) {
        this.world.set(target, COMPONENT_NAMES.BODY, { text: changes.body });
      } else {
        this.world.addComponent(target, COMPONENT_NAMES.BODY, { text: changes.body });
      }
    }

    if (changes.tags !== undefined) {
      if (this.world.has(target, COMPONENT_NAMES.TAGS)) {
        this.world.set(target, COMPONENT_NAMES.TAGS, { values: changes.tags });
      } else {
        this.world.addComponent(target, COMPONENT_NAMES.TAGS, { values: changes.tags });
      }
    }

    if (changes.parent !== undefined) {
      if (this.world.has(target, COMPONENT_NAMES.LINKS)) {
        this.world.set(target, COMPONENT_NAMES.LINKS, { parent: changes.parent });
      } else {
        this.world.addComponent(target, COMPONENT_NAMES.LINKS, { parent: changes.parent });
      }
    }

    return {
      ...prev,
      ok: true,
      mutated: true,
      right: {
        kind: 'card',
        title: `✏️ ${this.world.get(target, COMPONENT_NAMES.IDENTITY)?.name ?? target} — atualizada`,
        data: {
          'caminho':   buildPath(this.world, target),
          'alterados': Object.keys(changes).join(', '),
          'body':      changes.body ?? '(inalterado)',
          'tags':      changes.tags ? changes.tags.join(', ') : '(inalterado)',
          'parent':    changes.parent ?? '(inalterado)',
        },
        sticky: true,
      },
    };
  }

  // ══════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════

  _allPhrases() {
    return this.world.allEntities().filter(id =>
      this.world.get(id, COMPONENT_NAMES.IDENTITY)?.type === 'phrase'
    );
  }

  _resolve(ref) {
    return resolvePath(this.world, ref);
  }

  _notFound(prev, ref) {
    const candidates = listCandidates(this.world, ref);

    if (candidates.length === 0) {
      return { ...prev, ok: false, halt: true, error: `frase não encontrada: ${ref}` };
    }

    const list = candidates
      .map(c => `  • ${c.name} (${c.shortId}) — ${c.path}`)
      .join('\n');

    return {
      ...prev, ok: false, halt: true,
      error: `referência "${ref}" é ambígua entre ${candidates.length} entidades:\n${list}\n\nUse o caminho completo ou o shortcode.`,
    };
  }

  _extractPlaceholders(body) {
    const seen = new Set();
    const out = [];
    const re = /\{(\w+)\}/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); }
    }
    return out;
  }

  _suggestFor(name) {
    const out = [];
    for (const id of this.world.allEntities()) {
      const ident = this.world.get(id, COMPONENT_NAMES.IDENTITY);
      if (ident?.type !== 'placeholder-term') continue;
      const enums = this.world.get(id, COMPONENT_NAMES.ENUMS);
      if (enums?.placeholderName === name) out.push(ident.name);
    }
    return out;
  }

  _walk(id, depth, seen) {
    const ident = this.world.get(id, COMPONENT_NAMES.IDENTITY);
    const body = this.world.get(id, COMPONENT_NAMES.BODY)?.text;
    const type = ident?.type ?? '?';

    if (seen.has(id)) {
      return { node: `${ident?.name ?? id} (ciclo)`, children: [] };
    }
    if (depth <= 0) {
      return { node: ident?.name ?? id, children: [] };
    }

    seen.add(id);

    const label = body
      ? `${ident?.name ?? id}  →  "${this._truncate(body, 40)}"`
      : (ident?.name ?? id);

    const children = [];
    for (const other of this.world.allEntities()) {
      if (other === id) continue;
      const links = this.world.get(other, COMPONENT_NAMES.LINKS);
      if (links?.parent === id) {
        children.push(this._walk(other, depth - 1, seen));
      }
    }

    return { node: label, type, children };
  }

  _truncate(s, n) {
    const str = String(s ?? '');
    if (str.length <= n) return str;
    return str.slice(0, n - 1) + '…';
  }
}