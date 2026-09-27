/**
 * @file narrative-renderer.js
 * @module ui/renderers
 * @description Renderiza a análise narrativa (kind: 'narrative').
 * @imports core/utils/dom
 * @level 12
 *
 * Fase 13.7 — Extracted from ui/panel-right.js.
 *
 * Exibe: métricas, lista de atos (com subtipos D-numbers, eixos D5/D7/D8,
 * traits transversais), propostas e diagnósticos.
 */

import { el } from '../../core/utils/dom.js';

// ══════════════════════════════════════════════════════════════
// RÓTULOS
// ══════════════════════════════════════════════════════════════

const _AXIS_LABELS = Object.freeze({
  'D5.modo':          'Modo',
  'D5.enunciador':    'Enunciador',
  'D7.grau':          'Grau',
  'D7.estabilidade':  'Estabilidade',
  'D7.alcanceK':      'Alcance K',
  'D8.temporal':      'Tempo',
  'D8.informacional': 'Info',
  'D8.discursiva':    'Discurso',
  'D8.distancia':     'Distância',
});

const _AXIS_VALUE_LABELS = Object.freeze({
  'D5.modo.direct':        'direto',
  'D5.modo.indirect':      'indireto',
  'D5.modo.free-indirect': 'indireto livre',
  'D5.enunciador.character':'personagem',
  'D5.enunciador.narrator': 'narrador',
  'D5.enunciador.reader':   'leitor',
  'D7.grau.zero':      'onisciente',
  'D7.grau.external':  'externa',
  'D7.grau.internal':  'interna',
  'D7.estabilidade.fixed':    'fixa',
  'D7.estabilidade.variable': 'variável',
  'D7.estabilidade.multiple': 'múltipla',
  'D7.alcanceK.symmetric':             'simétrico',
  'D7.alcanceK.asymmetric-narrator':   'assim. narrador',
  'D7.alcanceK.asymmetric-reader':     'assim. leitor',
  'D8.temporal.linear':        'linear',
  'D8.temporal.analepse':      'retrospecção',
  'D8.temporal.prolepse':      'antecipação',
  'D8.temporal.simultaneous':  'simultâneo',
  'D8.informacional.omit':     'omissão',
  'D8.informacional.delay':    'retardo',
  'D8.informacional.hint':     'pista',
  'D8.informacional.payoff':   'quitação',
  'D8.discursiva.segment':     'segmento',
  'D8.discursiva.intercalation':'intercalação',
  'D8.discursiva.frame':       'moldura',
  'D8.discursiva.block':       'bloco',
  'D8.distancia.scene':        'cena',
  'D8.distancia.summary':      'sumário',
  'D8.distancia.ellipsis':     'elipse',
  'D8.distancia.pause':        'pausa',
  'D8.distancia.iterative':    'iterativo',
});

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function _operationFromDNumber(dnumber) {
  if (typeof dnumber !== 'string') return null;
  const m = /^(D\d+)/.exec(dnumber);
  return m ? m[1] : null;
}

function _operationBgFor(dOp) {
  switch (dOp) {
    case 'D1': return 'var(--narr-D1-bg)';
    case 'D2': return 'var(--narr-D2-bg)';
    case 'D3': return 'var(--narr-D3-bg)';
    case 'D4': return 'var(--narr-D4-bg)';
    case 'D5': return 'var(--narr-D5-bg)';
    case 'D6': return 'var(--narr-D6-bg)';
    case 'D7': return 'var(--narr-D7-bg)';
    case 'D8': return 'var(--narr-D8-bg)';
    default:   return 'var(--bg-secondary)';
  }
}

function _operationFgFor(dOp) {
  switch (dOp) {
    case 'D1': return 'var(--narr-D1-fg)';
    case 'D2': return 'var(--narr-D2-fg)';
    case 'D3': return 'var(--narr-D3-fg)';
    case 'D4': return 'var(--narr-D4-fg)';
    case 'D5': return 'var(--narr-D5-fg)';
    case 'D6': return 'var(--narr-D6-fg)';
    case 'D7': return 'var(--narr-D7-fg)';
    case 'D8': return 'var(--narr-D8-fg)';
    default:   return 'var(--fg-secondary)';
  }
}

// ══════════════════════════════════════════════════════════════
// API PÚBLICA
// ══════════════════════════════════════════════════════════════

export function renderNarrative(payload, ctx) {
  const card = el('div', { class: 'result-card narrative-card' });
  card.appendChild(el('div', { class: 'result-title' }, payload.title ?? '📖 Análise narrativa'));

  const data = payload.data ?? {};
  const ir = data.ir;
  if (!ir) {
    card.appendChild(el('div', { class: 'tree-empty' }, 'Sem IR para exibir'));
    ctx.appendActions(card, payload.actions);
    return card;
  }

  const acts = Array.isArray(ir.acts) ? ir.acts : [];
  const diags = Array.isArray(ir.diagnostics) ? ir.diagnostics : [];

  card.appendChild(_metrics(acts, diags));

  if (acts.length === 0) {
    card.appendChild(el('div', { class: 'tree-empty' }, 'Nenhum ato detectado'));
  } else {
    card.appendChild(_actsList(acts, ctx));
  }

  if (Array.isArray(data.proposals) && data.proposals.length > 0) {
    card.appendChild(_proposals(data.proposals, ctx));
  }
  if (diags.length > 0) {
    card.appendChild(_diagnostics(diags));
  }

  ctx.appendActions(card, payload.actions);
  return card;
}

// ══════════════════════════════════════════════════════════════
// SEÇÕES
// ══════════════════════════════════════════════════════════════

function _metrics(acts, diags) {
  const container = el('div', { class: 'narrative-metrics' });
  const bySeverity = { error: 0, warning: 0, info: 0 };
  for (const d of diags) {
    if (d && typeof d.severity === 'string' && d.severity in bySeverity) bySeverity[d.severity]++;
  }
  const add = (label, value, variant = null) => {
    const cell = el('div', { class: 'narrative-metric' });
    cell.appendChild(el('div', { class: 'narrative-metric-label' }, label));
    const valEl = el('div', {
      class: 'narrative-metric-value'
        + (variant === 'error' ? ' variant-error' : '')
        + (variant === 'warning' ? ' variant-warning' : ''),
    }, String(value));
    cell.appendChild(valEl);
    container.appendChild(cell);
  };
  add('Atos', acts.length);
  add('Erros', bySeverity.error, bySeverity.error > 0 ? 'error' : null);
  add('Avisos', bySeverity.warning, bySeverity.warning > 0 ? 'warning' : null);
  return container;
}

function _actsList(acts, ctx) {
  const wrap = el('div', { class: 'narrative-acts' });
  for (const act of acts) {
    wrap.appendChild(_actRow(act, ctx));
  }
  return wrap;
}

function _actRow(act, ctx) {
  const row = el('div', { class: 'narrative-act-row', 'data-act-id': act.id ?? '' });

  const header = el('div', { class: 'narrative-act-header' });
  const ops = Array.isArray(act.operations) ? act.operations : [];
  for (const op of ops) {
    header.appendChild(el('span', { class: `narrative-op-badge narrative-op-${op}` }, op));
  }
  const conf = typeof act.confidence === 'number' ? act.confidence : 0;
  const confClass = conf >= 0.9 ? 'conf-high' : conf >= 0.7 ? 'conf-mid' : 'conf-low';
  header.appendChild(el('span', { class: `narrative-act-confidence ${confClass}` }, conf.toFixed(2)));
  row.appendChild(header);

  const raw = act.source?.raw ?? '';
  if (raw) {
    const snippet = raw.length > 120 ? raw.slice(0, 117) + '…' : raw;
    row.appendChild(el('div', { class: 'narrative-act-text' }, snippet));
  }

  const subtypesEl = _subtypes(act);
  if (subtypesEl) row.appendChild(subtypesEl);

  const dims = _dimensions(act);
  if (dims) row.appendChild(dims);

  const axesEl = _axes(act);
  if (axesEl) row.appendChild(axesEl);

  const traitsEl = _traits(act);
  if (traitsEl) row.appendChild(traitsEl);

  row.addEventListener('click', () => {
    try { ctx.emit('narr:act:focus', { actId: act.id, act }); } catch { /* isola */ }
  });

  return row;
}

function _subtypes(act) {
  const subtypes = act.subtypes ?? {};
  const flat = act.subtypesFlat ?? {};
  const entries = [];

  if (typeof subtypes === 'object' && !Array.isArray(subtypes)) {
    for (const [dOp, sub] of Object.entries(subtypes)) {
      if (!sub) continue;
      const id = typeof sub === 'string' ? sub : sub.id;
      const label = typeof sub === 'object' ? sub.label : null;
      const confidence = typeof sub === 'object' && typeof sub.confidence === 'number' ? sub.confidence : null;
      if (!id) continue;
      entries.push({ dOp, id, label, confidence });
    }
  }
  if (entries.length === 0 && flat && typeof flat === 'object') {
    for (const [, dnumber] of Object.entries(flat)) {
      if (typeof dnumber !== 'string') continue;
      const dOp = _operationFromDNumber(dnumber);
      if (!dOp) continue;
      entries.push({ dOp, id: dnumber, label: null, confidence: null });
    }
  }
  if (entries.length === 0) return null;

  const wrap = el('div', { class: 'narrative-subtypes' });
  for (const e of entries) {
    const badge = el('span', {
      class: `subtype-badge subtype-${e.id.replace(/\./g, '-')}`,
      title: e.label ? `${e.label}${e.confidence ? ` (${e.confidence})` : ''}` : e.id,
    });
    badge.style.background = _operationBgFor(e.dOp);
    badge.style.color = _operationFgFor(e.dOp);
    badge.appendChild(el('span', { class: 'subtype-id' }, e.id));
    if (e.label) badge.appendChild(el('span', { class: 'subtype-label' }, e.label));
    wrap.appendChild(badge);
  }
  return wrap;
}

function _axes(act) {
  const axes = act.axes ?? {};
  if (!axes || typeof axes !== 'object') return null;
  const rows = [];
  for (const [dOp, opAxes] of Object.entries(axes)) {
    if (!opAxes || typeof opAxes !== 'object') continue;
    for (const [axis, value] of Object.entries(opAxes)) {
      if (typeof value !== 'string') continue;
      const key = `${dOp}.${axis}`;
      const label = _AXIS_LABELS[key] ?? axis;
      const valueLabel = _AXIS_VALUE_LABELS[`${key}.${value}`] ?? value;
      rows.push({ dOp, label, valueLabel });
    }
  }
  if (rows.length === 0) return null;

  const wrap = el('div', { class: 'narrative-axes' });
  for (const r of rows) {
    const row = el('div', { class: `axis-row axis-${r.dOp}` });
    const label = el('span', { class: 'axis-label' }, `${r.dOp} · ${r.label}`);
    label.style.color = _operationFgFor(r.dOp);
    row.appendChild(label);
    row.appendChild(el('span', { class: 'axis-sep' }, '='));
    row.appendChild(el('span', { class: 'axis-value' }, r.valueLabel));
    wrap.appendChild(row);
  }
  return wrap;
}

function _traits(act) {
  const traits = Array.isArray(act.traits) ? act.traits : [];
  if (traits.length === 0) return null;
  const wrap = el('div', { class: 'narrative-traits' });
  for (const t of traits) {
    const positive = !t.startsWith('-');
    const clean = t.startsWith('+') || t.startsWith('-') ? t.slice(1) : t;
    const cls = `trait-pill ${positive ? 'trait-positive' : 'trait-negative'}`;
    wrap.appendChild(el('span', { class: cls, title: t }, clean));
  }
  return wrap;
}

function _dimensions(act) {
  const parts = [];
  if (act.voice?.kind && act.voice.kind !== 'narrator') parts.push(`voz: ${act.voice.kind}`);
  if (act.focalization?.targetId) parts.push(`foc: ${act.focalization.targetId}`);
  else if (act.focalization?.kind && act.focalization.kind !== 'narrator') parts.push(`foc: ${act.focalization.kind}`);
  if (act.form && act.form !== 'narration') parts.push(`forma: ${act.form}`);
  if (act.tense) parts.push(`tempo: ${act.tense}`);
  if (act.modality) parts.push(`mod: ${act.modality}`);
  if (act.negation) parts.push(`neg: ${act.negation}`);
  if (act.epistemic && act.epistemic !== 'fact') parts.push(`epi: ${act.epistemic}`);
  if (parts.length === 0) return null;
  return el('div', { class: 'narrative-act-dims' }, parts.join(' · '));
}

function _proposals(proposals, ctx) {
  const wrap = el('div', { class: 'narrative-proposals' });
  wrap.appendChild(el('div', {
    class: 'result-title',
    style: { fontSize: '11px', marginBottom: '6px' },
  }, `Propostas (${proposals.length})`));

  for (const p of proposals) {
    const row = el('div', { class: 'narrative-proposal-row' });
    row.appendChild(el('span', { class: `proposal-kind proposal-kind-${p.kind ?? 'mutate'}` }, p.kind ?? 'mutate'));
    if (p.source) {
      row.appendChild(el('span', {
        class: `proposal-source proposal-source-${p.source}`,
        title: p.subtypeId ? `via ${p.subtypeId}` : p.source,
      }, p.source));
    }
    row.appendChild(el('span', { class: 'proposal-command' }, String(p.command ?? '')));

    const applyBtn = el('button', { class: 'result-action-btn small', type: 'button' }, 'Aplicar');
    applyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      try { ctx.handleLine(p.command); }
      catch (err) { console.error('[PanelRight] falha ao aplicar:', err); }
    });
    row.appendChild(applyBtn);
    wrap.appendChild(row);
  }
  return wrap;
}

function _diagnostics(diags) {
  const wrap = el('div', { class: 'narrative-diagnostics' });
  wrap.appendChild(el('div', {
    class: 'result-title',
    style: { fontSize: '11px', marginBottom: '6px' },
  }, `Diagnósticos (${diags.length})`));

  const order = { error: 0, warning: 1, info: 2 };
  const sorted = [...diags].sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));

  for (const d of sorted.slice(0, 10)) {
    const level = d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warning' : 'info';
    const row = el('div', { class: `alert-row ${level}` });
    row.appendChild(el('div', { class: 'alert-code' }, d.code ?? '—'));
    row.appendChild(el('div', { class: 'alert-message' }, d.message ?? ''));
    wrap.appendChild(row);
  }
  if (sorted.length > 10) {
    wrap.appendChild(el('div', { style: { fontSize: '10px', color: 'var(--fg-muted)', textAlign: 'center' } }, `… mais ${sorted.length - 10}`));
  }
  return wrap;
}