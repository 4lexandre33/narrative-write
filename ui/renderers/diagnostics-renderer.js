/**
 * @file diagnostics-renderer.js
 * @module ui/renderers
 * @description Renderiza painéis de diagnóstico (kind: 'diagnostics') e
 *              relatórios de TestBattery.
 * @imports core/utils/dom
 * @level 12
 *
 * Fase 13.7 — Extracted from ui/panel-right.js.
 */

import { el } from '../../core/utils/dom.js';

export function renderDiagnostics(payload, ctx) {
  const card = el('div', { class: 'result-card' });
  card.appendChild(el('div', { class: 'result-title' }, payload.title ?? '🔬 Diagnostics'));

  const data = payload.data ?? {};

  if (data.testReport) {
    _renderTestReport(card, data.testReport, ctx);
    ctx.appendActions(card, payload.actions);
    return card;
  }

  if (data.status && typeof data.status === 'object') card.appendChild(_statusSection(data.status));
  if (data.counts && typeof data.counts === 'object') card.appendChild(_countsSection(data.counts));
  if (Array.isArray(data.events) && data.events.length > 0) card.appendChild(_eventsSection(data.events));
  if (Array.isArray(data.logs) && data.logs.length > 0) card.appendChild(_logsSection(data.logs));
  if (typeof data.raw === 'string' && data.raw.length > 0) {
    if (_looksLikeMarkdown(data.raw)) card.appendChild(_markdownSection(data.raw));
    else {
      const pre = el('pre', { class: 'result-value' }, data.raw.slice(0, 5000));
      pre.style.fontSize = '10px';
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.maxHeight = '300px';
      pre.style.overflow = 'auto';
      card.appendChild(pre);
    }
  }
  if (!data.status && !data.counts && !data.events && !data.logs && !data.raw) {
    card.appendChild(el('div', { class: 'tree-empty' }, 'Sem dados de diagnóstico'));
  }

  ctx.appendActions(card, payload.actions);
  return card;
}

// ══════════════════════════════════════════════════════════════
// SEÇÕES DE DIAGNÓSTICO
// ══════════════════════════════════════════════════════════════

function _statusSection(status) {
  const section = el('div');
  const title = el('div', { class: 'result-title' }, 'Status');
  title.style.fontSize = '11px';
  title.style.marginTop = '6px';
  section.appendChild(title);

  let hasAny = false;
  for (const [k, v] of Object.entries(status)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') continue;
    hasAny = true;
    const row = el('div', { class: 'result-row' });
    row.appendChild(el('span', { class: 'result-label' }, k));
    row.appendChild(el('span', { class: 'result-value' }, String(v)));
    section.appendChild(row);
  }
  if (!hasAny) section.appendChild(el('div', { class: 'tree-empty' }, 'Sem dados'));
  return section;
}

function _countsSection(counts) {
  const section = el('div');
  const title = el('div', { class: 'result-title' }, 'Contagens');
  title.style.fontSize = '11px';
  title.style.marginTop = '6px';
  section.appendChild(title);

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20);
  if (entries.length === 0) {
    section.appendChild(el('div', { class: 'tree-empty' }, 'Sem eventos'));
    return section;
  }

  const table = el('table', { class: 'result-table' });
  const thead = el('thead');
  const htr = el('tr');
  htr.appendChild(el('th', {}, 'evento'));
  htr.appendChild(el('th', {}, 'total'));
  thead.appendChild(htr);
  table.appendChild(thead);

  const tbody = el('tbody');
  for (const [name, count] of entries) {
    const tr = el('tr');
    tr.appendChild(el('td', {}, name));
    tr.appendChild(el('td', {}, String(count)));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  section.appendChild(table);
  return section;
}

function _eventsSection(events) {
  const section = el('div');
  const title = el('div', { class: 'result-title' }, `Eventos (${events.length})`);
  title.style.fontSize = '11px';
  title.style.marginTop = '6px';
  section.appendChild(title);

  for (const evt of events.slice(-30)) {
    const row = el('div', { class: 'alert-row info' });
    const header = [`#${evt.seq ?? '?'}`, evt.event ?? '—', evt.tick ? `· ${evt.tick}` : ''].filter(Boolean).join(' ');
    row.appendChild(el('div', { class: 'alert-code' }, header));
    const payloadStr = _shortPayload(evt.payload);
    if (payloadStr) row.appendChild(el('div', { class: 'alert-message' }, payloadStr));
    section.appendChild(row);
  }
  return section;
}

function _logsSection(logs) {
  const section = el('div');
  const title = el('div', { class: 'result-title' }, `Logs (${logs.length})`);
  title.style.fontSize = '11px';
  title.style.marginTop = '6px';
  section.appendChild(title);

  for (const l of logs.slice(-30)) {
    const level = l.level ?? 'info';
    const levelCls = level === 'error' ? 'error' : level === 'warn' ? 'warning' : 'info';
    const row = el('div', { class: `alert-row ${levelCls}` });
    row.appendChild(el('div', { class: 'alert-code' }, `[${level}] ${l.module ?? '—'}`));
    row.appendChild(el('div', { class: 'alert-message' }, String(l.msg ?? '')));
    section.appendChild(row);
  }
  return section;
}

function _markdownSection(md) {
  const wrap = el('div', { class: 'diag-markdown' });
  const H_STYLES = {
    1: { fontSize: '14px', fontWeight: '700', margin: '10px 0 5px' },
    2: { fontSize: '12px', fontWeight: '700', margin: '8px 0 4px' },
    3: { fontSize: '11px', fontWeight: '700', margin: '6px 0 3px' },
  };
  let currentList = null;
  const flushList = () => { if (currentList) { wrap.appendChild(currentList.node); currentList = null; } };

  for (const rawLine of String(md).split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim()) { flushList(); continue; }
    const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      flushList();
      const level = Math.min(3, hMatch[1].length);
      wrap.appendChild(el(`h${level}`, { html: _inlineMd(hMatch[2]), style: H_STYLES[level] }));
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushList();
      wrap.appendChild(el('hr', { style: { border: 'none', borderTop: '1px solid var(--border-light)', margin: '8px 0' } }));
      continue;
    }
    const ulMatch = line.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        const node = el('ul', { style: { margin: '4px 0', paddingLeft: '18px' } });
        currentList = { type: 'ul', node };
      }
      currentList.node.appendChild(el('li', { html: _inlineMd(ulMatch[1]) }));
      continue;
    }
    flushList();
    wrap.appendChild(el('p', { html: _inlineMd(line), style: { margin: '4px 0', lineHeight: '1.5' } }));
  }
  flushList();

  const container = el('div', { style: { maxHeight: '400px', overflow: 'auto', padding: '4px 0' } });
  container.appendChild(wrap);
  return container;
}

function _looksLikeMarkdown(text) {
  if (typeof text !== 'string') return false;
  const s = text.trim();
  if (!s) return false;
  if (/^#{1,6}\s/.test(s)) return true;
  if (/^```/.test(s)) return true;
  let hits = 0;
  if (/\*\*[^*\n]+\*\*/.test(s)) hits++;
  if (/^[-*+]\s+\S/m.test(s)) hits++;
  if (/^\d+\.\s+\S/m.test(s)) hits++;
  if (/^>\s+\S/m.test(s)) hits++;
  if (/`[^`\n]+`/.test(s)) hits++;
  return hits >= 2;
}

function _inlineMd(text) {
  let s = String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  s = s.replace(/`([^`]+)`/g, '<code style="background:var(--bg-secondary);border:1px solid var(--border-light);border-radius:3px;padding:0 3px;font-family:var(--font-mono);font-size:0.9em;">$1</code>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  return s;
}

function _shortPayload(payload) {
  if (payload === null || payload === undefined) return '';
  try {
    const str = JSON.stringify(payload);
    return str.length <= 120 ? str : str.slice(0, 117) + '...';
  } catch {
    return '(payload não serializável)';
  }
}

// ══════════════════════════════════════════════════════════════
// TEST REPORT
// ══════════════════════════════════════════════════════════════

function _renderTestReport(card, report, ctx) {
  if (!report) {
    card.appendChild(el('div', { class: 'tree-empty' }, 'Relatório vazio'));
    return;
  }

  const summary = report.summary ?? {};
  const meta = report.meta ?? {};
  const phases = Array.isArray(report.phases) ? report.phases : [];
  const ok = summary.ok === true;

  const verdict = el('div', {
    class: 'alert-row ' + (ok ? 'info' : 'error'),
    style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', marginBottom: '10px', borderLeftWidth: '4px', borderRadius: '4px' },
  });
  verdict.appendChild(el('span', { style: { fontSize: '20px' } }, ok ? '✅' : '❌'));
  verdict.appendChild(el('span', { style: { fontWeight: '700', fontSize: '13px' } }, ok ? 'APROVADO' : 'REPROVADO'));
  card.appendChild(verdict);

  const metrics = el('div', {
    class: 'result-row',
    style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px 12px', padding: '8px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', marginBottom: '10px', fontSize: '11px' },
  });
  const addMetric = (label, value) => {
    const cell = el('div', { style: { display: 'flex', justifyContent: 'space-between' } });
    cell.appendChild(el('span', { class: 'result-label' }, label));
    cell.appendChild(el('span', { class: 'result-value', style: { fontWeight: '600' } }, String(value)));
    metrics.appendChild(cell);
  };
  addMetric('Fases', `${summary.totalPhases ?? 0}`);
  addMetric('Aprovadas', `${summary.totalPassed ?? 0}`);
  addMetric('Reprovadas', `${summary.totalFailed ?? 0}`);
  addMetric('Puladas', `${summary.totalSkipped ?? 0}`);
  addMetric('Duração', _fmtMs(meta.durationMs));
  if (meta.seed !== null && meta.seed !== undefined) addMetric('Seed', meta.seed);
  if (meta.iterations !== null && meta.iterations !== undefined) addMetric('Iterações', meta.iterations);
  card.appendChild(metrics);

  if (phases.length > 0) {
    const table = el('table', { class: 'result-table', style: { width: '100%', fontSize: '11px' } });
    const thead = el('thead');
    const htr = el('tr');
    htr.appendChild(el('th', { style: { width: '24px' } }, '#'));
    htr.appendChild(el('th', {}, 'Fase'));
    htr.appendChild(el('th', { style: { width: '28px' } }, 'Status'));
    htr.appendChild(el('th', { style: { width: '52px', textAlign: 'right' } }, 'Tempo'));
    htr.appendChild(el('th', {}, 'Resumo'));
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = el('tbody');
    phases.forEach((p, i) => {
      const tr = el('tr');
      tr.appendChild(el('td', {}, String(i + 1)));
      tr.appendChild(el('td', { style: { fontFamily: 'var(--font-mono)' } }, String(p.phase ?? '?')));
      const icon = p.skipped ? '⏭' : (p.ok ? '✅' : '❌');
      tr.appendChild(el('td', { style: { color: p.skipped ? 'var(--fg-muted)' : (p.ok ? 'var(--success)' : 'var(--danger)'), textAlign: 'center', fontWeight: '700' } }, icon));
      tr.appendChild(el('td', { style: { textAlign: 'right', fontFamily: 'var(--font-mono)' } }, _fmtMs(p.durationMs)));
      tr.appendChild(el('td', { style: { fontSize: '10px' } }, String(p.summary ?? '')));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    card.appendChild(table);
  }

  const failed = phases.filter((p) => !p.ok && !p.skipped);
  if (failed.length > 0) {
    const section = el('div', { style: { marginTop: '12px' } });
    section.appendChild(el('div', { class: 'result-title', style: { fontSize: '11px', marginBottom: '6px' } }, `Falhas detalhadas (${failed.length})`));
    for (const p of failed) {
      const block = el('div', { class: 'alert-row error', style: { marginBottom: '6px' } });
      block.appendChild(el('div', { class: 'alert-code' }, `❌ ${p.phase}${p.error ? ` — ${p.error}` : ''}`));
      if (Array.isArray(p.failures) && p.failures.length > 0) {
        const list = el('div', { class: 'alert-message', style: { fontSize: '11px', maxHeight: '120px', overflow: 'auto' } });
        for (const f of p.failures.slice(0, 10)) {
          list.appendChild(el('div', {}, '• ' + _formatTestFailure(f)));
        }
        block.appendChild(list);
      }
      section.appendChild(block);
    }
    card.appendChild(section);
  }

  const actions = el('div', { class: 'result-actions', style: { marginTop: '12px' } });
  const btnRerun = el('button', { class: 'result-action-btn' }, '🔄 Repetir');
  btnRerun.addEventListener('click', () => {
    const phasesUsed = phases.filter((p) => !p.skipped || p.phase === 'regression').map((p) => p.phase).join(',');
    const seedUsed = meta.seed ?? 42;
    const iterUsed = meta.iterations ?? 500;
    try { ctx.handleLine(`diag.test ${phasesUsed || 'all'} seed=${seedUsed} iterations=${iterUsed}`); }
    catch (err) { console.error('[PanelRight] falha ao repetir bateria:', err); }
  });
  actions.appendChild(btnRerun);
  card.appendChild(actions);
}

function _formatTestFailure(f) {
  if (f === null || f === undefined) return '(vazio)';
  if (typeof f === 'string') return f;
  if (typeof f !== 'object') return String(f);
  const parts = [];
  if (f.scenario) parts.push(`[${f.scenario}]`);
  if (f.command) parts.push(`"${f.command}"`);
  if (f.check) parts.push(`(${f.check})`);
  if (f.message) parts.push(f.message);
  if (f.error) parts.push(`→ ${f.error}`);
  if (f.reason) parts.push(`(${f.reason})`);
  if (parts.length > 0) return parts.join(' ');
  try {
    const s = JSON.stringify(f);
    return s.length <= 160 ? s : s.slice(0, 157) + '...';
  } catch { return '(não serializável)'; }
}

function _fmtMs(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
}