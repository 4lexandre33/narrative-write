/**
 * @file ui-wires.js
 * @module ui
 * @description Wiring central de eventos do bus para a UI.
 * @imports core/utils/dom, systems/helpers/roll-picker
 * @importedBy boot.js, diagnostics/ui-harness
 * @level 12
 *
 * Fase 6 — Wiring narrativo.
 * Fase 13 — Autocomplete universal (`replaceRange`).
 * Fase 13.4 — Preview visual robusto.
 * Fase 13.6 — Diagnósticos narrativos com dedup:
 *   - Cada código de diagnóstico → UM toast (chave `narr-diag:<code>`).
 *   - Análise seguinte reconcilia: códigos que sumiram → toast removido.
 *   - Só `warning` e `error` são mostrados (`info` é silencioso).
 *   - Máximo de 5 toasts narrativos simultâneos.
 */

import { triggerDownload } from '../core/utils/dom.js';
import { RollPicker } from '../systems/helpers/roll-picker.js';

/**
 * Quantos toasts narrativos podem coexistir.
 * @type {number}
 */
const _MAX_NARRATIVE_TOASTS = 5;

/**
 * Duração de toasts narrativos (longa — não piscam).
 * @type {number}
 */
const _NARRATIVE_TOAST_MS = 6000;

// ══════════════════════════════════════════════════════════════
// createPlatformDOM
// ══════════════════════════════════════════════════════════════

export function createPlatformDOM(doc = document) {
  const platform = doc.createElement('div');
  platform.id = 'narrative-platform';
  platform.className = 'visible';

  const header = doc.createElement('div');
  header.className = 'narrative-header';

  const title = doc.createElement('div');
  title.textContent = 'Editor Narrativo ECS';
  header.appendChild(title);

  const actions = doc.createElement('div');
  actions.className = 'narrative-header-actions';

  const mkSpan = (attr, text = '') => {
    const s = doc.createElement('span');
    s.setAttribute(attr, '');
    s.textContent = text;
    return s;
  };
  actions.appendChild(mkSpan('data-tick', 'T0'));
  actions.appendChild(mkSpan('data-boot-mode', '—'));
  actions.appendChild(mkSpan('data-save-indicator', '●'));

  const mkBtn = (action, text, title) => {
    const b = doc.createElement('button');
    b.className = 'header-btn';
    b.setAttribute('data-action', action);
    if (title) b.title = title;
    b.textContent = text;
    return b;
  };

  actions.appendChild(mkBtn(
    'narrative-mode',
    '📖 OFF',
    'Modo narrativo — clique para ciclar (OFF → PRV → SUG → AUTO)'
  ));

  actions.appendChild(mkBtn('test', '🧪', 'Rodar bateria de testes automáticos (diag.test)'));
  actions.appendChild(mkBtn('guide', 'Comandos'));
  actions.appendChild(mkBtn('config', 'Config'));
  actions.appendChild(mkBtn('mode', '🌐'));

  header.appendChild(actions);
  platform.appendChild(header);

  const body = doc.createElement('div');
  body.className = 'narrative-body';

  const leftEl = doc.createElement('aside');
  leftEl.className = 'panel-left';
  body.appendChild(leftEl);

  const editorEl = doc.createElement('main');
  editorEl.className = 'editor-container';
  body.appendChild(editorEl);

  const rightEl = doc.createElement('aside');
  rightEl.className = 'panel-right';
  body.appendChild(rightEl);

  platform.appendChild(body);

  return { platform, header, leftEl, editorEl, rightEl };
}

// ══════════════════════════════════════════════════════════════
// wireUI
// ══════════════════════════════════════════════════════════════

export function wireUI(machine, app) {
  if (!machine || !machine.bus) {
    throw new Error('[wireUI] machine inválido');
  }

  const bus = machine.bus;
  const unsubs = [];
  const on = (event, handler) => {
    try {
      const unsub = bus.on(event, handler);
      unsubs.push(unsub);
    } catch { /* isola */ }
  };

  const {
    panelLeft, panelRight, floatingMenu, toast, editor, rollOverlay,
  } = app || {};

  // ── Estado interno: códigos de diagnóstico atualmente visíveis ──
  /** @type {Set<string>} */
  const narrativeDiagCodes = new Set();

  // ══════════════════════════════════════════════════════════
  // RENDER BASE
  // ══════════════════════════════════════════════════════════

  on('render:left', (payload) => {
    if (!payload || !panelLeft) return;
    if (payload.kind === 'highlight' && Array.isArray(payload.ids)) {
      panelLeft.render?.();
      for (const id of payload.ids) panelLeft.pulse(id);
    } else if (payload.kind === 'tree') {
      panelLeft.render?.();
    }
  });

  on('render:right', (payload) => {
    panelRight?.update?.(payload);
  });

  on('render:annotation', (ann) => {
    if (ann && editor) editor.annotate(ann);
  });

  on('tick:advanced', ({ tick }) => {
    if (!app?.platform) return;
    const badge = app.platform.querySelector('[data-tick]');
    if (badge) badge.textContent = tick;
  });

  // ══════════════════════════════════════════════════════════
  // MENU FLUTUANTE
  // ══════════════════════════════════════════════════════════

  on('ui:menu:open', ({ trigger, items, cursor, mode, insertRange }) => {
    floatingMenu?.open?.({
      trigger,
      items,
      cursor,
      mode: mode ?? 'snippet',
      insertRange: insertRange ?? null,
    });
  });

  on('ui:menu:close', () => floatingMenu?.close?.());

  on('ui:snippet:insert', ({ text, replaceRange }) => {
    if (typeof text !== 'string' || text.length === 0 || !editor) return;

    if (replaceRange && typeof replaceRange.from === 'number') {
      try {
        editor.replaceRange(replaceRange.from, replaceRange.to, text);
      } catch (err) {
        console.warn('[wireUI] replaceRange falhou:', err);
        editor.insert(text);
      }
    } else {
      editor.insert(text);
    }
  });

  // ══════════════════════════════════════════════════════════
  // PAINÉIS
  // ══════════════════════════════════════════════════════════

  on('ui:panel:toggle', () => {
    if (typeof app?.togglePlatform === 'function') app.togglePlatform();
  });
  on('ui:panel:left:toggle', () => {
    const panel = app?.platform?.querySelector('.panel-left');
    if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
  });
  on('ui:panel:right:toggle', () => {
    const panel = app?.platform?.querySelector('.panel-right');
    if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
  });

  // ══════════════════════════════════════════════════════════
  // ATALHOS / ROLL / ERROS
  // ══════════════════════════════════════════════════════════

  on('ui:shortcut', ({ name }) => {
    if (toast && (name === 'undo' || name === 'redo')) {
      toast.info(`${name === 'undo' ? '↩ Desfeito' : '↪ Refeito'} (em breve)`, 1500);
    }
  });

  on('ui:roll:committed', ({ lines }) => {
    if (Array.isArray(lines) && lines.length > 0 && editor) {
      editor.insert(lines.join('\n') + '\n');
      toast?.success?.('Roll aplicado ao editor.');
    }
  });

  on('ui:roll:start', () => {
    if (!rollOverlay) return;
    const picker = new RollPicker(machine);
    const sequence = picker.defaultSequence();
    if (sequence.length === 0) {
      toast?.warning?.('Nada para rolar — crie sets e phrases primeiro.');
      return;
    }
    rollOverlay.setPicker((cat) => picker.pickNext(cat));
    rollOverlay.start({ sequence, interval: 800 });
  });

  on('ui:flash-error', ({ message }) => {
    toast?.error?.(message ?? 'Erro');
  });

  // ══════════════════════════════════════════════════════════
  // PERSISTÊNCIA
  // ══════════════════════════════════════════════════════════

  on('persist:saved', () => {
    const dot = app?.platform?.querySelector('[data-save-indicator]');
    if (dot) {
      dot.classList.add('pulse');
      setTimeout(() => dot.classList.remove('pulse'), 400);
    }
  });
  on('persist:failed', ({ error }) => {
    toast?.warning?.(`Falha ao salvar: ${error}`);
  });

  on('boot:complete', (info) => {
    const badge = app?.platform?.querySelector('[data-boot-mode]');
    if (badge) badge.textContent = info.mode === 'warm' ? '🌡 warm' : '❄ cold';
  });

  on('rule:fired', ({ affected }) => {
    toast?.info?.(`🔔 Regra disparou: ${affected?.length ?? 0} alvo(s)`, 2500);
  });

  // ══════════════════════════════════════════════════════════
  // EXPORT
  // ══════════════════════════════════════════════════════════

  on('export:ready', ({ blob, filename, format }) => {
    try {
      triggerDownload(blob, filename);
      if (format === 'pdf' || format === 'html') {
        toast?.info?.(
          `📄 ${filename} baixado. Abra e use Ctrl+P para salvar como PDF.`,
          6000
        );
      } else {
        toast?.success?.(`📦 Exportado: ${filename}`);
      }
    } catch (err) {
      toast?.error?.(`Falha ao exportar: ${err.message}`);
    }
  });

  // ══════════════════════════════════════════════════════════
  // BATERIA
  // ══════════════════════════════════════════════════════════

  on('test:battery:complete', (report) => {
    if (report?.summary?.ok) {
      toast?.success?.(
        `🧪 Bateria aprovada — ${report.summary.totalPassed}/${report.summary.totalPhases} fases`,
        4000
      );
    } else {
      toast?.warning?.(
        `🧪 Bateria reprovada — ${report?.summary?.totalFailed ?? '?'} falha(s)`,
        5000
      );
    }
  });

  on('test:battery:error', ({ error }) => {
    toast?.error?.(`🧪 Bateria falhou: ${error}`);
  });

  // ══════════════════════════════════════════════════════════
  // NARRATIVA — PREVIEW VISUAL (Fase 6 + 13.4 + 13.6)
  // ══════════════════════════════════════════════════════════

  /**
   * Helper: reconcilia os toasts narrativos com a lista atual de
   * códigos de diagnóstico. Remove os que sumiram.
   * @private
   */
  const reconcileNarrativeToasts = (currentCodes) => {
    for (const code of Array.from(narrativeDiagCodes)) {
      if (!currentCodes.has(code)) {
        try { toast?.dismiss?.(`narr-diag:${code}`); } catch { /* isola */ }
        narrativeDiagCodes.delete(code);
      }
    }
  };

  /**
   * Preview visual: aplica highlights + reconcilia toasts.
   */
  on('narrative:preview', (payload) => {
    if (!payload) return;

    // ── Reconciliação de toasts (removendo os que sumiram) ──
    const codes = new Set();
    const diags = Array.isArray(payload.ir?.diagnostics)
      ? payload.ir.diagnostics
      : [];
    for (const d of diags) {
      if (!d || typeof d.code !== 'string') continue;
      codes.add(d.code);
    }
    reconcileNarrativeToasts(codes);

    // ── Se IR vazio, limpa tudo ────────────────────────────
    if (!payload.acts?.length && !payload.spans?.length) {
      if (editor?.highlighter?.setNarrativeSpans) {
        try { editor.highlighter.setNarrativeSpans([]); } catch { /* isola */ }
      }
      return;
    }

    if (window.__NARRATIVE_DEBUG) {
      try {
        console.log('[wireUI] narrative:preview', {
          spans: payload.spans?.length ?? 0,
          acts: payload.acts?.length ?? 0,
          diagCodes: Array.from(codes),
        });
      } catch { /* isola */ }
    }

    if (!editor || !editor.highlighter) return;
    if (typeof editor.highlighter.setNarrativeSpans !== 'function') return;

    try {
      const acts = Array.isArray(payload.acts) ? payload.acts : [];
      const rawSpans = Array.isArray(payload.spans) ? payload.spans : [];

      const spans = rawSpans
        .map((sp) => {
          const sid = String(sp.id ?? '').split('.')[0];
          let act = acts.find((a) => a?.provenance?.sentenceId === sid);
          if (!act && acts.length === 1) act = acts[0];

          const operations =
            Array.isArray(act?.operations) && act.operations.length > 0
              ? act.operations
              : ['represent'];

          return {
            id: sp.id,
            start: sp.source?.start ?? sp.start,
            end: sp.source?.end ?? sp.end,
            raw: sp.raw,
            operations,
            primaryOperation: operations[0],
            confidence: typeof act?.confidence === 'number' ? act.confidence : 0.9,
            ambiguous: false,
          };
        })
        .filter((s) =>
          typeof s.start === 'number' &&
          typeof s.end === 'number' &&
          s.end > s.start
        );

      editor.highlighter.setNarrativeSpans(spans);
    } catch (err) {
      console.warn('[wireUI] narrative:preview → highlighter falhou:', err);
    }
  });

  // ══════════════════════════════════════════════════════════
  // NARRATIVA — DIAGNÓSTICOS (Fase 13.6: dedup por código)
  // ══════════════════════════════════════════════════════════

  /**
   * Diagnóstico narrativo: um toast por código, atualizado em lugar.
   *
   * Regras:
   *   - `info` → ignorado (silencioso)
   *   - `warning` / `error` → toast com chave `narr-diag:<code>`
   *   - Se já existe toast para o código → atualiza mensagem
   *   - Se o conjunto de códigos exceder `_MAX_NARRATIVE_TOASTS`,
   *     descarta silenciosamente os excedentes
   */
  on('narrative:diagnostic', (diag) => {
    if (!diag) return;

    const severity = diag.severity;
    if (severity !== 'warning' && severity !== 'error') {
      // `info` não polui
      return;
    }

    const code = String(diag.code ?? 'unknown');
    const key = `narr-diag:${code}`;
    const msg = diag.message ? `${code}: ${diag.message}` : code;
    const type = severity === 'error' ? 'error' : 'warning';

    // Limite de toasts simultâneos
    if (!narrativeDiagCodes.has(code) && narrativeDiagCodes.size >= _MAX_NARRATIVE_TOASTS) {
      return;
    }

    try {
      toast?.show?.(msg, {
        type,
        duration: _NARRATIVE_TOAST_MS,
        key,
      });
      narrativeDiagCodes.add(code);
    } catch (err) {
      console.warn('[wireUI] falha ao mostrar diagnóstico:', err);
    }
  });

  // ══════════════════════════════════════════════════════════
  // NARRATIVA — SUGGEST / MODE
  // ══════════════════════════════════════════════════════════

  on('narrative:suggest', (payload) => {
    if (!panelRight) return;
    panelRight.update({
      kind: 'narrative',
      title: '📖 Propostas narrativas',
      data: {
        ir: payload.ir,
        proposals: payload.proposals,
      },
    });
  });

  on('narrative:degraded', ({ reason }) => {
    toast?.warning?.(`📖 Narrativa: ${reason}`, 4000, 'narr-degraded');
  });

  on('narrative:act:applied', ({ command }) => {
    if (window.__NARRATIVE_DEBUG) {
      console.log('[wireUI] ✅ act aplicado:', command);
    }
  });

  on('narr:override:set', ({ chose }) => {
    toast?.success?.(`Referência resolvida → ${chose}`, 2000, 'narr-override');
  });

  on('narr:mode:changed', ({ mode }) => {
    updateNarrativeButton(app?.platform, mode);
    // Ao trocar de modo, limpa todos os toasts narrativos
    for (const code of Array.from(narrativeDiagCodes)) {
      try { toast?.dismiss?.(`narr-diag:${code}`); } catch { /* isola */ }
      narrativeDiagCodes.delete(code);
    }
  });

  on('narr:act:focus', ({ act }) => {
    if (!act?.source || !editor) return;
    try {
      const ta = editor.textarea;
      if (!ta) return;
      const offset = act.source.start;
      ta.focus();
      ta.setSelectionRange(offset, offset);
      const before = ta.value.slice(0, offset);
      const lineIdx = (before.match(/\n/g) || []).length;
      const lineHeight = 20;
      ta.scrollTop = Math.max(0, (lineIdx - 3) * lineHeight);
    } catch { /* isola */ }
  });

  // ══════════════════════════════════════════════════════════
  // RETORNO
  // ══════════════════════════════════════════════════════════

  return unsubs;
}

// ══════════════════════════════════════════════════════════════
// HELPERS EXPORTADOS
// ══════════════════════════════════════════════════════════════

/**
 * Atualiza o rótulo do botão narrativo conforme o modo.
 * @param {HTMLElement} platform
 * @param {string} mode
 */
export function updateNarrativeButton(platform, mode) {
  if (!platform) return;
  const btn = platform.querySelector('[data-action="narrative-mode"]');
  if (!btn) return;

  const label = (() => {
    switch (mode) {
      case 'off':     return '📖 OFF';
      case 'preview': return '📖 PRV';
      case 'suggest': return '📖 SUG';
      case 'auto':    return '📖 AUTO';
      default:        return '📖 —';
    }
  })();

  btn.textContent = label;
  btn.title = `Modo narrativo: ${mode} (clique para ciclar)`;
  btn.classList.toggle('active', mode !== 'off');
}

/**
 * Cicla para o próximo modo narrativo.
 * @param {Object} machine
 * @returns {string} novo modo
 */
export function cycleNarrativeMode(machine) {
  try {
    const sys = machine?.systems?.get?.('NarrativeSystem');
    if (!sys) return 'off';

    const current = sys.getMode();
    const order = ['off', 'preview', 'suggest', 'auto'];
    const idx = order.indexOf(current);
    const next = order[(idx + 1) % order.length];

    machine.handleLine(`narr.${next}`);
    return next;
  } catch {
    return 'off';
  }
}