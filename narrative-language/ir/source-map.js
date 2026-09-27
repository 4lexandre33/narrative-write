/**
 * @file source-map.js
 * @module narrative-language/ir
 * @description Mapa bidirecional entre offsets no texto original e nós do IR.
 *              Permite navegar do texto para o act que o originou e vice-versa.
 * @imports — (nenhum)
 * @importedBy narrative-language/pipeline/interpreter,
 *             narrative-language/index,
 *             narrative-language/diagnostics/trace (F8),
 *             ui/narrative-overlay (F6)
 * @level N1
 *
 * Contrato:
 *   buildSourceMap(acts, originalText) → SourceMap
 *   actToSource(actId, map)            → SourceSpan | null
 *   sourceToAct(offset, map)           → actId | null
 *   sourceToActs(offset, map)          → actId[]      (múltiplos atos podem
 *                                                     compartilhar offset)
 *   spanKeyFor(sentenceId, tokenIndex) → string
 *   stats(map)                         → Object
 *
 * Determinismo: para o mesmo texto + mesmos acts, o map é deep-equal.
 * Nenhuma ordenação não-determinística.
 *
 * Nunca lança. Entrada degenerada devolve SourceMap vazio mas estruturalmente
 * válido.
 */

// ══════════════════════════════════════════════════════════════
// TYPEDEFS
// ══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} SourceSpan
 * @property {number} start
 * @property {number} end
 * @property {number} line
 * @property {number} column
 * @property {string} raw
 */

/**
 * @typedef {Object} SourceMap
 * @property {Map<string, SourceSpan>} byAct      — actId → span
 * @property {Map<string, string[]>}  byOffset    — offset inicial → actIds
 * @property {Map<string, string>}    bySpanKey   — spanKey → actId
 * @property {string} text
 * @property {number} textLength
 * @property {Object} stats
 */

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * Sanitiza um span. Devolve null se inválido.
 * @param {any} span
 * @returns {SourceSpan|null}
 * @private
 */
function _sanitizeSpan(span) {
  if (!span || typeof span !== 'object') return null;
  if (typeof span.start !== 'number' || span.start < 0) return null;
  if (typeof span.end !== 'number' || span.end < span.start) return null;
  return {
    start: span.start,
    end: span.end,
    line: typeof span.line === 'number' ? span.line : 1,
    column: typeof span.column === 'number' ? span.column : 0,
    raw: typeof span.raw === 'string' ? span.raw : '',
  };
}

/**
 * Faz binary search no array de offsets ordenados.
 * Devolve o índice do maior offset ≤ target, ou -1.
 *
 * @param {number[]} sorted
 * @param {number} target
 * @returns {number}
 * @private
 */
function _binarySearchLE(sorted, target) {
  let lo = 0;
  let hi = sorted.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= target) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result;
}

/**
 * Verifica se um offset está dentro de um span.
 * @param {number} offset
 * @param {SourceSpan} span
 * @returns {boolean}
 * @private
 */
function _inSpan(offset, span) {
  if (!span) return false;
  return offset >= span.start && offset < span.end;
}

// ══════════════════════════════════════════════════════════════
// CONSTRUÇÃO
// ══════════════════════════════════════════════════════════════

/**
 * Constrói um SourceMap a partir de uma lista de acts.
 *
 * @param {Array} acts           — NarrativeAct[]
 * @param {string} [originalText=''] — texto original (opcional, mas recomendado)
 * @returns {SourceMap}
 */
export function buildSourceMap(acts, originalText = '') {
  const byAct = new Map();
  const byOffset = new Map();
  const bySpanKey = new Map();
  const text = String(originalText ?? '');

  if (!Array.isArray(acts)) {
    return _emptyMap(text);
  }

  for (const act of acts) {
    if (!act || typeof act.id !== 'string' || !act.id) continue;

    const span = _sanitizeSpan(act.source);
    if (!span) continue;

    byAct.set(act.id, span);

    // Índice por offset inicial
    const key = String(span.start);
    if (!byOffset.has(key)) byOffset.set(key, []);
    const list = byOffset.get(key);
    if (!list.includes(act.id)) list.push(act.id);

    // Índice por spanKey (provenance.sentenceId + sequence)
    const sentenceId = act.provenance?.sentenceId;
    if (typeof sentenceId === 'string' && sentenceId) {
      // Como não temos índice de token, usamos o actId como chave única
      // derivada da sentenceId + sufixo
      const spanKey = `${sentenceId}.${act.id}`;
      bySpanKey.set(spanKey, act.id);
    }
  }

  // Ordena actIds dentro de cada offset de forma estável
  for (const [k, list] of byOffset) {
    list.sort((a, b) => a.localeCompare(b));
    byOffset.set(k, list);
  }

  return {
    byAct,
    byOffset,
    bySpanKey,
    text,
    textLength: text.length,
    stats: _computeStats(byAct, text.length),
  };
}

/**
 * Devolve um SourceMap vazio.
 * @param {string} text
 * @returns {SourceMap}
 * @private
 */
function _emptyMap(text) {
  return {
    byAct: new Map(),
    byOffset: new Map(),
    bySpanKey: new Map(),
    text,
    textLength: text.length,
    stats: { actCount: 0, uniqueOffsets: 0, coverage: 0 },
  };
}

/**
 * Calcula estatísticas do map.
 * @private
 */
function _computeStats(byAct, textLength) {
  let covered = 0;
  const coveredRanges = [];

  for (const span of byAct.values()) {
    coveredRanges.push([span.start, span.end]);
  }

  // Une ranges para calcular cobertura real
  coveredRanges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of coveredRanges) {
    if (merged.length === 0 || merged[merged.length - 1][1] < r[0]) {
      merged.push([...r]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
    }
  }

  for (const [a, b] of merged) covered += (b - a);

  const coverage = textLength > 0
    ? Math.round((covered / textLength) * 100) / 100
    : 0;

  return {
    actCount: byAct.size,
    uniqueOffsets: byAct.size,
    coveredChars: covered,
    coverage,
  };
}

// ══════════════════════════════════════════════════════════════
// CONSULTAS
// ══════════════════════════════════════════════════════════════

/**
 * Devolve o SourceSpan de um act, ou null.
 * @param {string} actId
 * @param {SourceMap} map
 * @returns {SourceSpan|null}
 */
export function actToSource(actId, map) {
  if (!actId || !map || !map.byAct) return null;
  const span = map.byAct.get(actId);
  return span ? { ...span } : null;
}

/**
 * Devolve o primeiro actId cujo span contém o offset.
 * Usa binary search quando possível; fallback linear.
 *
 * @param {number} offset
 * @param {SourceMap} map
 * @returns {string|null}
 */
export function sourceToAct(offset, map) {
  const list = sourceToActs(offset, map);
  return list.length > 0 ? list[0] : null;
}

/**
 * Devolve todos os actIds cujos spans contêm o offset.
 * Ordenados por posição inicial do span (mais interno primeiro).
 *
 * @param {number} offset
 * @param {SourceMap} map
 * @returns {string[]}
 */
export function sourceToActs(offset, map) {
  if (!map || !map.byAct || typeof offset !== 'number') return [];

  const out = [];
  for (const [actId, span] of map.byAct) {
    if (_inSpan(offset, span)) {
      out.push({ actId, start: span.start, end: span.end });
    }
  }

  // Ordena por span mais interno (maior start, menor end)
  out.sort((a, b) => {
    if (a.start !== b.start) return b.start - a.start;
    return a.end - b.end;
  });

  return out.map((x) => x.actId);
}

/**
 * Devolve o actId associado a uma spanKey, ou null.
 * @param {string} spanKey
 * @param {SourceMap} map
 * @returns {string|null}
 */
export function spanKeyToAct(spanKey, map) {
  if (!spanKey || !map || !map.bySpanKey) return null;
  return map.bySpanKey.get(spanKey) ?? null;
}

/**
 * Constrói uma spanKey canônica a partir de sentenceId + tokenIndex.
 * Usado pelo resolver e pela UI de correção (F6).
 *
 * @param {string} sentenceId  — ex: 's1'
 * @param {number} tokenIndex  — índice 0-based do token
 * @returns {string}           — ex: 's1.t3'
 */
export function spanKeyFor(sentenceId, tokenIndex) {
  const sid = String(sentenceId ?? 's1');
  const idx = Number.isInteger(tokenIndex) && tokenIndex >= 0
    ? tokenIndex
    : 0;
  return `${sid}.t${idx}`;
}

/**
 * Devolve o texto de um span.
 * @param {string} actId
 * @param {SourceMap} map
 * @returns {string|null}
 */
export function actToText(actId, map) {
  const span = actToSource(actId, map);
  if (!span) return null;
  if (span.raw) return span.raw;
  if (map?.text && span.end <= map.text.length) {
    return map.text.slice(span.start, span.end);
  }
  return null;
}

/**
 * Verifica se um act tem mapeamento.
 * @param {string} actId
 * @param {SourceMap} map
 * @returns {boolean}
 */
export function hasAct(actId, map) {
  return !!(actId && map?.byAct?.has(actId));
}

// ══════════════════════════════════════════════════════════════
// NAVEGAÇÃO
// ══════════════════════════════════════════════════════════════

/**
 * Devolve o próximo act (por offset) após um offset dado.
 * @param {number} offset
 * @param {SourceMap} map
 * @returns {string|null}
 */
export function nextActAfter(offset, map) {
  if (!map?.byAct || typeof offset !== 'number') return null;

  let best = null;
  let bestStart = Infinity;

  for (const [actId, span] of map.byAct) {
    if (span.start > offset && span.start < bestStart) {
      bestStart = span.start;
      best = actId;
    }
  }

  return best;
}

/**
 * Devolve o act anterior (por offset) antes de um offset dado.
 * @param {number} offset
 * @param {SourceMap} map
 * @returns {string|null}
 */
export function prevActBefore(offset, map) {
  if (!map?.byAct || typeof offset !== 'number') return null;

  let best = null;
  let bestStart = -Infinity;

  for (const [actId, span] of map.byAct) {
    if (span.start < offset && span.start > bestStart) {
      bestStart = span.start;
      best = actId;
    }
  }

  return best;
}

// ══════════════════════════════════════════════════════════════
// ESTATÍSTICAS
// ══════════════════════════════════════════════════════════════

/**
 * Devolve estatísticas resumidas do map.
 * @param {SourceMap} map
 * @returns {Object}
 */
export function stats(map) {
  if (!map) {
    return { actCount: 0, uniqueOffsets: 0, coverage: 0, textLength: 0 };
  }
  return {
    actCount: map.byAct?.size ?? 0,
    uniqueOffsets: map.byOffset?.size ?? 0,
    coverage: map.stats?.coverage ?? 0,
    textLength: map.textLength ?? 0,
  };
}

/**
 * Devolve os acts que cobrem cada faixa do texto.
 * Útil para highlight e diagnóstico de cobertura.
 *
 * @param {SourceMap} map
 * @returns {Array<{ actId:string, span:SourceSpan }>}
 */
export function listActs(map) {
  if (!map?.byAct) return [];
  const out = [];
  for (const [actId, span] of map.byAct) {
    out.push({ actId, span: { ...span } });
  }
  out.sort((a, b) => a.span.start - b.span.start);
  return out;
}

/**
 * Verifica se dois SourceMaps são deep-equal (para testes de determinismo).
 * Ignora o campo `text` (comparação por conteúdo de spans).
 *
 * @param {SourceMap} a
 * @param {SourceMap} b
 * @returns {boolean}
 */
export function sourceMapsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;

  const aKeys = Array.from(a.byAct.keys()).sort();
  const bKeys = Array.from(b.byAct.keys()).sort();

  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) return false;
  }

  for (const key of aKeys) {
    const sa = a.byAct.get(key);
    const sb = b.byAct.get(key);
    if (!sa || !sb) return false;
    if (sa.start !== sb.start) return false;
    if (sa.end !== sb.end) return false;
    if (sa.line !== sb.line) return false;
    if (sa.column !== sb.column) return false;
    if (sa.raw !== sb.raw) return false;
  }

  return true;
}

// ══════════════════════════════════════════════════════════════
// SERIALIZAÇÃO
// ══════════════════════════════════════════════════════════════

/**
 * Serializa o SourceMap em JSON (para debug/export).
 * Maps são convertidos para objetos planos.
 *
 * @param {SourceMap} map
 * @returns {Object}
 */
export function toJSON(map) {
  if (!map) return null;

  const byAct = {};
  for (const [k, v] of map.byAct) byAct[k] = { ...v };

  const byOffset = {};
  for (const [k, list] of map.byOffset) byOffset[k] = [...list];

  const bySpanKey = {};
  for (const [k, v] of map.bySpanKey) bySpanKey[k] = v;

  return {
    byAct,
    byOffset,
    bySpanKey,
    textLength: map.textLength,
    stats: { ...map.stats },
  };
}

/**
 * Reconstrói um SourceMap a partir do JSON de `toJSON`.
 * @param {Object} json
 * @param {string} [text='']
 * @returns {SourceMap}
 */
export function fromJSON(json, text = '') {
  if (!json || typeof json !== 'object') {
    return _emptyMap(text);
  }

  const byAct = new Map();
  for (const [k, v] of Object.entries(json.byAct ?? {})) {
    byAct.set(k, { ...v });
  }

  const byOffset = new Map();
  for (const [k, list] of Object.entries(json.byOffset ?? {})) {
    byOffset.set(k, Array.isArray(list) ? [...list] : []);
  }

  const bySpanKey = new Map();
  for (const [k, v] of Object.entries(json.bySpanKey ?? {})) {
    bySpanKey.set(k, v);
  }

  return {
    byAct,
    byOffset,
    bySpanKey,
    text: String(text ?? ''),
    textLength: typeof json.textLength === 'number' ? json.textLength : 0,
    stats: json.stats ?? { actCount: 0, uniqueOffsets: 0, coverage: 0 },
  };
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const SourceMap = Object.freeze({
  buildSourceMap,
  actToSource,
  sourceToAct,
  sourceToActs,
  spanKeyToAct,
  spanKeyFor,
  actToText,
  hasAct,
  nextActAfter,
  prevActBefore,
  stats,
  listActs,
  sourceMapsEqual,
  toJSON,
  fromJSON,
});