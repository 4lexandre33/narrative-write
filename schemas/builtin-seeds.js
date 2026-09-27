/**
 * @file builtin-seeds.js
 * @module schemas
 * @description Dados iniciais para primeira execução. Puro dado — sem lógica.
 * @imports core/constants
 * @importedBy systems/seed-system
 * @level 6
 *
 * Fase 13.7 — Bugfix P0-8 (auditoria 25/09/2026):
 *   `_seedMeta().counts.phrases` declarava 8, mas `_seedPhrases()`
 *   cria 9 entidades. Isso fazia `bootstrapSeeds.auditSeeds()` reportar
 *   `missing: ['phrases']` incorretamente. Corrigido para 9.
 */

import { COMPONENT_NAMES } from '../core/constants.js';

/**
 * Retorna a lista completa de entidades seed.
 * Cada item: { id, components }
 *
 * IDs internos são prefixados com `__` para evitar colisão
 * com entidades criadas pelo autor.
 *
 * @returns {Array<{id:string, components:Object}>}
 */
export function getBuiltinSeeds() {
  return [
    ..._seedPackages(),
    ..._seedCategories(),
    ..._seedSets(),
    ..._seedPhrases(),
    ..._seedPlaceholderPackages(),
    ..._seedPlaceholderCategories(),
    ..._seedPlaceholderSets(),
    ..._seedPlaceholderTerms(),
    ..._seedSnippets(),
    ..._seedRules(),
    ..._seedMeta(),
  ];
}

/**
 * Configuração de seed — metadados do pacote inicial.
 * @returns {Object}
 */
export function getSeedConfig() {
  return {
    version: '1.0',
    name: 'Seed Base',
    description: 'Dados iniciais criados na primeira execução',
  };
}

// ── Pacotes ───────────────────────────────────────────────────

function _seedPackages() {
  return [
    {
      id: '__pkg_base',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'PKG-BAS',
          name: 'Pacote Base',
          description: 'Pacote padrão do sistema normal',
          type: 'package',
        },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0',
          updatedAt: 'T0',
          builtin: true,
          dirty: false,
        },
      },
    },
    {
      id: '__pkg_pbase',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'PKG-PBA',
          name: 'Pacote Placeholder Base',
          description: 'Pacote padrão do sistema placeholder',
          type: 'package',
        },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0',
          updatedAt: 'T0',
          builtin: true,
          dirty: false,
        },
      },
    },
  ];
}

// ── Categorias ────────────────────────────────────────────────

function _seedCategories() {
  return [
    {
      id: '__cat_ap',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'CAT-APR',
          name: 'Apresentação',
          description: 'Frases de apresentação de personagens e cenários',
          type: 'category',
        },
        [COMPONENT_NAMES.LINKS]: {
          parent: '__pkg_base',
        },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0',
          updatedAt: 'T0',
          builtin: true,
          dirty: false,
        },
      },
    },
    {
      id: '__cat_cob',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'CAT-COB',
          name: 'Combate',
          description: 'Cenas de luta, ataque e defesa',
          type: 'category',
        },
        [COMPONENT_NAMES.LINKS]: {
          parent: '__pkg_base',
        },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0',
          updatedAt: 'T0',
          builtin: true,
          dirty: false,
        },
      },
    },
    {
      id: '__cat_lore',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'CAT-LOR',
          name: 'História',
          description: 'Contexto, lore e eventos passados',
          type: 'category',
        },
        [COMPONENT_NAMES.LINKS]: {
          parent: '__pkg_base',
        },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0',
          updatedAt: 'T0',
          builtin: true,
          dirty: false,
        },
      },
    },
  ];
}

// ── Conjuntos ─────────────────────────────────────────────────

function _seedSets() {
  return [
    {
      id: '__set_ap_inim',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'SET-API',
          name: 'Inimigo',
          description: 'Apresentação de antagonistas',
          type: 'set',
        },
        [COMPONENT_NAMES.LINKS]: { parent: '__cat_ap' },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
    {
      id: '__set_ap_cen',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'SET-APC',
          name: 'Cenário',
          description: 'Descrições de ambiente',
          type: 'set',
        },
        [COMPONENT_NAMES.LINKS]: { parent: '__cat_ap' },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
    {
      id: '__set_ap_per',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'SET-APP',
          name: 'Personagem',
          description: 'Apresentação de protagonistas',
          type: 'set',
        },
        [COMPONENT_NAMES.LINKS]: { parent: '__cat_ap' },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
    {
      id: '__set_cob_atk',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'SET-COA',
          name: 'Ataque',
          description: 'Ações de ataque',
          type: 'set',
        },
        [COMPONENT_NAMES.LINKS]: { parent: '__cat_cob' },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
    {
      id: '__set_cob_def',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'SET-COD',
          name: 'Defesa',
          description: 'Ações de defesa e esquiva',
          type: 'set',
        },
        [COMPONENT_NAMES.LINKS]: { parent: '__cat_cob' },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
    {
      id: '__set_lore_hist',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'SET-LOH',
          name: 'História Antiga',
          description: 'Eventos históricos do mundo',
          type: 'set',
        },
        [COMPONENT_NAMES.LINKS]: { parent: '__cat_lore' },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
  ];
}

// ── Frases ────────────────────────────────────────────────────
//
// Total: 9 frases (2+2+1+2+1+1)

function _seedPhrases() {
  return [
    // ap.inim
    {
      id: '__phr_ap_inim_1',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'PHR-API-1', name: 'Ataque do inimigo',
          description: '', type: 'phrase',
        },
        [COMPONENT_NAMES.LINKS]: { parent: '__set_ap_inim' },
        [COMPONENT_NAMES.BODY]: {
          text: 'O {inimigo} surgiu {local}, brandindo {arma}.',
        },
        [COMPONENT_NAMES.TAGS]: { values: ['apresentacao', 'inimigo'] },
        [COMPONENT_NAMES.TEXTS]: {
          keywords: 'inimigo ataque apresentacao',
        },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
    {
      id: '__phr_ap_inim_2',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'PHR-API-2', name: 'Chegada do antagonista',
          description: '', type: 'phrase',
        },
        [COMPONENT_NAMES.LINKS]: { parent: '__set_ap_inim' },
        [COMPONENT_NAMES.BODY]: {
          text: 'Uma presença sombria anunciou {nome}: o {inimigo}.',
        },
        [COMPONENT_NAMES.TAGS]: { values: ['apresentacao', 'inimigo'] },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
    // ap.cen
    {
      id: '__phr_ap_cen_1',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'PHR-APC-1', name: 'Descrição de cenário',
          description: '', type: 'phrase',
        },
        [COMPONENT_NAMES.LINKS]: { parent: '__set_ap_cen' },
        [COMPONENT_NAMES.BODY]: {
          text: 'O {local} se estendia diante deles, {adjetivo} e silencioso.',
        },
        [COMPONENT_NAMES.TAGS]: { values: ['apresentacao', 'cenario'] },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
    {
      id: '__phr_ap_cen_2',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'PHR-APC-2', name: 'Ambiente opressivo',
          description: '', type: 'phrase',
        },
        [COMPONENT_NAMES.LINKS]: { parent: '__set_ap_cen' },
        [COMPONENT_NAMES.BODY]: {
          text: 'O ar em {local} pesava como chumbo.',
        },
        [COMPONENT_NAMES.TAGS]: { values: ['apresentacao', 'cenario'] },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
    // ap.per
    {
      id: '__phr_ap_per_1',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'PHR-APP-1', name: 'Apresentação de protagonista',
          description: '', type: 'phrase',
        },
        [COMPONENT_NAMES.LINKS]: { parent: '__set_ap_per' },
        [COMPONENT_NAMES.BODY]: {
          text: '{nome} entrou em cena, os olhos fixos em {alvo}.',
        },
        [COMPONENT_NAMES.TAGS]: { values: ['apresentacao', 'personagem'] },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
    // cob.atk
    {
      id: '__phr_cob_atk_1',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'PHR-COA-1', name: 'Golpe direto',
          description: '', type: 'phrase',
        },
        [COMPONENT_NAMES.LINKS]: { parent: '__set_cob_atk' },
        [COMPONENT_NAMES.BODY]: {
          text: '{atacante} desferiu um golpe com {arma}, acertando {alvo}.',
        },
        [COMPONENT_NAMES.TAGS]: { values: ['combate', 'ataque'] },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
    {
      id: '__phr_cob_atk_2',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'PHR-COA-2', name: 'Ataque furtivo',
          description: '', type: 'phrase',
        },
        [COMPONENT_NAMES.LINKS]: { parent: '__set_cob_atk' },
        [COMPONENT_NAMES.BODY]: {
          text: '{atacante} atacou {alvo} pelas costas.',
        },
        [COMPONENT_NAMES.TAGS]: { values: ['combate', 'ataque'] },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
    // cob.def
    {
      id: '__phr_cob_def_1',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'PHR-COD-1', name: 'Bloqueio',
          description: '', type: 'phrase',
        },
        [COMPONENT_NAMES.LINKS]: { parent: '__set_cob_def' },
        [COMPONENT_NAMES.BODY]: {
          text: '{alvo} bloqueou o ataque com {escudo}.',
        },
        [COMPONENT_NAMES.TAGS]: { values: ['combate', 'defesa'] },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
    // lore.hist
    {
      id: '__phr_lore_hist_1',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'PHR-LOH-1', name: 'Evento histórico',
          description: '', type: 'phrase',
        },
        [COMPONENT_NAMES.LINKS]: { parent: '__set_lore_hist' },
        [COMPONENT_NAMES.BODY]: {
          text: 'Há muito tempo, {local} foi palco de {evento}.',
        },
        [COMPONENT_NAMES.TAGS]: { values: ['lore', 'historia'] },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
  ];
}

// ── Placeholder packages ──────────────────────────────────────

function _seedPlaceholderPackages() {
  return [
    {
      id: '__ppkg_base',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'PPK-BAS',
          name: 'Pacote Placeholder Base',
          description: 'Termos placeholder padrão',
          type: 'package',
        },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
  ];
}

function _seedPlaceholderCategories() {
  return [
    {
      id: '__pcat_per',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'PCA-PER',
          name: 'Personagens',
          description: 'Nomes de personagens para placeholders',
          type: 'category',
        },
        [COMPONENT_NAMES.LINKS]: { parent: '__ppkg_base' },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
    {
      id: '__pcat_loc',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'PCA-LOC',
          name: 'Locais',
          description: 'Nomes de locais para placeholders',
          type: 'category',
        },
        [COMPONENT_NAMES.LINKS]: { parent: '__ppkg_base' },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
  ];
}

function _seedPlaceholderSets() {
  return [
    {
      id: '__pset_per_prot',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'PST-PRO',
          name: 'Protagonistas',
          description: 'Nomes de protagonistas',
          type: 'set',
        },
        [COMPONENT_NAMES.LINKS]: { parent: '__pcat_per' },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
    {
      id: '__pset_loc_cid',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'PST-CID',
          name: 'Cidades',
          description: 'Nomes de cidades e vilas',
          type: 'set',
        },
        [COMPONENT_NAMES.LINKS]: { parent: '__pcat_loc' },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
  ];
}

function _seedPlaceholderTerms() {
  return [
    {
      id: '__pterm_1',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'PTM-001',
          name: 'Kaelin',
          description: '', type: 'placeholder-term',
        },
        [COMPONENT_NAMES.LINKS]: { parent: '__pset_per_prot' },
        [COMPONENT_NAMES.BODY]: { text: 'Kaelin' },
        [COMPONENT_NAMES.ENUMS]: { placeholderName: 'personagem' },
        [COMPONENT_NAMES.TAGS]: { values: ['protagonista'] },
        [COMPONENT_NAMES.USAGE_COUNT]: { value: 0 },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
    {
      id: '__pterm_2',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'PTM-002',
          name: 'Cinza',
          description: '', type: 'placeholder-term',
        },
        [COMPONENT_NAMES.LINKS]: { parent: '__pset_loc_cid' },
        [COMPONENT_NAMES.BODY]: { text: 'Cinza' },
        [COMPONENT_NAMES.ENUMS]: { placeholderName: 'local' },
        [COMPONENT_NAMES.TAGS]: { values: ['cidade', 'norte'] },
        [COMPONENT_NAMES.USAGE_COUNT]: { value: 0 },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
  ];
}

// ── Snippets do usuário (builtin) ─────────────────────────────

function _seedSnippets() {
  return [
    {
      id: '__snip_per',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'SNP-PER',
          name: 'per.',
          description: 'Menu de personagens',
          type: 'snippet',
        },
        [COMPONENT_NAMES.TRIGGER]: { value: 'per.' },
        [COMPONENT_NAMES.BODY]: { text: 'Personagens' },
        [COMPONENT_NAMES.SNIPPET_TYPE]: { value: 'menu' },
        [COMPONENT_NAMES.MENU_OPTS]: {
          options: [
            { key: 'kaelin', label: 'Kaelin', type: 'text' },
            { key: 'mira',   label: 'Mira',   type: 'text' },
          ],
        },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
    {
      id: '__snip_pers_cena',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'TPL-PER-CEN',
          name: 'pers.cena',
          description: 'Template de cena com personagem',
          type: 'template',
        },
        [COMPONENT_NAMES.TRIGGER]: { value: 'pers.cena' },
        [COMPONENT_NAMES.BODY]: {
          text: '{personagem} entrou em {local}, sentindo {emocao}.',
        },
        [COMPONENT_NAMES.SNIPPET_TYPE]: { value: 'template' },
        [COMPONENT_NAMES.PLACEHOLDER_DEFS]: {
          defs: [
            { name: 'personagem', type: 'entity.character', opts: null },
            { name: 'local',      type: 'entity.location',  opts: null },
            { name: 'emocao',     type: 'enum', opts: ['medo','raiva','alivio','cansaco'] },
          ],
        },
        [COMPONENT_NAMES.USAGE_COUNT]: { value: 0 },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
    {
      id: '__snip_cena_luta',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'SNP-CEN-LUT',
          name: 'cena.luta',
          description: 'Macro de cena de luta',
          type: 'snippet',
        },
        [COMPONENT_NAMES.TRIGGER]: { value: 'cena.luta' },
        [COMPONENT_NAMES.BODY]: { text: 'cena de luta' },
        [COMPONENT_NAMES.SNIPPET_TYPE]: { value: 'command' },
        [COMPONENT_NAMES.PLACEHOLDER_DEFS]: {
          defs: [
            { name: 'atacante', type: 'entity.character', opts: null },
            { name: 'alvo',     type: 'entity.character', opts: null },
          ],
        },
        [COMPONENT_NAMES.RUNS]: {
          cmds: [
            'mut.add.stats {alvo}.fear 3',
            'mut.add.stats {atacante}.courage 1',
          ],
        },
        [COMPONENT_NAMES.USAGE_COUNT]: { value: 0 },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
  ];
}

// ── Regras de exemplo ─────────────────────────────────────────

function _seedRules() {
  return [
    {
      id: '__rule_goblin_medo',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'RUL-EX-1',
          name: 'todo goblin nasce com medo',
          description: 'Regra de exemplo para criação de personagens',
          type: 'rule',
        },
        [COMPONENT_NAMES.RULE]: {
          on: 'entity:created',
          if: 'newEntity.name ~ /^Goblin/',
          do: 'mut.set.stats {new}.fear 5',
        },
        [COMPONENT_NAMES.RULE_META]: {
          declaredAt: 'T0',
          mode: 'auto',
          tag: 'exemplo',
          firedCount: 0,
          lastFiredAt: null,
          lastTrigger: null,
        },
        [COMPONENT_NAMES.TAGS]: { values: ['exemplo', 'criacao'] },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
    {
      id: '__rule_chuva_tochas',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'RUL-EX-2',
          name: 'chuva apaga tochas',
          description: 'Exemplo de regra climática',
          type: 'rule',
        },
        [COMPONENT_NAMES.RULE]: {
          on: 'Cinza',
          if: 'Cinza.weather = chuva',
          do: 'mut.flag.on {tocha} apagado',
        },
        [COMPONENT_NAMES.RULE_META]: {
          declaredAt: 'T0',
          mode: 'auto',
          tag: 'exemplo',
          firedCount: 0,
          lastFiredAt: null,
          lastTrigger: null,
        },
        [COMPONENT_NAMES.TAGS]: { values: ['exemplo', 'clima'] },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0', updatedAt: 'T0',
          builtin: true, dirty: false,
        },
      },
    },
  ];
}

// ── Meta ──────────────────────────────────────────────────────
//
// Counts verificados (auditoria 25/09/2026):
//   packages: 2 · categories: 3 · sets: 6 · phrases: 9
//   placeholderPackages: 1 · placeholderCategories: 2
//   placeholderSets: 2 · placeholderTerms: 2
//   snippets: 3 · rules: 2

function _seedMeta() {
  const config = getSeedConfig();
  return [
    {
      id: '__seed_meta',
      components: {
        [COMPONENT_NAMES.IDENTITY]: {
          id: 'SEED-META',
          name: 'Seed Meta',
          description: 'Metadados da aplicação inicial de seeds',
          type: 'custom',
        },
        [COMPONENT_NAMES.SEED_META]: {
          seededAt: 'T0',
          version: config.version,
          counts: {
            packages: 2,
            categories: 3,
            sets: 6,
            phrases: 9,
            placeholderPackages: 1,
            placeholderCategories: 2,
            placeholderSets: 2,
            placeholderTerms: 2,
            snippets: 3,
            rules: 2,
          },
        },
        [COMPONENT_NAMES.META]: {
          createdAt: 'T0',
          updatedAt: 'T0',
          builtin: true,
          dirty: false,
        },
      },
    },
  ];
}