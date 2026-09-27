/**
 * @file keyboard-router.js
 * @module ui
 * @description Roteia eventos de teclado por contexto.
 * @imports ui/shortcut-registry
 * @importedBy boot.js
 * @level 12
 *
 * Fase C:
 *   - Aceita `{ target = document }` opcional no construtor.
 *   - `destroy()` remove o listener de `this.target`.
 *
 * Fase 13.7 — Fiação órfã (auditoria 25/09/2026):
 *   Removidos os `case 'undo'` e `case 'redo'` de `_execute()`.
 *   Eles só emitiam `ui:shortcut` para um toast "em breve". Undo/redo
 *   serão readicionados quando `Machine.undo()` existir.
 */

import { ShortcutRegistry } from './shortcut-registry.js';

export class KeyboardRouter {
  /**
   * @param {Object} machine
   * @param {Object} ui — { floatingMenu, historyPanel, rollOverlay, playOverlay, commandGuide }
   * @param {Object} [opts={}]
   * @param {EventTarget} [opts.target=document]
   */
  constructor(machine, ui, { target = document } = {}) {
    this.machine = machine;
    this.ui = ui || {};
    this.target = target;
    this.shortcuts = new ShortcutRegistry();
    this._handler = null;
    this._bind();
  }

  // ── Ciclo de vida ──────────────────────────────────────────

  destroy() {
    if (this._handler && this.target) {
      try {
        this.target.removeEventListener('keydown', this._handler, true);
      } catch { /* isola */ }
      this._handler = null;
    }
    this.shortcuts?.destroy?.();
  }

  // ── Internos ───────────────────────────────────────────────

  _bind() {
    this._handler = (e) => {
      if (this._overlayActive()) return;

      if (this._contextual(e)) {
        e.stopPropagation();
        return;
      }

      const shortcut = this.shortcuts.match(e);
      if (shortcut) {
        e.preventDefault();
        e.stopPropagation();
        this._execute(shortcut, e);
      }
    };
    this.target.addEventListener('keydown', this._handler, true);
  }

  _overlayActive() {
    const { rollOverlay, playOverlay } = this.ui;
    if (rollOverlay?.visible) return true;
    if (playOverlay?.visible) return true;
    return false;
  }

  _contextual(e) {
    const { floatingMenu, historyPanel, commandGuide } = this.ui;

    if (floatingMenu?.visible) {
      if (e.key === 'ArrowDown') { e.preventDefault(); floatingMenu.moveSelection(1); return true; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); floatingMenu.moveSelection(-1); return true; }
      if (e.key === 'Enter')     { e.preventDefault(); floatingMenu.confirm(); return true; }
      if (e.key === 'Escape')    { e.preventDefault(); floatingMenu.close(); return true; }
      return false;
    }

    if (historyPanel?.visible) {
      if (e.key === 'ArrowDown') { e.preventDefault(); historyPanel.moveSelection(1); return true; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); historyPanel.moveSelection(-1); return true; }
      if (e.key === 'Enter')     { e.preventDefault(); historyPanel.jumpToSelected(); return true; }
      if (e.key === 'Escape')    { e.preventDefault(); historyPanel.close(); return true; }
      return false;
    }

    if (commandGuide?.visible && e.key === 'Escape') {
      e.preventDefault();
      commandGuide.close();
      return true;
    }

    return false;
  }

  _execute(name) {
    const bus = this.machine.bus;

    switch (name) {
      case 'history':
        this.ui.historyPanel?.toggle();
        break;

      case 'save':
        bus.emit('persist:flush', { reason: 'manual' });
        break;

      case 'toggle-panel':
        bus.emit('ui:panel:toggle');
        break;

      case 'toggle-left':
        bus.emit('ui:panel:left:toggle');
        break;

      case 'toggle-right':
        bus.emit('ui:panel:right:toggle');
        break;

      case 'help':
        this.machine.handleLine('help.cheatsheet');
        break;

      case 'play':
        this.ui.playOverlay?.toggle();
        break;

      default:
        break;
    }
  }
}