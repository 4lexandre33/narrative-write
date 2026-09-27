/**
 * @file export-builder.js
 * @module systems/helpers
 * @description Constrói representações exportáveis do World em vários formatos.
 * @imports core/constants, core/utils/dom, components/identity
 * @importedBy systems/export-system
 * @level 8
 *
 * Métodos públicos:
 *   toJSON(machine)      → string JSON pretty
 *   toCSV(machine)       → string CSV
 *   toMarkdown(machine)  → string Markdown
 *   toSnippets(machine)  → string JSON só de snippets
 *   toHTML(machine)      → string HTML pronto para imprimir (→ PDF)
 *
 * Cada método retorna { content, filename, mime }.
 */

import { COMPONENT_NAMES, ENTITY_TYPE_LABEL } from '../../core/constants.js';

export class ExportBuilder {
  /**
   * @param {Object} machine — instância do Context Machine
   */
  constructor(machine) {
    this.machine = machine;
  }

  // ── World ─────────────────────────────────────────────────

  /**
   * Snapshot completo do World em JSON.
   * @returns {{ content:string, filename:string, mime:string }}
   */
  toJSON() {
    const world = this.machine.world;
    const entities = {};

    for (const id of world.allEntities()) {
      entities[id] = world.componentsOf(id);
    }

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tick: this.machine.getTick(),
      timeline: this.machine.getTimeline(),
      app: 'narrative-ecs',
      entities,
    };

    return {
      content: JSON.stringify(payload, null, 2),
      filename: this._filename('json'),
      mime: 'application/json',
    };
  }

  // ── CSV ───────────────────────────────────────────────────

  /**
   * Tabela de entidades em CSV.
   * Colunas: id, name, type, description, stats, flags, tags, enums, lists, parent, instanceOf.
   * Objetos aninhados são serializados como JSON inline.
   * @returns {{ content:string, filename:string, mime:string }}
   */
  toCSV() {
    const world = this.machine.world;
    const cols = [
      'id', 'name', 'type', 'description',
      'stats', 'flags', 'tags', 'enums', 'lists',
      'parent', 'instanceOf',
    ];

    const rows = [];
    rows.push(cols.join(','));

    for (const entityId of world.allEntities()) {
      const ident = world.get(entityId, COMPONENT_NAMES.IDENTITY);
      const stats = world.get(entityId, COMPONENT_NAMES.STATS);
      const flags = world.get(entityId, COMPONENT_NAMES.FLAGS);
      const tags  = world.get(entityId, COMPONENT_NAMES.TAGS);
      const enums = world.get(entityId, COMPONENT_NAMES.ENUMS);
      const lists = world.get(entityId, COMPONENT_NAMES.LISTS);
      const links = world.get(entityId, COMPONENT_NAMES.LINKS);
      const instOf = world.get(entityId, COMPONENT_NAMES.INSTANCE_OF);

      const row = [
        this._csv(ident?.id ?? entityId),
        this._csv(ident?.name ?? ''),
        this._csv(ident?.type ?? ''),
        this._csv(ident?.description ?? ''),
        this._csvJson(stats),
        this._csvJson(flags?.values),
        this._csvJson(tags?.values),
        this._csvJson(enums),
        this._csvJson(lists),
        this._csv(links?.parent ?? ''),
        this._csv(instOf?.id ?? ''),
      ];
      rows.push(row.join(','));
    }

    return {
      content: rows.join('\n') + '\n',
      filename: this._filename('csv'),
      mime: 'text/csv;charset=utf-8',
    };
  }

  // ── Markdown ──────────────────────────────────────────────

  /**
   * Documento Markdown legível.
   * Agrupa entidades por tipo e lista componentes relevantes.
   * @returns {{ content:string, filename:string, mime:string }}
   */
  toMarkdown() {
    const world = this.machine.world;
    const tick = this.machine.getTick();
    const timeline = this.machine.getTimeline();

    const lines = [];
    lines.push(`# Mundo — ${tick}`);
    lines.push('');
    lines.push(`- **Timeline:** \`${timeline}\``);
    lines.push(`- **Exportado em:** ${new Date().toISOString()}`);
    lines.push(`- **Total de entidades:** ${world.allEntities().length}`);
    lines.push('');

    // Agrupa por tipo
    const groups = new Map();
    for (const id of world.allEntities()) {
      const ident = world.get(id, COMPONENT_NAMES.IDENTITY);
      const type = ident?.type ?? 'custom';
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type).push(id);
    }

    // Ordena tipos alfabeticamente
    const sortedTypes = Array.from(groups.keys()).sort();

    for (const type of sortedTypes) {
      const ids = groups.get(type);
      const label = ENTITY_TYPE_LABEL[type] ?? type;
      lines.push(`## ${label} (${ids.length})`);
      lines.push('');

      for (const id of ids) {
        lines.push(this._markdownEntity(id));
        lines.push('');
      }
    }

    return {
      content: lines.join('\n'),
      filename: this._filename('md'),
      mime: 'text/markdown;charset=utf-8',
    };
  }

  // ── Snippets ──────────────────────────────────────────────

  /**
   * Exporta apenas entidades que têm `Trigger` (snippets).
   * @returns {{ content:string, filename:string, mime:string }}
   */
  toSnippets() {
    const world = this.machine.world;
    const out = [];

    for (const id of world.query(COMPONENT_NAMES.TRIGGER)) {
      const ident = world.get(id, COMPONENT_NAMES.IDENTITY);
      const trigger = world.get(id, COMPONENT_NAMES.TRIGGER)?.value;
      const type = world.get(id, COMPONENT_NAMES.SNIPPET_TYPE)?.value ?? 'text';
      const body = world.get(id, COMPONENT_NAMES.BODY)?.text ?? '';
      const defs = world.get(id, COMPONENT_NAMES.PLACEHOLDER_DEFS)?.defs ?? null;
      const runs = world.get(id, COMPONENT_NAMES.RUNS)?.cmds ?? null;
      const menu = world.get(id, COMPONENT_NAMES.MENU_OPTS)?.options ?? null;

      out.push({
        id: ident?.id ?? id,
        name: ident?.name ?? trigger,
        trigger,
        type,
        body,
        defs,
        runs,
        menu,
      });
    }

    out.sort((a, b) => a.trigger.localeCompare(b.trigger));

    return {
      content: JSON.stringify({
        exportedAt: new Date().toISOString(),
        tick: this.machine.getTick(),
        count: out.length,
        snippets: out,
      }, null, 2),
      filename: this._filename('snippets.json'),
      mime: 'application/json',
    };
  }

  // ── HTML (→ PDF via print) ────────────────────────────────

  /**
   * Documento HTML com CSS de impressão.
   * O usuário abre no navegador e usa Ctrl+P → Salvar como PDF.
   * @returns {{ content:string, filename:string, mime:string }}
   */
  toHTML() {
    const world = this.machine.world;
    const tick = this.machine.getTick();
    const timeline = this.machine.getTimeline();

    const groups = new Map();
    for (const id of world.allEntities()) {
      const ident = world.get(id, COMPONENT_NAMES.IDENTITY);
      const type = ident?.type ?? 'custom';
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type).push(id);
    }

    const sortedTypes = Array.from(groups.keys()).sort();

    let body = '';
    for (const type of sortedTypes) {
      const ids = groups.get(type);
      const label = ENTITY_TYPE_LABEL[type] ?? type;
      body += `<h2>${escapeHtml(label)} (${ids.length})</h2>\n`;
      for (const id of ids) {
        body += this._htmlEntity(id);
      }
    }

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Narrativa — ${escapeHtml(tick)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1a202c; line-height: 1.6; }
  h1 { border-bottom: 2px solid #4a90e2; padding-bottom: 8px; }
  h2 { margin-top: 32px; color: #2b6cb0; font-size: 18px; }
  h3 { margin-top: 20px; margin-bottom: 6px; font-size: 15px; }
  .meta { color: #718096; font-size: 13px; margin-bottom: 24px; }
  .entity { border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin-bottom: 12px; }
  .entity .shortcode { font-family: 'Consolas', monospace; font-size: 12px; color: #718096; font-weight: normal; }
  .entity .desc { color: #4a5568; font-size: 13px; margin: 6px 0; }
  .entity dl { margin: 8px 0 0; font-size: 13px; }
  .entity dt { font-weight: 600; color: #4a5568; display: inline; }
  .entity dd { display: inline; margin: 0 0 0 4px; font-family: 'Consolas', monospace; }
  .entity dd::after { content: ' · '; color: #cbd5e0; }
  .entity dd:last-child::after { content: ''; }
  @media print { body { margin: 0; } h2 { break-after: avoid; } .entity { break-inside: avoid; } }
</style>
</head>
<body>
<h1>Mundo — ${escapeHtml(tick)}</h1>
<div class="meta">Timeline: <code>${escapeHtml(timeline)}</code> · ${world.allEntities().length} entidades · exportado em ${new Date().toLocaleString('pt-BR')}</div>
${body}
</body>
</html>`;

    return {
      content: html,
      filename: this._filename('html'),
      mime: 'text/html;charset=utf-8',
    };
  }

  // ── All ───────────────────────────────────────────────────

  /**
   * Manifesto com todas as representações.
   * @returns {{ content:string, filename:string, mime:string }}
   */
  toAll() {
    const payload = {
      exportedAt: new Date().toISOString(),
      tick: this.machine.getTick(),
      timeline: this.machine.getTimeline(),
      json: JSON.parse(this.toJSON().content),
      csv: this.toCSV().content,
      markdown: this.toMarkdown().content,
      snippets: JSON.parse(this.toSnippets().content),
    };

    return {
      content: JSON.stringify(payload, null, 2),
      filename: this._filename('all.json'),
      mime: 'application/json',
    };
  }

  // ── Internos ──────────────────────────────────────────────

  /**
   * Nome de arquivo padrão: `narrativa-<tick>-<timestamp>.<ext>`.
   * @param {string} ext
   * @returns {string}
   * @private
   */
  _filename(ext) {
    const tick = this.machine.getTick().replace(/[^T0-9]/g, '');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `narrativa-${tick}-${ts}.${ext}`;
  }

  /**
   * Escapa um campo CSV (aspas, vírgula, quebra de linha).
   * @param {any} v
   * @returns {string}
   * @private
   */
  _csv(v) {
    const s = String(v ?? '');
    if (!/[",\n\r]/.test(s)) return s;
    return `"${s.replace(/"/g, '""')}"`;
  }

  /**
   * Serializa um objeto em CSV (JSON inline escapado).
   * @param {any} v
   * @returns {string}
   * @private
   */
  _csvJson(v) {
    if (v === null || v === undefined) return '';
    if (Array.isArray(v) && v.length === 0) return '';
    if (typeof v === 'object' && Object.keys(v).length === 0) return '';
    return this._csv(JSON.stringify(v));
  }

  /**
   * Bloco Markdown de uma entidade.
   * @param {string} id
   * @returns {string}
   * @private
   */
  _markdownEntity(id) {
    const world = this.machine.world;
    const ident = world.get(id, COMPONENT_NAMES.IDENTITY);

    const lines = [];
    lines.push(`### ${ident?.name ?? id} (\`${ident?.id ?? id}\`)`);
    if (ident?.description) lines.push('');
    if (ident?.description) lines.push(`> ${ident.description}`);

    const stats = world.get(id, COMPONENT_NAMES.STATS);
    if (stats && Object.keys(stats).length > 0) {
      lines.push('');
      lines.push('**Stats:**');
      for (const [k, v] of Object.entries(stats)) lines.push(`- \`${k}\`: ${v}`);
    }

    const enums = world.get(id, COMPONENT_NAMES.ENUMS);
    if (enums && Object.keys(enums).length > 0) {
      lines.push('');
      lines.push('**Enums:**');
      for (const [k, v] of Object.entries(enums)) lines.push(`- \`${k}\`: ${v}`);
    }

    const flags = world.get(id, COMPONENT_NAMES.FLAGS)?.values;
    if (flags && flags.length > 0) {
      lines.push('');
      lines.push(`**Flags:** ${flags.map(f => `\`${f}\``).join(', ')}`);
    }

    const tags = world.get(id, COMPONENT_NAMES.TAGS)?.values;
    if (tags && tags.length > 0) {
      lines.push('');
      lines.push(`**Tags:** ${tags.map(t => `#${t}`).join(' ')}`);
    }

    const lists = world.get(id, COMPONENT_NAMES.LISTS);
    if (lists && Object.keys(lists).length > 0) {
      lines.push('');
      lines.push('**Lists:**');
      for (const [k, arr] of Object.entries(lists)) {
        lines.push(`- \`${k}\`: ${(arr || []).join(', ')}`);
      }
    }

    const body = world.get(id, COMPONENT_NAMES.BODY)?.text;
    if (body) {
      lines.push('');
      lines.push(`**Body:** ${body}`);
    }

    return lines.join('\n');
  }

  /**
   * Bloco HTML de uma entidade.
   * @param {string} id
   * @returns {string}
   * @private
   */
  _htmlEntity(id) {
    const world = this.machine.world;
    const ident = world.get(id, COMPONENT_NAMES.IDENTITY);

    let html = `<div class="entity">`;
    html += `<h3>${escapeHtml(ident?.name ?? id)} <span class="shortcode">${escapeHtml(ident?.id ?? id)}</span></h3>`;

    if (ident?.description) {
      html += `<div class="desc">${escapeHtml(ident.description)}</div>`;
    }

    const pairs = [];

    const stats = world.get(id, COMPONENT_NAMES.STATS);
    if (stats) for (const [k, v] of Object.entries(stats)) pairs.push([k, String(v)]);

    const enums = world.get(id, COMPONENT_NAMES.ENUMS);
    if (enums) for (const [k, v] of Object.entries(enums)) pairs.push([k, String(v)]);

    const flags = world.get(id, COMPONENT_NAMES.FLAGS)?.values;
    if (flags?.length) pairs.push(['flags', flags.join(', ')]);

    const tags = world.get(id, COMPONENT_NAMES.TAGS)?.values;
    if (tags?.length) pairs.push(['tags', tags.join(', ')]);

    const lists = world.get(id, COMPONENT_NAMES.LISTS);
    if (lists) for (const [k, arr] of Object.entries(lists)) {
      pairs.push([k, (arr || []).join(', ')]);
    }

    if (pairs.length > 0) {
      html += `<dl>`;
      for (const [k, v] of pairs) {
        html += `<dt>${escapeHtml(k)}:</dt><dd>${escapeHtml(v)}</dd>`;
      }
      html += `</dl>`;
    }

    html += `</div>\n`;
    return html;
  }
}

/**
 * Escapa string para HTML.
 * @param {string} s
 * @returns {string}
 * @private
 */
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}