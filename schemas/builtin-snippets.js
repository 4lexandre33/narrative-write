/**
 * @file builtin-snippets.js
 * @module schemas
 * @description Registra os prefixos de snippet builtin no Registry.
 * @imports — (nenhum)
 * @importedBy boot
 * @level 6
 *
 * Fase 4 — Diagnostics: `diag.` foi adicionado.
 * Onda 6 — Superfície: `diag.test.` e `diag.baseline.` adicionados.
 * Fase 5 — LUME: `narr.` adicionado.
 * Fase 8 — LUME: `diag.narrative.` adicionado.
 * Estágio 10: `catalog` adicionado em `narr.`; seção "Modelo Canônico"
 *             referenciada nos exemplos.
 */

/**
 * Registra os prefixos de snippet builtin.
 * Cada entry declara trigger + tipo + sugestões de subníveis.
 * @param {import('../context-machine/registry.js').Registry} registry
 */
export function registerBuiltinSnippets(registry) {
  if (!registry || typeof registry.defineSnippet !== 'function') {
    throw new Error('[builtin-snippets] registry inválido');
  }

  registry.defineSnippet('ent.', {
    kind: 'menu',
    description: 'Criar, mostrar, listar e apagar entidades',
    subs: ['create.', 'show', 'list', 'delete'],
    examples: ['ent.create.character Kaelin'],
    builtin: true,
  });

  registry.defineSnippet('id.', {
    kind: 'menu',
    description: 'Identidade canônica',
    subs: ['show', 'rename', 'describe', 'retype'],
    examples: ['id.rename Kaelin "Kaelin, o Cinza"'],
    builtin: true,
  });

  registry.defineSnippet('inst.', {
    kind: 'menu',
    description: 'Blueprints, instâncias e herança',
    subs: [
      'mark', 'unmark', 'create', 'destroy', 'list', 'sync',
      'chain', 'resolve', 'reparent', 'unset', 'policy',
    ],
    examples: ['inst.create Goblin'],
    builtin: true,
  });

  registry.defineSnippet('mut.', {
    kind: 'menu',
    description: 'Mutação de dados',
    subs: [
      'add.', 'set.', 'sub.',
      'push.', 'pull.',
      'flag.', 'enum', 'text',
    ],
    examples: ['mut.add.stats Kaelin.fear 3'],
    builtin: true,
  });

  registry.defineSnippet('link.', {
    kind: 'menu',
    description: 'Relações entre entidades',
    subs: ['set.', 'add.', 'pull.', 'clear.', 'where', 'to', 'from', 'tree'],
    examples: ['link.add.inventory Kaelin Selo'],
    builtin: true,
  });

  registry.defineSnippet('que.', {
    kind: 'menu',
    description: 'Consultas temporais',
    subs: ['where.', 'at', 'when', 'timeline', 'knowledge'],
    examples: ['que.at T1 Kaelin.stats'],
    builtin: true,
  });

  registry.defineSnippet('sea.', {
    kind: 'menu',
    description: 'Busca textual com operadores',
    subs: ['find', 'in', 'tag', 'help'],
    examples: [
      'sea.find "kaelin"',
      'sea.find "kaelin,mira"',
      'sea.in Apresentação "ataque"',
      'sea.tag protagonista',
    ],
    builtin: true,
  });

  registry.defineSnippet('at.', {
    kind: 'menu',
    description: 'Estado em um tick (alias)',
    subs: ['show'],
    examples: ['at.show Kaelin at T1'],
    builtin: true,
  });

  registry.defineSnippet('whe.', {
    kind: 'menu',
    description: 'Quando algo aconteceu (alias)',
    subs: ['show'],
    examples: ['whe.show Brasa.location=Kaelin.inventory'],
    builtin: true,
  });

  registry.defineSnippet('tim.', {
    kind: 'menu',
    description: 'Histórico de atributo/regra',
    subs: ['show', 'rule'],
    examples: ['tim.show Kaelin.fear'],
    builtin: true,
  });

  registry.defineSnippet('aud.', {
    kind: 'menu',
    description: 'Auditoria',
    subs: [
      'links', 'identities', 'instances',
      'continuity', 'references', 'rules', 'snippets',
    ],
    examples: ['aud.links'],
    builtin: true,
  });

  registry.defineSnippet('kno.', {
    kind: 'menu',
    description: 'Conhecimento',
    subs: ['learn', 'forget', 'show', 'at'],
    examples: ['kno.learn Mira "traicao revelada"'],
    builtin: true,
  });

  registry.defineSnippet('frk.', {
    kind: 'menu',
    description: 'Forks de timeline',
    subs: ['create', 'switch', 'list', 'delete', 'merge'],
    examples: ['frk.create alt at T22'],
    builtin: true,
  });

  registry.defineSnippet('dif.', {
    kind: 'menu',
    description: 'Diff entre timelines',
    subs: ['vs', 'at', 'entity', 'range', 'export'],
    examples: ['dif.main vs alt'],
    builtin: true,
  });

  registry.defineSnippet('rul.', {
    kind: 'menu',
    description: 'Regras',
    subs: ['add', 'list', 'find', 'show', 'run', 'sim', 'off', 'on', 'del'],
    examples: ['rul.list'],
    builtin: true,
  });

  registry.defineSnippet('snip.', {
    kind: 'menu',
    description: 'Snippets',
    subs: [
      'create', 'create.template', 'create.menu', 'create.command',
      'find', 'list', 'tree', 'rename', 'delete',
    ],
    examples: ['snip.create per. "personagem"'],
    builtin: true,
  });

  registry.defineSnippet('exp.', {
    kind: 'menu',
    description: 'Exportação',
    subs: ['pdf', 'json', 'csv', 'snippets', 'all'],
    examples: ['exp.all'],
    builtin: true,
  });

  registry.defineSnippet('help.', {
    kind: 'menu',
    description: 'Ajuda',
    subs: ['commands', 'snippets', 'components', 'cheatsheet', 'tutorial'],
    examples: ['help.cheatsheet'],
    builtin: true,
  });

  // ── diag.* (Fase 4 + Onda 6 + Fase 8) ──────────────────────

  registry.defineSnippet('diag.', {
    kind: 'menu',
    description: 'Diagnóstico interno — eventos, logs, invariantes, saúde',
    subs: [
      'status', 'on', 'off', 'mode',
      'flight', 'counts', 'logs', 'traces',
      'invariants', 'contracts', 'health', 'rules',
      'smoke', 'snapshot', 'clear',
      'rca', 'inject', 'fuzz', 'replay', 'bundle',
      'test', 'baseline',
      'narrative',
    ],
    examples: [
      'diag.status',
      'diag.mode full',
      'diag.flight 50',
      'diag.counts',
      'diag.invariants',
      'diag.health',
      'diag.snapshot',
      'diag.test full',
      'diag.baseline list',
      'diag.narrative.recent',
      'diag.narrative.why',
    ],
    builtin: true,
  });

  registry.defineSnippet('diag.test.', {
    kind: 'menu',
    description: 'Bateria de testes automáticos — presets e fases',
    subs: ['full', 'fast', 'minimal', 'scenarios', 'fuzz', 'replay', 'regression'],
    examples: [
      'diag.test.full',
      'diag.test.fast',
      'diag.test fuzz seed=99 iterations=200',
      'diag.test scenarios,fuzz',
    ],
    builtin: true,
  });

  registry.defineSnippet('diag.baseline.', {
    kind: 'menu',
    description: 'Baselines de regressão — captura e comparação',
    subs: ['list', 'capture', 'compare', 'delete', 'clear', 'stats'],
    examples: [
      'diag.baseline list',
      'diag.baseline capture before-refactor',
      'diag.baseline compare before-refactor',
    ],
    builtin: true,
  });

  registry.defineSnippet('diag.narrative.', {
    kind: 'menu',
    description: 'Diagnóstico do subsistema narrativo — atos, trace, overrides, lexicon',
    subs: ['recent', 'why', 'stats', 'overrides', 'lexicon', 'replay', 'clear', 'help'],
    examples: [
      'diag.narrative.recent 10',
      'diag.narrative.why act-s1-1',
      'diag.narrative.stats',
      'diag.narrative.overrides',
      'diag.narrative.lexicon',
      'diag.narrative.replay act-s1-1',
      'diag.narrative.help',
    ],
    builtin: true,
  });

  // ── narr.* (Fase 5 + Estágio 10) ───────────────────────────

  registry.defineSnippet('narr.', {
    kind: 'menu',
    description: 'Modo narrativo — interpretação de prosa em português',
    subs: [
      'off', 'preview', 'suggest', 'auto',
      'status', 'stats', 'overrides', 'lexicon',
      'catalog',
    ],
    examples: [
      'narr.preview',
      'narr.auto',
      'narr.status',
      'narr.overrides',
      'narr.lexicon',
      'narr.catalog',
    ],
    builtin: true,
  });

  return registry;
}