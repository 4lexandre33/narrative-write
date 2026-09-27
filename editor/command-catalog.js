/**
 * @file command-catalog.js
 * @module editor
 * @description Catálogo completo de comandos para autocomplete hierárquico.
 *              Cada comando tem:
 *                - actions: { nome: { desc, postInsert, argKind? } }
 *                - subactions: { nome: { desc, actions: {...} } }
 *
 * `postInsert`:
 *   ''  → 'narr.off'   (sem espaço)
 *   ' ' → 'phr.show '  (com espaço)
 *   '.' → 'link.set.'  (usuário continua digitando)
 *
 * `argKind`:
 *   'hierarchy' → após espaço, sugere packages raiz
 *   'text'      → texto livre (sem sugestão)
 *   'none'      → sem argumento
 *
 * @imports core/constants
 * @importedBy editor/lexer
 * @level 11
 */

import { ENTITY_TYPES, ENTITY_TYPE_LABEL } from '../core/constants.js';

// ══════════════════════════════════════════════════════════════
// SUBTIPOS DE ENTIDADE
// ══════════════════════════════════════════════════════════════

const _entitySubtypes = {};
for (const t of ENTITY_TYPES) {
  _entitySubtypes[t] = {
    desc: ENTITY_TYPE_LABEL[t] || t,
    postInsert: ' ',
  };
}

// ══════════════════════════════════════════════════════════════
// CATÁLOGO
// ══════════════════════════════════════════════════════════════

export const COMMAND_CATALOG = Object.freeze({

  // ── ent.* ─────────────────────────────────────────────────
  ent: {
    desc: 'Entidades',
    actions: {
      show:   { desc: 'Mostra entidade', postInsert: ' ', argKind: 'hierarchy' },
      list:   { desc: 'Lista entidades', postInsert: ' ', argKind: 'none' },
      delete: { desc: 'Apaga entidade', postInsert: ' ', argKind: 'hierarchy' },
    },
    subactions: {
      create: {
        desc: 'Criar entidade',
        actions: _entitySubtypes,
      },
    },
  },

  // ── id.* ──────────────────────────────────────────────────
  id: {
    desc: 'Identidade',
    actions: {
      show:     { desc: 'Mostra identidade', postInsert: ' ', argKind: 'none' },
      rename:   { desc: 'Renomeia', postInsert: ' ', argKind: 'none' },
      describe: { desc: 'Descreve', postInsert: ' ', argKind: 'none' },
      retype:   { desc: 'Muda tipo', postInsert: ' ', argKind: 'none' },
    },
  },

  // ── inst.* ────────────────────────────────────────────────
  inst: {
    desc: 'Instanciação e herança',
    actions: {
      mark:     { desc: 'Marca como blueprint', postInsert: ' ', argKind: 'none' },
      unmark:   { desc: 'Desmarca blueprint', postInsert: ' ', argKind: 'none' },
      create:   { desc: 'Cria instância', postInsert: ' ', argKind: 'none' },
      destroy:  { desc: 'Apaga instância', postInsert: ' ', argKind: 'none' },
      list:     { desc: 'Lista instâncias', postInsert: ' ', argKind: 'none' },
      sync:     { desc: 'Sincroniza com blueprint', postInsert: ' ', argKind: 'none' },
      chain:    { desc: 'Cadeia de herança', postInsert: ' ', argKind: 'none' },
      resolve:  { desc: 'Resolve herança', postInsert: ' ', argKind: 'none' },
      reparent: { desc: 'Muda parent', postInsert: ' ', argKind: 'none' },
      unset:    { desc: 'Remove campo (tombstone)', postInsert: ' ', argKind: 'none' },
      policy:   { desc: 'Define política de merge', postInsert: ' ', argKind: 'none' },
    },
  },

  // ── mut.* ─────────────────────────────────────────────────
  mut: {
    desc: 'Mutação',
    actions: {
      'add.stats':  { desc: 'Soma stat', postInsert: ' ', argKind: 'none' },
      'set.stats':  { desc: 'Define stat', postInsert: ' ', argKind: 'none' },
      'sub.stats':  { desc: 'Subtrai stat', postInsert: ' ', argKind: 'none' },
      'push.list':  { desc: 'Adiciona à lista', postInsert: ' ', argKind: 'none' },
      'pull.list':  { desc: 'Remove da lista', postInsert: ' ', argKind: 'none' },
      'flag.on':    { desc: 'Liga flag', postInsert: ' ', argKind: 'none' },
      'flag.off':   { desc: 'Desliga flag', postInsert: ' ', argKind: 'none' },
      'enum':       { desc: 'Define enum', postInsert: ' ', argKind: 'none' },
      'text':       { desc: 'Define texto', postInsert: ' ', argKind: 'none' },
    },
  },

  // ── link.* ────────────────────────────────────────────────
  link: {
    desc: 'Relações entre entidades',
    actions: {
      set:   { desc: 'Substitui relação', postInsert: '.', argKind: 'none' },
      add:   { desc: 'Adiciona relação', postInsert: '.', argKind: 'none' },
      pull:  { desc: 'Remove relação', postInsert: '.', argKind: 'none' },
      clear: { desc: 'Limpa relação', postInsert: '.', argKind: 'none' },
      where: { desc: 'Lista links da entidade', postInsert: ' ', argKind: 'none' },
      to:    { desc: 'Links por relação (<from>.<rel>)', postInsert: ' ', argKind: 'none' },
      from:  { desc: 'Quem aponta para', postInsert: ' ', argKind: 'none' },
      tree:  { desc: 'Árvore de links', postInsert: ' ', argKind: 'none' },
    },
  },

  // ── que.* ─────────────────────────────────────────────────
  que: {
    desc: 'Consultas',
    actions: {
      where:     { desc: 'Onde algo está', postInsert: ' ', argKind: 'none' },
      at:        { desc: 'Estado em tick', postInsert: ' ', argKind: 'none' },
      when:      { desc: 'Quando aconteceu (path=valor)', postInsert: ' ', argKind: 'none' },
      timeline:  { desc: 'Histórico de atributo', postInsert: ' ', argKind: 'none' },
      knowledge: { desc: 'Conhecimento em tick', postInsert: ' ', argKind: 'none' },
    },
  },

  // ── sea.* ─────────────────────────────────────────────────
  sea: {
    desc: 'Busca textual',
    actions: {
      find: { desc: 'Busca global', postInsert: ' ', argKind: 'text' },
      in:   { desc: 'Busca em categoria', postInsert: ' ', argKind: 'text' },
      tag:  { desc: 'Lista com tag', postInsert: ' ', argKind: 'text' },
      help: { desc: 'Ajuda de busca', postInsert: '', argKind: 'none' },
    },
  },

  // ── at.* ──────────────────────────────────────────────────
  at: {
    desc: 'Alias de que.at',
    actions: {
      show: { desc: 'Estado em tick', postInsert: ' ', argKind: 'none' },
    },
  },

  // ── whe.* ─────────────────────────────────────────────────
  whe: {
    desc: 'Alias de que.when',
    actions: {
      show: { desc: 'Quando aconteceu', postInsert: ' ', argKind: 'none' },
    },
  },

  // ── tim.* ─────────────────────────────────────────────────
  tim: {
    desc: 'Timeline de atributo',
    actions: {
      show: { desc: 'Histórico', postInsert: ' ', argKind: 'none' },
      rule: { desc: 'Histórico de regra', postInsert: ' ', argKind: 'none' },
    },
  },

  // ── aud.* ─────────────────────────────────────────────────
  aud: {
    desc: 'Auditoria',
    actions: {
      links:      { desc: 'Links órfãos', postInsert: '', argKind: 'none' },
      identities: { desc: 'Identidades duplicadas', postInsert: '', argKind: 'none' },
      instances:  { desc: 'Instâncias órfãs', postInsert: '', argKind: 'none' },
      continuity: { desc: 'Continuidade', postInsert: '', argKind: 'none' },
      references: { desc: 'Referências', postInsert: '', argKind: 'none' },
      rules:      { desc: 'Regras nunca disparadas', postInsert: '', argKind: 'none' },
      snippets:   { desc: 'Snippets', postInsert: '', argKind: 'none' },
    },
  },

  // ── kno.* ─────────────────────────────────────────────────
  kno: {
    desc: 'Conhecimento',
    actions: {
      learn:  { desc: 'Aprende fato', postInsert: ' ', argKind: 'none' },
      forget: { desc: 'Esquece fato', postInsert: ' ', argKind: 'none' },
      show:   { desc: 'Mostra o que sabe', postInsert: ' ', argKind: 'none' },
      at:     { desc: 'Sabia em tick', postInsert: ' ', argKind: 'none' },
    },
  },

  // ── frk.* ─────────────────────────────────────────────────
  frk: {
    desc: 'Forks de timeline',
    actions: {
      create: { desc: 'Cria timeline', postInsert: ' ', argKind: 'none' },
      switch: { desc: 'Troca de timeline', postInsert: ' ', argKind: 'none' },
      list:   { desc: 'Lista timelines', postInsert: '', argKind: 'none' },
      delete: { desc: 'Apaga timeline', postInsert: ' ', argKind: 'none' },
      merge:  { desc: 'Merge de timelines', postInsert: ' ', argKind: 'none' },
    },
  },

  // ── dif.* ─────────────────────────────────────────────────
  dif: {
    desc: 'Diff de timelines',
    actions: {
      vs:     { desc: 'Diff entre timelines', postInsert: ' ', argKind: 'none' },
      at:     { desc: 'Diff em tick', postInsert: ' ', argKind: 'none' },
      entity: { desc: 'Diff por entidade', postInsert: ' ', argKind: 'none' },
      range:  { desc: 'Diff por faixa', postInsert: ' ', argKind: 'none' },
      export: { desc: 'Exportar diff', postInsert: ' ', argKind: 'none' },
    },
  },

  // ── rul.* ─────────────────────────────────────────────────
  rul: {
    desc: 'Regras',
    actions: {
      add:  { desc: 'Declara (ON: ... DO: ...)', postInsert: ' ', argKind: 'none' },
      list: { desc: 'Lista regras', postInsert: '', argKind: 'none' },
      find: { desc: 'Busca regras', postInsert: ' ', argKind: 'text' },
      show: { desc: 'Mostra regra', postInsert: ' ', argKind: 'text' },
      run:  { desc: 'Executa manualmente', postInsert: ' ', argKind: 'text' },
      sim:  { desc: 'Simula (dry-run)', postInsert: ' ', argKind: 'text' },
      off:  { desc: 'Suspende regra', postInsert: ' ', argKind: 'text' },
      on:   { desc: 'Reativa regra', postInsert: ' ', argKind: 'text' },
      del:  { desc: 'Apaga regra', postInsert: ' ', argKind: 'text' },
    },
  },

  // ── snip.* ────────────────────────────────────────────────
  snip: {
    desc: 'Snippets e templates',
    actions: {
      find:   { desc: 'Busca snippets', postInsert: ' ', argKind: 'text' },
      list:   { desc: 'Lista snippets', postInsert: '', argKind: 'none' },
      tree:   { desc: 'Árvore de snippets', postInsert: '', argKind: 'none' },
      rename: { desc: 'Renomeia', postInsert: ' ', argKind: 'text' },
      delete: { desc: 'Apaga snippet', postInsert: ' ', argKind: 'text' },
      from:   { desc: 'Cria a partir de', postInsert: ' ', argKind: 'text' },
    },
    subactions: {
      create: {
        desc: 'Criar snippet',
        actions: {
          'text':     { desc: 'Snippet de texto', postInsert: ' ', argKind: 'none' },
          'template': { desc: 'Snippet com placeholders', postInsert: ' ', argKind: 'none' },
          'menu':     { desc: 'Snippet de menu', postInsert: ' ', argKind: 'none' },
          'command':  { desc: 'Snippet de comando', postInsert: ' ', argKind: 'none' },
        },
      },
    },
  },

  // ── exp.* ─────────────────────────────────────────────────
  exp: {
    desc: 'Exportação',
    actions: {
      pdf:      { desc: 'Exporta para impressão (HTML)', postInsert: '', argKind: 'none' },
      json:     { desc: 'Exporta mundo em JSON', postInsert: '', argKind: 'none' },
      csv:      { desc: 'Exporta mundo em CSV', postInsert: '', argKind: 'none' },
      snippets: { desc: 'Exporta só snippets', postInsert: '', argKind: 'none' },
      all:      { desc: 'Exporta tudo', postInsert: '', argKind: 'none' },
    },
  },

  // ── help.* ────────────────────────────────────────────────
  help: {
    desc: 'Ajuda',
    actions: {
      commands:   { desc: 'Lista comandos', postInsert: '', argKind: 'none' },
      snippets:   { desc: 'Lista snippets', postInsert: '', argKind: 'none' },
      components: { desc: 'Lista componentes', postInsert: '', argKind: 'none' },
      cheatsheet: { desc: 'Cheatsheet rápido', postInsert: '', argKind: 'none' },
      tutorial:   { desc: 'Tutorial guiado', postInsert: '', argKind: 'none' },
    },
  },

  // ── diag.* ────────────────────────────────────────────────
  diag: {
    desc: 'Diagnóstico',
    actions: {
      status:     { desc: 'Status da suíte', postInsert: '', argKind: 'none' },
      on:         { desc: 'Liga captura', postInsert: '', argKind: 'none' },
      off:        { desc: 'Desliga captura', postInsert: '', argKind: 'none' },
      flight:     { desc: 'Últimos N eventos', postInsert: ' ', argKind: 'none' },
      counts:     { desc: 'Contagens por evento', postInsert: '', argKind: 'none' },
      logs:       { desc: 'Últimos logs', postInsert: ' ', argKind: 'none' },
      traces:     { desc: 'Últimas traces', postInsert: ' ', argKind: 'none' },
      invariants: { desc: 'Violações de invariante', postInsert: ' ', argKind: 'none' },
      contracts:  { desc: 'Violações de contrato', postInsert: ' ', argKind: 'none' },
      health:     { desc: 'Sondas de saúde', postInsert: '', argKind: 'none' },
      rules:      { desc: 'Regras recentes', postInsert: ' ', argKind: 'none' },
      smoke:      { desc: 'Smoke tests', postInsert: '', argKind: 'none' },
      snapshot:   { desc: 'Dump completo do estado', postInsert: '', argKind: 'none' },
      clear:      { desc: 'Limpa buffers', postInsert: '', argKind: 'none' },
      rca:        { desc: 'Análise causal do último erro', postInsert: ' ', argKind: 'none' },
      inject:     { desc: 'Injeta falha', postInsert: ' ', argKind: 'none' },
      fuzz:       { desc: 'Fuzzing determinístico', postInsert: ' ', argKind: 'none' },
      replay:     { desc: 'Replay de sessão', postInsert: ' ', argKind: 'none' },
      bundle:     { desc: 'Bundle para IA', postInsert: ' ', argKind: 'none' },
    },
    subactions: {
      narrative: {
        desc: 'Subsistema narrativo',
        actions: {
          recent:    { desc: 'Atos recentes', postInsert: ' ', argKind: 'none' },
          why:       { desc: 'Trace de um ato', postInsert: ' ', argKind: 'none' },
          stats:     { desc: 'Estatísticas', postInsert: '', argKind: 'none' },
          overrides: { desc: 'Overrides do autor', postInsert: '', argKind: 'none' },
          lexicon:   { desc: 'Léxico aprendido', postInsert: '', argKind: 'none' },
          replay:    { desc: 'Replay de act', postInsert: ' ', argKind: 'none' },
          clear:     { desc: 'Limpa cache', postInsert: '', argKind: 'none' },
          help:      { desc: 'Ajuda', postInsert: '', argKind: 'none' },
        },
      },
      test: {
        desc: 'Bateria de testes',
        actions: {
          full:       { desc: 'Todas as fases', postInsert: '', argKind: 'none' },
          fast:       { desc: 'Fases rápidas', postInsert: '', argKind: 'none' },
          minimal:    { desc: 'Só smoke', postInsert: '', argKind: 'none' },
          scenarios:  { desc: 'Só cenários', postInsert: '', argKind: 'none' },
          fuzz:       { desc: 'Só fuzzing', postInsert: ' ', argKind: 'none' },
          replay:     { desc: 'Só replay', postInsert: '', argKind: 'none' },
          regression: { desc: 'Só regressão', postInsert: '', argKind: 'none' },
        },
      },
      baseline: {
        desc: 'Baselines de regressão',
        actions: {
          list:    { desc: 'Lista baselines', postInsert: '', argKind: 'none' },
          capture: { desc: 'Captura baseline', postInsert: ' ', argKind: 'text' },
          compare: { desc: 'Compara com baseline', postInsert: ' ', argKind: 'text' },
          delete:  { desc: 'Apaga baseline', postInsert: ' ', argKind: 'text' },
          clear:   { desc: 'Apaga todos', postInsert: '', argKind: 'none' },
          stats:   { desc: 'Estatísticas', postInsert: '', argKind: 'none' },
        },
      },
      mode: {
        desc: 'Modo de diagnóstico',
        actions: {
          off:   { desc: 'Desligado', postInsert: '', argKind: 'none' },
          light: { desc: 'Modo leve', postInsert: '', argKind: 'none' },
          full:  { desc: 'Modo completo', postInsert: '', argKind: 'none' },
          dev:   { desc: 'Modo dev', postInsert: '', argKind: 'none' },
        },
      },
    },
  },

  // ── narr.* ────────────────────────────────────────────────
  narr: {
    desc: 'Narrativa natural PT-BR',
    actions: {
      off:       { desc: 'Desativa', postInsert: '', argKind: 'none' },
      preview:   { desc: 'Preview (análise sem mutação)', postInsert: '', argKind: 'none' },
      suggest:   { desc: 'Suggest (aprovação manual)', postInsert: '', argKind: 'none' },
      auto:      { desc: 'Auto (aplicação automática)', postInsert: '', argKind: 'none' },
      status:    { desc: 'Status do sistema narrativo', postInsert: '', argKind: 'none' },
      stats:     { desc: 'Estatísticas de análise', postInsert: '', argKind: 'none' },
      overrides: { desc: 'Overrides de referência', postInsert: '', argKind: 'none' },
      lexicon:   { desc: 'Léxico aprendido', postInsert: '', argKind: 'none' },
    },
  },

  // ── phr.* ─────────────────────────────────────────────────
  phr: {
    desc: 'Frases da hierarquia narrativa',
    actions: {
      show:         { desc: 'Exibe uma frase', postInsert: ' ', argKind: 'hierarchy' },
      list:         { desc: 'Lista frases (opcional: parent=)', postInsert: ' ', argKind: 'hierarchy' },
      render:       { desc: 'Interpola placeholders', postInsert: ' ', argKind: 'hierarchy' },
      find:         { desc: 'Busca por texto', postInsert: ' ', argKind: 'text' },
      tree:         { desc: 'Árvore da hierarquia', postInsert: ' ', argKind: 'hierarchy' },
      placeholders: { desc: 'Lista placeholders', postInsert: ' ', argKind: 'hierarchy' },
      set:          { desc: 'Edita campos (body=, tags=, parent=)', postInsert: ' ', argKind: 'hierarchy' },
    },
  },

});

// ══════════════════════════════════════════════════════════════
// CONSTRUÇÃO DE SUGESTÕES
// ══════════════════════════════════════════════════════════════

/**
 * Constrói um item de menu para uma ação.
 * @private
 */
function _actionItem(verbPrefix, actionName, spec) {
  const post = spec.postInsert ?? ' ';
  return {
    trigger: actionName,
    type: null,
    source: 'command',
    shortId: null,
    body: `${verbPrefix}.${actionName}${post}`,
    hasChildren: false,
    description: spec.desc || '',
  };
}

/**
 * Constrói um item de menu para uma subação (namespace navegável).
 * @private
 */
function _subactionItem(verb, subName, spec) {
  return {
    trigger: subName,
    type: null,
    source: 'command',
    shortId: null,
    body: `${verb}.${subName}.`,
    hasChildren: true,
    description: spec.desc || '',
  };
}

/**
 * Gera sugestões para um contexto de comando.
 *
 * @param {string} verb
 * @param {string|null} maybeSubaction — nome do possível namespace (ex: 'narrative')
 * @param {string} partial — filtro digitado
 * @returns {Array}
 */
export function buildCommandSuggestions(verb, maybeSubaction, partial) {
  const cat = COMMAND_CATALOG[verb];
  if (!cat) return [];

  const items = [];
  const p = String(partial ?? '');

  if (maybeSubaction) {
    const sub = cat.subactions?.[maybeSubaction];
    if (sub) {
      const prefix = `${verb}.${maybeSubaction}`;
      for (const [name, spec] of Object.entries(sub.actions || {})) {
        if (!name.startsWith(p)) continue;
        items.push(_actionItem(prefix, name, spec));
      }
      return items;
    }
    // Fallback: action names com pontos (ex: mut.add.stats)
    const full = `${maybeSubaction}.${p}`;
    for (const [name, spec] of Object.entries(cat.actions || {})) {
      if (!name.startsWith(full)) continue;
      items.push(_actionItem(verb, name, spec));
    }
    return items;
  }

  // Top-level: actions + subactions
  for (const [name, spec] of Object.entries(cat.actions || {})) {
    if (!name.startsWith(p)) continue;
    items.push(_actionItem(verb, name, spec));
  }
  for (const [name, spec] of Object.entries(cat.subactions || {})) {
    if (!name.startsWith(p)) continue;
    items.push(_subactionItem(verb, name, spec));
  }
  return items;
}

// ══════════════════════════════════════════════════════════════
// CONSULTAS
// ══════════════════════════════════════════════════════════════

/**
 * Devolve a spec de uma ação, ou null.
 * @param {string} verb
 * @param {string} action
 * @returns {Object|null}
 */
export function getActionSpec(verb, action) {
  const cat = COMMAND_CATALOG[verb];
  if (!cat) return null;
  if (cat.actions?.[action]) return cat.actions[action];
  // Procura em subactions
  for (const sub of Object.values(cat.subactions || {})) {
    if (sub.actions?.[action]) return sub.actions[action];
  }
  return null;
}

/**
 * Verifica se uma ação aceita sugestões hierárquicas.
 * @param {string} verb
 * @param {string} action
 * @returns {boolean}
 */
export function isHierarchyArg(verb, action) {
  const spec = getActionSpec(verb, action);
  return spec?.argKind === 'hierarchy';
}

/**
 * Lista todos os verbos no catálogo.
 * @returns {string[]}
 */
export function listVerbs() {
  return Object.keys(COMMAND_CATALOG).sort();
}

/**
 * Estatísticas do catálogo.
 * @returns {Object}
 */
export function catalogStats() {
  let totalActions = 0;
  let totalSubactions = 0;
  for (const cat of Object.values(COMMAND_CATALOG)) {
    totalActions += Object.keys(cat.actions || {}).length;
    totalSubactions += Object.keys(cat.subactions || {}).length;
  }
  return {
    verbs: Object.keys(COMMAND_CATALOG).length,
    totalActions,
    totalSubactions,
  };
}