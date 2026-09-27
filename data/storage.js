/**
 * @file storage.js
 * @module data
 * @description Contrato abstrato de storage. Implementações: storage-gm, storage-idb, storage-ls, storage-sheets.
 * @imports — (nenhum)
 * @importedBy data/storage-gm, data/storage-idb, data/storage-ls, data/storage-sheets
 * @level 1
 */

/**
 * Erro específico de storage.
 */
export class StorageError extends Error {
  constructor(message, { code, cause } = {}) {
    super(message);
    this.name = 'StorageError';
    this.code = code || 'UNKNOWN';
    this.cause = cause;
  }
}

/**
 * Classe base abstrata de storage.
 *
 * Contrato:
 *   - Todos os métodos são async.
 *   - Chaves são strings não-vazias.
 *   - Valores são strings (JSON ou binário codificado).
 *   - Implementações devem ser idempotentes.
 *   - Métodos de leitura retornam null se chave ausente.
 */
export class StorageAdapter {
  constructor(name = 'unknown') {
    if (new.target === StorageAdapter) {
      throw new TypeError('[StorageAdapter] classe abstrata — use uma subclasse');
    }
    this.name = name;
    this._available = null;
  }

  // ── Disponibilidade ─────────────────────────────────────────

  async isAvailable() {
    if (this._available !== null) return this._available;
    try {
      this._available = await this._checkAvailable();
    } catch {
      this._available = false;
    }
    return this._available;
  }

  async _checkAvailable() {
    return false;
  }

  // ── Leitura / Escrita ───────────────────────────────────────

  async get(_key) {
    throw new StorageError(`[${this.name}] get() não implementado`, { code: 'NOT_IMPLEMENTED' });
  }

  async set(_key, _value) {
    throw new StorageError(`[${this.name}] set() não implementado`, { code: 'NOT_IMPLEMENTED' });
  }

  async delete(_key) {
    throw new StorageError(`[${this.name}] delete() não implementado`, { code: 'NOT_IMPLEMENTED' });
  }

  async list() {
    throw new StorageError(`[${this.name}] list() não implementado`, { code: 'NOT_IMPLEMENTED' });
  }

  // ── Diagnóstico ─────────────────────────────────────────────

  async getBytesInUse() {
    return -1;
  }

  async hasSpaceFor(_n) {
    return true;
  }

  getLimit() {
    return -1;
  }

  // ── Ciclo de vida ───────────────────────────────────────────

  async clear() {
    const keys = await this.list();
    for (const k of keys) {
      await this.delete(k);
    }
  }

  async close() {
    // no-op por padrão
  }
}