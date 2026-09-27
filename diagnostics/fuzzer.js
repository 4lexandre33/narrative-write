/**
 * @file fuzzer.js
 * @module diagnostics
 * @description Gera comandos aleatórios para descobrir crashes em entradas inesperadas.
 * @imports core/constants
 * @importedBy diagnostics/index (Fase 6+), systems/diagnostics-system (Fase 6+)
 * @level 9
 *
 * Estratégias:
 *   - verbos conhecidos + ações válidas + alvos aleatórios
 *   - verbos conhecidos + ações inválidas
 *   - strings com caracteres especiais (unicode, zero-width, aspas, chaves)
 *   - valores extremos (negativos, muito grandes, vazios)
 *   - caminhos profundos, listas vazias, JSON malformado
 *
 * Segurança:
 *   - Executa em um Machine isolado (sandbox) quando possível.
 *   - Se não houver sandbox, salva snapshot antes e restaura depois.
 *   - Nunca chama `flush` de persistência.
 *   - Teto de N iterações.
 *
 * Uso:
 *   const fuzzer = new Fuzzer();
 *   const result = await fuzzer.run({ machine, iterations: 500, seed: 42 });
 *   result.findings;      // comandos que lançaram exceção
 *   result.crashes;       // subconjunto com stack
 *   result.coverage;      // verbos/ações testados
 */

import { KNOWN_PREFIXES, ENTITY_TYPES } from '../core/constants.js';

const DEFAULT_ITERATIONS = 500;

const VERB_ACTIONS = Object.freeze({
  ent: ['create', 'show', 'list', 'delete'],
  id: ['show', 'rename', 'describe', 'retype'],
  inst: ['mark', 'unmark', 'create', 'destroy', 'list', 'sync', 'chain', 'resolve', 'reparent', 'unset', 'policy'],
  mut: ['add', 'set', 'sub', 'push', 'pull', 'flag', 'enum', 'text'],
  link: ['set', 'add', 'pull', 'clear', 'where', 'to', 'from', 'tree'],
  que: ['at', 'when', 'timeline', 'knowledge', 'where'],
  sea: ['find', 'in', 'tag', 'help'],
  at: ['show'],
  whe: ['show'],
  tim: ['show', 'rule'],
  aud: ['links', 'identities', 'instances', 'continuity', 'references', 'rules', 'snippets'],
  kno: ['learn', 'forget', 'show', 'at'],
  frk: ['create', 'switch', 'list', 'delete', 'merge'],
  dif: ['vs', 'export'],
  rul: ['add', 'list', 'find', 'show', 'run', 'sim', 'off', 'on', 'del'],
  snip: ['create', 'create.template', 'create.menu', 'create.command', 'find', 'list', 'tree', 'rename', 'delete'],
  exp: ['pdf', 'json', 'csv', 'snippets', 'all'],
  help: ['commands', 'snippets', 'components', 'cheatsheet', 'tutorial'],
  diag: ['status', 'on', 'off', 'mode', 'flight', 'counts', 'logs', 'invariants', 'contracts', 'health', 'rules', 'smoke', 'snapshot', 'clear'],
});

const SUBTYPES = Object.freeze({
  mut: ['stats', 'list'],
  inst: [null, 'mark', 'unmark', 'create', 'destroy', 'list', 'sync'],
  link: [null, 'set', 'add', 'pull', 'clear', 'where', 'to', 'from', 'tree'],
});

const PATH_FIELDS = Object.freeze(['fear', 'hp', 'value', 'x', 'y', '__proto__', 'constructor', '']);

const VALUE_STRINGS = Object.freeze([
  '', ' ', 'a', 'abc', '0', '-1', '9999999999999999999', 'NaN', 'Infinity',
  'null', 'undefined', 'true', 'false',
  "'", '"', '`', '\\', '\\n', '\\t',
  '{', '}', '[', ']', '(', ')', '<', '>',
  '🎲', '日本語', '\u200b', '\u2063', 'é', 'ñ', 'ç',
  'a=b', 'a,b', 'a.b.c.d', '!!!', '@@@', '%%%',
]);

export class Fuzzer {
  /**
   * @param {Object} [opts={}]
   * @param {number} [opts.defaultIterations=500]
   * @param {number} [opts.maxIterations=5000]
   * @param {number} [opts.seed=0]
   */
  constructor({
    defaultIterations = DEFAULT_ITERATIONS,
    maxIterations = 5000,
    seed = 0,
  } = {}) {
    this.defaultIterations = Math.max(1, defaultIterations);
    this.maxIterations = Math.max(1, maxIterations);
    this._seed = Number.isFinite(seed) && seed !== 0 ? seed : Date.now() % 0x7fffffff;
    this._rng = this._makeRng(this._seed);

    this._running = false;
    this._coverage = { verbs: new Set(), actions: new Set(), combos: new Set() };
    this._findings = [];
  }

  // ── API principal ───────────────────────────────────────────

  /**
   * Roda N iterações contra o machine.
   * @param {Object} opts
   * @param {Object} opts.machine
   * @param {number} [opts.iterations]
   * @param {number} [opts.seed] — se passado, reinicia o RNG
   * @param {boolean} [opts.isolate=true] — tenta rodar em sandbox
   * @param {Function} [opts.onIteration] — callback(opcional) por iteração
   * @returns {Promise<Object>}
   */
  async run({
    machine,
    iterations = this.defaultIterations,
    seed = null,
    isolate = true,
    onIteration = null,
  } = {}) {
    if (this._running) {
      return { ok: false, error: 'fuzzer já em execução' };
    }
    if (!machine || typeof machine.handleLine !== 'function') {
      return { ok: false, error: 'machine inválido' };
    }

    const n = Math.min(Math.max(1, iterations), this.maxIterations);
    if (Number.isFinite(seed) && seed !== 0) {
      this._seed = seed;
      this._rng = this._makeRng(seed);
    }

    this._running = true;
    this._coverage = { verbs: new Set(), actions: new Set(), combos: new Set() };
    this._findings = [];

    // Snapshot de segurança
    const safety = isolate ? this._safetySnapshot(machine) : null;

    const t0 = this._now();
    const commands = [];

    try {
      for (let i = 0; i < n; i++) {
        const line = this._generate();
        commands.push(line);

        let result = null;
        let threw = null;
        try {
          result = machine.handleLine(line);
        } catch (err) {
          threw = err;
        }

        const finding = {
          iteration: i + 1,
          line,
          ok: result?.ok !== false && !threw,
          threw: !!threw,
          error: threw?.message ?? (result?.ok === false ? result.error : null),
          stack: threw?.stack ? threw.stack.split('\n').slice(0, 5).join(' | ') : null,
          mutated: result?.mutated === true,
          tick: typeof machine.getTick === 'function' ? machine.getTick() : null,
        };

        // Consideramos "finding" só se lançou exceção ou deu halt silencioso
        if (finding.threw || (result && result.ok === false && result.halt)) {
          this._findings.push(finding);
        }

        if (typeof onIteration === 'function') {
          try { onIteration(finding, i); } catch { /* isola */ }
        }
      }
    } finally {
      // Restaura estado de segurança se aplicável
      if (safety) {
        try { this._restoreSafety(machine, safety); } catch { /* isola */ }
      }
      this._running = false;
    }

    const durationMs = this._round(this._now() - t0);

    return {
      ok: true,
      iterations: n,
      seed: this._seed,
      durationMs,
      findings: this._findings.slice(),
      crashes: this._findings.filter(f => f.threw),
      coverage: {
        verbs: Array.from(this._coverage.verbs).sort(),
        actions: Array.from(this._coverage.actions).sort(),
        combos: Array.from(this._coverage.combos).sort(),
      },
      commandSample: commands.slice(0, 30),
    };
  }

  /**
   * Verifica se está rodando.
   * @returns {boolean}
   */
  isRunning() {
    return this._running;
  }

  /**
   * Seed atual.
   * @returns {number}
   */
  getSeed() {
    return this._seed;
  }

  /**
   * Estatísticas da última execução.
   * @returns {Object}
   */
  stats() {
    return {
      running: this._running,
      seed: this._seed,
      findings: this._findings.length,
      crashes: this._findings.filter(f => f.threw).length,
      verbsCovered: this._coverage.verbs.size,
      actionsCovered: this._coverage.actions.size,
    };
  }

  // ── Geração ─────────────────────────────────────────────────

  /**
   * Gera uma linha aleatória.
   * @returns {string}
   * @private
   */
  _generate() {
    const strategy = this._pick(0.15);
    if (strategy) return this._generateWeird();

    const verb = this._pickFrom(KNOWN_PREFIXES.filter(v => v !== 'diag'));
    const actions = VERB_ACTIONS[verb] || ['show'];
    const action = this._pickFrom(actions);

    this._coverage.verbs.add(verb);
    this._coverage.actions.add(`${verb}.${action}`);
    this._coverage.combos.add(`${verb}.${action}`);

    const head = this._buildHead(verb, action);
    const args = this._buildArgs(verb, action);

    return args.length > 0 ? `${head} ${args.join(' ')}` : head;
  }

  /**
   * @private
   */
  _buildHead(verb, action) {
    // Adiciona subtype para verbos que aceitam
    if (verb === 'mut' && ['add', 'set', 'sub'].includes(action)) {
      return `mut.${action}.stats`;
    }
    if (verb === 'mut' && ['push', 'pull'].includes(action)) {
      return `mut.${action}.list`;
    }
    if (verb === 'mut' && action === 'flag') {
      return `mut.flag.${this._pickFrom(['on', 'off'])}`;
    }
    if (verb === 'link' && ['set', 'add', 'pull', 'clear'].includes(action)) {
      return `link.${action}.${this._randomRel()}`;
    }
    if (verb === 'inst' && action === 'create') {
      return `inst.create`;
    }
    return `${verb}.${action}`;
  }

  /**
   * @private
   */
  _buildArgs(verb, action) {
    const out = [];
    const argc = 1 + Math.floor(this._rng() * 3);

    for (let i = 0; i < argc; i++) {
      out.push(this._randomToken(verb, action));
    }

    // Para mut.*, garante path.field
    if (verb === 'mut' && ['add', 'set', 'sub', 'push', 'pull'].includes(action)) {
      const target = this._randomToken(verb, action);
      const field = this._pickFrom(PATH_FIELDS) || 'value';
      out[0] = `${target}.${field}`;
    }

    return out;
  }

  /**
   * @private
   */
  _randomToken(verb, action) {
    const r = this._rng();
    if (r < 0.20) return this._pickFrom(VALUE_STRINGS);
    if (r < 0.40) return this._randomNumber();
    if (r < 0.60) return this._randomEntityName();
    if (r < 0.80) return `${this._randomEntityName()}.${this._pickFrom(PATH_FIELDS) || 'value'}`;
    return this._randomKeyValue();
  }

  /**
   * @private
   */
  _randomEntityName() {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const n = 1 + Math.floor(this._rng() * 10);
    let s = '';
    for (let i = 0; i < n; i++) {
      s += letters[Math.floor(this._rng() * letters.length)];
    }
    // Capitaliza às vezes
    if (this._rng() < 0.5) s = s.charAt(0).toUpperCase() + s.slice(1);
    return s;
  }

  /**
   * @private
   */
  _randomNumber() {
    const r = this._rng();
    if (r < 0.3) return String(Math.floor(this._rng() * 100));
    if (r < 0.5) return String(-Math.floor(this._rng() * 100));
    if (r < 0.7) return String(Math.floor(this._rng() * 1e15));
    if (r < 0.85) return this._rng().toFixed(6);
    return '0';
  }

  /**
   * @private
   */
  _randomRel() {
    const rels = ['location', 'owner', 'parent', 'inventory', 'members', 'rival', 'peer', 'x', ''];
    return this._pickFrom(rels) || 'rel';
  }

  /**
   * @private
   */
  _randomKeyValue() {
    const keys = ['k', 'x', 'type', 'value', 'flags', 'tags', 'description', ''];
    const vals = ['v', '1', '', 'true', 'null', "a'b", 'a"b'];
    const k = this._pickFrom(keys) || 'k';
    const v = this._pickFrom(vals);
    return `${k}=${v}`;
  }

  /**
   * Gera linha "weird" com caracteres especiais.
   * @private
   */
  _generateWeird() {
    const patterns = [
      () => '',
      () => ' ',
      () => '\t',
      () => '\n',
      () => '...',
      () => 'a.b.c.d.e',
      () => '.'.repeat(10),
      () => `ent.create.${this._pickFrom(ENTITY_TYPES)} ${this._pickFrom(VALUE_STRINGS)}`,
      () => `mut.add.stats ${this._pickFrom(VALUE_STRINGS)}.${this._pickFrom(VALUE_STRINGS)} ${this._pickFrom(VALUE_STRINGS)}`,
      () => `link.set.${this._pickFrom(VALUE_STRINGS)} ${this._pickFrom(VALUE_STRINGS)} ${this._pickFrom(VALUE_STRINGS)}`,
      () => `/diag.inject ${this._pickFrom(VALUE_STRINGS)}`,
      () => `/unknown ${this._pickFrom(VALUE_STRINGS)}`,
      () => `sea.find ${this._pickFrom(VALUE_STRINGS)}`,
      () => `rul.add ${this._pickFrom(VALUE_STRINGS)} ON: ${this._pickFrom(VALUE_STRINGS)} DO: ${this._pickFrom(VALUE_STRINGS)}`,
      () => `snip.create.menu ${this._pickFrom(VALUE_STRINGS)} opts='${this._pickFrom(VALUE_STRINGS)}'`,
    ];
    return this._pickFrom(patterns)();
  }

  // ── Segurança ───────────────────────────────────────────────

  /**
   * Tira snapshot do estado atual para restaurar depois.
   * @private
   */
  _safetySnapshot(machine) {
    try {
      const world = machine.world;
      if (!world) return null;
      const entities = {};
      for (const id of world.allEntities()) {
        entities[id] = world.componentsOf(id);
      }
      return {
        entities,
        tick: machine.state?.tick ?? 'T0',
        tickNumber: machine.state?.tickNumber ?? 0,
        timeline: machine.state?.timeline ?? 'main',
      };
    } catch {
      return null;
    }
  }

  /**
   * Restaura o snapshot de segurança.
   * @private
   */
  _restoreSafety(machine, safety) {
    const world = machine.world;
    if (!world) return;

    world.clear();
    for (const [id, comps] of Object.entries(safety.entities)) {
      world.createEntity(comps, { id });
    }

    if (machine.state) {
      machine.state.tick = safety.tick;
      machine.state.tickNumber = safety.tickNumber;
      machine.state.timeline = safety.timeline;
    }

    try { machine.links?.rebuild?.(world); } catch { /* isola */ }
    try { machine.ids?.rebuildFromWorld?.(world); } catch { /* isola */ }
  }

  // ── RNG ─────────────────────────────────────────────────────

  /**
   * Cria um PRNG determinístico (mulberry32).
   * @param {number} seed
   * @returns {() => number}
   * @private
   */
  _makeRng(seed) {
    let a = seed >>> 0;
    return function mulberry32() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * @private
   */
  _pickFrom(arr) {
    if (!arr || arr.length === 0) return '';
    return arr[Math.floor(this._rng() * arr.length)];
  }

  /**
   * Retorna true com probabilidade p.
   * @private
   */
  _pick(p) {
    return this._rng() < p;
  }

  /**
   * @private
   */
  _now() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  /**
   * @private
   */
  _round(n) {
    return Math.round(Number(n) * 1000) / 1000;
  }
}