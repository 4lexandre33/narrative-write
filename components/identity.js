/**
 * @file identity.js
 * @module components
 * @description Identidade canônica de qualquer entidade.
 * @imports core/constants
 * @importedBy systems/entity-system, systems/identity-system, systems/instantiation-system, ui/*
 * @level 4
 */

import { COMPONENT_NAMES } from '../core/constants.js';

export const IDENTITY = COMPONENT_NAMES.IDENTITY;

/**
 * Cria um Identity canônico.
 * @param {Object} opts
 * @param {string} opts.id — shortcode imutável (ex: 'CHR-KAE')
 * @param {string} opts.name — nome humano
 * @param {string} [opts.description='']
 * @param {string} [opts.type='custom']
 * @returns {Object}
 */
export function makeIdentity({ id, name, description = '', type = 'custom' }) {
  if (!id || typeof id !== 'string') {
    throw new Error('[Identity] id obrigatório (shortcode)');
  }
  if (!name || typeof name !== 'string') {
    throw new Error('[Identity] name obrigatório');
  }
  return {
    id: String(id),
    name: String(name),
    description: String(description || ''),
    type: String(type || 'custom'),
  };
}

/**
 * Verifica se um valor é Identity válido.
 * @param {any} v
 * @returns {boolean}
 */
export function isIdentity(v) {
  return !!v
    && typeof v === 'object'
    && typeof v.id === 'string' && v.id.length > 0
    && typeof v.name === 'string' && v.name.length > 0
    && typeof v.type === 'string';
}

/**
 * Cópia rasa com campos atualizados.
 * @param {Object} identity
 * @param {Object} [patch={}]
 * @returns {Object}
 */
export function updateIdentity(identity, patch = {}) {
  if (!isIdentity(identity)) {
    throw new Error('[Identity] identity inválido');
  }
  return {
    id: identity.id,           // imutável
    name: patch.name ?? identity.name,
    description: patch.description ?? identity.description,
    type: patch.type ?? identity.type,
  };
}