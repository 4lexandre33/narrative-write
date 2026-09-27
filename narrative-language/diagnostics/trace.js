/**
 * @file trace.js
 * @module narrative-language/diagnostics
 * @description Trace completo de uma análise narrativa. Reconstrói cada
 *              estágio do pipeline (segmenter → adapter → analyzer →
 *              resolver → classifier → dimensions → IR) para um ato,
 *              permitindo ao autor entender POR QUE o sistema classificou
 *              uma sentença daquela forma.
 * @imports narrative-language/pt-br/adapter,
 *          narrative-language/pipeline/segmenter,
 *          narrative-language/pipeline/analyzer,
 *          narrative-language/pipeline/resolver,
 *          narrative-language/acts/classifier,
 *          narrative-language/acts/dimensions
 * @importedBy narrative-language/diagnostics/diag-handlers
 * @level N2
 *
 * Contrato:
 *   trace(actId, ir, opts)   → Promise<TraceReport>
 *   toMarkdown(traceReport)  → string
 *   toJSON(traceReport)      → object
 *   listTraceableStages()    → string[]
 *
 * Determinismo: o trace re-executa o pipeline com a mesma entrada,
 * então para o mesmo IR o trace produz o mesmo resultado byte-a-byte.
 *
 * Nunca lança. Falhas devolvem TraceReport com `error` preenchido.
 */

import { Adapter } from '../pt-br/adapter.js';
import { analyze } from '../pipeline/analyzer.js';
import { resolve } from '../pipeline/resolver.js';
import { classify } from '../acts/classifier.js';
import { extractDimensions } from '../acts/dimensions.js';

// ══════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════

/** @type {string} @private */
const _TRACE_VERSION = '1.0.0';

/**
 * Estágios rastreáveis, na ordem em que ocorrem.
 * @type {ReadonlyArray<string>}
 * @private
 */
const _STAGES = Object.freeze([
  'segmenter',
  'adapter',
  'analyzer',
  'resolver',
  'classifier',
  'dimensions',
  'ir',
]);

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * Encontra um ato no IR pelo id.
 * @private
 */
function _findAct(ir, actId) {
  if (!ir || !Array.isArray(ir.acts)) return null;
  return ir.acts.find((a) => a?.id === actId) ?? null;
}

/**
 * Encontra a sentença que originou um ato.
 * @private
 */
function _findSentence(ir, act) {
  if (!ir?._internal?.sentences) return null;
  const sid = act?.provenance?.sentenceId;
  if (!sid) return null;
  return ir._internal.sentences.find((s) => s.id === sid) ?? null;
}

/**
 * Trunca uma string longa.
 * @private
 */
function _trunc(s, n = 120) {
  const str = String(s ?? '');
  if (str.length <= n) return str;
  return str.slice(0, n - 3) + '...';
}

/**
 * Copia um objeto removendo funções e truncando strings muito longas.
 * @private
 */
function _safeCopy(v, depth = 0) {
  if (depth > 4) return '[deep]';
  if (v === null || v === undefined) return v;
  if (typeof v === 'string') return _trunc(v, 200);
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'function') return '[Function]';
  if (Array.isArray(v)) {
    if (v.length > 30) {
      return [
        ...v.slice(0, 30).map((x) => _safeCopy(x, depth + 1)),
        `... ${v.length - 30} itens`,
      ];
    }
    return v.map((x) => _safeCopy(x, depth + 1));
  }
  if (typeof v === 'object') {
    const out = {};
    let count = 0;
    for (const [k, val] of Object.entries(v)) {
      if (count++ > 40) break;
      out[k] = _safeCopy(val, depth + 1);
    }
    return out;
  }
  return String(v);
}

// ══════════════════════════════════════════════════════════════
// PIPELINE RE-RUN
// ══════════════════════════════════════════════════════════════

/**
 * Re-executa o pipeline completo numa sentença e captura cada estágio.
 *
 * @param {Object} sentence
 * @param {Object} opts
 * @param {Map<string, Object>|null} opts.overrides
 * @param {Map<string, Object>|null} opts.lexicon
 * @returns {Promise<{
 *   stages: Array<{ name:string, data:Object, ms:number }>,
 *   error: string|null,
 *   model?: Object,
 *   resolution?: Object,
 *   classification?: Object,
 *   dimensions?: Object,
 * }>}
 * @private
 */
async function _runPipeline(sentence, opts) {
  const stages = [];

  // ── 1. Segmenter ──────────────────────────────────────
  const t0 = _now();
  stages.push({
    name: 'segmenter',
    data: {
      sentenceId: sentence.id,
      raw: sentence.raw,
      start: sentence.source?.start ?? 0,
      end: sentence.source?.end ?? 0,
      spanCount: (sentence.spans ?? []).length,
      spans: (sentence.spans ?? []).map((s) => ({
        id: s.id,
        raw: _trunc(s.raw, 80),
        relation: s.relation ?? null,
      })),
    },
    ms: _round(_now() - t0),
  });

  // ── 2. Adapter ────────────────────────────────────────
  const t1 = _now();
  let nlp;
  try {
    nlp = await Adapter.analyze(sentence.raw);
  } catch (err) {
    return { stages, error: `adapter falhou: ${err?.message ?? String(err)}` };
  }
  stages.push({
    name: 'adapter',
    data: {
      backend: nlp?.backend ?? 'unknown',
      tokenCount: nlp?.tokens?.length ?? 0,
      tokens: (nlp?.tokens ?? []).slice(0, 30).map((t) => ({
        text: t.text,
        pos: t.pos,
        lemma: t.lemma,
        features: _safeCopy(t.features ?? {}),
      })),
    },
    ms: _round(_now() - t1),
  });

  // ── 3. Analyzer ───────────────────────────────────────
  const t2 = _now();
  let model;
  try {
    model = analyze(sentence, nlp, {});
  } catch (err) {
    return { stages, error: `analyzer falhou: ${err?.message ?? String(err)}` };
  }
  stages.push({
    name: 'analyzer',
    data: {
      subject: model.subject
        ? { lemma: model.subject.lemma, pos: model.subject.pos, surface: model.subject.surface }
        : null,
      predicate: model.predicate,
      predicateLemma: model.predicateLemma,
      objects: (model.objects ?? []).map((o) => ({
        lemma: o.lemma,
        class: o.class,
        pos: o.pos,
      })),
      semanticRoles: _safeCopy(model.semanticRoles ?? {}),
      tense: model.tense ?? null,
      aspect: model.aspect ?? null,
      modality: model.modality ?? null,
      negation: model.negation ?? null,
      voice: model.voice ?? 'active',
      construction: model.construction?.id ?? null,
      diagnostics: (model.diagnostics ?? []).map((d) => ({
        code: d.code,
        message: _trunc(d.message, 120),
      })),
    },
    ms: _round(_now() - t2),
  });

  // ── 4. Resolver ───────────────────────────────────────
  const t3 = _now();
  const ctx = {
    userLexicon: opts?.lexicon instanceof Map ? opts.lexicon : null,
  };
  let resolution;
  try {
    resolution = resolve(model, ctx, opts?.overrides ?? null);
  } catch (err) {
    resolution = { references: [], diagnostics: [], confidence: 0 };
  }
  stages.push({
    name: 'resolver',
    data: {
      confidence: resolution.confidence ?? 0,
      references: (resolution.references ?? []).map((r) => ({
        kind: r.kind,
        entityId: r.entityId ?? null,
        raw: r.raw,
        lemma: r.lemma,
        resolvedFrom: r.resolvedFrom ?? null,
        confidence: r.confidence,
      })),
      diagnostics: (resolution.diagnostics ?? []).map((d) => ({
        code: d.code,
        message: _trunc(d.message, 120),
        candidates: (d.context?.candidates ?? []).map((c) => ({
          entityId: c.entityId,
          name: c.name,
          score: c.score,
        })),
      })),
    },
    ms: _round(_now() - t3),
  });

  // ── 5. Classifier ─────────────────────────────────────
  const t4 = _now();
  let classification;
  try {
    classification = classify(model, resolution, ctx);
  } catch (err) {
    classification = { candidates: [], selected: [], primary: null };
  }
  stages.push({
    name: 'classifier',
    data: {
      primary: classification.primary ?? null,
      selected: classification.selected ?? [],
      candidates: (classification.candidates ?? []).map((c) => ({
        operation: c.operation,
        confidence: c.confidence,
        evidence: (c.evidence ?? []).map((e) => ({
          source: e.source,
          value: _trunc(e.value, 60),
          reason: e.reason,
          weight: e.weight,
        })),
      })),
    },
    ms: _round(_now() - t4),
  });

  // ── 6. Dimensions ─────────────────────────────────────
  const t5 = _now();
  let dimensions;
  try {
    dimensions = extractDimensions(model, resolution, ctx);
  } catch (err) {
    dimensions = null;
  }
  stages.push({
    name: 'dimensions',
    data: dimensions
      ? {
          voice: dimensions.voice ?? null,
          focalization: dimensions.focalization ?? null,
          form: dimensions.form ?? null,
          tense: dimensions.tense ?? null,
          aspect: dimensions.aspect ?? null,
          modality: dimensions.modality ?? null,
          negation: dimensions.negation ?? null,
          epistemic: dimensions.epistemic ?? null,
        }
      : null,
    ms: _round(_now() - t5),
  });

  return {
    stages,
    error: null,
    model,
    resolution,
    classification,
    dimensions,
  };
}

// ══════════════════════════════════════════════════════════════
// COMPARAÇÃO
// ══════════════════════════════════════════════════════════════

/**
 * Compara o ato do IR com o resultado da re-execução.
 * Verifica se o pipeline é determinístico (mesma entrada → mesma saída).
 *
 * @private
 */
function _compareWithAct(act, stages) {
  const dimsStage = stages.find((s) => s.name === 'dimensions')?.data;
  const classStage = stages.find((s) => s.name === 'classifier')?.data;

  const irOps = Array.isArray(act?.operations) ? [...act.operations].sort() : [];
  const newOps = Array.isArray(classStage?.selected) ? [...classStage.selected].sort() : [];

  const opsMatch = JSON.stringify(irOps) === JSON.stringify(newOps);

  const irConf = typeof act?.confidence === 'number' ? act.confidence : 0;
  const newConf = classStage?.candidates?.[0]?.confidence ?? 0;

  return {
    deterministic: opsMatch,
    operationsMatch: opsMatch,
    irOperations: irOps,
    replayedOperations: newOps,
    irConfidence: irConf,
    replayedConfidence: newConf,
    confidenceDelta: _round(newConf - irConf),
  };
}

// ══════════════════════════════════════════════════════════════
// API PRINCIPAL
// ══════════════════════════════════════════════════════════════

/**
 * Produz um TraceReport completo para um ato.
 *
 * @param {string} actId
 * @param {Object} ir        — NarrativeIR (deve ter `_internal.sentences`)
 * @param {Object} [opts={}]
 * @param {Map<string, Object>} [opts.overrides]
 * @param {Map<string, Object>} [opts.lexicon]
 * @returns {Promise<{
 *   version:string,
 *   actId:string,
 *   generatedAt:string,
 *   source:{ sentenceId:string, raw:string, start:number, end:number }|null,
 *   stages:Array<{ name:string, data:Object, ms:number }>,
 *   comparison:Object|null,
 *   error:string|null,
 * }>}
 */
export async function trace(actId, ir, opts = {}) {
  const report = {
    version: _TRACE_VERSION,
    actId,
    generatedAt: _isoNow(),
    source: null,
    stages: [],
    comparison: null,
    error: null,
  };

  if (!actId || typeof actId !== 'string') {
    report.error = 'actId ausente ou inválido';
    return report;
  }

  if (!ir) {
    report.error = 'IR ausente';
    return report;
  }

  const act = _findAct(ir, actId);
  if (!act) {
    report.error = `act não encontrado: ${actId}`;
    return report;
  }

  const sentence = _findSentence(ir, act);
  if (!sentence) {
    report.error = `sentença não encontrada para act ${actId}`;
    return report;
  }

  report.source = {
    sentenceId: sentence.id,
    raw: sentence.raw,
    start: sentence.source?.start ?? 0,
    end: sentence.source?.end ?? 0,
  };

  // Re-executa pipeline
  let result;
  try {
    result = await _runPipeline(sentence, opts);
  } catch (err) {
    report.error = `_runPipeline falhou: ${err?.message ?? String(err)}`;
    return report;
  }

  report.stages = result.stages;
  report.error = result.error;

  if (!result.error) {
    report.comparison = _compareWithAct(act, result.stages);

    // Estágio final: o próprio act do IR
    report.stages.push({
      name: 'ir',
      data: {
        actId: act.id,
        operations: act.operations,
        confidence: act.confidence,
        voice: act.voice,
        focalization: act.focalization,
        form: act.form,
        proposition: {
          predicate: act.proposition?.predicate,
          predicateLemma: act.proposition?.predicateLemma,
          roles: Object.keys(act.proposition?.roles ?? {}),
        },
        evidenceCount: Array.isArray(act.evidence) ? act.evidence.length : 0,
        referenceCount: Array.isArray(act.references) ? act.references.length : 0,
      },
      ms: 0,
    });
  }

  return report;
}

// ══════════════════════════════════════════════════════════════
// SERIALIZAÇÃO
// ══════════════════════════════════════════════════════════════

/**
 * Serializa um TraceReport em Markdown legível.
 *
 * @param {Object} report
 * @returns {string}
 */
export function toMarkdown(report) {
  if (!report) return '# Trace vazio\n';

  const lines = [];
  lines.push(`# Trace — \`${report.actId}\``);
  lines.push('');
  lines.push(`**Gerado em:** ${report.generatedAt}`);
  lines.push('');

  if (report.error) {
    lines.push('## ⚠ Erro');
    lines.push('');
    lines.push('```');
    lines.push(String(report.error));
    lines.push('```');
    return lines.join('\n');
  }

  if (report.source) {
    lines.push('## Origem');
    lines.push('');
    lines.push(`- **Sentença:** \`${report.source.sentenceId}\``);
    lines.push(`- **Texto:** "${report.source.raw}"`);
    lines.push(`- **Offsets:** ${report.source.start}–${report.source.end}`);
    lines.push('');
  }

  lines.push('## Estágios do pipeline');
  lines.push('');

  for (const stage of report.stages) {
    lines.push(`### \`${stage.name}\` (${stage.ms}ms)`);
    lines.push('');
    lines.push('```json');
    try {
      lines.push(JSON.stringify(stage.data, null, 2));
    } catch {
      lines.push('(não serializável)');
    }
    lines.push('```');
    lines.push('');
  }

  if (report.comparison) {
    const c = report.comparison;
    lines.push('## Determinismo');
    lines.push('');
    lines.push(`- **Bate com IR original:** ${c.deterministic ? '✓' : '✗'}`);
    lines.push(`- Operações (IR): \`${c.irOperations.join(', ')}\``);
    lines.push(`- Operações (replay): \`${c.replayedOperations.join(', ')}\``);
    lines.push(`- Confiança (IR): \`${c.irConfidence}\``);
    lines.push(`- Confiança (replay): \`${c.replayedConfidence}\``);
    lines.push(`- Delta: \`${c.confidenceDelta}\``);
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Gerado por narrative-language/diagnostics/trace.js v${report.version}*`);

  return lines.join('\n');
}

/**
 * Serializa um TraceReport em JSON puro (safe-copy).
 * @param {Object} report
 * @returns {Object|null}
 */
export function toJSON(report) {
  if (!report) return null;
  try {
    return JSON.parse(JSON.stringify(report));
  } catch {
    return null;
  }
}

/**
 * Lista os estágios rastreáveis.
 * @returns {string[]}
 */
export function listTraceableStages() {
  return Array.from(_STAGES);
}

// ══════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ══════════════════════════════════════════════════════════════

/**
 * @returns {string}
 * @private
 */
function _isoNow() {
  try {
    return new Date().toISOString();
  } catch {
    return '';
  }
}

/**
 * @returns {number}
 * @private
 */
function _now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/**
 * @private
 */
function _round(n) {
  return Math.round(Number(n) * 100) / 100;
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const Trace = Object.freeze({
  trace,
  toMarkdown,
  toJSON,
  listTraceableStages,
});