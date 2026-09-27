/**
 * @file storage-sheets.js
 * @module data
 * @description Adapter Google Sheets via Apps Script Web App (fetch).
 * @imports data/storage, core/constants
 * @importedBy systems/persistence-system, boot.js
 * @level 2
 *
 * Configuração em runtime:
 *   - URL do Web App e API key podem ser definidas via `setWebAppUrl()` e
 *     `setApiKey()`, ou carregadas de localStorage via `loadConfigFromStorage()`.
 *   - Por padrão, `autoLoad = true` faz o constructor tentar carregar do
 *     localStorage automaticamente (chaves: `narr:config:sheets:url` e
 *     `narr:config:sheets:key`).
 *   - `setWebAppUrl` / `setApiKey` persistem automaticamente em localStorage
 *     (desativável com `{ persist: false }`).
 *   - `clearConfig()` remove tudo do localStorage e reseta o estado interno.
 */

import { StorageAdapter, StorageError } from './storage.js';
import { STORAGE_LIMITS, STORAGE_KEYS } from '../core/constants.js';

// ── Chaves de configuração persistida ─────────────────────────
const CONFIG_PREFIX = 'narr:';
const CONFIG_KEYS = Object.freeze({
  URL: `${CONFIG_PREFIX}${STORAGE_KEYS.CONFIG_PREFIX}sheets:url`,
  KEY: `${CONFIG_PREFIX}${STORAGE_KEYS.CONFIG_PREFIX}sheets:key`,
});

export class SheetsStorageAdapter extends StorageAdapter {
  /**
   * @param {Object} opts
   * @param {string} [opts.webAppUrl=''] — URL do Google Apps Script Web App
   * @param {string} [opts.apiKey=''] — chave opcional de autenticação
   * @param {number} [opts.timeout=10000] — timeout por requisição (ms)
   * @param {boolean} [opts.autoLoad=true] — carrega config do localStorage no construct
   */
  constructor({
    webAppUrl = '',
    apiKey = '',
    timeout = 10_000,
    autoLoad = true,
  } = {}) {
    super('sheets');
    this.webAppUrl = webAppUrl;
    this.apiKey = apiKey;
    this.timeout = timeout;

    /** @type {Map<string, string>} — cache write-through */
    this._cache = new Map();

    if (autoLoad && !this.webAppUrl) {
      this.loadConfigFromStorage();
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Configuração
  // ═══════════════════════════════════════════════════════════

  /**
   * Define a URL do Web App.
   * @param {string} url
   * @param {Object} [opts={}]
   * @param {boolean} [opts.persist=true] — salva em localStorage
   */
  setWebAppUrl(url, { persist = true } = {}) {
    this.webAppUrl = String(url || '');
    this._available = null;
    this._cache.clear();
    if (persist) this._storageSet(CONFIG_KEYS.URL, this.webAppUrl);
  }

  /**
   * Define a API key.
   * @param {string} key
   * @param {Object} [opts={}]
   * @param {boolean} [opts.persist=true] — salva em localStorage
   */
  setApiKey(key, { persist = true } = {}) {
    this.apiKey = String(key || '');
    if (persist) this._storageSet(CONFIG_KEYS.KEY, this.apiKey);
  }

  /**
   * Carrega URL e API key do localStorage.
   * Não lança — silenciosamente ignora se localStorage indisponível.
   * @returns {{ url:boolean, key:boolean }} — quais foram carregados
   */
  loadConfigFromStorage() {
    const url = this._storageGet(CONFIG_KEYS.URL);
    const key = this._storageGet(CONFIG_KEYS.KEY);

    if (url) {
      this.webAppUrl = url;
      this._available = null;
      this._cache.clear();
    }
    if (key) {
      this.apiKey = key;
    }
    return { url: !!url, key: !!key };
  }

  /**
   * Persiste a config atual no localStorage.
   * @returns {{ url:boolean, key:boolean }} — quais foram salvos
   */
  saveConfigToStorage() {
    const okUrl = this._storageSet(CONFIG_KEYS.URL, this.webAppUrl);
    const okKey = this._storageSet(CONFIG_KEYS.KEY, this.apiKey);
    return { url: okUrl, key: okKey };
  }

  /**
   * Remove config do localStorage e reseta o estado interno.
   */
  clearConfig() {
    this._storageRemove(CONFIG_KEYS.URL);
    this._storageRemove(CONFIG_KEYS.KEY);
    this.webAppUrl = '';
    this.apiKey = '';
    this._available = null;
    this._cache.clear();
  }

  /**
   * Verifica se há config mínima para funcionar.
   * @returns {boolean}
   */
  isConfigured() {
    return !!this.webAppUrl;
  }

  // ═══════════════════════════════════════════════════════════
  // Disponibilidade
  // ═══════════════════════════════════════════════════════════

  async _checkAvailable() {
    if (!this.webAppUrl) return false;
    if (typeof fetch !== 'function') return false;
    try {
      const res = await this._fetch('ping');
      return res?.ok === true;
    } catch {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // API principal
  // ═══════════════════════════════════════════════════════════

  async get(key) {
    this._assertKey(key);

    // Write-through cache
    if (this._cache.has(key)) return this._cache.get(key);

    try {
      const res = await this._fetch('get', { key });
      if (!res || !res.ok) return null;

      const value = typeof res.value === 'string' ? res.value : null;
      if (value !== null) this._cache.set(key, value);
      return value;
    } catch (err) {
      throw new StorageError(
        `[sheets] falha ao ler "${key}": ${err.message}`,
        { code: 'READ_FAILED', cause: err }
      );
    }
  }

  async set(key, value) {
    this._assertKey(key);
    if (typeof value !== 'string') {
      throw new StorageError('[sheets] valor deve ser string', { code: 'INVALID_VALUE' });
    }

    try {
      const res = await this._fetch('set', { key, value }, 'POST');
      if (!res || !res.ok) {
        throw new Error(res?.error || 'resposta inválida');
      }
      this._cache.set(key, value);
    } catch (err) {
      throw new StorageError(
        `[sheets] falha ao escrever "${key}": ${err.message}`,
        { code: 'WRITE_FAILED', cause: err }
      );
    }
  }

  async delete(key) {
    this._assertKey(key);
    try {
      const res = await this._fetch('delete', { key }, 'POST');
      if (!res || !res.ok) {
        throw new Error(res?.error || 'resposta inválida');
      }
      this._cache.delete(key);
    } catch (err) {
      throw new StorageError(
        `[sheets] falha ao remover "${key}": ${err.message}`,
        { code: 'DELETE_FAILED', cause: err }
      );
    }
  }

  async list() {
    try {
      const res = await this._fetch('list');
      if (!res || !res.ok) return [];
      return Array.isArray(res.keys) ? res.keys.map(String) : [];
    } catch (err) {
      throw new StorageError(
        `[sheets] falha ao listar: ${err.message}`,
        { code: 'LIST_FAILED', cause: err }
      );
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Diagnóstico
  // ═══════════════════════════════════════════════════════════

  getLimit() {
    return STORAGE_LIMITS.sheets;
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

  // ═══════════════════════════════════════════════════════════
  // Ciclo de vida
  // ═══════════════════════════════════════════════════════════

  /**
   * Limpa o cache local (não o servidor).
   */
  clearCache() {
    this._cache.clear();
  }

  // ═══════════════════════════════════════════════════════════
  // Internos
  // ═══════════════════════════════════════════════════════════

  /**
   * Executa uma requisição ao Web App.
   * @param {string} action
   * @param {Object} [params]
   * @param {'GET'|'POST'} [method='GET']
   * @returns {Promise<Object>}
   * @private
   */
  async _fetch(action, params = {}, method = 'GET') {
    if (!this.webAppUrl) {
      throw new Error('webAppUrl não configurada');
    }

    const controller = typeof AbortController !== 'undefined'
      ? new AbortController()
      : null;

    const timeoutId = controller
      ? setTimeout(() => controller.abort(), this.timeout)
      : null;

    try {
      let url = this.webAppUrl;
      let body = null;

      const payload = {
        action,
        ...params,
        ...(this.apiKey ? { apiKey: this.apiKey } : {}),
      };

      if (method === 'GET') {
        const qs = new URLSearchParams(payload).toString();
        url = `${url}${url.includes('?') ? '&' : '?'}${qs}`;
      } else {
        body = JSON.stringify(payload);
      }

      const res = await fetch(url, {
        method,
        headers: method === 'POST'
          ? { 'Content-Type': 'application/json' }
          : undefined,
        body,
        signal: controller?.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      return data;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  _assertKey(key) {
    if (typeof key !== 'string' || !key) {
      throw new StorageError('[sheets] chave inválida', { code: 'INVALID_KEY' });
    }
  }

  // ── Helpers de localStorage (defensivos) ────────────────────

  /**
   * Lê do localStorage sem lançar.
   * @param {string} key
   * @returns {string|null}
   * @private
   */
  _storageGet(key) {
    try {
      if (typeof localStorage === 'undefined') return null;
      const v = localStorage.getItem(key);
      return v === null ? null : String(v);
    } catch {
      return null;
    }
  }

  /**
   * Escreve no localStorage sem lançar.
   * @param {string} key
   * @param {string} value
   * @returns {boolean}
   * @private
   */
  _storageSet(key, value) {
    try {
      if (typeof localStorage === 'undefined') return false;
      localStorage.setItem(key, String(value ?? ''));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove do localStorage sem lançar.
   * @param {string} key
   * @returns {boolean}
   * @private
   */
  _storageRemove(key) {
    try {
      if (typeof localStorage === 'undefined') return false;
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }
}