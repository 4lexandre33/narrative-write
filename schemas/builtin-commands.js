/**
 * @file builtin-commands.js
 * @module schemas
 * @description Registra metadata dos verbos builtin no Registry do Context Machine.
 * @imports — (nenhum)
 * @importedBy boot
 * @level 6
 *
 * Fase 4 — Diagnostics: adicionado `'diag'`.
 * Onda 6 — Superfície: `'test'` e `'baseline'` adicionados aos subverbs de `diag`.
 * Fase 5 — LUME: adicionado `'narr'`.
 * Fase 8 — LUME: adicionado `'narrative'` aos subverbs de `diag`.
 * Estágio 10 — adicionado `'catalog'` aos subverbs de `narr`.
 *
 * Fase 13.7 — Stubs → Funcionalidades (auditoria 25/09/2026):
 *   `exp.md`, `exp.markdown` e `exp.html` já eram aceitos pelo
 *   `ExportSystem._build()` (aliases de `exp.pdf` para Markdown e HTML
 *   respectivamente), mas não constavam na metadata do comando. Agora
 *   estão documentados e aparecem no autocomplete.
 */

/**
 * Registra todos os verbos builtin.
 * @param {import('../context-machine/registry.js').Registry} registry
 */
export function registerBuiltinCommands(registry) {
  if (!registry || typeof registry.defineCommand !== 'function') {
    throw new Error('[builtin-commands] registry inválido');
  }

  registry.defineCommand('ent', {
    description: 'Cria, mostra, lista e apaga entidades',
    subverbs: ['create', 'show', 'list', 'delete'],
    examples: [
      'ent.create.character Kaelin faction=Ordem courage=5',
      'ent.show Kaelin',
      'ent.list character',
      'ent.delete Selo',
    ],
    builtin: true,
  });

  registry.defineCommand('id', {
    description: 'Gerencia identidade canônica (id, name, description, type)',
    subverbs: ['show', 'rename', 'describe', 'retype'],
    examples: [
      'id.show Kaelin',
      'id.rename Kaelin "Kaelin, o Cinza"',
      'id.describe Kaelin "Guerreiro marcado por Cinza."',
      'id.retype Selo item',
    ],
    builtin: true,
  });

  registry.defineCommand('inst', {
    description: 'Blueprints, instâncias, herança e política de merge',
    subverbs: [
      'mark', 'unmark', 'create', 'destroy', 'list', 'sync',
      'chain', 'resolve', 'reparent', 'unset', 'policy',
    ],
    examples: [
      'inst.mark Goblin',
      'inst.create Goblin',
      'inst.create Goblin goblin_chefe stats.hp=25',
      'inst.sync Goblin',
      'inst.chain goblin_chefe',
      'inst.resolve goblin_chefe',
      'inst.reparent Goblin derives=Humanoide',
      'inst.unset goblin_1 stats.hp',
      'inst.policy Goblin stats=additive',
    ],
    builtin: true,
  });

  registry.defineCommand('mut', {
    description: 'Muta dados: stats, flags, enums, texts, lists',
    subverbs: [
      'add.stats', 'set.stats', 'sub.stats',
      'push.list', 'pull.list',
      'flag.on', 'flag.off',
      'enum', 'text',
    ],
    examples: [
      'mut.add.stats Kaelin.fear 3',
      'mut.set.stats Kaelin.fear 10',
      'mut.sub.stats Kaelin.fear 2',
      'mut.push.list Kaelin.inventory Selo',
      'mut.pull.list Kaelin.inventory Brasa',
      'mut.flag.on Kaelin alive',
      'mut.flag.off Kaelin wounded',
      'mut.enum Kaelin.role soldado',
      'mut.text Kaelin.bio "um guerreiro cansado"',
    ],
    builtin: true,
  });

  registry.defineCommand('link', {
    description: 'Conecta e consulta entidades por arestas nomeadas',
    subverbs: [
      'set', 'add', 'pull', 'clear',
      'where', 'to', 'from', 'tree',
    ],
    examples: [
      'link.set.location Kaelin Cinza',
      'link.add.inventory Kaelin Selo',
      'link.pull.inventory Kaelin Brasa',
      'link.clear.sworn_to Kaelin',
      'link.where Kaelin',
      'link.to Kaelin.inventory',
      'link.from Selo',
      'link.tree Kaelin depth=3',
    ],
    builtin: true,
  });

  registry.defineCommand('que', {
    description: 'Consultas temporais e de estado',
    subverbs: ['where', 'at', 'when', 'timeline', 'knowledge'],
    examples: [
      'que.where.inventory Kaelin',
      'que.at T1 Kaelin.stats',
      'que.when Brasa.location=Kaelin.inventory',
      'que.timeline Kaelin.fear',
      'que.knowledge Mira at T40',
    ],
    builtin: true,
  });

  registry.defineCommand('sea', {
    description: 'Busca textual com operadores (AND, OR, NOT, frase, near)',
    subverbs: ['find', 'in', 'tag', 'help'],
    examples: [
      'sea.find "kaelin"',
      'sea.find "kaelin,mira"',
      'sea.find "kaelin/cinza"',
      'sea.find "\'frase exata\'"',
      'sea.in Apresentação "ataque"',
      'sea.tag protagonista',
      'sea.help',
    ],
    builtin: true,
  });

  registry.defineCommand('at', {
    description: 'Alias curto para que.at — estado em um tick',
    subverbs: ['show'],
    examples: ['at.show Kaelin at T1'],
    builtin: true,
  });

  registry.defineCommand('whe', {
    description: 'Alias curto para que.when — quando algo aconteceu',
    subverbs: ['show'],
    examples: ['whe.show Brasa.location=Kaelin.inventory'],
    builtin: true,
  });

  registry.defineCommand('tim', {
    description: 'Alias curto para que.timeline — histórico de atributo/regra',
    subverbs: ['show', 'rule'],
    examples: [
      'tim.show Kaelin.fear',
      'tim.rule "goblins temem Kaelin"',
    ],
    builtin: true,
  });

  registry.defineCommand('aud', {
    description: 'Auditoria de coerência do mundo e do vocabulário',
    subverbs: [
      'links', 'identities', 'instances',
      'continuity', 'references', 'rules', 'snippets',
    ],
    examples: [
      'aud.links',
      'aud.identities',
      'aud.instances',
      'aud.continuity',
      'aud.references',
      'aud.rules',
      'aud.snippets',
    ],
    builtin: true,
  });

  registry.defineCommand('kno', {
    description: 'Conhecimento — o que cada personagem sabe',
    subverbs: ['learn', 'forget', 'show', 'at'],
    examples: [
      'kno.learn Mira "traicao revelada"',
      'kno.forget Mira "traicao revelada"',
      'kno.show Mira',
      'kno.at Mira T40',
    ],
    builtin: true,
  });

  registry.defineCommand('frk', {
    description: 'Forks de timeline — ramificações narrativas',
    subverbs: ['create', 'switch', 'list', 'delete', 'merge'],
    examples: [
      'frk.create alt_mira_morta at T22',
      'frk.switch main',
      'frk.list',
      'frk.delete alt_mira_morta',
      'frk.merge alt_mira_morta',
    ],
    builtin: true,
  });

  registry.defineCommand('dif', {
    description: 'Diff entre timelines ou entre ticks',
    subverbs: ['vs', 'at', 'entity', 'range', 'export'],
    examples: [
      'dif.main vs alt_mira_morta',
      'dif.main vs alt at T40',
      'dif.main vs alt entity Kaelin',
      'dif.main vs alt range T20..T40',
      'dif.at main alt T30',
      'dif.entity main alt Kaelin',
      'dif.range main alt T10..T50',
      'dif.export main vs alt json',
      'dif.export main vs alt csv',
      'dif.export main vs alt md',
    ],
    builtin: true,
  });

  registry.defineCommand('rul', {
    description: 'Regras — automáticas e manuais',
    subverbs: [
      'add', 'list', 'find', 'show', 'run', 'sim', 'off', 'on', 'del',
    ],
    examples: [
      'rul.add "goblins temem Kaelin" ON: Goblin IF: ... DO: ...',
      'rul.list',
      'rul.find "loot"',
      'rul.run "goblins temem Kaelin"',
      'rul.sim "goblins temem Kaelin"',
      'rul.off "goblins temem Kaelin"',
      'rul.on "goblins temem Kaelin"',
      'rul.del "goblins temem Kaelin"',
    ],
    builtin: true,
  });

  registry.defineCommand('snip', {
    description: 'Snippets, templates e macros',
    subverbs: [
      'create', 'create.template', 'create.menu', 'create.command',
      'find', 'list', 'tree', 'rename', 'delete', 'from',
    ],
    examples: [
      'snip.create per. "personagem principal"',
      'snip.create.template pers.cena body="{personagem} entrou em {local}"',
      'snip.create.menu per. opts="kaelin:Kaelin mira:Mira"',
      'snip.create.command cena.luta runs="mut.add.{alvo}.stats.fear 3"',
      'snip.find "loot"',
      'snip.list',
      'snip.tree',
      'snip.delete per.cena',
    ],
    builtin: true,
  });

  registry.defineCommand('exp', {
    description: 'Exportação de prosa, timeline, mundo e vocabulário',
    subverbs: ['pdf', 'html', 'md', 'markdown', 'json', 'csv', 'snippets', 'all'],
    examples: [
      'exp.pdf',
      'exp.html',
      'exp.md',
      'exp.markdown',
      'exp.json',
      'exp.csv',
      'exp.snippets',
      'exp.all',
    ],
    builtin: true,
  });

  registry.defineCommand('help', {
    description: 'Ajuda integrada — comandos, snippets, componentes, tutorial',
    subverbs: ['commands', 'snippets', 'components', 'cheatsheet', 'tutorial'],
    examples: [
      'help.commands',
      'help.snippets',
      'help.components',
      'help.cheatsheet',
      'help.tutorial',
    ],
    builtin: true,
  });

  // ── diag.* (Fase 4 + Onda 6 + Fase 8) ──────────────────────

  registry.defineCommand('diag', {
    description: 'Diagnóstico interno — eventos, logs, invariantes, contratos, saúde',
    subverbs: [
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
      'diag.logs 20 warn',
      'diag.invariants',
      'diag.contracts',
      'diag.health',
      'diag.rules',
      'diag.smoke',
      'diag.snapshot',
      'diag.clear',
      'diag.test',
      'diag.test full',
      'diag.test fast',
      'diag.test minimal',
      'diag.test fuzz seed=99',
      'diag.baseline list',
      'diag.baseline capture my-checkpoint',
      'diag.baseline compare my-checkpoint',
      'diag.narrative.recent 10',
      'diag.narrative.why act-s1-1',
      'diag.narrative.stats',
      'diag.narrative.overrides',
      'diag.narrative.lexicon',
      'diag.narrative.replay act-s1-1',
      'diag.narrative.clear',
      'diag.narrative.help',
    ],
    builtin: true,
  });

  // ── narr.* (Fase 5 + Estágio 10) ───────────────────────────

  registry.defineCommand('narr', {
    description: 'Modo narrativo — interpretação de prosa em português brasileiro',
    subverbs: [
      'off', 'preview', 'suggest', 'auto',
      'status', 'stats', 'overrides', 'lexicon',
      'catalog',
    ],
    examples: [
      'narr.off',
      'narr.preview',
      'narr.suggest',
      'narr.auto',
      'narr.status',
      'narr.stats',
      'narr.overrides',
      'narr.overrides.clear',
      'narr.lexicon',
      'narr.lexicon.clear',
      'narr.catalog',
    ],
    builtin: true,
  });

  return registry;
}