/**
 * @file guard-evaluator.js
 * @module systems/helpers
 * @description Avalia o IF de uma regra contra um evento. Retorna os alvos que casam.
 * @imports core/constants, systems/helpers/expression-evaluator
 * @importedBy systems/rule-system
 * @level 8
 */

import { COMPONENT_NAMES } from '../../core/constants.js';
import { ExpressionEvaluator } from './expression-evaluator.js';

export class GuardEvaluator {
  /**
   * @param {Object} world
   * @param {Object} links — LinkIndex
   */
  constructor(world, links) {
    this.world = world;
    this.links = links;
    this.expr = new ExpressionEvaluator(world);
  }

  /**
   * Avalia a condição e retorna a lista de entidades alvo.
   *
   * Regras de coleta:
   *   - Se `item.payload.id` existe, esse é o ÚNICO candidato.
   *   - Caso contrário, todas as entidades do mundo são candidatas.
   *
   * O contexto passado ao avaliador inclui, por candidato:
   *   { evt, payload, new, newEntity, entity, this, target }
   *
   * @param {string} ifExpr
   * @param {Object} item — { evt, payload, depth }
   * @param {Object} [ruleMeta={}]
   * @returns {string[]} entityIds que satisfazem o IF
   */
  evaluate(ifExpr, item, ruleMeta = {}) {
    const candidates = this._collectCandidates(item);
    if (candidates.length === 0) return [];

    const ctxBase = this._buildContext(item);
    const matches = [];

    for (const id of candidates) {
      const ctx = {
        ...ctxBase,
        entity: id,
        this: id,
        target: id,
      };
      try {
        if (this.expr.evaluate(ifExpr || 'true', ctx)) {
          matches.push(id);
        }
      } catch {
        // expressão malformada — ignora este candidato
      }
    }
    return matches;
  }

  // ── Coleta de candidatos ────────────────────────────────────

  /**
   * @private
   */
  _collectCandidates(item) {
    // Evento atômico (component:*, entity:*, link:*) → só o id do payload
    if (item.payload?.id && this.world.hasEntity(item.payload.id)) {
      return [item.payload.id];
    }

    // Sem payload.id → todas as entidades
    return this.world.allEntities();
  }

  // ── Contexto base ───────────────────────────────────────────

  /**
   * @private
   */
  _buildContext(item) {
    const ctx = {
      evt: item.evt,
      payload: item.payload ?? null,
    };

    // Aliases comuns para a entidade recém-criada
    if (item.evt === 'entity:created') {
      const newId = item.payload?.id ?? null;
      ctx.new = newId;
      ctx.newEntity = newId;
    }

    return ctx;
  }

  // ── Diagnóstico ─────────────────────────────────────────────

  /**
   * Verifica se um IF é sintaticamente válido.
   * @param {string} ifExpr
   * @returns {{ ok:boolean, error?:string }}
   */
  validate(ifExpr) {
    try {
      this.expr.evaluate(ifExpr || 'true', {});
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Coleta referências a entidades citadas numa expressão.
   * @param {string} ifExpr
   * @returns {string[]}
   */
  extractRefs(ifExpr) {
    const text = String(ifExpr || '');
    const tokens = text.split(/[\s=!<>~()]+/).filter(Boolean);
    const refs = new Set();
    for (const t of tokens) {
      if (/^\d+$/.test(t)) continue;
      if (['true', 'false', 'null', 'AND', 'OR', 'NOT'].includes(t)) continue;
      if (['contains', 'in'].includes(t)) continue;
      const dot = t.indexOf('.');
      const candidate = dot > 0 ? t.slice(0, dot) : t;
      if (/^[A-Za-z_][\w-]*$/.test(candidate)) {
        refs.add(candidate);
      }
    }
    return Array.from(refs);
  }

  /**
   * Retorna o tipo declarado de uma entidade (helper para debug).
   * @param {string} id
   * @returns {string|null}
   */
  entityType(id) {
    if (!id) return null;
    return this.world.get(id, COMPONENT_NAMES.IDENTITY)?.type ?? null;
  }
}