/**
 * @file card-renderer.js
 * @module ui/renderers
 * @description Renderiza cards simples: card, confirm, tutorial, resolve,
 *              menu, diff, graph, generic.
 * @imports core/utils/dom, ui/graph-renderer
 * @level 12
 *
 * Fase 13.7 — Extracted from ui/panel-right.js.
 */

import { el } from '../../core/utils/dom.js';
import { GraphRenderer } from '../graph-renderer.js';

/**
 * @param {Object} payload
 * @param {Object} ctx
 * @returns {HTMLElement}
 */
export function renderCard(payload, ctx) {
  const card = el('div', { class: 'result-card' });
  card.appendChild(el('div', { class: 'result-title' }, payload.title ?? ''));

  const data = payload.data ?? {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    const row = el('div', { class: 'result-row' });
    row.appendChild(el('span', { class: 'result-label' }, key));
    row.appendChild(el('span', { class: 'result-value' }, ctx.formatValue(value)));
    card.appendChild(row);
  }

  ctx.appendActions(card, payload.actions);
  return card;
}

export function renderConfirm(payload) {
  const data = payload.data ?? {};
  const card = el('div', { class: 'result-card' });
  card.appendChild(el('div', { class: 'result-title' }, data.ok ? '✅ Sucesso' : '⚠️ Erro'));
  card.appendChild(el('div', { class: 'alert-message' }, data.error ?? data.message ?? JSON.stringify(data)));
  return card;
}

export function renderTutorial(payload, ctx) {
  const card = el('div', { class: 'result-card' });
  card.appendChild(el('div', { class: 'result-title' }, payload.title ?? ''));
  const data = payload.data ?? {};
  if (data.title) card.appendChild(el('div', { class: 'alert-message' }, data.title));
  if (data.command) card.appendChild(el('div', { class: 'alert-code' }, data.command));
  ctx.appendActions(card, payload.actions);
  return card;
}

export function renderResolve(payload) {
  const card = el('div', { class: 'result-card' });
  card.appendChild(el('div', { class: 'result-title' }, payload.title ?? ''));
  const pre = el('pre', {}, JSON.stringify(payload.data, null, 2));
  pre.style.fontSize = '11px';
  pre.style.whiteSpace = 'pre-wrap';
  card.appendChild(pre);
  return card;
}

export function renderMenu(payload, ctx) {
  const card = el('div', { class: 'result-card' });
  card.appendChild(el('div', { class: 'result-title' }, payload.title ?? ''));
  ctx.appendActions(card, payload.actions);
  return card;
}

export function renderDiff(payload) {
  const card = el('div', { class: 'result-card' });
  card.appendChild(el('div', { class: 'result-title' }, payload.title ?? ''));
  const stats = payload.data?.stats ?? {};
  card.appendChild(el('div', { class: 'result-value' },
    `+${stats.added ?? 0} ~${stats.changed ?? 0} -${stats.removed ?? 0}`));
  return card;
}

export function renderGraph(payload, ctx) {
  const card = el('div', { class: 'result-card' });
  card.appendChild(el('div', { class: 'result-title' }, payload.title ?? ''));
  const series = payload.data?.series ?? [];
  const container = el('div', { class: 'graph-container' });
  GraphRenderer.render({ series, title: '', width: 320, height: 180 }, container);
  card.appendChild(container);
  ctx.appendActions(card, payload.actions);
  return card;
}

export function renderGeneric(payload) {
  const card = el('div', { class: 'result-card' });
  card.appendChild(el('div', { class: 'result-title' }, payload.title ?? ''));
  const pre = el('pre', {}, JSON.stringify(payload.data, null, 2));
  pre.style.fontSize = '11px';
  card.appendChild(pre);
  return card;
}