/**
 * @file template-system.js
 * @module systems
 * @description Gerencia placeholders tipados em templates.
 * @imports ecs/system, core/constants, components/snippet
 * @importedBy boot.js
 * @level 7
 */

import { System } from '../ecs/system.js';
import { COMPONENT_NAMES } from '../core/constants.js';
import { extractPlaceholderNames, interpolateBody } from '../components/snippet.js';

export class TemplateSystem extends System {
  constructor() { super('TemplateSystem'); }

  /**
   * Sistema passivo — não roda no pipeline principal.
   * Expõe métodos que o Editor e o SnippetSystem usam.
   */
  run(_line, _ctx, prev) {
    return prev;
  }

  // ── Inferência de tipo ─────────────────────────────────────

  /**
   * Infere o tipo de um placeholder a partir do seu nome.
   * @param {string} name
   * @returns {string}
   */
  inferType(name) {
    const n = String(name || '').toLowerCase();
    if (/personagem|nome|heroi|heroina|npc|aliado|atacante|alvo/.test(n)) return 'entity.character';
    if (/local|lugar|cidade|regiao|pais|sala|cenario/.test(n)) return 'entity.location';
    if (/item|arma|objeto|escudo/.test(n)) return 'entity.item';
    if (/faccao|grupo|ordem/.test(n)) return 'entity.faction';
    if (/emocao|sentimento|tom/.test(n)) return 'enum';
    if (/numero|valor|dano|hp|custo/.test(n)) return 'number';
    return 'text';
  }

  /**
   * Constrói defs a partir do corpo de um template.
   * @param {string} body
   * @returns {Array<{name:string,type:string,opts:any}>}
   */
  buildDefsFromBody(body) {
    const names = extractPlaceholderNames(body);
    return names.map(name => ({
      name,
      type: this.inferType(name),
      opts: null,
    }));
  }

  /**
   * Interpola placeholders num body.
   * @param {string} body
   * @param {Object<string,string>} values
   * @returns {string}
   */
  interpolate(body, values) {
    return interpolateBody(body, values);
  }

  // ── Sugestões para placeholders ────────────────────────────

  /**
   * Retorna sugestões para um placeholder conforme o tipo.
   * @param {Object} def
   * @returns {string[]}
   */
  suggestionsFor(def) {
    if (!def) return [];

    if (def.type === 'entity.character') {
      return this.world.query(COMPONENT_NAMES.IDENTITY)
        .filter(id => this.world.get(id, COMPONENT_NAMES.IDENTITY)?.type === 'character')
        .map(id => this.world.get(id, COMPONENT_NAMES.IDENTITY)?.name)
        .filter(Boolean);
    }

    if (def.type === 'entity.location') {
      return this.world.query(COMPONENT_NAMES.IDENTITY)
        .filter(id => this.world.get(id, COMPONENT_NAMES.IDENTITY)?.type === 'location')
        .map(id => this.world.get(id, COMPONENT_NAMES.IDENTITY)?.name)
        .filter(Boolean);
    }

    if (def.type === 'entity.item') {
      return this.world.query(COMPONENT_NAMES.IDENTITY)
        .filter(id => this.world.get(id, COMPONENT_NAMES.IDENTITY)?.type === 'item')
        .map(id => this.world.get(id, COMPONENT_NAMES.IDENTITY)?.name)
        .filter(Boolean);
    }

    if (def.type === 'entity.faction') {
      return this.world.query(COMPONENT_NAMES.IDENTITY)
        .filter(id => this.world.get(id, COMPONENT_NAMES.IDENTITY)?.type === 'faction')
        .map(id => this.world.get(id, COMPONENT_NAMES.IDENTITY)?.name)
        .filter(Boolean);
    }

    if (def.type === 'enum') {
      return Array.isArray(def.opts) ? [...def.opts] : [];
    }

    return [];
  }

  // ── Validação cruzada (opcional) ───────────────────────────

  /**
   * Valida um valor contra as regras do def.
   * @param {Object} def
   * @param {string} value
   * @returns {{ ok:boolean, error?:string }}
   */
  validate(def, value) {
    if (!def) return { ok: true };
    const v = String(value ?? '').trim();

    if (def.type === 'entity.character' || def.type === 'entity.location' ||
        def.type === 'entity.item' || def.type === 'entity.faction') {
      if (!v) return { ok: true };
      const found = this.world.query(COMPONENT_NAMES.IDENTITY)
        .find(id => this.world.get(id, COMPONENT_NAMES.IDENTITY)?.name === v);
      if (!found) return { ok: false, error: `entidade não encontrada: ${v}` };
    }

    if (def.type === 'enum' && Array.isArray(def.opts) && def.opts.length) {
      if (!v || def.opts.includes(v)) return { ok: true };
      return { ok: false, error: `valor inválido: ${v}` };
    }

    return { ok: true };
  }
}