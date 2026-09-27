/**
 * @file temporality-analyzer.js
 * @module narrative-language/acts
 * @description Análise de temporalidade narrativa. Distingue tempo da
 *              história, tempo do discurso e tempo da simulação. Detecta
 *              marcadores absolutos e relativos, ordem entre eventos,
 *              elipse, resumo, pausa, simultaneidade, retrocesso e
 *              antecipação.
 * @imports narrative-language/ir/schema
 * @importedBy narrative-language/acts/dimensions,
 *             narrative-language/acts/classifier (via hints)
 * @level N3
 *
 * Contrato:
 *   analyzeTemporality(model, resolution, ctx) → TemporalResult
 *   listTemporalMarkers()                      → string[]
 *   relationsFor(marker)                       → string|null
 *
 * TemporalResult:
 *   {
 *     frame: 'story' | 'discourse' | 'simulation',
 *     relation: 'sequence' | 'simultaneous' | 'retrospective' |
 *               'anticipatory' | 'contrastive' | null,
 *     anchor: { marker, kind, weight, position } | null,
 *     aspect: string | null,   — aspect refinado por marcadores
 *     confidence: number,
 *     evidence: Evidence[],
 *   }
 *
 * Determinismo: nenhuma chamada a Math.random ou wall-clock. Nunca lança.
 */

import { TEMPORAL_FRAMES, ASPECT_KINDS } from '../ir/schema.js';

// ══════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════

/**
 * Marcadores temporais por categoria.
 * A ordem importa apenas para debug; matching é independente.
 *
 * @type {ReadonlyArray<{ pattern:RegExp, kind:string, weight:number, frame:string, relation:string|null, aspect:string|null }>}
 * @private
 */
const _TEMPORAL_MARKERS = Object.freeze([
  // ── Absolutos — referência ao presente discursivo ──────
  { pattern: /^\s*hoje\b/i,
    kind: 'absolute-present', weight: 0.92, frame: 'discourse', relation: 'simultaneous', aspect: null },
  { pattern: /^\s*agora\b/i,
    kind: 'absolute-present', weight: 0.92, frame: 'discourse', relation: 'simultaneous', aspect: null },
  { pattern: /^\s*neste\s+momento\b/i,
    kind: 'absolute-present', weight: 0.90, frame: 'discourse', relation: 'simultaneous', aspect: 'punctual' },
  { pattern: /^\s*no\s+momento\b/i,
    kind: 'absolute-present', weight: 0.88, frame: 'discourse', relation: 'simultaneous', aspect: 'punctual' },
  { pattern: /^\s*ontem\b/i,
    kind: 'absolute-past', weight: 0.92, frame: 'discourse', relation: 'retrospective', aspect: null },
  { pattern: /^\s*na\s+v[ée]spera\b/i,
    kind: 'absolute-past', weight: 0.90, frame: 'discourse', relation: 'retrospective', aspect: null },
  { pattern: /^\s*amanh[ãa]\b/i,
    kind: 'absolute-future', weight: 0.92, frame: 'discourse', relation: 'anticipatory', aspect: null },

  // ── Relativos retrospectivos — antes do presente narrativo ──
  { pattern: /^\s*(anos|d[ée]cadas|s[ée]culos)\s+antes\b/i,
    kind: 'relative-retrospective', weight: 0.95, frame: 'story', relation: 'retrospective', aspect: null },
  { pattern: /^\s*muito\s+tempo\s+atr[áa]s\b/i,
    kind: 'relative-retrospective', weight: 0.92, frame: 'story', relation: 'retrospective', aspect: null },
  { pattern: /^\s*tempo\s+atr[áa]s\b/i,
    kind: 'relative-retrospective', weight: 0.88, frame: 'story', relation: 'retrospective', aspect: null },
  { pattern: /^\s*antes\s+disso\b/i,
    kind: 'relative-retrospective', weight: 0.90, frame: 'story', relation: 'retrospective', aspect: null },
  { pattern: /^\s*antes\s+daquilo\b/i,
    kind: 'relative-retrospective', weight: 0.90, frame: 'story', relation: 'retrospective', aspect: null },
  { pattern: /^\s*no\s+dia\s+anterior\b/i,
    kind: 'relative-retrospective', weight: 0.92, frame: 'story', relation: 'retrospective', aspect: null },

  // ── Relativos antecipatórios — depois do presente narrativo ──
  { pattern: /^\s*mais\s+tarde\b/i,
    kind: 'relative-anticipatory', weight: 0.95, frame: 'story', relation: 'anticipatory', aspect: null },
  { pattern: /^\s*(anos|d[ée]cadas|s[ée]culos|dias?|meses?)\s+depois\b/i,
    kind: 'relative-anticipatory', weight: 0.95, frame: 'story', relation: 'anticipatory', aspect: null },
  { pattern: /^\s*depois\s+disso\b/i,
    kind: 'relative-anticipatory', weight: 0.90, frame: 'story', relation: 'anticipatory', aspect: null },
  { pattern: /^\s*depois\s+daquilo\b/i,
    kind: 'relative-anticipatory', weight: 0.90, frame: 'story', relation: 'anticipatory', aspect: null },
  { pattern: /^\s*no\s+dia\s+seguinte\b/i,
    kind: 'relative-anticipatory', weight: 0.92, frame: 'story', relation: 'anticipatory', aspect: null },
  { pattern: /^\s*logo\s+depois\b/i,
    kind: 'relative-anticipatory', weight: 0.88, frame: 'story', relation: 'anticipatory', aspect: null },

  // ── Simultaneidade ─────────────────────────────────────
  { pattern: /^\s*enquanto\s+isso\b/i,
    kind: 'simultaneous', weight: 0.93, frame: 'story', relation: 'simultaneous', aspect: null },
  { pattern: /^\s*ao\s+mesmo\s+tempo\b/i,
    kind: 'simultaneous', weight: 0.92, frame: 'story', relation: 'simultaneous', aspect: null },
  { pattern: /^\s*simultaneamente\b/i,
    kind: 'simultaneous', weight: 0.90, frame: 'story', relation: 'simultaneous', aspect: null },
  { pattern: /^\s*naquele\s+momento\b/i,
    kind: 'simultaneous', weight: 0.88, frame: 'story', relation: 'simultaneous', aspect: 'punctual' },
  { pattern: /^\s*naquela\s+hora\b/i,
    kind: 'simultaneous', weight: 0.88, frame: 'story', relation: 'simultaneous', aspect: null },

  // ── Punctual — momento único ───────────────────────────
  { pattern: /\bde\s+repente\b/i,
    kind: 'punctual', weight: 0.88, frame: 'story', relation: null, aspect: 'punctual' },
  { pattern: /\bsubitamente\b/i,
    kind: 'punctual', weight: 0.88, frame: 'story', relation: null, aspect: 'punctual' },
  { pattern: /\bde\s+s[úu]bito\b/i,
    kind: 'punctual', weight: 0.88, frame: 'story', relation: null, aspect: 'punctual' },
  { pattern: /\bnaquele\s+instante\b/i,
    kind: 'punctual', weight: 0.90, frame: 'story', relation: null, aspect: 'punctual' },

  // ── Durativo — extensão no tempo ───────────────────────
  { pattern: /\bdurante\s+/i,
    kind: 'durative', weight: 0.85, frame: 'story', relation: null, aspect: 'durative' },
  { pattern: /\bao\s+longo\s+de\s+/i,
    kind: 'durative', weight: 0.88, frame: 'story', relation: null, aspect: 'durative' },

  // ── Habitual — repetição padrão ────────────────────────
  { pattern: /\bsempre\b/i,
    kind: 'habitual', weight: 0.85, frame: 'story', relation: null, aspect: 'habitual' },
  { pattern: /\bcostumeiramente\b/i,
    kind: 'habitual', weight: 0.88, frame: 'story', relation: null, aspect: 'habitual' },
  { pattern: /\bhabitualmente\b/i,
    kind: 'habitual', weight: 0.88, frame: 'story', relation: null, aspect: 'habitual' },
  { pattern: /\btodas\s+as\s+(noites|manh[ãa]s|tardes|vezes)\b/i,
    kind: 'habitual', weight: 0.90, frame: 'story', relation: null, aspect: 'habitual' },
  { pattern: /\btodos\s+os\s+(dias|meses|anos)\b/i,
    kind: 'habitual', weight: 0.90, frame: 'story', relation: null, aspect: 'habitual' },

  // ── Iterativo — repetição pontual ──────────────────────
  { pattern: /\bde\s+novo\b/i,
    kind: 'iterative', weight: 0.88, frame: 'story', relation: null, aspect: 'iterative' },
  { pattern: /\boutra\s+vez\b/i,
    kind: 'iterative', weight: 0.88, frame: 'story', relation: null, aspect: 'iterative' },
  { pattern: /\brepetidamente\b/i,
    kind: 'iterative', weight: 0.90, frame: 'story', relation: null, aspect: 'iterative' },
  { pattern: /\btornou\s+a\s+/i,
    kind: 'iterative', weight: 0.85, frame: 'story', relation: null, aspect: 'iterative' },
  { pattern: /\bvoltou\s+a\s+/i,
    kind: 'iterative', weight: 0.85, frame: 'story', relation: null, aspect: 'iterative' },
]);

/**
 * Ordem de prioridade de relações temporais.
 * Quando duas relações empatam em peso, a de maior prioridade ganha.
 * @type {ReadonlyArray<string>}
 * @private
 */
const _RELATION_PRIORITY = Object.freeze([
  'retrospective',
  'anticipatory',
  'simultaneous',
  'sequence',
  'contrastive',
]);

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * Cria evidência no formato canônico.
 * @private
 */
function _mkEvidence(source, value, reason, weight) {
  return {
    source: String(source ?? ''),
    value: String(value ?? ''),
    reason: String(reason ?? ''),
    weight: Math.max(0, Math.min(1, weight)),
  };
}

/**
 * Verifica se um valor é um aspect válido.
 * @private
 */
function _isValidAspect(a) {
  return ASPECT_KINDS.includes(a);
}

/**
 * Verifica se um valor é um frame temporal válido.
 * @private
 */
function _isValidFrame(f) {
  return TEMPORAL_FRAMES.includes(f);
}

// ══════════════════════════════════════════════════════════════
// DETECÇÃO DE MARCADORES
// ══════════════════════════════════════════════════════════════

/**
 * Varre uma sentença e devolve todos os marcadores temporais reconhecidos.
 * Ordenados por posição no texto.
 *
 * @param {string} raw
 * @returns {Array<{ marker:string, kind:string, weight:number, frame:string, relation:string|null, aspect:string|null, position:number }>}
 * @private
 */
function _detectMarkers(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return [];

  const out = [];
  const seen = new Set();

  for (const entry of _TEMPORAL_MARKERS) {
    const m = entry.pattern.exec(s);
    if (!m) continue;
    const markerText = m[0].trim();
    const key = `${entry.kind}|${markerText.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      marker: markerText,
      kind: entry.kind,
      weight: entry.weight,
      frame: entry.frame,
      relation: entry.relation,
      aspect: entry.aspect,
      position: typeof m.index === 'number' ? m.index : 0,
    });
  }

  // Ordena por posição
  out.sort((a, b) => a.position - b.position);
  return out;
}

/**
 * Escolhe o marcador dominante. Critério:
 *   1. Maior peso
 *   2. Empate → prioridade de relação
 *   3. Empate → menor posição
 *
 * @param {Array} markers
 * @returns {Object|null}
 * @private
 */
function _pickDominant(markers) {
  if (!Array.isArray(markers) || markers.length === 0) return null;

  const sorted = [...markers].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    const pa = _RELATION_PRIORITY.indexOf(a.relation);
    const pb = _RELATION_PRIORITY.indexOf(b.relation);
    const priorityA = pa < 0 ? 999 : pa;
    const priorityB = pb < 0 ? 999 : pb;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return a.position - b.position;
  });

  return sorted[0];
}

// ══════════════════════════════════════════════════════════════
// DETECÇÃO DE FRAME
// ══════════════════════════════════════════════════════════════

/**
 * Determina o frame temporal da sentença.
 *
 * Regras:
 *   - Se há marcador absoluto-presente → discourse
 *   - Se há marcador relativo com posição inicial → story
 *   - Se a sentença é de discurso direto → discourse
 *   - Caso contrário → story (default)
 *
 * @param {Object} model
 * @param {Array} markers
 * @returns {string}
 * @private
 */
function _detectFrame(model, markers) {
  // Discurso direto força frame discourse
  if (model?.construction?.id === 'direct-speech-dash') return 'discourse';
  if (model?.form === 'direct-speech') return 'discourse';

  // Marcador dominante determina o frame
  const dominant = _pickDominant(markers);
  if (dominant) {
    if (dominant.kind === 'absolute-present' ||
        dominant.kind === 'absolute-past' ||
        dominant.kind === 'absolute-future') {
      return 'discourse';
    }
    if (dominant.kind.startsWith('relative-')) return 'story';
    if (dominant.kind === 'simultaneous') return 'story';
  }

  // Default: história
  return 'story';
}

// ══════════════════════════════════════════════════════════════
// DETECÇÃO DE RELAÇÃO
// ══════════════════════════════════════════════════════════════

/**
 * Determina a relação temporal dominante.
 * @private
 */
function _detectRelation(markers, model) {
  const dominant = _pickDominant(markers);
  if (dominant?.relation) return dominant.relation;

  // Se há marcador com weight >= 0.90 mas sem relação, ainda detecta
  // "sequence" como default para sentenças com verbos no passado
  if (model?.tense === 'past') return 'sequence';

  return null;
}

// ══════════════════════════════════════════════════════════════
// DETECÇÃO DE ASPECTO REFINADO
// ══════════════════════════════════════════════════════════════

/**
 * Refina o aspecto com base em marcadores temporais.
 * Prefere o aspecto vindo de marcador (mais específico) ao aspecto
 * vindo da morfologia do verbo.
 *
 * @param {Array} markers
 * @param {string|null} modelAspect
 * @returns {string|null}
 * @private
 */
function _refineAspect(markers, modelAspect) {
  // Aspectos por marcador (mais específicos)
  const aspectMarkers = markers.filter((m) => m.aspect);

  if (aspectMarkers.length > 0) {
    // Ordena por peso desc
    aspectMarkers.sort((a, b) => b.weight - a.weight);
    const candidate = aspectMarkers[0].aspect;
    if (_isValidAspect(candidate)) return candidate;
  }

  // Fallback: aspecto morfológico
  if (modelAspect && _isValidAspect(modelAspect)) return modelAspect;

  return null;
}

// ══════════════════════════════════════════════════════════════
// API PRINCIPAL
// ══════════════════════════════════════════════════════════════

/**
 * Analisa a temporalidade narrativa de um modelo linguístico.
 *
 * @param {Object} model
 * @param {Object} [resolution]
 * @param {Object} [ctx={}]
 * @returns {{
 *   frame: string,
 *   relation: string|null,
 *   anchor: Object|null,
 *   aspect: string|null,
 *   confidence: number,
 *   evidence: Array<{source:string,value:string,reason:string,weight:number}>,
 * }}
 */
export function analyzeTemporality(model, resolution, ctx = {}) {
  const empty = {
    frame: 'story',
    relation: null,
    anchor: null,
    aspect: null,
    confidence: 0,
    evidence: [],
  };

  if (!model || typeof model !== 'object') return empty;

  const raw = String(model.raw ?? '').trim();
  if (!raw) return empty;

  const evidence = [];

  // ── 1. Marcadores ──────────────────────────────────────
  const markers = _detectMarkers(raw);
  if (markers.length > 0) {
    for (const m of markers) {
      evidence.push(_mkEvidence(
        'syntax',
        m.marker,
        `marcador temporal "${m.marker}" (${m.kind})`,
        m.weight
      ));
    }
  }

  // ── 2. Frame ───────────────────────────────────────────
  let frame = _detectFrame(model, markers);
  if (!_isValidFrame(frame)) frame = 'story';

  // ── 3. Relação ─────────────────────────────────────────
  const relation = _detectRelation(markers, model);

  // ── 4. Âncora ──────────────────────────────────────────
  const anchor = _pickDominant(markers);

  // ── 5. Aspecto refinado ────────────────────────────────
  const aspect = _refineAspect(markers, model.aspect ?? null);
  if (aspect && aspect !== model.aspect) {
    evidence.push(_mkEvidence(
      'context',
      aspect,
      `aspecto refinado por marcador temporal`,
      0.75
    ));
  }

  // ── 6. Confiança ───────────────────────────────────────
  let confidence = 0;
  if (anchor) {
    confidence = anchor.weight;
  } else if (model.tense || model.aspect) {
    // Sem marcador mas com morfologia clara
    confidence = 0.45;
  } else {
    confidence = 0.20;
  }

  // Reduz se não há evidência explícita
  if (markers.length === 0 && !model.tense && !model.aspect) {
    confidence = Math.min(confidence, 0.15);
  }

  return {
    frame,
    relation,
    anchor,
    aspect,
    confidence: Math.round(confidence * 100) / 100,
    evidence,
  };
}

// ══════════════════════════════════════════════════════════════
// CONSULTAS
// ══════════════════════════════════════════════════════════════

/**
 * Lista os marcadores temporais reconhecidos.
 * @returns {string[]}
 */
export function listTemporalMarkers() {
  const out = [];
  for (const entry of _TEMPORAL_MARKERS) {
    // Extrai um exemplo textual do pattern
    const src = entry.pattern.source
      .replace(/^\^?\\s\*/, '')
      .replace(/\\b.*$/, '')
      .replace(/\\/g, '');
    if (src && !out.includes(src)) out.push(src);
  }
  return out.sort();
}

/**
 * Devolve a relação associada a um marcador, ou null.
 * @param {string} markerText
 * @returns {string|null}
 */
export function relationsFor(markerText) {
  const key = String(markerText ?? '').toLowerCase().trim();
  if (!key) return null;
  for (const entry of _TEMPORAL_MARKERS) {
    if (entry.pattern.test(key) || entry.pattern.test(` ${key}`)) {
      return entry.relation;
    }
  }
  return null;
}

/**
 * Estatísticas de um resultado de temporalidade (para debug).
 * @param {Object} result
 * @returns {Object}
 */
export function temporalityStats(result) {
  if (!result) {
    return {
      frame: null,
      relation: null,
      hasAnchor: false,
      aspect: null,
      confidence: 0,
    };
  }
  return {
    frame: result.frame ?? null,
    relation: result.relation ?? null,
    hasAnchor: !!result.anchor,
    anchorMarker: result.anchor?.marker ?? null,
    aspect: result.aspect ?? null,
    confidence: result.confidence ?? 0,
    evidenceCount: Array.isArray(result.evidence) ? result.evidence.length : 0,
  };
}

/**
 * Lista os kinds de marcador reconhecidos (útil para fixtures).
 * @returns {string[]}
 */
export function listMarkerKinds() {
  const set = new Set();
  for (const entry of _TEMPORAL_MARKERS) set.add(entry.kind);
  return Array.from(set).sort();
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const TemporalityAnalyzer = Object.freeze({
  analyzeTemporality,
  listTemporalMarkers,
  listMarkerKinds,
  relationsFor,
  temporalityStats,
});