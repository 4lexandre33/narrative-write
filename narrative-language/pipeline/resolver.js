/**
 * @file resolver.js
 * @module narrative-language/pipeline
 * @description Resolução de referências (pronomes, sintagmas definidos) para
 *              entidades do contexto. Aplica overrides do autor e preferências
 *              aprendidas (user-lexicon). Emite diagnósticos de ambiguidade.
 * @imports narrative-language/ir/schema,
 *          narrative-language/pt-br/lexicon,
 *          narrative-language/user-lexicon
 * @importedBy narrative-language/pipeline/interpreter,
 *             narrative-language/acts/dimensions,
 *             narrative-language/index
 * @level N2
 *
 * Fase 7 — LUME:
 *   - `_collectCandidates` consulta user-lexicon e aplica boost.
 *   - `_resolveToken` computa chaves candidatas (`<sid>.t<i>` e
 *     `<sid>.o<offset>`) para localizar overrides em múltiplos formatos.
 *   - `_collectExplicit` também aplica boost de lexicon.
 */

import {
  DIAGNOSTIC_CODES,
  DIAGNOSTIC_SEVERITIES,
} from '../ir/schema.js';
import { classOf as lexClassOf } from '../pt-br/lexicon.js';
import { boostFor as lexiconBoostFor } from '../user-lexicon.js';

// ══════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════

/**
 * Pronomes pessoais e suas propriedades de gênero/número.
 * @type {Readonly<Object<string, { gender:string|null, number:string, person:number }>>}
 * @private
 */
const _PRONOUNS = Object.freeze({
  'ele':     { gender: 'masculine', number: 'singular', person: 3 },
  'ela':     { gender: 'feminine',  number: 'singular', person: 3 },
  'eles':    { gender: 'masculine', number: 'plural',   person: 3 },
  'elas':    { gender: 'feminine',  number: 'plural',   person: 3 },
  'você':    { gender: null,        number: 'singular', person: 2 },
  'vocês':   { gender: null,        number: 'plural',   person: 2 },
  'eu':      { gender: null,        number: 'singular', person: 1 },
  'nós':     { gender: null,        number: 'plural',   person: 1 },
  'isto':    { gender: null,        number: 'singular', person: 3 },
  'isso':    { gender: null,        number: 'singular', person: 3 },
  'aquilo':  { gender: null,        number: 'singular', person: 3 },
  'este':    { gender: 'masculine', number: 'singular', person: 3 },
  'esta':    { gender: 'feminine',  number: 'singular', person: 3 },
  'esse':    { gender: 'masculine', number: 'singular', person: 3 },
  'essa':    { gender: 'feminine',  number: 'singular', person: 3 },
  'aquele':  { gender: 'masculine', number: 'singular', person: 3 },
  'aquela':  { gender: 'feminine',  number: 'singular', person: 3 },
  'o':       { gender: 'masculine', number: 'singular', person: 3 },
  'a':       { gender: 'feminine',  number: 'singular', person: 3 },
  'os':      { gender: 'masculine', number: 'plural',   person: 3 },
  'as':      { gender: 'feminine',  number: 'plural',   person: 3 },
});

/**
 * Confiança por fonte de resolução.
 * @type {Readonly<Object<string, number>>}
 * @private
 */
const _SOURCE_CONFIDENCE = Object.freeze({
  override:     1.00,
  explicit:     0.98,
  scene:        0.85,
  recent:       0.70,
  chapter:      0.55,
  project:      0.40,
  unresolved:   0.00,
});

/**
 * Limite abaixo do qual dois candidatos são considerados empatados.
 * @type {number}
 * @private
 */
const _AMBIGUITY_THRESHOLD = 0.15;

// ══════════════════════════════════════════════════════════════
// HELPERS INTERNOS
// ══════════════════════════════════════════════════════════════

function _isPronoun(lemma) {
  return lemma in _PRONOUNS;
}

function _mkDiag(code, message, span, context = null) {
  const meta = DIAGNOSTIC_CODES[code] ?? {
    severity: 'warning',
    phase: 'referential',
  };
  return {
    severity: meta.severity,
    phase: meta.phase,
    code,
    message,
    sourceSpan: span,
    suggestions: [],
    related: [],
    context,
  };
}

function _mkReference(kind, entityId, raw, lemma, resolvedFrom, confidence) {
  return {
    kind,
    entityId: kind === 'entity' ? entityId : null,
    raw: String(raw ?? ''),
    lemma: String(lemma ?? raw ?? ''),
    resolvedFrom,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

function _compareCandidates(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  return String(a.entityId).localeCompare(String(b.entityId));
}

// ══════════════════════════════════════════════════════════════
// COLETA DE CANDIDATOS (com lexicon boost)
// ══════════════════════════════════════════════════════════════

/**
 * Coleta todos os candidatos possíveis para uma referência pronominal.
 * Aplica boost de user-lexicon se `lexicon` for fornecido.
 *
 * @param {Object} pronoun — { gender, number, person, lemma }
 * @param {Object} ctx
 * @param {Map<string, Object>|null} lexicon
 * @returns {Candidate[]}
 * @private
 */
function _collectCandidates(pronoun, ctx, lexicon) {
  const out = [];
  const seenIds = new Set();

  const push = (entity, source) => {
    if (!entity || !entity.id) return;
    if (seenIds.has(entity.id)) return;
    seenIds.add(entity.id);

    if (pronoun.gender && entity.gender && entity.gender !== pronoun.gender) return;
    if (pronoun.number && entity.number && entity.number !== pronoun.number) return;

    let score = _SOURCE_CONFIDENCE[source] ?? 0.3;

    // Boost do lexicon — só quando o lemma do pronome tem preferência
    if (lexicon && pronoun.lemma) {
      try {
        const boost = lexiconBoostFor(pronoun.lemma, entity.id, lexicon);
        if (boost > 0) score = Math.min(1, score + boost);
      } catch { /* isola */ }
    }

    out.push({
      entityId: entity.id,
      name: entity.name ?? entity.id,
      shortId: entity.shortId ?? '',
      gender: entity.gender ?? null,
      number: entity.number ?? null,
      source,
      score,
    });
  };

  for (const e of ctx.sceneEntities ?? []) push(e, 'scene');
  for (const e of ctx.recentEntities ?? []) push(e, 'recent');
  for (const e of ctx.chapterEntities ?? []) push(e, 'chapter');
  for (const e of ctx.projectEntities ?? []) push(e, 'project');

  return out.sort(_compareCandidates);
}

/**
 * Coleta candidatos para referência explícita (nome próprio).
 * Também aplica boost de lexicon.
 *
 * @param {string} raw
 * @param {string} lemma
 * @param {Object} ctx
 * @param {Map<string, Object>|null} lexicon
 * @returns {Candidate[]}
 * @private
 */
function _collectExplicit(raw, lemma, ctx, lexicon) {
  const target = String(raw ?? lemma ?? '').toLowerCase().trim();
  if (!target) return [];

  const out = [];
  const seenIds = new Set();
  const all = [
    ...(ctx.sceneEntities ?? []),
    ...(ctx.recentEntities ?? []),
    ...(ctx.chapterEntities ?? []),
    ...(ctx.projectEntities ?? []),
  ];

  for (const e of all) {
    if (!e || !e.id || seenIds.has(e.id)) continue;
    const name = String(e.name ?? '').toLowerCase();
    const shortId = String(e.shortId ?? '').toLowerCase();
    if (name === target || shortId === target || name.split(/\s+/)[0] === target) {
      seenIds.add(e.id);

      let score = _SOURCE_CONFIDENCE.explicit;
      if (lexicon) {
        try {
          const boost = lexiconBoostFor(target, e.id, lexicon);
          if (boost > 0) score = Math.min(1, score + boost);
        } catch { /* isola */ }
      }

      out.push({
        entityId: e.id,
        name: e.name ?? e.id,
        shortId: e.shortId ?? '',
        gender: e.gender ?? null,
        number: e.number ?? null,
        source: 'explicit',
        score,
      });
    }
  }

  return out.sort(_compareCandidates);
}

// ══════════════════════════════════════════════════════════════
// APLICAÇÃO DE OVERRIDES
// ══════════════════════════════════════════════════════════════

/**
 * Aplica um override a candidatos. Tenta todas as chaves fornecidas
 * em ordem; a primeira que casar ganha.
 *
 * @param {string[]} keys
 * @param {Candidate[]} candidates
 * @param {Map<string, Object>} overrides
 * @returns {{ candidates:Candidate[], applied:boolean, choseId:string|null, usedKey:string|null }}
 * @private
 */
function _applyOverride(keys, candidates, overrides) {
  if (!overrides || !(overrides instanceof Map)) {
    return { candidates, applied: false, choseId: null, usedKey: null };
  }
  if (!Array.isArray(keys) || keys.length === 0) {
    return { candidates, applied: false, choseId: null, usedKey: null };
  }

  let ov = null;
  let usedKey = null;

  for (const k of keys) {
    if (!k) continue;
    const entry = overrides.get(k);
    if (entry && entry.chose) {
      ov = entry;
      usedKey = k;
      break;
    }
  }

  if (!ov) return { candidates, applied: false, choseId: null, usedKey: null };

  const chosen = candidates.find((c) => c.entityId === ov.chose);
  if (!chosen) {
    return {
      candidates: [{
        entityId: ov.chose,
        name: ov.chose,
        shortId: '',
        gender: null,
        number: null,
        source: 'override',
        score: _SOURCE_CONFIDENCE.override,
      }],
      applied: true,
      choseId: ov.chose,
      usedKey,
    };
  }

  return {
    candidates: [{ ...chosen, source: 'override', score: _SOURCE_CONFIDENCE.override }],
    applied: true,
    choseId: ov.chose,
    usedKey,
  };
}

// ══════════════════════════════════════════════════════════════
// RESOLUÇÃO POR TOKEN
// ══════════════════════════════════════════════════════════════

function _isReferenceToken(token) {
  if (!token || typeof token.lemma !== 'string') return false;
  if (token.pos === 'PRON') return true;
  if (token.pos === 'PROPN') return true;
  return false;
}

/**
 * Computa todas as chaves canônicas para um token. O resolver tenta
 * em ordem de prioridade (`.o<offset>` primeiro, depois `.t<index>`).
 *
 * @param {string} sentenceId
 * @param {number} tokenIndex
 * @param {Object} token
 * @returns {string[]}
 * @private
 */
function _keysForToken(sentenceId, tokenIndex, token) {
  const keys = [];
  const sid = String(sentenceId || 's1');

  const offset = token?.source?.start;
  if (typeof offset === 'number') {
    keys.push(`${sid}.o${offset}`);
  }
  keys.push(`${sid}.t${tokenIndex}`);
  return keys;
}

/**
 * Resolve um único token de referência.
 *
 * @param {Object} token
 * @param {number} tokenIndex
 * @param {Object} ctx
 * @param {Map<string, Object>} overrides
 * @param {Map<string, Object>|null} lexicon
 * @param {string} sentenceId
 * @returns {{ reference:Object, diagnostic:Object|null }}
 * @private
 */
function _resolveToken(token, tokenIndex, ctx, overrides, lexicon, sentenceId) {
  const raw = token.text;
  const lemma = (token.lemma ?? raw ?? '').toLowerCase();

  const keys = _keysForToken(sentenceId, tokenIndex, token);

  // ── Caso A: pronome ────────────────────────────────────
  if (_isPronoun(lemma)) {
    const info = _PRONOUNS[lemma];
    const pronoun = {
      gender: info.gender,
      number: info.number,
      person: info.person,
      lemma,
    };

    const all = _collectCandidates(pronoun, ctx, lexicon);
    const { candidates, applied } = _applyOverride(keys, all, overrides);

    if (candidates.length === 0) {
      return {
        reference: _mkReference('unresolved', null, raw, lemma, null, 0),
        diagnostic: _mkDiag(
          'REF_UNRESOLVED',
          `Referência "${raw}" sem candidato resolvível`,
          token.source ?? null,
          { raw, lemma, keys }
        ),
      };
    }

    if (applied) {
      return {
        reference: _mkReference(
          'entity', candidates[0].entityId, raw, lemma, 'override', 1.0
        ),
        diagnostic: null,
      };
    }

    if (candidates.length >= 2) {
      const [a, b] = candidates;
      if (Math.abs(a.score - b.score) < _AMBIGUITY_THRESHOLD) {
        return {
          reference: _mkReference(
            'unresolved', null, raw, lemma, null, a.score
          ),
          diagnostic: _mkDiag(
            'REF_AMBIGUOUS',
            `Referência "${raw}" ambígua entre ${candidates.length} candidatos`,
            token.source ?? null,
            {
              raw,
              lemma,
              keys,
              candidates: candidates.slice(0, 5).map((c) => ({
                entityId: c.entityId,
                name: c.name,
                score: c.score,
              })),
            }
          ),
        };
      }
    }

    return {
      reference: _mkReference(
        'entity',
        candidates[0].entityId,
        raw,
        lemma,
        candidates[0].source,
        candidates[0].score
      ),
      diagnostic: null,
    };
  }

  // ── Caso B: nome próprio ───────────────────────────────
  if (token.pos === 'PROPN') {
    const all = _collectExplicit(raw, lemma, ctx, lexicon);
    const { candidates, applied } = _applyOverride(keys, all, overrides);

    if (applied) {
      return {
        reference: _mkReference(
          'entity', candidates[0].entityId, raw, lemma, 'override', 1.0
        ),
        diagnostic: null,
      };
    }

    if (candidates.length === 0) {
      return {
        reference: _mkReference('literal', null, raw, lemma, 'proper', 0.5),
        diagnostic: null,
      };
    }

    return {
      reference: _mkReference(
        'entity',
        candidates[0].entityId,
        raw,
        lemma,
        'explicit',
        _SOURCE_CONFIDENCE.explicit
      ),
      diagnostic: null,
    };
  }

  return { reference: null, diagnostic: null };
}

// ══════════════════════════════════════════════════════════════
// API PRINCIPAL
// ══════════════════════════════════════════════════════════════

/**
 * Resolve todas as referências de um LinguisticModel.
 *
 * @param {Object} model      — de analyzer.js
 * @param {Object} [ctx={}]   — contexto narrativo
 * @param {Map<string, Object>} [overrides=null]  — overrides do autor
 * @returns {ResolutionResult}
 */
export function resolve(model, ctx = {}, overrides = null) {
  if (!model || !Array.isArray(model.tokens)) {
    return {
      references: [],
      diagnostics: [],
      confidence: 0,
      unresolvedCandidates: [],
    };
  }

  const references = [];
  const diagnostics = [];
  const unresolvedCandidates = [];
  const sentenceId = model.sentenceId ?? 's1';

  // Lexicon: passado via ctx.userLexicon
  const lexicon = ctx.userLexicon instanceof Map ? ctx.userLexicon : null;

  for (let i = 0; i < model.tokens.length; i++) {
    const token = model.tokens[i];
    if (!_isReferenceToken(token)) continue;

    let result;
    try {
      result = _resolveToken(token, i, ctx, overrides, lexicon, sentenceId);
    } catch {
      result = {
        reference: _mkReference('unresolved', null, token.text, token.lemma, null, 0),
        diagnostic: null,
      };
    }

    if (result.reference) references.push(result.reference);
    if (result.diagnostic) {
      diagnostics.push(result.diagnostic);
      if (result.diagnostic.context?.candidates) {
        for (const c of result.diagnostic.context.candidates) {
          unresolvedCandidates.push({
            entityId: c.entityId,
            name: c.name,
            shortId: '',
            gender: null,
            number: null,
            source: 'ambiguous',
            score: c.score,
          });
        }
      }
    }
  }

  const resolved = references.filter((r) => r.kind === 'entity');
  const confidence = resolved.length > 0
    ? resolved.reduce((s, r) => s + r.confidence, 0) / resolved.length
    : (references.length > 0 ? 0.5 : 1.0);

  return {
    references,
    diagnostics,
    confidence: Math.round(confidence * 100) / 100,
    unresolvedCandidates,
  };
}

/**
 * Aplica overrides a uma lista de candidatos (para UI).
 * @param {string[]|string} keys
 * @param {Candidate[]} candidates
 * @param {Map<string, Object>} overrides
 * @returns {{ candidates:Candidate[], applied:boolean, choseId:string|null, usedKey:string|null }}
 */
export function applyOverride(keys, candidates, overrides) {
  const keyList = Array.isArray(keys) ? keys : [keys];
  return _applyOverride(keyList, candidates, overrides);
}

/**
 * Lista os pronomes reconhecidos.
 * @returns {string[]}
 */
export function listPronouns() {
  return Object.keys(_PRONOUNS);
}

/**
 * Devolve as propriedades de um pronome, ou null.
 * @param {string} lemma
 * @returns {Object|null}
 */
export function pronounInfo(lemma) {
  const info = _PRONOUNS[lemma];
  return info ? { ...info, lemma } : null;
}

/**
 * Devolve as confidences por fonte (para debug/UI).
 * @returns {Readonly<Object<string, number>>}
 */
export function sourceConfidences() {
  return _SOURCE_CONFIDENCE;
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const Resolver = Object.freeze({
  resolve,
  applyOverride,
  listPronouns,
  pronounInfo,
  sourceConfidences,
});