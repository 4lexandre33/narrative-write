/**
 * @file sandbox.js
 * @module diagnostics
 * @description Fábrica de Machine isolada para testes automáticos.
 * @imports ecs/event-bus, ecs/world, context-machine/machine,
 *          schemas/bootstrap, data/storage,
 *          systems/* (32 sistemas, mesma ordem do boot)
 * @importedBy diagnostics/regression-runner, diagnostics/test-battery
 * @level 9
 *
 * Um sandbox é um `{ machine, world, bus, dispose, stats }` completamente
 * independente do mundo real. Ele:
 *
 *   1. Cria um EventBus novo (ninguém mais escuta)
 *   2. Cria um World novo (registries próprios, vazios)
 *   3. Cria uma Machine nova (link-index + id-registry próprios)
 *   4. Registra os 32 sistemas (mesma ordem do boot.js)
 *   5. Bootstrapa os registries (components + commands + snippets)
 *   6. Anexa um MemoryStorageAdapter (nada toca localStorage/IDB)
 *   7. Opcionalmente, seeda as ~30 entidades builtin
 *   8. Opcionalmente, re-snapshota a timeline em T0
 *
 * Fase 13.7 — Paridade sandbox ↔ boot (auditoria 25/09/2026):
 *   A versão anterior registrava 29 sistemas; o boot registra 32.
 *   Faltavam PhraseSystem, NarrativeSystem e DiagnosticsSystem. Os
 *   cenários das categorias `narrative`, `phrase` e `diagnostics` da
 *   ScenarioLibrary passavam por vacuidade (o pipeline emitia
 *   `pipeline:system-missing` e continuava). Este arquivo agora
 *   registra os 32 sistemas na MESMA ORDEM do boot, tornando o
 *   sandbox fielmente representativo.
 *
 *   Isolamento de DiagnosticsSystem:
 *     O DiagnosticsSystem consulta `window.__NarrativeApp.diag` para
 *     obter a suite ativa. Num sandbox, esse acesso vazaria para a
 *     suite do host e comandos como `diag.mode full` mutariam o modo
 *     da aplicação real. Este arquivo aplica um monkey-patch em
 *     `_getSuite()` para retornar `null` — o sistema reporta
 *     "suite indisponível" sem tocar em estado externo.
 *
 *   Limitação residual — NarrativeSystem:
 *     O NarrativeSystem lê e escreve em localStorage (chaves
 *     `narr:narrative:mode`, `:overrides`, `:user-lexicon`) via
 *     `mode.js`, `overrides.js` e `user-lexicon.js`. Num sandbox,
 *     `narr.preview` / `narr.off` / etc. alteram o modo persistido
 *     da aplicação real. A correção completa requer injeção de
 *     storage no NarrativeSystem — planejada para uma fase posterior.
 *     Por ora, cenários da categoria `narrative` são executados
 *     mas registram esta limitação no relatório final da bateria.
 *
 * Determinismo:
 *   - Sem dependência de estado global (exceto NarrativeSystem, ver acima)
 *   - Sem `Math.random()` (o fuzzer injeta seed por conta própria)
 *   - Sem timers automáticos (health probes NÃO são ativadas)
 *   - Sem persistência real
 *
 * Contrato de retorno (createSandbox):
 *   {
 *     id:      string,        // identificador único do sandbox
 *     machine: Machine,
 *     world:   World,
 *     bus:     EventBus,
 *     adapter: MemoryStorageAdapter,
 *     seed:    number|null,   // valor passado em opts.seed
 *     stats:   () => Object,  // contagens rápidas
 *     dispose: () => void,    // idempotente
 *   }
 *
 * Uso:
 *   const sb = await createSandbox();
 *   try {
 *     sb.machine.handleLine('ent.create.character Kaelin');
 *     console.log(sb.world.allEntities().length);
 *   } finally {
 *     sb.dispose();
 *   }
 */

import { EventBus } from '../ecs/event-bus.js';
import { World } from '../ecs/world.js';
import { Machine } from '../context-machine/machine.js';
import { bootstrapRegistries } from '../schemas/bootstrap.js';
import { StorageAdapter } from '../data/storage.js';

// ── 32 sistemas (mesma ordem do boot.js) ────────────────────
import { ParseSystem } from '../systems/parse-system.js';
import { CommandSystem } from '../systems/command-system.js';
import { EntitySystem } from '../systems/entity-system.js';
import { IdentitySystem } from '../systems/identity-system.js';
import { InstantiationSystem } from '../systems/instantiation-system.js';
import { InheritanceSystem } from '../systems/inheritance-system.js';
import { MutationSystem } from '../systems/mutation-system.js';
import { LinkSystem } from '../systems/link-system.js';
import { LinkQuerySystem } from '../systems/link-query-system.js';
import { QuerySystem } from '../systems/query-system.js';
import { SearchQuerySystem } from '../systems/search-query-system.js';
import { KnowledgeSystem } from '../systems/knowledge-system.js';
import { SearchSystem } from '../systems/search-system.js';
import { SnippetSystem } from '../systems/snippet-system.js';
import { TemplateSystem } from '../systems/template-system.js';
import { RuleSystem } from '../systems/rule-system.js';
import { ManualRuleSystem } from '../systems/manual-rule-system.js';
import { PhraseSystem } from '../systems/phrase-system.js';
import { DiagnosticsSystem } from '../systems/diagnostics-system.js';
import { TimelineSystem } from '../systems/timeline-system.js';
import { StaleSystem } from '../systems/stale-system.js';
import { AuditSystem } from '../systems/audit-system.js';
import { ForkSystem } from '../systems/fork-system.js';
import { DiffSystem } from '../systems/diff-system.js';
import { ValidationSystem } from '../systems/validation-system.js';
import { ExportSystem } from '../systems/export-system.js';
import { HelpSystem } from '../systems/help-system.js';
import { SlashCommandSystem } from '../systems/slash-command-system.js';
import { RenderSystem } from '../systems/render-system.js';
import { NarrativeSystem } from '../systems/narrative-system.js';
import { PersistenceSystem } from '../systems/persistence-system.js';
import { SeedSystem } from '../systems/seed-system.js';

// ══════════════════════════════════════════════════════════════
// Constantes
// ══════════════════════════════════════════════════════════════

/**
 * Número de sistemas esperados num sandbox.
 * Deve bater com o número registrado em `boot.js`.
 * @type {number}
 */
export const EXPECTED_SYSTEM_COUNT = 32;

/**
 * Lista canônica dos 32 sistemas, na ordem de registro.
 * Espelha exatamente `boot.js`. Comparada com o boot real pelo
 * `SystemCanary` (Fase 0) e pela fase `canary` da `TestBattery` (Fase 2).
 * @type {ReadonlyArray<string>}
 */
export const SANDBOX_SYSTEM_NAMES = Object.freeze([
  'ParseSystem',
  'CommandSystem',
  'EntitySystem',
  'IdentitySystem',
  'InstantiationSystem',
  'InheritanceSystem',
  'MutationSystem',
  'LinkSystem',
  'LinkQuerySystem',
  'QuerySystem',
  'SearchQuerySystem',
  'KnowledgeSystem',
  'SearchSystem',
  'SnippetSystem',
  'TemplateSystem',
  'RuleSystem',
  'ManualRuleSystem',
  'PhraseSystem',
  'DiagnosticsSystem',
  'TimelineSystem',
  'StaleSystem',
  'AuditSystem',
  'ForkSystem',
  'DiffSystem',
  'ValidationSystem',
  'ExportSystem',
  'HelpSystem',
  'SlashCommandSystem',
  'RenderSystem',
  'NarrativeSystem',
  'PersistenceSystem',
  'SeedSystem',
]);

/**
 * Referências das 32 classes, na mesma ordem.
 * @type {ReadonlyArray<Function>}
 * @private
 */
const SANDBOX_SYSTEM_CLASSES = Object.freeze([
  ParseSystem,
  CommandSystem,
  EntitySystem,
  IdentitySystem,
  InstantiationSystem,
  InheritanceSystem,
  MutationSystem,
  LinkSystem,
  LinkQuerySystem,
  QuerySystem,
  SearchQuerySystem,
  KnowledgeSystem,
  SearchSystem,
  SnippetSystem,
  TemplateSystem,
  RuleSystem,
  ManualRuleSystem,
  PhraseSystem,
  DiagnosticsSystem,
  TimelineSystem,
  StaleSystem,
  AuditSystem,
  ForkSystem,
  DiffSystem,
  ValidationSystem,
  ExportSystem,
  HelpSystem,
  SlashCommandSystem,
  RenderSystem,
  NarrativeSystem,
  PersistenceSystem,
  SeedSystem,
]);

// ══════════════════════════════════════════════════════════════
// MemoryStorageAdapter
// ══════════════════════════════════════════════════════════════

/**
 * Adapter de storage em memória. Não toca localStorage, IndexedDB,
 * GM_* nem qualquer coisa do host. Cada instância é isolada.
 *
 * Satisfaz o contrato de `StorageAdapter` (data/storage.js).
 */
export class MemoryStorageAdapter extends StorageAdapter {
  /**
   * @param {Map<string,string>} [initial] — estado inicial (opcional)
   */
  constructor(initial = null) {
    super('memory');
    /** @type {Map<string,string>} */
    this._data = new Map(initial || []);
    this._available = true;
  }

  // ── Contrato StorageAdapter ─────────────────────────────────

  async _checkAvailable() {
    return true;
  }

  async get(key) {
    this._assertKey(key);
    const v = this._data.get(key);
    return v === undefined ? null : String(v);
  }

  async set(key, value) {
    this._assertKey(key);
    if (typeof value !== 'string') {
      throw new Error('[MemoryStorage] valor deve ser string');
    }
    this._data.set(key, value);
  }

  async delete(key) {
    this._assertKey(key);
    this._data.delete(key);
  }

  async list() {
    return Array.from(this._data.keys());
  }

  getLimit() {
    return Number.MAX_SAFE_INTEGER;
  }

  async getBytesInUse() {
    let bytes = 0;
    for (const [k, v] of this._data) {
      bytes += k.length + v.length;
    }
    return bytes;
  }

  async clear() {
    this._data.clear();
  }

  // ── Extras ──────────────────────────────────────────────────

  /**
   * Número de chaves armazenadas.
   * @returns {number}
   */
  size() {
    return this._data.size;
  }

  /**
   * Exporta o conteúdo como objeto plano (útil em testes).
   * @returns {Object<string,string>}
   */
  toObject() {
    const out = {};
    for (const [k, v] of this._data) out[k] = v;
    return out;
  }

  // ── Internos ────────────────────────────────────────────────

  _assertKey(key) {
    if (typeof key !== 'string' || !key) {
      throw new Error('[MemoryStorage] chave inválida');
    }
  }
}

// ══════════════════════════════════════════════════════════════
// Factory principal
// ══════════════════════════════════════════════════════════════

let _sandboxCounter = 0;

/**
 * Cria um sandbox isolado.
 *
 * @param {Object} [opts={}]
 * @param {boolean} [opts.seedEntities=true]   — popula ~30 entidades builtin
 * @param {number}  [opts.seed=null]           — valor informativo (fuzzer usa)
 * @param {string}  [opts.initialTick='T0']    — tick inicial
 * @param {boolean} [opts.registerSystems=true]— permite sandbox "vazio" para testes
 * @param {Object}  [opts.storageInitial=null] — Map ou Object para pré-popular storage
 * @returns {Promise<{
 *   id: string,
 *   machine: Object,
 *   world: Object,
 *   bus: Object,
 *   adapter: MemoryStorageAdapter,
 *   seed: number|null,
 *   stats: () => Object,
 *   dispose: () => void,
 * }>}
 */
export async function createSandbox(opts = {}) {
  const {
    seedEntities = true,
    seed = null,
    initialTick = 'T0',
    registerSystems = true,
    storageInitial = null,
  } = opts;

  // ── 1. Infraestrutura base ────────────────────────────────
  const bus = new EventBus();
  const world = new World({ bus });
  const machine = new Machine({ world, bus });

  // ── 2. Tick inicial (antes de registrar TimelineSystem) ──
  if (initialTick && initialTick !== 'T0') {
    machine.state.tick = String(initialTick);
    const n = parseInt(String(initialTick).slice(1), 10);
    machine.state.tickNumber = Number.isFinite(n) ? n : 0;
  }

  // ── 3. Registro dos 32 sistemas ───────────────────────────
  if (registerSystems) {
    for (const Cls of SANDBOX_SYSTEM_CLASSES) {
      try {
        machine.registerSystem(new Cls());
      } catch (err) {
        safeDestroy(machine, world, bus);
        throw new Error(
          `[sandbox] falha ao registrar ${Cls.name}: ${err.message}`
        );
      }
    }
  }

  // ── 3b. Isolamento de DiagnosticsSystem (Fase 13.7) ──────
  // O DiagnosticsSystem consulta `window.__NarrativeApp.diag` para
  // obter a suite ativa. Num sandbox, esse acesso vazaria para a
  // suite do host e comandos como `diag.mode full` mutariam o modo
  // da aplicação real. Sobrescrevemos `_getSuite()` nesta instância
  // para retornar `null` — o sistema reporta "suite indisponível"
  // sem tocar em estado externo.
  //
  // Isto é um monkey-patch deliberado e local (apenas esta instância
  // é afetada; o prototype e as demais instâncias permanecem intactos).
  const diagSystem = machine.systems.get('DiagnosticsSystem');
  if (diagSystem && typeof diagSystem._getSuite === 'function') {
    diagSystem._getSuite = function sandboxSafeGetSuite() {
      return null;
    };
  }

  // ── 4. Registries (components + commands + snippets) ──────
  try {
    bootstrapRegistries(world.registry, machine.registry);
  } catch (err) {
    safeDestroy(machine, world, bus);
    throw new Error(`[sandbox] falha em bootstrapRegistries: ${err.message}`);
  }

  // ── 5. Storage em memória ─────────────────────────────────
  const adapter = new MemoryStorageAdapter(toMap(storageInitial));
  const persist = machine.systems.get('PersistenceSystem');
  if (persist) {
    persist.setAdapter(adapter);
  }

  // ── 6. Seed (opcional) ────────────────────────────────────
  if (seedEntities) {
    try {
      const seedSystem = machine.systems.get('SeedSystem');
      if (seedSystem) seedSystem.seed();

      const timeline = machine.systems.get('TimelineSystem');
      if (timeline) {
        timeline.clear();
        timeline.init();
      }
    } catch (err) {
      safeDestroy(machine, world, bus);
      throw new Error(`[sandbox] falha ao seedar: ${err.message}`);
    }
  }

  // ── 7. Metadados e API de ciclo de vida ───────────────────
  _sandboxCounter++;
  const id = `sb-${Date.now().toString(36)}-${_sandboxCounter}`;
  let disposed = false;

  // Notifica o canário de integridade (Fase 0).
  // O sandbox tem EventBus isolado, então este emit NÃO chega ao bus do
  // boot. A Fase 2 da TestBattery compara `SANDBOX_SYSTEM_NAMES` (estático)
  // com o boot diretamente, sem depender deste emit. Ele permanece como
  // ponto de extensão para consumidores que compartilhem o mesmo bus.
  bus.emit('sandbox:created', { names: SANDBOX_SYSTEM_NAMES.slice() });

  return {
    id,
    machine,
    world,
    bus,
    adapter,
    seed,

    /**
     * Contagens rápidas para debug/assertivas.
     * @returns {Object}
     */
    stats() {
      return {
        id,
        seed,
        initialTick,
        entityCount: world.allEntities().length,
        componentTypes: world.componentNames().length,
        systemCount: machine.systems.size,
        tick: machine.state.tick,
        tickNumber: machine.state.tickNumber,
        timeline: machine.state.timeline,
        storageKeys: adapter.size(),
        busHandlers: bus.size(),
        disposed,
      };
    },

    /**
     * Libera recursos. Idempotente.
     */
    dispose() {
      if (disposed) return;
      disposed = true;
      safeDestroy(machine, world, bus);
      adapter.clear();
    },
  };
}

// ══════════════════════════════════════════════════════════════
// Utilidades públicas
// ══════════════════════════════════════════════════════════════

/**
 * Valida que um objeto parece um sandbox legítimo.
 * @param {any} sb
 * @returns {{ ok:boolean, errors:string[] }}
 */
export function validateSandbox(sb) {
  const errors = [];

  if (!sb || typeof sb !== 'object') {
    return { ok: false, errors: ['sandbox não é objeto'] };
  }
  if (!sb.machine || typeof sb.machine.handleLine !== 'function') {
    errors.push('machine ausente ou inválido');
  }
  if (!sb.world || typeof sb.world.allEntities !== 'function') {
    errors.push('world ausente ou inválido');
  }
  if (!sb.bus || typeof sb.bus.emit !== 'function') {
    errors.push('bus ausente ou inválido');
  }
  if (!sb.adapter || typeof sb.adapter.get !== 'function') {
    errors.push('adapter ausente ou inválido');
  }
  if (typeof sb.dispose !== 'function') {
    errors.push('dispose ausente');
  }
  if (sb.machine && sb.machine.systems && sb.machine.systems.size !== EXPECTED_SYSTEM_COUNT) {
    errors.push(
      `systemCount esperado ${EXPECTED_SYSTEM_COUNT}, recebido ${sb.machine.systems.size}`
    );
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Roda uma função contra um sandbox temporário e sempre descarta.
 * Açúcar sintático para testes rápidos.
 *
 * @template T
 * @param {(sandbox: Object) => T|Promise<T>} fn
 * @param {Object} [opts]
 * @returns {Promise<T>}
 */
export async function withSandbox(fn, opts = {}) {
  const sb = await createSandbox(opts);
  try {
    return await fn(sb);
  } finally {
    sb.dispose();
  }
}

// ══════════════════════════════════════════════════════════════
// Internos
// ══════════════════════════════════════════════════════════════

/**
 * Destrói machine/world/bus sem lançar.
 * @private
 */
function safeDestroy(machine, world, bus) {
  try { if (machine) machine.destroy(); } catch { /* isola */ }
  try { if (world && !world.destroyed) world.destroy(); } catch { /* isola */ }
  try { if (bus) bus.destroy(); } catch { /* isola */ }
}

/**
 * Normaliza `storageInitial` (Object | Map | null) para `Map|null`.
 * @private
 */
function toMap(v) {
  if (!v) return null;
  if (v instanceof Map) return new Map(v);
  if (typeof v === 'object') return new Map(Object.entries(v));
  return null;
}