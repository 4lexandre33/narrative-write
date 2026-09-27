/**
 * @file ui-battery.js
 * @module diagnostics
 * @description Orquestrador da bateria de testes de UI.
 * @imports diagnostics/ui-harness, diagnostics/sandbox, diagnostics/test-reporter,
 *          ui/*, editor/editor
 * @importedBy boot.js (efeito colateral), diagnostics/index (Fase F)
 * @level 9
 *
 * Fase E — cenários da fase `flow` rodam contra um pipeline sandbox
 * real (createSandbox de diagnostics/sandbox.js), não contra o
 * minimal machine. Isso permite testar o fluxo completo:
 * comando → pipeline → eventos → UI reage.
 */

import {
  createPhaseContext,
  createSandbox as createUISandbox,
  createMinimalMachine,
  getStylesHref,
  flushRAF,
  flushMicrotasks,
  AssertionError,
  assertVisible,
  assertHidden,
  assertHasClass,
  assertNotHasClass,
  assertText,
  assertValue,
  assertSelector,
  assertNoSelector,
  assertCount,
  assertEmitCount,
  assertEmitWith,
} from './ui-harness.js';

import { createSandbox as createPipelineSandbox } from './sandbox.js';

import { UI_SCENARIOS, UI_PHASE_ORDER } from './ui-scenario-library.js';
import { TestReporter } from './test-reporter.js';

import { ToastManager } from '../ui/toast.js';
import { ModalManager } from '../ui/modal.js';
import { PanelLeft } from '../ui/panel-left.js';
import { PanelRight } from '../ui/panel-right.js';
import { FloatingMenu } from '../ui/floating-menu.js';
import { KeyboardRouter } from '../ui/keyboard-router.js';
import { FocusManager } from '../ui/focus-manager.js';
import { ShortcutRegistry } from '../ui/shortcut-registry.js';
import { RollOverlay } from '../ui/roll-overlay.js';
import { PlayOverlay } from '../ui/play-overlay.js';
import { HistoryPanel } from '../ui/history-panel.js';
import { CommandGuide } from '../ui/command-guide.js';
import { Editor } from '../editor/editor.js';

const COMPONENT_REGISTRY = {
  ToastManager,
  ModalManager,
  PanelLeft,
  PanelRight,
  FloatingMenu,
  KeyboardRouter,
  FocusManager,
  ShortcutRegistry,
  RollOverlay,
  PlayOverlay,
  HistoryPanel,
  CommandGuide,
  Editor,
};

export class UIBattery {
  constructor({ reporter = null } = {}) {
    this.reporter = reporter || new TestReporter();
    this.running = false;
    this.lastReport = null;
  }

  async runAll({
    scenarios = UI_SCENARIOS,
    phases = 'all',
    stopOnFirstFailure = false,
    onProgress = null,
  } = {}) {
    if (this.running) return this.lastReport;
    this.running = true;

    const t0 = this._now();
    const wanted = this._resolvePhases(phases);
    const grouped = this._groupByPhase(scenarios, wanted);
    const phaseResults = [];

    try {
      for (let i = 0; i < wanted.length; i++) {
        const phaseName = wanted[i];
        const list = grouped[phaseName] || [];

        if (list.length === 0) {
          phaseResults.push(this._skipPhase(phaseName, 'sem cenários'));
          continue;
        }

        let result;
        try {
          result = await this._runPhase(phaseName, list, onProgress, i, wanted.length);
        } catch (err) {
          result = this._explodedPhase(phaseName, err);
        }

        phaseResults.push(result);
        if (stopOnFirstFailure && !result.ok && !result.skipped) break;
      }
    } finally {
      this.running = false;
    }

    const report = this.reporter.summarize(phaseResults, {
      durationMs: this._now() - t0,
      seed: null,
      iterations: null,
    });
    this.lastReport = report;
    return report;
  }

  // ══════════════════════════════════════════════════════════
  // Execução de fase
  // ══════════════════════════════════════════════════════════

  async _runPhase(phaseName, scenarios, onProgress, phaseIndex, phaseTotal) {
    const t0 = this._now();
    let ctx = null;
    let creationError = null;

    try {
      try {
        ctx = await createPhaseContext({ cssHref: getStylesHref() });
      } catch (err) {
        creationError = err;
        throw err;
      }

      const results = [];

      for (let i = 0; i < scenarios.length; i++) {
        const scenario = scenarios[i];
        const result = await this._runScenario(ctx, scenario);
        results.push(result);

        if (typeof onProgress === 'function') {
          try {
            onProgress({
              phase: phaseName,
              scenario: scenario.name,
              result,
              index: i,
              total: scenarios.length,
            });
          } catch { /* isola */ }
        }
      }

      const passed = results.filter(r => r.ok).length;
      const failed = results.filter(r => !r.ok).length;

      const phaseData = {
        passed,
        failed,
        total: scenarios.length,
        results,
      };
      if (ctx.warning) phaseData.warning = ctx.warning;

      return {
        phase: phaseName,
        ok: failed === 0,
        skipped: false,
        reason: ctx.warning ?? null,
        durationMs: this._round(this._now() - t0),
        summary: `${passed}/${scenarios.length}${ctx.warning ? ' (fallback)' : ''}`,
        data: phaseData,
        failures: results
          .filter(r => !r.ok)
          .map(r => ({
            scenario: r.name,
            error: r.error,
            stack: r.stack,
            assertion: r.assertion,
          })),
        error: null,
      };
    } catch (err) {
      return {
        phase: phaseName,
        ok: false,
        skipped: false,
        reason: null,
        durationMs: this._round(this._now() - t0),
        summary: 'erro fatal na fase',
        data: {
          creationError: creationError ? {
            message: creationError.message,
            stack: creationError.stack,
          } : null,
        },
        failures: [{
          message: err?.message ?? String(err),
          stack: err?.stack ?? null,
        }],
        error: err?.message ?? String(err),
        stack: err?.stack ?? null,
      };
    } finally {
      if (ctx) {
        try { await ctx.destroy(); } catch { /* isola */ }
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  // Execução de cenário
  // ══════════════════════════════════════════════════════════

  async _runScenario(ctx, scenario) {
    const t0 = this._now();
    let uiSandbox = null;
    let pipelineSandbox = null;

    try {
      uiSandbox = createUISandbox(ctx);
    } catch (err) {
      return {
        name: scenario.name,
        category: scenario.category,
        ok: false,
        durationMs: this._round(this._now() - t0),
        failures: [{ message: `sandbox falhou: ${err.message}`, stack: err.stack }],
        error: `sandbox falhou: ${err.message}`,
        stack: err.stack,
        assertion: null,
      };
    }

    try {
      let machine;

      if (scenario.phase === 'flow') {
        // Fase E — pipeline real (29 sistemas + world seedado).
        pipelineSandbox = await createPipelineSandbox({ seedEntities: true });
        machine = pipelineSandbox.machine;
      } else {
        machine = createMinimalMachine();
      }

      const scenarioCtx = {
        sandbox: uiSandbox,
        machine,
        world: machine.world,
        bus: machine.bus,
        win: ctx.win,
        doc: ctx.doc,
        // Primitivos
        ToastManager,
        ModalManager,
        PanelLeft,
        PanelRight,
        FloatingMenu,
        // Editor/teclado/foco
        Editor,
        KeyboardRouter,
        FocusManager,
        ShortcutRegistry,
        // Overlays
        RollOverlay,
        PlayOverlay,
        HistoryPanel,
        CommandGuide,
      };

      if (typeof scenario.setup === 'function') {
        await scenario.setup(scenarioCtx);
      }
      if (typeof scenario.act === 'function') {
        await scenario.act(scenarioCtx);
      }

      await flushMicrotasks();
      await flushRAF(ctx.win);

      const expectList = typeof scenario.expect === 'function'
        ? await scenario.expect(scenarioCtx)
        : (scenario.expect || []);

      const failures = [];
      for (const check of expectList) {
        try {
          await this._runCheck(scenarioCtx, check);
        } catch (err) {
          failures.push({
            check: check.check ?? check.name ?? 'inline',
            message: err.message,
            expected: err.expected,
            actual: err.actual,
            snapshot: err.snapshot,
            stack: err.stack,
          });
        }
      }

      return {
        name: scenario.name,
        category: scenario.category,
        ok: failures.length === 0,
        durationMs: this._round(this._now() - t0),
        failures,
        error: null,
        stack: null,
        assertion: failures[0] ?? null,
      };
    } catch (err) {
      return {
        name: scenario.name,
        category: scenario.category,
        ok: false,
        durationMs: this._round(this._now() - t0),
        failures: [{ message: err.message, stack: err.stack }],
        error: err.message,
        stack: err.stack,
        assertion: null,
      };
    } finally {
      if (uiSandbox) {
        try { uiSandbox.destroy(); } catch { /* isola */ }
      }
      if (pipelineSandbox) {
        try { pipelineSandbox.dispose(); } catch { /* isola */ }
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  // Checks
  // ══════════════════════════════════════════════════════════

  async _runCheck(ctx, check) {
    if (typeof check.fn === 'function') {
      const result = await check.fn(ctx);
      if (result === false) {
        throw new AssertionError(`check "${check.name ?? 'inline'}" retornou false`);
      }
      return;
    }

    const container = ctx.sandbox.container;
    const findNode = (sel) => {
      if (!sel) return container;
      const found = container.querySelector(sel);
      if (!found) {
        throw new AssertionError(
          `check "${check.check}": seletor "${sel}" não encontrado`,
          { expected: sel, actual: '(ausente)' }
        );
      }
      return found;
    };

    switch (check.check) {
      case 'visible':     return assertVisible(findNode(check.selector));
      case 'hidden':      return assertHidden(findNode(check.selector));
      case 'hasClass':    return assertHasClass(findNode(check.selector), check.className);
      case 'notHasClass': return assertNotHasClass(findNode(check.selector), check.className);
      case 'text':        return assertText(findNode(check.selector), check.equal);
      case 'value':       return assertValue(findNode(check.selector), check.equal);
      case 'count':       return assertCount(container, check.selector, check.equal);
      case 'selector':    return assertSelector(container, check.selector);
      case 'noSelector':  return assertNoSelector(container, check.selector);
      case 'emitCount':   return assertEmitCount(check.spy, check.equal);
      case 'emitWith':    return assertEmitWith(check.spy, check.predicate);
      default:
        throw new AssertionError(`check desconhecido: "${check.check}"`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // Helpers
  // ══════════════════════════════════════════════════════════

  _resolvePhases(spec) {
    if (!spec || spec === 'all') return [...UI_PHASE_ORDER];
    if (Array.isArray(spec)) {
      const list = spec.filter(p => UI_PHASE_ORDER.includes(p));
      return list.length > 0 ? list : [...UI_PHASE_ORDER];
    }
    const list = String(spec)
      .split(',')
      .map(s => s.trim())
      .filter(p => UI_PHASE_ORDER.includes(p));
    return list.length > 0 ? list : [...UI_PHASE_ORDER];
  }

  _groupByPhase(scenarios, phases) {
    const groups = {};
    for (const phase of phases) groups[phase] = [];
    for (const s of scenarios) {
      if (groups[s.phase]) groups[s.phase].push(s);
    }
    return groups;
  }

  _skipPhase(phase, reason) {
    return {
      phase,
      ok: true,
      skipped: true,
      reason,
      durationMs: 0,
      summary: `skip: ${reason}`,
      data: null,
      failures: [],
      error: null,
    };
  }

  _explodedPhase(phase, err) {
    return {
      phase,
      ok: false,
      skipped: false,
      reason: null,
      durationMs: 0,
      summary: 'erro fatal na fase',
      data: null,
      failures: [{
        message: err?.message ?? String(err),
        stack: err?.stack ?? null,
      }],
      error: err?.message ?? String(err),
      stack: err?.stack ?? null,
    };
  }

  _now() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  _round(n) {
    return Math.round(Number(n) * 1000) / 1000;
  }
}

// ══════════════════════════════════════════════════════════════
// Serialização e exportação
// ══════════════════════════════════════════════════════════════

function serializeReport(report, pretty = true) {
  const seen = new WeakSet();
  const cleaned = JSON.parse(JSON.stringify(report, (key, value) => {
    if (typeof value === 'function') return '[Function]';
    if (typeof value === 'symbol') return '[Symbol]';
    if (value instanceof Node) return '[DOMNode]';
    if (value && typeof value === 'object') {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  }));
  return pretty ? JSON.stringify(cleaned, null, 2) : JSON.stringify(cleaned);
}

function downloadReport(report, filename) {
  try {
    const verdict = report?.summary?.ok ? 'PASS' : 'FAIL';
    const ts = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const name = filename || `ui-battery-${verdict}-${ts}.json`;
    const json = serializeReport(report, true);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { ok: true, filename: name };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function copyReport(report) {
  try {
    const json = serializeReport(report, true);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(json);
      return { ok: true, bytes: json.length };
    }
    const ta = document.createElement('textarea');
    ta.value = json;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return { ok: true, bytes: json.length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function describeFailures(report) {
  if (!report || !Array.isArray(report.phases)) {
    console.warn('[ui-battery] report inválido');
    return;
  }

  const rows = [];
  for (const phase of report.phases) {
    if (phase.ok || phase.skipped) continue;
    const failed = phase.data?.results?.filter(r => !r.ok) ?? [];
    for (const r of failed) {
      rows.push({
        phase: phase.phase,
        cenário: r.name,
        categoria: r.category,
        erro: (r.error || r.failures?.[0]?.message || '?').slice(0, 100),
      });
    }
    if (failed.length === 0 && phase.failures?.length > 0) {
      rows.push({
        phase: phase.phase,
        cenário: '(fase)',
        categoria: '—',
        erro: (phase.failures[0].message || '?').slice(0, 100),
      });
    }
  }

  if (rows.length === 0) {
    console.log('✅ Nenhuma falha.');
    return;
  }
  console.table(rows);
  console.log('Dica: window.__UIBattery.exportReport(report) para baixar o JSON completo.');
}

// ══════════════════════════════════════════════════════════════
// Conveniência para o console
// ══════════════════════════════════════════════════════════════

export async function runUIBattery(opts = {}) {
  const battery = new UIBattery();
  const report = await battery.runAll(opts);
  if (typeof window !== 'undefined') window.__lastUIReport = report;
  return report;
}

if (typeof window !== 'undefined') {
  window.__UIBattery = {
    UIBattery,
    runUIBattery,
    UI_SCENARIOS,
    UI_PHASE_ORDER,

    serializeReport,
    downloadReport,
    copyReport,
    describeFailures,

    exportReport: (report, filename) => downloadReport(report, filename),
    copyReport: (report) => copyReport(report),
  };
}