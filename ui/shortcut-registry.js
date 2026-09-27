/**
 * @file shortcut-registry.js
 * @module ui
 * @description Define todos os atalhos globais do sistema.
 * @imports — (nenhum)
 * @importedBy ui/keyboard-router
 * @level 12
 *
 * Fase 13.7 — Fiação órfã (auditoria 25/09/2026):
 *   Removidas as entradas `undo`, `redo` e `redo-alt`. Nenhuma delas
 *   tinha implementação real (o KeyboardRouter só mostrava um toast
 *   "em breve"). Serão readicionadas quando `Machine.undo()` existir.
 *   Isso também elimina a inconsistência semântica entre `redo` e
 *   `redo-alt` (o `match()` retornava `'redo'` para ambos, mas o
 *   `keysFor('redo-alt')` devolvia a string de `Ctrl+Shift+Z`).
 */

export const SHORTCUTS = Object.freeze([
  { name: 'history',           keys: 'Ctrl+H',        description: 'Histórico' },
  { name: 'save',              keys: 'Ctrl+S',        description: 'Salvar' },
  { name: 'toggle-panel',      keys: 'Ctrl+K',        description: 'Alternar painel' },
  { name: 'toggle-left',       keys: 'Ctrl+B',        description: 'Alternar painel esquerdo' },
  { name: 'toggle-right',      keys: 'Ctrl+Shift+B',  description: 'Alternar painel direito' },
  { name: 'help',              keys: 'F1',            description: 'Ajuda' },
  { name: 'play',              keys: 'F5',            description: 'Modo jogo' },
]);

export class ShortcutRegistry {
  constructor() {
    this.map = new Map();
    for (const s of SHORTCUTS) {
      this.map.set(s.name, s);
    }
  }

  /**
   * Testa um evento de teclado contra o registro.
   * Retorna o nome do atalho, ou null.
   *
   * @param {KeyboardEvent} e
   * @returns {string|null}
   */
  match(e) {
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const key = String(e.key || '').toLowerCase();

    if (ctrl && !shift && key === 'h') return 'history';
    if (ctrl && !shift && key === 's') return 'save';
    if (ctrl && !shift && key === 'k') return 'toggle-panel';
    if (ctrl && !shift && key === 'b') return 'toggle-left';
    if (ctrl && shift && key === 'b') return 'toggle-right';
    if (e.key === 'F1') return 'help';
    if (e.key === 'F5') return 'play';

    return null;
  }

  get(name) {
    return this.map.get(name) ?? null;
  }

  list() {
    return Array.from(this.map.values());
  }

  keysFor(name) {
    return this.map.get(name)?.keys ?? '';
  }

  /**
   * Libera recursos.
   */
  destroy() {
    this.map.clear();
  }
}