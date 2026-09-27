/**
 * @file command-system.js
 * @module systems
 * @description Valida o AST e marca o comando como pronto para despacho.
 * @imports ecs/system
 * @level 7
 *
 * Fase 13.7 — Limpeza (auditoria 25/09/2026):
 *   Removida a flag `commandReady: true` (M-10). Nenhum sistema a lia.
 *   Sua intenção era sinalizar "AST é válido, prossiga", mas cada
 *   sistema já valida o que precisa por conta própria. Flag removida
 *   sem impacto funcional.
 */

import { System } from '../ecs/system.js';

export class CommandSystem extends System {
  constructor() { super('CommandSystem'); }

  run(_line, _ctx, prev) {
    const ast = prev.ast;
    if (!ast) return prev;

    // Prosa e slash-command não passam por aqui
    if (ast.verb === 'prose' || ast.verb === 'slash') return prev;

    // Valida campo mínimo
    if (!ast.verb) {
      return { ...prev, ok: false, halt: true, error: 'AST sem verbo' };
    }

    return prev;
  }
}