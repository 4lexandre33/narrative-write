/**
 * @file help-system.js
 * @module systems
 * @description Handles help.commands/snippets/components/cheatsheet/tutorial.
 * @imports ecs/system, core/constants
 * @level 7
 */

import { System } from '../ecs/system.js';
import { COMPONENT_NAMES } from '../core/constants.js';

export class HelpSystem extends System {
  constructor() { super('HelpSystem'); }

  run(_line, _ctx, prev) {
    const ast = prev.ast;
    if (!ast || ast.verb !== 'help') return prev;

    const reg = this.machine?.registry;
    switch (ast.action) {
      case 'commands':
        return { ...prev, ok: true, right: { kind: 'table', title: '📖 Comandos', data: reg?.getCommands() ?? [], sticky: true }};
      case 'snippets':
        return { ...prev, ok: true, right: { kind: 'tree', title: '🧩 Snippets', data: this._snippetsTree(), sticky: true }};
      case 'components':
        return { ...prev, ok: true, right: { kind: 'table', title: '⚙️ Componentes', data: reg?.getComponents() ?? [], sticky: true }};
      case 'cheatsheet':
        return { ...prev, ok: true, right: { kind: 'card', title: '⚡ Cheatsheet', data: this._cheatsheet(), sticky: true }};
      case 'tutorial':
        return { ...prev, ok: true, right: { kind: 'tutorial-card', title: '🎓 Tutorial', data: { step: 1, total: 7 }}};
      default: return prev;
    }
  }

  // ── Snippets tree ──────────────────────────────────────────

  /**
   * Monta árvore aninhada a partir dos triggers registrados.
   *
   * Fontes:
   *   - Registry (builtin): { trigger, kind, description, subs }
   *   - World (user):       entidades com Trigger
   *
   * Cada nó:
   *   { label, kind, description, source, children: { ... } }
   *
   * @returns {Object}
   * @private
   */
  _snippetsTree() {
    const root = { children: {} };
    const registry = this.machine?.registry;

    // 1. Registry (builtin)
    for (const def of registry?.getSnippets() ?? []) {
      this._insertTrigger(root, def.trigger, {
        kind: def.kind ?? 'menu',
        description: def.description ?? '',
        source: 'builtin',
      });
    }

    // 2. World (user) — sobrepõe builtin quando colidir
    for (const id of this.world.query(COMPONENT_NAMES.TRIGGER)) {
      const trigger = this.world.get(id, COMPONENT_NAMES.TRIGGER)?.value;
      if (!trigger) continue;
      const kind = this.world.get(id, COMPONENT_NAMES.SNIPPET_TYPE)?.value ?? 'text';
      const ident = this.world.get(id, COMPONENT_NAMES.IDENTITY);
      this._insertTrigger(root, trigger, {
        kind,
        description: ident?.description ?? '',
        source: 'user',
      });
    }

    return this._treeToPlain(root);
  }

  /**
   * Insere um trigger na árvore, criando nós intermediários.
   * @param {Object} root
   * @param {string} trigger
   * @param {Object} meta
   * @private
   */
  _insertTrigger(root, trigger, meta) {
    const parts = String(trigger).split('.').filter(Boolean);
    let cur = root;

    // Se termina com '.', o último segmento é vazio e representa o próprio nó
    const endsWithDot = trigger.endsWith('.');

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!cur.children[part]) {
        cur.children[part] = {
          label: part,
          kind: null,
          description: '',
          source: null,
          children: {},
        };
      }
      cur = cur.children[part];
    }

    cur.kind = meta.kind;
    cur.description = meta.description;
    cur.source = meta.source;
    cur.isLeaf = true;
    if (endsWithDot) cur.endsWithDot = true;
  }

  /**
   * Converte árvore interna em estrutura plana serializável.
   * @param {Object} node
   * @returns {Object}
   * @private
   */
  _treeToPlain(node) {
    const out = {};
    for (const [key, child] of Object.entries(node.children ?? {})) {
      const entry = {
        kind: child.kind ?? null,
        description: child.description ?? '',
        source: child.source ?? null,
      };
      if (child.children && Object.keys(child.children).length > 0) {
        entry.children = this._treeToPlain(child);
      }
      out[key] = entry;
    }
    return out;
  }

  // ── Cheatsheet ─────────────────────────────────────────────

  _cheatsheet() {
    return {
      quickCommands: [
        { c: 'ent.create.character X', d: 'cria personagem' },
        { c: 'mut.add.stats X.y 1', d: 'soma stat' },
        { c: 'link.add.rel X Y', d: 'conecta entidades' },
        { c: 'que.at T1 X', d: 'estado em T1' },
        { c: 'sea.find "x"', d: 'busca textual' },
        { c: 'aud.continuity', d: 'checa coerência' },
        { c: 'frk.create alt at T', d: 'ramifica timeline' },
        { c: 'exp.json', d: 'exporta mundo' },
      ],
      operators: [
        { o: '=', d: 'busca global' },
        { o: 'ap.=x', d: 'busca em categoria' },
        { o: 'a,b', d: 'AND' },
        { o: 'a/b', d: 'OR' },
        { o: '!a', d: 'NOT' },
      ],
    };
  }
}