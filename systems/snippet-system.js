/**
 * @file snippet-system.js
 * @module systems
 * @description Handles snip.create/* + resolve do trigger.
 * @imports ecs/system, components/*, core/constants
 * @level 7
 */

import { System } from '../ecs/system.js';
import { COMPONENT_NAMES } from '../core/constants.js';
import { makeIdentity } from '../components/identity.js';
import { makeMeta } from '../components/meta.js';
import { makeTrigger, makeBody, makeSnippetType, makeMenuOpts, makeRuns } from '../components/snippet.js';

export class SnippetSystem extends System {
  constructor() { super('SnippetSystem'); }

  run(_line, ctx, prev) {
    const ast = prev.ast;
    if (!ast || ast.verb !== 'snip') return prev;

    try {
      if (ast.action?.startsWith('create')) return this._create(prev, ast, ctx);
      if (ast.action === 'list') return this._list(prev, ast);
      if (ast.action === 'tree') return this._tree(prev, ast);
      if (ast.action === 'find') return this._find(prev, ast);
      if (ast.action === 'delete') return this._delete(prev, ast);
      return prev;
    } catch (err) {
      return { ...prev, ok: false, halt: true, error: err.message };
    }
  }

  resolve(prefix) {
    const all = this.world.query(COMPONENT_NAMES.TRIGGER);
    const matches = [];
    for (const id of all) {
      const trigger = this.world.get(id, COMPONENT_NAMES.TRIGGER).value;
      if (trigger.startsWith(prefix)) {
        const type = this.world.get(id, COMPONENT_NAMES.SNIPPET_TYPE)?.value ?? 'text';
        matches.push({ id, trigger, type, source: 'user' });
      }
    }
    matches.sort((a, b) => b.trigger.length - a.trigger.length);
    return matches;
  }

  _create(prev, ast, ctx) {
    const trigger = ast.trigger;
    if (!trigger) return { ...prev, ok: false, halt: true, error: 'trigger obrigatório' };

    const existing = this.world.query(COMPONENT_NAMES.TRIGGER)
      .find(id => this.world.get(id, COMPONENT_NAMES.TRIGGER).value === trigger);
    if (existing) return { ...prev, ok: false, halt: true, error: `trigger já existe: ${trigger}` };

    const action = ast.action;
    const shortId = this.ids.generate('snippet', trigger);

    const components = {
      [COMPONENT_NAMES.IDENTITY]: makeIdentity({ id: shortId, name: trigger, type: 'snippet' }),
      [COMPONENT_NAMES.TRIGGER]: makeTrigger(trigger),
      [COMPONENT_NAMES.META]: makeMeta({ builtin: false, tick: ctx.tick }),
    };

    if (action === 'create') {
      components[COMPONENT_NAMES.SNIPPET_TYPE] = makeSnippetType('text');
      components[COMPONENT_NAMES.BODY] = makeBody(ast.body || '');
    } else if (action === 'create.template') {
      components[COMPONENT_NAMES.SNIPPET_TYPE] = makeSnippetType('template');
      components[COMPONENT_NAMES.BODY] = makeBody(ast.opts?.body || '');
    } else if (action === 'create.menu') {
      components[COMPONENT_NAMES.SNIPPET_TYPE] = makeSnippetType('menu');
      const optsStr = String(ast.opts?.opts || '').trim();
      let options = [];

      if (optsStr.startsWith('[')) {
        // Nova sintaxe: JSON completo (permite body e run)
        try {
          options = JSON.parse(optsStr);
        } catch (err) {
          return { ...prev, ok: false, halt: true, error: `opts JSON inválido: ${err.message}` };
        }
      } else {
        // Sintaxe antiga: "key1:Label1 key2:Label2"
        options = optsStr.split(/\s+/).filter(Boolean).map(pair => {
          const [key, label] = pair.split(':');
          return { key, label: label || key, type: 'text' };
        });
      }

      components[COMPONENT_NAMES.MENU_OPTS] = makeMenuOpts(options);
    } else if (action === 'create.command') {
      components[COMPONENT_NAMES.SNIPPET_TYPE] = makeSnippetType('command');
      const runsStr = ast.opts?.runs || '';
      components[COMPONENT_NAMES.RUNS] = makeRuns(runsStr.split('\n').map(s => s.trim()).filter(Boolean));
    }

    this.world.createEntity(components, { id: shortId });
    return { ...prev, ok: true, mutated: true, snippet: { trigger, type: action, shortId }};
  }

  _list(prev, ast) {
    const ids = this.world.query(COMPONENT_NAMES.TRIGGER);
    const rows = ids.map(id => ({
      trigger: this.world.get(id, COMPONENT_NAMES.TRIGGER).value,
      type: this.world.get(id, COMPONENT_NAMES.SNIPPET_TYPE)?.value ?? '?',
      shortId: this.world.get(id, COMPONENT_NAMES.IDENTITY)?.id,
    }));
    rows.sort((a, b) => a.trigger.localeCompare(b.trigger));
    return { ...prev, ok: true, right: { kind: 'table', title: `Snippets (${rows.length})`, data: rows }};
  }

  _tree(prev, ast) {
    const ids = this.world.query(COMPONENT_NAMES.TRIGGER);
    const tree = {};
    for (const id of ids) {
      const trigger = this.world.get(id, COMPONENT_NAMES.TRIGGER).value;
      const parts = trigger.split('.');
      let cur = tree;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i] || '__root';
        if (!cur[p]) cur[p] = { children: {}, meta: null };
        if (i === parts.length - 1) cur[p].meta = this.world.get(id, COMPONENT_NAMES.IDENTITY)?.id;
        cur = cur[p].children;
      }
    }
    return { ...prev, ok: true, right: { kind: 'tree', title: 'Árvore de Snippets', data: tree }};
  }

  _find(prev, ast) {
    const query = ast.query || '';
    const ids = this.world.query(COMPONENT_NAMES.TRIGGER);
    const rows = ids
      .filter(id => {
        const trigger = this.world.get(id, COMPONENT_NAMES.TRIGGER).value;
        const body = this.world.get(id, COMPONENT_NAMES.BODY)?.text ?? '';
        return trigger.includes(query) || body.includes(query);
      })
      .map(id => ({
        trigger: this.world.get(id, COMPONENT_NAMES.TRIGGER).value,
        type: this.world.get(id, COMPONENT_NAMES.SNIPPET_TYPE)?.value ?? '?',
        shortId: this.world.get(id, COMPONENT_NAMES.IDENTITY)?.id,
      }));
    return { ...prev, ok: true, right: { kind: 'table', title: `Snippets com "${query}"`, data: rows }};
  }

  _delete(prev, ast) {
    const found = this.world.query(COMPONENT_NAMES.TRIGGER)
      .find(id => this.world.get(id, COMPONENT_NAMES.TRIGGER).value === ast.trigger);
    if (!found) return { ...prev, ok: false, halt: true, error: `snippet não existe: ${ast.trigger}` };
    this.world.destroyEntity(found);
    return { ...prev, ok: true, mutated: true, deleted: ast.trigger };
  }
}