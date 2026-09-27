/**
 * @file export-system.js
 * @module systems
 * @description Handles exp.pdf/json/csv/snippets/all/md/html — gera arquivos reais.
 * @imports ecs/system, systems/helpers/export-builder
 * @level 7
 *
 * Fase 13.7 — Documentação (auditoria 25/09/2026):
 *   O código já suportava `exp.md`, `exp.markdown` e `exp.html` como
 *   aliases de `exp.pdf`, mas eles não apareciam em
 *   `schemas/builtin-commands.js`. Este arquivo foi inspecionado e
 *   confirmado correto — nenhuma mudança de lógica foi feita. Os
 *   aliases agora estão documentados no catálogo (ver Fase 4.6).
 */

import { System } from '../ecs/system.js';
import { ExportBuilder } from './helpers/export-builder.js';

export class ExportSystem extends System {
  constructor() {
    super('ExportSystem');
    /** @type {ExportBuilder|null} */
    this.builder = null;
  }

  init() {
    this.builder = new ExportBuilder(this.machine);
  }

  run(_line, _ctx, prev) {
    const ast = prev.ast;
    if (!ast || ast.verb !== 'exp') return prev;
    if (!this.builder) return prev;

    try {
      const result = this._build(ast.action);
      if (!result) {
        return { ...prev, ok: false, halt: true, error: `exp.${ast.action} não suportado` };
      }

      const { content, filename, mime } = result;
      const blob = new Blob([content], { type: mime });
      const size = content.length;

      this.bus.emit('export:ready', {
        blob,
        filename,
        mime,
        format: ast.action,
        size,
        tick: this.getTick(),
      });

      return {
        ...prev,
        ok: true,
        mutated: false,
        export: {
          format: ast.action,
          filename,
          mime,
          size,
          at: this.getTick(),
          ready: true,
        },
        right: {
          kind: 'card',
          title: `📦 Export — ${ast.action}`,
          data: {
            arquivo: filename,
            formato: mime,
            tamanho: formatBytes(size),
            tick: this.getTick(),
          },
          sticky: true,
        },
      };
    } catch (err) {
      return { ...prev, ok: false, halt: true, error: err.message };
    }
  }

  // ── Despacho por ação ─────────────────────────────────────

  /**
   * @private
   */
  _build(action) {
    switch (action) {
      case 'json':     return this.builder.toJSON();
      case 'csv':      return this.builder.toCSV();
      case 'snippets': return this.builder.toSnippets();
      case 'all':      return this.builder.toAll();
      case 'md':
      case 'markdown': return this.builder.toMarkdown();
      case 'pdf':
      case 'html':     return this.builder.toHTML();
      default:         return null;
    }
  }
}

/**
 * Formata bytes para exibição.
 * @param {number} n
 * @returns {string}
 * @private
 */
function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}