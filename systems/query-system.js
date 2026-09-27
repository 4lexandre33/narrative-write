/**
 * @file query-system.js
 * @module systems
 * @description Handles que.*, at.*, whe.*, tim.*.
 * @imports ecs/system, core/constants, core/utils/time
 * @level 7
 *
 * Fase 13.7 — Stubs → Funcionalidades (auditoria 25/09/2026):
 *   - `_wheShow` era stub que retornava `{ data: [] }`. Agora delega
 *     para `_when()`, extraindo `path=valor` da condição. Uso:
 *       whe.show <ent>.<campo>=<valor>
 *   - `_where` agora suporta `que.where.<rel> <ent>`. Antes o rel era
 *     silenciosamente descartado pelo parser e só funcionava
 *     `que.where <ent>` (todos os links). A extração do rel é feita
 *     por regex sobre `ast.raw` porque `_parseQue` não recebe subtype.
 */

import { System } from '../ecs/system.js';
import { COMPONENT_NAMES } from '../core/constants.js';
import { tickToNumber } from '../core/utils/time.js';

export class QuerySystem extends System {
  constructor() { super('QuerySystem'); }

  run(_line, ctx, prev) {
    const ast = prev.ast;
    if (!ast) return prev;

    try {
      if (ast.verb === 'que') {
        if (ast.action === 'at') return this._at(prev, ast);
        if (ast.action === 'when') return this._when(prev, ast);
        if (ast.action === 'timeline') return this._timeline(prev, ast);
        if (ast.action === 'where') return this._where(prev, ast);
      }
      if (ast.verb === 'at') return this._atShow(prev, ast);
      if (ast.verb === 'whe') return this._wheShow(prev, ast);
      if (ast.verb === 'tim') return this._timShow(prev, ast);
      return prev;
    } catch (err) {
      return { ...prev, ok: false, halt: true, error: err.message };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // que.at / at.show
  // ═══════════════════════════════════════════════════════════

  _at(prev, ast) {
    const timeline = this.machine?.systems?.get('TimelineSystem');
    const snap = timeline?.getSnapshot(ast.tick);
    if (!snap) return { ...prev, ok: false, halt: true, error: `tick não encontrado: ${ast.tick}` };

    const target = this.resolve(ast.target.split('.')[0]);
    const field = ast.target.split('.')[1] || 'identity';
    const data = snap.entities[target];
    if (!data) return { ...prev, ok: false, halt: true, error: `entidade não encontrada em ${ast.tick}` };

    const compName = this._fieldToComponent(field);
    const value = compName ? data[compName] : data;

    return { ...prev, ok: true, right: {
      kind: 'card', title: `${ast.target} em ${ast.tick}`,
      data: { tick: ast.tick, entity: target, field, value },
    }};
  }

  _atShow(prev, ast) {
    const timeline = this.machine?.systems?.get('TimelineSystem');
    const tick = ast.opts?.at ?? ast.target;
    const snap = timeline?.getSnapshot(tick);
    if (!snap) return { ...prev, ok: false, halt: true, error: `tick não encontrado: ${tick}` };
    return { ...prev, ok: true, right: { kind: 'card', title: `Snapshot ${tick}`, data: snap }};
  }

  // ═══════════════════════════════════════════════════════════
  // que.when
  // ═══════════════════════════════════════════════════════════

  _when(prev, ast) {
    const timeline = this.machine?.systems?.get('TimelineSystem');
    const entries = timeline?.getTimeline() ?? [];
    const [entRef, field] = String(ast.path || '').split('.');
    const target = this.resolve(entRef);
    const matches = [];

    for (const e of entries) {
      if (!e.mutation) continue;
      if (e.mutation.target !== target) continue;
      if (e.mutation.path !== field && !e.mutation.path?.endsWith(`.${field}`)) continue;
      if (e.mutation.after !== ast.value) continue;
      matches.push({
        tick: e.tick, op: e.mutation.op, path: e.mutation.path,
        before: e.mutation.before, after: e.mutation.after,
      });
    }

    return { ...prev, ok: true, right: { kind: 'table', title: `Quando ${ast.path} = ${ast.value}`, data: matches }};
  }

  // ═══════════════════════════════════════════════════════════
  // whe.show — Fase 13.7
  // ═══════════════════════════════════════════════════════════

  /**
   * `whe.show <ent>.<campo>=<valor>`
   * Delega para `_when` com path e value extraídos da condição.
   *
   * @param {Object} prev
   * @param {Object} ast
   * @returns {Object}
   * @private
   */
  _wheShow(prev, ast) {
    const condition = String(ast.condition || '').trim();
    if (!condition) {
      return {
        ...prev, ok: false, halt: true,
        error: 'uso: whe.show <entidade>.<campo>=<valor>',
      };
    }

    const eq = condition.indexOf('=');
    if (eq <= 0) {
      return {
        ...prev, ok: false, halt: true,
        error: `condição inválida: "${condition}" (esperado <path>=<valor>)`,
      };
    }

    const path = condition.slice(0, eq).trim();
    const value = condition.slice(eq + 1).trim();
    if (!path || !value) {
      return {
        ...prev, ok: false, halt: true,
        error: `condição inválida: "${condition}"`,
      };
    }

    return this._when(prev, { path, value });
  }

  // ═══════════════════════════════════════════════════════════
  // que.timeline / tim.show
  // ═══════════════════════════════════════════════════════════

  _timeline(prev, ast) {
    const timeline = this.machine?.systems?.get('TimelineSystem');
    const entries = timeline?.getTimeline() ?? [];
    const [entRef, field] = String(ast.target || '').split('.');
    const target = this.resolve(entRef);

    const series = [];
    for (const e of entries) {
      if (!e.mutation) continue;
      if (e.mutation.target !== target) continue;
      if (e.mutation.path !== field && !e.mutation.path?.endsWith(`.${field}`)) continue;
      const delta = e.mutation.op === 'add' ? e.mutation.value
        : e.mutation.op === 'set' ? null : null;
      series.push({ tick: e.tick, value: e.mutation.after, delta });
    }

    return { ...prev, ok: true, right: { kind: 'graph', title: ast.target, data: { series } }};
  }

  _timShow(prev, ast) {
    return this._timeline(prev, { target: ast.target });
  }

  // ═══════════════════════════════════════════════════════════
  // que.where — Fase 13.7 (suporte a .<rel>)
  // ═══════════════════════════════════════════════════════════

  /**
   * `que.where <ent>` → todos os links
   * `que.where.<rel> <ent>` → apenas links com esse rel
   *
   * O rel é extraído de `ast.raw` porque `_parseQue` não recebe o
   * subtype do cabeçalho. O parser atual define `ast.subtype = rest[0]`
   * (o alvo), perdendo o rel.
   *
   * @param {Object} prev
   * @param {Object} ast
   * @returns {Object}
   * @private
   */
  _where(prev, ast) {
    const raw = String(ast.raw || '');
    const m = /^que\.where\.([a-zA-Z_][\w-]*)\s+(.+)$/.exec(raw);
    const rel = m ? m[1] : null;
    const targetRef = m ? m[2].trim() : ast.subtype;

    if (!targetRef) {
      return {
        ...prev, ok: false, halt: true,
        error: 'uso: que.where [<rel>] <entidade>',
      };
    }

    const target = this.resolve(targetRef);
    if (!target) {
      return {
        ...prev, ok: false, halt: true,
        error: `entidade não encontrada: ${targetRef}`,
      };
    }

    const links = this.world.get(target, COMPONENT_NAMES.LINKS);
    if (!links) {
      return {
        ...prev, ok: true,
        right: {
          kind: 'table',
          title: `Links de ${targetRef}${rel ? `.${rel}` : ''}`,
          data: [],
        },
      };
    }

    const rows = [];

    if (rel) {
      const value = links[rel];
      if (value === undefined) {
        return {
          ...prev, ok: true,
          right: {
            kind: 'table',
            title: `Links de ${targetRef}.${rel}`,
            data: [],
          },
        };
      }
      const targets = Array.isArray(value) ? value : [value];
      for (const to of targets) {
        rows.push({ rel, to, type: this._typeOf(to) });
      }
    } else {
      for (const [r, value] of Object.entries(links)) {
        if (r === 'parent') continue;
        const targets = Array.isArray(value) ? value : [value];
        for (const to of targets) {
          rows.push({ rel: r, to, type: this._typeOf(to) });
        }
      }
      if (links.parent) {
        rows.push({ rel: 'parent', to: links.parent, type: this._typeOf(links.parent) });
      }
    }

    return {
      ...prev, ok: true,
      right: {
        kind: 'table',
        title: `Links de ${targetRef}${rel ? `.${rel}` : ''} (${rows.length})`,
        data: rows,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  _fieldToComponent(field) {
    const map = { stats: 'Stats', flags: 'Flags', enums: 'Enums', texts: 'Texts', lists: 'Lists', links: 'Links' };
    return map[field] ?? null;
  }

  _typeOf(id) {
    if (!id) return '?';
    const ident = this.world.get(id, COMPONENT_NAMES.IDENTITY);
    return ident?.type ?? '?';
  }
}