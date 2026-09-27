/**
 * @file test-reporter.js
 * @module diagnostics
 * @description Consolida phases em relatório e serializa (JSON / NDJSON / Markdown).
 * @imports core/utils/dom (triggerDownload)
 * @importedBy diagnostics/test-battery
 * @level 9
 *
 * Formato do report:
 *   {
 *     meta:    { appName, appVersion, generatedAt, durationMs, seed, iterations },
 *     summary: { ok, totalPassed, totalFailed, totalSkipped, totalPhases },
 *     phases:  [ PhaseResult, ... ],
 *   }
 *
 * Formato de um PhaseResult:
 *   {
 *     phase:      string,       // 'smoke' | 'contracts' | ...
 *     ok:         boolean,      // aprovado?
 *     skipped:    boolean,      // pulado?
 *     reason:     string|null,  // motivo do skip (se aplicável)
 *     durationMs: number,
 *     summary:    string,       // texto curto ('10/10' ou '3 violations')
 *     data:       Object,       // dados específicos da fase
 *     failures:   Array,        // lista de falhas (para exibição)
 *     error:      string|null,  // erro de topo (fase explodiu)
 *   }
 */

import { triggerDownload } from '../core/utils/dom.js';

const DEFAULT_APP_NAME = 'narrative-ecs';
const DEFAULT_APP_VERSION = '1.0';

export class TestReporter {
  /**
   * @param {Object} [opts={}]
   * @param {string} [opts.appName]
   * @param {string} [opts.appVersion]
   */
  constructor({
    appName = DEFAULT_APP_NAME,
    appVersion = DEFAULT_APP_VERSION,
  } = {}) {
    this.appName = appName;
    this.appVersion = appVersion;
  }

  // ══════════════════════════════════════════════════════════
  // Construção do report
  // ══════════════════════════════════════════════════════════

  /**
   * Monta um report a partir das fases + metadados.
   *
   * @param {Array<Object>} phases
   * @param {Object} [meta={}]
   * @param {number} [meta.durationMs=0]
   * @param {number} [meta.seed=null]
   * @param {number} [meta.iterations=null]
   * @returns {Object}
   */
  summarize(phases, meta = {}) {
    const list = Array.isArray(phases) ? phases : [];

    const totalPassed = list.filter(p => p.ok && !p.skipped).length;
    const totalFailed = list.filter(p => !p.ok && !p.skipped).length;
    const totalSkipped = list.filter(p => p.skipped).length;

    return {
      meta: {
        appName: this.appName,
        appVersion: this.appVersion,
        generatedAt: Date.now(),
        generatedAtISO: new Date().toISOString(),
        durationMs: Number.isFinite(meta.durationMs) ? meta.durationMs : 0,
        seed: meta.seed ?? null,
        iterations: meta.iterations ?? null,
        phaseCount: list.length,
      },
      summary: {
        ok: totalFailed === 0,
        totalPassed,
        totalFailed,
        totalSkipped,
        totalPhases: list.length,
      },
      phases: list.map(p => this._normalizePhase(p)),
    };
  }

  // ══════════════════════════════════════════════════════════
  // Serialização
  // ══════════════════════════════════════════════════════════

  /**
   * Serializa em JSON.
   * @param {Object} report
   * @param {boolean} [pretty=true]
   * @returns {string}
   */
  toJSON(report, pretty = true) {
    try {
      return pretty
        ? JSON.stringify(report, null, 2)
        : JSON.stringify(report);
    } catch (err) {
      return JSON.stringify({
        meta: { error: `falha ao serializar: ${err.message}` },
        summary: { ok: false },
        phases: [],
      });
    }
  }

  /**
   * Serializa em NDJSON — uma linha por fase + cabeçalho.
   * Mais estável para pipelines.
   * @param {Object} report
   * @returns {string}
   */
  toNDJSON(report) {
    const lines = [];
    try {
      lines.push(JSON.stringify({ kind: 'meta', ...report.meta }));
      lines.push(JSON.stringify({ kind: 'summary', ...report.summary }));
      for (const p of report.phases ?? []) {
        lines.push(JSON.stringify({ kind: 'phase', ...p }));
      }
    } catch { /* ignora entradas não-serializáveis */ }
    return lines.join('\n');
  }

  /**
   * Serializa em Markdown legível por humano e por IA.
   * @param {Object} report
   * @returns {string}
   */
  toMarkdown(report) {
    if (!report) return '# Relatório vazio\n';

    const m = report.meta ?? {};
    const s = report.summary ?? {};
    const lines = [];

    const icon = s.ok ? '✅' : '❌';
    const verdict = s.ok ? 'APROVADO' : 'REPROVADO';

    lines.push(`# ${icon} Bateria de Testes — ${verdict}`);
    lines.push('');
    lines.push(`**App:** ${m.appName ?? '?'} v${m.appVersion ?? '?'}`);
    lines.push(`**Gerado em:** ${m.generatedAtISO ?? '—'}`);
    lines.push(`**Duração:** ${this._fmtMs(m.durationMs)}`);
    if (m.seed !== null && m.seed !== undefined) {
      lines.push(`**Seed:** \`${m.seed}\``);
    }
    if (m.iterations !== null && m.iterations !== undefined) {
      lines.push(`**Iterações (fuzz):** ${m.iterations}`);
    }
    lines.push('');

    // Placar
    lines.push('## Placar');
    lines.push('');
    lines.push('| Métrica | Valor |');
    lines.push('|---|---:|');
    lines.push(`| Fases totais | ${s.totalPhases ?? 0} |`);
    lines.push(`| Aprovadas | ${s.totalPassed ?? 0} |`);
    lines.push(`| Reprovadas | ${s.totalFailed ?? 0} |`);
    lines.push(`| Puladas | ${s.totalSkipped ?? 0} |`);
    lines.push('');

    // Tabela de fases
    lines.push('## Fases');
    lines.push('');
    lines.push('| # | Fase | Status | Duração | Resumo |');
    lines.push('|---:|---|---|---:|---|');
    (report.phases ?? []).forEach((p, i) => {
      const status = p.skipped
        ? '⏭ skip'
        : (p.ok ? '✅ ok' : '❌ fail');
      lines.push(`| ${i + 1} | \`${p.phase}\` | ${status} | ${this._fmtMs(p.durationMs)} | ${this._esc(p.summary ?? '')} |`);
    });
    lines.push('');

    // Detalhes de falhas
    const failed = (report.phases ?? []).filter(p => !p.ok && !p.skipped);
    if (failed.length > 0) {
      lines.push('## Falhas detalhadas');
      lines.push('');
      for (const p of failed) {
        lines.push(`### ❌ \`${p.phase}\``);
        if (p.error) {
          lines.push('');
          lines.push('**Erro de topo:**');
          lines.push('');
          lines.push('```');
          lines.push(String(p.error));
          lines.push('```');
        }
        if (Array.isArray(p.failures) && p.failures.length > 0) {
          lines.push('');
          lines.push(`**${p.failures.length} falha(s):**`);
          lines.push('');
          for (const f of p.failures.slice(0, 20)) {
            lines.push(`- ${this._esc(this._formatFailure(f))}`);
          }
          if (p.failures.length > 20) {
            lines.push(`- … mais ${p.failures.length - 20} no JSON completo`);
          }
        }
        lines.push('');
      }
    }

    // Puladas
    const skipped = (report.phases ?? []).filter(p => p.skipped);
    if (skipped.length > 0) {
      lines.push('## Fases puladas');
      lines.push('');
      for (const p of skipped) {
        lines.push(`- \`${p.phase}\` — ${p.reason ?? '(sem motivo)'}`);
      }
      lines.push('');
    }

    // Como interpretar
    lines.push('## Como interpretar');
    lines.push('');
    lines.push('- **smoke**: 10 testes de sanidade do motor');
    lines.push('- **contracts**: pré/pós-condições em métodos críticos do World');
    lines.push('- **invariants**: 12 invariantes estruturais (shortcodes, links, ciclos)');
    lines.push('- **scenarios**: catálogo determinístico de comandos');
    lines.push('- **fuzz**: N comandos aleatórios; falha = achou crash');
    lines.push('- **replay**: grava + reproduz sessão; falha = não-determinismo');
    lines.push('- **regression**: compara contra baseline salvo');
    lines.push('');
    lines.push('---');
    lines.push(`*Gerado por TestReporter @ ${m.appName}*`);

    return lines.join('\n');
  }

  // ══════════════════════════════════════════════════════════
  // Blob / Download
  // ══════════════════════════════════════════════════════════

  /**
   * Cria um Blob a partir do report.
   * @param {Object} report
   * @param {'json'|'ndjson'|'md'} [format='json']
   * @returns {Blob}
   */
  toBlob(report, format = 'json') {
    const content =
      format === 'ndjson' ? this.toNDJSON(report) :
      format === 'md'     ? this.toMarkdown(report) :
                            this.toJSON(report);

    const mime =
      format === 'ndjson' ? 'application/x-ndjson' :
      format === 'md'     ? 'text/markdown;charset=utf-8' :
                            'application/json';

    return new Blob([content], { type: mime });
  }

  /**
   * Nome de arquivo padrão.
   * @param {Object} report
   * @param {'json'|'ndjson'|'md'} [ext='json']
   * @returns {string}
   */
  filename(report, ext = 'json') {
    const ts = new Date(report?.meta?.generatedAt ?? Date.now())
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const verdict = report?.summary?.ok ? 'PASS' : 'FAIL';
    return `test-battery-${verdict}-${ts}.${ext}`;
  }

  /**
   * Dispara download do report.
   * @param {Object} report
   * @param {'json'|'ndjson'|'md'} [format='json']
   * @returns {{ ok:boolean, filename?:string, error?:string }}
   */
  download(report, format = 'json') {
    try {
      if (typeof document === 'undefined') {
        return { ok: false, error: 'document indisponível' };
      }
      const blob = this.toBlob(report, format);
      const filename = this.filename(report, format);
      triggerDownload(blob, filename);
      return { ok: true, filename };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Estima tamanho em bytes.
   * @param {Object} report
   * @returns {number}
   */
  estimate(report) {
    try {
      return this.toJSON(report, false).length;
    } catch {
      return -1;
    }
  }

  // ══════════════════════════════════════════════════════════
  // Internos
  // ══════════════════════════════════════════════════════════

  /**
   * Garante que uma fase tenha todos os campos esperados.
   * @private
   */
  _normalizePhase(p) {
    const src = p && typeof p === 'object' ? p : {};
    return {
      phase: String(src.phase ?? 'unknown'),
      ok: src.ok === true,
      skipped: src.skipped === true,
      reason: src.reason ?? null,
      durationMs: Number.isFinite(src.durationMs) ? src.durationMs : 0,
      summary: String(src.summary ?? ''),
      data: src.data ?? null,
      failures: Array.isArray(src.failures) ? src.failures : [],
      error: src.error ?? null,
    };
  }

  /**
   * Formata uma entrada de failure (aceita string ou objeto).
   * @private
   */
  _formatFailure(f) {
    if (f === null || f === undefined) return '(vazio)';
    if (typeof f === 'string') return f;
    if (typeof f !== 'object') return String(f);

    // Tenta extrair campos comuns
    const parts = [];
    if (f.scenario) parts.push(`[${f.scenario}]`);
    if (f.command)  parts.push(`"${f.command}"`);
    if (f.error)    parts.push(`→ ${f.error}`);
    if (f.reason)   parts.push(`(${f.reason})`);
    if (f.message)  parts.push(f.message);

    if (parts.length > 0) return parts.join(' ');

    try {
      const s = JSON.stringify(f);
      return s.length <= 200 ? s : s.slice(0, 197) + '...';
    } catch {
      return '(não serializável)';
    }
  }

  /**
   * Formata ms.
   * @private
   */
  _fmtMs(n) {
    if (!Number.isFinite(n)) return '—';
    if (n < 1000) return `${Math.round(n)}ms`;
    return `${(n / 1000).toFixed(2)}s`;
  }

  /**
   * Escapa pipes em tabelas Markdown.
   * @private
   */
  _esc(str) {
    return String(str ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  }
}