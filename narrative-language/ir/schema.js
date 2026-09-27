/**
 * @file schema.js
 * @module narrative-language/ir
 * @description Contrato canônico do `narrativeIR@1.0` — constantes, enums
 *              e typedefs. Fonte única de verdade sobre o que é um IR válido.
 * @imports — (nenhum)
 * @importedBy narrative-language/ir/validator,
 *             narrative-language/ir/source-map,
 *             narrative-language/pipeline/interpreter,
 *             narrative-language/acts/classifier,
 *             narrative-language/acts/dimensions,
 *             narrative-language/acts/projector,
 *             narrative-language/diagnostics/narrative-diagnostics,
 *             narrative-language/diagnostics/trace,
 *             narrative-language/index
 * @level N0
 *
 * Toda evolução de schema exige bump de IR_VERSION.
 * MAJOR: quebra compatibilidade. MINOR: adições retrocompatíveis.
 */

// ══════════════════════════════════════════════════════════════
// VERSÃO
// ══════════════════════════════════════════════════════════════

/**
 * Versão atual do schema.
 * @type {string}
 */
export const IR_VERSION = '1.0';

// ══════════════════════════════════════════════════════════════
// OPERAÇÕES NARRATIVAS
// ══════════════════════════════════════════════════════════════

/**
 * As 8 operações narrativas fundamentais.
 * Uma unidade pode conter 1..N operações.
 * @type {ReadonlyArray<string>}
 */
export const OPERATIONS = Object.freeze([
  'represent',
  'describe',
  'enunciate',
  'expose',
  'evaluate',
  'interiorize',
  'structure',
  'focalize',
]);

// ══════════════════════════════════════════════════════════════
// DIMENSÕES
// ══════════════════════════════════════════════════════════════

/**
 * Fontes de enunciação.
 * @type {ReadonlyArray<string>}
 */
export const VOICE_KINDS = Object.freeze([
  'narrator',
  'character',
  'group',
  'document',
  'external',
  'unknown',
]);

/**
 * Tipos de focalização.
 * @type {ReadonlyArray<string>}
 */
export const FOCALIZATION_KINDS = Object.freeze([
  'external',
  'narrator',
  'character',
  'omniscient',
]);

/**
 * Formas discursivas.
 * @type {ReadonlyArray<string>}
 */
export const DISCOURSE_FORMS = Object.freeze([
  'narration',
  'description',
  'direct-speech',
  'indirect-speech',
  'thought',
  'free-indirect-discourse',
  'exposition',
  'commentary',
]);

/**
 * Papéis semânticos reconhecidos.
 * @type {ReadonlyArray<string>}
 */
export const SEMANTIC_ROLES = Object.freeze([
  'agent',
  'experiencer',
  'patient',
  'theme',
  'target',
  'source',
  'recipient',
  'beneficiary',
  'instrument',
  'location',
  'origin',
  'destination',
  'cause',
  'purpose',
  'manner',
  'means',
  'time',
]);

/**
 * Categorias epistemológicas.
 * @type {ReadonlyArray<string>}
 */
export const EPISTEMIC_KINDS = Object.freeze([
  'fact',
  'perception',
  'knowledge',
  'belief',
  'memory',
  'ignorance',
]);

/**
 * Quadros temporais. Separação crítica:
 *   story      → tempo interno à narrativa ('anos antes')
 *   discourse  → tempo da enunciação (narrador)
 *   simulation → tempo lógico do ECS (ticks)
 * @type {ReadonlyArray<string>}
 */
export const TEMPORAL_FRAMES = Object.freeze([
  'story',
  'discourse',
  'simulation',
]);

/**
 * Aspectos verbais preservados.
 * @type {ReadonlyArray<string>}
 */
export const ASPECT_KINDS = Object.freeze([
  'concluded',
  'ongoing',
  'habitual',
  'durative',
  'iterative',
  'punctual',
]);

/**
 * Modalidades.
 * @type {ReadonlyArray<string>}
 */
export const MODALITY_KINDS = Object.freeze([
  'possibility',
  'obligation',
  'desire',
  'capability',
  'attempt',
  'certainty',
  'probability',
  'doubt',
  'intention',
]);

/**
 * Tipos de negação. Não reduzir a boolean.
 * @type {ReadonlyArray<string>}
 */
export const NEGATION_KINDS = Object.freeze([
  'not',
  'never',
  'not-yet',
  'no-longer',
  'nor',
  'without',
]);

// ══════════════════════════════════════════════════════════════
// DIAGNÓSTICOS
// ══════════════════════════════════════════════════════════════

/**
 * Severidades. `error` bloqueia promoção do IR.
 * @type {ReadonlyArray<string>}
 */
export const DIAGNOSTIC_SEVERITIES = Object.freeze([
  'error',
  'warning',
  'info',
]);

/**
 * Fases de diagnóstico. `validation` cobre erros do próprio IR.
 * @type {ReadonlyArray<string>}
 */
export const DIAGNOSTIC_PHASES = Object.freeze([
  'lexical',
  'syntactic',
  'semantic',
  'referential',
  'narrative',
  'epistemic',
  'continuity',
  'execution',
  'validation',
]);

/**
 * Catálogo de códigos de diagnóstico com metadados.
 * A fase e a severidade default são fixas; o caller pode sobrescrever
 * severidade em casos específicos.
 *
 * @type {Readonly<Object<string, { severity:string, phase:string, message:string }>>}
 */
export const DIAGNOSTIC_CODES = Object.freeze({
  // ── Léxico ────────────────────────────────────────────────
  LEX_UNKNOWN_WORD: {
    severity: 'info',
    phase: 'lexical',
    message: 'Palavra fora do léxico curado',
  },

  // ── Sintaxe ───────────────────────────────────────────────
  SYN_NO_VERB: {
    severity: 'warning',
    phase: 'syntactic',
    message: 'Sentença sem predicado verbal claro',
  },
  SYN_AMBIGUOUS_SUBJECT: {
    severity: 'warning',
    phase: 'syntactic',
    message: 'Sujeito elíptico não resolvível',
  },

  // ── Semântica ─────────────────────────────────────────────
  SEM_OP_LOW_CONFIDENCE: {
    severity: 'info',
    phase: 'semantic',
    message: 'Classificação de operação com baixa confiança',
  },

  // ── Referências ───────────────────────────────────────────
  REF_AMBIGUOUS: {
    severity: 'warning',
    phase: 'referential',
    message: 'Referência ambígua — múltiplos candidatos viáveis',
  },
  REF_UNRESOLVED: {
    severity: 'warning',
    phase: 'referential',
    message: 'Referência sem candidato resolvível',
  },

  // ── Narrativa ─────────────────────────────────────────────
  NAR_VOICE_UNCERTAIN: {
    severity: 'info',
    phase: 'narrative',
    message: 'Voz não determinável com confiança suficiente',
  },
  NAR_FOCALIZATION_UNCERTAIN: {
    severity: 'info',
    phase: 'narrative',
    message: 'Focalização ambígua',
  },

  // ── Epistemologia ─────────────────────────────────────────
  EPI_BELIEF_AS_FACT: {
    severity: 'warning',
    phase: 'epistemic',
    message: 'Crença interpretada como fato — verificar',
  },

  // ── Continuidade ──────────────────────────────────────────
  CONT_ENTITY_MISSING: {
    severity: 'warning',
    phase: 'continuity',
    message: 'Referência a entidade que nunca foi criada',
  },

  // ── Validação do IR ───────────────────────────────────────
  IR_INVALID_VERSION: {
    severity: 'error',
    phase: 'validation',
    message: 'Versão do IR incompatível',
  },
  IR_MISSING_FIELD: {
    severity: 'error',
    phase: 'validation',
    message: 'Campo obrigatório ausente',
  },
  IR_DUPLICATE_ACT_ID: {
    severity: 'error',
    phase: 'validation',
    message: 'ID de act duplicado',
  },
  IR_INVALID_CONFIDENCE: {
    severity: 'error',
    phase: 'validation',
    message: 'Confiança fora do intervalo [0, 1]',
  },
  IR_INVALID_OPERATION: {
    severity: 'error',
    phase: 'validation',
    message: 'Operação narrativa inválida',
  },
  IR_FOCALIZE_WITHOUT_FOCALIZATION: {
    severity: 'error',
    phase: 'validation',
    message: 'Operação "focalize" sem focalização preenchida',
  },
  IR_INVALID_SPAN: {
    severity: 'error',
    phase: 'validation',
    message: 'SourceSpan malformado',
  },
  IR_MISSING_PROVENANCE: {
    severity: 'error',
    phase: 'validation',
    message: 'Act sem proveniência',
  },
  IR_MALFORMED_REFERENCE: {
    severity: 'error',
    phase: 'validation',
    message: 'Referência malformada (kind/entityId inconsistentes)',
  },
  IR_HAS_ERROR_DIAGNOSTICS: {
    severity: 'error',
    phase: 'validation',
    message: 'IR contém diagnósticos de severidade "error"',
  },
});

// ══════════════════════════════════════════════════════════════
// TYPEDEFS (documentação executável)
// ══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} NarrativeIR
 * @property {string} version                — IR_VERSION
 * @property {string} documentId
 * @property {string} generatedAt            — ISO 8601
 * @property {string} sourceHash             — hash do texto que originou
 * @property {NarrativeAct[]} acts
 * @property {NarrativeDiagnostic[]} diagnostics
 * @property {IRIndex} index
 * @property {IRProvenance} provenance
 */

/**
 * @typedef {Object} IRIndex
 * @property {Object<string, string[]>} byEntity     — entityId → actIds
 * @property {Object<string, string[]>} byOperation  — operation → actIds
 * @property {Object<string, string>}   bySpan       — spanKey → actId
 */

/**
 * @typedef {Object} IRProvenance
 * @property {string} segmenter
 * @property {string} nlpBackend
 * @property {string} classifier
 * @property {string} lexicon
 * @property {number} latencyMs
 */

/**
 * @typedef {Object} NarrativeAct
 * @property {string} id                     — 'act-<sentence>-<paragraph>-<n>'
 * @property {'narrative-act'} kind
 * @property {string[]} operations           — 1..N de OPERATIONS
 * @property {number} confidence             — [0, 1]
 * @property {Evidence[]} evidence
 * @property {Voice} voice
 * @property {Focalization|null} focalization
 * @property {string} form                   — de DISCOURSE_FORMS
 * @property {string|null} tense
 * @property {string|null} aspect            — de ASPECT_KINDS
 * @property {string|null} modality          — de MODALITY_KINDS
 * @property {string|null} negation          — de NEGATION_KINDS
 * @property {string|null} epistemic         — de EPISTEMIC_KINDS
 * @property {Proposition} proposition
 * @property {Reference[]} references
 * @property {DiscourseRelation[]} discourseRelations
 * @property {SourceSpan} source
 * @property {IRProvenance} provenance
 */

/**
 * @typedef {Object} Voice
 * @property {string} kind                   — de VOICE_KINDS
 * @property {string|null} sourceId
 */

/**
 * @typedef {Object} Focalization
 * @property {string} kind                   — de FOCALIZATION_KINDS
 * @property {string|null} targetId
 */

/**
 * @typedef {Object} Proposition
 * @property {string} predicate
 * @property {string} predicateLemma
 * @property {Object<string, Reference>} roles — chave ∈ SEMANTIC_ROLES
 */

/**
 * @typedef {Object} Reference
 * @property {'entity'|'literal'|'unresolved'} kind
 * @property {string|null} entityId
 * @property {string} raw
 * @property {string} lemma
 * @property {string|null} resolvedFrom
 * @property {number} confidence             — [0, 1]
 */

/**
 * @typedef {Object} Evidence
 * @property {string} source                 — 'lexicon'|'predicate'|'syntax'|'context'
 * @property {string} value
 * @property {string} reason
 * @property {number} weight                 — [0, 1]
 */

/**
 * @typedef {Object} DiscourseRelation
 * @property {string} kind                   — 'sequence'|'contrast'|'cause'|...
 * @property {string} fromActId
 * @property {string} toActId
 */

/**
 * @typedef {Object} SourceSpan
 * @property {number} start                  — ≥ 0
 * @property {number} end                    — > start
 * @property {number} line                   — ≥ 1
 * @property {number} column                 — ≥ 0
 * @property {string} raw
 */

/**
 * @typedef {Object} NarrativeDiagnostic
 * @property {'error'|'warning'|'info'} severity
 * @property {string} phase                  — de DIAGNOSTIC_PHASES
 * @property {string} code                   — chave de DIAGNOSTIC_CODES
 * @property {string} message
 * @property {SourceSpan|null} sourceSpan
 * @property {string[]} suggestions
 * @property {string[]} related
 * @property {Object} [context]
 */