/**
 * @file axis-detector.js
 * @module narrative-language/acts
 * @description Detector completo de eixos dimensionais para as operações
 *              coordenadoras (D5, D7, D8). Combina cinco fontes de evidência:
 *                1. Conectores discursivos (via pt-br/connectors.js)
 *                2. Construções sintáticas reconhecidas (via model.construction)
 *                3. Hints de outros analisadores (focalization, epistemic)
 *                4. Marcadores absolutos do analyzer (temporal)
 *                5. Padrões textuais brutos (regex sobre model.raw)
 * @imports narrative-language/ir/catalog,
 *          narrative-language/pt-br/connectors,
 *          narrative-language/pt-br/lexicon
 * @importedBy narrative-language/acts/subtype-detector
 * @level N3
 *
 * Contrato:
 *   detectAxes(model, resolution, classification) → Axes
 *
 *   Axes:
 *     {
 *       D5?: { modo, enunciador },
 *       D7?: { grau, estabilidade, alcanceK },
 *       D8?: { temporal, informacional, discursiva, distancia },
 *     }
 *
 * Cada eixo aparece no retorno apenas se foi detectado com confiança
 * suficiente. Operações sem eixos detectados NÃO aparecem no retorno.
 *
 * Nunca lança. Determinístico. Sem Math.random, sem wall-clock.
 */

import { Catalog } from '../ir/catalog.js';
import { Connectors } from '../pt-br/connectors.js';
import { typeOf as lexTypeOf, classOf as lexClassOf } from '../pt-br/lexicon.js';

// ══════════════════════════════════════════════════════════════
// CONSTRUCTION → AXES
// ══════════════════════════════════════════════════════════════
//
// Construções reconhecidas que determinam diretamente valores de eixo.
// Fonte de verdade paralela a `pt-br/constructions.js` — só as constructions
// que carregam informação de eixo.

/**
 * Mapa construction.id → valores de eixo inferidos.
 * @type {Readonly<Object<string, Object>>}
 * @private
 */
const _CONSTRUCTION_AXES = Object.freeze({
  // ── D5 — Enunciar (modo + enunciador) ────────────────────
  'direct-speech-dash': { D5: { modo: 'direct', enunciador: 'character' } },
  'x-y-disse':          { D5: { modo: 'direct', enunciador: 'character' } },
  'x-disse-que-y':      { D5: { modo: 'indirect', enunciador: 'character' } },
  'maybe-error':        { D5: { modo: 'free-indirect', enunciador: 'character' } },

  // ── D7 — Focalizar (grau) ────────────────────────────────
  'para-x-parecia-y':   { D7: { grau: 'internal' } },
  'para-x-y-era-z':     { D7: { grau: 'internal' } },
  'x-nao-viu-y':        { D7: { grau: 'internal' } },
  'x-viu-y':            { D7: { grau: 'internal' } },
  'x-achava-que-y':     { D7: { grau: 'internal' } },
  'x-sabia-que-y':      { D7: { grau: 'internal' } },
  'x-lembrou-de-y':     { D7: { grau: 'internal' } },
  'x-sentiu-y':         { D7: { grau: 'internal' } },
  'x-queria-y':         { D7: { grau: 'internal' } },
});

// ══════════════════════════════════════════════════════════════
// VERBOS DE FALA / COGNIÇÃO (para D5 modo/enunciador)
// ══════════════════════════════════════════════════════════════

/**
 * Verbos de fala assertivos (modo indireto padrão).
 * @type {ReadonlyArray<string>}
 * @private
 */
const _SAY_VERBS = Object.freeze([
  'dizer', 'falar', 'contar', 'afirmar', 'declarar', 'responder',
  'explicar', 'revelar', 'confessar', 'admitir', 'negar', 'confirmar',
  'repetir', 'esclarecer', 'sugerir', 'propor', 'aconselhar',
  'advertir', 'avisar', 'alertar', 'mencionar', 'comentar', 'relatar',
  'informar',
]);

/**
 * Verbos de fala interrogativos.
 * @type {ReadonlyArray<string>}
 * @private
 */
const _ASK_VERBS = Object.freeze([
  'perguntar', 'indagar', 'questionar', 'inquirir',
]);

/**
 * Verbos de fala diretivos.
 * @type {ReadonlyArray<string>}
 * @private
 */
const _ORDER_VERBS = Object.freeze([
  'ordenar', 'exigir', 'pedir', 'suplicar', 'implorar', 'rogar',
  'requerer', 'proibir', 'autorizar', 'convidar',
]);

/**
 * Verbos de fala comissivos.
 * @type {ReadonlyArray<string>}
 * @private
 */
const _PROMISE_VERBS = Object.freeze([
  'prometer', 'jurar', 'comprometer', 'votar',
]);

/**
 * Verbos de fala declarativos (mudam o mundo).
 * @type {ReadonlyArray<string>}
 * @private
 */
const _DECLARE_VERBS = Object.freeze([
  'proclamar', 'decretar', 'condenar', 'absolver', 'abençoar',
  'amaldiçoar', 'excomungar', 'coroar', 'batizar', 'nomear',
  'consagrar',
]);

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * Valida um valor de eixo contra o catálogo.
 * @param {string} op
 * @param {string} axis
 * @param {string} value
 * @returns {string|null}
 * @private
 */
function _validateAxis(op, axis, value) {
  if (!value || typeof value !== 'string') return null;
  if (Catalog.isValidAxisValue(op, axis, value)) return value;
  return null;
}

/**
 * Aplica valores de eixo derivados de conectores discursivos.
 * Um único hit por eixo (o primeiro ganha).
 * @param {string} op
 * @param {Object} out
 * @param {string} raw
 * @private
 */
function _applyConnectors(op, out, raw) {
  let hits;
  try {
    hits = Connectors.detect(raw);
  } catch {
    return;
  }

  for (const hit of hits) {
    if (hit.operation !== op) continue;
    if (out[hit.axis]) continue;
    const v = _validateAxis(op, hit.axis, hit.value);
    if (v) out[hit.axis] = v;
  }
}

/**
 * Aplica valores de eixo derivados de construction.
 * @param {string} op
 * @param {Object} out
 * @param {Object} model
 * @private
 */
function _applyConstruction(op, out, model) {
  const cid = model?.construction?.id;
  if (!cid) return;

  const mapping = _CONSTRUCTION_AXES[cid];
  if (!mapping || !mapping[op]) return;

  for (const [axis, value] of Object.entries(mapping[op])) {
    if (out[axis]) continue;
    const v = _validateAxis(op, axis, value);
    if (v) out[axis] = v;
  }
}

// ══════════════════════════════════════════════════════════════
// D5 — ENUNCIAR (modo + enunciador)
// ══════════════════════════════════════════════════════════════

/**
 * Detecta o modo do discurso: direct / indirect / free-indirect.
 * @param {Object} model
 * @returns {string|null}
 * @private
 */
function _detectD5Modo(model) {
  const raw = String(model?.raw ?? '');
  const construction = model?.construction?.id;

  // 1. Constructions explícitas
  if (construction === 'direct-speech-dash' || construction === 'x-y-disse') {
    return 'direct';
  }
  if (construction === 'x-disse-que-y') {
    return 'indirect';
  }
  if (construction === 'maybe-error') {
    return 'free-indirect';
  }

  // 2. Travessão no início → discurso direto
  if (/^\s*—\s+\S/.test(raw) || /^\s*–\s+\S/.test(raw)) {
    return 'direct';
  }

  // 3. Aspas envolvendo conteúdo de fala
  if (/^\s*["""]\S/.test(raw) || /^\s*«/.test(raw)) {
    return 'direct';
  }

  // 4. Verbo de fala + "que" → discurso indireto
  const lemma = model?.predicateLemma;
  if (lemma && _SAY_VERBS.includes(lemma)) {
    if (/\bque\b/i.test(raw)) {
      return 'indirect';
    }
    // Verbo de fala sem "que" mas com objeto entre aspas → direct
    if (/["«]/.test(raw)) return 'direct';
  }

  // 5. Marcadores de discurso indireto livre
  if (/\b(talvez|porventura|quem sabe)\s+(fosse|tivesse|pudesse|quisesse|soubesse)\b/i.test(raw)) {
    return 'free-indirect';
  }

  return null;
}

/**
 * Detecta o enunciador: character / narrator / reader.
 * @param {Object} model
 * @returns {string|null}
 * @private
 */
function _detectD5Enunciador(model) {
  const raw = String(model?.raw ?? '');

  // 1. Apóstrofe ao leitor (prioritário — é raro e explícito)
  if (/\b(caro leitor|leitor amigo|você que lê|meu leitor|ó leitor)\b/i.test(raw)) {
    return 'reader';
  }

  // 2. Travessão → personagem falando
  if (/^\s*—\s+\S/.test(raw) || /^\s*–\s+\S/.test(raw)) {
    return 'character';
  }

  // 3. Verbo de fala com sujeito de 3ª pessoa → personagem
  const lemma = model?.predicateLemma;
  const SAYS = [
    ..._SAY_VERBS, ..._ASK_VERBS, ..._ORDER_VERBS,
    ..._PROMISE_VERBS, ..._DECLARE_VERBS,
    'gritar', 'sussurrar', 'murmurar', 'gemer', 'suspirar', 'soluçar',
    'chorar', 'rir', 'gargalhar', 'sorrir', 'rugir', 'rosnar',
    'cumprimentar', 'saudar', 'despedir', 'agradecer',
  ];
  if (lemma && SAYS.includes(lemma)) {
    return 'character';
  }

  // 4. Primeira pessoa no texto → personagem narrando
  if (/\b(eu|meu|minha|comigo|mim)\b/i.test(raw)) {
    return 'character';
  }

  return null;
}

/**
 * Detecta eixos de D5.
 * @param {Object} model
 * @param {Object} resolution
 * @param {Object} classification
 * @returns {Object}
 * @private
 */
function _detectD5Axes(model, resolution, classification) {
  const out = {};

  // 1. Conectores
  _applyConnectors('D5', out, String(model?.raw ?? ''));

  // 2. Constructions
  _applyConstruction('D5', out, model);

  // 3. Modo por heurística textual
  if (!out.modo) {
    const m = _detectD5Modo(model);
    if (m) out.modo = m;
  }

  // 4. Enunciador por heurística textual
  if (!out.enunciador) {
    const e = _detectD5Enunciador(model);
    if (e) out.enunciador = e;
  }

  return out;
}

// ══════════════════════════════════════════════════════════════
// D7 — FOCALIZAR (grau + estabilidade + alcanceK)
// ══════════════════════════════════════════════════════════════

/**
 * Detecta o grau de focalização: zero / external / internal.
 * @param {Object} model
 * @param {Object} classification
 * @returns {string|null}
 * @private
 */
function _detectD7Grau(model, classification) {
  const raw = String(model?.raw ?? '');

  // 1. Hint do classifier (mais confiável)
  const focal = classification?.hints?.focalization;
  if (focal) {
    if (focal.targetId) return 'internal';
    if (focal.kind === 'external') return 'external';
    if (focal.kind === 'omniscient') return 'zero';
  }

  // 2. Marcadores textuais de focalização interna explícita
  if (/^\s*para\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(raw)) return 'internal';
  if (/^\s*segundo\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(raw)) return 'internal';
  if (/\b(do ponto de vista de|na perspectiva de)\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(raw)) {
    return 'internal';
  }

  // 3. Verbo perceptivo/cognitivo de 3ª pessoa → internal
  const lemma = model?.predicateLemma;
  const COGNITIVE_VERBS = [
    'ver', 'ouvir', 'observar', 'notar', 'perceber', 'sentir', 'olhar',
    'escutar', 'fitar', 'encarar', 'avistar', 'vislumbrar', 'flagrar',
    'saber', 'achar', 'acreditar', 'crer', 'pensar', 'refletir',
    'lembrar', 'recordar', 'relembrar', 'imaginar', 'duvidar',
    'suspeitar', 'supor', 'julgar', 'querer', 'desejar', 'pretender',
    'decidir', 'planejar',
  ];
  if (lemma && COGNITIVE_VERBS.includes(lemma)) return 'internal';

  // 4. Marcadores de focalização externa (observador)
  if (/\b(aparentemente|ao que parecia|supostamente|ao que se via)\b/i.test(raw)) {
    return 'external';
  }

  // 5. Marcadores de focalização onisciente
  if (/\b(em todo o reino|do alto|de todos os cantos|naquele mundo inteiro|em toda parte|pelo mundo afora)\b/i.test(raw)) {
    return 'zero';
  }

  return null;
}

/**
 * Detecta a estabilidade da focalização: fixed / variable / multiple.
 * @param {Object} classification
 * @returns {string|null}
 * @private
 */
function _detectD7Estabilidade(classification) {
  const raw = String(classification?.__raw ?? '');

  // Marcadores de alternância de POV no texto
  if (/\b(por outro lado|entretanto, do outro lado|em contrapartida|do outro lado da cena)\b/i.test(raw)) {
    return 'variable';
  }

  // Sem marcador explícito → fixo (padrão de cena)
  // Só declara estabilidade se houver focalização interna
  const focal = classification?.hints?.focalization;
  if (focal?.targetId) {
    return 'fixed';
  }

  return null;
}

/**
 * Detecta o alcance de K: symmetric / asymmetric-narrator / asymmetric-reader.
 * @param {Object} classification
 * @returns {string|null}
 * @private
 */
function _detectD7AlcanceK(classification) {
  const epistemic = classification?.hints?.epistemic;
  const acts = Array.isArray(epistemic?.acts) ? epistemic.acts : [];

  if (acts.length === 0) return null;

  // Categorias que indicam assimetria epistêmica
  const hasBelief = acts.some((a) => a.category === 'belief');
  const hasIgnorance = acts.some((a) => a.category === 'ignorance');
  const hasDoubt = acts.some((a) => a.category === 'doubt');

  // Se há ignorância explícita → leitor sabe mais que personagem
  if (hasIgnorance) return 'asymmetric-reader';

  // Se há crença ou dúvida → assimetria epistêmica
  if (hasBelief || hasDoubt) return 'asymmetric-reader';

  return null;
}

/**
 * Detecta eixos de D7.
 * @param {Object} model
 * @param {Object} resolution
 * @param {Object} classification
 * @returns {Object}
 * @private
 */
function _detectD7Axes(model, resolution, classification) {
  const out = {};

  // 1. Conectores
  _applyConnectors('D7', out, String(model?.raw ?? ''));

  // 2. Constructions
  _applyConstruction('D7', out, model);

  // 3. Grau por heurística profunda
  if (!out.grau) {
    const g = _detectD7Grau(model, classification);
    if (g) out.grau = g;
  }

  // 4. Estabilidade
  if (!out.estabilidade) {
    const e = _detectD7Estabilidade({
      ...classification,
      __raw: String(model?.raw ?? ''),
    });
    if (e) out.estabilidade = e;
  }

  // 5. Alcance de K
  if (!out.alcanceK) {
    const k = _detectD7AlcanceK(classification);
    if (k) out.alcanceK = k;
  }

  return out;
}

// ══════════════════════════════════════════════════════════════
// D8 — ESTRUTURAR (temporal + informacional + discursiva + distancia)
// ══════════════════════════════════════════════════════════════

/**
 * Detecta o eixo temporal: linear / analepse / prolepse / simultaneous.
 * @param {Object} model
 * @returns {string|null}
 * @private
 */
function _detectD8Temporal(model) {
  const raw = String(model?.raw ?? '');

  // 1. Marcadores textuais absolutos (prioridade máxima)
  if (/\b(anos antes|tempo atrás|outrora|antigamente|no passado|antes disso|antes daquilo|no dia anterior|muito tempo antes)\b/i.test(raw)) {
    return 'analepse';
  }
  if (/\b(mais tarde|depois disso|anos depois|no dia seguinte|logo depois|tempo depois|no futuro|viria a)\b/i.test(raw)) {
    return 'prolepse';
  }
  if (/\b(enquanto isso|simultaneamente|ao mesmo tempo|no mesmo instante|paralelamente|naquela hora)\b/i.test(raw)) {
    return 'simultaneous';
  }
  if (/\b(depois|em seguida|logo após|então|a seguir|posteriormente)\b/i.test(raw)) {
    return 'linear';
  }

  // 2. Marcadores absolutos do analyzer
  const markers = Array.isArray(model?.absoluteMarkers) ? model.absoluteMarkers : [];
  for (const m of markers) {
    const k = m?.kind;
    if (k === 'absolute-present') return 'simultaneous';
    if (k === 'absolute-past') return 'analepse';
    if (k === 'absolute-future') return 'prolepse';
    if (k === 'relative-retrospective') return 'analepse';
    if (k === 'relative-anticipatory') return 'prolepse';
    if (k === 'simultaneous') return 'simultaneous';
  }

  return null;
}

/**
 * Detecta o eixo informacional: omit / delay / hint / payoff.
 * @param {Object} model
 * @returns {string|null}
 * @private
 */
function _detectD8Informacional(model) {
  const raw = String(model?.raw ?? '');

  // Retardo
  if (/\b(como se verá|mais adiante|no próximo capítulo|em breve saberemos|mais tarde se saberá)\b/i.test(raw)) {
    return 'delay';
  }

  // Pagamento (quitar dívida informacional)
  if (/\b(como (já )?mencionado|como dito antes|como previsto|afinal|no fim|revelou-se|descobriu-se)\b/i.test(raw)) {
    return 'payoff';
  }

  // Pista
  if (/\b(uma pista|um indício|um sinal|suspeitava|pressentia|algo estranho|algo não batia)\b/i.test(raw)) {
    return 'hint';
  }

  // Omissão (elipse deliberada)
  if (/\b(preferiu não contar|não disse nada|ficou em silêncio|deixou no ar|omitiu)\b/i.test(raw)) {
    return 'omit';
  }

  return null;
}

/**
 * Detecta o eixo discursivo: segment / intercalation / frame / block.
 * @param {Object} model
 * @returns {string|null}
 * @private
 */
function _detectD8Discursiva(model) {
  const raw = String(model?.raw ?? '');

  // Moldura (história embutida)
  if (/\b(a história de|o conto de|o relato de|a lenda de|o caso de|narrou que|contou a história)\b/i.test(raw)) {
    return 'frame';
  }

  // Intercalação (parêntese narrativo)
  if (/^\s*\(/.test(raw) || /\b(a propósito|por falar nisso|incidentalmente|entre parênteses)\b/i.test(raw)) {
    return 'intercalation';
  }

  // Segmentação (unidade narrativa)
  if (/^\s*(capítulo|parte|seção|livro|ato)\s+\w+/im.test(raw)) {
    return 'segment';
  }

  // Bloco (unidade coesa)
  if (/^\s*\*\s*\*\s*\*/.test(raw) || /^\s*---/.test(raw)) {
    return 'block';
  }

  return null;
}

/**
 * Detecta o eixo de distância: scene / summary / ellipsis / pause / iterative.
 * @param {Object} model
 * @returns {string|null}
 * @private
 */
function _detectD8Distancia(model) {
  const raw = String(model?.raw ?? '');

  // Cena (tempo real)
  if (/\b(de repente|subitamente|de súbito|naquele instante|naquele momento)\b/i.test(raw)) {
    return 'scene';
  }
  // Diálogo direto = cena em tempo real
  if (/^\s*—\s+\S/.test(raw) || /^\s*["""]/.test(raw)) {
    return 'scene';
  }

  // Sumário (compressão)
  if (/\b(durante (anos|meses|dias|semanas)|por muito tempo|por (longos )?anos|ao longo de)\b/i.test(raw)) {
    return 'summary';
  }

  // Elipse (corte temporal)
  if (/\b(algum tempo depois|tempo passou|quando voltou|ao retornar|após algum tempo)\b/i.test(raw)) {
    return 'ellipsis';
  }

  // Pausa (tempo parado — descrição estática)
  if (/\b(durante aquele instante|naquele momento exato|por um momento|por um instante)\b/i.test(raw)) {
    return 'pause';
  }

  // Iterativo (hábito)
  if (/\b(todos os (dias|anos|meses)|costumeiramente|habitualmente|como de costume|sempre que|todas as (manhãs|noites|tardes))\b/i.test(raw)) {
    return 'iterative';
  }

  return null;
}

/**
 * Detecta eixos de D8.
 * @param {Object} model
 * @param {Object} resolution
 * @param {Object} classification
 * @returns {Object}
 * @private
 */
function _detectD8Axes(model, resolution, classification) {
  const out = {};

  // 1. Conectores
  _applyConnectors('D8', out, String(model?.raw ?? ''));

  // 2. Temporal
  if (!out.temporal) {
    const t = _detectD8Temporal(model);
    if (t) out.temporal = t;
  }

  // 3. Informacional
  if (!out.informacional) {
    const i = _detectD8Informacional(model);
    if (i) out.informacional = i;
  }

  // 4. Discursiva
  if (!out.discursiva) {
    const d = _detectD8Discursiva(model);
    if (d) out.discursiva = d;
  }

  // 5. Distância
  if (!out.distancia) {
    const dist = _detectD8Distancia(model);
    if (dist) out.distancia = dist;
  }

  return out;
}

// ══════════════════════════════════════════════════════════════
// FILTRO DE RELEVÂNCIA
// ══════════════════════════════════════════════════════════════

/**
 * Verifica se uma operação está em `classification.selected`.
 * Se não estiver, o eixo não é relevante para esta sentença.
 * @param {string} op
 * @param {Object} classification
 * @returns {boolean}
 * @private
 */
function _operationIsSelected(op, classification) {
  const selected = classification?.selected;
  if (!Array.isArray(selected)) return false;
  return selected.includes(op);
}

// ══════════════════════════════════════════════════════════════
// API PRINCIPAL
// ══════════════════════════════════════════════════════════════

/**
 * Detecta todos os eixos presentes em um modelo.
 *
 * Só retorna eixos para operações que foram selecionadas pelo classifier
 * (evita poluir o resultado com eixos de operações não-ativas).
 *
 * @param {Object} model
 * @param {Object} [resolution]
 * @param {Object} [classification]
 * @returns {{
 *   D5?: Object,
 *   D7?: Object,
 *   D8?: Object,
 * }}
 */
export function detectAxes(model, resolution, classification = {}) {
  if (!model) return {};

  const out = {};

  // ── D5 — Enunciar ────────────────────────────────────────
  if (_operationIsSelected('enunciate', classification)) {
    try {
      const d5 = _detectD5Axes(model, resolution, classification);
      if (d5 && Object.keys(d5).length > 0) out.D5 = d5;
    } catch { /* isola */ }
  }

  // ── D7 — Focalizar ───────────────────────────────────────
  if (_operationIsSelected('focalize', classification)) {
    try {
      const d7 = _detectD7Axes(model, resolution, classification);
      if (d7 && Object.keys(d7).length > 0) out.D7 = d7;
    } catch { /* isola */ }
  }

  // ── D8 — Estruturar ──────────────────────────────────────
  if (_operationIsSelected('structure', classification)) {
    try {
      const d8 = _detectD8Axes(model, resolution, classification);
      if (d8 && Object.keys(d8).length > 0) out.D8 = d8;
    } catch { /* isola */ }
  }

  return out;
}

/**
 * Verifica se um conjunto de eixos está vazio.
 * @param {Object} axes
 * @returns {boolean}
 */
export function isEmpty(axes) {
  if (!axes || typeof axes !== 'object') return true;
  return Object.keys(axes).length === 0;
}

/**
 * Estatísticas de um conjunto de eixos (para debug/UI).
 * @param {Object} axes
 * @returns {Object}
 */
export function axesStats(axes) {
  if (!axes || typeof axes !== 'object') {
    return { operations: 0, axes: 0, values: [] };
  }
  const values = [];
  for (const [op, opAxes] of Object.entries(axes)) {
    for (const [axis, value] of Object.entries(opAxes ?? {})) {
      values.push(`${op}.${axis}=${value}`);
    }
  }
  return {
    operations: Object.keys(axes).length,
    axes: values.length,
    values,
  };
}

/**
 * Lista os eixos do catálogo (delega para Catalog).
 * @returns {Array<Object>}
 */
export function listCatalogAxes() {
  return Catalog.allAxes();
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const AxisDetector = Object.freeze({
  detectAxes,
  isEmpty,
  axesStats,
  listCatalogAxes,
});