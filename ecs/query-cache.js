/**
 * @file query-cache.js
 * @module ecs
 * @description Cache LRU de queries parseadas. Reduz custo de parse repetido.
 * @imports ecs/query-parser
 * @importedBy ecs/world
 * @level 2
 */

import { parseQuery } from './query-parser.js';

export class QueryCache {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.maxSize=256] — número máximo de entradas em cache
   */
  constructor({ maxSize = 256 } = {}) {
    /** @type {Map<string, {must:string[],mustNot:string[]}>} */
    this.cache = new Map();
    this.maxSize = Math.max(1, maxSize);
    /** @type {number} */
    this._hits = 0;
    /** @type {number} */
    this._misses = 0;
  }

  // ── API principal ───────────────────────────────────────────

  /**
   * Parseia uma expressão, retornando do cache se possível.
   * @param {string} expr
   * @returns {{must: string[], mustNot: string[]}}
   */
  parse(expr) {
    if (this.cache.has(expr)) {
      this._hits++;
      const value = this.cache.get(expr);
      // LRU refresh: move para o fim
      this.cache.delete(expr);
      this.cache.set(expr, value);
      return value;
    }

    this._misses++;
    const parsed = parseQuery(expr);
    this.cache.set(expr, parsed);

    // Eviction LRU
    if (this.cache.size > this.maxSize) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }

    return parsed;
  }

  /**
   * Verifica se uma expressão já está em cache.
   * @param {string} expr
   * @returns {boolean}
   */
  has(expr) {
    return this.cache.has(expr);
  }

  /**
   * Remove uma entrada específica.
   * @param {string} expr
   * @returns {boolean}
   */
  invalidate(expr) {
    return this.cache.delete(expr);
  }

  // ── Métricas ────────────────────────────────────────────────

  /**
   * Número de entradas atualmente em cache.
   * @returns {number}
   */
  size() {
    return this.cache.size;
  }

  /**
   * Estatísticas de uso.
   * @returns {{size:number, maxSize:number, hits:number, misses:number, hitRate:number}}
   */
  stats() {
    const total = this._hits + this._misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this._hits,
      misses: this._misses,
      hitRate: total > 0 ? this._hits / total : 0,
    };
  }

  // ── Ciclo de vida ───────────────────────────────────────────

  /**
   * Limpa todas as entradas (mantém contadores).
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Reseta contadores de hit/miss.
   */
  resetCounters() {
    this._hits = 0;
    this._misses = 0;
  }

  /**
   * Limpa tudo — entradas e contadores.
   */
  destroy() {
    this.cache.clear();
    this._hits = 0;
    this._misses = 0;
  }
}