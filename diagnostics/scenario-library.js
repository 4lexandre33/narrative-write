/**
 * @file scenario-library.js
 * @module diagnostics
 * @description Catálogo de cenários determinísticos. Puro dado.
 * @imports — (nenhum)
 * @importedBy diagnostics/test-battery, diagnostics/regression-runner
 * @level 9
 *
 * Cada cenário é um objeto imutável consumido pelo RegressionRunner:
 *   {
 *     name:        string,   — identificador único e estável
 *     category:    string,   — agrupador (entity, mutation, link, ...)
 *     description: string,   — texto curto para relatório
 *     setup:       string[], — comandos rodados antes (não checados)
 *     commands:    string[], — comandos principais (checados)
 *     expect: {              — expectativas opcionais
 *       allOk:            boolean  (default true)
 *       noHalt:           boolean  (default true)
 *       expectFailuresAt: number[] (índices 0-based que DEVEM falhar)
 *       minEntities:      number   (delta de entidades desde o início)
 *       entityExists:     string[] (ids internos que devem existir ao final)
 *       entityMissing:    string[] (ids internos que NÃO devem existir)
 *       finalState:       Object   ({ 'path.alias.field': value })
 *     },
 *   }
 *
 * Fase 12 — LUME: cenários da categoria `narrative` testam o encanamento
 * entre ECS e NarrativeSystem (narr.*, diag.narrative.*, prosa em modos).
 * A análise em si (prosa → IR) é verificada por fixtures em
 * `narrative-language/fixtures/runner.js`.
 *
 * Determinismo: todos os cenários rodam em sandbox isolado (RegressionRunner
 * cria um por cenário). Nenhum toca storage real nem depende de wall-clock.
 */

// ══════════════════════════════════════════════════════════════
// CATÁLOGO
// ══════════════════════════════════════════════════════════════

export const SCENARIOS = Object.freeze([

  // ══════════════════════════════════════════════════════════
  // ENTIDADE — criação, leitura, listagem, remoção
  // ══════════════════════════════════════════════════════════

  {
    name: 'entity-create-basic',
    category: 'entity',
    description: 'Criar personagem simples',
    setup: [],
    commands: ['ent.create.character Kaelin'],
    expect: { allOk: true, noHalt: true, entityExists: ['Kaelin'] },
  },
  {
    name: 'entity-create-with-opts',
    category: 'entity',
    description: 'Criar com stats e flags inline',
    setup: [],
    commands: ['ent.create.character Kaelin courage=5 alive=true'],
    expect: {
      allOk: true, noHalt: true, entityExists: ['Kaelin'],
      finalState: { 'Kaelin.stats.courage': 5 },
    },
  },
  {
    name: 'entity-create-location',
    category: 'entity',
    description: 'Criar local',
    setup: [],
    commands: ['ent.create.location Cinza'],
    expect: { allOk: true, entityExists: ['Cinza'] },
  },
  {
    name: 'entity-create-item',
    category: 'entity',
    description: 'Criar item',
    setup: [],
    commands: ['ent.create.item Selo'],
    expect: { allOk: true, entityExists: ['Selo'] },
  },
  {
    name: 'entity-create-duplicate-fails',
    category: 'entity',
    description: 'Criar duas vezes falha controladamente',
    setup: ['ent.create.character Kaelin'],
    commands: ['ent.create.character Kaelin'],
    expect: { allOk: false, noHalt: false, expectFailuresAt: [0] },
  },
  {
    name: 'entity-show',
    category: 'entity',
    description: 'Mostrar entidade existente',
    setup: ['ent.create.character Kaelin'],
    commands: ['ent.show Kaelin'],
    expect: { allOk: true },
  },
  {
    name: 'entity-show-missing-fails',
    category: 'entity',
    description: 'Mostrar entidade inexistente falha',
    setup: [],
    commands: ['ent.show Inexistente'],
    expect: { allOk: false, expectFailuresAt: [0] },
  },
  {
    name: 'entity-list',
    category: 'entity',
    description: 'Listar entidades',
    setup: ['ent.create.character A', 'ent.create.character B'],
    commands: ['ent.list'],
    expect: { allOk: true },
  },
  {
    name: 'entity-delete',
    category: 'entity',
    description: 'Apagar entidade',
    setup: ['ent.create.character Kaelin'],
    commands: ['ent.delete Kaelin'],
    expect: { allOk: true, entityMissing: ['Kaelin'] },
  },

  // ══════════════════════════════════════════════════════════
  // IDENTIDADE
  // ══════════════════════════════════════════════════════════

  {
    name: 'identity-show',
    category: 'identity',
    description: 'Mostrar identidade',
    setup: ['ent.create.character Kaelin'],
    commands: ['id.show Kaelin'],
    expect: { allOk: true },
  },
  {
    name: 'identity-rename',
    category: 'identity',
    description: 'Renomear entidade',
    setup: ['ent.create.character Kaelin'],
    commands: ['id.rename Kaelin "Kaelin, o Cinza"'],
    expect: {
      allOk: true,
      finalState: { 'Kaelin.identity.name': 'Kaelin, o Cinza' },
    },
  },
  {
    name: 'identity-describe',
    category: 'identity',
    description: 'Descrever entidade',
    setup: ['ent.create.character Kaelin'],
    commands: ['id.describe Kaelin "guerreiro cansado"'],
    expect: {
      allOk: true,
      finalState: { 'Kaelin.identity.description': 'guerreiro cansado' },
    },
  },
  {
    name: 'identity-retype',
    category: 'identity',
    description: 'Mudar tipo',
    setup: ['ent.create.character Kaelin'],
    commands: ['id.retype Kaelin custom'],
    expect: {
      allOk: true,
      finalState: { 'Kaelin.identity.type': 'custom' },
    },
  },

  // ══════════════════════════════════════════════════════════
  // MUTAÇÃO — Stats
  // ══════════════════════════════════════════════════════════

  {
    name: 'mut-add-stats',
    category: 'mutation',
    description: 'Adicionar a stat existente',
    setup: ['ent.create.character Kaelin'],
    commands: ['mut.add.stats Kaelin.fear 3'],
    expect: { allOk: true, finalState: { 'Kaelin.stats.fear': 3 } },
  },
  {
    name: 'mut-set-stats',
    category: 'mutation',
    description: 'Setar stat',
    setup: ['ent.create.character Kaelin'],
    commands: ['mut.set.stats Kaelin.fear 10'],
    expect: { allOk: true, finalState: { 'Kaelin.stats.fear': 10 } },
  },
  {
    name: 'mut-sub-stats',
    category: 'mutation',
    description: 'Subtrair stat',
    setup: ['ent.create.character Kaelin', 'mut.set.stats Kaelin.fear 10'],
    commands: ['mut.sub.stats Kaelin.fear 3'],
    expect: { allOk: true, finalState: { 'Kaelin.stats.fear': 7 } },
  },
  {
    name: 'mut-add-stats-invalid-value',
    category: 'mutation',
    description: 'Valor não numérico falha',
    setup: ['ent.create.character Kaelin'],
    commands: ['mut.add.stats Kaelin.fear abc'],
    expect: { allOk: false, expectFailuresAt: [0] },
  },
  {
    name: 'mut-add-stats-missing-entity-fails',
    category: 'mutation',
    description: 'Alvo inexistente falha',
    setup: [],
    commands: ['mut.add.stats NaoExiste.fear 3'],
    expect: { allOk: false, expectFailuresAt: [0] },
  },

  // ══════════════════════════════════════════════════════════
  // MUTAÇÃO — Flags
  // ══════════════════════════════════════════════════════════

  {
    name: 'mut-flag-on',
    category: 'mutation',
    description: 'Ligar flag',
    setup: ['ent.create.character Kaelin'],
    commands: ['mut.flag.on Kaelin alive'],
    expect: {
      allOk: true,
      finalState: { 'Kaelin.flags.values': ['alive'] },
    },
  },
  {
    name: 'mut-flag-off',
    category: 'mutation',
    description: 'Desligar flag existente',
    setup: ['ent.create.character Kaelin', 'mut.flag.on Kaelin alive'],
    commands: ['mut.flag.off Kaelin alive'],
    expect: {
      allOk: true,
      finalState: { 'Kaelin.flags.values': [] },
    },
  },
  {
    name: 'mut-flag-on-idempotent',
    category: 'mutation',
    description: 'Ligar flag duas vezes é idempotente',
    setup: ['ent.create.character Kaelin', 'mut.flag.on Kaelin alive'],
    commands: ['mut.flag.on Kaelin alive'],
    expect: {
      allOk: true,
      finalState: { 'Kaelin.flags.values': ['alive'] },
    },
  },

  // ══════════════════════════════════════════════════════════
  // MUTAÇÃO — Lists
  // ══════════════════════════════════════════════════════════

  {
    name: 'mut-push-list',
    category: 'mutation',
    description: 'Adicionar a lista',
    setup: ['ent.create.character Kaelin'],
    commands: ['mut.push.list Kaelin.inventory Selo'],
    expect: {
      allOk: true,
      finalState: { 'Kaelin.lists.inventory': ['Selo'] },
    },
  },
  {
    name: 'mut-pull-list',
    category: 'mutation',
    description: 'Remover da lista',
    setup: ['ent.create.character Kaelin', 'mut.push.list Kaelin.inventory Selo'],
    commands: ['mut.pull.list Kaelin.inventory Selo'],
    expect: {
      allOk: true,
      finalState: { 'Kaelin.lists.inventory': [] },
    },
  },
  {
    name: 'mut-push-list-idempotent',
    category: 'mutation',
    description: 'Push duas vezes não duplica',
    setup: ['ent.create.character Kaelin', 'mut.push.list Kaelin.inventory Selo'],
    commands: ['mut.push.list Kaelin.inventory Selo'],
    expect: {
      allOk: true,
      finalState: { 'Kaelin.lists.inventory': ['Selo'] },
    },
  },

  // ══════════════════════════════════════════════════════════
  // MUTAÇÃO — Enums e Texts
  // ══════════════════════════════════════════════════════════

  {
    name: 'mut-enum',
    category: 'mutation',
    description: 'Setar enum',
    setup: ['ent.create.character Kaelin'],
    commands: ['mut.enum Kaelin.role soldado'],
    expect: { allOk: true, finalState: { 'Kaelin.enums.role': 'soldado' } },
  },
  {
    name: 'mut-text',
    category: 'mutation',
    description: 'Setar texto',
    setup: ['ent.create.character Kaelin'],
    commands: ['mut.text Kaelin.bio "um guerreiro"'],
    expect: { allOk: true, finalState: { 'Kaelin.texts.bio': 'um guerreiro' } },
  },

  // ══════════════════════════════════════════════════════════
  // LINKS
  // ══════════════════════════════════════════════════════════

  {
    name: 'link-set-single',
    category: 'link',
    description: 'Setar link único (localização)',
    setup: ['ent.create.character Kaelin', 'ent.create.location Cinza'],
    commands: ['link.set.location Kaelin Cinza'],
    expect: { allOk: true, finalState: { 'Kaelin.links.location': 'Cinza' } },
  },
  {
    name: 'link-add-multi',
    category: 'link',
    description: 'Adicionar link multi (inventário)',
    setup: ['ent.create.character Kaelin', 'ent.create.item Selo'],
    commands: ['link.add.inventory Kaelin Selo'],
    expect: {
      allOk: true,
      finalState: { 'Kaelin.links.inventory': ['Selo'] },
    },
  },
  {
    name: 'link-pull',
    category: 'link',
    description: 'Remover link multi',
    setup: [
      'ent.create.character Kaelin', 'ent.create.item Selo',
      'link.add.inventory Kaelin Selo',
    ],
    commands: ['link.pull.inventory Kaelin Selo'],
    expect: {
      allOk: true,
      finalState: { 'Kaelin.links.inventory': [] },
    },
  },
  {
    name: 'link-clear',
    category: 'link',
    description: 'Limpar chave de link inteira',
    setup: [
      'ent.create.character Kaelin', 'ent.create.item Selo',
      'link.add.inventory Kaelin Selo',
    ],
    commands: ['link.clear.inventory Kaelin'],
    expect: { allOk: true },
  },
  {
    name: 'link-add-idempotent',
    category: 'link',
    description: 'Add duas vezes não duplica',
    setup: [
      'ent.create.character Kaelin', 'ent.create.item Selo',
      'link.add.inventory Kaelin Selo',
    ],
    commands: ['link.add.inventory Kaelin Selo'],
    expect: {
      allOk: true,
      finalState: { 'Kaelin.links.inventory': ['Selo'] },
    },
  },
  {
    name: 'link-set-missing-target-fails',
    category: 'link',
    description: 'Destino inexistente falha',
    setup: ['ent.create.character Kaelin'],
    commands: ['link.set.location Kaelin Inexistente'],
    expect: { allOk: false, expectFailuresAt: [0] },
  },
  {
    name: 'link-where',
    category: 'link',
    description: 'Listar links de uma entidade',
    setup: ['ent.create.character Kaelin', 'ent.create.location Cinza',
            'link.set.location Kaelin Cinza'],
    commands: ['link.where Kaelin'],
    expect: { allOk: true },
  },
  {
    name: 'link-from-reverse',
    category: 'link',
    description: 'Quem aponta para X',
    setup: ['ent.create.character Kaelin', 'ent.create.location Cinza',
            'link.set.location Kaelin Cinza'],
    commands: ['link.from Cinza'],
    expect: { allOk: true },
  },

  // ══════════════════════════════════════════════════════════
  // INSTANCIAÇÃO / HERANÇA
  // ══════════════════════════════════════════════════════════

  {
    name: 'inst-mark-blueprint',
    category: 'instantiation',
    description: 'Marcar como blueprint',
    setup: ['ent.create.character Goblin'],
    commands: ['inst.mark Goblin'],
    expect: { allOk: true },
  },
  {
    name: 'inst-create-instance',
    category: 'instantiation',
    description: 'Criar instância a partir de blueprint',
    setup: ['ent.create.character Goblin', 'inst.mark Goblin'],
    commands: ['inst.create Goblin'],
    expect: { allOk: true },
  },
  {
    name: 'inst-list',
    category: 'instantiation',
    description: 'Listar blueprints',
    setup: ['ent.create.character Goblin', 'inst.mark Goblin'],
    commands: ['inst.list'],
    expect: { allOk: true },
  },
  {
    name: 'inst-sync',
    category: 'instantiation',
    description: 'Sincronizar instâncias',
    setup: ['ent.create.character Goblin', 'inst.mark Goblin', 'inst.create Goblin'],
    commands: ['inst.sync Goblin'],
    expect: { allOk: true },
  },
  {
    name: 'inst-create-non-blueprint-fails',
    category: 'instantiation',
    description: 'Criar de não-blueprint falha',
    setup: ['ent.create.character Goblin'],
    commands: ['inst.create Goblin'],
    expect: { allOk: false, expectFailuresAt: [0] },
  },
  {
    name: 'inheritance-chain',
    category: 'inheritance',
    description: 'Ver cadeia de herança',
    setup: ['ent.create.character A', 'inst.mark A', 'inst.create A'],
    commands: ['inst.chain A'],
    expect: { allOk: true },
  },
  {
    name: 'inheritance-policy',
    category: 'inheritance',
    description: 'Definir política de merge',
    setup: ['ent.create.character Goblin', 'inst.mark Goblin'],
    commands: ['inst.policy Goblin stats=additive'],
    expect: { allOk: true },
  },

  // ══════════════════════════════════════════════════════════
  // REGRAS
  // ══════════════════════════════════════════════════════════

  {
    name: 'rule-add-basic',
    category: 'rule',
    description: 'Declarar regra',
    setup: [],
    commands: ['rul.add "medo goblin" ON: entity:created IF: true DO: mut.flag.on Goblin medroso'],
    expect: { allOk: true },
  },
  {
    name: 'rule-list',
    category: 'rule',
    description: 'Listar regras',
    setup: ['rul.add "r1" ON: entity:created IF: true DO: mut.flag.on X y'],
    commands: ['rul.list'],
    expect: { allOk: true },
  },
  {
    name: 'rule-add-missing-on-fails',
    category: 'rule',
    description: 'rul.add sem ON falha',
    setup: [],
    commands: ['rul.add "r" IF: true DO: mut.flag.on X y'],
    expect: { allOk: false, expectFailuresAt: [0] },
  },
  {
    name: 'rule-off-on',
    category: 'rule',
    description: 'Suspender e ressuscitar regra',
    setup: ['rul.add "r" ON: entity:created IF: true DO: mut.flag.on X y'],
    commands: ['rul.off "r"', 'rul.on "r"'],
    expect: { allOk: true },
  },

  // ══════════════════════════════════════════════════════════
  // SNIPPETS
  // ══════════════════════════════════════════════════════════

  {
    name: 'snippet-create-text',
    category: 'snippet',
    description: 'Criar snippet de texto',
    setup: [],
    commands: ['snip.create per.kaelin "Kaelin"'],
    expect: { allOk: true },
  },
  {
    name: 'snippet-create-template',
    category: 'snippet',
    description: 'Criar template com placeholder',
    setup: [],
    commands: ['snip.create.template pers.cena body="{personagem} entrou em {local}"'],
    expect: { allOk: true },
  },
  {
    name: 'snippet-list',
    category: 'snippet',
    description: 'Listar snippets',
    setup: ['snip.create per.kaelin "Kaelin"'],
    commands: ['snip.list'],
    expect: { allOk: true },
  },

  // ══════════════════════════════════════════════════════════
  // QUERY
  // ══════════════════════════════════════════════════════════

  {
    name: 'query-at',
    category: 'query',
    description: 'Consultar estado em tick passado',
    setup: ['ent.create.character Kaelin'],
    commands: ['que.at T0 Kaelin'],
    expect: { allOk: true },
  },
  {
    name: 'query-timeline',
    category: 'query',
    description: 'Timeline de um atributo',
    setup: ['ent.create.character Kaelin', 'mut.add.stats Kaelin.fear 3'],
    commands: ['que.timeline Kaelin.fear'],
    expect: { allOk: true },
  },

  // ══════════════════════════════════════════════════════════
  // SEARCH
  // ══════════════════════════════════════════════════════════

  {
    name: 'search-find-basic',
    category: 'search',
    description: 'Busca textual simples',
    setup: ['ent.create.character Kaelin'],
    commands: ['sea.find "kaelin"'],
    expect: { allOk: true },
  },
  {
    name: 'search-find-and',
    category: 'search',
    description: 'Busca com AND',
    setup: ['ent.create.character Kaelin', 'mut.push.list Kaelin.inventory Selo'],
    commands: ['sea.find "kaelin,selo"'],
    expect: { allOk: true },
  },
  {
    name: 'search-help',
    category: 'search',
    description: 'Help de busca',
    setup: [],
    commands: ['sea.help'],
    expect: { allOk: true },
  },

  // ══════════════════════════════════════════════════════════
  // AUDITORIA
  // ══════════════════════════════════════════════════════════

  {
    name: 'audit-links-clean',
    category: 'audit',
    description: 'Auditoria de links sem dangling',
    setup: ['ent.create.character Kaelin', 'ent.create.location Cinza',
            'link.set.location Kaelin Cinza'],
    commands: ['aud.links'],
    expect: { allOk: true },
  },
  {
    name: 'audit-identities',
    category: 'audit',
    description: 'Auditoria de identidades',
    setup: ['ent.create.character Kaelin'],
    commands: ['aud.identities'],
    expect: { allOk: true },
  },
  {
    name: 'audit-instances',
    category: 'audit',
    description: 'Auditoria de instâncias',
    setup: ['ent.create.character Goblin', 'inst.mark Goblin', 'inst.create Goblin'],
    commands: ['aud.instances'],
    expect: { allOk: true },
  },

  // ══════════════════════════════════════════════════════════
  // KNOWLEDGE
  // ══════════════════════════════════════════════════════════

  {
    name: 'knowledge-learn',
    category: 'knowledge',
    description: 'Ensinar fato',
    setup: ['ent.create.character Mira'],
    commands: ['kno.learn Mira "traicao revelada"'],
    expect: { allOk: true },
  },
  {
    name: 'knowledge-forget',
    category: 'knowledge',
    description: 'Esquecer fato',
    setup: ['ent.create.character Mira', 'kno.learn Mira "x"'],
    commands: ['kno.forget Mira "x"'],
    expect: { allOk: true },
  },
  {
    name: 'knowledge-show',
    category: 'knowledge',
    description: 'Mostrar o que sabe',
    setup: ['ent.create.character Mira', 'kno.learn Mira "x"'],
    commands: ['kno.show Mira'],
    expect: { allOk: true },
  },

  // ══════════════════════════════════════════════════════════
  // FORK
  // ══════════════════════════════════════════════════════════

  {
    name: 'fork-create',
    category: 'fork',
    description: 'Criar timeline alternativa',
    setup: ['ent.create.character Kaelin'],
    commands: ['frk.create alt'],
    expect: { allOk: true },
  },
  {
    name: 'fork-switch',
    category: 'fork',
    description: 'Trocar de timeline',
    setup: ['ent.create.character Kaelin', 'frk.create alt'],
    commands: ['frk.switch main'],
    expect: { allOk: true },
  },
  {
    name: 'fork-list',
    category: 'fork',
    description: 'Listar timelines',
    setup: [],
    commands: ['frk.list'],
    expect: { allOk: true },
  },
  {
    name: 'fork-delete-main-fails',
    category: 'fork',
    description: 'Apagar main falha',
    setup: [],
    commands: ['frk.delete main'],
    expect: { allOk: false, expectFailuresAt: [0] },
  },

  // ══════════════════════════════════════════════════════════
  // DIFF
  // ══════════════════════════════════════════════════════════

  {
    name: 'diff-vs-main-alt',
    category: 'diff',
    description: 'Diff entre timelines',
    setup: ['ent.create.character Kaelin', 'frk.create alt'],
    commands: ['dif.main vs alt'],
    expect: { allOk: true },
  },

  // ══════════════════════════════════════════════════════════
  // EXPORT
  // ══════════════════════════════════════════════════════════

  {
    name: 'export-json',
    category: 'export',
    description: 'Export JSON',
    setup: ['ent.create.character Kaelin'],
    commands: ['exp.json'],
    expect: { allOk: true },
  },
  {
    name: 'export-snippets',
    category: 'export',
    description: 'Export apenas snippets',
    setup: ['snip.create per.kaelin "Kaelin"'],
    commands: ['exp.snippets'],
    expect: { allOk: true },
  },

  // ══════════════════════════════════════════════════════════
  // HELP
  // ══════════════════════════════════════════════════════════

  {
    name: 'help-commands',
    category: 'help',
    description: 'Listar comandos',
    setup: [],
    commands: ['help.commands'],
    expect: { allOk: true },
  },
  {
    name: 'help-cheatsheet',
    category: 'help',
    description: 'Cheatsheet',
    setup: [],
    commands: ['help.cheatsheet'],
    expect: { allOk: true },
  },

  // ══════════════════════════════════════════════════════════
  // DIAGNOSTICS
  // ══════════════════════════════════════════════════════════

  {
    name: 'diag-status',
    category: 'diagnostics',
    description: 'diag.status responde',
    setup: [],
    commands: ['diag.status'],
    expect: { allOk: true },
  },
  {
    name: 'diag-counts',
    category: 'diagnostics',
    description: 'diag.counts responde',
    setup: [],
    commands: ['diag.counts'],
    expect: { allOk: true },
  },
  {
    name: 'diag-mode-full',
    category: 'diagnostics',
    description: 'Trocar para modo full',
    setup: [],
    commands: ['diag.mode full'],
    expect: { allOk: true },
  },

  // ══════════════════════════════════════════════════════════
  // FASE 12 — LUME Narrativa natural (categoria 'narrative')
  // ══════════════════════════════════════════════════════════
  //
  // Cenários determinísticos para o subsistema narrativo.
  // Cada cenário verifica o ciclo completo de um comando `narr.*`
  // no pipeline ECS: o sistema existe, o parser aceita, o sistema
  // responde com o payload esperado.
  //
  // A análise narrativa em si (prosa → IR) é verificada pelos
  // fixtures em `narrative-language/fixtures/runner.js` — este
  // conjunto testa apenas o **encanamento** entre ECS e narrative.

  {
    name: 'narrative-narr-off',
    category: 'narrative',
    description: 'narr.off muda o modo para off',
    setup: [],
    commands: ['narr.off'],
    expect: { allOk: true, noHalt: true },
  },
  {
    name: 'narrative-narr-preview',
    category: 'narrative',
    description: 'narr.preview muda o modo para preview',
    setup: [],
    commands: ['narr.preview'],
    expect: { allOk: true, noHalt: true },
  },
  {
    name: 'narrative-narr-suggest',
    category: 'narrative',
    description: 'narr.suggest muda o modo para suggest',
    setup: [],
    commands: ['narr.suggest'],
    expect: { allOk: true, noHalt: true },
  },
  {
    name: 'narrative-narr-auto',
    category: 'narrative',
    description: 'narr.auto muda o modo para auto',
    setup: [],
    commands: ['narr.auto'],
    expect: { allOk: true, noHalt: true },
  },
  {
    name: 'narrative-narr-status',
    category: 'narrative',
    description: 'narr.status retorna um card com o modo atual',
    setup: ['narr.preview'],
    commands: ['narr.status'],
    expect: { allOk: true, noHalt: true },
  },
  {
    name: 'narrative-narr-stats',
    category: 'narrative',
    description: 'narr.stats retorna uma tabela de métricas',
    setup: [],
    commands: ['narr.stats'],
    expect: { allOk: true, noHalt: true },
  },
  {
    name: 'narrative-narr-overrides',
    category: 'narrative',
    description: 'narr.overrides retorna tabela (pode estar vazia)',
    setup: [],
    commands: ['narr.overrides'],
    expect: { allOk: true, noHalt: true },
  },
  {
    name: 'narrative-narr-lexicon',
    category: 'narrative',
    description: 'narr.lexicon retorna tabela (pode estar vazia)',
    setup: [],
    commands: ['narr.lexicon'],
    expect: { allOk: true, noHalt: true },
  },
  {
    name: 'narrative-cycle-all-modes',
    category: 'narrative',
    description: 'Ciclo completo: off → preview → suggest → auto → off',
    setup: [],
    commands: [
      'narr.off',
      'narr.preview',
      'narr.suggest',
      'narr.auto',
      'narr.off',
    ],
    expect: { allOk: true, noHalt: true },
  },
  {
    name: 'narrative-diag-narrative-help',
    category: 'narrative',
    description: 'diag.narrative.help lista os subcomandos',
    setup: [],
    commands: ['diag.narrative.help'],
    expect: { allOk: true, noHalt: true },
  },
  {
    name: 'narrative-diag-narrative-stats',
    category: 'narrative',
    description: 'diag.narrative.stats mostra estatísticas do NarrativeSystem',
    setup: [],
    commands: ['diag.narrative.stats'],
    expect: { allOk: true, noHalt: true },
  },
  {
    name: 'narrative-diag-narrative-recent-empty',
    category: 'narrative',
    description: 'diag.narrative.recent sem IR retorna payload informativo',
    setup: ['diag.narrative.clear'],
    commands: ['diag.narrative.recent 5'],
    expect: { allOk: true, noHalt: true },
  },
  {
    name: 'narrative-diag-narrative-overrides',
    category: 'narrative',
    description: 'diag.narrative.overrides retorna tabela',
    setup: [],
    commands: ['diag.narrative.overrides'],
    expect: { allOk: true, noHalt: true },
  },
  {
    name: 'narrative-diag-narrative-lexicon',
    category: 'narrative',
    description: 'diag.narrative.lexicon retorna tabela',
    setup: [],
    commands: ['diag.narrative.lexicon'],
    expect: { allOk: true, noHalt: true },
  },
  {
    name: 'narrative-diag-narrative-clear',
    category: 'narrative',
    description: 'diag.narrative.clear limpa o IR em cache',
    setup: [],
    commands: ['diag.narrative.clear'],
    expect: { allOk: true, noHalt: true },
  },
  {
    name: 'narrative-diag-narrative-invalid-sub',
    category: 'narrative',
    description: 'diag.narrative.bogus deve falhar controladamente',
    setup: [],
    commands: ['diag.narrative.bogus'],
    expect: { allOk: false, noHalt: false, expectFailuresAt: [0] },
  },
  {
    name: 'narrative-narr-invalid-sub',
    category: 'narrative',
    description: 'narr.bogus deve falhar controladamente',
    setup: [],
    commands: ['narr.bogus'],
    expect: { allOk: false, noHalt: false, expectFailuresAt: [0] },
  },
  {
    name: 'narrative-narr-off-does-not-break-pipeline',
    category: 'narrative',
    description: 'narr.off não impede comandos técnicos subsequentes',
    setup: ['narr.off'],
    commands: [
      'ent.create.character Kaelin',
      'mut.add.stats Kaelin.fear 3',
    ],
    expect: {
      allOk: true,
      noHalt: true,
      entityExists: ['Kaelin'],
      finalState: { 'Kaelin.stats.fear': 3 },
    },
  },
  {
    name: 'narrative-prose-when-off-is-noop',
    category: 'narrative',
    description: 'Prosa em modo off é ignorada (no-op)',
    setup: ['narr.off'],
    commands: ['João abriu a porta.'],
    expect: { allOk: true, noHalt: true },
  },
  {
    name: 'narrative-prose-when-preview-emits-event',
    category: 'narrative',
    description: 'Prosa em modo preview dispara análise (assíncrona)',
    setup: ['narr.preview'],
    commands: ['João abriu a porta.'],
    expect: { allOk: true, noHalt: true },
  },
  {
    name: 'narrative-narr-auto-without-prose',
    category: 'narrative',
    description: 'narr.auto sozinho não quebra nada',
    setup: [],
    commands: ['narr.auto'],
    expect: { allOk: true, noHalt: true, minEntities: 0 },
  },
  {
    name: 'narrative-multiple-mode-changes',
    category: 'narrative',
    description: 'Múltiplas trocas de modo em sequência',
    setup: [],
    commands: [
      'narr.preview',
      'narr.auto',
      'narr.suggest',
      'narr.preview',
      'narr.off',
    ],
    expect: { allOk: true, noHalt: true },
  },
  {
    name: 'narrative-status-after-cycle',
    category: 'narrative',
    description: 'narr.status reflete o último modo setado',
    setup: [],
    commands: [
      'narr.preview',
      'narr.suggest',
      'narr.status',
    ],
    expect: { allOk: true, noHalt: true },
  },
  {
    name: 'narrative-diag-narrative-why-missing-act',
    category: 'narrative',
    description: 'diag.narrative.why com act inexistente falha controladamente',
    setup: [],
    commands: ['diag.narrative.why act-inexistente-xyz'],
    expect: { allOk: false, noHalt: false, expectFailuresAt: [0] },
  },
  {
    name: 'narrative-diag-narrative-replay-missing-act',
    category: 'narrative',
    description: 'diag.narrative.replay com act inexistente falha controladamente',
    setup: [],
    commands: ['diag.narrative.replay act-inexistente-xyz'],
    expect: { allOk: false, noHalt: false, expectFailuresAt: [0] },
  },
  {
    name: 'narrative-entities-before-preview',
    category: 'narrative',
    description: 'Criar entidades antes da prosa preserva o World',
    setup: [
      'ent.create.character Kaelin',
      'ent.create.location Cinza',
      'narr.preview',
    ],
    commands: ['Kaelin entrou em Cinza.'],
    expect: {
      allOk: true,
      noHalt: true,
      entityExists: ['Kaelin', 'Cinza'],
    },
  },
  {
    name: 'narrative-off-then-technical-commands',
    category: 'narrative',
    description: 'Comandos técnicos funcionam após narr.off',
    setup: ['narr.preview', 'narr.auto', 'narr.off'],
    commands: [
      'ent.create.character Kaelin',
      'mut.add.stats Kaelin.fear 5',
      'id.rename Kaelin "Kaelin o Bravo"',
    ],
    expect: {
      allOk: true,
      noHalt: true,
      entityExists: ['Kaelin'],
      finalState: {
        'Kaelin.stats.fear': 5,
        'Kaelin.identity.name': 'Kaelin o Bravo',
      },
    },
  },

]);

// ══════════════════════════════════════════════════════════════
// HELPERS — consultas
// ══════════════════════════════════════════════════════════════

/**
 * Busca um cenário pelo nome (exato).
 * @param {string} name
 * @returns {Object|null}
 */
export function getScenario(name) {
  if (typeof name !== 'string' || !name) return null;
  return SCENARIOS.find((s) => s && s.name === name) ?? null;
}

/**
 * Lista todas as categorias únicas, ordenadas.
 * @returns {string[]}
 */
export function listCategories() {
  const set = new Set();
  for (const s of SCENARIOS) {
    if (s && typeof s.category === 'string') set.add(s.category);
  }
  return Array.from(set).sort();
}

/**
 * Lista todos os nomes de cenário, ordenados.
 * @returns {string[]}
 */
export function listNames() {
  return SCENARIOS.map((s) => s.name).filter(Boolean).sort();
}

/**
 * Filtra cenários por categoria.
 * @param {string} category
 * @returns {Array<Object>}
 */
export function byCategory(category) {
  if (typeof category !== 'string' || !category) return [];
  return SCENARIOS.filter((s) => s && s.category === category);
}

/**
 * Conta cenários por categoria.
 * @returns {Object<string, number>}
 */
export function countByCategory() {
  const counts = {};
  for (const s of SCENARIOS) {
    if (!s) continue;
    const c = s.category ?? 'unknown';
    counts[c] = (counts[c] ?? 0) + 1;
  }
  return counts;
}

/**
 * Estatísticas gerais do catálogo.
 * @returns {{ total:number, categories:string[], byCategory:Object }}
 */
export function scenarioStats() {
  return {
    total: SCENARIOS.length,
    categories: listCategories(),
    byCategory: countByCategory(),
  };
}

// ══════════════════════════════════════════════════════════════
// HELPERS — validação
// ══════════════════════════════════════════════════════════════

/**
 * Valida a forma de um cenário antes de executá-lo.
 * Nunca lança. Devolve `{ ok, errors }`.
 *
 * Checagens:
 *   - é objeto não-nulo
 *   - `name` é string não vazia
 *   - `category` é string não vazia
 *   - `setup` é array de strings (se presente)
 *   - `commands` é array de strings não vazio
 *   - `expect` é objeto (se presente)
 *   - `expect.expectFailuresAt` é array de inteiros ≥ 0 (se presente)
 *   - `expect.entityExists` / `entityMissing` são arrays de strings
 *   - `expect.minEntities` é número inteiro ≥ 0
 *   - `expect.finalState` é objeto
 *
 * @param {any} scenario
 * @returns {{ ok:boolean, errors:string[] }}
 */
export function validateScenario(scenario) {
  const errors = [];

  if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) {
    return { ok: false, errors: ['cenário não é objeto'] };
  }

  if (typeof scenario.name !== 'string' || scenario.name.length === 0) {
    errors.push('name ausente ou vazio');
  }
  if (typeof scenario.category !== 'string' || scenario.category.length === 0) {
    errors.push('category ausente ou vazia');
  }

  if (scenario.setup !== undefined && scenario.setup !== null) {
    if (!Array.isArray(scenario.setup)) {
      errors.push('setup deve ser array');
    } else {
      for (let i = 0; i < scenario.setup.length; i++) {
        if (typeof scenario.setup[i] !== 'string') {
          errors.push(`setup[${i}] não é string`);
          break;
        }
      }
    }
  }

  if (!Array.isArray(scenario.commands)) {
    errors.push('commands ausente ou não-array');
  } else if (scenario.commands.length === 0) {
    errors.push('commands vazio');
  } else {
    for (let i = 0; i < scenario.commands.length; i++) {
      if (typeof scenario.commands[i] !== 'string') {
        errors.push(`commands[${i}] não é string`);
        break;
      }
    }
  }

  if (scenario.expect !== undefined && scenario.expect !== null) {
    const e = scenario.expect;
    if (typeof e !== 'object' || Array.isArray(e)) {
      errors.push('expect deve ser objeto');
    } else {
      if (e.allOk !== undefined && typeof e.allOk !== 'boolean') {
        errors.push('expect.allOk deve ser boolean');
      }
      if (e.noHalt !== undefined && typeof e.noHalt !== 'boolean') {
        errors.push('expect.noHalt deve ser boolean');
      }
      if (e.minEntities !== undefined) {
        if (typeof e.minEntities !== 'number' || !Number.isFinite(e.minEntities)) {
          errors.push('expect.minEntities deve ser número');
        }
      }
      if (e.expectFailuresAt !== undefined) {
        if (!Array.isArray(e.expectFailuresAt)) {
          errors.push('expect.expectFailuresAt deve ser array');
        } else {
          for (const x of e.expectFailuresAt) {
            if (!Number.isInteger(x) || x < 0) {
              errors.push('expect.expectFailuresAt contém valor inválido');
              break;
            }
          }
        }
      }
      if (e.entityExists !== undefined && !Array.isArray(e.entityExists)) {
        errors.push('expect.entityExists deve ser array');
      }
      if (e.entityMissing !== undefined && !Array.isArray(e.entityMissing)) {
        errors.push('expect.entityMissing deve ser array');
      }
      if (e.finalState !== undefined) {
        if (typeof e.finalState !== 'object' || Array.isArray(e.finalState) || e.finalState === null) {
          errors.push('expect.finalState deve ser objeto');
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const ScenarioLibrary = Object.freeze({
  SCENARIOS,
  getScenario,
  listCategories,
  listNames,
  byCategory,
  countByCategory,
  scenarioStats,
  validateScenario,
});

export default SCENARIOS;