/**
 * @file storage-gm.js
 * @module data
 * @description Adapter Tampermonkey (GM_setValue / GM_getValue / GM_deleteValue / GM_listValues).
 * @imports data/storage, core/constants
 * @importedBy systems/persistence-system
 * @level 2
 */

import { StorageAdapter, StorageError } from './storage.js';
import { STORAGE_LIMITS } from '../core/constants.js';

export class GMStorageAdapter extends StorageAdapter {
  constructor() {
    super('gm');
    /** @type {Map<string, string>} — cache local para operações rápidas */
    this._cache = new Map();
    this._cacheLoaded = false;
  }

  // ── Disponibilidade ─────────────────────────────────────────

  async _checkAvailable() {
    return (
      typeof GM_setValue === 'function' &&
      typeof GM_getValue === 'function' &&
      typeof GM_deleteValue === 'function'
    );
  }

  // ── API principal ───────────────────────────────────────────

  async get(key) {
    this._assertKey(key);

    if (!(await this.isAvailable())) {
      throw new StorageError('[gm] GM API indisponível', { code: 'UNAVAILABLE' });
    }

    try {
      // GM_getValue pode retornar undefined para chave ausente
      const raw = GM_getValue(key);
      if (raw === undefined || raw === null) return null;
      return String(raw);
    } catch (err) {
      throw new StorageError(
        `[gm] falha ao ler "${key}": ${err.message}`,
        { code: 'READ_FAILED', cause: err }
      );
    }
  }

  async set(key, value) {
    this._assertKey(key);
    if (typeof value !== 'string') {
      throw new StorageError('[gm] valor deve ser string', { code: 'INVALID_VALUE' });
    }

    if (!(await this.isAvailable())) {
      throw new StorageError('[gm] GM API indisponível', { code: 'UNAVAILABLE' });
    }

    try {
      GM_setValue(key, value);
      this._cache.set(key, value);
    } catch (err) {
      throw new StorageError(
        `[gm] falha ao escrever "${key}": ${err.message}`,
        { code: 'WRITE_FAILED', cause: err }
      );
    }
  }

  async delete(key) {
    this._assertKey(key);

    if (!(await this.isAvailable())) {
      throw new StorageError('[gm] GM API indisponível', { code: 'UNAVAILABLE' });
    }

    try {
      GM_deleteValue(key);
      this._cache.delete(key);
    } catch (err) {
      throw new StorageError(
        `[gm] falha ao remover "${key}": ${err.message}`,
        { code: 'DELETE_FAILED', cause: err }
      );
    }
  }

  async list() {
    if (!(await this.isAvailable())) {
      throw new StorageError('[gm] GM API indisponível', { code: 'UNAVAILABLE' });
    }

    try {
      if (typeof GM_listValues === 'function') {
        const values = GM_listValues();
        return Array.isArray(values) ? [...values] : [];
      }

      // Fallback: usar cache se disponível
      return Array.from(this._cache.keys());
    } catch (err) {
      throw new StorageError(
        `[gm] falha ao listar: ${err.message}`,
        { code: 'LIST_FAILED', cause: err }
      );
    }
  }

  // ── Diagnóstico ─────────────────────────────────────────────

  getLimit() {
    return STORAGE_LIMITS.gm;
  }

  async getBytesInUse() {
    try {
      const keys = await this.list();
      let bytes = 0;
      for (const k of keys) {
        const v = await this.get(k);
        if (v) bytes += k.length + v.length;
      }
      return bytes;
    } catch {
      return -1;
    }
  }

  // ── Interno ─────────────────────────────────────────────────

  _assertKey(key) {
    if (typeof key !== 'string' || !key) {
      throw new StorageError('[gm] chave inválida', { code: 'INVALID_KEY' });
    }
  }
}