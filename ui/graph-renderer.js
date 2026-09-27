/**
 * @file graph-renderer.js
 * @module ui
 * @description Renderiza séries temporais em SVG inline.
 * @imports core/utils/dom
 * @importedBy ui/panel-right
 * @level 12
 *
 * Uso:
 *   GraphRenderer.render({ series, title }, container);
 *
 * Series esperado:
 *   [{ tick: 'T3', value: 10, delta: +3 }, ...]
 */

import { el, clear } from '../core/utils/dom.js';

const PADDING_LEFT   = 46;
const PADDING_RIGHT  = 16;
const PADDING_TOP    = 16;
const PADDING_BOTTOM = 28;
const DOT_RADIUS     = 3.5;
const LINE_WIDTH     = 2;

export class GraphRenderer {
  /**
   * Renderiza o gráfico no container.
   * @param {Object} opts
   * @param {Array<{tick:string,value:any,delta:any}>} opts.series
   * @param {string} [opts.title]
   * @param {number} [opts.width=320]
   * @param {number} [opts.height=180]
   * @param {HTMLElement} container
   */
  static render({ series = [], title = '', width = 320, height = 180 } = {}, container) {
    if (!container) return;
    clear(container);

    const usable = (series || []).filter(p =>
      p && typeof p.value === 'number' && Number.isFinite(p.value)
    );

    const wrap = el('div', { class: 'graph-renderer' });
    if (title) {
      wrap.appendChild(el('div', { class: 'graph-title' }, title));
    }

    if (usable.length === 0) {
      wrap.appendChild(el('div', { class: 'graph-empty' }, 'Sem dados para exibir'));
      container.appendChild(wrap);
      return;
    }

    // Escalas
    const values = usable.map(p => p.value);
    let minY = Math.min(...values);
    let maxY = Math.max(...values);
    if (minY === maxY) {
      minY -= 1;
      maxY += 1;
    }
    // Margem estética
    const rangeY = maxY - minY;
    minY -= rangeY * 0.1;
    maxY += rangeY * 0.1;

    const innerW = width - PADDING_LEFT - PADDING_RIGHT;
    const innerH = height - PADDING_TOP - PADDING_BOTTOM;

    const n = usable.length;
    const stepX = n > 1 ? innerW / (n - 1) : 0;

    const projectX = (i) => PADDING_LEFT + i * stepX;
    const projectY = (v) =>
      PADDING_TOP + innerH - ((v - minY) / (maxY - minY)) * innerH;

    // SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'graph-svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('role', 'img');
    if (title) svg.appendChild(_titleNode(title));

    // Grid horizontal (3 linhas)
    const gridYs = [0, 0.5, 1];
    for (const g of gridYs) {
      const y = PADDING_TOP + innerH * g;
      const line = document.createElementNS(svg.namespaceURI, 'line');
      line.setAttribute('class', 'graph-grid');
      line.setAttribute('x1', String(PADDING_LEFT));
      line.setAttribute('x2', String(PADDING_LEFT + innerW));
      line.setAttribute('y1', String(y));
      line.setAttribute('y2', String(y));
      svg.appendChild(line);
    }

    // Eixos
    const axisY = document.createElementNS(svg.namespaceURI, 'line');
    axisY.setAttribute('class', 'graph-axis');
    axisY.setAttribute('x1', String(PADDING_LEFT));
    axisY.setAttribute('x2', String(PADDING_LEFT));
    axisY.setAttribute('y1', String(PADDING_TOP));
    axisY.setAttribute('y2', String(PADDING_TOP + innerH));
    svg.appendChild(axisY);

    const axisX = document.createElementNS(svg.namespaceURI, 'line');
    axisX.setAttribute('class', 'graph-axis');
    axisX.setAttribute('x1', String(PADDING_LEFT));
    axisX.setAttribute('x2', String(PADDING_LEFT + innerW));
    axisX.setAttribute('y1', String(PADDING_TOP + innerH));
    axisX.setAttribute('y2', String(PADDING_TOP + innerH));
    svg.appendChild(axisX);

    // Y labels
    const yLabels = [maxY, (maxY + minY) / 2, minY];
    for (let i = 0; i < yLabels.length; i++) {
      const val = yLabels[i];
      const y = PADDING_TOP + innerH * (i / (yLabels.length - 1));
      const t = document.createElementNS(svg.namespaceURI, 'text');
      t.setAttribute('class', 'graph-label');
      t.setAttribute('x', String(PADDING_LEFT - 6));
      t.setAttribute('y', String(y + 3));
      t.setAttribute('text-anchor', 'end');
      t.textContent = _formatNumber(val);
      svg.appendChild(t);
    }

    // X labels (máximo 5)
    const maxLabels = 5;
    const labelEvery = Math.max(1, Math.ceil(n / maxLabels));
    for (let i = 0; i < n; i += labelEvery) {
      const p = usable[i];
      const x = projectX(i);
      const t = document.createElementNS(svg.namespaceURI, 'text');
      t.setAttribute('class', 'graph-label');
      t.setAttribute('x', String(x));
      t.setAttribute('y', String(PADDING_TOP + innerH + 16));
      t.setAttribute('text-anchor', 'middle');
      t.textContent = String(p.tick ?? '');
      svg.appendChild(t);
    }

    // Linha
    if (n > 1) {
      const points = usable.map((p, i) => `${projectX(i)},${projectY(p.value)}`).join(' ');
      const poly = document.createElementNS(svg.namespaceURI, 'polyline');
      poly.setAttribute('class', 'graph-line');
      poly.setAttribute('points', points);
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke-width', String(LINE_WIDTH));
      svg.appendChild(poly);
    }

    // Pontos com tooltip nativo
    for (let i = 0; i < n; i++) {
      const p = usable[i];
      const cx = projectX(i);
      const cy = projectY(p.value);
      const c = document.createElementNS(svg.namespaceURI, 'circle');
      c.setAttribute('class', 'graph-dot');
      c.setAttribute('cx', String(cx));
      c.setAttribute('cy', String(cy));
      c.setAttribute('r', String(DOT_RADIUS));

      const tt = document.createElementNS(svg.namespaceURI, 'title');
      const delta = (p.delta === null || p.delta === undefined)
        ? ''
        : ` (Δ ${p.delta > 0 ? '+' : ''}${p.delta})`;
      tt.textContent = `${p.tick}: ${p.value}${delta}`;
      c.appendChild(tt);

      svg.appendChild(c);
    }

    wrap.appendChild(svg);
    container.appendChild(wrap);
  }
}

// ── Internos ───────────────────────────────────────────────────

function _titleNode(text) {
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  t.textContent = text;
  return t;
}

function _formatNumber(n) {
  if (!Number.isFinite(n)) return '—';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}