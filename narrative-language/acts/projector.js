/**
 * @file projector.js
 * @module narrative-language/acts
 * @description Projeta NarrativeActs em comandos do pipeline ECS existente,
 *              segundo a política ativa (none | literary | simulate).
 *              Combina projeções por SUBTIPO canônico (D-numbers) e por
 *              EIXO dimensional (D5, D7, D8).
 * @imports narrative-language/ir/schema,
 *          narrative-language/ir/catalog,
 *          narrative-language/config,
 *          narrative-language/pt-br/lexicon,
 *          narrative-language/acts/rule-compiler
 * @importedBy narrative-language/index,
 *             systems/narrative-system
 * @level N3
 *
 * Estágio 7 — Modelo canônico Norma C:
 *   - Cada subtipo D-number pode declarar sua própria projeção ECS.
 *   - Cada eixo (D5, D7, D8) projeta `mut.enum scene.*` para capturar
 *     o estado narrativo (POV, ritmo, tempo).
 *   - Estrutura dupla: `_SUBTYPE_PROJECTIONS` (por D-number) e
 *     `_AXIS_PROJECTIONS` (por eixo).
 *   - Projeções customizadas do usuário continuam funcionando por
 *     predicateLemma (via `registerProjection`).
 *
 * Políticas:
 *   none      → nenhum comando emitido.
 *   literary  → cria entidades para menções novas; não muta estado.
 *   simulate  → projeta estado (mut.*, link.*, rul.add) + eixos.
 *
 * Contrato:
 *   project(act, ctx)          → Proposal[]
 *   projectMany(acts, ctx)     → Proposal[]
 *   registerProjection(lemma, handler) → boolean
 *   unregisterProjection(lemma)        → boolean
 *   clearUserProjections()             → void
 *   listDefaultProjections()           → string[]
 *   listUserProjections()              → string[]
 *   hasProjection(lemma)               → boolean
 *   projectionStats(proposals)         → Object
 *   listSubtypeProjections()           → string[]
 *   listAxisProjections()              → string[]
 *
 * Nunca lança. Determinismo preservado.
 */

import { SEMANTIC_ROLES, OPERATIONS } from '../ir/schema.js';
import {
  NARRATIVE_CONFIG,
  DEFAULT_PROJECTION,
  isProjectionValid,
} from '../config.js';
import { classOf as lexClassOf } from '../pt-br/lexicon.js';
import { compileRule } from './rule-compiler.js';

// ══════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════

const _ENTITY_ROLES = Object.freeze([
  'agent', 'experiencer', 'patient', 'theme', 'target',
  'source', 'recipient', 'beneficiary', 'instrument',
  'location', 'origin', 'destination',
]);

// ══════════════════════════════════════════════════════════════
// PROJEÇÕES POR SUBTIPO (D-numbers)
// ══════════════════════════════════════════════════════════════
//
// Cada função recebe um NarrativeAct e devolve string[] com comandos ECS.
// O act tem: proposition.roles, proposition.predicateLemma, subtypes,
// confidence, source.raw.
//
// Convenção: usar `_roleRef(act, '<role>')` para extrair a referência
// textual ou entityId. Devolver [] quando não aplicável.

/**
 * Projeções por subtipo canônico (D-number → handler).
 * @type {Readonly<Object<string, Function>>}
 * @private
 */
const _SUBTYPE_PROJECTIONS = Object.freeze({

  // ═══════════════════════════════════════════════════════════
  // D1 — REPRESENTAR
  // ═══════════════════════════════════════════════════════════

  // ── D1.2 Ação ────────────────────────────────────────────
  'D1.2': (act) => {
    const lemma = act.proposition?.predicateLemma;
    const agent = _roleRef(act, 'agent');
    const dest = _roleRef(act, 'destination');
    const origin = _roleRef(act, 'origin');
    const theme = _roleRef(act, 'theme');
    const target = _roleRef(act, 'target');
    const recipient = _roleRef(act, 'recipient');
    const instrument = _roleRef(act, 'instrument');

    const out = [];

    // Movimento ingressivo / egressivo
    if (lemma === 'entrar' && agent && dest) {
      out.push(`link.set.location ${agent} ${dest}`);
    } else if ((lemma === 'sair' || lemma === 'partir') && agent) {
      out.push(`mut.flag.on ${agent} ausente`);
      if (origin) out.push(`link.pull.location ${agent} ${origin}`);
    } else if (lemma === 'voltar' && agent && dest) {
      out.push(`link.set.location ${agent} ${dest}`);
      out.push(`mut.flag.on ${agent} retornou`);
    } else if (lemma === 'ir' && agent && dest) {
      out.push(`link.set.location ${agent} ${dest}`);
    } else if (lemma === 'chegar' && agent && dest) {
      out.push(`link.set.location ${agent} ${dest}`);
    } else if (lemma === 'fugir' && agent) {
      out.push(`mut.flag.on ${agent} fugiu`);
    }

    // Manipulação física
    if (lemma === 'abrir' && theme) {
      out.push(`mut.flag.on ${theme} aberto`);
    } else if (lemma === 'fechar' && theme) {
      out.push(`mut.flag.off ${theme} aberto`);
    } else if (lemma === 'pegar' && agent && theme) {
      out.push(`link.add.inventory ${agent} ${theme}`);
    } else if (lemma === 'soltar' && agent && theme) {
      out.push(`link.pull.inventory ${agent} ${theme}`);
    } else if (lemma === 'colocar' && agent && theme && dest) {
      out.push(`link.set.location ${theme} ${dest}`);
    }

    // Combate
    if (lemma === 'atacar' || lemma === 'golpear' || lemma === 'ferir') {
      if (agent && target) out.push(`link.add.rival ${agent} ${target}`);
      if (target) out.push(`mut.add.stats ${target}.fear 1`);
    } else if (lemma === 'matar' || lemma === 'assassinar') {
      if (target) out.push(`mut.flag.on ${target} morto`);
    } else if (lemma === 'defender' && agent && target) {
      out.push(`mut.flag.on ${target} defendido_por_${agent}`);
    } else if (lemma === 'sacar' && agent && theme) {
      out.push(`mut.flag.on ${agent} armado`);
      out.push(`link.add.carregando ${agent} ${theme}`);
    }

    // Transferência
    if (lemma === 'dar' || lemma === 'entregar' || lemma === 'enviar') {
      if (agent && recipient && theme) {
        out.push(`link.add.posse ${recipient} ${theme}`);
        out.push(`link.pull.posse ${agent} ${theme}`);
      }
    } else if (lemma === 'receber' && recipient && theme) {
      out.push(`link.add.posse ${recipient} ${theme}`);
    } else if (lemma === 'roubar' || lemma === 'tomar') {
      if (agent && theme) out.push(`link.add.posse ${agent} ${theme}`);
    } else if (lemma === 'comprar' && agent && theme) {
      out.push(`link.add.posse ${agent} ${theme}`);
    } else if (lemma === 'vender' && recipient && theme) {
      out.push(`link.add.posse ${recipient} ${theme}`);
    } else if (lemma === 'oferecer' || lemma === 'presentear' || lemma === 'doar') {
      if (agent && recipient && theme) {
        out.push(`link.add.posse ${recipient} ${theme}`);
      }
    }

    // Social
    if (lemma === 'abraçar' || lemma === 'beijar') {
      if (agent && target) out.push(`link.add.intimo ${agent} ${target}`);
    } else if (lemma === 'trair' && agent && target) {
      out.push(`mut.flag.on ${agent} traiu_${target}`);
    } else if (lemma === 'ajudar' && agent && recipient) {
      out.push(`link.add.aliado ${agent} ${recipient}`);
    } else if (lemma === 'ameaçar' && agent && target) {
      out.push(`mut.add.stats ${target}.fear 1`);
    }

    // Criação
    if (lemma === 'criar' || lemma === 'forjar' || lemma === 'fabricar') {
      if (theme) out.push(`mut.flag.on ${theme} criado`);
    }

    // Destruição
    if (lemma === 'destruir' || lemma === 'quebrar' || lemma === 'demolir') {
      if (theme) out.push(`mut.flag.on ${theme} destruido`);
    }

    // Ato de fala performativo (batizar, nomear, consagrar)
    if (lemma === 'batizar' || lemma === 'nomear' || lemma === 'consagrar') {
      if (target) out.push(`mut.enum ${target}.status consagrado`);
    }

    return out;
  },

  // ── D1.1 Acontecimento ───────────────────────────────────
  'D1.1': (act) => {
    const lemma = act.proposition?.predicateLemma;
    const theme = _roleRef(act, 'theme');
    const out = [];

    // Acontecimentos típicos: cair, tropeçar, escorregar
    if (lemma === 'cair' || lemma === 'tropeçar') {
      if (theme) out.push(`mut.flag.on ${theme} caiu`);
    }
    return out;
  },

  // ── D1.4 Mudança-em-cena ─────────────────────────────────
  'D1.4': (act) => {
    const theme = _roleRef(act, 'theme');
    const target = _roleRef(act, 'target');
    const out = [];
    if (theme && target) {
      out.push(`mut.enum ${theme}.state ${target}`);
    } else if (theme) {
      out.push(`mut.flag.on ${theme} mudou`);
    }
    return out;
  },

  // ── D1.6 Conduta Fisiológica ─────────────────────────────
  'D1.6': (act) => {
    const lemma = act.proposition?.predicateLemma;
    const exp = _roleRef(act, 'experiencer') || _roleRef(act, 'theme');
    const out = [];
    if (!exp) return out;

    if (lemma === 'morrer') {
      out.push(`mut.flag.on ${exp} morto`);
    } else if (lemma === 'nascer') {
      out.push(`mut.flag.on ${exp} vivo`);
    } else if (lemma === 'adoecer') {
      out.push(`mut.flag.on ${exp} doente`);
    } else if (lemma === 'sarar') {
      out.push(`mut.flag.off ${exp} doente`);
    } else if (lemma === 'adormecer') {
      out.push(`mut.flag.on ${exp} dormindo`);
    } else if (lemma === 'acordar') {
      out.push(`mut.flag.off ${exp} dormindo`);
    } else if (lemma === 'desmaiar') {
      out.push(`mut.flag.on ${exp} inconsciente`);
    } else {
      out.push(`mut.flag.on ${exp} somatic_${lemma}`);
    }
    return out;
  },

  // ── D1.7 Fenômeno Atmosférico ────────────────────────────
  'D1.7': (act) => {
    const lemma = act.proposition?.predicateLemma;
    const out = [];
    if (lemma) out.push(`mut.flag.on clima ${lemma}`);
    return out;
  },

  // ═══════════════════════════════════════════════════════════
  // D3 — EXPOR
  // ═══════════════════════════════════════════════════════════

  // ── D3.1 Contextualizar ──────────────────────────────────
  'D3.1': (act) => {
    const out = [];
    out.push(`mut.flag.on cena contextualizada`);
    return out;
  },

  // ── D3.3 Conceituar ──────────────────────────────────────
  'D3.3': (act) => {
    const theme = _roleRef(act, 'theme');
    const target = _roleRef(act, 'target');
    const out = [];
    if (theme && target) {
      out.push(`mut.enum ${theme}.class ${target}`);
    }
    return out;
  },

  // ═══════════════════════════════════════════════════════════
  // D4 — INTERIORIZAR
  // ═══════════════════════════════════════════════════════════

  // ── D4.1 Percepção ───────────────────────────────────────
  'D4.1': (act) => {
    const exp = _roleRef(act, 'experiencer');
    const target = _roleRef(act, 'target');
    const out = [];
    if (exp && target) {
      out.push(`kno.learn ${exp} "percebeu ${target}"`);
    } else if (exp) {
      out.push(`mut.flag.on ${exp} percebeu`);
    }
    return out;
  },

  // ── D4.2 Cognição ────────────────────────────────────────
  'D4.2': (act) => {
    const exp = _roleRef(act, 'experiencer');
    const theme = _roleRef(act, 'theme');
    const out = [];
    if (exp && theme) {
      out.push(`kno.learn ${exp} "pensou em ${theme}"`);
    } else if (exp) {
      out.push(`mut.flag.on ${exp} pensou`);
    }
    return out;
  },

  // ── D4.3 Crença/Dúvida ───────────────────────────────────
  'D4.3': (act) => {
    const lemma = act.proposition?.predicateLemma;
    const exp = _roleRef(act, 'experiencer');
    const theme = _roleRef(act, 'theme');
    const out = [];
    if (!exp) return out;

    if (lemma === 'saber' || lemma === 'conhecer') {
      if (theme) out.push(`kno.learn ${exp} "sabe ${theme}"`);
    } else if (lemma === 'achar' || lemma === 'acreditar' || lemma === 'crer') {
      if (theme) out.push(`kno.learn ${exp} "acredita ${theme}"`);
    } else if (lemma === 'duvidar' || lemma === 'suspeitar') {
      if (theme) out.push(`mut.flag.on ${exp} duvida_${theme}`);
    } else {
      out.push(`mut.flag.on ${exp} crença`);
    }
    return out;
  },

  // ── D4.4 Memória ─────────────────────────────────────────
  'D4.4': (act) => {
    const exp = _roleRef(act, 'experiencer');
    const theme = _roleRef(act, 'theme');
    const out = [];
    if (exp && theme) {
      out.push(`kno.learn ${exp} "lembrou ${theme}"`);
    } else if (exp) {
      out.push(`mut.flag.on ${exp} lembrou`);
    }
    return out;
  },

  // ── D4.5 Imaginação ──────────────────────────────────────
  'D4.5': (act) => {
    const exp = _roleRef(act, 'experiencer');
    const theme = _roleRef(act, 'theme');
    const out = [];
    if (exp && theme) {
      out.push(`mut.enum ${exp}.imagination ${theme}`);
    }
    return out;
  },

  // ── D4.6 Emoção ──────────────────────────────────────────
  'D4.6': (act) => {
    const lemma = act.proposition?.predicateLemma;
    const exp = _roleRef(act, 'experiencer') || _roleRef(act, 'agent');
    const target = _roleRef(act, 'target') || _roleRef(act, 'theme');
    const out = [];
    if (!exp) return out;

    // Mapeia verbo para emoção
    const emotion = _emotionForLemma(lemma);
    if (emotion) {
      out.push(`mut.enum ${exp}.emotion ${emotion}`);
    } else if (target) {
      out.push(`mut.enum ${exp}.emotion_about ${target}`);
    }
    return out;
  },

  // ── D4.7 Desejo ──────────────────────────────────────────
  'D4.7': (act) => {
    const exp = _roleRef(act, 'experiencer');
    const theme = _roleRef(act, 'theme');
    const out = [];
    if (!exp) return out;
    if (theme) {
      out.push(`mut.flag.on ${exp} deseja_${theme}`);
    } else {
      out.push(`mut.flag.on ${exp} deseja`);
    }
    return out;
  },

  // ── D4.8 Intenção ────────────────────────────────────────
  'D4.8': (act) => {
    const exp = _roleRef(act, 'experiencer');
    const theme = _roleRef(act, 'theme');
    const out = [];
    if (exp) {
      out.push(`mut.flag.on ${exp} intenta`);
      if (theme) out.push(`mut.enum ${exp}.intent ${theme}`);
    }
    return out;
  },

  // ── D4.9 Decisão ─────────────────────────────────────────
  'D4.9': (act) => {
    const exp = _roleRef(act, 'experiencer');
    const theme = _roleRef(act, 'theme');
    const out = [];
    if (exp && theme) {
      out.push(`mut.enum ${exp}.decided ${theme}`);
    } else if (exp) {
      out.push(`mut.flag.on ${exp} decidiu`);
    }
    return out;
  },

  // ── D4.10 Planejamento ───────────────────────────────────
  'D4.10': (act) => {
    const exp = _roleRef(act, 'experiencer');
    const out = [];
    if (exp) out.push(`mut.flag.on ${exp} planejando`);
    return out;
  },

  // ═══════════════════════════════════════════════════════════
  // D5 — ENUNCIAR
  // ═══════════════════════════════════════════════════════════

  // ── D5.1 Assertivo ───────────────────────────────────────
  'D5.1': (act) => {
    const agent = _roleRef(act, 'agent');
    const recipient = _roleRef(act, 'recipient');
    const theme = _roleRef(act, 'theme');
    const out = [];
    if (agent && recipient && theme) {
      out.push(`kno.learn ${recipient} "ouviu de ${agent}: ${theme}"`);
    } else if (agent) {
      out.push(`mut.flag.on ${agent} falou`);
    }
    return out;
  },

  // ── D5.2 Interrogativo ───────────────────────────────────
  'D5.2': (act) => {
    const agent = _roleRef(act, 'agent');
    const recipient = _roleRef(act, 'recipient');
    const out = [];
    if (agent && recipient) {
      out.push(`mut.flag.on ${recipient} questionado_por_${agent}`);
    }
    return out;
  },

  // ── D5.3 Diretivo ────────────────────────────────────────
  'D5.3': (act) => {
    const lemma = act.proposition?.predicateLemma;
    const agent = _roleRef(act, 'agent');
    const recipient = _roleRef(act, 'recipient');
    const out = [];
    if (!agent || !recipient) return out;

    if (lemma === 'ordenar' || lemma === 'exigir' || lemma === 'mandar') {
      out.push(`mut.flag.on ${recipient} ordenado_por_${agent}`);
    } else if (lemma === 'proibir') {
      out.push(`mut.flag.on ${recipient} proibido_por_${agent}`);
    } else if (lemma === 'autorizar') {
      out.push(`mut.flag.on ${recipient} autorizado_por_${agent}`);
    } else {
      out.push(`mut.flag.on ${recipient} pedido_de_${agent}`);
    }
    return out;
  },

  // ── D5.4 Comissivo ───────────────────────────────────────
  'D5.4': (act) => {
    const agent = _roleRef(act, 'agent');
    const theme = _roleRef(act, 'theme');
    const out = [];
    if (agent) {
      out.push(`mut.flag.on ${agent} comprometeu`);
      if (theme) out.push(`mut.enum ${agent}.promise ${theme}`);
    }
    return out;
  },

  // ── D5.5 Expressivo ──────────────────────────────────────
  'D5.5': (act) => {
    const lemma = act.proposition?.predicateLemma;
    const agent = _roleRef(act, 'agent');
    const out = [];
    if (agent) {
      out.push(`mut.enum ${agent}.expression ${lemma ?? 'vocal'}`);
    }
    return out;
  },

  // ── D5.6 Declarativo ─────────────────────────────────────
  'D5.6': (act) => {
    const lemma = act.proposition?.predicateLemma;
    const agent = _roleRef(act, 'agent');
    const target = _roleRef(act, 'target');
    const out = [];
    if (!agent) return out;

    if (lemma === 'condenar' && target) {
      out.push(`mut.enum ${target}.status condenado`);
      out.push(`mut.flag.on ${target} condenado_por_${agent}`);
    } else if (lemma === 'absolver' && target) {
      out.push(`mut.enum ${target}.status absolvido`);
    } else if (lemma === 'batizar' && target) {
      out.push(`mut.enum ${target}.status batizado`);
    } else if (lemma === 'coroar' && target) {
      out.push(`mut.enum ${target}.status coroado`);
    } else {
      out.push(`mut.flag.on ${agent} declarou`);
    }
    return out;
  },

  // ── D5.7 Fático ──────────────────────────────────────────
  'D5.7': (act) => {
    const agent = _roleRef(act, 'agent');
    const recipient = _roleRef(act, 'recipient');
    const out = [];
    if (agent && recipient) {
      out.push(`mut.flag.on ${recipient} contactado_por_${agent}`);
    }
    return out;
  },

  // ═══════════════════════════════════════════════════════════
  // D6 — AVALIAR
  // ═══════════════════════════════════════════════════════════

  // ── D6.1 Juízo Ético/Prático ─────────────────────────────
  'D6.1': (act) => {
    return [`mut.flag.on narrador avaliou_moral`];
  },

  // ── D6.2 Juízo Epistêmico ────────────────────────────────
  'D6.2': (act) => {
    return [`mut.flag.on narrador avaliou_epistemico`];
  },

  // ── D6.3 Interpretar ─────────────────────────────────────
  'D6.3': (act) => {
    return [`mut.flag.on narrador interpretou`];
  },

  // ── D6.4 Ironia/Contraste ────────────────────────────────
  'D6.4': (act) => {
    return [`mut.flag.on narrador ironizou`];
  },

  // ── D6.5 Comentar ────────────────────────────────────────
  'D6.5': (act) => {
    return [`mut.flag.on narrador comentou`];
  },

  // ── D6.6 Refletir ────────────────────────────────────────
  'D6.6': (act) => {
    return [`mut.flag.on narrador refletiu`];
  },
});

// ══════════════════════════════════════════════════════════════
// PROJEÇÕES POR EIXO
// ══════════════════════════════════════════════════════════════

/**
 * Projeções por eixo dimensional. Cada função recebe o objeto de eixos
 * de UMA operação (ex: `axes.D8 = { temporal: 'analepse' }`) e devolve
 * comandos ECS.
 * @type {Readonly<Object<string, Function>>}
 * @private
 */
const _AXIS_PROJECTIONS = Object.freeze({

  // ── D5 — Enunciar ────────────────────────────────────────
  D5: (axes) => {
    const out = [];
    if (axes.modo) {
      out.push(`mut.enum cena.speech_mode ${axes.modo}`);
    }
    if (axes.enunciador) {
      out.push(`mut.enum cena.speaker ${axes.enunciador}`);
    }
    return out;
  },

  // ── D7 — Focalizar ───────────────────────────────────────
  D7: (axes) => {
    const out = [];
    if (axes.grau) {
      out.push(`mut.enum cena.focalization ${axes.grau}`);
    }
    if (axes.estabilidade) {
      out.push(`mut.enum cena.pov_stability ${axes.estabilidade}`);
    }
    if (axes.alcanceK) {
      out.push(`mut.enum cena.k_scope ${axes.alcanceK}`);
    }
    return out;
  },

  // ── D8 — Estruturar ──────────────────────────────────────
  D8: (axes) => {
    const out = [];
    if (axes.temporal) {
      out.push(`mut.enum cena.time ${axes.temporal}`);
    }
    if (axes.informacional) {
      out.push(`mut.enum cena.info_flow ${axes.informacional}`);
    }
    if (axes.discursiva) {
      out.push(`mut.enum cena.structure ${axes.discursiva}`);
    }
    if (axes.distancia) {
      out.push(`mut.enum cena.pace ${axes.distancia}`);
    }
    return out;
  },
});

// ══════════════════════════════════════════════════════════════
// PROJEÇÕES CUSTOMIZADAS DO USUÁRIO
// ══════════════════════════════════════════════════════════════

/** @type {Map<string, Function>} @private */
const _userProjections = new Map();

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * Extrai uma referência textual (entityId ou raw) de um papel.
 * @private
 */
function _roleRef(act, roleName) {
  const role = act?.proposition?.roles?.[roleName];
  if (!role) return null;
  if (role.kind === 'entity' && role.entityId) return role.entityId;
  if (role.raw) return role.raw;
  if (role.lemma) return role.lemma;
  return null;
}

/**
 * Mapeia um verbo de emoção para o enum de emoção.
 * @private
 */
function _emotionForLemma(lemma) {
  if (!lemma) return null;
  switch (lemma) {
    case 'amar':        return 'amor';
    case 'odiar':
    case 'detestar':
    case 'abominar':
    case 'desprezar':   return 'odio';
    case 'temer':       return 'medo';
    case 'gostar':
    case 'adorar':      return 'afeto';
    case 'invejar':
    case 'cobiçar':     return 'inveja';
    case 'admirar':
    case 'respeitar':
    case 'honrar':      return 'admiracao';
    case 'confiar':     return 'confianca';
    case 'sofrer':      return 'sofrimento';
    case 'alegrar':     return 'alegria';
    case 'entristecer': return 'tristeza';
    case 'irritar':     return 'irritacao';
    case 'enfurecer':   return 'furia';
    case 'horrorizar':
    case 'assustar':    return 'horror';
    default:            return null;
  }
}

/**
 * Constrói a proposta a partir do act e do comando.
 * @private
 */
function _mkProposal({ act, command, kind, subtypeId, source }) {
  return {
    actId: act.id,
    command,
    confidence: act.confidence,
    operation: act.operations?.[0] ?? 'represent',
    subtypeId: subtypeId ?? null,
    source: source ?? 'subtype',
    span: act.source,
    preview: _previewFor(command, kind),
    reversible: true,
    kind,
  };
}

/**
 * Texto legível para o preview.
 * @private
 */
function _previewFor(command, kind) {
  if (!command) return '';
  if (kind === 'create') return `Cria: ${command}`;
  if (kind === 'rule') return `Regra: ${command}`;
  if (kind === 'link') return `Link: ${command}`;
  return `Aplica: ${command}`;
}

/**
 * Infere o tipo de entidade a partir da classe do lemma.
 * @private
 */
function _entityTypeFor(lemma, role) {
  const cls = lexClassOf(lemma);
  if (cls === 'person') return 'character';
  if (cls === 'place') return 'location';
  if (cls === 'object') return 'item';
  if (cls === 'group') return 'faction';
  if (role?.raw && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(role.raw)) return 'character';
  return 'custom';
}

function _isNewMention(ref) {
  if (!ref) return false;
  if (ref.kind === 'literal') return true;
  return false;
}

// ══════════════════════════════════════════════════════════════
// CREATES
// ══════════════════════════════════════════════════════════════

/**
 * Projeta entidades novas (criadas por menção).
 * @private
 */
function _proposalsForCreates(act) {
  const out = [];
  const seen = new Set();
  const roles = act.proposition?.roles ?? {};

  for (const [roleName, ref] of Object.entries(roles)) {
    if (!_ENTITY_ROLES.includes(roleName)) continue;
    if (!_isNewMention(ref)) continue;
    const name = ref.raw ?? ref.lemma;
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const type = _entityTypeFor(ref.lemma, ref);
    const safeName = String(name).replace(/\s+/g, '_');

    out.push(_mkProposal({
      act,
      command: `ent.create.${type} ${safeName}`,
      kind: 'create',
      subtypeId: null,
      source: 'create',
    }));
  }

  return out;
}

// ══════════════════════════════════════════════════════════════
// REGRAS NATURAIS
// ══════════════════════════════════════════════════════════════

/**
 * Projeta regras naturais (só se o act tem operation structure).
 * @private
 */
function _proposalsForRules(act) {
  if (!Array.isArray(act.operations) || !act.operations.includes('structure')) {
    return [];
  }

  let compilation = null;
  try {
    compilation = compileRule(act, null, {});
  } catch {
    return [];
  }

  if (!compilation || !compilation.ok || !compilation.command) return [];

  const rule = compilation.rule;
  const confidence = rule?.confidence ?? 0.5;

  return [_mkProposal({
    act,
    command: compilation.command,
    kind: 'rule',
    subtypeId: null,
    source: 'rule',
  })];
}

// ══════════════════════════════════════════════════════════════
// PROJEÇÕES DE USUÁRIO (por predicateLemma)
// ══════════════════════════════════════════════════════════════

/**
 * Aplica projeção customizada do usuário.
 * @private
 */
function _proposalsForUserProjection(act) {
  const lemma = act.proposition?.predicateLemma;
  if (!lemma) return [];
  const handler = _userProjections.get(lemma);
  if (typeof handler !== 'function') return [];

  let commands;
  try {
    commands = handler(act);
  } catch {
    return [];
  }
  if (!Array.isArray(commands)) return [];

  const out = [];
  for (const cmd of commands) {
    if (typeof cmd !== 'string' || !cmd.trim()) continue;
    const kind = cmd.startsWith('link.') ? 'link'
      : cmd.startsWith('rul.') ? 'rule'
      : cmd.startsWith('kno.') ? 'mutate'
      : 'mutate';

    out.push(_mkProposal({
      act,
      command: cmd,
      kind,
      subtypeId: null,
      source: 'user',
    }));
  }
  return out;
}

// ══════════════════════════════════════════════════════════════
// PROJEÇÕES POR SUBTIPO + EIXO
// ══════════════════════════════════════════════════════════════

/**
 * Projeta comandos por subtipo (D-number).
 * @private
 */
function _proposalsForSubtypes(act) {
  const out = [];
  const subtypes = act.subtypes ?? {};

  for (const [dOp, sub] of Object.entries(subtypes)) {
    const id = sub?.id;
    if (!id) continue;

    const handler = _SUBTYPE_PROJECTIONS[id];
    if (typeof handler !== 'function') continue;

    let commands;
    try {
      commands = handler(act);
    } catch {
      continue;
    }
    if (!Array.isArray(commands)) continue;

    for (const cmd of commands) {
      if (typeof cmd !== 'string' || !cmd.trim()) continue;

      const kind = cmd.startsWith('link.') ? 'link'
        : cmd.startsWith('rul.') ? 'rule'
        : cmd.startsWith('kno.') ? 'mutate'
        : cmd.startsWith('ent.') ? 'create'
        : 'mutate';

      out.push(_mkProposal({
        act,
        command: cmd,
        kind,
        subtypeId: id,
        source: 'subtype',
      }));
    }
  }

  return out;
}

/**
 * Projeta comandos por eixo (D5, D7, D8).
 * @private
 */
function _proposalsForAxes(act) {
  const out = [];
  const axes = act.axes ?? {};

  for (const [dOp, opAxes] of Object.entries(axes)) {
    if (!opAxes || typeof opAxes !== 'object') continue;
    if (Object.keys(opAxes).length === 0) continue;

    const handler = _AXIS_PROJECTIONS[dOp];
    if (typeof handler !== 'function') continue;

    let commands;
    try {
      commands = handler(opAxes);
    } catch {
      continue;
    }
    if (!Array.isArray(commands)) continue;

    for (const cmd of commands) {
      if (typeof cmd !== 'string' || !cmd.trim()) continue;

      out.push(_mkProposal({
        act,
        command: cmd,
        kind: 'mutate',
        subtypeId: null,
        source: 'axis',
      }));
    }
  }

  return out;
}

// ══════════════════════════════════════════════════════════════
// API PRINCIPAL
// ══════════════════════════════════════════════════════════════

/**
 * Projeta um único ato.
 *
 * @param {Object} act
 * @param {Object} [ctx={}]
 * @param {string} [ctx.projection] — política ativa
 * @returns {Object[]}
 */
export function project(act, ctx = {}) {
  if (!act || typeof act !== 'object') return [];
  if (!Array.isArray(act.operations) || act.operations.length === 0) return [];

  const policy = isProjectionValid(ctx.projection)
    ? ctx.projection
    : (isProjectionValid(NARRATIVE_CONFIG.projection)
        ? NARRATIVE_CONFIG.projection
        : DEFAULT_PROJECTION);

  if (policy === 'none') return [];

  const proposals = [];

  // ── 1. Creates (literary + simulate) ───────────────────
  proposals.push(..._proposalsForCreates(act));

  // ── 2. Mutações + subtipos + eixos + regras + user (só simulate) ──
  if (policy === 'simulate') {
    // Ordem de prioridade:
    //   1. Projeção customizada do usuário (sobrescreve o default)
    //   2. Projeção por subtipo (default canônico)
    //   3. Projeção por eixo (meta-estado narrativo)
    //   4. Projeção por regra natural

    const userProposals = _proposalsForUserProjection(act);
    if (userProposals.length > 0) {
      proposals.push(...userProposals);
    } else {
      proposals.push(..._proposalsForSubtypes(act));
    }

    proposals.push(..._proposalsForAxes(act));
    proposals.push(..._proposalsForRules(act));
  }

  return proposals;
}

export function projectMany(acts, ctx = {}) {
  if (!Array.isArray(acts)) return [];
  const out = [];
  for (const act of acts) {
    try {
      out.push(...project(act, ctx));
    } catch { /* isola */ }
  }
  return out;
}

// ══════════════════════════════════════════════════════════════
// REGISTRO DE PROJEÇÕES DO USUÁRIO
// ══════════════════════════════════════════════════════════════

/**
 * Registra uma projeção customizada para um predicateLemma.
 * Sobrescreve qualquer projeção default (por subtipo) para esse verbo.
 *
 * @param {string} predicateLemma
 * @param {Function} handler — (act) => string[]
 * @returns {boolean}
 */
export function registerProjection(predicateLemma, handler) {
  if (typeof predicateLemma !== 'string' || !predicateLemma) return false;
  if (typeof handler !== 'function') return false;
  _userProjections.set(predicateLemma, handler);
  return true;
}

export function unregisterProjection(predicateLemma) {
  return _userProjections.delete(predicateLemma);
}

export function clearUserProjections() {
  _userProjections.clear();
}

export function listDefaultProjections() {
  return Object.keys(_SUBTYPE_PROJECTIONS).sort();
}

export function listSubtypeProjections() {
  return Object.keys(_SUBTYPE_PROJECTIONS).sort();
}

export function listAxisProjections() {
  return Object.keys(_AXIS_PROJECTIONS).sort();
}

export function listUserProjections() {
  return Array.from(_userProjections.keys()).sort();
}

export function hasProjection(predicateLemma) {
  if (_userProjections.has(predicateLemma)) return true;
  return false;
}

// ══════════════════════════════════════════════════════════════
// ESTATÍSTICAS
// ══════════════════════════════════════════════════════════════

/**
 * Agrega propostas em estatísticas.
 * @param {Object[]} proposals
 * @returns {Object}
 */
export function projectionStats(proposals) {
  if (!Array.isArray(proposals)) {
    return { total: 0, byKind: {}, bySource: {}, bySubtype: {}, avgConfidence: 0 };
  }

  const byKind = {};
  const bySource = {};
  const bySubtype = {};
  let sumConf = 0;

  for (const p of proposals) {
    byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
    const src = p.source ?? 'subtype';
    bySource[src] = (bySource[src] ?? 0) + 1;
    if (p.subtypeId) {
      bySubtype[p.subtypeId] = (bySubtype[p.subtypeId] ?? 0) + 1;
    }
    sumConf += p.confidence ?? 0;
  }

  return {
    total: proposals.length,
    byKind,
    bySource,
    bySubtype,
    avgConfidence: proposals.length > 0
      ? Math.round((sumConf / proposals.length) * 100) / 100
      : 0,
  };
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const Projector = Object.freeze({
  project,
  projectMany,
  registerProjection,
  unregisterProjection,
  clearUserProjections,
  listDefaultProjections,
  listSubtypeProjections,
  listAxisProjections,
  listUserProjections,
  hasProjection,
  projectionStats,
});