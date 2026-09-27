/**
 * @file root-cause-analyzer.js
 * @module diagnostics
 * @description Correlaciona erro com spans, eventos e invariantes para inferir causa.
 * @imports — (nenhum)
 * @importedBy diagnostics/index (Fase 6+), systems/diagnostics-system (Fase 6+)
 * @level 9
 *
 * Uso:
 *   const rca = new RootCauseAnalyzer();
 *   const report = rca.analyze({
 *     error: 'entidade não encontrada: Kaelin',
 *     line: 'ent.show Kaelin',
 *     traceId: 'tr-...',
 *     recorder, tracer, checker,
 *     machine, world,
 *   });
 *   console.log(report.summary);
 *   console.log(rca.toMarkdown(report));
 *
 * Categorias inferidas:
 *   MISSING_ENTITY · DUPLICATE_ENTITY · MISSING_REQUIRED_FIELD
 *   VALIDATION_FAILED · SHORTCODE_DUPLICATE · TIMELINE_ERROR
 *   SNAPSHOT_ERROR · PARSE_ERROR · CYCLE_DETECTED
 *   LINK_DANGLING · SYSTEM_MISSING · INVARIANT_VIOLATED · UNKNOWN
 */

const CAUSE_CATALOG = Object.freeze({
  MISSING_ENTITY: Object.freeze({
    label: 'Entidade não existe',
    confidence: 0.9,
    hint: 'A entidade referenciada não foi criada ou foi apagada.',
  }),
  DUPLICATE_ENTITY: Object.freeze({
    label: 'Entidade duplicada',
    confidence: 0.9,
    hint: 'Já existe uma entidade com esse id.',
  }),
  MISSING_REQUIRED_FIELD: Object.freeze({
    label: 'Campo obrigatório ausente',
    confidence: 0.9,
    hint: 'Um componente exige um campo que não foi fornecido.',
  }),
  VALIDATION_FAILED: Object.freeze({
    label: 'Validação falhou',
    confidence: 0.85,
    hint: 'Os dados do componente não passaram no validador.',
  }),
  SHORTCODE_DUPLICATE: Object.freeze({
    label: 'Shortcode duplicado',
    confidence: 0.9,
    hint: 'Já existe uma entidade com o mesmo shortcode.',
  }),
  TIMELINE_ERROR: Object.freeze({
    label: 'Erro de timeline',
    confidence: 0.8,
    hint: 'A timeline referenciada não existe ou está corrompida.',
  }),
  SNAPSHOT_ERROR: Object.freeze({
    label: 'Erro de snapshot',
    confidence: 0.8,
    hint: 'O snapshot referenciado não existe.',
  }),
  PARSE_ERROR: Object.freeze({
    label: 'Erro de sintaxe',
    confidence: 0.9,
    hint: 'A linha não pôde ser interpretada pelo parser.',
  }),
  CYCLE_DETECTED: Object.freeze({
    label: 'Ciclo detectado',
    confidence: 0.85,
    hint: 'Regra ou herança entrou em loop.',
  }),
  LINK_DANGLING: Object.freeze({
    label: 'Link órfão',
    confidence: 0.8,
    hint: 'Um link aponta para uma entidade que não existe.',
  }),
  SYSTEM_MISSING: Object.freeze({
    label: 'Sistema ausente no pipeline',
    confidence: 0.95,
    hint: 'Um sistema listado no pipeline não está registrado.',
  }),
  INVARIANT_VIOLATED: Object.freeze({
    label: 'Invariante violado',
    confidence: 0.7,
    hint: 'O estado do mundo ficou inconsistente após o comando.',
  }),
  UNKNOWN: Object.freeze({
    label: 'Causa não categorizada',
    confidence: 0.3,
    hint: 'Sem padrão conhecido — analisar evidências.',
  }),
});

export class RootCauseAnalyzer {
  /**
   * @param {Object} [opts={}]
   * @param {number} [opts.maxEvidence=30]
   * @param {number} [opts.eventWindow=20]
   * @param {number} [opts.invariantWindowMs=5000]
   */
  constructor({
    maxEvidence = 30,
    eventWindow = 20,
    invariantWindowMs = 5000,
  } = {}) {
    this.maxEvidence = Math.max(1, maxEvidence);
    this.eventWindow = Math.max(1, eventWindow);
    this.invariantWindowMs = Math.max(0, invariantWindowMs);
  }

  // ── API principal ───────────────────────────────────────────

  /**
   * Analisa um erro e produz um relatório causal.
   * @param {Object} input
   * @param {string|Object} [input.error]
   * @param {string} [input.line]
   * @param {string} [input.traceId]
   * @param {Object} [input.recorder]
   * @param {Object} [input.tracer]
   * @param {Object} [input.checker]
   * @param {Object} [input.machine]
   * @param {Object} [input.world]
   * @returns {Object} RCAReport
   */
  analyze({
    error = null,
    line = null,
    traceId = null,
    recorder = null,
    tracer = null,
    checker = null,
    machine = null,
    world = null,
  } = {}) {
    const symptom = this._buildSymptom({ error, line, machine });

    const relatedEvents = this._collectEvents(recorder);
    const relatedSpans = this._collectSpans(tracer, traceId);
    const violatedInvariants = this._collectInvariants(checker, symptom.ts);

    const probableCause = this._inferCause({
      error,
      line,
      machine,
      world,
      relatedEvents,
      violatedInvariants,
    });

    const evidence = this._buildEvidence({
      symptom,
      relatedEvents,
      violatedInvariants,
      relatedSpans,
    });

    const suggestions = this._suggestions(probableCause, symptom, relatedEvents);

    const summary = this._composeSummary(symptom, probableCause);

    return {
      summary,
      symptom,
      probableCause,
      evidence,
      relatedEvents,
      relatedSpans,
      violatedInvariants,
      suggestions,
      generatedAt: Date.now(),
    };
  }

  // ── Markdown ────────────────────────────────────────────────

  /**
   * Converte um RCAReport em Markdown.
   * @param {Object} rca
   * @returns {string}
   */
  toMarkdown(rca) {
    if (!rca) return '';

    const lines = [];
    const d = new Date(rca.generatedAt);
    const pad = (x) => String(x).padStart(2, '0');
    const ts = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

    lines.push(`# RCA — ${rca.summary}`);
    lines.push('');
    lines.push(`**Gerado em:** ${ts}`);
    lines.push('');

    lines.push('## Sintoma');
    lines.push('');
    lines.push(`- **Erro:** \`${rca.symptom.error ?? '(sem mensagem)'}\``);
    if (rca.symptom.line) lines.push(`- **Linha:** \`${rca.symptom.line}\``);
    if (rca.symptom.tick) lines.push(`- **Tick:** ${rca.symptom.tick}`);
    lines.push('');

    lines.push('## Causa provável');
    lines.push('');
    lines.push(`- **Categoria:** \`${rca.probableCause.category}\``);
    lines.push(`- **Confiança:** ${(rca.probableCause.confidence * 100).toFixed(0)}%`);
    lines.push(`- **Descrição:** ${rca.probableCause.label}`);
    lines.push(`- **Dica:** ${rca.probableCause.hint}`);
    lines.push('');

    if (rca.probableCause.details) {
      lines.push('**Detalhes extraídos:**');
      for (const [k, v] of Object.entries(rca.probableCause.details)) {
        lines.push(`- \`${k}\`: ${String(v)}`);
      }
      lines.push('');
    }

    if (rca.evidence.length > 0) {
      lines.push('## Evidências (cronológico)');
      lines.push('');
      for (const e of rca.evidence) {
        lines.push(`- \`${e.kind}\` ${e.text}`);
      }
      lines.push('');
    }

    if (rca.relatedSpans.length > 0) {
      lines.push('## Spans relacionados');
      lines.push('');
      for (const s of rca.relatedSpans) {
        lines.push(`- **${s.name}** (${s.durationMs ?? '?'}ms)${s.error ? ` — ${s.error}` : ''}`);
      }
      lines.push('');
    }

    if (rca.violatedInvariants.length > 0) {
      lines.push('## Invariantes violados');
      lines.push('');
      for (const v of rca.violatedInvariants) {
        lines.push(`- \`${v.code}\` (${v.severity}): ${v.message}`);
      }
      lines.push('');
    }

    if (rca.suggestions.length > 0) {
      lines.push('## Sugestões');
      lines.push('');
      for (const s of rca.suggestions) {
        lines.push(`- ${s}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // ── Sintoma ─────────────────────────────────────────────────

  /**
   * @private
   */
  _buildSymptom({ error, line, machine }) {
    return {
      ts: Date.now(),
      error: this._errorMessage(error),
      line: line ? String(line) : null,
      tick: machine?.state?.tick ?? null,
      timeline: machine?.state?.timeline ?? null,
    };
  }

  /**
   * @private
   */
  _errorMessage(error) {
    if (!error) return null;
    if (typeof error === 'string') return error;
    if (typeof error === 'object') {
      return error.message ?? error.error ?? String(error);
    }
    return String(error);
  }

  // ── Coleta ──────────────────────────────────────────────────

  /**
   * @private
   */
  _collectEvents(recorder) {
    if (!recorder || typeof recorder.last !== 'function') return [];
    try {
      const events = recorder.last(this.eventWindow);
      return events.map(e => ({
        seq: e.seq,
        ts: e.ts,
        event: e.event,
        tick: e.tick,
        payload: e.payload,
      }));
    } catch {
      return [];
    }
  }

  /**
   * @private
   */
  _collectSpans(tracer, traceId) {
    if (!tracer || !traceId) return [];
    try {
      const tree = tracer.getTree(traceId);
      if (!tree) return [];

      const out = [];
      const walk = (node) => {
        if (!node) return;
        out.push({
          name: node.name,
          durationMs: node.durationMs,
          error: node.exceptions?.[0]?.message ?? null,
          children: node.children?.length ?? 0,
        });
        for (const child of node.children ?? []) walk(child);
      };

      walk(tree.root);
      return out;
    } catch {
      return [];
    }
  }

  /**
   * @private
   */
  _collectInvariants(checker, symptomTs) {
    if (!checker || typeof checker.violations !== 'function') return [];
    try {
      const all = checker.violations({ limit: 20 });
      const cutoff = symptomTs - this.invariantWindowMs;
      return all.filter(v => (v.ts ?? 0) >= cutoff);
    } catch {
      return [];
    }
  }

  // ── Inferência ──────────────────────────────────────────────

  /**
   * @private
   */
  _inferCause({ error, line, machine, world, relatedEvents, violatedInvariants }) {
    const msg = this._errorMessage(error)?.toLowerCase() ?? '';
    const details = {};

    // 1. Parse error
    if (
      msg.includes('cabeçalho inválido') ||
      msg.includes('verbo não suportado') ||
      msg.includes('não suportado') ||
      msg.includes('path inválido') ||
      msg.includes('uso:') ||
      msg.includes('linha vazia')
    ) {
      details.errorExcerpt = msg.slice(0, 120);
      return this._cause('PARSE_ERROR', details);
    }

    // 2. Missing entity
    if (
      msg.includes('entidade não encontrada') ||
      msg.includes('entidade não existe') ||
      msg.includes('não existe') ||
      msg.includes('origem não existe') ||
      msg.includes('destino não existe') ||
      msg.includes('blueprint não encontrado') ||
      msg.includes('alvo obrigatório')
    ) {
      const match = this._extractAfterColon(msg);
      if (match) details.missingRef = match;
      return this._cause('MISSING_ENTITY', details);
    }

    // 3. Duplicate
    if (msg.includes('já existe') || msg.includes('já associado')) {
      const match = this._extractAfterColon(msg);
      if (match) details.duplicateRef = match;
      return this._cause('DUPLICATE_ENTITY', details);
    }

    // 4. Shortcode duplicate
    if (msg.includes('shortcode duplicado') || msg.includes('shortcode')) {
      const match = this._extractAfterColon(msg);
      if (match) details.shortcode = match;
      return this._cause('SHORTCODE_DUPLICATE', details);
    }

    // 5. Required field
    if (msg.includes('requer campo') || msg.includes('required')) {
      const m = msg.match(/requer campo\s+"?([^"\s]+)"?/);
      if (m) details.field = m[1];
      return this._cause('MISSING_REQUIRED_FIELD', details);
    }

    // 6. Validation
    if (msg.includes('falhou na validação') || msg.includes('validation')) {
      const m = msg.match(/"([^"]+)"/);
      if (m) details.component = m[1];
      return this._cause('VALIDATION_FAILED', details);
    }

    // 7. Cycle
    if (msg.includes('ciclo') || msg.includes('cycle')) {
      return this._cause('CYCLE_DETECTED', { context: msg.slice(0, 200) });
    }

    // 8. Timeline / snapshot
    if (msg.includes('timeline')) {
      const m = msg.match(/timeline\s+([^\s:]+)/);
      if (m) details.timeline = m[1];
      return this._cause('TIMELINE_ERROR', details);
    }
    if (msg.includes('snapshot')) {
      details.context = msg.slice(0, 120);
      return this._cause('SNAPSHOT_ERROR', details);
    }

    // 9. Link dangling
    if (msg.includes('link dangling') || msg.includes('dangling')) {
      return this._cause('LINK_DANGLING', { context: msg.slice(0, 200) });
    }

    // 10. System missing
    if (msg.includes('system missing') || msg.includes('sistema não')) {
      return this._cause('SYSTEM_MISSING', { context: msg.slice(0, 120) });
    }

    // 11. Invariantes violados recentes → sinal indireto
    if (violatedInvariants.length > 0) {
      return this._cause('INVARIANT_VIOLATED', {
        recentViolations: violatedInvariants.map(v => v.code).slice(0, 5),
      });
    }

    // 12. Heurística final: evento `rule:overflow` recente
    const overflow = relatedEvents.find(e => e.event === 'rule:overflow');
    if (overflow) {
      return this._cause('CYCLE_DETECTED', { trigger: 'rule:overflow' });
    }

    return this._cause('UNKNOWN', {
      errorExcerpt: msg.slice(0, 120) || '(vazio)',
    });
  }

  /**
   * @private
   */
  _cause(category, details = {}) {
    const base = CAUSE_CATALOG[category] ?? CAUSE_CATALOG.UNKNOWN;
    return {
      category,
      label: base.label,
      hint: base.hint,
      confidence: base.confidence,
      details: Object.keys(details).length > 0 ? details : null,
    };
  }

  // ── Evidências ──────────────────────────────────────────────

  /**
   * @private
   */
  _buildEvidence({ symptom, relatedEvents, violatedInvariants, relatedSpans }) {
    const out = [];

    for (const e of relatedEvents) {
      out.push({
        ts: e.ts,
        kind: e.event,
        text: `[${e.tick ?? '—'}] ${e.event}${this._summarizePayload(e.payload)}`,
      });
    }

    for (const v of violatedInvariants) {
      out.push({
        ts: v.ts,
        kind: `invariant:${v.code}`,
        text: `${v.severity.toUpperCase()} — ${v.message}`,
      });
    }

    for (const s of relatedSpans) {
      if (s.error) {
        out.push({
          ts: symptom.ts,
          kind: `span:${s.name}`,
          text: `falhou em ${s.durationMs ?? '?'}ms — ${s.error}`,
        });
      }
    }

    // Ordena por ts
    out.sort((a, b) => a.ts - b.ts);

    return out.slice(-this.maxEvidence);
  }

  /**
   * @private
   */
  _summarizePayload(payload) {
    if (!payload) return '';
    try {
      const s = JSON.stringify(payload);
      if (s === '{}' || s === 'null') return '';
      return ` ${s.length <= 100 ? s : s.slice(0, 97) + '...'}`;
    } catch {
      return '';
    }
  }

  // ── Sugestões ───────────────────────────────────────────────

  /**
   * @private
   */
  _suggestions(probableCause, symptom, relatedEvents) {
    const out = [];
    const cat = probableCause.category;

    switch (cat) {
      case 'MISSING_ENTITY':
        if (probableCause.details?.missingRef) {
          out.push(`Verifique se "${probableCause.details.missingRef}" foi criado com \`ent.create.*\`.`);
        }
        out.push('Rode `ent.list` para ver as entidades existentes.');
        out.push('Considere usar `sea.find "<nome>"` para busca textual.');
        break;

      case 'DUPLICATE_ENTITY':
        out.push('Use `ent.show <id>` para inspecionar a entidade existente.');
        out.push('Se quiser recriá-la, use `ent.delete <id>` antes.');
        break;

      case 'SHORTCODE_DUPLICATE':
        out.push('Rode `aud.identities` para localizar o conflito.');
        out.push('Renomeie a entidade com `id.rename` (shortcodes são gerados a partir do nome).');
        break;

      case 'MISSING_REQUIRED_FIELD':
        out.push(`Campo obrigatório ausente${probableCause.details?.field ? `: \`${probableCause.details.field}\`` : ''}.`);
        out.push('Consulte `help.components` para ver os campos requeridos de cada componente.');
        break;

      case 'VALIDATION_FAILED':
        out.push('O componente foi rejeitado pelo validador. Verifique os tipos dos campos.');
        break;

      case 'PARSE_ERROR':
        out.push('A linha não foi interpretada. Confira a sintaxe com `help.commands`.');
        out.push('Erros comuns: faltar `.` no cabeçalho, aspas desbalanceadas, valor ausente.');
        break;

      case 'CYCLE_DETECTED':
        out.push('Regras em loop. Verifique `rul.list` e as últimas entradas em `diag.rules`.');
        break;

      case 'TIMELINE_ERROR':
        out.push('Rode `frk.list` para ver as timelines disponíveis.');
        break;

      case 'SNAPSHOT_ERROR':
        out.push('O tick referenciado pode estar fora do histórico. Use `Ctrl+H` para navegar.');
        break;

      case 'LINK_DANGLING':
        out.push('Rode `aud.links` para listar os links órfãos.');
        break;

      case 'SYSTEM_MISSING':
        out.push('Um sistema do pipeline não foi registrado. Verifique `boot.js`.');
        break;

      case 'INVARIANT_VIOLATED':
        out.push('Rode `diag.invariants` para detalhes.');
        if (probableCause.details?.recentViolations) {
          out.push(`Violações recentes: ${probableCause.details.recentViolations.join(', ')}`);
        }
        break;

      default:
        out.push('Nenhuma sugestão específica. Analise as evidências.');
    }

    // Sugestão genérica se houve eventos relevantes
    if (relatedEvents.some(e => e.event === 'persist:failed')) {
      out.push('Houve falha de persistência recente — verifique quota do storage.');
    }

    return out;
  }

  // ── Sumário ─────────────────────────────────────────────────

  /**
   * @private
   */
  _composeSummary(symptom, probableCause) {
    const err = symptom.error ?? 'erro';
    return `${probableCause.label}: ${err}`.slice(0, 160);
  }

  // ── Util ────────────────────────────────────────────────────

  /**
   * Extrai texto após `:` da mensagem.
   * @private
   */
  _extractAfterColon(msg) {
    const idx = msg.indexOf(':');
    if (idx < 0) return null;
    return msg.slice(idx + 1).trim().slice(0, 80);
  }
}