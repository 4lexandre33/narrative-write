/**
 * @file mode.js
 * @module narrative-language
 * @description Leitura/escrita do modo narrativo atual, com fallback
 *              defensivo. Persiste em localStorage. Nunca lança.
 * @imports core/constants (NARRATIVE_STORAGE_KEYS),
 *          narrative-language/config (MODES, DEFAULT_MODE, isModeValid)
 * @importedBy narrative-language/index,
 *             systems/narrative-system,
 *             ui/narrative-overlay,
 *             boot.js (leitura do modo no boot)
 * @level N0
 *
 * Contrato:
 *   - readMode() sempre devolve um modo válido. Nunca null/undefined.
 *   - writeMode(mode) devolve boolean. Nunca lança.
 *   - Em ambiente sem localStorage (Node/testes), funciona em memória.
 */

import { NARRATIVE_STORAGE_KEYS } from '../core/constants.js';
import { MODES, DEFAULT_MODE, isModeValid } from './config.js';

// ══════════════════════════════════════════════════════════════
// BACKING STORE
// ══════════════════════════════════════════════════════════════

/**
 * Fallback em memória para ambientes sem localStorage.
 * @type {Map<string, string>}
 * @private
 */
const _memStore = new Map();

/**
 * Detecta se localStorage está disponível e funcional.
 * @returns {boolean}
 * @private
 */
function _hasLocalStorage() {
  try {
    if (typeof localStorage === 'undefined') return false;
    const probe = '__narr_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lê uma chave do storage disponível.
 * @param {string} key
 * @returns {string|null}
 * @private
 */
function _get(key) {
  try {
    if (_hasLocalStorage()) {
      return localStorage.getItem(key);
    }
    return _memStore.get(key) ?? null;
  } catch {
    return null;
  }
}

/**
 * Grava uma chave no storage disponível.
 * @param {string} key
 * @param {string} value
 * @returns {boolean}
 * @private
 */
function _set(key, value) {
  try {
    if (_hasLocalStorage()) {
      localStorage.setItem(key, value);
      return true;
    }
    _memStore.set(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove uma chave do storage disponível.
 * @param {string} key
 * @returns {boolean}
 * @private
 */
function _remove(key) {
  try {
    if (_hasLocalStorage()) {
      localStorage.removeItem(key);
      return true;
    }
    _memStore.delete(key);
    return true;
  } catch {
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
// API PÚBLICA
// ══════════════════════════════════════════════════════════════

/**
 * Lê o modo atual. Sempre devolve um modo válido.
 *
 * Ordem de resolução:
 *   1. localStorage / memória
 *   2. DEFAULT_MODE se ausente ou inválido
 *
 * @returns {string} — 'off' | 'preview' | 'suggest' | 'auto'
 */
export function readMode() {
  const raw = _get(NARRATIVE_STORAGE_KEYS.MODE);
  if (!raw) return DEFAULT_MODE;
  return isModeValid(raw) ? raw : DEFAULT_MODE;
}

/**
 * Grava o modo atual. Idempotente.
 *
 * @param {string} mode
 * @returns {boolean} — true se gravou (ou já estava); false se inválido
 */
export function writeMode(mode) {
  if (!isModeValid(mode)) return false;
  return _set(NARRATIVE_STORAGE_KEYS.MODE, mode);
}

/**
 * Remove o modo persistido. `readMode()` passa a devolver DEFAULT_MODE.
 * @returns {boolean}
 */
export function clearMode() {
  return _remove(NARRATIVE_STORAGE_KEYS.MODE);
}

/**
 * Ciclo canônico de modos:
 *   off → preview → suggest → auto → off → ...
 *
 * @param {string} current
 * @returns {string} — próximo modo
 */
export function nextMode(current) {
  const idx = MODES.indexOf(current);
  if (idx < 0) return DEFAULT_MODE;
  return MODES[(idx + 1) % MODES.length];
}

/**
 * Rótulo curto para exibição em UI.
 * @param {string} mode
 * @returns {string} — 'OFF' | 'PRV' | 'SUG' | 'AUTO' | '?'
 */
export function modeLabel(mode) {
  switch (mode) {
    case 'off':     return 'OFF';
    case 'preview': return 'PRV';
    case 'suggest': return 'SUG';
    case 'auto':    return 'AUTO';
    default:        return '?';
  }
}

/**
 * Rótulo longo (para toasts, painéis).
 * @param {string} mode
 * @returns {string}
 */
export function modeDescription(mode) {
  switch (mode) {
    case 'off':     return 'Narrativa desativada';
    case 'preview': return 'Preview — análise visível, sem mutação';
    case 'suggest': return 'Suggest — propostas com aprovação manual';
    case 'auto':    return 'Auto — aplicação automática (confiança > 0.95)';
    default:        return 'Modo desconhecido';
  }
}

/**
 * Verifica se um modo pode emitir mutações.
 * @param {string} mode
 * @returns {boolean}
 */
export function canMutate(mode) {
  return mode === 'suggest' || mode === 'auto';
}

/**
 * Verifica se um modo produz análise (mesmo sem mutação).
 * @param {string} mode
 * @returns {boolean}
 */
export function canAnalyze(mode) {
  return mode !== 'off';
}

/**
 * Reset defensivo para testes. Limpa memória e storage persistido.
 * @internal
 */
export function _resetForTests() {
  _memStore.clear();
  try {
    if (_hasLocalStorage()) {
      localStorage.removeItem(NARRATIVE_STORAGE_KEYS.MODE);
    }
  } catch { /* isola */ }
}