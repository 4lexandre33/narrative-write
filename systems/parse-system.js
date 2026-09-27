/**
 * @file parse-system.js
 * @module systems
 * @description Linha crua → AST. Tokeniza, extrai verbo/ação/subtipo/opts.
 * @imports ecs/system, core/constants
 * @level 7
 *
 * Fase 4 — Diagnostics: adicionado `case 'diag'` e `_parseDiag()`.
 * Fase 5/6 — Diagnostics: `_parseDiag()` recebe `subtype` e o propaga.
 * Onda 5 — Superfície: `test` e `baseline` adicionados ao switch de `_parseDiag`.
 * Fase 5 — LUME: adicionado `case 'narr'` e `_parseNarr()`.
 * Fase 8 — LUME: adicionado `'narrative'` ao grupo de subcomandos que
 *              prepend o subtype em `positional` (para `diag.narrative.*`).
 * Fase 13 — Hierarquia: adicionado `case 'phr'` e `_parsePhr()`.
 *
 * Fase 13.7 — Bugfix P0-5 (auditoria 25/09/2026):
 *   `_parseNarr` não aceitava `narr.catalog` (documentado em
 *   `builtin-commands.js` e `command-catalog.js`). O handler existe em
 *   `NarrativeSystem._runNarrCommand`, mas nunca era alcançado porque
 *   o parser rejeitava antes. Adicionado `'catalog'` à lista VALID.
 */

import { System } from '../ecs/system.js';
import { ENTITY_TYPES, RULE_MODES } from '../core/constants.js';

export class ParseSystem extends System {
  constructor() { super('ParseSystem'); }

  run(line, _ctx, prev) {
    if (prev.kind === 'slash-command') {
      return { ...prev, ast: this._parseSlash(line) };
    }
    if (prev.kind === 'empty') return prev;
    if (prev.kind === 'prose') {
      return { ...prev, ast: { verb: 'prose', raw: line } };
    }
    if (prev.kind !== 'command') return prev;

    const ast = this.parse(line);
    if (!ast.ok) return { ...prev, ok: false, error: ast.error, halt: true };
    return { ...prev, ast: ast.ast };
  }

  // ── Tokenizer ──────────────────────────────────────────────

  tokenize(line) {
    const tokens = [];
    let i = 0;
    const n = line.length;
    while (i < n) {
      while (i < n && /\s/.test(line[i])) i++;
      if (i >= n) break;
      let token = '';
      let quote = null;
      while (i < n) {
        const ch = line[i];
        if (quote) {
          if (ch === quote) { quote = null; i++; continue; }
          if (ch === '\\' && i + 1 < n) { token += line[i + 1]; i += 2; continue; }
          token += ch; i++;
        } else {
          if (ch === '"' || ch === "'") { quote = ch; i++; continue; }
          if (/\s/.test(ch)) break;
          token += ch; i++;
        }
      }
      tokens.push(token);
    }
    return tokens;
  }

  parseOptions(tokens) {
    const opts = {};
    for (const tok of tokens) {
      const eq = tok.indexOf('=');
      if (eq <= 0) continue;
      opts[tok.slice(0, eq)] = tok.slice(eq + 1);
    }
    return opts;
  }

  // ── Parse principal ────────────────────────────────────────

  parse(line) {
    const tokens = this.tokenize(line);
    if (tokens.length === 0) return { ok: false, error: 'linha vazia' };

    const head = tokens[0];
    const parts = head.split('.');
    if (parts.length < 2) {
      return { ok: false, error: `cabeçalho inválido: ${head}` };
    }

    const [verb, action, subtype] = parts;
    const rest = tokens.slice(1);
    const raw = line;

    switch (verb) {
      case 'ent':  return this._parseEnt(action, subtype, rest, raw);
      case 'id':   return this._parseId(action, subtype, rest, raw);
      case 'inst': return this._parseInst(action, subtype, rest, raw);
      case 'mut':  return this._parseMut(action, subtype, rest, raw);
      case 'link': return this._parseLink(action, subtype, rest, raw);
      case 'que':  return this._parseQue(action, rest, raw);
      case 'sea':  return this._parseSea(action, rest, raw);
      case 'at':   return this._parseAt(action, rest, raw);
      case 'whe':  return this._parseWhe(action, rest, raw);
      case 'tim':  return this._parseTim(action, rest, raw);
      case 'aud':  return this._parseAud(action, rest, raw);
      case 'kno':  return this._parseKno(action, rest, raw);
      case 'frk':  return this._parseFrk(action, rest, raw);
      case 'dif':  return this._parseDif(action, rest, raw);
      case 'rul':  return this._parseRul(action, rest, raw);
      case 'snip': return this._parseSnip(action, subtype, rest, raw);
      case 'exp':  return this._parseExp(action, rest, raw);
      case 'help': return this._parseHelp(action, rest, raw);
      case 'diag': return this._parseDiag(action, subtype, rest, raw);
      case 'narr': return this._parseNarr(action, subtype, rest, raw);
      case 'phr':  return this._parsePhr(action, rest, raw);
      default:     return { ok: false, error: `verbo não suportado: ${verb}` };
    }
  }

  // ── ent.* ─────────────────────────────────────────────────

  _parseEnt(action, subtype, rest, raw) {
    if (action === 'create') {
      if (!ENTITY_TYPES.includes(subtype)) {
        return { ok: false, error: `tipo inválido: ${subtype}` };
      }
      const name = rest[0];
      if (!name) return { ok: false, error: 'nome obrigatório' };
      return { ok: true, ast: {
        verb: 'ent', action, subtype, name,
        opts: this.parseOptions(rest.slice(1)), raw,
      }};
    }
    if (action === 'show' || action === 'delete') {
      const target = rest[0];
      if (!target) return { ok: false, error: `alvo obrigatório: ent.${action}` };
      return { ok: true, ast: { verb: 'ent', action, target, raw } };
    }
    if (action === 'list') {
      return { ok: true, ast: { verb: 'ent', action, subtype: rest[0] || null, raw } };
    }
    return { ok: false, error: `ent.${action} não suportado` };
  }

  // ── id.* ──────────────────────────────────────────────────

  _parseId(action, _subtype, rest, raw) {
    if (!['show', 'rename', 'describe', 'retype'].includes(action)) {
      return { ok: false, error: `id.${action} não suportado` };
    }
    const target = rest[0];
    if (!target) return { ok: false, error: `alvo obrigatório em id.${action}` };
    const value = rest.slice(1).join(' ');
    if (action === 'show') {
      return { ok: true, ast: { verb: 'id', action, target, raw } };
    }
    if (!value) return { ok: false, error: `valor obrigatório em id.${action}` };
    return { ok: true, ast: { verb: 'id', action, target, value, raw } };
  }

  // ── inst.* ────────────────────────────────────────────────

  _parseInst(action, _subtype, rest, raw) {
    if (action === 'mark') {
      const target = rest[0];
      if (!target) return { ok: false, error: 'alvo obrigatório em inst.mark' };
      return { ok: true, ast: { verb: 'inst', action, target,
        opts: this.parseOptions(rest.slice(1)), raw }};
    }
    if (action === 'unmark') {
      const target = rest[0];
      if (!target) return { ok: false, error: 'alvo obrigatório em inst.unmark' };
      return { ok: true, ast: { verb: 'inst', action, target, raw } };
    }
    if (action === 'create') {
      const blueprint = rest[0];
      if (!blueprint) return { ok: false, error: 'blueprint obrigatório em inst.create' };
      const maybeName = rest[1] && !rest[1].includes('=') ? rest[1] : null;
      const optsStart = maybeName ? 2 : 1;
      return { ok: true, ast: {
        verb: 'inst', action, blueprint, name: maybeName,
        opts: this.parseOptions(rest.slice(optsStart)), raw,
      }};
    }
    if (action === 'destroy') {
      const target = rest[0];
      if (!target) return { ok: false, error: 'alvo obrigatório em inst.destroy' };
      return { ok: true, ast: { verb: 'inst', action, target, raw } };
    }
    if (action === 'list') {
      return { ok: true, ast: { verb: 'inst', action, target: rest[0] || null, raw } };
    }
    if (action === 'sync') {
      const bp = rest[0];
      if (!bp) return { ok: false, error: 'blueprint obrigatório em inst.sync' };
      return { ok: true, ast: { verb: 'inst', action, blueprint: bp, raw } };
    }
    if (action === 'chain' || action === 'resolve') {
      const target = rest[0];
      if (!target) return { ok: false, error: `alvo obrigatório em inst.${action}` };
      return { ok: true, ast: { verb: 'inst', action, target, raw } };
    }
    if (action === 'reparent') {
      const target = rest[0];
      if (!target) return { ok: false, error: 'alvo obrigatório em inst.reparent' };
      return { ok: true, ast: { verb: 'inst', action, target,
        opts: this.parseOptions(rest.slice(1)), raw }};
    }
    if (action === 'unset') {
      const target = rest[0];
      const path = rest[1];
      if (!target || !path) return { ok: false, error: 'uso: inst.unset <target> <comp>.<field>' };
      return { ok: true, ast: { verb: 'inst', action, target, path, raw } };
    }
    if (action === 'policy') {
      const target = rest[0];
      if (!target) return { ok: false, error: 'alvo obrigatório em inst.policy' };
      return { ok: true, ast: { verb: 'inst', action, target,
        opts: this.parseOptions(rest.slice(1)), raw }};
    }
    return { ok: false, error: `inst.${action} não suportado` };
  }

  // ── mut.* ─────────────────────────────────────────────────

  _parseMut(action, subtype, rest, raw) {
    if (action === 'flag') {
      if (!['on', 'off'].includes(subtype)) {
        return { ok: false, error: 'uso: mut.flag.<on|off> <target> <flag>' };
      }
      const target = rest[0], flag = rest[1];
      if (!target || !flag) return { ok: false, error: 'uso: mut.flag.<on|off> <target> <flag>' };
      return { ok: true, ast: { verb: 'mut', action, subtype, target, flag, raw } };
    }
    if (action === 'enum' || action === 'text') {
      const tpath = rest[0];
      const value = rest.slice(1).join(' ');
      if (!tpath || !value) return { ok: false, error: `uso: mut.${action} <target>.<field> <valor>` };
      const dot = tpath.indexOf('.');
      if (dot <= 0) return { ok: false, error: `path inválido: ${tpath}` };
      return { ok: true, ast: {
        verb: 'mut', action, target: tpath.slice(0, dot),
        path: tpath.slice(dot + 1), value, raw,
      }};
    }
    if (!['add', 'set', 'sub', 'push', 'pull'].includes(action)) {
      return { ok: false, error: `mut.${action} não suportado` };
    }
    if (['add', 'set', 'sub'].includes(action) && subtype !== 'stats') {
      return { ok: false, error: `mut.${action} requer .stats` };
    }
    if (['push', 'pull'].includes(action) && subtype !== 'list') {
      return { ok: false, error: `mut.${action} requer .list` };
    }
    const tpath = rest[0];
    if (!tpath) return { ok: false, error: 'path alvo obrigatório' };
    const dot = tpath.indexOf('.');
    if (dot <= 0) return { ok: false, error: `path inválido: ${tpath}` };
    const value = rest.slice(1).join(' ');
    if (value === '') return { ok: false, error: 'valor obrigatório' };
    return { ok: true, ast: {
      verb: 'mut', action, subtype, target: tpath.slice(0, dot),
      path: tpath.slice(dot + 1), value, raw,
    }};
  }

  // ── link.* ────────────────────────────────────────────────

  _parseLink(action, subtype, rest, raw) {
    const MUT = ['set', 'add', 'pull', 'clear'];
    const QUERY = ['where', 'to', 'from', 'tree'];

    if (MUT.includes(action)) {
      const rel = subtype;
      if (!rel) return { ok: false, error: `relação obrigatória: link.${action}.<rel>` };
      const from = rest[0];
      if (!from) return { ok: false, error: 'origem obrigatória' };
      if (action === 'clear') {
        return { ok: true, ast: { verb: 'link', action, rel, from, raw } };
      }
      const to = rest[1];
      if (!to) return { ok: false, error: 'destino obrigatório' };
      return { ok: true, ast: { verb: 'link', action, rel, from, to, raw } };
    }
    if (QUERY.includes(action)) {
      const target = rest[0];
      if (!target) return { ok: false, error: `uso: link.${action} <target>` };
      if (action === 'to') {
        const dot = target.indexOf('.');
        if (dot <= 0) return { ok: false, error: 'uso: link.to <from>.<rel>' };
        return { ok: true, ast: {
          verb: 'link', action, from: target.slice(0, dot),
          rel: target.slice(dot + 1), raw,
        }};
      }
      if (action === 'tree') {
        return { ok: true, ast: { verb: 'link', action, from: target,
          opts: this.parseOptions(rest.slice(1)), raw }};
      }
      return { ok: true, ast: { verb: 'link', action, target, raw } };
    }
    return { ok: false, error: `link.${action} não suportado` };
  }

  // ── que.* / sea.* / at.* / whe.* / tim.* ──────────────────

  _parseQue(action, rest, raw) {
    if (action === 'at') {
      const tick = rest[0], target = rest[1];
      if (!tick || !target) return { ok: false, error: 'uso: que.at <tick> <target>' };
      return { ok: true, ast: { verb: 'que', action, tick, target, raw } };
    }
    if (action === 'when') {
      const cond = rest[0];
      if (!cond) return { ok: false, error: 'uso: que.when <condição>' };
      const eq = cond.indexOf('=');
      if (eq <= 0) return { ok: false, error: `condição inválida: ${cond}` };
      return { ok: true, ast: {
        verb: 'que', action, path: cond.slice(0, eq),
        value: cond.slice(eq + 1), raw,
      }};
    }
    if (action === 'timeline') {
      const target = rest[0];
      if (!target) return { ok: false, error: 'uso: que.timeline <ent>.<campo>' };
      return { ok: true, ast: { verb: 'que', action, target, raw } };
    }
    if (action === 'knowledge') {
      const target = rest[0];
      if (!target) return { ok: false, error: 'uso: que.knowledge <ent> [at T]' };
      return { ok: true, ast: {
        verb: 'que', action, target,
        opts: this.parseOptions(rest.slice(1)), raw,
      }};
    }
    if (action === 'where') {
      const subtype = rest[0] || null;
      return { ok: true, ast: { verb: 'que', action, subtype, raw } };
    }
    return { ok: false, error: `que.${action} não suportado` };
  }

  _parseSea(action, rest, raw) {
    if (action === 'find') {
      const query = rest.join(' ').trim();
      if (!query) return { ok: false, error: 'uso: sea.find "expressão"' };
      return { ok: true, ast: { verb: 'sea', action, query, raw } };
    }
    if (action === 'in') {
      const category = rest[0];
      const query = rest.slice(1).join(' ').trim();
      if (!category) return { ok: false, error: 'uso: sea.in <categoria> "expressão"' };
      return { ok: true, ast: {
        verb: 'sea', action, subtype: category, query, raw,
      }};
    }
    if (action === 'tag') {
      const tag = rest[0];
      if (!tag) return { ok: false, error: 'uso: sea.tag <tag>' };
      return { ok: true, ast: { verb: 'sea', action, tag, raw } };
    }
    if (action === 'help') {
      return { ok: true, ast: { verb: 'sea', action, raw } };
    }
    return { ok: false, error: `sea.${action} não suportado` };
  }

  _parseAt(action, rest, raw) {
    const target = rest[0];
    const opts = this.parseOptions(rest.slice(1));
    return { ok: true, ast: { verb: 'at', action, target, opts, raw } };
  }

  _parseWhe(action, rest, raw) {
    const cond = rest[0];
    return { ok: true, ast: { verb: 'whe', action, condition: cond, raw } };
  }

  _parseTim(action, rest, raw) {
    return { ok: true, ast: { verb: 'tim', action, target: rest[0], raw } };
  }

  // ── aud.* ─────────────────────────────────────────────────

  _parseAud(action, rest, raw) {
    return { ok: true, ast: { verb: 'aud', action, opts: this.parseOptions(rest), raw } };
  }

  // ── kno.* ─────────────────────────────────────────────────

  _parseKno(action, rest, raw) {
    if (action === 'learn' || action === 'forget') {
      const target = rest[0];
      const fact = rest.slice(1).join(' ');
      if (!target || !fact) return { ok: false, error: `uso: kno.${action} <ent> "fato"` };
      return { ok: true, ast: { verb: 'kno', action, target, fact, raw } };
    }
    if (action === 'show' || action === 'at') {
      const target = rest[0];
      if (!target) return { ok: false, error: `alvo obrigatório em kno.${action}` };
      return { ok: true, ast: { verb: 'kno', action, target,
        opts: this.parseOptions(rest.slice(1)), raw }};
    }
    return { ok: false, error: `kno.${action} não suportado` };
  }

  // ── frk.* ─────────────────────────────────────────────────

  _parseFrk(action, rest, raw) {
    if (action === 'create') {
      const name = rest[0];
      if (!name) return { ok: false, error: 'nome obrigatório em frk.create' };
      return { ok: true, ast: { verb: 'frk', action, name,
        opts: this.parseOptions(rest.slice(1)), raw }};
    }
    if (action === 'switch' || action === 'delete' || action === 'merge') {
      const name = rest[0];
      if (!name) return { ok: false, error: `nome obrigatório em frk.${action}` };
      return { ok: true, ast: { verb: 'frk', action, name, raw } };
    }
    if (action === 'list') {
      return { ok: true, ast: { verb: 'frk', action, raw } };
    }
    return { ok: false, error: `frk.${action} não suportado` };
  }

  // ── dif.* ─────────────────────────────────────────────────

  _parseDif(action, rest, raw) {
    if (action === 'export') {
      const a = rest[0];
      const vs = rest[1];
      const b = rest[2];
      const format = rest[3] || 'json';
      return { ok: true, ast: { verb: 'dif', action, a, b, format, raw } };
    }
    const a = action;
    const vs = rest[0];
    const b = rest[1];
    const opts = this.parseOptions(rest.slice(2));
    return { ok: true, ast: { verb: 'dif', action: 'vs', a, b, opts, raw } };
  }

  // ── rul.* ─────────────────────────────────────────────────

  _parseRul(action, rest, raw) {
    if (action === 'add') {
      const name = rest[0];
      if (!name) return { ok: false, error: 'nome obrigatório em rul.add' };
      const onIdx = rest.indexOf('ON:');
      const ifIdx = rest.indexOf('IF:');
      const doIdx = rest.indexOf('DO:');
      if (onIdx < 0 || doIdx < 0) {
        return { ok: false, error: 'rul.add precisa de ON: e DO:' };
      }
      const on = rest[onIdx + 1] || '';
      const ifExpr = ifIdx >= 0 ? rest.slice(ifIdx + 1, doIdx).join(' ') : 'true';
      const doExpr = rest.slice(doIdx + 1).join(' ');
      const opts = {};
      for (let i = 1; i < (onIdx >= 0 ? onIdx : 1); i++) {
        const tok = rest[i];
        const eq = tok.indexOf('=');
        if (eq > 0) opts[tok.slice(0, eq)] = tok.slice(eq + 1);
      }
      return { ok: true, ast: { verb: 'rul', action, name, on, ifExpr, doExpr, opts, raw } };
    }
    if (['list', 'find'].includes(action)) {
      return { ok: true, ast: { verb: 'rul', action, query: rest[0] || null,
        opts: this.parseOptions(rest.slice(1)), raw }};
    }
    if (['show', 'run', 'sim', 'off', 'on', 'del'].includes(action)) {
      const name = rest[0];
      if (!name) return { ok: false, error: `nome obrigatório em rul.${action}` };
      return { ok: true, ast: { verb: 'rul', action, name,
        opts: this.parseOptions(rest.slice(1)), raw }};
    }
    return { ok: false, error: `rul.${action} não suportado` };
  }

  // ── snip.* ────────────────────────────────────────────────

  _parseSnip(action, subtype, rest, raw) {
    if (action === 'create') {
      const trigger = rest[0];
      if (!trigger) return { ok: false, error: 'trigger obrigatório' };
      if (subtype) {
        return { ok: true, ast: { verb: 'snip', action: 'create.' + subtype,
          trigger, opts: this.parseOptions(rest.slice(1)), raw }};
      }
      const body = rest.slice(1).join(' ');
      return { ok: true, ast: { verb: 'snip', action, trigger, body, raw } };
    }
    if (['list', 'tree'].includes(action)) {
      return { ok: true, ast: { verb: 'snip', action, raw } };
    }
    if (['find'].includes(action)) {
      return { ok: true, ast: { verb: 'snip', action, query: rest[0] || '',
        opts: this.parseOptions(rest.slice(1)), raw }};
    }
    if (['rename', 'delete', 'from'].includes(action)) {
      return { ok: true, ast: { verb: 'snip', action, trigger: rest[0], raw } };
    }
    if (action === 'create.template') {
      return { ok: true, ast: { verb: 'snip', action,
        trigger: rest[0], opts: this.parseOptions(rest.slice(1)), raw }};
    }
    return { ok: false, error: `snip.${action} não suportado` };
  }

  // ── exp.* / help.* ────────────────────────────────────────

  _parseExp(action, rest, raw) {
    return { ok: true, ast: { verb: 'exp', action,
      opts: this.parseOptions(rest), raw }};
  }

  _parseHelp(action, rest, raw) {
    return { ok: true, ast: { verb: 'help', action,
      opts: this.parseOptions(rest), raw }};
  }

  // ── diag.* (Fase 4 + Fase 5/6 + Onda 5 + Fase 8) ──────────

  _parseDiag(action, subtype, rest, raw) {
    const opts = this.parseOptions(rest);
    const positional = rest.filter(t => !t.includes('='));
    const st = subtype ?? null;

    switch (action) {
      case 'status':
      case 'on':
      case 'off':
      case 'counts':
      case 'clear':
      case 'snapshot':
      case 'smoke':
      case 'health':
        return { ok: true, ast: { verb: 'diag', action, subtype: st, opts, raw } };

      case 'mode': {
        const value = st || positional[0];
        if (!value) {
          return { ok: false, error: 'uso: diag.mode <off|light|full|dev>' };
        }
        return {
          ok: true,
          ast: { verb: 'diag', action, value, subtype: st, opts, raw },
        };
      }

      case 'flight':
      case 'traces':
      case 'invariants':
      case 'contracts':
      case 'rules': {
        const n = positional[0];
        const next = { ...opts };
        if (n && /^\d+$/.test(n)) next.n = n;
        return {
          ok: true,
          ast: { verb: 'diag', action, subtype: st, opts: next, raw },
        };
      }

      case 'logs': {
        const n = positional[0];
        const level = positional[1];
        const next = { ...opts };
        if (n && /^\d+$/.test(n)) next.n = n;
        if (level && ['debug', 'info', 'warn', 'error'].includes(level)) {
          next.level = level;
        }
        return {
          ok: true,
          ast: { verb: 'diag', action, subtype: st, opts: next, raw },
        };
      }

      case 'rca':
      case 'inject':
      case 'fuzz':
      case 'replay':
      case 'bundle':
      case 'test':
      case 'baseline':
      case 'narrative': {
        const fullPositional = st ? [st, ...positional] : positional;
        return {
          ok: true,
          ast: {
            verb: 'diag',
            action,
            subtype: st,
            opts,
            positional: fullPositional,
            raw,
          },
        };
      }

      default:
        return { ok: false, error: `diag.${action} não suportado` };
    }
  }

  // ── narr.* (Fase 5 — LUME) ────────────────────────────────
  //
  // Fase 13.7 — `'catalog'` adicionado ao VALID (bugfix P0-5).

  _parseNarr(action, subtype, rest, raw) {
    const VALID = [
      'off', 'preview', 'suggest', 'auto',
      'status', 'stats', 'overrides', 'lexicon',
      'catalog',
    ];
    if (!VALID.includes(action)) {
      return { ok: false, error: `narr.${action} não suportado` };
    }
    return {
      ok: true,
      ast: {
        verb: 'narr',
        action,
        subtype: subtype ?? null,
        opts: this.parseOptions(rest),
        raw,
      },
    };
  }

  // ── phr.* (Fase 13 — Hierarquia narrativa) ────────────────

  _parsePhr(action, rest, raw) {
    const opts = this.parseOptions(rest);
    const positional = rest.filter(t => !t.includes('='));

    switch (action) {
      case 'show':
      case 'placeholders': {
        const target = positional[0];
        if (!target) {
          return { ok: false, error: `uso: phr.${action} <target>` };
        }
        return { ok: true, ast: { verb: 'phr', action, target, opts, raw } };
      }

      case 'list': {
        return { ok: true, ast: { verb: 'phr', action, opts, raw } };
      }

      case 'render': {
        const target = positional[0];
        if (!target) {
          return { ok: false, error: 'uso: phr.render <target> [chave=valor ...]' };
        }
        return { ok: true, ast: { verb: 'phr', action, target, opts, raw } };
      }

      case 'find': {
        const query = positional.join(' ').replace(/^["']|["']$/g, '');
        if (!query) {
          return { ok: false, error: 'uso: phr.find "termo"' };
        }
        return { ok: true, ast: { verb: 'phr', action, query, opts, raw } };
      }

      case 'tree': {
        const target = positional[0];
        if (!target) {
          return { ok: false, error: 'uso: phr.tree <target> [depth=N]' };
        }
        return { ok: true, ast: { verb: 'phr', action, target, opts, raw } };
      }

      case 'set': {
        const target = positional[0];
        if (!target) {
          return { ok: false, error: 'uso: phr.set <target> [body=...] [tags=...] [parent=...]' };
        }
        return { ok: true, ast: { verb: 'phr', action, target, opts, raw } };
      }

      default:
        return { ok: false, error: `phr.${action} não suportado` };
    }
  }

  // ── Slash ─────────────────────────────────────────────────

  _parseSlash(line) {
    const t = line.trim();
    const withoutSlash = t.slice(1);
    const parts = withoutSlash.split(/\s+/);
    const cmd = parts[0] || '';
    const args = parts.slice(1);
    return { verb: 'slash', command: cmd, args, raw: line };
  }
}