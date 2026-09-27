/**
 * @file roll-picker.js
 * @module systems/helpers
 * @description Fonte de strings aleatórias para o RollOverlay.
 * @imports core/constants
 * @importedBy boot.js
 * @level 8
 *
 * Uma "categoria" é uma entidade do tipo `set`. As frases elegíveis são as
 * entidades do tipo `phrase` cujo Links.parent aponta para essa set.
 *
 * Se a set não tiver frases diretas, procura em sets-filhas (recursivo).
 */

import { COMPONENT_NAMES } from '../../core/constants.js';

export class RollPicker {
  /**
   * @param {Object} machine
   */
  constructor(machine) {
    this.machine = machine;
  }

  // ── Sequência padrão ───────────────────────────────────────

  /**
   * Retorna a lista padrão de categorias para o roll.
   * Usa as `set` entities que tenham ao menos uma `phrase` descendente.
   * @returns {string[]}
   */
  defaultSequence() {
    const sets = this._allSets();
    const usable = sets.filter(id => this._phrasesUnder(id).length > 0);
    const chosen = usable.length > 0 ? usable : sets;
    return chosen.map(id => this._shortLabel(id));
  }

  /**
   * Retorna os IDs internos das categorias padrão.
   * @returns {string[]}
   */
  defaultSequenceIds() {
    const sets = this._allSets();
    const usable = sets.filter(id => this._phrasesUnder(id).length > 0);
    return usable.length > 0 ? usable : sets;
  }

  // ── Pick ───────────────────────────────────────────────────

  /**
   * Retorna uma string aleatória para uma categoria.
   * A categoria pode vir como:
   *   - ID interno ('__set_ap_inim')
   *   - shortcode ('SET-API')
   *   - nome humano ('Inimigo')
   *
   * @param {string} category
   * @returns {string}
   */
  pickNext(category) {
    const setId = this._resolveSet(category);
    if (!setId) return `(categoria: ${category})`;

    const phrases = this._phrasesUnder(setId);
    if (phrases.length === 0) return '(sem itens)';

    const pick = phrases[Math.floor(Math.random() * phrases.length)];
    const body = this.machine.world.get(pick, COMPONENT_NAMES.BODY)?.text;
    if (body) return body;

    const ident = this.machine.world.get(pick, COMPONENT_NAMES.IDENTITY);
    return ident?.name ?? pick;
  }

  // ── Listagem ───────────────────────────────────────────────

  /**
   * Lista as frases sob uma categoria, como strings interpoláveis.
   * @param {string} category
   * @returns {string[]}
   */
  listPhrases(category) {
    const setId = this._resolveSet(category);
    if (!setId) return [];
    return this._phrasesUnder(setId).map(id => {
      const body = this.machine.world.get(id, COMPONENT_NAMES.BODY)?.text;
      if (body) return body;
      return this.machine.world.get(id, COMPONENT_NAMES.IDENTITY)?.name ?? id;
    });
  }

  // ── Internos ───────────────────────────────────────────────

  /**
   * Todas as entidades do tipo `set`.
   * @returns {string[]}
   * @private
   */
  _allSets() {
    const out = [];
    for (const id of this.machine.world.allEntities()) {
      const ident = this.machine.world.get(id, COMPONENT_NAMES.IDENTITY);
      if (ident?.type === 'set') out.push(id);
    }
    return out;
  }

  /**
   * Todas as entidades do tipo `phrase`.
   * @returns {string[]}
   * @private
   */
  _allPhrases() {
    const out = [];
    for (const id of this.machine.world.allEntities()) {
      const ident = this.machine.world.get(id, COMPONENT_NAMES.IDENTITY);
      if (ident?.type === 'phrase') out.push(id);
    }
    return out;
  }

  /**
   * Frases que apontam para uma set, diretas ou via sets-filhas (BFS).
   * @param {string} setId
   * @returns {string[]}
   * @private
   */
  _phrasesUnder(setId) {
    const allPhrases = this._allPhrases();
    const direct = allPhrases.filter(p => {
      const links = this.machine.world.get(p, COMPONENT_NAMES.LINKS);
      const parent = links?.parent;
      if (Array.isArray(parent)) return parent.includes(setId);
      return parent === setId;
    });

    if (direct.length > 0) return direct;

    // Tenta sets-filhas
    const childSets = this._childSets(setId);
    const out = [];
    for (const child of childSets) {
      out.push(...this._phrasesUnder(child));
    }
    return out;
  }

  /**
   * Sets-filhas diretas via Links.parent.
   * @param {string} parentId
   * @returns {string[]}
   * @private
   */
  _childSets(parentId) {
    const out = [];
    for (const id of this._allSets()) {
      const links = this.machine.world.get(id, COMPONENT_NAMES.LINKS);
      const parent = links?.parent;
      if (Array.isArray(parent)) {
        if (parent.includes(parentId)) out.push(id);
      } else if (parent === parentId) {
        out.push(id);
      }
    }
    return out;
  }

  /**
   * Resolve uma referência de categoria para o ID interno.
   * @param {string} ref
   * @returns {string|null}
   * @private
   */
  _resolveSet(ref) {
    if (!ref) return null;
    const world = this.machine.world;

    // id interno
    if (world.hasEntity(ref)) {
      const ident = world.get(ref, COMPONENT_NAMES.IDENTITY);
      if (ident?.type === 'set') return ref;
    }

    // shortcode
    for (const id of world.allEntities()) {
      const ident = world.get(id, COMPONENT_NAMES.IDENTITY);
      if (!ident) continue;
      if (ident.type !== 'set') continue;
      if (ident.id === ref) return id;
    }

    // nome humano
    for (const id of world.allEntities()) {
      const ident = world.get(id, COMPONENT_NAMES.IDENTITY);
      if (!ident) continue;
      if (ident.type !== 'set') continue;
      if (ident.name === ref) return id;
    }

    return null;
  }

  /**
   * Rótulo curto para exibição na linha do overlay.
   * @param {string} setId
   * @returns {string}
   * @private
   */
  _shortLabel(setId) {
    const ident = this.machine.world.get(setId, COMPONENT_NAMES.IDENTITY);
    return ident?.name ?? ident?.id ?? setId;
  }
}