/**
 * @file rule-compiler.js
 * @module narrative-language/acts
 * @description Compila regras narrativas em português natural para o
 *              formato `rul.add "..." ON: <event> IF: <cond> DO: <do>`.
 *              Aceita como entrada um LinguisticModel, um NarrativeAct
 *              ou uma string crua. Autocontido (não importa do projector).
 * @imports narrative-language/ir/schema,
 *          narrative-language/pt-br/lexicon
 * @importedBy narrative-language/acts/classifier,
 *             narrative-language/acts/projector
 * @level N3
 *
 * Contrato:
 *   compileRule(input, resolution, ctx) → RuleCompilationResult
 *   isRuleMarker(marker)                → boolean
 *   listRuleMarkers()                   → string[]
 *
 * RuleCompilationResult:
 *   {
 *     ok: boolean,
 *     rule: Rule|null,        — { name, on, ifExpr, doExpr, marker, confidence, source }
 *     command: string|null,   — linha pronta para machine.handleLine()
 *     diagnostics: NarrativeDiagnostic[],
 *     error: string|null,
 *   }
 *
 * Marcadores suportados:
 *   se, quando, sempre que, depois que, enquanto, caso, assim que
 *
 * Estratégia de compilação:
 *   1. Detectar marcador de regra no início.
 *   2. Split no primeiro comma top-level → (condition, effect).
 *   3. Compilar condição → IF expression (best-effort).
 *   4. Compilar efeito → DO expression via tabela de projeções.
 *   5. Emitir `rul.add` string válido.
 *
 * Determinismo: nenhuma chamada a Math.random ou wall-clock.
 * Nunca lança — falhas devolvem `{ ok: false, error }`.
 */

import { classOf as lexClassOf } from '../pt-br/lexicon.js';

// ══════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════

/**
 * Marcadores de regra reconhecidos, em ordem de prioridade
 * (mais longos casam primeiro).
 * @type {ReadonlyArray<{ pattern:RegExp, marker:string, weight:number }>}
 * @private
 */
const _RULE_MARKERS = Object.freeze([
  { pattern: /^sempre\s+que\s+/i, marker: 'sempre que', weight: 0.94 },
  { pattern: /^depois\s+que\s+/i,  marker: 'depois que',  weight: 0.92 },
  { pattern: /^assim\s+que\s+/i,   marker: 'assim que',   weight: 0.90 },
  { pattern: /^enquanto\s+/i,      marker: 'enquanto',    weight: 0.88 },
  { pattern: /^quando\s+/i,        marker: 'quando',      weight: 0.92 },
  { pattern: /^caso\s+/i,          marker: 'caso',        weight: 0.88 },
  { pattern: /^se\s+/i,            marker: 'se',          weight: 0.90 },
]);

/**
 * Mapeamento de verbos de ação para comandos DSL.
 * A função recebe o sujeito e objeto e devolve a linha de comando.
 * Se retornar null, a compilação do efeito falha suavemente.
 *
 * @type {Readonly<Object<string, Function>>}
 * @private
 */
const _EFFECT_VERB_MAP = Object.freeze({
  // Movimento
  'sair':   (subj, obj) => obj ? `link.pull.location ${subj} ${obj}` : null,
  'entrar': (subj, obj) => obj ? `link.set.location ${subj} ${obj}` : null,
  'ir':     (subj, obj) => obj ? `link.set.location ${subj} ${obj}` : null,
  'partir': (subj, obj) => obj ? `link.set.location ${subj} ${obj}` : null,
  'chegar': (subj, obj) => obj ? `link.set.location ${subj} ${obj}` : null,
  'fugir':  (subj) => `mut.flag.on ${subj} fugiu`,
  'voltar': (subj) => `mut.flag.on ${subj} voltou`,

  // Ações físicas
  'abrir':  (subj, obj) => obj ? `mut.flag.on ${obj} aberto` : null,
  'fechar': (subj, obj) => obj ? `mut.flag.off ${obj} aberto` : null,
  'pegar':  (subj, obj) => obj ? `link.add.carregando ${subj} ${obj}` : null,
  'soltar': (subj, obj) => obj ? `link.pull.carregando ${subj} ${obj}` : null,
  'quebrar':(subj, obj) => obj ? `mut.flag.on ${obj} quebrado` : null,

  // Comunicação
  'falar':     (subj) => `mut.flag.on ${subj} falou`,
  'gritar':    (subj) => `mut.flag.on ${subj} gritou`,
  'sussurrar': (subj) => `mut.flag.on ${subj} sussurrou`,

  // Interioridade — emite flags para reconhecimento posterior
  'sentir':  (subj) => `mut.flag.on ${subj} sentiu`,
  'temer':   (subj) => `mut.enum ${subj}.emotion medo`,
  'amar':    (subj) => `mut.enum ${subj}.emotion amor`,
  'odiar':   (subj) => `mut.enum ${subj}.emotion odio`,

  // Cognição — emite flags
  'saber':     (subj) => `mut.flag.on ${subj} soube`,
  'descobrir': (subj) => `mut.flag.on ${subj} descobriu`,
  'entender':  (subj) => `mut.flag.on ${subj} entendeu`,

  // Estado
  'morrer':  (subj) => `mut.flag.on ${subj} morto`,
  'viver':   (subj) => `mut.flag.on ${subj} vivo`,
  'ficar':   (subj) => `mut.flag.on ${subj} permaneceu`,
});

/**
 * Mapeamento de verbos de condição para expressões IF best-effort.
 * A função recebe o sujeito e o objeto/estado e devolve a expressão.
 *
 * @type {Readonly<Object<string, Function>>}
 * @private
 */
const _CONDITION_VERB_MAP = Object.freeze({
  // Movimento
  'entrar':  (subj, obj) => obj ? `this.Links.location = ${obj}` : `this.name = ${subj}`,
  'sair':    (subj, obj) => obj ? `this.Links.location != ${obj}` : `this.name = ${subj}`,
  'chegar':  (subj, obj) => obj ? `this.Links.location = ${obj}` : `this.name = ${subj}`,
  'ir':      (subj, obj) => obj ? `this.Links.location = ${obj}` : `this.name = ${subj}`,
  'estar':   (subj, obj) => obj ? `this.Stats.${obj} > 0` : null,
  'estiver': (subj, obj) => obj ? `this.Stats.${obj} > 0` : null,
  'ser':     (subj, obj) => obj ? `this.Enums.${obj} = 1` : null,
  'ter':     (subj, obj) => obj ? `this.Flags.values contains ${obj}` : null,
  'abrir':   (subj, obj) => obj ? `this.Flags.values contains aberto` : null,
});

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function _norm(s) {
  return String(s ?? '').trim().toLowerCase();
}

/**
 * Extrai a string de entrada independente do tipo.
 * @private
 */
function _extractRaw(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input.raw === 'string') return input.raw;
  if (input && input.source && typeof input.source.raw === 'string') {
    return input.source.raw;
  }
  return '';
}

/**
 * Detecta o marcador de regra. Devolve o primeiro hit, ou null.
 * @private
 */
function _detectMarker(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  for (const entry of _RULE_MARKERS) {
    if (entry.pattern.test(s)) {
      return { marker: entry.marker, weight: entry.weight };
    }
  }
  return null;
}

/**
 * Faz split no primeiro comma top-level (não dentro de aspas ou parênteses).
 * Devolve `{ condition, effect }` ou null.
 *
 * @param {string} raw
 * @param {string} marker
 * @returns {{ condition:string, effect:string }|null}
 * @private
 */
function _splitConditionEffect(raw, marker) {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  // Remove o marcador do início
  const markerRe = new RegExp(`^${marker.replace(/\s+/g, '\\s+')}\\s+`, 'i');
  const afterMarker = s.replace(markerRe, '');
  if (afterMarker === s) return null;

  // Encontra o primeiro comma top-level
  let depth = 0;
  let inQuotes = false;
  for (let i = 0; i < afterMarker.length; i++) {
    const ch = afterMarker[i];
    if (ch === "'" || ch === '"') inQuotes = !inQuotes;
    if (inQuotes) continue;
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      const condition = afterMarker.slice(0, i).trim();
      const effect = afterMarker.slice(i + 1).trim().replace(/\.$/, '');
      if (!condition || !effect) return null;
      return { condition, effect };
    }
  }
  return null;
}

/**
 * Tokeniza uma cláusula em palavras (case-insensitive).
 * @private
 */
function _words(clause) {
  return String(clause ?? '')
    .replace(/[.,;!?]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Extrai sujeito (primeira palavra capitalizada) e o resto.
 * @private
 */
function _extractSubject(clause) {
  const words = _words(clause);
  if (words.length === 0) return { subject: null, rest: '' };
  const first = words[0];
  if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(first)) {
    return { subject: first, rest: words.slice(1).join(' ') };
  }
  // "alguém" — genérico
  if (_norm(first) === 'alguém' || _norm(first) === 'alguem') {
    return { subject: null, rest: words.slice(1).join(' ') };
  }
  return { subject: null, rest: words.join(' ') };
}

/**
 * Extrai verbo (primeira palavra VERB-like) e objeto (restante).
 * Heurística: considera palavras que terminam em `-ar`, `-er`, `-ir`
 * ou que estão em listas conhecidas.
 * @private
 */
function _extractVerbObject(rest) {
  const words = _words(rest);
  if (words.length === 0) return { verb: null, object: null };

  const VERB_HINTS = new Set([
    'entrar', 'sair', 'chegar', 'partir', 'ir', 'fugir', 'voltar', 'abrir',
    'fechar', 'pegar', 'soltar', 'quebrar', 'falar', 'gritar', 'sussurrar',
    'sentir', 'temer', 'amar', 'odiar', 'saber', 'descobrir', 'entender',
    'morrer', 'viver', 'ficar', 'estar', 'estiver', 'ser', 'ter',
    'entra', 'sai', 'chega', 'parte', 'vai', 'foge', 'volta', 'abre',
    'fecha', 'pega', 'solta', 'quebra', 'fala', 'grita', 'sussurra',
    'sente', 'teme', 'ama', 'odeia', 'sabe', 'descobre', 'entende',
    'morre', 'vive', 'fica', 'está', 'estiver', 'é', 'tem',
    'entrará', 'sairá', 'chegará', 'partirá', 'fugirá', 'voltará', 'abrirá',
    'fechará', 'pegará', 'fará', 'sentirá', 'saberá',
  ]);

  for (let i = 0; i < words.length; i++) {
    const w = _norm(words[i]);
    if (VERB_HINTS.has(w)) {
      const object = words.slice(i + 1).join(' ').trim() || null;
      return { verb: w, object };
    }
  }

  // Fallback: primeira palavra é verbo
  const first = _norm(words[0]);
  const object = words.slice(1).join(' ').trim() || null;
  return { verb: first, object };
}

/**
 * Remove preposições de um objeto.
 * @private
 */
function _stripPrepositions(obj) {
  if (!obj) return null;
  const PREPS = ['em', 'no', 'na', 'nos', 'nas', 'de', 'do', 'da', 'dos', 'das',
                 'para', 'por', 'com', 'sem', 'ao', 'aos', 'à', 'às'];
  const words = _words(obj);
  while (words.length > 0 && PREPS.includes(_norm(words[0]))) {
    words.shift();
  }
  return words.join(' ').trim() || null;
}

/**
 * Remove artigos de um objeto.
 * @private
 */
function _stripArticles(obj) {
  if (!obj) return null;
  const ARTS = ['o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas'];
  const words = _words(obj);
  while (words.length > 0 && ARTS.includes(_norm(words[0]))) {
    words.shift();
  }
  return words.join(' ').trim() || null;
}

/**
 * Normaliza um objeto para uso em comando DSL (PascalCase → nome tal como
 * aparece; sem espaços).
 * @private
 */
function _normalizeObject(obj) {
  if (!obj) return null;
  const cleaned = _stripArticles(_stripPrepositions(obj));
  if (!cleaned) return null;
  // Mantém a forma como o autor escreveu (capitalizada se for nome próprio)
  return cleaned.trim();
}

/**
 * Gera um nome único para a regra.
 * @private
 */
function _mkRuleName(raw) {
  const s = String(raw ?? '').trim();
  const truncated = s.length > 60 ? s.slice(0, 57) + '...' : s;
  return truncated.replace(/"/g, "'");
}

// ══════════════════════════════════════════════════════════════
// COMPILAÇÃO — CONDIÇÃO
// ══════════════════════════════════════════════════════════════

/**
 * Compila a cláusula de condição para uma expressão IF.
 * Best-effort. Devolve `{ ifExpr, confidence }`.
 *
 * @param {string} condition
 * @returns {{ ifExpr:string, confidence:number, usedFallback:boolean }}
 * @private
 */
function _compileCondition(condition) {
  const { subject, rest } = _extractSubject(condition);
  const { verb, object } = _extractVerbObject(rest);

  // Sem verbo → fallback
  if (!verb) {
    return { ifExpr: 'true', confidence: 0.30, usedFallback: true };
  }

  const mapped = _CONDITION_VERB_MAP[verb];
  if (!mapped) {
    return { ifExpr: 'true', confidence: 0.30, usedFallback: true };
  }

  const normalizedObject = _normalizeObject(object);

  let expr = null;
  try {
    expr = mapped(subject, normalizedObject);
  } catch {
    expr = null;
  }

  if (!expr) {
    return { ifExpr: 'true', confidence: 0.30, usedFallback: true };
  }

  // Adiciona guard de identidade se temos sujeito
  if (subject) {
    expr = `this.name = ${subject} AND (${expr})`;
  }

  return { ifExpr: expr, confidence: 0.75, usedFallback: false };
}

// ══════════════════════════════════════════════════════════════
// COMPILAÇÃO — EFEITO
// ══════════════════════════════════════════════════════════════

/**
 * Compila a cláusula de efeito para uma expressão DO.
 * Best-effort. Devolve `{ doExpr, confidence }`.
 *
 * @param {string} effect
 * @returns {{ doExpr:string|null, confidence:number, usedFallback:boolean }}
 * @private
 */
function _compileEffect(effect) {
  const { subject, rest } = _extractSubject(effect);
  const { verb, object } = _extractVerbObject(rest);

  if (!verb || !subject) {
    return { doExpr: null, confidence: 0.20, usedFallback: true };
  }

  const handler = _EFFECT_VERB_MAP[verb];
  if (!handler) {
    return { doExpr: null, confidence: 0.20, usedFallback: true };
  }

  const normalizedObject = _normalizeObject(object);

  let cmd = null;
  try {
    cmd = handler(subject, normalizedObject);
  } catch {
    cmd = null;
  }

  if (!cmd) {
    // Efeito simples sem objeto: usar "sentiu" como fallback
    cmd = `mut.flag.on ${subject} ${verb}`;
    return { doExpr: cmd, confidence: 0.40, usedFallback: true };
  }

  return { doExpr: cmd, confidence: 0.75, usedFallback: false };
}

// ══════════════════════════════════════════════════════════════
// API PRINCIPAL
// ══════════════════════════════════════════════════════════════

/**
 * Compila uma regra narrativa natural para `rul.add`.
 *
 * @param {Object|string} input     — LinguisticModel | NarrativeAct | string
 * @param {Object} [resolution]     — não usado ainda (reservado)
 * @param {Object} [ctx={}]
 * @returns {{
 *   ok: boolean,
 *   rule: Object|null,
 *   command: string|null,
 *   diagnostics: Array,
 *   error: string|null,
 * }}
 */
export function compileRule(input, resolution = null, ctx = {}) {
  const empty = { ok: false, rule: null, command: null, diagnostics: [], error: null };

  const raw = _extractRaw(input);
  if (!raw.trim()) {
    return { ...empty, error: 'entrada vazia' };
  }

  // ── 1. Marcador ─────────────────────────────────────────
  const markerHit = _detectMarker(raw);
  if (!markerHit) {
    return { ...empty, error: 'sem marcador de regra' };
  }

  // ── 2. Split ────────────────────────────────────────────
  const split = _splitConditionEffect(raw, markerHit.marker);
  if (!split) {
    return { ...empty, error: 'não foi possível separar condição e efeito' };
  }

  // ── 3. Compila condição ─────────────────────────────────
  const cond = _compileCondition(split.condition);
  const eff = _compileEffect(split.effect);

  if (!eff.doExpr) {
    return { ...empty, error: 'efeito não compilável' };
  }

  // ── 4. Monta rul.add ────────────────────────────────────
  const name = _mkRuleName(raw);
  const on = 'component:updated';
  const ifExpr = cond.ifExpr;
  const doExpr = eff.doExpr;

  const command = `rul.add "${name}" ON: ${on} IF: ${ifExpr} DO: ${doExpr}`;

  const confidence = Math.round(
    Math.min(cond.confidence, eff.confidence) * 100
  ) / 100;

  const diagnostics = [];
  if (cond.usedFallback) {
    diagnostics.push({
      severity: 'warning',
      phase: 'semantic',
      code: 'SEM_OP_LOW_CONFIDENCE',
      message: `Condição "if" compilada com fallback. Revise a regra antes de ativar.`,
      sourceSpan: null,
      suggestions: [`Condição original: "${split.condition}"`],
      related: [],
      context: { condition: split.condition, compiled: cond.ifExpr },
    });
  }
  if (eff.usedFallback) {
    diagnostics.push({
      severity: 'warning',
      phase: 'semantic',
      code: 'SEM_OP_LOW_CONFIDENCE',
      message: `Efeito "do" compilado com fallback.`,
      sourceSpan: null,
      suggestions: [`Efeito original: "${split.effect}"`],
      related: [],
      context: { effect: split.effect, compiled: eff.doExpr },
    });
  }

  return {
    ok: true,
    rule: {
      name,
      on,
      ifExpr,
      doExpr,
      marker: markerHit.marker,
      confidence,
      source: { raw: String(raw) },
      condition: split.condition,
      effect: split.effect,
    },
    command,
    diagnostics,
    error: null,
  };
}

/**
 * Verifica se uma string é um marcador de regra reconhecido.
 * @param {string} marker
 * @returns {boolean}
 */
export function isRuleMarker(marker) {
  const m = _norm(marker);
  return _RULE_MARKERS.some((e) => e.marker === m);
}

/**
 * Lista os marcadores de regra reconhecidos.
 * @returns {string[]}
 */
export function listRuleMarkers() {
  return _RULE_MARKERS.map((e) => e.marker);
}

/**
 * Devolve o peso associado a um marcador, ou 0.
 * @param {string} marker
 * @returns {number}
 */
export function markerWeight(marker) {
  const m = _norm(marker);
  const entry = _RULE_MARKERS.find((e) => e.marker === m);
  return entry?.weight ?? 0;
}

/**
 * Devolve os verbos de efeito reconhecidos.
 * @returns {string[]}
 */
export function listEffectVerbs() {
  return Object.keys(_EFFECT_VERB_MAP).sort();
}

/**
 * Devolve os verbos de condição reconhecidos.
 * @returns {string[]}
 */
export function listConditionVerbs() {
  return Object.keys(_CONDITION_VERB_MAP).sort();
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const RuleCompiler = Object.freeze({
  compileRule,
  isRuleMarker,
  listRuleMarkers,
  markerWeight,
  listEffectVerbs,
  listConditionVerbs,
});