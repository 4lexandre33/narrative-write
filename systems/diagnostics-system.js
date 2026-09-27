/**
 * @file diagnostics-system.js
 * @module systems
 * @description Dispatcher fino para comandos `diag.*`.
 * @imports ecs/system, diagnostics/commands-diag
 * @level 7
 *
 * Fase 13.7 — Refatoração estrutural (auditoria 25/09/2026):
 *   `init()` agora assina `diag:handler:register` para permitir que
 *   sistemas externos registrem handlers de subcomandos `diag.*` sem
 *   que `commands-diag.js` precise importá-los. O caso de uso é o
 *   `NarrativeSystem`, que expõe `diag.narrative.*` sem acoplar a
 *   `systems/` a `narrative-language/`.
 *
 *   Fluxo:
 *     1. Machine.registerSystem(DiagnosticsSystem) → init() assina o bus.
 *     2. Machine.registerSystem(NarrativeSystem)  → init() emite o
 *        `diag:handler:register` com `verb: 'narrative'`.
 *     3. `commands-diag.js` guarda o handler num Map.
 *     4. Em `diag.narrative.recent`, o dispatcher encontra o handler
 *        registrado e delega.
 */

import { System } from '../ecs/system.js';
import { DiagnosticsCommands } from '../diagnostics/commands-diag.js';

export class DiagnosticsSystem extends System {
  constructor() {
    super('DiagnosticsSystem');

    /** @type {DiagnosticsCommands} */
    this.commands = new DiagnosticsCommands(this);
  }

  /**
   * Fase 13.7 — registra handlers externos via bus.
   */
  init() {
    if (!this.bus) return;

    this.bus.on('diag:handler:register', (payload) => {
      const { verb, handler } = payload || {};
      if (typeof verb !== 'string' || !verb) return;
      if (typeof handler !== 'function') return;
      this.commands.registerHandler(verb, handler);
    });
  }

  /**
   * Processa uma linha `diag.*`.
   *
   * Como o DiagnosticsSystem está registrado duas vezes no pipeline
   * `command`, o guard `_diagHandled` impede execução dupla.
   *
   * @param {string} _line
   * @param {Object} _ctx
   * @param {Object} prev
   * @returns {Object}
   */
  run(_line, _ctx, prev) {
    const ast = prev.ast;
    if (!ast || ast.verb !== 'diag') return prev;
    if (prev._diagHandled === true) return prev;

    try {
      const result = this.commands.dispatch(prev, ast);
      return { ...result, _diagHandled: true };
    } catch (err) {
      return {
        ...prev,
        ok: false,
        halt: true,
        error: err?.message ?? String(err),
        _diagHandled: true,
      };
    }
  }
}