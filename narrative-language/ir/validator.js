/**
 * @file validator.js
 * @module narrative-language/ir
 * @description Valida os 7 invariantes do `narrativeIR@1.0`.
 *              Nunca lança. Sempre devolve `{ ok, errors }`.
 * @imports narrative-language/ir/schema
 * @importedBy narrative-language/index,
 *             narrative-language/pipeline/interpreter,
 *             narrative-language/diagnostics/trace
 * @level N1
 *
 * Os 7 invariantes checados (§3.1 do blueprint):
 *   1. Todo `act.id` é único dentro do IR.
 *   2. Todo `act.source` é um SourceSpan estruturalmente válido.
 *   3. Toda `Reference` é consistente (kind ↔ entityId).
 *   4. Se `operations` inclui 'focalize', `focalization` é não-nulo.
 *   5. `confidence ∈ [0, 1]`.
 *   6. `provenance` presente.
 *   7. Diagnósticos com severity='error' bloqueiam promoção.
 *
 * Observação: o invariante #2 no blueprint menciona "span existente
 * no texto original". A validação completa requer acesso ao texto e
 * é feita em `source-map.js` (F4). Aqui checamos validade estrutural
 * — o que é suficiente para bloquear IRs corrompidos.
 */

import {
  IR_VERSION,
  OPERATIONS,
  VOICE_KINDS,
  FOCALIZATION_KINDS,
  DISCOURSE_FORMS,
  SEMANTIC_ROLES,
  DIAGNOSTIC_CODES,
  DIAGNOSTIC_SEVERITIES,
} from './schema.js';

// ══════════════════════════════════════════════════════════════
// HELPERS INTERNOS
// ══════════════════════════════════════════════════════════════

/**
 * Cria um diagnóstico de validação no formato canônico.
 * @param {string} code
 * @param {string} message
 * @param {Object} [ctx]
 * @param {SourceSpan|null} [ctx.span]
 * @param {string[]} [ctx.related]
 * @param {string[]} [ctx.suggestions]
 * @param {Object} [ctx.context]
 * @returns {NarrativeDiagnostic}
 * @private
 */
function _diag(code, message, ctx = {}) {
  const meta = DIAGNOSTIC_CODES[code] ?? {
    severity: 'error',
    phase: 'validation',
  };
  return {
    severity: meta.severity,
    phase: meta.phase,
    code,
    message: message || meta.message || code,
    sourceSpan: ctx.span ?? null,
    suggestions: Array.isArray(ctx.suggestions) ? ctx.suggestions : [],
    related: Array.isArray(ctx.related) ? ctx.related : [],
    context: ctx.context ?? null,
  };
}

/**
 * Verifica se um valor é inteiro ≥ 0.
 * @param {any} v
 * @returns {boolean}
 * @private
 */
function _isNonNegInt(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/**
 * Verifica se um valor é número finito em [0, 1].
 * @param {any} v
 * @returns {boolean}
 * @private
 */
function _isUnitFloat(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
}

/**
 * Verifica se um valor é string não vazia.
 * @param {any} v
 * @returns {boolean}
 * @private
 */
function _isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

// ══════════════════════════════════════════════════════════════
// VALIDAÇÃO DE FOLHA
// ══════════════════════════════════════════════════════════════

/**
 * Valida um `SourceSpan` estruturalmente.
 * @param {any} span
 * @returns {{ ok:boolean, error?:string }}
 * @private
 */
function _validateSpan(span) {
  if (!span || typeof span !== 'object') {
    return { ok: false, error: 'span ausente ou não-objeto' };
  }
  if (!_isNonNegInt(span.start)) {
    return { ok: false, error: 'span.start deve ser inteiro ≥ 0' };
  }
  if (!_isNonNegInt(span.end)) {
    return { ok: false, error: 'span.end deve ser inteiro ≥ 0' };
  }
  if (span.end <= span.start) {
    return { ok: false, error: 'span.end deve ser > span.start' };
  }
  if (!_isNonNegInt(span.line) && !(typeof span.line === 'number' && span.line >= 1)) {
    return { ok: false, error: 'span.line deve ser número ≥ 1' };
  }
  if (!_isNonNegInt(span.column)) {
    return { ok: false, error: 'span.column deve ser inteiro ≥ 0' };
  }
  if (typeof span.raw !== 'string') {
    return { ok: false, error: 'span.raw deve ser string' };
  }
  return { ok: true };
}

/**
 * Valida uma `Reference` (kind ↔ entityId).
 * @param {any} ref
 * @returns {{ ok:boolean, error?:string }}
 * @private
 */
function _validateReference(ref) {
  if (!ref || typeof ref !== 'object') {
    return { ok: false, error: 'reference não-objeto' };
  }
  if (!['entity', 'literal', 'unresolved'].includes(ref.kind)) {
    return { ok: false, error: `reference.kind inválido: ${ref.kind}` };
  }
  if (ref.kind === 'entity' && !_isNonEmptyString(ref.entityId)) {
    return { ok: false, error: 'reference.kind=entity exige entityId' };
  }
  if (ref.kind !== 'entity' && ref.entityId !== null && ref.entityId !== undefined) {
    return { ok: false, error: `reference.kind=${ref.kind} não deve ter entityId` };
  }
  if (typeof ref.raw !== 'string') {
    return { ok: false, error: 'reference.raw deve ser string' };
  }
  if (typeof ref.lemma !== 'string') {
    return { ok: false, error: 'reference.lemma deve ser string' };
  }
  if (!_isUnitFloat(ref.confidence)) {
    return { ok: false, error: 'reference.confidence fora de [0, 1]' };
  }
  return { ok: true };
}

/**
 * Valida `Voice`.
 * @param {any} voice
 * @returns {{ ok:boolean, error?:string }}
 * @private
 */
function _validateVoice(voice) {
  if (!voice || typeof voice !== 'object') {
    return { ok: false, error: 'voice ausente' };
  }
  if (!VOICE_KINDS.includes(voice.kind)) {
    return { ok: false, error: `voice.kind inválido: ${voice.kind}` };
  }
  return { ok: true };
}

/**
 * Valida `Focalization` (quando presente).
 * @param {any} focalization
 * @returns {{ ok:boolean, error?:string }}
 * @private
 */
function _validateFocalization(focalization) {
  if (focalization === null || focalization === undefined) {
    return { ok: true };
  }
  if (typeof focalization !== 'object') {
    return { ok: false, error: 'focalization deve ser objeto ou null' };
  }
  if (!FOCALIZATION_KINDS.includes(focalization.kind)) {
    return { ok: false, error: `focalization.kind inválido: ${focalization.kind}` };
  }
  return { ok: true };
}

/**
 * Valida `Proposition`.
 * @param {any} prop
 * @returns {{ ok:boolean, error?:string }}
 * @private
 */
function _validateProposition(prop) {
  if (!prop || typeof prop !== 'object') {
    return { ok: false, error: 'proposition ausente' };
  }
  if (!_isNonEmptyString(prop.predicate)) {
    return { ok: false, error: 'proposition.predicate vazio' };
  }
  if (!_isNonEmptyString(prop.predicateLemma)) {
    return { ok: false, error: 'proposition.predicateLemma vazio' };
  }
  if (!prop.roles || typeof prop.roles !== 'object') {
    return { ok: false, error: 'proposition.roles ausente' };
  }
  for (const [role, ref] of Object.entries(prop.roles)) {
    if (!SEMANTIC_ROLES.includes(role)) {
      return { ok: false, error: `papel semântico desconhecido: ${role}` };
    }
    const r = _validateReference(ref);
    if (!r.ok) return { ok: false, error: `role "${role}": ${r.error}` };
  }
  return { ok: true };
}

/**
 * Valida `Evidence[]`.
 * @param {any} evidence
 * @returns {{ ok:boolean, error?:string }}
 * @private
 */
function _validateEvidence(evidence) {
  if (!Array.isArray(evidence)) {
    return { ok: false, error: 'evidence deve ser array' };
  }
  for (let i = 0; i < evidence.length; i++) {
    const e = evidence[i];
    if (!e || typeof e !== 'object') {
      return { ok: false, error: `evidence[${i}] não-objeto` };
    }
    if (!_isNonEmptyString(e.source)) {
      return { ok: false, error: `evidence[${i}].source vazio` };
    }
    if (!_isNonEmptyString(e.reason)) {
      return { ok: false, error: `evidence[${i}].reason vazio` };
    }
    if (!_isUnitFloat(e.weight)) {
      return { ok: false, error: `evidence[${i}].weight fora de [0, 1]` };
    }
  }
  return { ok: true };
}

// ══════════════════════════════════════════════════════════════
// VALIDAÇÃO DE ACT
// ══════════════════════════════════════════════════════════════

/**
 * Valida um único `NarrativeAct` contra o schema.
 *
 * Checa invariantes 4, 5, 6 (parcial) e 3.
 *
 * @param {any} act
 * @param {NarrativeIR} [ir]  — IR pai (para verificar duplicatas); opcional
 * @returns {{ ok:boolean, errors:NarrativeDiagnostic[] }}
 */
export function validateAct(act, ir = null) {
  const errors = [];

  if (!act || typeof act !== 'object') {
    errors.push(_diag('IR_MISSING_FIELD', 'act não-objeto'));
    return { ok: false, errors };
  }

  // ── Invariante 6: provenance ──────────────────────────────
  if (!act.provenance || typeof act.provenance !== 'object') {
    errors.push(_diag('IR_MISSING_PROVENANCE', `act ${act.id ?? '?'} sem provenance`, {
      span: act.source ?? null,
      related: act.id ? [act.id] : [],
    }));
  }

  // ── Invariante 5: confidence ──────────────────────────────
  if (!_isUnitFloat(act.confidence)) {
    errors.push(_diag('IR_INVALID_CONFIDENCE',
      `act ${act.id ?? '?'}: confidence=${act.confidence}`, {
      span: act.source ?? null,
      related: act.id ? [act.id] : [],
    }));
  }

  // ── Operations ────────────────────────────────────────────
  if (!Array.isArray(act.operations) || act.operations.length === 0) {
    errors.push(_diag('IR_MISSING_FIELD',
      `act ${act.id ?? '?'}: operations ausente ou vazia`, {
      span: act.source ?? null,
    }));
  } else {
    for (const op of act.operations) {
      if (!OPERATIONS.includes(op)) {
        errors.push(_diag('IR_INVALID_OPERATION',
          `act ${act.id ?? '?'}: operação inválida "${op}"`, {
          span: act.source ?? null,
          suggestions: [OPERATIONS.join(', ')],
        }));
      }
    }
  }

  // ── Invariante 4: focalize exige focalization ─────────────
  if (Array.isArray(act.operations) && act.operations.includes('focalize')) {
    if (act.focalization === null || act.focalization === undefined) {
      errors.push(_diag('IR_FOCALIZE_WITHOUT_FOCALIZATION',
        `act ${act.id ?? '?'}: operação "focalize" sem focalization`, {
        span: act.source ?? null,
        related: act.id ? [act.id] : [],
      }));
    }
  }

  // ── Form ──────────────────────────────────────────────────
  if (!_isNonEmptyString(act.form) || !DISCOURSE_FORMS.includes(act.form)) {
    errors.push(_diag('IR_MISSING_FIELD',
      `act ${act.id ?? '?'}: form inválido "${act.form}"`, {
      span: act.source ?? null,
      suggestions: [DISCOURSE_FORMS.join(', ')],
    }));
  }

  // ── Voice ─────────────────────────────────────────────────
  const v = _validateVoice(act.voice);
  if (!v.ok) {
    errors.push(_diag('IR_MISSING_FIELD',
      `act ${act.id ?? '?'}: ${v.error}`, { span: act.source ?? null }));
  }

  // ── Focalization (se presente) ────────────────────────────
  const f = _validateFocalization(act.focalization);
  if (!f.ok) {
    errors.push(_diag('IR_MISSING_FIELD',
      `act ${act.id ?? '?'}: ${f.error}`, { span: act.source ?? null }));
  }

  // ── Proposition ───────────────────────────────────────────
  const p = _validateProposition(act.proposition);
  if (!p.ok) {
    errors.push(_diag('IR_MISSING_FIELD',
      `act ${act.id ?? '?'}: ${p.error}`, { span: act.source ?? null }));
  }

  // ── Evidence ──────────────────────────────────────────────
  const e = _validateEvidence(act.evidence);
  if (!e.ok) {
    errors.push(_diag('IR_MISSING_FIELD',
      `act ${act.id ?? '?'}: ${e.error}`, { span: act.source ?? null }));
  }

  // ── Invariante 3: references consistentes ─────────────────
  if (!Array.isArray(act.references)) {
    errors.push(_diag('IR_MISSING_FIELD',
      `act ${act.id ?? '?'}: references deve ser array`, {
      span: act.source ?? null,
    }));
  } else {
    for (let i = 0; i < act.references.length; i++) {
      const r = _validateReference(act.references[i]);
      if (!r.ok) {
        errors.push(_diag('IR_MALFORMED_REFERENCE',
          `act ${act.id ?? '?'}: references[${i}]: ${r.error}`, {
          span: act.source ?? null,
        }));
      }
    }
  }

  // ── Invariante 2: source span estrutural ──────────────────
  const s = _validateSpan(act.source);
  if (!s.ok) {
    errors.push(_diag('IR_INVALID_SPAN',
      `act ${act.id ?? '?'}: ${s.error}`, {
      span: null,
      related: act.id ? [act.id] : [],
    }));
  }

  // ── ID presente ───────────────────────────────────────────
  if (!_isNonEmptyString(act.id)) {
    errors.push(_diag('IR_MISSING_FIELD', 'act.id ausente ou vazio', {
      span: act.source ?? null,
    }));
  }

  return { ok: errors.length === 0, errors };
}

// ══════════════════════════════════════════════════════════════
// VALIDAÇÃO DE IR
// ══════════════════════════════════════════════════════════════

/**
 * Valida o IR completo. Checa os 7 invariantes.
 *
 * @param {any} ir
 * @returns {{ ok:boolean, errors:NarrativeDiagnostic[] }}
 */
export function validateIR(ir) {
  const errors = [];

  // ── Shape básica ──────────────────────────────────────────
  if (!ir || typeof ir !== 'object') {
    errors.push(_diag('IR_MISSING_FIELD', 'IR não-objeto'));
    return { ok: false, errors };
  }

  // ── Invariante: versão ────────────────────────────────────
  if (ir.version !== IR_VERSION) {
    errors.push(_diag('IR_INVALID_VERSION',
      `Versão esperada "${IR_VERSION}", recebida "${ir.version}"`, {
      suggestions: [`migre para ${IR_VERSION}`],
    }));
  }

  // ── Campos obrigatórios no topo ───────────────────────────
  if (!_isNonEmptyString(ir.documentId)) {
    errors.push(_diag('IR_MISSING_FIELD', 'IR.documentId ausente ou vazio'));
  }
  if (!_isNonEmptyString(ir.generatedAt)) {
    errors.push(_diag('IR_MISSING_FIELD', 'IR.generatedAt ausente ou vazio'));
  }
  if (!_isNonEmptyString(ir.sourceHash)) {
    errors.push(_diag('IR_MISSING_FIELD', 'IR.sourceHash ausente ou vazio'));
  }
  if (!ir.provenance || typeof ir.provenance !== 'object') {
    errors.push(_diag('IR_MISSING_PROVENANCE', 'IR.provenance ausente'));
  }

  // ── Acts: array ───────────────────────────────────────────
  if (!Array.isArray(ir.acts)) {
    errors.push(_diag('IR_MISSING_FIELD', 'IR.acts deve ser array'));
    return { ok: false, errors };
  }

  // ── Invariante 1: unicidade de act.id ─────────────────────
  const seenIds = new Set();
  const duplicates = new Set();
  for (const act of ir.acts) {
    if (!act || typeof act.id !== 'string') continue;
    if (seenIds.has(act.id)) {
      duplicates.add(act.id);
    } else {
      seenIds.add(act.id);
    }
  }
  for (const dup of duplicates) {
    errors.push(_diag('IR_DUPLICATE_ACT_ID',
      `act.id duplicado: "${dup}"`, {
      related: [dup],
    }));
  }

  // ── Valida cada act ───────────────────────────────────────
  for (const act of ir.acts) {
    const r = validateAct(act, ir);
    if (!r.ok) {
      for (const e of r.errors) errors.push(e);
    }
  }

  // ── Invariante 7: diagnostics com severity=error bloqueiam ─
  if (Array.isArray(ir.diagnostics)) {
    for (const d of ir.diagnostics) {
      if (d && d.severity === 'error') {
        errors.push(_diag('IR_HAS_ERROR_DIAGNOSTICS',
          `IR contém diagnóstico de erro: ${d.code ?? '?'} — ${d.message ?? '?'}`, {
          related: d.code ? [d.code] : [],
        }));
      }
    }
  }

  // ── Diagnósticos de validação devem ser bem-formados ──────
  if (Array.isArray(ir.diagnostics)) {
    for (let i = 0; i < ir.diagnostics.length; i++) {
      const d = ir.diagnostics[i];
      if (!d || typeof d !== 'object') {
        errors.push(_diag('IR_MISSING_FIELD', `diagnostics[${i}] não-objeto`));
        continue;
      }
      if (!DIAGNOSTIC_SEVERITIES.includes(d.severity)) {
        errors.push(_diag('IR_MISSING_FIELD',
          `diagnostics[${i}].severity inválido: ${d.severity}`));
      }
      if (!_isNonEmptyString(d.code)) {
        errors.push(_diag('IR_MISSING_FIELD',
          `diagnostics[${i}].code vazio`));
      }
      if (!_isNonEmptyString(d.message)) {
        errors.push(_diag('IR_MISSING_FIELD',
          `diagnostics[${i}].message vazio`));
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

// ══════════════════════════════════════════════════════════════
// HELPERS DE CONVENIÊNCIA
// ══════════════════════════════════════════════════════════════

/**
 * Verifica se um IR tem pelo menos um diagnóstico de severidade 'error'.
 * @param {NarrativeIR} ir
 * @returns {boolean}
 */
export function hasErrorDiagnostics(ir) {
  if (!ir || !Array.isArray(ir.diagnostics)) return false;
  return ir.diagnostics.some((d) => d && d.severity === 'error');
}

/**
 * Conta diagnósticos por severidade.
 * @param {NarrativeIR} ir
 * @returns {{ error:number, warning:number, info:number }}
 */
export function countBySeverity(ir) {
  const out = { error: 0, warning: 0, info: 0 };
  if (!ir || !Array.isArray(ir.diagnostics)) return out;
  for (const d of ir.diagnostics) {
    if (d && typeof d.severity === 'string' && d.severity in out) {
      out[d.severity]++;
    }
  }
  return out;
}

/**
 * Filtra diagnósticos de uma fase específica.
 * @param {NarrativeIR} ir
 * @param {string} phase
 * @returns {NarrativeDiagnostic[]}
 */
export function diagnosticsByPhase(ir, phase) {
  if (!ir || !Array.isArray(ir.diagnostics)) return [];
  return ir.diagnostics.filter((d) => d && d.phase === phase);
}

// ══════════════════════════════════════════════════════════════
// API COMPOSTA
// ══════════════════════════════════════════════════════════════

export const Validator = Object.freeze({
  validateIR,
  validateAct,
  hasErrorDiagnostics,
  countBySeverity,
  diagnosticsByPhase,
});