/**
 * @file smoke-tests.js
 * @module diagnostics
 * @description Testes de fumaça — rodam no boot, antes da UI montar.
 * @imports — (nenhum)
 * @importedBy diagnostics/index (Fase 4+), boot.js
 * @level 9
 *
 * Testes:
 *   1. World inicializado
 *   2. Machine tem sistemas registrados
 *   3. Bus tem wildcard funcional
 *   4. Criar entidade funciona
 *   5. Identity materializada corretamente
 *   6. Mutação de Stats funciona
 *   7. Criação de Link funciona
 *   8. Query retorna resultado consistente
 *   9. Timeline tem snapshot T0
 *  10. Storage adapter disponível
 *
 * Uso:
 *   const report = await SmokeTests.run({ machine, world, bus, persist });
 *   if (!report.ok && abortOnFail) throw new Error(report.summary);
 */

export class SmokeTests {
  /**
   * Executa todos os testes.
   * @param {Object} deps
   * @param {Object} deps.machine
   * @param {Object} deps.world
   * @param {Object} deps.bus
   * @param {Object} [deps.persist]
   * @returns {Promise<Object>}
   */
  static async run({ machine, world, bus, persist = null } = {}) {
    const results = [];

    const test = (name, fn) => {
      const start = Date.now();
      try {
        const r = fn();
        if (r && typeof r.then === 'function') {
          return r.then(
            () => results.push({ name, ok: true, ms: Date.now() - start }),
            (err) => results.push({ name, ok: false, ms: Date.now() - start, error: err.message })
          );
        }
        results.push({ name, ok: true, ms: Date.now() - start });
      } catch (err) {
        results.push({ name, ok: false, ms: Date.now() - start, error: err.message });
      }
    };

    // 1
    test('world-initialized', () => {
      if (!world) throw new Error('world ausente');
      if (typeof world.allEntities !== 'function') throw new Error('world.allEntities ausente');
      if (typeof world.createEntity !== 'function') throw new Error('world.createEntity ausente');
    });

    // 2
    test('machine-has-systems', () => {
      if (!machine) throw new Error('machine ausente');
      if (!machine.systems || machine.systems.size === 0) {
        throw new Error(`systems.size = ${machine.systems?.size ?? 0}`);
      }
      if (!machine.systems.has('ParseSystem')) throw new Error('ParseSystem ausente');
      if (!machine.systems.has('MutationSystem')) throw new Error('MutationSystem ausente');
    });

    // 3
    test('bus-wildcard-works', () => {
      if (!bus) throw new Error('bus ausente');
      let called = false;
      const unsub = bus.on('*', () => { called = true; });
      bus.emit('smoke:test:wildcard', { x: 1 });
      unsub();
      if (!called) throw new Error('wildcard não disparou');
    });

    // 4
    let createdId = null;
    test('entity-created', () => {
      createdId = world.createEntity({
        Identity: { id: 'SMK-001', name: 'Smoke', type: 'custom' },
        Meta: { createdAt: 'T0', updatedAt: 'T0', builtin: false, dirty: false },
      }, { id: '__smoke_test_entity__' });
      if (!createdId) throw new Error('id vazio');
      if (!world.hasEntity(createdId)) throw new Error('entidade não existe após create');
    });

    // 5
    test('identity-materialized', () => {
      if (!createdId) throw new Error('entidade smoke não criada');
      const ident = world.get(createdId, 'Identity');
      if (!ident) throw new Error('Identity ausente');
      if (ident.name !== 'Smoke') throw new Error(`name = ${ident.name}`);
      if (ident.type !== 'custom') throw new Error(`type = ${ident.type}`);
    });

    // 6
    test('stats-mutation-works', () => {
      if (!createdId) throw new Error('entidade smoke não criada');
      const res = machine.handleLine(`mut.set.stats ${createdId}.value 42`);
      if (res.ok === false) throw new Error(res.error ?? 'mut falhou');
      const stats = world.get(createdId, 'Stats');
      if (!stats) throw new Error('Stats ausente após mutação');
      if (stats.value !== 42) throw new Error(`stats.value = ${stats.value}`);
    });

    // 7
    let targetId = null;
    test('link-creation-works', () => {
      targetId = world.createEntity({
        Identity: { id: 'SMK-002', name: 'SmokeTarget', type: 'custom' },
        Meta: { createdAt: 'T0', updatedAt: 'T0', builtin: false, dirty: false },
      }, { id: '__smoke_test_target__' });

      const res = machine.handleLine(`link.add.peer ${createdId} ${targetId}`);
      if (res.ok === false) throw new Error(res.error ?? 'link falhou');
      const links = world.get(createdId, 'Links');
      if (!links) throw new Error('Links ausente');
      const peers = Array.isArray(links.peer) ? links.peer : [links.peer];
      if (!peers.includes(targetId)) throw new Error('target não está em peers');
    });

    // 8
    test('query-returns-consistent', () => {
      const result = world.query('Identity');
      if (!Array.isArray(result)) throw new Error('query não retornou array');
      if (result.length === 0) throw new Error('query vazia');
      const direct = world.allEntities().filter(id => world.has(id, 'Identity'));
      if (result.length !== direct.length) {
        throw new Error(`query=${result.length}, direct=${direct.length}`);
      }
    });

    // 9
    test('timeline-has-t0-snapshot', () => {
      const timeline = machine.systems.get('TimelineSystem');
      if (!timeline) throw new Error('TimelineSystem ausente');
      const snap = timeline.getSnapshot('T0');
      if (!snap) throw new Error('snapshot T0 ausente');
      if (!snap.entities) throw new Error('snapshot T0 sem entities');
    });

    // 10
    test('storage-adapter-available', async () => {
      if (!persist) return; // opcional
      if (!persist.adapter) throw new Error('persist sem adapter');
    });

    // Aguarda promessas
    await Promise.resolve();

    // Cleanup: remove entidades smoke
    try {
      if (createdId) world.destroyEntity(createdId);
      if (targetId) world.destroyEntity(targetId);
    } catch { /* ignora */ }

    const passed = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;
    const ok = failed === 0;

    return {
      ok,
      passed,
      failed,
      total: results.length,
      results,
      summary: ok
        ? `✓ ${passed}/${results.length} smoke tests passaram`
        : `✗ ${failed}/${results.length} smoke tests falharam: ${results.filter(r => !r.ok).map(r => r.name).join(', ')}`,
      runAt: Date.now(),
    };
  }
}