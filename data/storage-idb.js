/**
 * @file storage-idb.js
 * @module data
 * @description Adapter IndexedDB (suporta grandes volumes).
 * @imports data/storage, core/constants
 * @importedBy systems/persistence-system
 * @level 2
 */

import { StorageAdapter, StorageError } from './storage.js';
import { STORAGE_LIMITS } from '../core/constants.js';

const DB_NAME = 'narrative-ecs';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

export class IndexedDBAdapter extends StorageAdapter {
  constructor() {
    super('indexedDB');
    /** @type {IDBDatabase|null} */
    this._db = null;
    /** @type {Promise<IDBDatabase>|null} */
    this._openPromise = null;
  }

  // ── Disponibilidade ─────────────────────────────────────────

  async _checkAvailable() {
    if (typeof indexedDB === 'undefined') return false;
    try {
      await this._open();
      return true;
    } catch {
      return false;
    }
  }

  // ── Conexão ─────────────────────────────────────────────────

  async _open() {
    if (this._db) return this._db;
    if (this._openPromise) return this._openPromise;

    this._openPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      req.onsuccess = () => {
        this._db = req.result;
        this._db.onversionchange = () => {
          this._db?.close();
          this._db = null;
          this._openPromise = null;
        };
        resolve(this._db);
      };

      req.onerror = () => reject(new StorageError(
        `[idb] falha ao abrir: ${req.error?.message}`,
        { code: 'OPEN_FAILED', cause: req.error }
      ));
    });

    return this._openPromise;
  }

  // ── Operações de transação ──────────────────────────────────

  /**
   * Executa uma operação dentro de uma transação.
   * @param {'readonly'|'readwrite'} mode
   * @param {(store: IDBObjectStore) => IDBRequest} operation
   * @returns {Promise<any>}
   * @private
   */
  async _tx(mode, operation) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);

      let req;
      try {
        req = operation(store);
      } catch (err) {
        reject(new StorageError(
          `[idb] erro na operação: ${err.message}`,
          { code: 'OP_FAILED', cause: err }
        ));
        return;
      }

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new StorageError(
        `[idb] erro na transação: ${req.error?.message}`,
        { code: 'TX_FAILED', cause: req.error }
      ));
    });
  }

  // ── API principal ───────────────────────────────────────────

  async get(key) {
    this._assertKey(key);
    try {
      const value = await this._tx('readonly', (store) => store.get(key));
      return value === undefined ? null : String(value);
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new StorageError(
        `[idb] falha ao ler "${key}": ${err.message}`,
        { code: 'READ_FAILED', cause: err }
      );
    }
  }

  async set(key, value) {
    this._assertKey(key);
    if (typeof value !== 'string') {
      throw new StorageError('[idb] valor deve ser string', { code: 'INVALID_VALUE' });
    }
    try {
      await this._tx('readwrite', (store) => store.put(value, key));
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new StorageError(
        `[idb] falha ao escrever "${key}": ${err.message}`,
        { code: 'WRITE_FAILED', cause: err }
      );
    }
  }

  async delete(key) {
    this._assertKey(key);
    try {
      await this._tx('readwrite', (store) => store.delete(key));
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new StorageError(
        `[idb] falha ao remover "${key}": ${err.message}`,
        { code: 'DELETE_FAILED', cause: err }
      );
    }
  }

  async list() {
    try {
      const keys = await this._tx('readonly', (store) => store.getAllKeys());
      return Array.isArray(keys) ? keys.map(String) : [];
    } catch (err) {
      if (err instanceof StorageError) throw err;
      throw new StorageError(
        `[idb] falha ao listar: ${err.message}`,
        { code: 'LIST_FAILED', cause: err }
      );
    }
  }

  // ── Diagnóstico ─────────────────────────────────────────────

  getLimit() {
    return STORAGE_LIMITS.indexedDB;
  }

  async getBytesInUse() {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        // Retorna uso total da origem (não só nosso DB) — aproximação
        return est.usage || -1;
      }
    } catch {
      // fallback abaixo
    }
    return -1;
  }

  // ── Ciclo de vida ───────────────────────────────────────────

  async clear() {
    try {
      await this._tx('readwrite', (store) => store.clear());
    } catch (err) {
      throw new StorageError(
        `[idb] falha ao limpar: ${err.message}`,
        { code: 'CLEAR_FAILED', cause: err }
      );
    }
  }

  async close() {
    if (this._db) {
      this._db.close();
      this._db = null;
      this._openPromise = null;
    }
  }

  // ── Interno ─────────────────────────────────────────────────

  _assertKey(key) {
    if (typeof key !== 'string' || !key) {
      throw new StorageError('[idb] chave inválida', { code: 'INVALID_KEY' });
    }
  }
}