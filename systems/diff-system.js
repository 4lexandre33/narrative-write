/**
 * @file diff-system.js
 * @module systems
 * @description Handles dif.* — vs, at, entity, range, export.
 * @imports ecs/system, ecs/snapshot
 * @level 7
 *
 * Fase 13.7 — Stubs → Funcionalidades (auditoria 25/09/2026):
 *   - `_at`, `_entity`, `_range` existiam no autocomplete mas nunca eram
 *     tratados. O parser não os produzia (o `_parseDif` só entende
 *     `dif.<a> vs <b>` e `dif.export`), então a única forma de suportá-los
 *     sem tocar o parser é extrair a sintaxe de `ast.raw` via regex.
 *   - `_export` retornava payload sem blob. Agora emite `export:ready`
 *     com `Blob` real (mesmo padrão de `ExportSystem`), gerando download.
 *
 * Sintaxes suportadas:
 *   dif.<a> vs <b>                          → diff entre timelines
 *   dif.<a> vs <b> at <tick>                → diff num tick específico
 *   dif.<a> vs <b> entity <entityId>        → diff filtrado por entidade
 *   dif.<a> vs <b> range <t1>..<t2>         → diff entre dois ticks
 *   dif.at <a> <b> <tick>                   → forma alternativa de at
 *   dif.entity <a> <b> <entityId>           → forma alternativa de entity
 *   dif.range <a> <b> <t1>..<t2>            → forma alternativa de range
 *   dif.export <a> vs <b> [format]          → exporta para arquivo
 */

import { System } from '../ecs/system.js';
import { Snapshot } from '../ecs/snapshot.js';

export class DiffSystem extends System {
  constructor() { super('DiffSystem'); }

  run(_line, _ctx, prev) {
    const ast = prev.ast;
    if (!ast || ast.verb !== 'dif') return prev;

    const timeline = this.machine?.systems?.get('TimelineSystem');
    if (!timeline) {
      return { ...prev, ok: false, halt: true, error: 'TimelineSystem não registrado' };
    }

    try {
      const sub = this._resolveSubcommand(ast);
      switch (sub) {
        case 'vs':     return this._vs(prev, ast, timeline);
        case 'at':     return this._at(prev, ast, timeline);
        case 'entity': return this._entity(prev, ast, timeline);
        case 'range':  return this._range(prev, ast, timeline);
        case 'export': return this._export(prev, ast, timeline);
        default:
          return { ...prev, ok: false, halt: true, error: `subcomando não reconhecido: ${ast.raw}` };
      }
    } catch (err) {
      return { ...prev, ok: false, halt: true, error: err.message };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Resolução de subcomando (via raw)
  // ═══════════════════════════════════════════════════════════

  /**
   * @param {Object} ast
   * @returns {'vs'|'at'|'entity'|'range'|'export'}
   * @private
   */
  _resolveSubcommand(ast) {
    const raw = String(ast.raw || '').trim();
    if (/^dif\.export\b/.test(raw)) return 'export';
    if (/^dif\.at\b/.test(raw)) return 'at';
    if (/^dif\.entity\b/.test(raw)) return 'entity';
    if (/^dif\.range\b/.test(raw)) return 'range';
    if (/^dif\.\S+\s+vs\s+\S+/.test(raw)) {
      if (/\sat\s+\S+/.test(raw)) return 'at';
      if (/\sentity\s+\S+/.test(raw)) return 'entity';
      if (/\srange\s+\S+/.test(raw)) return 'range';
      return 'vs';
    }
    return 'vs';
  }

  // ═══════════════════════════════════════════════════════════
  // dif.<a> vs <b>
  // ═══════════════════════════════════════════════════════════

  _vs(prev, ast, timeline) {
    const a = ast.a;
    const b = ast.b;

    if (!a || !b) {
      return { ...prev, ok: false, halt: true, error: 'uso: dif.<a> vs <b>' };
    }
    if (!timeline.timelines.has(a)) {
      return { ...prev, ok: false, halt: true, error: `timeline não existe: ${a}` };
    }
    if (!timeline.timelines.has(b)) {
      return { ...prev, ok: false, halt: true, error: `timeline não existe: ${b}` };
    }

    const snapA = timeline.getSnapshot(timeline.getLastTick(a), a);
    const snapB = timeline.getSnapshot(timeline.getLastTick(b), b);
    const diff = Snapshot.diff(snapA, snapB);

    return {
      ...prev,
      ok: true,
      right: {
        kind: 'diff',
        title: `${a} vs ${b}`,
        data: diff,
        sticky: true,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // dif.* at <tick>
  // ═══════════════════════════════════════════════════════════

  _at(prev, ast, timeline) {
    const parsed = this._parseRaw(ast.raw);
    if (!parsed.ok) {
      return { ...prev, ok: false, halt: true, error: parsed.error };
    }

    const { a, b, tick } = parsed;
    if (!a || !b || !tick) {
      return {
        ...prev, ok: false, halt: true,
        error: 'uso: dif.<a> vs <b> at <tick>',
      };
    }
    if (!timeline.timelines.has(a)) {
      return { ...prev, ok: false, halt: true, error: `timeline não existe: ${a}` };
    }
    if (!timeline.timelines.has(b)) {
      return { ...prev, ok: false, halt: true, error: `timeline não existe: ${b}` };
    }

    const snapA = timeline.getSnapshot(tick, a);
    const snapB = timeline.getSnapshot(tick, b);
    if (!snapA && !snapB) {
      return { ...prev, ok: false, halt: true, error: `tick ${tick} não existe em nenhuma das timelines` };
    }

    const diff = Snapshot.diff(snapA, snapB);

    return {
      ...prev,
      ok: true,
      right: {
        kind: 'diff',
        title: `${a} vs ${b} @ ${tick}`,
        data: diff,
        sticky: true,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // dif.* entity <id>
  // ═══════════════════════════════════════════════════════════

  _entity(prev, ast, timeline) {
    const parsed = this._parseRaw(ast.raw);
    if (!parsed.ok) {
      return { ...prev, ok: false, halt: true, error: parsed.error };
    }

    const { a, b, entityId } = parsed;
    if (!a || !b || !entityId) {
      return {
        ...prev, ok: false, halt: true,
        error: 'uso: dif.<a> vs <b> entity <entityId>',
      };
    }
    if (!timeline.timelines.has(a)) {
      return { ...prev, ok: false, halt: true, error: `timeline não existe: ${a}` };
    }
    if (!timeline.timelines.has(b)) {
      return { ...prev, ok: false, halt: true, error: `timeline não existe: ${b}` };
    }

    const snapA = timeline.getSnapshot(timeline.getLastTick(a), a);
    const snapB = timeline.getSnapshot(timeline.getLastTick(b), b);

    const entityDiff = Snapshot.diffEntity(snapA, snapB, entityId);
    if (!entityDiff) {
      return {
        ...prev,
        ok: true,
        right: {
          kind: 'card',
          title: `${a} vs ${b} · ${entityId}`,
          data: { info: 'Nenhuma diferença para esta entidade' },
        },
      };
    }

    return {
      ...prev,
      ok: true,
      right: {
        kind: 'diff',
        title: `${a} vs ${b} · ${entityId}`,
        data: {
          added: [],
          removed: [],
          changed: [{ id: entityId, patch: entityDiff.patch }],
          stats: {
            added: 0,
            removed: 0,
            changed: 1,
            total: 1,
          },
        },
        sticky: true,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // dif.* range <t1>..<t2>
  // ═══════════════════════════════════════════════════════════

  _range(prev, ast, timeline) {
    const parsed = this._parseRaw(ast.raw);
    if (!parsed.ok) {
      return { ...prev, ok: false, halt: true, error: parsed.error };
    }

    const { a, b, from, to } = parsed;
    if (!a || !b || !from || !to) {
      return {
        ...prev, ok: false, halt: true,
        error: 'uso: dif.<a> vs <b> range <t1>..<t2>',
      };
    }
    if (!timeline.timelines.has(a)) {
      return { ...prev, ok: false, halt: true, error: `timeline não existe: ${a}` };
    }
    if (!timeline.timelines.has(b)) {
      return { ...prev, ok: false, halt: true, error: `timeline não existe: ${b}` };
    }

    const snapAfrom = timeline.getSnapshot(from, a);
    const snapAto   = timeline.getSnapshot(to, a);
    const snapBfrom = timeline.getSnapshot(from, b);
    const snapBto   = timeline.getSnapshot(to, b);

    if (!snapAfrom || !snapAto || !snapBfrom || !snapBto) {
      return {
        ...prev, ok: false, halt: true,
        error: `range ${from}..${to} incompleto em alguma timeline`,
      };
    }

    const diffA = Snapshot.diff(snapAfrom, snapAto);
    const diffB = Snapshot.diff(snapBfrom, snapBto);

    return {
      ...prev,
      ok: true,
      right: {
        kind: 'diff',
        title: `${a} vs ${b} · ${from}..${to}`,
        data: {
          from: { tick: from, timeline: a },
          to:   { tick: to,   timeline: b },
          a: diffA,
          b: diffB,
          stats: {
            a: diffA.stats,
            b: diffB.stats,
          },
          added: [],
          removed: [],
          changed: [],
        },
        sticky: true,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // dif.export
  // ═══════════════════════════════════════════════════════════

  /**
   * Exporta o diff como arquivo. Emite `export:ready` com Blob real.
   *
   * Fase 13.7: antes só retornava payload sem blob — nenhum arquivo
   * era gerado. Agora segue o padrão de `ExportSystem`.
   *
   * @private
   */
  _export(prev, ast, timeline) {
    const parsed = this._parseRaw(ast.raw);
    if (!parsed.ok) {
      return { ...prev, ok: false, halt: true, error: parsed.error };
    }

    const { a, b, format = 'json' } = parsed;
    if (!a || !b) {
      return {
        ...prev, ok: false, halt: true,
        error: 'uso: dif.export <a> vs <b> [json|csv|md]',
      };
    }
    if (!timeline.timelines.has(a)) {
      return { ...prev, ok: false, halt: true, error: `timeline não existe: ${a}` };
    }
    if (!timeline.timelines.has(b)) {
      return { ...prev, ok: false, halt: true, error: `timeline não existe: ${b}` };
    }

    const snapA = timeline.getSnapshot(timeline.getLastTick(a), a);
    const snapB = timeline.getSnapshot(timeline.getLastTick(b), b);
    const diff = Snapshot.diff(snapA, snapB);

    const normalizedFormat = this._normalizeFormat(format);
    const content = this._serializeDiff(diff, normalizedFormat, a, b);
    const mime = this._mimeFor(normalizedFormat);
    const ext = normalizedFormat === 'markdown' ? 'md' : normalizedFormat;
    const filename = `diff-${a}-vs-${b}-${Date.now().toString(36)}.${ext}`;

    try {
      const blob = new Blob([content], { type: mime });
      this.bus.emit('export:ready', {
        blob,
        filename,
        mime,
        format: normalizedFormat,
        size: content.length,
        tick: this.getTick(),
      });

      return {
        ...prev,
        ok: true,
        mutated: false,
        export: {
          format: normalizedFormat,
          filename,
          mime,
          size: content.length,
          at: this.getTick(),
          ready: true,
        },
        right: {
          kind: 'card',
          title: `📦 Diff exportado — ${a} vs ${b}`,
          data: {
            arquivo: filename,
            formato: mime,
            tamanho: this._formatBytes(content.length),
            'estatísticas': JSON.stringify(diff.stats, null, 2),
          },
          sticky: true,
        },
      };
    } catch (err) {
      return {
        ...prev, ok: false, halt: true,
        error: `falha ao gerar blob: ${err.message}`,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Parser de raw
  // ═══════════════════════════════════════════════════════════

  /**
   * Extrai os argumentos de uma linha `dif.*` diretamente do raw.
   * Suporta múltiplas sintaxes.
   *
   * @param {string} raw
   * @returns {{ ok:true, a:string, b:string, tick?:string, entityId?:string, from?:string, to?:string, format?:string } | { ok:false, error:string }}
   * @private
   */
  _parseRaw(raw) {
    const s = String(raw || '').trim();

    // 1. dif.export <a> vs <b> [format]
    let m = /^dif\.export\s+(\S+)\s+vs\s+(\S+)(?:\s+(\S+))?/i.exec(s);
    if (m) {
      return { ok: true, a: m[1], b: m[2], format: m[3] || 'json' };
    }

    // 2. dif.<a> vs <b> [modifier arg]
    m = /^dif\.([a-zA-Z_][\w-]*)\s+vs\s+([a-zA-Z_][\w-]*)(?:\s+(at|entity|range)\s+(.+?))?\s*$/i.exec(s);
    if (m) {
      const a = m[1];
      const b = m[2];
      const modifier = m[3];
      const arg = m[4];

      if (modifier === 'at') {
        return { ok: true, a, b, tick: arg?.trim() };
      }
      if (modifier === 'entity') {
        return { ok: true, a, b, entityId: arg?.trim() };
      }
      if (modifier === 'range') {
        const rangeMatch = /^(\S+)\.\.(\S+)$/.exec((arg || '').trim());
        if (rangeMatch) {
          return { ok: true, a, b, from: rangeMatch[1], to: rangeMatch[2] };
        }
        return { ok: false, error: `range inválido: ${arg}` };
      }
      return { ok: true, a, b };
    }

    // 3. dif.at <a> <b> <tick>
    m = /^dif\.at\s+(\S+)\s+(\S+)\s+(\S+)/i.exec(s);
    if (m) return { ok: true, a: m[1], b: m[2], tick: m[3] };

    // 4. dif.entity <a> <b> <id>
    m = /^dif\.entity\s+(\S+)\s+(\S+)\s+(\S+)/i.exec(s);
    if (m) return { ok: true, a: m[1], b: m[2], entityId: m[3] };

    // 5. dif.range <a> <b> <from>..<to>
    m = /^dif\.range\s+(\S+)\s+(\S+)\s+(\S+)\.\.(\S+)/i.exec(s);
    if (m) return { ok: true, a: m[1], b: m[2], from: m[3], to: m[4] };

    return { ok: false, error: `sintaxe não reconhecida: ${s}` };
  }

  // ═══════════════════════════════════════════════════════════
  // Serialização de diff
  // ═══════════════════════════════════════════════════════════

  _normalizeFormat(format) {
    const f = String(format || 'json').toLowerCase();
    if (f === 'md') return 'markdown';
    if (['json', 'csv', 'markdown'].includes(f)) return f;
    return 'json';
  }

  _mimeFor(format) {
    switch (format) {
      case 'csv':      return 'text/csv;charset=utf-8';
      case 'markdown': return 'text/markdown;charset=utf-8';
      default:         return 'application/json';
    }
  }

  _serializeDiff(diff, format, a, b) {
    if (format === 'csv') {
      const lines = [];
      lines.push('kind,id,detail');
      for (const id of diff.added) {
        lines.push(`added,"${this._csv(id)}",""`);
      }
      for (const id of diff.removed) {
        lines.push(`removed,"${this._csv(id)}",""`);
      }
      for (const c of diff.changed) {
        lines.push(`changed,"${this._csv(c.id)}","${this._csv(JSON.stringify(c.patch))}"`);
      }
      return lines.join('\n') + '\n';
    }

    if (format === 'markdown') {
      const lines = [];
      lines.push(`# Diff — ${a} vs ${b}`);
      lines.push('');
      lines.push(`- **Adicionadas:** ${diff.stats.added}`);
      lines.push(`- **Removidas:** ${diff.stats.removed}`);
      lines.push(`- **Alteradas:** ${diff.stats.changed}`);
      lines.push('');
      if (diff.added.length > 0) {
        lines.push('## Adicionadas');
        for (const id of diff.added) lines.push(`- \`${id}\``);
        lines.push('');
      }
      if (diff.removed.length > 0) {
        lines.push('## Removidas');
        for (const id of diff.removed) lines.push(`- \`${id}\``);
        lines.push('');
      }
      if (diff.changed.length > 0) {
        lines.push('## Alteradas');
        for (const c of diff.changed) {
          lines.push(`### \`${c.id}\``);
          for (const [comp, data] of Object.entries(c.patch)) {
            lines.push(`- **${comp}** (\`${data.op}\`)`);
          }
          lines.push('');
        }
      }
      return lines.join('\n');
    }

    // json (default)
    return JSON.stringify({
      from: diff.from,
      to: diff.to,
      stats: diff.stats,
      added: diff.added,
      removed: diff.removed,
      changed: diff.changed,
    }, null, 2);
  }

  _csv(v) {
    const s = String(v ?? '');
    if (!/[",\n\r]/.test(s)) return s;
    return s.replace(/"/g, '""');
  }

  _formatBytes(n) {
    if (!Number.isFinite(n) || n < 0) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }
}