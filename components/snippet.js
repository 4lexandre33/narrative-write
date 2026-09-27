/**
 * @file snippet.js
 * @module components
 * @description Componentes de snippet (trigger, body, tipo, menu, runs).
 * @imports core/constants
 * @importedBy systems/snippet-system, systems/template-system, ui/floating-menu
 * @level 4
 */

import { COMPONENT_NAMES, SNIPPET_TYPES } from '../core/constants.js';

export const TRIGGER       = COMPONENT_NAMES.TRIGGER;
export const BODY          = COMPONENT_NAMES.BODY;
export const SNIPPET_TYPE  = COMPONENT_NAMES.SNIPPET_TYPE;
export const MENU_OPTS     = COMPONENT_NAMES.MENU_OPTS;
export const RUNS          = COMPONENT_NAMES.RUNS;

/**
 * Cria Trigger.
 * @param {string} value
 * @returns {Object}
 */
export function makeTrigger(value) {
  if (!value) throw new Error('[Trigger] value obrigatório');
  return { value: String(value) };
}

/**
 * Cria Body.
 * @param {string} text
 * @returns {Object}
 */
export function makeBody(text) {
  return { text: String(text ?? '') };
}

/**
 * Cria SnippetType.
 * @param {string} value — 'text' | 'template' | 'menu' | 'command'
 * @returns {Object}
 */
export function makeSnippetType(value) {
  if (!SNIPPET_TYPES.includes(value)) {
    throw new Error(`[SnippetType] tipo inválido: ${value}`);
  }
  return { value };
}

/**
 * Cria MenuOpts.
 *
 * Cada opção pode ter:
 *   { key: string, label: string, type?: 'text'|'submenu', body?: string, run?: string }
 *
 *   - key:   identificador curto (obrigatório)
 *   - label: texto exibido no menu (default: key)
 *   - type:  'text' | 'submenu' (default: 'text')
 *   - body:  texto a inserir no editor ao confirmar (default: null)
 *   - run:   comando a executar via machine.handleLine (default: null)
 *
 * @param {Array} options
 * @returns {Object}
 */
export function makeMenuOpts(options = []) {
  const normalized = (Array.isArray(options) ? options : [])
    .filter(o => o && o.key)
    .map(o => ({
      key: String(o.key),
      label: String(o.label ?? o.key),
      type: o.type === 'submenu' ? 'submenu' : 'text',
      body: typeof o.body === 'string' ? o.body : null,
      run: typeof o.run === 'string' ? o.run : null,
    }));
  return { options: normalized };
}

/**
 * Cria Runs.
 * @param {string[]} cmds
 * @returns {Object}
 */
export function makeRuns(cmds = []) {
  return { cmds: (Array.isArray(cmds) ? cmds : []).map(String) };
}

/**
 * Verifica se um snippet é de um certo tipo.
 * @param {Object} snippetType
 * @param {string} type
 * @returns {boolean}
 */
export function isType(snippetType, type) {
  return snippetType?.value === type;
}

/**
 * Extrai os nomes de placeholders `{x}` de um body.
 * @param {string} body
 * @returns {string[]}
 */
export function extractPlaceholderNames(body) {
  const out = [];
  const seen = new Set();
  const re = /\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(String(body || ''))) !== null) {
    const name = m[1].trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/**
 * Interpola placeholders num body.
 * @param {string} body
 * @param {Object<string,string>} values
 * @returns {string}
 */
export function interpolateBody(body, values = {}) {
  return String(body || '').replace(/\{([^}]+)\}/g, (m, name) => {
    const key = name.trim();
    return Object.prototype.hasOwnProperty.call(values, key)
      ? String(values[key])
      : m;
  });
}