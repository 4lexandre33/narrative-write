/**
 * @file bootstrap.js
 * @module schemas
 * @description Orquestra o registro de schemas.
 * @imports schemas/builtin-components, schemas/builtin-commands,
 *          schemas/builtin-snippets
 * @importedBy boot.js, diagnostics/sandbox.js
 * @level 9
 *
 * Fase 13.7 — Limpeza (auditoria 25/09/2026):
 *   Removidas `bootstrapSeeds`, `bootstrapAll`, `reseedWorld` e
 *   `auditSeeds` — nenhuma era importada. `boot.js` chama
 *   `bootstrapRegistries` diretamente e `seedSystem.seed()` para
 *   popular o mundo. `diagnostics/sandbox.js` idem.
 *
 *   O helper privado `_seedCountToType` (usado só por `auditSeeds`)
 *   também foi removido.
 *
 *   Imports de `SeedBuilder`, `getBuiltinSeeds` e `SchemaInspector`
 *   foram removidos porque as funções que os usavam foram removidas.
 */

import { registerBuiltinComponents } from './builtin-components.js';
import { registerBuiltinCommands } from './builtin-commands.js';
import { registerBuiltinSnippets } from './builtin-snippets.js';

/**
 * Registra todos os schemas builtin nos registries apropriados.
 * Idempotente — pode ser chamado uma vez por boot (ou por sandbox).
 *
 * @param {Object} worldRegistry    — ComponentRegistry (N2)
 * @param {Object} machineRegistry  — Registry (N2, catálogo)
 * @returns {{ components:number, snippets:number, commands:number }}
 */
export function bootstrapRegistries(worldRegistry, machineRegistry) {
  if (!worldRegistry || typeof worldRegistry.define !== 'function') {
    throw new Error('[bootstrap] worldRegistry inválido');
  }
  if (!machineRegistry || typeof machineRegistry.defineSnippet !== 'function') {
    throw new Error('[bootstrap] machineRegistry inválido');
  }

  registerBuiltinComponents(worldRegistry);
  registerBuiltinCommands(machineRegistry);
  registerBuiltinSnippets(machineRegistry);

  return {
    components: worldRegistry.size ? worldRegistry.size() : 0,
    snippets: machineRegistry.getSnippets ? machineRegistry.getSnippets().length : 0,
    commands: machineRegistry.getCommands ? machineRegistry.getCommands().length : 0,
  };
}