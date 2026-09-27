/**
 * @file diag-handlers.js
 * @module narrative-language/diagnostics
 * @description Handlers dos comandos `diag.narrative.*`. Despachados pelo
 *              DiagnosticsSystem quando detecta `verb='diag'` e
 *              `action='narrative'`.
 * @imports narrative-language/diagnostics/trace,
 *          narrative-language/overrides,
 *          narrative-language/user-lexicon
 * @importedBy systems/diagnostics-system
 * @level N3
 *
 * Subcomandos suportados:
 *   diag.narrative.recent [n]      — últimos N atos do IR
 *   diag.narrative.why <actId>     — trace completo de um ato
 *   diag.narrative.stats           — estatísticas do NarrativeSystem
 *   diag.narrative.overrides       — overrides do autor
 *   diag.narrative.lexicon         — preferências aprendidas
 *   diag.narrative.replay <actId>  — propostas para um ato
 *   diag.narrative.clear           — limpa o IR em cache
 *   diag.narrative.help            — esta ajuda
 *
 * Contrato:
 *   - Nunca lança. Erros viram payloads com `{ ok: false }`.
 *   - Handlers assíncronos emitem `render:right` via bus e devolvem
 *     payload "em progresso" imediatamente.
 *   - Acessa o NarrativeSystem via `machine.systems.get('NarrativeSystem')`.
 *     Se ausente, devolve payload informativo (nunca erro fatal).
 */

import { Trace } from './trace.js';
import {
  listOverrides,
  stats as overrideStats,
  DEFAULT_TTL_MS,
} from '../overrides.js';
import {
  listPreferences,
  stats as lexiconStats,
} from '../user-lexicon.js';

// ══════════════════════════════════════════════════════════════
// CLASSE
// ══════════════════════════════════════════════════════════════

export class NarrativeDiagHandlers {
  /**
   * @param {Object} system — instância de DiagnosticsSystem
   */
  constructor(system) {
    if (!system) {
      throw new Error('[NarrativeDiagHandlers] system obrigatório');
    }
    this.system = system;

    // Travas de concorrência para handlers async
    this._whyRunning = false;
    this._replayRunning = false;
  }

  get machine() { return this.system.machine; }
  get bus() { return this.system.bus; }

  // ══════════════════════════════════════════════════════════
  // DISPATCH
  // ══════════════════════════════════════════════════════════

  /**
   * Despacha um subcomando `diag.narrative.<sub>`.
   *
   * @param {Object} prev
   * @param {Object} ast
   * @returns {Object} SystemResult parcial
   */
  dispatch(prev, ast) {
    const sys = this._getNarrativeSystem();
    if (!sys) return this._noNarrativeSystem(prev);

    const sub = String(ast?.positional?.[0] ?? 'help').toLowerCase();

    try {
      switch (sub) {
        case 'recent':    return this.recent(prev, ast, sys);
        case 'why':       return this.why(prev, ast, sys);
        case 'stats':     return this.stats(prev, sys);
        case 'overrides': return this.overrides(prev);
        case 'lexicon':   return this.lexicon(prev);
        case 'replay':    return this.replay(prev, ast, sys);
        case 'clear':     return this.clear(prev, sys);
        case 'help':      return this.help(prev);
        default:
          return {
            ...prev, ok: false, halt: true,
            error: `narrative.${sub} não suportado (tente diag.narrative.help)`,
          };
      }
    } catch (err) {
      return {
        ...prev, ok: false, halt: true,
        error: err?.message ?? String(err),
      };
    }
  }

  // ══════════════════════════════════════════════════════════
  // HANDLERS
  // ══════════════════════════════════════════════════════════

  /**
   * `diag.narrative.recent [n]` — últimos N atos do IR.
   *
   * @param {Object} prev
   * @param {Object} ast
   * @param {Object} sys
   * @returns {Object}
   */
  recent(prev, ast, sys) {
    const ir = sys._lastIR;
    if (!ir) {
      return this._emptyIR(prev, 'diag.narrative.recent');
    }

    const nArg = ast?.positional?.[1];
    const n = nArg ? parseInt(nArg, 10) : 20;
    const limit = Number.isFinite(n) ? Math.max(1, Math.min(100, n)) : 20;

    const allActs = Array.isArray(ir.acts) ? ir.acts : [];
    const acts = allActs.slice(-limit);

    return {
      ...prev, ok: true, mutated: false,
      right: {
        kind: 'diagnostics',
        title: `📖 diag.narrative.recent (${acts.length}/${allActs.length})`,
        data: {
          status: {
            total: allActs.length,
            showing: acts.length,
            diagnosticCount: Array.isArray(ir.diagnostics) ? ir.diagnostics.length : 0,
            documentId: ir.documentId ?? null,
            tick: typeof sys.machine?.getTick === 'function'
              ? sys.machine.getTick()
              : null,
          },
          events: acts.map((a, i) => ({
            seq: i + 1,
            event: (a.operations ?? []).join('+') || '?',
            tick: null,
            payload: {
              actId: a.id,
              source: (a.source?.raw ?? '').slice(0, 80),
              confidence: a.confidence,
              voice: a.voice?.kind ?? null,
              focalization: a.focalization?.targetId ?? a.focalization?.kind ?? null,
              form: a.form ?? null,
              epistemic: a.epistemic ?? null,
            },
          })),
        },
        sticky: true,
      },
    };
  }

  /**
   * `diag.narrative.why <actId>` — trace completo.
   *
   * Handler assíncrono: emite `render:right` quando o trace estiver pronto
   * e devolve imediatamente um payload "em progresso".
   *
   * @param {Object} prev
   * @param {Object} ast
   * @param {Object} sys
   * @returns {Object}
   */
  why(prev, ast, sys) {
    if (this._whyRunning) {
      return {
        ...prev, ok: true, mutated: false,
        right: {
          kind: 'diagnostics',
          title: '📖 diag.narrative.why',
          data: { raw: 'Trace já em execução. Aguarde.' },
        },
      };
    }

    const actId = ast?.positional?.[1];
    if (!actId) {
      return {
        ...prev, ok: false, halt: true,
        error: 'uso: diag.narrative.why <actId>',
      };
    }

    const ir = sys._lastIR;
    if (!ir) {
      return this._emptyIR(prev, `diag.narrative.why ${actId}`);
    }

    this._whyRunning = true;

    const bus = this.bus;
    const overrides = sys._overrides instanceof Map ? sys._overrides : null;
    const lexicon = sys._userLexicon instanceof Map ? sys._userLexicon : null;

    Trace.trace(actId, ir, { overrides, lexicon })
      .then((report) => {
        if (report.error) {
          bus.emit('render:right', {
            kind: 'diagnostics',
            title: `📖 diag.narrative.why — erro`,
            data: {
              status: { actId, error: report.error },
              raw: `Erro ao gerar trace:\n${report.error}`,
            },
            sticky: true,
          });
          return;
        }

        const md = Trace.toMarkdown(report);
        const c = report.comparison;

        bus.emit('render:right', {
          kind: 'diagnostics',
          title: `📖 diag.narrative.why ${actId}`,
          data: {
            status: {
              actId,
              deterministic: c?.deterministic ?? null,
              irOps: c?.irOperations?.join('+') ?? null,
              replayOps: c?.replayedOperations?.join('+') ?? null,
              irConf: c?.irConfidence ?? null,
              replayConf: c?.replayedConfidence ?? null,
              stageCount: report.stages.length,
            },
            raw: md,
          },
          sticky: true,
        });
      })
      .catch((err) => {
        bus.emit('render:right', {
          kind: 'diagnostics',
          title: '📖 diag.narrative.why — erro',
          data: { raw: `Erro: ${err?.message ?? String(err)}` },
        });
      })
      .finally(() => {
        this._whyRunning = false;
      });

    return {
      ...prev, ok: true, mutated: false,
      right: {
        kind: 'diagnostics',
        title: `📖 diag.narrative.why ${actId}`,
        data: { raw: 'Executando trace...' },
      },
    };
  }

  /**
   * `diag.narrative.stats` — estatísticas do NarrativeSystem.
   *
   * @param {Object} prev
   * @param {Object} sys
   * @returns {Object}
   */
  stats(prev, sys) {
    let st;
    try {
      st = typeof sys.getStats === 'function' ? sys.getStats() : {};
    } catch {
      st = {};
    }

    const stats = st.stats ?? {};

    return {
      ...prev, ok: true, mutated: false,
      right: {
        kind: 'diagnostics',
        title: '📖 diag.narrative.stats',
        data: {
          status: {
            mode: st.mode ?? '?',
            analyzed: stats.analyzed ?? 0,
            previewed: stats.previewed ?? 0,
            suggested: stats.suggested ?? 0,
            applied: stats.applied ?? 0,
            failed: stats.failed ?? 0,
            skipped: stats.skipped ?? 0,
            overridesApplied: stats.overrides ?? 0,
            learned: stats.learned ?? 0,
            overridesCount: st.overridesCount ?? 0,
            lexiconCount: st.lexiconCount ?? 0,
            hasLastIR: st.hasLastIR ?? false,
            lastIRActs: st.lastIRActs ?? 0,
          },
        },
        sticky: true,
      },
    };
  }

  /**
   * `diag.narrative.overrides` — overrides do autor.
   *
   * @param {Object} prev
   * @returns {Object}
   */
  overrides(prev) {
    let list = [];
    let st = {};
    try {
      list = listOverrides();
      st = overrideStats();
    } catch { /* isola */ }

    return {
      ...prev, ok: true, mutated: false,
      right: {
        kind: 'table',
        title: `📖 diag.narrative.overrides (${list.length})`,
        data: list.slice(0, 50).map((o) => ({
          spanKey: o.key,
          chose: o.chose,
          rejected: (o.rejected ?? []).join(', '),
          uses: o.uses ?? 0,
          ttlDays: Math.round((o.ttl ?? DEFAULT_TTL_MS) / (24 * 60 * 60 * 1000)),
        })),
        metadata: { stats: st },
        sticky: true,
      },
    };
  }

  /**
   * `diag.narrative.lexicon` — preferências aprendidas.
   *
   * @param {Object} prev
   * @returns {Object}
   */
  lexicon(prev) {
    let list = [];
    let st = {};
    try {
      list = listPreferences();
      st = lexiconStats();
    } catch { /* isola */ }

    return {
      ...prev, ok: true, mutated: false,
      right: {
        kind: 'table',
        title: `📖 diag.narrative.lexicon (${list.length})`,
        data: list.slice(0, 50).map((p) => ({
          lemma: p.lemma,
          prefere: p.prefer,
          contexto: p.context ?? '—',
          uses: p.uses,
        })),
        metadata: { stats: st },
        sticky: true,
      },
    };
  }

  /**
   * `diag.narrative.replay <actId>` — propostas para um ato.
   *
   * NÃO aplica. Apenas calcula e exibe as propostas que seriam emitidas
   * em política `simulate`.
   *
   * @param {Object} prev
   * @param {Object} ast
   * @param {Object} sys
   * @returns {Object}
   */
  replay(prev, ast, sys) {
    if (this._replayRunning) {
      return {
        ...prev, ok: true, mutated: false,
        right: {
          kind: 'diagnostics',
          title: '📖 diag.narrative.replay',
          data: { raw: 'Cálculo já em execução. Aguarde.' },
        },
      };
    }

    const actId = ast?.positional?.[1];
    if (!actId) {
      return {
        ...prev, ok: false, halt: true,
        error: 'uso: diag.narrative.replay <actId>',
      };
    }

    const ir = sys._lastIR;
    if (!ir) {
      return this._emptyIR(prev, `diag.narrative.replay ${actId}`);
    }

    const act = (ir.acts ?? []).find((a) => a?.id === actId);
    if (!act) {
      return {
        ...prev, ok: false, halt: true,
        error: `act não encontrado: ${actId}`,
      };
    }

    this._replayRunning = true;

    const bus = this.bus;

    import('../acts/projector.js')
      .then(({ project }) => {
        const policy = 'simulate';
        const proposals = project(act, { projection: policy });

        bus.emit('render:right', {
          kind: 'diagnostics',
          title: `📖 diag.narrative.replay ${actId} (${proposals.length})`,
          data: {
            status: {
              actId,
              policy,
              count: proposals.length,
              actOps: (act.operations ?? []).join('+'),
            },
            events: proposals.map((p, i) => ({
              seq: i + 1,
              event: p.kind ?? 'mutate',
              tick: null,
              payload: {
                command: p.command,
                confidence: p.confidence,
                preview: p.preview,
                reversible: p.reversible !== false,
              },
            })),
            raw: proposals.length === 0
              ? 'Nenhuma proposta para este ato na política "simulate".\nVerifique se o predicate tem projeção registrada.'
              : `Aplicar via \`${proposals.length} comando(s)\`:\n` +
                proposals.map((p) => `  ${p.command}`).join('\n'),
          },
          sticky: true,
        });
      })
      .catch((err) => {
        bus.emit('render:right', {
          kind: 'diagnostics',
          title: '📖 diag.narrative.replay — erro',
          data: { raw: `Erro: ${err?.message ?? String(err)}` },
        });
      })
      .finally(() => {
        this._replayRunning = false;
      });

    return {
      ...prev, ok: true, mutated: false,
      right: {
        kind: 'diagnostics',
        title: `📖 diag.narrative.replay ${actId}`,
        data: { raw: 'Calculando propostas...' },
      },
    };
  }

  /**
   * `diag.narrative.clear` — limpa o IR em cache do NarrativeSystem.
   *
   * NÃO toca storage de overrides nem lexicon. Só libera memória.
   *
   * @param {Object} prev
   * @param {Object} sys
   * @returns {Object}
   */
  clear(prev, sys) {
    let cleared = false;
    try {
      sys._lastIR = null;
      sys._lastLine = null;
      cleared = true;
    } catch { /* isola */ }

    return {
      ...prev, ok: true, mutated: false,
      right: {
        kind: 'diagnostics',
        title: '📖 diag.narrative.clear',
        data: {
          status: { cleared },
          raw: cleared
            ? 'IR em cache foi liberado. Próxima digitação reanalisa do zero.'
            : 'Falha ao limpar cache.',
        },
      },
    };
  }

  /**
   * `diag.narrative.help` — ajuda.
   *
   * @param {Object} prev
   * @returns {Object}
   */
  help(prev) {
    const stages = Trace.listTraceableStages();
    return {
      ...prev, ok: true, mutated: false,
      right: {
        kind: 'diagnostics',
        title: '📖 diag.narrative — ajuda',
        data: {
          raw: [
            'Subcomandos disponíveis:',
            '',
            '  diag.narrative.recent [n]      — últimos N atos do IR (default 20, max 100)',
            '  diag.narrative.why <actId>     — trace completo de um ato',
            '  diag.narrative.stats           — estatísticas do NarrativeSystem',
            '  diag.narrative.overrides       — overrides do autor (persistidos)',
            '  diag.narrative.lexicon         — preferências aprendidas',
            '  diag.narrative.replay <actId>  — propostas para um ato (não aplica)',
            '  diag.narrative.clear           — limpa o IR em cache',
            '  diag.narrative.help            — esta ajuda',
            '',
            `Estágios rastreáveis em "why": ${stages.join(' → ')}`,
            '',
            'Exemplos:',
            '  diag.narrative.recent 10',
            '  diag.narrative.why act-s1-1',
            '  diag.narrative.replay act-s1-1',
          ].join('\n'),
        },
        sticky: true,
      },
    };
  }

  // ══════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════

  /**
   * Obtém o NarrativeSystem via machine.
   * @returns {Object|null}
   * @private
   */
  _getNarrativeSystem() {
    try {
      return this.machine?.systems?.get?.('NarrativeSystem') ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Payload padrão quando o NarrativeSystem está ausente.
   * @private
   */
  _noNarrativeSystem(prev) {
    return {
      ...prev, ok: true, mutated: false,
      right: {
        kind: 'diagnostics',
        title: '📖 diag.narrative — indisponível',
        data: {
          raw: 'NarrativeSystem não está registrado no pipeline.\nVerifique o boot.js.',
        },
      },
    };
  }

  /**
   * Payload padrão quando não há IR analisado.
   * @private
   */
  _emptyIR(prev, title) {
    return {
      ...prev, ok: true, mutated: false,
      right: {
        kind: 'diagnostics',
        title: `📖 ${title}`,
        data: {
          raw: 'Nenhum IR analisado ainda.\nEscreva alguma prosa no editor com modo narrativo em `preview` ou superior.',
        },
      },
    };
  }
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const DiagHandlers = Object.freeze({
  NarrativeDiagHandlers,
});