/**
 * @file object.js
 * @module core/utils
 * @description Helpers de objeto — deep clone/equal/merge, freeze.
 * @imports — (nenhum)
 * @importedBy ecs/world, ecs/snapshot, systems/inheritance-system, systems/*
 * @level 0
 */

/**
 * Deep clone robusto. Usa structuredClone quando disponível,
 * fallback para JSON para objetos planos, fallback manual para Map/Set.
 * @template T
 * @param {T} obj
 * @returns {T}
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;

  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(obj);
    } catch {
      // fallback abaixo (structuredClone falha em funções e symbol keys)
    }
  }

  if (obj instanceof Map) {
    const m = new Map();
    for (const [k, v] of obj) m.set(k, deepClone(v));
    return m;
  }

  if (obj instanceof Set) {
    const s = new Set();
    for (const v of obj) s.add(deepClone(v));
    return s;
  }

  if (Array.isArray(obj)) {
    return obj.map(deepClone);
  }

  if (obj instanceof Date) return new Date(obj.getTime());

  const out = {};
  for (const key of Object.keys(obj)) {
    out[key] = deepClone(obj[key]);
  }
  return out;
}

/**
 * Deep equality robusta.
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;

  if (typeof a !== 'object') return a === b;

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) {
      if (!b.has(k)) return false;
      if (!deepEqual(v, b.get(k))) return false;
    }
    return true;
  }

  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const v of a) {
      if (!b.has(v)) return false;
    }
    return true;
  }

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

/**
 * Merge profundo de dois objetos.
 *
 * @param {Object} target
 * @param {Object} source
 * @param {Object} [options]
 * @param {'override'|'additive'|'multiply'|'min'|'max'|'union'|'replace'|'concat'|'prepend'|'append'} [options.strategy='override']
 * @returns {Object} novo objeto (não muta target)
 */
export function deepMerge(target, source, options = {}) {
  const strategy = options.strategy || 'override';

  if (target === null || target === undefined) return deepClone(source);
  if (source === null || source === undefined) return deepClone(target);

  // Arrays
  if (Array.isArray(target) && Array.isArray(source)) {
    return _mergeArray(target, source, strategy);
  }

  // Objetos planos
  if (_isPlainObject(target) && _isPlainObject(source)) {
    const out = {};
    const keys = new Set([...Object.keys(target), ...Object.keys(source)]);

    for (const key of keys) {
      const a = target[key];
      const b = source[key];

      if (key in target && key in source) {
        if (_isPlainObject(a) && _isPlainObject(b)) {
          out[key] = deepMerge(a, b, options);
        } else if (Array.isArray(a) && Array.isArray(b)) {
          out[key] = _mergeArray(a, b, strategy);
        } else {
          out[key] = deepClone(b); // override padrão
        }
      } else if (key in target) {
        out[key] = deepClone(a);
      } else {
        out[key] = deepClone(b);
      }
    }

    // Aplicar strategy em campos numéricos se additive/multiply/min/max
    if (strategy === 'additive' || strategy === 'multiply' || strategy === 'min' || strategy === 'max') {
      for (const key of Object.keys(target)) {
        if (key in source && typeof target[key] === 'number' && typeof source[key] === 'number') {
          out[key] = _applyNumericStrategy(target[key], source[key], strategy);
        }
      }
    }

    return out;
  }

  // Escalares — source ganha (exceto estratégias)
  if (typeof target === 'number' && typeof source === 'number') {
    return _applyNumericStrategy(target, source, strategy);
  }

  return deepClone(source);
}

function _isPlainObject(v) {
  if (v === null || typeof v !== 'object') return false;
  if (Array.isArray(v)) return false;
  if (v instanceof Date || v instanceof Map || v instanceof Set) return false;
  return true;
}

function _mergeArray(a, b, strategy) {
  switch (strategy) {
    case 'union': {
      const seen = new Set();
      const out = [];
      for (const x of a) {
        const k = JSON.stringify(x);
        if (!seen.has(k)) { seen.add(k); out.push(deepClone(x)); }
      }
      for (const x of b) {
        const k = JSON.stringify(x);
        if (!seen.has(k)) { seen.add(k); out.push(deepClone(x)); }
      }
      return out;
    }
    case 'replace':
      return deepClone(b);
    case 'prepend':
      return [...deepClone(b), ...deepClone(a)];
    case 'append':
      return [...deepClone(a), ...deepClone(b)];
    default:
      return deepClone(b);
  }
}

function _applyNumericStrategy(a, b, strategy) {
  switch (strategy) {
    case 'additive':  return a + b;
    case 'multiply':  return a * b;
    case 'min':       return Math.min(a, b);
    case 'max':       return Math.max(a, b);
    case 'override':  return b;
    default:          return b;
  }
}

/**
 * Congela recursivamente um objeto.
 * @template T
 * @param {T} obj
 * @returns {T}
 */
export function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Object.isFrozen(obj)) return obj;

  Object.freeze(obj);

  if (obj instanceof Map) {
    for (const v of obj.values()) deepFreeze(v);
    return obj;
  }
  if (obj instanceof Set) {
    for (const v of obj.values()) deepFreeze(v);
    return obj;
  }

  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key]);
  }
  return obj;
}

/**
 * Congela apenas o objeto de topo (não recursivo).
 * @template T
 * @param {T} obj
 * @returns {T}
 */
export function shallowFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  return Object.freeze(obj);
}

/**
 * Pega um valor de um objeto por path pontilhado.
 * Ex: getPath(obj, 'stats.fear') → obj.stats.fear
 * @param {Object} obj
 * @param {string} path
 * @returns {any}
 */
export function getPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = String(path).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

/**
 * Define um valor num objeto por path pontilhado.
 * Cria objetos intermediários se necessário.
 * @param {Object} obj
 * @param {string} path
 * @param {any} value
 */
export function setPath(obj, path, value) {
  if (!obj || !path) return;
  const parts = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] === null || cur[p] === undefined || typeof cur[p] !== 'object') {
      cur[p] = {};
    }
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

/**
 * Deleta um valor por path pontilhado.
 * @param {Object} obj
 * @param {string} path
 */
export function deletePath(obj, path) {
  if (!obj || !path) return;
  const parts = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur = cur?.[parts[i]];
    if (!cur) return;
  }
  delete cur[parts[parts.length - 1]];
}

/**
 * Conta chaves próprias de um objeto (não-inherited).
 * @param {Object} obj
 * @returns {number}
 */
export function countKeys(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  return Object.keys(obj).length;
}

/**
 * Retorna apenas as chaves cujos valores diferem entre dois objetos.
 * (comparação rasa)
 * @param {Object} a
 * @param {Object} b
 * @returns {string[]}
 */
export function diffKeys(a, b) {
  const keys = new Set([
    ...Object.keys(a || {}),
    ...Object.keys(b || {}),
  ]);
  const out = [];
  for (const k of keys) {
    if (!deepEqual(a?.[k], b?.[k])) out.push(k);
  }
  return out;
}