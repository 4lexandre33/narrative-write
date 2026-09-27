/**
 * @file table-renderer.js
 * @module ui/renderers
 * @description Renderiza tabelas, alertas e árvores.
 * @imports core/utils/dom
 * @level 12
 *
 * Fase 13.7 — Extracted from ui/panel-right.js.
 */

import { el } from '../../core/utils/dom.js';

export function renderTable(payload, ctx) {
  const card = el('div', { class: 'result-card' });
  card.appendChild(el('div', { class: 'result-title' }, payload.title ?? ''));

  const rows = Array.isArray(payload.data) ? payload.data : [];
  if (rows.length === 0) {
    card.appendChild(el('div', { class: 'tree-empty' }, 'Sem resultados'));
  } else {
    const table = el('table', { class: 'result-table' });
    const first = rows[0];
    if (first && typeof first === 'object') {
      const cols = Object.keys(first);
      const thead = el('thead');
      const htr = el('tr');
      for (const c of cols) htr.appendChild(el('th', {}, c));
      thead.appendChild(htr);
      table.appendChild(thead);

      const tbody = el('tbody');
      for (const row of rows) {
        const tr = el('tr');
        for (const c of cols) tr.appendChild(el('td', {}, ctx.formatValue(row[c])));
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
    }
    card.appendChild(table);
  }

  ctx.appendActions(card, payload.actions);
  return card;
}

export function renderAlerts(payload, ctx) {
  const card = el('div', { class: 'result-card' });
  card.appendChild(el('div', { class: 'result-title' }, payload.title ?? ''));

  const data = payload.data ?? {};
  const alerts = Array.isArray(data.alerts) ? data.alerts : [];

  if (alerts.length === 0) {
    card.appendChild(el('div', { class: 'tree-empty' }, '✅ Nenhum problema'));
  } else {
    for (const alert of alerts) {
      const row = el('div', { class: `alert-row ${alert.level ?? 'info'}` });
      row.appendChild(el('div', { class: 'alert-code' }, alert.code ?? ''));
      row.appendChild(el('div', { class: 'alert-message' }, ctx.alertMessage(alert)));
      card.appendChild(row);
    }
  }

  ctx.appendActions(card, payload.actions);
  return card;
}

export function renderTree(payload, ctx) {
  const card = el('div', { class: 'result-card' });
  card.appendChild(el('div', { class: 'result-title' }, payload.title ?? ''));
  card.appendChild(_renderTreeRecursive(payload.data));
  ctx.appendActions(card, payload.actions);
  return card;
}

function _renderTreeRecursive(node) {
  const wrap = el('div', { class: 'tree-view' });
  if (!node || typeof node !== 'object') {
    wrap.textContent = String(node ?? '');
    return wrap;
  }

  for (const [key, value] of Object.entries(node)) {
    const row = el('div', { class: 'tree-view-node' });
    row.appendChild(el('span', { class: 'tree-view-label' }, key));

    if (value && typeof value === 'object') {
      if (value.kind) row.appendChild(el('span', { class: 'tree-view-badge' }, value.kind));
      if (value.source) row.appendChild(el('span', { class: 'tree-view-source' }, value.source));
      if (value.description) row.appendChild(el('span', { class: 'tree-view-desc' }, value.description));
      if (value.children && Object.keys(value.children).length > 0) {
        row.appendChild(_renderTreeRecursive(value.children));
      }
    }
    wrap.appendChild(row);
  }
  return wrap;
}