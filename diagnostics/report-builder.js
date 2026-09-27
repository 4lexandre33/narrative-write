/**
 * @file report-builder.js
 * @module diagnostics
 * @description Empacota todos os diagnósticos num bundle único, legível por IA.
 * @imports core/constants, data/compression
 * @importedBy diagnostics/index (Fase 6+), systems/diagnostics-system (Fase 6+)
 * @level 9
 *
 * O bundle é um objeto JSON com seções + um README.md que explica
 * o que cada uma contém e como correlacioná-las.
 *
 * Uso:
 *   const builder = new ReportBuilder();
 *   builder.attach({ machine, world, persist, recorder, logger, tracer,
 *                    checker, contracts, health, expectations, pipelineReport,
 *                    snapshotDumper, replayEngine, rca });
 *   const bundle = builder.build({ name: 'bug-01', compress: true });
 *   builder.download(bundle);   // dispara download do .zip/.json
 *
 * Seções do bundle:
 *   meta            · versão, sessão, timestamps, contagens
 *   world           · snapshot completo do mundo
 *   timelines       · timelines + entradas (sem snapshots por padrão)
 *   events          · flight recorder (NDJSON)
 *   logs            · structured logger (NDJSON)
 *   traces          · tracer
 *   expectations    · expected vs actual
 *   pipeline        · relatório por comando
 *   invariants      · violações de invariante
 *   contracts       · falhas de contrato
 *   health          · sondas de saúde
 *   session         · replay da sessão
 *   rca             · análises causais recentes
 *   schemas         · registry de componentes/snippets/comandos
 *   README.md       · guia de leitura
 */

import { Compression } from '../data/compression.js';

const BUNDLE_VERSION = 1;

export class ReportBuilder {
  /**
   * @param {Object} [opts={}]
   * @param {string} [opts.appName='narrative-ecs']
   * @param {string} [opts.appVersion='1.0']
   */
  constructor({
    appName = 'narrative-ecs',
    appVersion = '1.0',
  } = {}) {
    this.appName = appName;
    this.appVersion = appVersion;

    this._machine = null;
    this._world = null;
    this._persist = null;
    this._recorder = null;
    this._logger = null;
    this._tracer = null;
    this._checker = null;
    this._contracts = null;
    this._health = null;
    this._expectations = null;
    this._pipelineReport = null;
    this._snapshotDumper = null;
    this._replayEngine = null;
    this._rca = null;
  }

  // ── Anexar ──────────────────────────────────────────────────

  /**
   * Anexa todas as dependências disponíveis (aceita ausências).
   * @param {Object} deps
   * @returns {ReportBuilder}
   */
  attach({
    machine = null,
    world = null,
    persist = null,
    recorder = null,
    logger = null,
    tracer = null,
    checker = null,
    contracts = null,
    health = null,
    expectations = null,
    pipelineReport = null,
    snapshotDumper = null,
    replayEngine = null,
    rca = null,
  } = {}) {
    this._machine = machine;
    this._world = world;
    this._persist = persist;
    this._recorder = recorder;
    this._logger = logger;
    this._tracer = tracer;
    this._checker = checker;
    this._contracts = contracts;
    this._health = health;
    this._expectations = expectations;
    this._pipelineReport = pipelineReport;
    this._snapshotDumper = snapshotDumper;
    this._replayEngine = replayEngine;
    this._rca = rca;
    return this;
  }

  /**
   * Remove todas as dependências.
   */
  detach() {
    this._machine = null;
    this._world = null;
    this._persist = null;
    this._recorder = null;
    this._logger = null;
    this._tracer = null;
    this._checker = null;
    this._contracts = null;
    this._health = null;
    this._expectations = null;
    this._pipelineReport = null;
    this._snapshotDumper = null;
    this._replayEngine = null;
    this._rca = null;
  }

  // ── Build ───────────────────────────────────────────────────

  /**
   * Monta o bundle.
   * @param {Object} [opts={}]
   * @param {string} [opts.name='bundle']
   * @param {boolean} [opts.includeWorld=true]
   * @param {boolean} [opts.includeTimelines=true]
   * @param {boolean} [opts.includeSnapshots=false]
   * @param {boolean} [opts.includeEvents=true]
   * @param {boolean} [opts.includeLogs=true]
   * @param {boolean} [opts.includeTraces=true]
   * @param {boolean} [opts.includeExpectations=true]
   * @param {boolean} [opts.includePipeline=true]
   * @param {boolean} [opts.includeInvariants=true]
   * @param {boolean} [opts.includeContracts=true]
   * @param {boolean} [opts.includeHealth=true]
   * @param {boolean} [opts.includeSession=true]
   * @param {boolean} [opts.includeRca=true]
   * @param {boolean} [opts.includeSchemas=true]
   * @param {string} [opts.userNote] — anotação livre do usuário
   * @returns {Object} bundle
   */
  build(opts = {}) {
    const now = Date.now();
    const name = String(opts.name || 'bundle');
    const sessionId = this._machine?.diag?.sessionId
      ?? this._recorder?.sessionId
      ?? null;

    const bundle = {
      meta: this._buildMeta({ name, sessionId, now, opts }),
      README: this._buildReadme(opts),
    };

    if (opts.includeWorld !== false && this._snapshotDumper) {
      bundle.world = this._tryCall(() => this._snapshotDumper.dump({
        includeSnapshots: opts.includeSnapshots === true,
      }));
    } else if (this._world && opts.includeWorld !== false) {
      bundle.world = this._buildWorld();
    }

    if (opts.includeTimelines !== false) {
      bundle.timelines = this._tryCall(() => this._buildTimelines({
        includeSnapshots: opts.includeSnapshots === true,
      }));
    }

    if (opts.includeEvents !== false && this._recorder) {
      bundle.events = this._tryCall(() => this._recorder.dump());
      bundle.eventsStats = this._tryCall(() => this._recorder.stats());
    }

    if (opts.includeLogs !== false && this._logger) {
      bundle.logs = this._tryCall(() => this._logger.dump());
      bundle.logsStats = this._tryCall(() => ({
        size: this._logger.size(),
        minLevel: this._logger.minLevel,
      }));
    }

    if (opts.includeTraces !== false && this._tracer) {
      bundle.traces = this._tryCall(() => this._tracer.toJSON());
    }

    if (opts.includeExpectations !== false && this._expectations) {
      bundle.expectations = this._tryCall(() => this._expectations.toJSON());
    }

    if (opts.includePipeline !== false && this._pipelineReport) {
      bundle.pipeline = this._tryCall(() => this._pipelineReport.toJSON());
    }

    if (opts.includeInvariants !== false && this._checker) {
      bundle.invariants = this._tryCall(() => this._checker.toJSON());
    }

    if (opts.includeContracts !== false && this._contracts) {
      bundle.contracts = this._tryCall(() => this._contracts.toJSON());
    }

    if (opts.includeHealth !== false && this._health) {
      bundle.health = this._tryCall(() => this._health.toJSON());
    }

    if (opts.includeSession !== false && this._replayEngine) {
      bundle.session = this._tryCall(() => ({
        active: this._replayEngine.isRecording(),
        sessions: this._replayEngine.listSessions(),
        activeCommands: this._replayEngine.activeSession?.commands ?? [],
      }));
    }

    if (opts.includeRca !== false && this._rca && typeof this._rca.history === 'function') {
      bundle.rca = this._tryCall(() => this._rca.history());
    }

    if (opts.includeSchemas !== false) {
      bundle.schemas = this._tryCall(() => this._buildSchemas());
    }

    if (opts.userNote) {
      bundle.meta.userNote = String(opts.userNote);
    }

    bundle.meta.builtAt = now;
    bundle.meta.builtAtISO = new Date(now).toISOString();
    bundle.meta.sectionKeys = Object.keys(bundle).filter(k => k !== 'README');

    return bundle;
  }

  // ── Serialização ────────────────────────────────────────────

  /**
   * Serializa como JSON (pretty).
   * @param {Object} bundle
   * @returns {string}
   */
  toJSON(bundle) {
    try {
      return JSON.stringify(bundle, null, 2);
    } catch (err) {
      return JSON.stringify({
        meta: { error: `falha ao serializar bundle: ${err.message}` },
        README: bundle?.README ?? '',
      }, null, 2);
    }
  }

  /**
   * Serializa como NDJSON — uma seção por linha.
   * Compacto e estável, ideal para anexar em LLM.
   * @param {Object} bundle
   * @returns {string}
   */
  toNDJSON(bundle) {
    const lines = [];
    for (const [key, value] of Object.entries(bundle || {})) {
      try {
        lines.push(JSON.stringify({ section: key, data: value }));
      } catch {
        lines.push(JSON.stringify({ section: key, data: null, error: 'unserializable' }));
      }
    }
    return lines.join('\n');
  }

  /**
   * Cria um Blob a partir do bundle.
   * @param {Object} bundle
   * @param {'json'|'ndjson'} [format='json']
   * @returns {Blob}
   */
  toBlob(bundle, format = 'json') {
    const content = format === 'ndjson' ? this.toNDJSON(bundle) : this.toJSON(bundle);
    const mime = format === 'ndjson'
      ? 'application/x-ndjson'
      : 'application/json';
    return new Blob([content], { type: mime });
  }

  /**
   * Comprime o bundle com gzip (se disponível).
   * @param {Object} bundle
   * @returns {Promise<string>} — payload pronto para storage
   */
  async toCompressed(bundle) {
    const json = this.toJSON(bundle);
    return Compression.compress(json);
  }

  /**
   * Estima tamanho do bundle em bytes.
   * @param {Object} bundle
   * @returns {number}
   */
  estimate(bundle) {
    try {
      return this.toJSON(bundle).length;
    } catch {
      return -1;
    }
  }

  // ── Download ────────────────────────────────────────────────

  /**
   * Nome de arquivo padrão.
   * @param {Object} bundle
   * @param {string} [ext='json']
   * @returns {string}
   */
  filename(bundle, ext = 'json') {
    const name = bundle?.meta?.name ?? 'bundle';
    const ts = new Date(bundle?.meta?.builtAt ?? Date.now())
      .toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safe = String(name).replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
    return `diag-${safe}-${ts}.${ext}`;
  }

  /**
   * Dispara download de um bundle.
   * @param {Object} bundle
   * @param {'json'|'ndjson'} [format='json']
   * @returns {{ ok:boolean, filename?:string, error?:string }}
   */
  download(bundle, format = 'json') {
    try {
      const blob = this.toBlob(bundle, format);
      const filename = this.filename(bundle, format);

      if (typeof document === 'undefined') {
        return { ok: false, error: 'document indisponível' };
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      return { ok: true, filename };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ── README ──────────────────────────────────────────────────

  /**
   * @private
   */
  _buildReadme(opts = {}) {
    const appName = this.appName;
    const appVersion = this.appVersion;
    const sections = [
      'meta', 'world', 'timelines', 'events', 'logs', 'traces',
      'expectations', 'pipeline', 'invariants', 'contracts', 'health',
      'session', 'rca', 'schemas',
    ];

    const present = sections.filter(s => {
      if (s === 'world') return opts.includeWorld !== false;
      if (s === 'timelines') return opts.includeTimelines !== false;
      if (s === 'events') return opts.includeEvents !== false && this._recorder;
      if (s === 'logs') return opts.includeLogs !== false && this._logger;
      if (s === 'traces') return opts.includeTraces !== false && this._tracer;
      if (s === 'expectations') return opts.includeExpectations !== false && this._expectations;
      if (s === 'pipeline') return opts.includePipeline !== false && this._pipelineReport;
      if (s === 'invariants') return opts.includeInvariants !== false && this._checker;
      if (s === 'contracts') return opts.includeContracts !== false && this._contracts;
      if (s === 'health') return opts.includeHealth !== false && this._health;
      if (s === 'session') return opts.includeSession !== false && this._replayEngine;
      if (s === 'rca') return opts.includeRca !== false && this._rca;
      if (s === 'schemas') return opts.includeSchemas !== false;
      return false;
    });

    const lines = [];
    lines.push(`# Diagnostics Bundle — ${appName} v${appVersion}`);
    lines.push('');
    lines.push('Este arquivo foi gerado automaticamente pela DiagnosticsSuite do editor narrativo ECS.');
    lines.push('Ele reúne capturas de runtime para diagnóstico assistido por IA.');
    lines.push('');
    lines.push('## Como ler este bundle');
    lines.push('');
    lines.push('Todas as seções são JSON. Chaves de correlação:');
    lines.push('');
    lines.push('- `seq` — número sequencial de evento (único por sessão)');
    lines.push('- `ts` — timestamp Unix em milissegundos');
    lines.push('- `tick` — tick do mundo no momento do evento');
    lines.push('- `traceId` — identificador da trace que contém spans');
    lines.push('- `spanId` — identificador do span dentro da trace');
    lines.push('- `commandId` — identificador do comando (usado por expectations)');
    lines.push('');
    lines.push('### Ordem sugerida de leitura');
    lines.push('');
    lines.push('1. `meta` — versão, sessão, contagens. Dá o panorama.');
    lines.push('2. `README` — este guia.');
    lines.push('3. `rca` — análises causais de erros já computadas. **Comece por aqui se houver erro.**');
    lines.push('4. `invariants` + `contracts` — violações detectadas automaticamente.');
    lines.push('5. `expectations` — o que era esperado vs o que aconteceu. **Foco nos que têm `diff.hasDiscrepancies: true`.**');
    lines.push('6. `pipeline` — quais sistemas rodaram, com que duração, e anomalias.');
    lines.push('7. `events` — fluxo bruto do bus. Filtre pelos `tick` próximos do erro.');
    lines.push('8. `traces` — árvore hierárquica de spans.');
    lines.push('9. `logs` — mensagens curadas.');
    lines.push('10. `health` — anomalias contínuas.');
    lines.push('11. `world` + `timelines` — estado completo no momento da captura.');
    lines.push('12. `session` — comandos gravados. Reproduz o que o usuário fez.');
    lines.push('13. `schemas` — catálogo de componentes/comandos/snippets.');
    lines.push('');
    lines.push('### Seções presentes neste bundle');
    lines.push('');
    for (const s of present) {
      lines.push(`- \`${s}\``);
    }
    lines.push('');
    lines.push('### Invariantes críticos monitorados');
    lines.push('');
    lines.push('- Toda entidade tem `Identity` com `id` e `name` não vazios');
    lines.push('- Todo shortcode em `ids.byShortcode` aponta para entidade existente');
    lines.push('- Todo link em `links.forward` aponta para entidade existente');
    lines.push('- Todo `InstanceOf.id` aponta para blueprint válido');
    lines.push('- Nenhum ciclo em `DerivesFrom`');
    lines.push('- `machine.state.tickNumber === tickToNumber(tick)`');
    lines.push('- Timeline ativa tem pelo menos 1 snapshot');
    lines.push('- Nenhum componente `undefined` no World');
    lines.push('');
    lines.push('### Sinais de bug silencioso (não aparecem no console F12)');
    lines.push('');
    lines.push('- `rule:evaluated` com `reason` que não seja `fired` — regra não disparou');
    lines.push('- `pipeline:system-missing` — sistema do pipeline não registrado');
    lines.push('- `link-index:drift` — arestas caíram sem destruição');
    lines.push('- `validation:soft-fail` — validador devolveu valor inesperado');
    lines.push('- `editor:trigger-rejected` — menu não abriu por motivo X');
    lines.push('- `expectations[].diff.hasDiscrepancies` — comportamento divergiu do esperado');
    lines.push('');
    lines.push('### Como reproduzir');
    lines.push('');
    lines.push('1. Restaure a seção `session` num mundo virgem (mesmos sistemas registrados).');
    lines.push('2. Execute os comandos em ordem via `ReplayEngine.replay()`.');
    lines.push('3. Compare o estado final com `world` do bundle.');
    lines.push('4. Qualquer divergência em `expectations` indica o passo exato que falhou.');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('Fim do README.');
    lines.push('');

    return lines.join('\n');
  }

  // ── Construtores internos ───────────────────────────────────

  /**
   * @private
   */
  _buildMeta({ name, sessionId, now, opts }) {
    const counts = {};

    try {
      if (this._recorder) {
        const st = this._recorder.stats();
        counts.events = st.total;
        counts.uniqueEventTypes = st.uniqueEvents;
      }
    } catch { /* isola */ }

    try {
      if (this._logger) counts.logs = this._logger.size();
    } catch { /* isola */ }

    try {
      if (this._tracer) counts.traces = this._tracer.stats().traces;
    } catch { /* isola */ }

    try {
      if (this._checker) counts.invariantViolations = this._checker.stats().totalViolations;
    } catch { /* isola */ }

    try {
      if (this._contracts) counts.contractViolations = this._contracts.stats().totalViolations;
    } catch { /* isola */ }

    let entityCount = null;
    try {
      entityCount = this._world?.allEntities?.().length ?? null;
    } catch { /* isola */ }

    return {
      name: String(name),
      appName: this.appName,
      appVersion: this.appVersion,
      bundleVersion: BUNDLE_VERSION,
      sessionId,
      builtAt: now,
      builtAtISO: new Date(now).toISOString(),
      tick: this._machine?.state?.tick ?? null,
      tickNumber: this._machine?.state?.tickNumber ?? null,
      timeline: this._machine?.state?.timeline ?? null,
      entityCount,
      counts,
      options: {
        includeWorld: opts.includeWorld !== false,
        includeTimelines: opts.includeTimelines !== false,
        includeSnapshots: opts.includeSnapshots === true,
        includeEvents: opts.includeEvents !== false,
        includeLogs: opts.includeLogs !== false,
        includeTraces: opts.includeTraces !== false,
        includeExpectations: opts.includeExpectations !== false,
        includePipeline: opts.includePipeline !== false,
        includeInvariants: opts.includeInvariants !== false,
        includeContracts: opts.includeContracts !== false,
        includeHealth: opts.includeHealth !== false,
        includeSession: opts.includeSession !== false,
        includeRca: opts.includeRca !== false,
        includeSchemas: opts.includeSchemas !== false,
      },
    };
  }

  /**
   * @private
   */
  _buildWorld() {
    const world = this._world;
    if (!world) return null;

    const entities = {};
    for (const id of world.allEntities()) {
      entities[id] = world.componentsOf(id);
    }

    return {
      count: world.allEntities().length,
      componentNames: world.componentNames(),
      entities,
    };
  }

  /**
   * @private
   */
  _buildTimelines({ includeSnapshots = false } = {}) {
    const timeline = this._machine?.systems?.get?.('TimelineSystem');
    if (!timeline) return null;

    const out = {
      active: timeline.activeTimeline,
      list: [],
      snapshots: {},
    };

    for (const [name, tl] of timeline.timelines) {
      out.list.push({
        name,
        base: tl.base ?? null,
        point: tl.point ?? null,
        createdAt: tl.createdAt ?? null,
        ticks: tl.entries?.length ?? 0,
        active: name === timeline.activeTimeline,
      });

      const tickList = tl.snapshots ? Array.from(tl.snapshots.keys()) : [];
      const entries = (tl.entries || []).map(e => ({
        tick: e.tick,
        kind: e.kind,
        mutation: e.mutation ? {
          op: e.mutation.op,
          kind: e.mutation.kind,
          target: e.mutation.target,
          path: e.mutation.path,
        } : null,
        link: e.link ? {
          action: e.link.action,
          rel: e.link.rel,
          from: e.link.from,
          to: e.link.to ?? null,
        } : null,
        created: e.created ? { id: e.created.id } : null,
      }));

      out.snapshots[name] = {
        tickList,
        entries,
      };

      if (includeSnapshots) {
        out.snapshots[name].full = Object.fromEntries(tl.snapshots);
      }
    }

    return out;
  }

  /**
   * @private
   */
  _buildSchemas() {
    const out = {};

    try {
      const worldRegistry = this._world?.registry;
      if (worldRegistry && typeof worldRegistry.toJSON === 'function') {
        out.components = worldRegistry.toJSON();
      } else if (worldRegistry && typeof worldRegistry.all === 'function') {
        out.componentNames = worldRegistry.all();
      }
    } catch { /* isola */ }

    try {
      const machineRegistry = this._machine?.registry;
      if (machineRegistry) {
        out.commands = (machineRegistry.getCommands?.() ?? []).map(c => ({
          verb: c.verb,
          description: c.description,
          subverbs: c.subverbs ?? null,
        }));
        out.snippets = (machineRegistry.getSnippets?.() ?? []).map(s => ({
          trigger: s.trigger,
          kind: s.kind,
          description: s.description,
        }));
      }
    } catch { /* isola */ }

    return out;
  }

  /**
   * Executa uma função com try/catch, devolvendo null em erro.
   * @private
   */
  _tryCall(fn) {
    try {
      return fn();
    } catch (err) {
      return { _error: err.message };
    }
  }
}