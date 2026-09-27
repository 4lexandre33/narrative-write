/**
 * @file router.js
 * @module context-machine
 * @description Classifica uma linha do editor em tipo de fluxo.
 * @imports core/constants
 * @importedBy context-machine/machine
 * @level 10
 */

import { KNOWN_PREFIXES } from '../core/constants.js';

export class Router {
  constructor() {
    this.prefixes = KNOWN_PREFIXES.map(p => `${p}.`);
  }

  /**
   * Classifica uma linha.
   * @param {string} line
   * @returns {'empty'|'slash-command'|'command'|'prose'}
   */
  classify(line) {
    const t = String(line ?? '').trim();
    if (!t) return 'empty';
    if (t.startsWith('/')) return 'slash-command';

    for (const prefix of this.prefixes) {
      if (t === prefix.slice(0, -1) || t.startsWith(prefix)) {
        return 'command';
      }
    }

    return 'prose';
  }

  /**
   * Lista os prefixos reconhecidos.
   * @returns {string[]}
   */
  knownPrefixes() {
    return [...this.prefixes];
  }

  /**
   * Verifica se um texto é um comando reconhecido.
   * @param {string} line
   * @returns {boolean}
   */
  isCommand(line) {
    return this.classify(line) === 'command';
  }

  /**
   * Verifica se um texto é um slash-command.
   * @param {string} line
   * @returns {boolean}
   */
  isSlashCommand(line) {
    return this.classify(line) === 'slash-command';
  }
}