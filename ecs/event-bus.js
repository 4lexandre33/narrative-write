/**
 * @file event-bus.js
 * @module ecs
 * @description Pub/sub síncrono com wildcard '*' e isolamento de erros.
 * @imports — (nenhum)
 * @importedBy ecs/world, ecs/link-index, context-machine/machine,
 *             todos os systems, ui/*
 * @level 1
 *
 * Fase 13.7 — Limpeza (auditoria 25/09/2026):
 *   Removido `_emitDepth` (M-9). Era incrementado em `emit` mas nunca
 *   lido por ninguém. Se no futuro for necessário detectar emissão
 *   re-entrante, será reintroduzido com consumidor explícito.
 */

export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
    /** @type {number} */
    this._totalEmits = 0;
  }

  // ── Registro ────────────────────────────────────────────────

  /**
   * Registra um handler para um evento.
   * @param {string} event
   * @param {Function} handler
   * @returns {Function} unsubscribe
   */
  on(event, handler) {
    if (typeof event !== 'string' || !event) {
      throw new TypeError('[EventBus] evento inválido');
    }
    if (typeof handler !== 'function') {
      throw new TypeError('[EventBus] handler deve ser função');
    }

    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);

    return () => this.off(event, handler);
  }

  /**
   * Registra um handler que dispara apenas uma vez.
   * @param {string} event
   * @param {Function} handler
   * @returns {Function} unsubscribe
   */
  once(event, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('[EventBus] handler deve ser função');
    }

    const wrapped = (payload) => {
      this.off(event, wrapped);
      handler(payload);
    };

    return this.on(event, wrapped);
  }

  /**
   * Remove um handler específico.
   * @param {string} event
   * @param {Function} handler
   * @returns {boolean} true se removido
   */
  off(event, handler) {
    const set = this.listeners.get(event);
    if (!set) return false;

    const removed = set.delete(handler);
    if (set.size === 0) {
      this.listeners.delete(event);
    }
    return removed;
  }

  // ── Emissão ─────────────────────────────────────────────────

  /**
   * Emite um evento para todos os handlers registrados.
   * Erros de handlers são isolados (não quebram o emit).
   * Wildcard '*' recebe todos os eventos.
   * @param {string} event
   * @param {any} [payload]
   */
  emit(event, payload) {
    if (typeof event !== 'string' || !event) return;

    this._totalEmits++;

    // 1. Handlers do evento específico
    const set = this.listeners.get(event);
    if (set && set.size > 0) {
      const handlers = Array.from(set);
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (err) {
          console.error(`[EventBus] erro em handler de "${event}":`, err);
        }
      }
    }

    // 2. Wildcard handlers
    const wild = this.listeners.get('*');
    if (wild && wild.size > 0) {
      const handlers = Array.from(wild);
      for (const handler of handlers) {
        try {
          handler({ event, payload });
        } catch (err) {
          console.error('[EventBus] erro em wildcard handler:', err);
        }
      }
    }
  }

  // ── Consultas ───────────────────────────────────────────────

  /**
   * Conta handlers registrados para um evento.
   * @param {string} event
   * @returns {number}
   */
  count(event) {
    return this.listeners.get(event)?.size ?? 0;
  }

  /**
   * Verifica se há pelo menos um handler para um evento.
   * @param {string} event
   * @returns {boolean}
   */
  has(event) {
    return this.count(event) > 0;
  }

  /**
   * Lista todos os eventos com handlers registrados.
   * @returns {string[]}
   */
  events() {
    return Array.from(this.listeners.keys());
  }

  /**
   * Número total de handlers (soma de todos os eventos).
   * @returns {number}
   */
  size() {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }

  /**
   * Total de eventos emitidos desde criação ou último reset.
   * @returns {number}
   */
  totalEmits() {
    return this._totalEmits;
  }

  // ── Ciclo de vida ───────────────────────────────────────────

  /**
   * Remove todos os listeners de um evento.
   * Se event omitido, limpa tudo.
   * @param {string} [event]
   */
  clear(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Reseta contadores sem remover listeners.
   */
  resetCounters() {
    this._totalEmits = 0;
  }

  /**
   * Destrói o bus — limpa listeners e zera contadores.
   */
  destroy() {
    this.listeners.clear();
    this._totalEmits = 0;
  }
}