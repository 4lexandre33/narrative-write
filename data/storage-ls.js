/**
 * @file storage-ls.js
 * @module data
 * @description Adapter localStorage (browser padrão).
 * @imports data/storage, core/constants
 * @importedBy systems/persistence-system
 * @level 2
 */

import { StorageAdapter, StorageError } from './storage.js';
import { STORAGE_LIMITS } from '../core/constants.js';

const LS_PREFIX = 'narr:';

export class LocalStorageAdapter extends StorageAdapter {
  constructor() {
    super('localStorage');
  }

  // ── Disponibilidade ─────────────────────────────────────────

  async _checkAvailable() {
    try {
      if (typeof localStorage === 'undefined') return false;
      const probe = `${LS_PREFIX}__probe__`;
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  }

  // ── API principal ───────────────────────────────────────────

  async get(key) {
    this._assertKey(key);
    if (!(await this.isAvailable())) {
      throw new StorageError('[ls] localStorage indisponível', { code: 'UNAVAILABLE' });
    }

    try {
      const raw = localStorage.getItem(this._k(key));
      return raw === null ? null : raw;
    } catch (err) {
      throw new StorageError(
        `[ls] falha ao ler "${key}": ${err.message}`,
        { code: 'READ_FAILED', cause: err }
      );
    }
  }

  async set(key, value) {
    this._assertKey(key);
    if (typeof value !== 'string') {
      throw new StorageError('[ls] valor deve ser string', { code: 'INVALID_VALUE' });
    }

    if (!(await this.isAvailable())) {
      throw new StorageError('[ls] localStorage indisponível', { code: 'UNAVAILABLE' });
    }

    try {
      localStorage.setItem(this._k(key), value);
    } catch (err) {
      // QuotaExceededError tem nome específico
      if (err.name === 'QuotaExceededError') {
        throw new StorageError(
          `[ls] quota excedida ao escrever "${key}"`,
          { code: 'QUOTA_EXCEEDED', cause: err }
        );
      }
      throw new StorageError(
        `[ls] falha ao escrever "${key}": ${err.message}`,
        { code: 'WRITE_FAILED', cause: err }
      );
    }
  }

  async delete(key) {
    this._assertKey(key);
    if (!(await this.isAvailable())) {
      throw new StorageError('[ls] localStorage indisponível', { code: 'UNAVAILABLE' });
    }

    try {
      localStorage.removeItem(this._k(key));
    } catch (err) {
      throw new StorageError(
        `[ls] falha ao remover "${key}": ${err.message}`,
        { code: 'DELETE_FAILED', cause: err }
      );
    }
  }

  async list() {
    if (!(await this.isAvailable())) {
      throw new StorageError('[ls] localStorage indisponível', { code: 'UNAVAILABLE' });
    }

    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LS_PREFIX)) {
          keys.push(k.slice(LS_PREFIX.length));
        }
      }
      return keys;
    } catch (err) {
      throw new StorageError(
        `[ls] falha ao listar: ${err.message}`,
        { code: 'LIST_FAILED', cause: err }
      );
    }
  }

  // ── Diagnóstico ─────────────────────────────────────────────

  getLimit() {
    return STORAGE_LIMITS.localStorage;
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
      throw new StorageError('[ls] chave inválida', { code: 'INVALID_KEY' });
    }
  }

  _k(key) {
    return LS_PREFIX + key;
  }
}