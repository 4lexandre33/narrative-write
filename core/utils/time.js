/**
 * @file time.js
 * @module core/utils
 * @description Helpers de tempo — tick↔número, formatação, ISO.
 * @imports core/constants (TICK_PREFIX)
 * @importedBy ecs/snapshot, systems/timeline-system, ui/*
 * @level 0
 */

import { TICK_PREFIX } from '../constants.js';

/**
 * Retorna o timestamp atual em ISO 8601.
 * @returns {string}
 */
export function nowISO() {
  return new Date().toISOString();
}

/**
 * Converte um tick 'T42' para número 42.
 * Retorna 0 se inválido.
 * @param {string|number} tick
 * @returns {number}
 */
export function tickToNumber(tick) {
  if (typeof tick === 'number') return tick;
  if (typeof tick !== 'string') return 0;
  const s = tick.startsWith(TICK_PREFIX) ? tick.slice(TICK_PREFIX.length) : tick;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Converte um número 42 para tick 'T42'.
 * @param {number} n
 * @returns {string}
 */
export function numberToTick(n) {
  const num = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  return `${TICK_PREFIX}${num}`;
}

/**
 * Compara dois ticks. Retorna -1, 0, 1.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareTicks(a, b) {
  const na = tickToNumber(a);
  const nb = tickToNumber(b);
  return na < nb ? -1 : na > nb ? 1 : 0;
}

/**
 * Formata duração em ms para string legível.
 * Ex: 350 → '350ms', 1500 → '1.5s', 90000 → '1m 30s'
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1000) return `${Math.round(n)}ms`;
  const s = n / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const min = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${min}m ${rem}s`;
}

/**
 * Formata ISO timestamp para exibição amigável.
 * Ex: '2026-09-22T15:45:00Z' → '22/09/2026 15:45'
 * @param {string|Date} iso
 * @returns {string}
 */
export function formatDate(iso) {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const pad = (x) => String(x).padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${day}/${month}/${year} ${hh}:${mm}`;
}

/**
 * Retorna timestamp em ms, ou o próprio número se já for.
 * @param {string|number|Date} t
 * @returns {number}
 */
export function toMs(t) {
  if (typeof t === 'number') return t;
  if (t instanceof Date) return t.getTime();
  const d = new Date(t);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Verifica se um timestamp é mais antigo que um limiar (em ms).
 * @param {string|number|Date} t
 * @param {number} thresholdMs
 * @returns {boolean}
 */
export function isOlderThan(t, thresholdMs) {
  return (Date.now() - toMs(t)) > thresholdMs;
}

/**
 * Verifica se um timestamp é mais recente que um limiar (em ms).
 * @param {string|number|Date} t
 * @param {number} thresholdMs
 * @returns {boolean}
 */
export function isNewerThan(t, thresholdMs) {
  return (Date.now() - toMs(t)) < thresholdMs;
}

/**
 * Formata "há X tempo" a partir de um timestamp.
 * @param {string|number|Date} t
 * @returns {string}
 */
export function formatRelative(t) {
  const diff = Date.now() - toMs(t);
  if (diff < 0) return 'no futuro';
  if (diff < 1000) return 'agora';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}