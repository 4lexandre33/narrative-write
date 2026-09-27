/**
 * @file instantiation-system.js
 * @module systems
 * @description Handles inst.mark/unmark/create/destroy/list/sync.
 * @imports ecs/system, components/*, core/constants
 * @level 7
 *
 * Fase 13.7 — Bugfix P0-1 (auditoria 25/09/2026):
 *   `_create` criava a entidade com `createEntity({})` e adicionava o
 *   componente Identity DEPOIS. Como `World.createEntity` emite
 *   `entity:created` no FINAL do método, o `Machine._wireLifecycle`
 *   verificava se a entidade tinha Identity e não encontrava —
 *   portanto o shortcode NUNCA era registrado no `IdRegistry`.
 *
 *   Consequências:
 *     - `IdRegistry.byShortcode` não continha instâncias.
 *     - `ShortcodeId.generate()` podia colidir (`CHR-GOB-1` duas vezes).
 *     - `aud.identities` operava sobre um índice dessincronizado.
 *
 *   Correção: montar o mapa completo de componentes ANTES de chamar
 *   `world.createEntity(components)`. Assim, quando `entity:created`
 *   dispara, a Identity já está presente e o Machine registra o
 *   shortcode normalmente.
 */

import { System } from '../ecs/system.js';
import { COMPONENT_NAMES, NEVER_COPY } from '../core/constants.js';
import {
  makeIsBlueprint, makeInstanceOf, makeInstanceCounter,
  makeInstanceConfig, defaultInstanceConfig, formatInstanceName,
} from '../components/instantiation.js';
import { makeIdentity } from '../components/identity.js';
import { makeMeta } from '../components/meta.js';

export class InstantiationSystem extends System {
  constructor() { super('InstantiationSystem'); }

  run(_line, ctx, prev) {
    const ast = prev.ast;
    if (!ast || ast.verb !== 'inst') return prev;
    // Só trata mark/unmark/create/destroy/list/sync; chain/resolve/etc vão para InheritanceSystem
    if (!['mark', 'unmark', 'create', 'destroy', 'list', 'sync'].includes(ast.action)) return prev;

    try {
      switch (ast.action) {
        case 'mark':    return this._mark(prev, ast);
        case 'unmark':  return this._unmark(prev, ast);
        case 'create':  return this._create(prev, ast, ctx);
        case 'destroy': return this._destroy(prev, ast);
        case 'list':    return this._list(prev, ast);
        case 'sync':    return this._sync(prev, ast, ctx);
        default:        return prev;
      }
    } catch (err) {
      return { ...prev, ok: false, halt: true, error: err.message };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // MARK / UNMARK
  // ═══════════════════════════════════════════════════════════

  _mark(prev, ast) {
    const target = this.resolve(ast.target);
    if (!target) {
      return { ...prev, ok: false, halt: true, error: `entidade não encontrada: ${ast.target}` };
    }

    if (!this.world.has(target, COMPONENT_NAMES.IS_BLUEPRINT)) {
      this.world.addComponent(target, COMPONENT_NAMES.IS_BLUEPRINT, makeIsBlueprint(true));
    }
    if (!this.world.has(target, COMPONENT_NAMES.INSTANCE_COUNTER)) {
      this.world.addComponent(target, COMPONENT_NAMES.INSTANCE_COUNTER, makeInstanceCounter(0));
    }
    if (!this.world.has(target, COMPONENT_NAMES.INSTANCE_CONFIG)) {
      this.world.addComponent(target, COMPONENT_NAMES.INSTANCE_CONFIG, defaultInstanceConfig());
    }
    return { ...prev, ok: true, mutated: true, blueprintMarked: target };
  }

  _unmark(prev, ast) {
    const target = this.resolve(ast.target);
    if (!target) {
      return { ...prev, ok: false, halt: true, error: `entidade não encontrada: ${ast.target}` };
    }
    this.world.removeComponent(target, COMPONENT_NAMES.IS_BLUEPRINT);
    return { ...prev, ok: true, mutated: true, blueprintUnmarked: target };
  }

  // ═══════════════════════════════════════════════════════════
  // CREATE — Fase 13.7 (P0-1)
  // ═══════════════════════════════════════════════════════════

  /**
   * Cria uma instância a partir de um blueprint.
   *
   * Fase 13.7 — monta todos os componentes ANTES de chamar
   * `world.createEntity`, garantindo que `entity:created` dispare
   * com Identity presente (registro correto no IdRegistry).
   *
   * @private
   */
  _create(prev, ast, ctx) {
    const bp = this.resolve(ast.blueprint);
    if (!bp) {
      return { ...prev, ok: false, halt: true, error: `blueprint não encontrado: ${ast.blueprint}` };
    }
    if (!this.world.has(bp, COMPONENT_NAMES.IS_BLUEPRINT)) {
      return { ...prev, ok: false, halt: true, error: `não é blueprint: ${ast.blueprint}` };
    }

    const bpIdentity = this.world.get(bp, COMPONENT_NAMES.IDENTITY);
    if (!bpIdentity) {
      return { ...prev, ok: false, halt: true, error: `blueprint sem Identity: ${ast.blueprint}` };
    }

    const cfg = this.world.get(bp, COMPONENT_NAMES.INSTANCE_CONFIG) || defaultInstanceConfig();
    const counter = this.world.get(bp, COMPONENT_NAMES.INSTANCE_COUNTER) || { value: cfg.startAt - 1 };
    const nextNumber = counter.value + 1;

    const instanceName = ast.name || formatInstanceName(
      cfg.namePattern, bpIdentity.name, nextNumber, cfg.pad
    );
    const instanceId = formatInstanceName(
      cfg.idPattern, bpIdentity.id, nextNumber, cfg.pad
    );

    // Avança o contador ANTES de criar a entidade. Se algo lançar no
    // meio, o contador não fica dessincronizado do número de instâncias
    // já criadas (não há instância sem contador, nem contador sem instância
    // — o `createEntity` é atômico para os nossos propósitos).
    if (this.world.has(bp, COMPONENT_NAMES.INSTANCE_COUNTER)) {
      this.world.set(bp, COMPONENT_NAMES.INSTANCE_COUNTER, { value: nextNumber });
    } else {
      this.world.addComponent(bp, COMPONENT_NAMES.INSTANCE_COUNTER, { value: nextNumber });
    }

    // ── Monta mapa completo de componentes ─────────────────
    const components = this._buildInstanceComponents(
      bp,
      instanceId,
      instanceName,
      bpIdentity,
      ctx
    );

    // Aplica overrides dos opts (podem sobrescrever componentes copiados)
    this._applyOverridesToComponents(components, ast.opts);

    // ── Cria com tudo pronto ───────────────────────────────
    // O `entity:created` que dispara no final de createEntity
    // já verá a Identity, e o Machine registrará o shortcode.
    const newId = this.world.createEntity(components);

    return {
      ...prev,
      ok: true,
      mutated: true,
      instance: {
        id: newId,
        shortId: instanceId,
        name: instanceName,
        number: nextNumber,
        blueprint: bp,
      },
    };
  }

  /**
   * Monta o mapa de componentes para a nova instância.
   *
   * Cópia tudo do blueprint exceto NEVER_COPY. Adiciona Identity,
   * Meta e InstanceOf próprios. Não toca o World.
   *
   * @param {string} bp                 — id interno do blueprint
   * @param {string} instanceId         — shortcode da instância
   * @param {string} instanceName       — nome humano da instância
   * @param {Object} bpIdentity         — Identity do blueprint (para herdar description/type)
   * @param {Object} ctx                — contexto (com tick)
   * @returns {Object}
   * @private
   */
  _buildInstanceComponents(bp, instanceId, instanceName, bpIdentity, ctx) {
    const components = {
      [COMPONENT_NAMES.IDENTITY]: makeIdentity({
        id: instanceId,
        name: instanceName,
        description: bpIdentity.description,
        type: bpIdentity.type,
      }),
      [COMPONENT_NAMES.META]: makeMeta({ builtin: false, tick: ctx.tick }),
      [COMPONENT_NAMES.INSTANCE_OF]: makeInstanceOf(bp),
    };

    for (const compName of this.world.entities.get(bp)) {
      if (NEVER_COPY.has(compName)) continue;
      if (compName === COMPONENT_NAMES.IDENTITY) continue;
      if (compName === COMPONENT_NAMES.META) continue;
      const data = this.world.get(bp, compName);
      components[compName] = JSON.parse(JSON.stringify(data));
    }

    return components;
  }

  /**
   * Aplica overrides dos opts DIRETO no mapa de componentes,
   * antes de a entidade ser criada.
   *
   * Formato aceito: `compShort.field=valor` onde `compShort` é
   * um dos aliases (`stats`, `flags`, `enums`, `texts`, `lists`, `tags`).
   *
   * @param {Object} components — mapa mutado in-place
   * @param {Object|null|undefined} opts
   * @private
   */
  _applyOverridesToComponents(components, opts) {
    if (!opts) return;
    for (const [key, value] of Object.entries(opts)) {
      const dot = key.indexOf('.');
      if (dot <= 0) continue;
      const compShort = key.slice(0, dot);
      const field = key.slice(dot + 1);
      const compName = this._compName(compShort);
      if (!compName) continue;

      const current = components[compName];
      components[compName] = current
        ? { ...current, [field]: value }
        : { [field]: value };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // DESTROY / LIST / SYNC
  // ═══════════════════════════════════════════════════════════

  _destroy(prev, ast) {
    const target = this.resolve(ast.target);
    if (!target) {
      return { ...prev, ok: false, halt: true, error: `instância não encontrada: ${ast.target}` };
    }
    if (!this.world.has(target, COMPONENT_NAMES.INSTANCE_OF)) {
      return { ...prev, ok: false, halt: true, error: `não é instância: ${ast.target}` };
    }
    this.world.destroyEntity(target);
    return { ...prev, ok: true, mutated: true, destroyed: target };
  }

  _list(prev, ast) {
    const target = ast.target ? this.resolve(ast.target) : null;
    if (target) {
      const instances = this.world.allEntities()
        .filter(id => this.world.get(id, COMPONENT_NAMES.INSTANCE_OF)?.id === target);
      return {
        ...prev,
        ok: true,
        right: {
          kind: 'table',
          title: `Instâncias de ${this.world.get(target, COMPONENT_NAMES.IDENTITY)?.name || target}`,
          data: instances.map(id => this.world.get(id, COMPONENT_NAMES.IDENTITY)),
        },
      };
    }
    const blueprints = this.world.query(COMPONENT_NAMES.IS_BLUEPRINT)
      .map(id => this.world.get(id, COMPONENT_NAMES.IDENTITY));
    return {
      ...prev,
      ok: true,
      right: { kind: 'table', title: 'Blueprints', data: blueprints },
    };
  }

  _sync(prev, ast, ctx) {
    const bp = this.resolve(ast.blueprint);
    if (!bp) {
      return { ...prev, ok: false, halt: true, error: `blueprint não encontrado: ${ast.blueprint}` };
    }

    const instances = this.world.allEntities()
      .filter(id => this.world.get(id, COMPONENT_NAMES.INSTANCE_OF)?.id === bp);

    let updated = 0;
    for (const instId of instances) {
      for (const compName of this.world.entities.get(bp)) {
        if (NEVER_COPY.has(compName)) continue;
        if (compName === COMPONENT_NAMES.IDENTITY) continue;
        if (compName === COMPONENT_NAMES.META) continue;
        const data = JSON.parse(JSON.stringify(this.world.get(bp, compName)));
        if (this.world.has(instId, compName)) this.world.set(instId, compName, data);
        else this.world.addComponent(instId, compName, data);
      }
      this.world.removeComponent(instId, COMPONENT_NAMES.STALE);
      updated++;
    }
    return { ...prev, ok: true, mutated: updated > 0, synced: { blueprint: bp, count: updated } };
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  /**
   * Mapeia aliases de opts para nome canônico de componente.
   * @param {string} short
   * @returns {string|null}
   * @private
   */
  _compName(short) {
    const map = {
      stats: 'Stats',
      flags: 'Flags',
      enums: 'Enums',
      texts: 'Texts',
      lists: 'Lists',
      tags: 'Tags',
    };
    return map[short] ?? null;
  }
}