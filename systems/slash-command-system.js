/**
 * @file slash-command-system.js
 * @module systems
 * @description Handles /play, /editor, /help, /roll, /reset, /save.
 * @imports ecs/system
 * @level 7
 */

import { System } from '../ecs/system.js';

export class SlashCommandSystem extends System {
  constructor() { super('SlashCommandSystem'); }

  run(_line, _ctx, prev) {
    const ast = prev.ast;
    if (!ast || ast.verb !== 'slash') return prev;

    const cmd = ast.command;
    const allowed = ['play', 'editor', 'help', 'roll', 'reset', 'save'];
    if (!allowed.includes(cmd)) {
      return { ...prev, ok: false, halt: true, error: `comando desconhecido: /${cmd}` };
    }

    switch (cmd) {
      case 'play':
        this.machine.state.play = true;
        break;

      case 'editor':
        this.machine.state.play = false;
        break;

      case 'save':
        this.bus.emit('persist:flush', { reason: 'manual' });
        break;

      case 'reset':
        this.bus.emit('machine:reset-requested', {});
        break;

      case 'help':
        this.machine.handleLine('help.cheatsheet');
        break;

      case 'roll':
        this.machine.state.roll = this.machine.state.roll ?? 'n';
        this.bus.emit('ui:roll:start', {
          system: this.machine.state.roll,
          tick: this.getTick(),
        });
        break;

      default:
        break;
    }

    return { ...prev, ok: true, mutated: false, mode: cmd };
  }
}