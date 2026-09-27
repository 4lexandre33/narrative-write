/**
 * @file golden-baseline.js
 * @module diagnostics
 * @description Captura, armazena e compara baselines de estado do mundo.
 * @imports core/utils/object (deepClone, deepEqual), core/utils/time (nowISO)
 * @importedBy diagnostics/test-battery
 * @level 9
 *
 * Baseline = snapshot determinístico de `machine.world` após rodar uma
 * sequência fixa de comandos. Comparar um novo estado contra o baseline
 * detecta regressões estruturais (entidades que sumiram, campos que
 * mudaram de valor, links que se romperam).
 *
 * Armazenamento:
 *   - Se `adapter` for injetado → usa adapter.get/set/delete/list (async)
 *   - Caso contrário          → usa localStorage direto (fallback)
 *
 * Prefixo de chave: `narr:diag:baseline:<name>`
 *
 * Uso:
 *   const baseline = new GoldenBaseline();
 *   await baseline.capture('main', machine);
 *   const cmp = await baseline.compare('main', machine);
 *   if (!cmp.equal) console.log(cmp.diff);
 */

import { deepClone, deepEqual } from '../core/utils/object.js';
import { nowISO } from '../core/utils/time.js';

const DEFAULT_PREFIX = 'narr:diag:baseline:';
const BASELINE_VERSION = 1;
const LS_PREFIX = 'narr:';

export class GoldenBaseline {
  /**
   * @param {Object} [opts={}]
   * @param {Object} [opts.adapter=null]  — StorageAdapter opcional
   * @param {string} [opts.prefix]
   * @param {number} [opts.maxBaselines=50]  — limite de baselines mantidos
   */
  constructor({
    adapter = null,
    prefix = DEFAULT_PREFIX,
    maxBaselines = 50,
  } = {}) {
    this.adapter = adapter;
    this.prefix = prefix;
    this.maxBaselines = Math.max(1, maxBaselines);
  }

  // ══════════════════════════════════════════════════════════
  // API principal
  // ══════════════════════════════════════════════════════════

  /**
   * Captura o estado atual e salva como baseline.
   *
   * @param {string} name
   * @param {Object} machine
   * @param {Object} [meta={}]  — dados livres (ex: { seed, note })
   * @returns {Promise<{ ok:boolean, name:string, capturedAt:string, entityCount:number }>}
   */
  async capture(name, machine, meta = {}) {
    this._assertName(name);
    this._assertMachine(machine);

    const snapshot = this._captureWorld(machine.world);
    const payload = {
      version: BASELINE_VERSION,
      name: String(name),
      capturedAt: nowISO(),
      tick: machine.state?.tick ?? null,
      timeline: machine.state?.timeline ?? null,
      entityCount: snapshot.count,
      hash: this._hash(snapshot.entities),
      snapshot,
      meta: deepClone(meta),
    };

    await this._write(name, payload);
    await this._enforceLimit();

    return {
      ok: true,
      name: payload.name,
      capturedAt: payload.capturedAt,
      entityCount: payload.entityCount,
    };
  }

  /**
   * Compara o estado atual contra um baseline salvo.
   *
   * @param {string} name
   * @param {Object} machine
   * @returns {Promise<{
   *   equal:boolean,
   *   name:string,
   *   reason?:string,
   *   baselineAt?:string,
   *   baselineCount?:number,
   *   currentCount?:number,
   *   diff?:Object,
   * }>}
   */
  async compare(name, machine) {
    this._assertName(name);
    this._assertMachine(machine);

    const stored = await this.get(name);
    if (!stored) {
      return { equal: false, name, reason: 'baseline não encontrada' };
    }

    const current = this._captureWorld(machine.world);
    const currentHash = this._hash(current.entities);

    // Atalho por hash — se bate, é igual
    if (stored.hash && stored.hash === currentHash) {
      return {
        equal: true,
        name,
        baselineAt: stored.capturedAt,
        baselineCount: stored.entityCount,
        currentCount: current.count,
        diff: null,
      };
    }

    // Diff detalhado
    const equal = deepEqual(stored.snapshot.entities, current.entities);

    return {
      equal,
      name,
      baselineAt: stored.capturedAt,
      baselineCount: stored.entityCount,
      currentCount: current.count,
      diff: equal ? null : this._diffWorlds(stored.snapshot, current),
    };
  }

  /**
   * Lista metadados dos baselines salvos.
   * @returns {Promise<Array<{name:string, capturedAt:string, entityCount:number, tick:string, hash:string}>>}
   */
  async list() {
    const names = await this._listNames();
    const out = [];

    for (const name of names) {
      const stored = await this.get(name);
      if (!stored) continue;
      out.push({
        name: stored.name,
        capturedAt: stored.capturedAt,
        entityCount: stored.entityCount,
        tick: stored.tick,
        hash: stored.hash,
      });
    }

    out.sort((a, b) => (b.capturedAt ?? '').localeCompare(a.capturedAt ?? ''));
    return out;
  }

  /**
   * Recupera um baseline completo.
   * @param {string} name
   * @returns {Promise<Object|null>}
   */
  async get(name) {
    this._assertName(name);
    const raw = await this._read(name);
    if (!raw) return null;

    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed?.version !== BASELINE_VERSION) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Remove um baseline.
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  async delete(name) {
    this._assertName(name);
    await this._delete(name);
    return true;
  }

  /**
   * Remove todos os baselines.
   * @returns {Promise<number>} — quantidade removida
   */
  async clear() {
    const names = await this._listNames();
    for (const name of names) {
      await this._delete(name);
    }
    return names.length;
  }

  /**
   * Verifica se um baseline existe.
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  async has(name) {
    const stored = await this.get(name);
    return stored !== null;
  }

  // ══════════════════════════════════════════════════════════
  // Captura do mundo
  // ══════════════════════════════════════════════════════════

  /**
   * Captura o estado atual do World como objeto plano.
   * @param {Object} world
   * @returns {{ entities:Object, count:number }}
   * @private
   */
  _captureWorld(world) {
    const entities = {};
    const ids = world.allEntities();

    for (const id of ids) {
      const comps = world.componentsOf(id);
      entities[id] = comps ? deepClone(comps) : {};
    }

    return { entities, count: ids.length };
  }

  // ══════════════════════════════════════════════════════════
  // Diff
  // ══════════════════════════════════════════════════════════

  /**
   * Diff compacto entre dois snapshots.
   * @param {Object} baseline — { entities, count }
   * @param {Object} current  — { entities, count }
   * @returns {{ added:string[], removed:string[], changed:Array<{id:string, components:string[]}>, stats:Object }}
   * @private
   */
  _diffWorlds(baseline, current) {
    const baseIds = new Set(Object.keys(baseline.entities ?? {}));
    const curIds = new Set(Object.keys(current.entities ?? {}));

    const added = [];
    const removed = [];
    const changed = [];

    for (const id of curIds) {
      if (!baseIds.has(id)) added.push(id);
    }
    for (const id of baseIds) {
      if (!curIds.has(id)) removed.push(id);
    }

    for (const id of baseIds) {
      if (!curIds.has(id)) continue;

      const a = baseline.entities[id] ?? {};
      const b = current.entities[id] ?? {};
      const comps = new Set([...Object.keys(a), ...Object.keys(b)]);
      const diffComps = [];

      for (const c of comps) {
        if (!deepEqual(a[c], b[c])) diffComps.push(c);
      }

      if (diffComps.length > 0) changed.push({ id, components: diffComps });
    }

    return {
      added: added.sort(),
      removed: removed.sort(),
      changed: changed.sort((a, b) => a.id.localeCompare(b.id)),
      stats: {
        baselineCount: baseline.count ?? baseIds.size,
        currentCount: current.count ?? curIds.size,
        added: added.length,
        removed: removed.length,
        changed: changed.length,
      },
    };
  }

  // ══════════════════════════════════════════════════════════
  // Hash
  // ══════════════════════════════════════════════════════════

  /**
   * Hash determinístico (djb2) sobre a forma canônica dos dados.
   * Não é criptográfico — só serve para atalho de comparação.
   * @param {any} value
   * @returns {string}
   * @private
   */
  _hash(value) {
    const canonical = this._canonicalize(value);
    let h = 5381;
    for (let i = 0; i < canonical.length; i++) {
      h = ((h << 5) + h) ^ canonical.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h).toString(36);
  }

  /**
   * Stringify canônico (chaves ordenadas) para hash estável.
   * @param {any} v
   * @returns {string}
   * @private
   */
  _canonicalize(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NaN';
    if (typeof v === 'boolean') return v ? '1' : '0';
    if (typeof v === 'string') return JSON.stringify(v);

    if (Array.isArray(v)) {
      return '[' + v.map(x => this._canonicalize(x)).join(',') + ']';
    }

    if (typeof v === 'object') {
      const keys = Object.keys(v).sort();
      const parts = [];
      for (const k of keys) {
        parts.push(JSON.stringify(k) + ':' + this._canonicalize(v[k]));
      }
      return '{' + parts.join(',') + '}';
    }

    return JSON.stringify(String(v));
  }

  // ══════════════════════════════════════════════════════════
  // Storage — caminho com adapter
  // ══════════════════════════════════════════════════════════

  /**
   * @private
   */
  async _read(name) {
    const key = this._keyFor(name);

    if (this.adapter && typeof this.adapter.get === 'function') {
      return await this.adapter.get(key);
    }
    return this._lsGet(key);
  }

  /**
   * @private
   */
  async _write(name, payload) {
    const key = this._keyFor(name);
    const json = JSON.stringify(payload);

    if (this.adapter && typeof this.adapter.set === 'function') {
      await this.adapter.set(key, json);
      return;
    }
    this._lsSet(key, json);
  }

  /**
   * @private
   */
  async _delete(name) {
    const key = this._keyFor(name);

    if (this.adapter && typeof this.adapter.delete === 'function') {
      await this.adapter.delete(key);
      return;
    }
    this._lsRemove(key);
  }

  /**
   * @private
   */
  async _listNames() {
    const out = [];

    if (this.adapter && typeof this.adapter.list === 'function') {
      const keys = await this.adapter.list();
      for (const k of keys) {
        if (typeof k === 'string' && k.startsWith(this.prefix)) {
          out.push(k.slice(this.prefix.length));
        }
      }
      return out;
    }

    // Fallback localStorage
    try {
      if (typeof localStorage === 'undefined') return [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LS_PREFIX + this.prefix)) {
          out.push(k.slice((LS_PREFIX + this.prefix).length));
        }
      }
    } catch { /* isola */ }

    return out;
  }

  /**
   * Remove baselines mais antigos se ultrapassar o limite.
   * @private
   */
  async _enforceLimit() {
    const names = await this.list();
    if (names.length <= this.maxBaselines) return;

    const excess = names.slice(this.maxBaselines);
    for (const entry of excess) {
      await this._delete(entry.name);
    }
  }

  // ══════════════════════════════════════════════════════════
  // localStorage fallback
  // ══════════════════════════════════════════════════════════

  /**
   * @private
   */
  _lsGet(key) {
    try {
      if (typeof localStorage === 'undefined') return null;
      const v = localStorage.getItem(LS_PREFIX + key);
      return v === null ? null : String(v);
    } catch {
      return null;
    }
  }

  /**
   * @private
   */
  _lsSet(key, value) {
    try {
      if (typeof localStorage === 'undefined') return false;
      localStorage.setItem(LS_PREFIX + key, String(value));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * @private
   */
  _lsRemove(key) {
    try {
      if (typeof localStorage === 'undefined') return false;
      localStorage.removeItem(LS_PREFIX + key);
      return true;
    } catch {
      return false;
    }
  }

  // ══════════════════════════════════════════════════════════
  // Helpers
  // ══════════════════════════════════════════════════════════

  /**
   * @private
   */
  _keyFor(name) {
    return this.prefix + String(name);
  }

  /**
   * @private
   */
  _assertName(name) {
    if (typeof name !== 'string' || !name) {
      throw new Error('[GoldenBaseline] name obrigatório (string não vazia)');
    }
  }

  /**
   * @private
   */
  _assertMachine(machine) {
    if (!machine || !machine.world || typeof machine.world.allEntities !== 'function') {
      throw new Error('[GoldenBaseline] machine inválido (precisa de .world)');
    }
  }

  /**
   * Diagnóstico: bytes usados por todos os baselines.
   * @returns {Promise<number>}
   */
  async bytesInUse() {
    const names = await this._listNames();
    let bytes = 0;
    for (const name of names) {
      const raw = await this._read(name);
      if (raw) bytes += raw.length;
    }
    return bytes;
  }

  /**
   * Diagnóstico: estatísticas.
   * @returns {Promise<{ count:number, totalBytes:number, names:string[] }>}
   */
  async stats() {
    const names = await this._listNames();
    const bytes = await this.bytesInUse();
    return { count: names.length, totalBytes: bytes, names };
  }
}