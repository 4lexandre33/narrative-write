/**
 * @file entity-system.js
 * @module systems
 * @description Handles ent.create / ent.show / ent.list / ent.delete.
 * @imports ecs/system, core/constants, core/utils/hierarchy
 *              components/identity, components/meta
 * @level 7
 *
 * Fase 13 — Hierarquia narrativa:
 *   - Tipos hierárquicos (package/category/set/phrase/placeholder-term)
 *     permitem nomes duplicados quando o `parent=` é diferente.
 *     O id interno ganha sufixo `__2`, `__3`, etc.
 *   - `_show`, `_delete` usam `resolvePath` para aceitar
 *     caminho hierárquico (`Base.Apresentação.Inimigo.Frase 1`).
 *   - `_create` valida que duplicatas no MESMO pai são rejeitadas.
 */

import { System } from '../ecs/system.js';
import {
  ENTITY_TYPE_LABEL,
  COMPONENT_NAMES,
  HIERARCHICAL_TYPES,
} from '../core/constants.js';
import { makeIdentity } from '../components/identity.js';
import { makeMeta } from '../components/meta.js';
import {
  resolvePath,
  listCandidates,
  buildPath,
} from '../core/utils/hierarchy.js';

/**
 * Tipos que exigem o componente Body (frases).
 * @type {ReadonlyArray<string>}
 */
const _TYPES_WITH_BODY = Object.freeze(['phrase']);

export class EntitySystem extends System {
  constructor() { super('EntitySystem'); }

  run(_line, ctx, prev) {
    const ast = prev.ast;
    if (!ast || ast.verb !== 'ent') return prev;

    try {
      switch (ast.action) {
        case 'create': return this._create(prev, ast, ctx);
        case 'show':   return this._show(prev, ast);
        case 'list':   return this._list(prev, ast);
        case 'delete': return this._delete(prev, ast);
        default:       return { ...prev, ok: false, halt: true, error: `ent.${ast.action} não tratado` };
      }
    } catch (err) {
      return { ...prev, ok: false, halt: true, error: err.message };
    }
  }

  // ══════════════════════════════════════════════════════════
  // CREATE
  // ══════════════════════════════════════════════════════════

  _create(prev, ast, ctx) {
    const isHierarchical = HIERARCHICAL_TYPES.includes(ast.subtype);

    // ── Resolve o parent (se passado) ──────────────────────
    const parentRef = ast.opts?.parent ?? null;
    let parentId = null;
    if (parentRef) {
      parentId = resolvePath(this.world, parentRef);
      if (!parentId) {
        return {
          ...prev, ok: false, halt: true,
          error: `parent não encontrado: ${parentRef}`,
        };
      }
    }

    // ── Validação de colisão ───────────────────────────────
    let id = ast.name;

    if (this.world.hasEntity(id)) {
      if (!isHierarchical) {
        return { ...prev, ok: false, halt: true, error: `entidade já existe: ${ast.name}` };
      }
      // Hierárquico: se o pai é o mesmo, é duplicata real
      const existingLinks = this.world.get(id, COMPONENT_NAMES.LINKS);
      const existingParent = existingLinks?.parent ?? null;
      if (existingParent === parentId) {
        return {
          ...prev, ok: false, halt: true,
          error: `já existe "${ast.name}" em ${parentId ? buildPath(this.world, parentId) : '(raiz)'}`,
        };
      }
      // Pai diferente → permite, com id sufixado
      let n = 2;
      while (this.world.hasEntity(`${ast.name}__${n}`)) {
        // Também checa se o pai desse sufixo é o mesmo
        const links = this.world.get(`${ast.name}__${n}`, COMPONENT_NAMES.LINKS);
        const p = links?.parent ?? null;
        if (p === parentId) {
          return {
            ...prev, ok: false, halt: true,
            error: `já existe "${ast.name}" em ${parentId ? buildPath(this.world, parentId) : '(raiz)'}`,
          };
        }
        n++;
        if (n > 1000) {
          return { ...prev, ok: false, halt: true, error: 'colisão excessiva de id interno' };
        }
      }
      id = `${ast.name}__${n}`;
    }

    // ── Gera shortcode ─────────────────────────────────────
    const shortId = this.ids.generate(ast.subtype, ast.name);

    // ── Componentes base ───────────────────────────────────
    const components = {
      [COMPONENT_NAMES.IDENTITY]: makeIdentity({
        id: shortId,
        name: ast.name,
        description: ast.opts.description ?? '',
        type: ast.subtype,
      }),
      [COMPONENT_NAMES.META]: makeMeta({ builtin: false, tick: ctx.tick }),
    };

    // ── Coleta componentes dos opts ────────────────────────
    const stats = {};
    const flags = [];
    const tags = [];
    const enums = {};
    const texts = {};
    const links = {};
    let bodyText = null;
    let placeholderName = null;

    if (parentId) links.parent = parentId;

    for (const [k, v] of Object.entries(ast.opts)) {
      if (k === 'description') continue;
      if (k === 'parent') continue;    // já processado

      if (k === 'flags') {
        v.split(',').map(s => s.trim()).filter(Boolean).forEach(f => flags.push(f));
      } else if (k === 'tags') {
        v.split(',').map(s => s.trim()).filter(Boolean).forEach(t => tags.push(t));
      } else if (['location', 'owner'].includes(k)) {
        links[k] = resolvePath(this.world, v) ?? v;
      } else if (['inventory', 'members', 'contains'].includes(k)) {
        links[k] = v.split(',').map(s => s.trim()).filter(Boolean)
          .map(ref => resolvePath(this.world, ref) ?? ref);
      } else if (['faction', 'role', 'region', 'type', 'ideology'].includes(k)) {
        enums[k] = v;
      } else if (k === 'body') {
        bodyText = String(v);
      } else if (k === 'placeholderName') {
        placeholderName = String(v);
      } else {
        const trimmed = String(v).trim();
        const num = Number(trimmed);
        if (trimmed !== '' && Number.isFinite(num)) stats[k] = num;
        else texts[k] = v;
      }
    }

    // ── Auto-preenchimento por tipo ────────────────────────
    if (_TYPES_WITH_BODY.includes(ast.subtype) && bodyText === null) {
      bodyText = ast.name;
    }
    if (ast.subtype === 'placeholder-term' && placeholderName === null) {
      placeholderName = 'termo';
    }

    // ── Monta componentes ──────────────────────────────────
    if (Object.keys(stats).length) components[COMPONENT_NAMES.STATS] = stats;
    if (flags.length) components[COMPONENT_NAMES.FLAGS] = { values: flags };
    if (tags.length) components[COMPONENT_NAMES.TAGS] = { values: tags };
    if (Object.keys(enums).length) components[COMPONENT_NAMES.ENUMS] = enums;
    if (Object.keys(texts).length) components[COMPONENT_NAMES.TEXTS] = texts;
    if (Object.keys(links).length) components[COMPONENT_NAMES.LINKS] = links;

    if (bodyText !== null) {
      components[COMPONENT_NAMES.BODY] = { text: bodyText };
    }
    if (placeholderName !== null) {
      if (!components[COMPONENT_NAMES.ENUMS]) components[COMPONENT_NAMES.ENUMS] = {};
      components[COMPONENT_NAMES.ENUMS].placeholderName = placeholderName;
    }

    // ── Cria ───────────────────────────────────────────────
    this.world.createEntity(components, { id });

    const canonicalPath = buildPath(this.world, id);

    return { ...prev, ok: true, mutated: true, created: {
      id,
      shortId,
      name: ast.name,
      type: ast.subtype,
      components: Object.keys(components),
      parent: parentId,
      path: canonicalPath,
      wasSuffixed: id !== ast.name,
    }};
  }

  // ══════════════════════════════════════════════════════════
  // SHOW
  // ══════════════════════════════════════════════════════════

  _show(prev, ast) {
    const target = this._resolve(ast.target);
    if (!target) {
      return this._notFound(prev, ast.target);
    }

    const data = this.world.componentsOf(target);
    const canonicalPath = buildPath(this.world, target);

    return { ...prev, ok: true, right: {
      kind: 'card',
      title: `${data.Identity?.name} (${data.Identity?.id})`,
      data: {
        '— caminho —': canonicalPath,
        ...data,
      },
    }};
  }

  // ══════════════════════════════════════════════════════════
  // LIST
  // ══════════════════════════════════════════════════════════

  _list(prev, ast) {
    const type = ast.subtype;
    const all = this.world.allEntities();
    const filtered = type
      ? all.filter(id => this.world.get(id, COMPONENT_NAMES.IDENTITY)?.type === type)
      : all;

    const rows = filtered.map(id => {
      const ident = this.world.get(id, COMPONENT_NAMES.IDENTITY);
      const links = this.world.get(id, COMPONENT_NAMES.LINKS);
      return {
        id: ident?.id ?? '?',
        name: ident?.name ?? '?',
        type: ident?.type ?? '?',
        path: buildPath(this.world, id),
        parent: links?.parent
          ? this.world.get(links.parent, COMPONENT_NAMES.IDENTITY)?.name ?? links.parent
          : '',
        blueprint: this.world.has(id, COMPONENT_NAMES.IS_BLUEPRINT) ? 'sim' : '',
        instanceOf: this.world.get(id, COMPONENT_NAMES.INSTANCE_OF)?.id ?? '',
      };
    });

    return { ...prev, ok: true, right: {
      kind: 'table',
      title: `Entidades (${filtered.length})`,
      data: rows,
    }};
  }

  // ══════════════════════════════════════════════════════════
  // DELETE
  // ══════════════════════════════════════════════════════════

  _delete(prev, ast) {
    const target = this._resolve(ast.target);
    if (!target) {
      return this._notFound(prev, ast.target);
    }

    // Bloqueia remoção de seeds (`__`-prefixados)
    if (String(target).startsWith('__')) {
      return {
        ...prev, ok: false, halt: true,
        error: `não é possível apagar entidades builtin: ${target}`,
      };
    }

    this.world.destroyEntity(target);
    return { ...prev, ok: true, mutated: true, destroyed: target };
  }

  // ══════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════

  /**
   * Resolve uma referência (caminho, shortcode, nome, id interno).
   * @private
   */
  _resolve(ref) {
    return resolvePath(this.world, ref);
  }

  /**
   * Erro enriquecido quando não encontra — inclui candidatos ambíguos.
   * @private
   */
  _notFound(prev, ref) {
    const candidates = listCandidates(this.world, ref);

    if (candidates.length === 0) {
      return { ...prev, ok: false, halt: true, error: `entidade não encontrada: ${ref}` };
    }

    // Encontrou mas ambíguo
    const list = candidates
      .map(c => `  • ${c.name} (${c.shortId}) — ${c.path}`)
      .join('\n');

    return {
      ...prev, ok: false, halt: true,
      error: `referência "${ref}" é ambígua entre ${candidates.length} entidades:\n${list}\n\nUse o caminho completo ou o shortcode.`,
    };
  }
}