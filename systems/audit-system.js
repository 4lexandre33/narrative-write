/**
 * @file audit-system.js
 * @module systems
 * @description Handles aud.* — links, identities, instances, continuity,
 *              references, rules, snippets.
 * @imports ecs/system, core/constants, core/utils/time
 * @level 7
 *
 * Fase 13.7 — Stubs → Funcionalidades (auditoria 25/09/2026):
 *   `_continuity`, `_references` e `_snippets` eram stubs que retornavam
 *   `{ alerts: [] }`. Comandos `aud.continuity`, `aud.references` e
 *   `aud.snippets` existiam no parser e apareciam no autocomplete, mas
 *   nunca detectavam nada.
 *
 *   Implementação:
 *     - `_continuity`: regras com `ON:` que não resolvem para evento,
 *       tipo ou entidade; entidades `Stale` há muito tempo.
 *     - `_references`: `InstanceOf.id`, `DerivesFrom.ids` e `Links.parent`
 *       apontando para entidades inexistentes, ou com autorreferência.
 *     - `_snippets`: templates com placeholders sem Def, snippets do
 *       tipo `command` sem `runs`, snippets do tipo `menu` sem `options`.
 */

import { System } from '../ecs/system.js';
import { COMPONENT_NAMES, ENTITY_TYPES } from '../core/constants.js';
import { tickToNumber } from '../core/utils/time.js';

/**
 * Limite (em ticks) a partir do qual uma entidade Stale é considerada
 * antiga o suficiente para gerar alerta de continuidade.
 * @type {number}
 */
const _STALE_AGE_THRESHOLD = 100;

export class AuditSystem extends System {
  constructor() { super('AuditSystem'); }

  run(_line, _ctx, prev) {
    const ast = prev.ast;
    if (!ast || ast.verb !== 'aud') return prev;

    switch (ast.action) {
      case 'links':      return this._links(prev);
      case 'identities': return this._identities(prev);
      case 'instances':  return this._instances(prev);
      case 'continuity': return this._continuity(prev);
      case 'references': return this._references(prev);
      case 'rules':      return this._rules(prev);
      case 'snippets':   return this._snippets(prev);
      default:           return prev;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // aud.links
  // ═══════════════════════════════════════════════════════════

  _links(prev) {
    const alerts = [];
    const ids = new Set(this.world.allEntities());

    for (const id of this.world.allEntities()) {
      const links = this.world.get(id, COMPONENT_NAMES.LINKS);
      if (!links) continue;
      for (const [rel, value] of Object.entries(links)) {
        const targets = Array.isArray(value) ? value : [value];
        for (const to of targets) {
          if (typeof to === 'string' && to && !ids.has(to)) {
            alerts.push({ level: 'error', code: 'LINK_DANGLING', from: id, rel, to });
          }
        }
      }
    }

    return { ...prev, ok: true, right: { kind: 'alerts', title: `Auditoria de Links (${alerts.length})`, data: { alerts, summary: { total: alerts.length } }, sticky: true } };
  }

  // ═══════════════════════════════════════════════════════════
  // aud.identities
  // ═══════════════════════════════════════════════════════════

  _identities(prev) {
    const byId = new Map();
    for (const id of this.world.allEntities()) {
      const ident = this.world.get(id, COMPONENT_NAMES.IDENTITY);
      if (!ident?.id) continue;
      if (!byId.has(ident.id)) byId.set(ident.id, []);
      byId.get(ident.id).push(id);
    }
    const duplicates = [];
    for (const [shortId, ids] of byId) {
      if (ids.length > 1) duplicates.push({ level: 'error', code: 'IDENTITY_DUPLICATE', shortId, ids });
    }
    return { ...prev, ok: true, right: { kind: 'alerts', title: `Identidades (${duplicates.length})`, data: { alerts: duplicates }, sticky: true } };
  }

  // ═══════════════════════════════════════════════════════════
  // aud.instances
  // ═══════════════════════════════════════════════════════════

  _instances(prev) {
    const alerts = [];
    const ids = new Set(this.world.allEntities());

    for (const id of this.world.allEntities()) {
      const instOf = this.world.get(id, COMPONENT_NAMES.INSTANCE_OF);
      if (instOf && !ids.has(instOf.id)) {
        alerts.push({ level: 'error', code: 'INSTANCE_ORPHAN', instance: id, blueprint: instOf.id });
      }
      if (this.world.has(id, COMPONENT_NAMES.STALE)) {
        const s = this.world.get(id, COMPONENT_NAMES.STALE);
        alerts.push({ level: 'info', code: 'INSTANCE_STALE', instance: id, since: s.at });
      }
    }
    return { ...prev, ok: true, right: { kind: 'alerts', title: `Instâncias (${alerts.length})`, data: { alerts }, sticky: true } };
  }

  // ═══════════════════════════════════════════════════════════
  // aud.continuity — Fase 13.7
  // ═══════════════════════════════════════════════════════════

  /**
   * Verifica continuidade narrativa:
   *   1. Regras com `ON:` que não casam com evento do bus, tipo de
   *      entidade conhecido, nem id/shortcode/nome de entidade existente.
   *   2. Entidades marcadas `Stale` há mais de `_STALE_AGE_THRESHOLD`
   *      ticks (indica herança quebrada sem resync).
   *
   * @param {Object} prev
   * @returns {Object}
   * @private
   */
  _continuity(prev) {
    const alerts = [];
    const world = this.world;

    // Índice de referências resolvíveis
    const knownRefs = new Set();
    const knownTypes = new Set(ENTITY_TYPES);

    for (const id of world.allEntities()) {
      knownRefs.add(id);
      const ident = world.get(id, COMPONENT_NAMES.IDENTITY);
      if (ident?.id) knownRefs.add(ident.id);
      if (ident?.name) knownRefs.add(ident.name);
    }

    // 1. Regras com ON: não resolvível
    for (const ruleId of world.query(COMPONENT_NAMES.RULE)) {
      const rule = world.get(ruleId, COMPONENT_NAMES.RULE);
      const ident = world.get(ruleId, COMPONENT_NAMES.IDENTITY);
      if (!rule) continue;

      const on = String(rule.on || '').trim();
      if (!on) continue;

      const isEvent = on.includes(':');
      const isType = knownTypes.has(on);
      const isRef = knownRefs.has(on);

      if (!isEvent && !isType && !isRef) {
        alerts.push({
          level: 'warning',
          code: 'RULE_ON_UNKNOWN',
          rule: ident?.name ?? ruleId,
          on,
          message: `ON: "${on}" não é evento, tipo nem entidade existente`,
        });
      }
    }

    // 2. Entidades Stale antigas
    const currentTick = tickToNumber(this.getTick());
    for (const id of world.allEntities()) {
      const stale = world.get(id, COMPONENT_NAMES.STALE);
      if (!stale) continue;
      const staleTick = tickToNumber(stale.at);
      const age = currentTick - staleTick;
      if (age > _STALE_AGE_THRESHOLD) {
        const ident = world.get(id, COMPONENT_NAMES.IDENTITY);
        alerts.push({
          level: 'info',
          code: 'STALE_OLD',
          entity: ident?.name ?? id,
          since: stale.at,
          age,
          message: `entidade está stale há ${age} ticks`,
        });
      }
    }

    return {
      ...prev,
      ok: true,
      right: {
        kind: 'alerts',
        title: `Continuidade (${alerts.length})`,
        data: { alerts },
        sticky: true,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // aud.references — Fase 13.7
  // ═══════════════════════════════════════════════════════════

  /**
   * Verifica referências estruturais:
   *   - `InstanceOf.id` → entidade existente
   *   - `DerivesFrom.ids` → entidades existentes, sem autorreferência
   *   - `Links.parent` → entidade existente, sem autorreferência
   *
   * Complementa `_links` (que verifica todos os `Links.*`) e `_instances`
   * (que verifica órfãos + stale), com foco em grafos de herança e
   * hierarquia narrativa.
   *
   * @param {Object} prev
   * @returns {Object}
   * @private
   */
  _references(prev) {
    const alerts = [];
    const world = this.world;
    const ids = new Set(world.allEntities());

    for (const id of world.allEntities()) {
      const ident = world.get(id, COMPONENT_NAMES.IDENTITY);
      const name = ident?.name ?? id;

      // InstanceOf
      const instOf = world.get(id, COMPONENT_NAMES.INSTANCE_OF);
      if (instOf?.id && !ids.has(instOf.id)) {
        alerts.push({
          level: 'error',
          code: 'INSTANCE_REF_MISSING',
          entity: name,
          target: instOf.id,
          message: `InstanceOf aponta para "${instOf.id}" inexistente`,
        });
      }

      // DerivesFrom
      const derives = world.get(id, COMPONENT_NAMES.DERIVES_FROM)?.ids ?? [];
      for (const d of derives) {
        if (d === id) {
          alerts.push({
            level: 'error',
            code: 'DERIVES_SELF_REF',
            entity: name,
            message: `DerivesFrom inclui a própria entidade`,
          });
          continue;
        }
        if (!ids.has(d)) {
          alerts.push({
            level: 'error',
            code: 'DERIVES_REF_MISSING',
            entity: name,
            target: d,
            message: `DerivesFrom aponta para "${d}" inexistente`,
          });
        }
      }

      // Links.parent
      const links = world.get(id, COMPONENT_NAMES.LINKS);
      const parent = links?.parent;
      if (parent) {
        if (parent === id) {
          alerts.push({
            level: 'error',
            code: 'PARENT_SELF_REF',
            entity: name,
            message: `Links.parent aponta para si mesma`,
          });
        } else if (!ids.has(parent)) {
          alerts.push({
            level: 'error',
            code: 'PARENT_REF_MISSING',
            entity: name,
            target: parent,
            message: `Links.parent aponta para "${parent}" inexistente`,
          });
        }
      }
    }

    return {
      ...prev,
      ok: true,
      right: {
        kind: 'alerts',
        title: `Referências (${alerts.length})`,
        data: { alerts },
        sticky: true,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // aud.rules
  // ═══════════════════════════════════════════════════════════

  _rules(prev) {
    const never = [];
    for (const id of this.world.query(COMPONENT_NAMES.RULE)) {
      const meta = this.world.get(id, COMPONENT_NAMES.RULE_META);
      if ((meta?.firedCount ?? 0) === 0) {
        never.push({ level: 'info', code: 'RULE_NEVER_FIRED', rule: this.world.get(id, COMPONENT_NAMES.IDENTITY)?.name });
      }
    }
    return { ...prev, ok: true, right: { kind: 'alerts', title: 'Regras', data: { alerts: never }, sticky: true } };
  }

  // ═══════════════════════════════════════════════════════════
  // aud.snippets — Fase 13.7
  // ═══════════════════════════════════════════════════════════

  /**
   * Verifica coerência interna de snippets:
   *   - `template`: placeholders `{x}` no body sem def correspondente
   *   - `command`: sem `runs` (macros vazias)
   *   - `menu`: sem `options` (menus vazios)
   *   - `text`: sem `body`
   *
   * @param {Object} prev
   * @returns {Object}
   * @private
   */
  _snippets(prev) {
    const alerts = [];
    const world = this.world;

    for (const id of world.query(COMPONENT_NAMES.TRIGGER)) {
      const ident = world.get(id, COMPONENT_NAMES.IDENTITY);
      const trigger = world.get(id, COMPONENT_NAMES.TRIGGER)?.value ?? '';
      const type = world.get(id, COMPONENT_NAMES.SNIPPET_TYPE)?.value;
      const body = world.get(id, COMPONENT_NAMES.BODY)?.text ?? '';
      const defs = world.get(id, COMPONENT_NAMES.PLACEHOLDER_DEFS)?.defs ?? [];
      const runs = world.get(id, COMPONENT_NAMES.RUNS)?.cmds ?? [];
      const menuOpts = world.get(id, COMPONENT_NAMES.MENU_OPTS)?.options ?? [];
      const name = ident?.name ?? trigger ?? id;

      if (type === 'template') {
        const found = _extractPlaceholders(body);
        const defined = new Set(defs.map((d) => d.name));
        const missing = found.filter((p) => !defined.has(p));
        if (missing.length > 0) {
          alerts.push({
            level: 'warning',
            code: 'SNIPPET_PLACEHOLDER_MISSING',
            snippet: name,
            trigger,
            missing,
            message: `placeholders sem def: ${missing.join(', ')}`,
          });
        }
      } else if (type === 'command') {
        if (!Array.isArray(runs) || runs.length === 0) {
          alerts.push({
            level: 'warning',
            code: 'SNIPPET_CMD_EMPTY',
            snippet: name,
            trigger,
            message: 'snippet do tipo command sem runs',
          });
        }
      } else if (type === 'menu') {
        if (!Array.isArray(menuOpts) || menuOpts.length === 0) {
          alerts.push({
            level: 'warning',
            code: 'SNIPPET_MENU_EMPTY',
            snippet: name,
            trigger,
            message: 'snippet do tipo menu sem options',
          });
        }
      } else if (type === 'text') {
        if (!body || body.trim() === '') {
          alerts.push({
            level: 'info',
            code: 'SNIPPET_TEXT_EMPTY',
            snippet: name,
            trigger,
            message: 'snippet de texto vazio',
          });
        }
      }
    }

    return {
      ...prev,
      ok: true,
      right: {
        kind: 'alerts',
        title: `Snippets (${alerts.length})`,
        data: { alerts },
        sticky: true,
      },
    };
  }
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * Extrai nomes únicos de placeholders `{x}` de um body.
 * @param {string} body
 * @returns {string[]}
 * @private
 */
function _extractPlaceholders(body) {
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