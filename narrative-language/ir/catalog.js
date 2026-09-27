/**
 * @file catalog.js
 * @module narrative-language/ir
 * @description Catálogo canônico da Norma C. Fonte única de verdade sobre
 *              a taxonomia das 8 operações narrativas (D1–D8), seus subtipos
 *              atômicos, os eixos dimensionais (D5, D7, D8), os traits
 *              transversais e o mapa de aliases v1→v2.
 * @imports — (nenhum)
 * @importedBy narrative-language/acts/subtype-detector,
 *             narrative-language/acts/axis-detector,
 *             narrative-language/acts/projector,
 *             narrative-language/pipeline/interpreter,
 *             systems/narrative-system,
 *             ui/panel-right
 * @level N0
 *
 * Este arquivo é deliberadamente "burro": apenas dados congelados.
 * Nenhuma função de análise, nenhuma dependência externa.
 *
 * Estrutura de IDs:
 *   Operação:       'D1' … 'D8'
 *   Subtipo:        'D1.1' … 'D6.6'  (+ 'D3.4a'..'D3.4d' para sub-variantes)
 *   Eixo:           nome string ('grau', 'temporal', ...)
 *   Valor de eixo:  string ('internal', 'analepse', ...)
 *   Trait:          '+agentive', '-telic', ...
 */

// ══════════════════════════════════════════════════════════════
// VERSÃO DO CATÁLOGO
// ══════════════════════════════════════════════════════════════

/**
 * Versão do catálogo. Bump obrigatório em qualquer alteração de schema.
 * @type {string}
 */
export const CATALOG_VERSION = '2.0.0';

// ══════════════════════════════════════════════════════════════
// TRAITS TRANSVERSAIS
// ══════════════════════════════════════════════════════════════
//
// Traits são propriedades booleanas que cortam através das operações.
// Um subtipo declara seus traits; o detector combina com os traits
// herdados dos ancestrais.
//
// Convenção:
//   '+' → propriedade presente (ex: +agentive = tem agente volitivo)
//   '-' → propriedade explicitamente ausente (ex: -telic = não tem fim)

/**
 * Catálogo de traits transversais.
 * @type {Readonly<Object<string, { label:string, description:string }>>}
 */
export const TRAITS = Object.freeze({
  // ── Temporalidade / Aspecto ───────────────────────────────
  '+telic':     { label: 'Télico',      description: 'Tem fim definido e um resultado esperado.' },
  '-telic':     { label: 'Atélico',     description: 'Sem fim intrínseco; estende-se sem clímax.' },
  '+durative':  { label: 'Durativo',    description: 'Estende-se no tempo como processo contínuo.' },
  '+punctual':  { label: 'Pontual',     description: 'Ocorre num único instante.' },
  '+iterative': { label: 'Iterativo',   description: 'Repete-se em ciclos.' },
  '+habitual':  { label: 'Habitual',    description: 'Padrão repetido com regularidade.' },
  '+change':    { label: 'Mudança',     description: 'Transição de estado (σ1 → σ2).' },
  '+stative':   { label: 'Estativo',    description: 'Sem mudança; condição mantida.' },

  // ── Agência / Volição ─────────────────────────────────────
  '+agentive':  { label: 'Agentivo',    description: 'Tem agente volitivo responsável.' },
  '-agentive':  { label: 'Não-agentivo',description: 'Sem agente; ocorrência espontânea.' },
  '+volitive':  { label: 'Volitivo',    description: 'Requer intenção do participante.' },
  '-volitive':  { label: 'Não-volitivo',description: 'Acontece sem controle (reflexo, biologia).' },

  // ── Percepção / Cognição ──────────────────────────────────
  '+perceptive':{ label: 'Perceptivo',  description: 'Envolve captação sensorial.' },
  '+cognitive': { label: 'Cognitivo',   description: 'Envolve processamento intelectual.' },
  '+affective': { label: 'Afetivo',     description: 'Envolve experiência emocional.' },

  // ── Observabilidade / Focalização ─────────────────────────
  '+observable':{ label: 'Observável',  description: 'Detectável por um observador externo.' },
  '+focal-able':{ label: 'Focalizável', description: 'Pode originar focalização.' },

  // ── Modalidade / Força ────────────────────────────────────
  '+intensive': { label: 'Intensivo',   description: 'Aumenta a intensidade de outra operação.' },
  '+social':    { label: 'Social',      description: 'Envolve interação entre participantes.' },
  '+ambient':   { label: 'Ambiental',   description: 'Fenômeno do mundo, não de um agente.' },
  '+eventive':  { label: 'Eventivo',    description: 'Ocorrência com marca temporal.' },

  // ── Atos de fala (Searle) ─────────────────────────────────
  '+truth-claim':       { label: 'Reivindica verdade',   description: 'Assertivo: declara sobre o mundo.' },
  '+information-seeking':{ label: 'Busca informação',    description: 'Interrogativo: abre questão.' },
  '+action-oriented':   { label: 'Orientado à ação',     description: 'Diretivo: visa orientar ação de outro.' },
  '+future-commitment': { label: 'Compromete futuro',    description: 'Comissivo: falante se compromete.' },
  '+world-changing':    { label: 'Muda o mundo',         description: 'Declarativo: altera estado por força própria.' },
  '+channel-oriented':  { label: 'Focado no canal',      description: 'Fático: mantém contato, não informa.' },

  // ── Modalidade epistêmica ─────────────────────────────────
  '+belief':    { label: 'Crença',      description: 'Atribui valor de verdade sem prova.' },
  '+doubt':     { label: 'Dúvida',      description: 'Suspende ou nega valor de verdade.' },
  '+memory':    { label: 'Memória',     description: 'Evoca fato do passado.' },
  '+imagination':{ label: 'Imaginação', description: 'Projeta cenário não-factual.' },
});

// ══════════════════════════════════════════════════════════════
// CATÁLOGO DE OPERAÇÕES (Norma C)
// ══════════════════════════════════════════════════════════════

/**
 * Catálogo das 8 operações narrativas canônicas com seus subtipos,
 * eixos dimensionais e traits padrão.
 *
 * Campos:
 *   id           — 'D1' … 'D8'
 *   label        — nome humano PT-BR
 *   role         — 'core' | 'mind' | 'coord'
 *   color        — cor hex para highlight
 *   description  — 1 linha explicativa
 *   traits       — traits padrão herdados por todos os subtipos (opcional)
 *   axes         — mapa nome→valores[] (só D5, D7, D8)
 *   subtypes     — mapa id→{ label, parent, traits, description }
 *
 * @type {Readonly<Object>}
 */
export const OPERATIONS = Object.freeze({

  // ═══════════════════════════════════════════════════════════
  // D1 — REPRESENTAR
  // ═══════════════════════════════════════════════════════════
  D1: Object.freeze({
    id: 'D1',
    label: 'Representar',
    role: 'core',
    color: '#4a90e2',
    description: 'Ocorrências materiais, ações, estados e o relógio do mundo em cena.',
    traits: Object.freeze(['+eventive']),
    subtypes: Object.freeze({
      'D1.1': Object.freeze({
        label: 'Acontecimento',
        parent: null,
        traits: Object.freeze(['-agentive', '+punctual']),
        description: 'Ocorrência física, mecânica ou acidental sem agência intencional.',
      }),
      'D1.2': Object.freeze({
        label: 'Ação',
        parent: null,
        traits: Object.freeze(['+agentive', '+volitive']),
        description: 'Operação e ato corporal físico realizado voluntariamente por um agente.',
      }),
      'D1.3': Object.freeze({
        label: 'Estado-em-cena',
        parent: null,
        traits: Object.freeze(['+stative', '-telic']),
        description: 'Condição física ou deôntica obtida e mantida no relógio presente da cena.',
      }),
      'D1.4': Object.freeze({
        label: 'Mudança-em-cena',
        parent: null,
        traits: Object.freeze(['+change', '+telic', '+observable']),
        description: 'Transição ou virada de estado visível (σ1 → σ2) presenciada na cena.',
      }),
      'D1.5': Object.freeze({
        label: 'Processo',
        parent: null,
        traits: Object.freeze(['+durative', '-telic']),
        description: 'Ocorrência material durativa que se estende continuamente na cena.',
      }),
      'D1.6': Object.freeze({
        label: 'Conduta Fisiológica',
        parent: null,
        traits: Object.freeze(['-volitive', '+observable']),
        description: 'Manifestação orgânica, reflexo e reação biológica involuntária do corpo.',
      }),
      'D1.7': Object.freeze({
        label: 'Fenômeno Atmosférico',
        parent: null,
        traits: Object.freeze(['-agentive', '+ambient', '+durative']),
        description: 'Dinâmica física ambiental, meteorológica ou ecológica do mundo.',
      }),
    }),
  }),

  // ═══════════════════════════════════════════════════════════
  // D2 — DESCREVER
  // ═══════════════════════════════════════════════════════════
  D2: Object.freeze({
    id: 'D2',
    label: 'Descrever',
    role: 'core',
    color: '#38a169',
    description: 'Qualidades e traços perceptíveis, com o relógio da ação pausado.',
    traits: Object.freeze(['+stative', '-telic']),
    subtypes: Object.freeze({
      'D2.1': Object.freeze({
        label: 'Entidade/Corpo',
        parent: null,
        traits: Object.freeze([]),
        description: 'Caracterização fisionômica, traços identificadores e marcas de personagens.',
      }),
      'D2.2': Object.freeze({
        label: 'Espaço',
        parent: null,
        traits: Object.freeze(['+ambient']),
        description: 'Planta, dimensões, contorno e arquitetura estática de um cenário.',
      }),
      'D2.3': Object.freeze({
        label: 'Objeto',
        parent: null,
        traits: Object.freeze([]),
        description: 'Propriedades visuais, materiais e táteis de artefatos inanimados.',
      }),
      'D2.4': Object.freeze({
        label: 'Gesto/Porte',
        parent: null,
        traits: Object.freeze(['+observable']),
        description: 'Microatitude corporal e disposição física significativa sem ação plena.',
      }),
      'D2.5': Object.freeze({
        label: 'Atmosfera',
        parent: null,
        traits: Object.freeze(['+ambient']),
        description: 'Qualidade perceptiva e clima afetivo global que envolve a cena.',
      }),
    }),
  }),

  // ═══════════════════════════════════════════════════════════
  // D3 — EXPOR
  // ═══════════════════════════════════════════════════════════
  D3: Object.freeze({
    id: 'D3',
    label: 'Expor',
    role: 'core',
    color: '#d69e2e',
    description: 'Informação proposicional, leis e históricos atemporais.',
    traits: Object.freeze(['+stative', '-telic']),
    subtypes: Object.freeze({
      'D3.1': Object.freeze({
        label: 'Contextualizar',
        parent: null,
        traits: Object.freeze([]),
        description: 'Quadro histórico, geopolítico ou conjuntural amplo de leitura.',
      }),
      'D3.2': Object.freeze({
        label: 'Anteceder',
        parent: null,
        traits: Object.freeze([]),
        description: 'Conteúdo proposicional sobre fatos ocorridos antes do agora do relato.',
      }),
      'D3.3': Object.freeze({
        label: 'Conceituar',
        parent: null,
        traits: Object.freeze([]),
        description: 'Definição da essência, classe ou função de termos e instituições.',
      }),
      'D3.4a': Object.freeze({
        label: 'Explicar — Causal',
        parent: null,
        traits: Object.freeze([]),
        description: 'Explicação que liga um fato à sua causa geradora no discurso.',
      }),
      'D3.4b': Object.freeze({
        label: 'Explicar — Procedural',
        parent: null,
        traits: Object.freeze([]),
        description: 'Exposição de métodos, rotinas e protocolos operacionais.',
      }),
      'D3.4c': Object.freeze({
        label: 'Explicar — Condicional',
        parent: null,
        traits: Object.freeze([]),
        description: 'Consequências teóricas sob hipótese ("se... então...").',
      }),
      'D3.4d': Object.freeze({
        label: 'Explicar — Final',
        parent: null,
        traits: Object.freeze([]),
        description: 'Exposição da finalidade, destinação ou propósito de um ato ou objeto.',
      }),
      'D3.5': Object.freeze({
        label: 'Especificar',
        parent: null,
        traits: Object.freeze([]),
        description: 'Refinamento e delimitação de precisão sobre uma informação já em jogo.',
      }),
      'D3.6': Object.freeze({
        label: 'Relacionar',
        parent: null,
        traits: Object.freeze([]),
        description: 'Explicitação de nexo ou dependência conceitual entre fatos.',
      }),
    }),
  }),

  // ═══════════════════════════════════════════════════════════
  // D4 — INTERIORIZAR
  // ═══════════════════════════════════════════════════════════
  D4: Object.freeze({
    id: 'D4',
    label: 'Interiorizar',
    role: 'mind',
    color: '#6b46c1',
    description: 'Fluxo das experiências psicológicas e mentais das personagens.',
    traits: Object.freeze(['+focal-able']),
    subtypes: Object.freeze({
      'D4.1': Object.freeze({
        label: 'Percepção',
        parent: null,
        traits: Object.freeze(['+perceptive']),
        description: 'Registro de estímulos e dados sensoriais brutos captados pelos sentidos.',
      }),
      'D4.2': Object.freeze({
        label: 'Cognição',
        parent: null,
        traits: Object.freeze(['+cognitive']),
        description: 'Processamento intelectual, inferências lógicas e raciocínios dedutivos.',
      }),
      'D4.3': Object.freeze({
        label: 'Crença/Dúvida',
        parent: null,
        traits: Object.freeze(['+cognitive', '+belief']),
        description: 'Atribuição ou suspensão subjetiva de valor de verdade sobre o mundo.',
      }),
      'D4.4': Object.freeze({
        label: 'Memória',
        parent: null,
        traits: Object.freeze(['+cognitive', '+memory']),
        description: 'Recuperação e evocação mental de lembranças, traumas e fatos do passado.',
      }),
      'D4.5': Object.freeze({
        label: 'Imaginação',
        parent: null,
        traits: Object.freeze(['+cognitive', '+imagination']),
        description: 'Figurações mentais de cenários irreais, fantasias ou projeções hipotéticas.',
      }),
      'D4.6': Object.freeze({
        label: 'Emoção',
        parent: null,
        traits: Object.freeze(['+affective']),
        description: 'Experiência afetiva visceral e reações emocionais internas.',
      }),
      'D4.7': Object.freeze({
        label: 'Desejo',
        parent: null,
        traits: Object.freeze(['+affective']),
        description: 'Apetências, aspirações e quereres de longo prazo sem compromisso tático imediato.',
      }),
      'D4.8': Object.freeze({
        label: 'Intenção',
        parent: null,
        traits: Object.freeze(['+volitive', '+cognitive']),
        description: 'Propósitos pragmáticos e inclinações formadas para a ação em cena.',
      }),
      'D4.9': Object.freeze({
        label: 'Decisão-interna',
        parent: null,
        traits: Object.freeze(['+volitive', '+cognitive']),
        description: 'Escolha mental de uma alternativa para resolver um dilema na consciência.',
      }),
      'D4.10': Object.freeze({
        label: 'Planejamento',
        parent: null,
        traits: Object.freeze(['+volitive', '+cognitive', '+durative']),
        description: 'Antevisão e estruturação estratégica de passos encadeados futuros.',
      }),
    }),
  }),

  // ═══════════════════════════════════════════════════════════
  // D5 — ENUNCIAR
  // ═══════════════════════════════════════════════════════════
  D5: Object.freeze({
    id: 'D5',
    label: 'Enunciar',
    role: 'mind',
    color: '#805ad5',
    description: 'Atos de fala e pragmática do diálogo (taxonomia de Searle).',
    traits: Object.freeze(['+social']),
    axes: Object.freeze({
      modo:       Object.freeze(['direct', 'indirect', 'free-indirect']),
      enunciador: Object.freeze(['character', 'narrator', 'reader']),
    }),
    subtypes: Object.freeze({
      'D5.1': Object.freeze({
        label: 'Assertivo',
        parent: null,
        traits: Object.freeze(['+truth-claim']),
        description: 'Afirmar, declarar ou relatar proposição sobre a realidade.',
      }),
      'D5.2': Object.freeze({
        label: 'Interrogativo',
        parent: null,
        traits: Object.freeze(['+information-seeking']),
        description: 'Demandas por informação que abrem questões no diálogo.',
      }),
      'D5.3': Object.freeze({
        label: 'Diretivo',
        parent: null,
        traits: Object.freeze(['+action-oriented']),
        description: 'Ordens, pedidos e proibições que visam orientar ação de terceiros.',
      }),
      'D5.4': Object.freeze({
        label: 'Comissivo',
        parent: null,
        traits: Object.freeze(['+future-commitment']),
        description: 'Promessas, votos e juramentos solenes que comprometem o falante.',
      }),
      'D5.5': Object.freeze({
        label: 'Expressivo',
        parent: null,
        traits: Object.freeze(['+affective']),
        description: 'Performances vocais que expelem estados afetivos ou saudações.',
      }),
      'D5.6': Object.freeze({
        label: 'Declarativo',
        parent: null,
        traits: Object.freeze(['+world-changing']),
        description: 'Pronunciamentos institucionais que alteram o mundo pelo próprio ato.',
      }),
      'D5.7': Object.freeze({
        label: 'Fático',
        parent: null,
        traits: Object.freeze(['+channel-oriented']),
        description: 'Fórmulas que abrem, testam, mantêm ou encerram o canal de contato.',
      }),
    }),
  }),

  // ═══════════════════════════════════════════════════════════
  // D6 — AVALIAR
  // ═══════════════════════════════════════════════════════════
  D6: Object.freeze({
    id: 'D6',
    label: 'Avaliar',
    role: 'mind',
    color: '#d53f8c',
    description: 'Julgamentos, leituras e ponderações do narrador sobre o relato.',
    traits: Object.freeze(['+intensive']),
    subtypes: Object.freeze({
      'D6.1': Object.freeze({
        label: 'Juízo Ético/Prático',
        parent: null,
        traits: Object.freeze([]),
        description: 'Valoração moral de dignidade, culpa, erro ou necessidade prática.',
      }),
      'D6.2': Object.freeze({
        label: 'Juízo Epistêmico',
        parent: null,
        traits: Object.freeze(['+cognitive']),
        description: 'Avaliação sobre solidez, fragilidade ou falsidade de uma informação.',
      }),
      'D6.3': Object.freeze({
        label: 'Interpretar',
        parent: null,
        traits: Object.freeze(['+cognitive']),
        description: 'Proposição de sentido ou hipótese psicológica sobre condutas e gestos.',
      }),
      'D6.4': Object.freeze({
        label: 'Ironia/Contraste',
        parent: null,
        traits: Object.freeze(['+intensive']),
        description: 'Desnível crítico entre o enunciado e a realidade da instância.',
      }),
      'D6.5': Object.freeze({
        label: 'Comentar',
        parent: null,
        traits: Object.freeze([]),
        description: 'Observação explícita e pontual do narrador inserida no texto.',
      }),
      'D6.6': Object.freeze({
        label: 'Refletir',
        parent: null,
        traits: Object.freeze(['+cognitive']),
        description: 'Consideração abstrata ou máxima filosófica que extrapola o caso imediato.',
      }),
    }),
  }),

  // ═══════════════════════════════════════════════════════════
  // D7 — FOCALIZAR (só eixos)
  // ═══════════════════════════════════════════════════════════
  D7: Object.freeze({
    id: 'D7',
    label: 'Focalizar',
    role: 'coord',
    color: '#2c5282',
    description: 'Regula o filtro de visão e os desníveis de conhecimento (K).',
    traits: Object.freeze([]),
    subtypes: Object.freeze({}),
    axes: Object.freeze({
      grau:         Object.freeze(['zero', 'external', 'internal']),
      estabilidade: Object.freeze(['fixed', 'variable', 'multiple']),
      alcanceK:     Object.freeze(['symmetric', 'asymmetric-narrator', 'asymmetric-reader']),
    }),
  }),

  // ═══════════════════════════════════════════════════════════
  // D8 — ESTRUTURAR (só eixos)
  // ═══════════════════════════════════════════════════════════
  D8: Object.freeze({
    id: 'D8',
    label: 'Estruturar',
    role: 'coord',
    color: '#718096',
    description: 'Governa o relógio do texto e a entrega da informação ao leitor.',
    traits: Object.freeze([]),
    subtypes: Object.freeze({}),
    axes: Object.freeze({
      temporal:      Object.freeze(['linear', 'analepse', 'prolepse', 'simultaneous']),
      informacional: Object.freeze(['omit', 'delay', 'hint', 'payoff']),
      discursiva:    Object.freeze(['segment', 'intercalation', 'frame', 'block']),
      distancia:     Object.freeze(['scene', 'summary', 'ellipsis', 'pause', 'iterative']),
    }),
  }),
});

// ══════════════════════════════════════════════════════════════
// ALIASES v1 → v2
// ══════════════════════════════════════════════════════════════
//
// Mapa de retrocompatibilidade. Qualquer consumidor que ainda use
// nomes v1 (`represent`, `emotion`, `motion`, ...) pode resolver para
// o ID canônico via `resolveAlias()`.

/**
 * Aliases v1 → v2.
 * Chaves: nomes antigos (operações + subtipos flat).
 * Valores: IDs canônicos (D-number).
 * @type {Readonly<Object<string, string>>}
 */
export const ALIASES = Object.freeze({
  // ── Operações (nome v1 → D-number) ────────────────────────
  'represent':    'D1',
  'describe':     'D2',
  'expose':       'D3',
  'interiorize':  'D4',
  'enunciate':    'D5',
  'evaluate':     'D6',
  'focalize':     'D7',
  'structure':    'D8',

  // ── Subtipos represent (D1) ───────────────────────────────
  'motion':              'D1.2',
  'action':              'D1.2',
  'action-physical':     'D1.2',
  'action-social':       'D1.2',
  'combat':              'D1.2',
  'transfer':            'D1.2',
  'creation':            'D1.2',
  'destruction':         'D1.2',
  'speech-act':          'D1.2',
  'event':               'D1.1',
  'natural-event':       'D1.7',
  'accidental-event':    'D1.1',
  'biological-event':    'D1.6',

  // ── Subtipos describe (D2) ────────────────────────────────
  'quality':             'D2.1',
  'appearance':          'D2.1',
  'atmosphere':          'D2.5',
  'scene-setting':       'D2.2',
  'attribute':           'D2.1',
  'comparison':          'D2.5',

  // ── Subtipos expose (D3) ──────────────────────────────────
  'identity':            'D3.3',
  'location':            'D3.1',
  'relationship':        'D3.6',
  'historical':          'D3.2',
  'worldbuilding':       'D3.1',
  'rule':                'D3.4c',
  'category':            'D3.3',

  // ── Subtipos interiorize (D4) ─────────────────────────────
  'sensation':           'D4.1',
  'perception':          'D4.1',
  'perception-visual':   'D4.1',
  'perception-auditory': 'D4.1',
  'thought':             'D4.2',
  'belief':              'D4.3',
  'doubt':               'D4.3',
  'memory':              'D4.4',
  'imagination':         'D4.5',
  'emotion':             'D4.6',
  'desire':              'D4.7',
  'intention':           'D4.8',
  'decision':            'D4.9',
  'planning':            'D4.10',
  'expectation':         'D4.2',
  'intuition':           'D4.2',
  'subjective-perception':'D4.1',

  // ── Subtipos enunciate (D5) ───────────────────────────────
  'direct-speech':       'D5.1',
  'indirect-speech':     'D5.1',
  'free-indirect':       'D5.1',
  'thought-quote':       'D5.1',
  'written-text':        'D5.1',
  'collective-speech':   'D5.1',
  'order':               'D5.3',
  'question':            'D5.2',
  'promise':             'D5.4',
  'oath':                'D5.4',
  'declaration':         'D5.6',
  'greeting':            'D5.7',

  // ── Subtipos evaluate (D6) ────────────────────────────────
  'judgment':            'D6.1',
  'moral':               'D6.1',
  'aesthetic':           'D6.5',
  'ironic':              'D6.4',
  'emphatic':            'D6.4',
  'comparison-eval':     'D6.2',
  'appreciation':        'D6.1',
  'criticism':           'D6.1',

  // ── Estrutura temporal (D8.temporal) ──────────────────────
  'temporal-sequence':        'D8',
  'temporal-retrospection':   'D8',
  'temporal-anticipation':    'D8',
  'temporal-simultaneous':    'D8',
  'causal':                   'D8',
  'conditional':              'D8',
  'concessive':               'D8',
  'additive':                 'D8',
  'contrastive':              'D8',
  'alternative':              'D8',
  'explanatory':              'D8',
  'exemplification':          'D8',

  // ── Focalização (D7) ──────────────────────────────────────
  'explicit-focalizer':       'D7',
  'perceptual-focalizer':     'D7',
  'cognitive-focalizer':      'D7',
  'negative-focalizer':       'D7',
  'collective-focalizer':     'D7',
  'unreliable-focalizer':     'D7',
  'first-person':             'D7',
  'panoramic':                'D7',
});

// ══════════════════════════════════════════════════════════════
// CATALOG — objeto agregado
// ══════════════════════════════════════════════════════════════

/**
 * Objeto agregado com todas as partes do catálogo.
 * @type {Readonly<Object>}
 */
export const CATALOG = Object.freeze({
  version: CATALOG_VERSION,
  operations: OPERATIONS,
  traits: TRAITS,
  aliases: ALIASES,
});

// ══════════════════════════════════════════════════════════════
// CONSULTAS — operações
// ══════════════════════════════════════════════════════════════

/**
 * Lista os IDs de todas as operações, em ordem D1..D8.
 * @returns {string[]}
 */
export function operationIds() {
  return Object.keys(OPERATIONS);
}

/**
 * Verifica se um ID é uma operação válida.
 * @param {string} op
 * @returns {boolean}
 */
export function isValidOperation(op) {
  return typeof op === 'string' && Object.prototype.hasOwnProperty.call(OPERATIONS, op);
}

/**
 * Devolve a operação completa, ou null.
 * @param {string} op
 * @returns {Object|null}
 */
export function getOperation(op) {
  return isValidOperation(op) ? OPERATIONS[op] : null;
}

/**
 * Devolve o label PT-BR da operação.
 * @param {string} op
 * @returns {string}
 */
export function labelForOperation(op) {
  return OPERATIONS[op]?.label ?? op;
}

/**
 * Devolve a cor da operação (hex).
 * @param {string} op
 * @returns {string|null}
 */
export function colorForOperation(op) {
  return OPERATIONS[op]?.color ?? null;
}

/**
 * Devolve o papel da operação: 'core' | 'mind' | 'coord'.
 * @param {string} op
 * @returns {string|null}
 */
export function roleForOperation(op) {
  return OPERATIONS[op]?.role ?? null;
}

/**
 * Verifica se a operação é coordenadora.
 * @param {string} op
 * @returns {boolean}
 */
export function isCoordinator(op) {
  return OPERATIONS[op]?.role === 'coord';
}

// ══════════════════════════════════════════════════════════════
// CONSULTAS — subtipos
// ══════════════════════════════════════════════════════════════

/**
 * Lista os IDs de subtipos de uma operação.
 * @param {string} op
 * @returns {string[]}
 */
export function subtypeIds(op) {
  const operation = OPERATIONS[op];
  return operation ? Object.keys(operation.subtypes ?? {}) : [];
}

/**
 * Verifica se um ID é um subtipo válido (dentro de uma operação).
 * @param {string} op
 * @param {string} st
 * @returns {boolean}
 */
export function isValidSubtype(op, st) {
  const operation = OPERATIONS[op];
  if (!operation) return false;
  return Object.prototype.hasOwnProperty.call(operation.subtypes ?? {}, st);
}

/**
 * Verifica se um ID é um subtipo válido em qualquer operação.
 * @param {string} st
 * @returns {{ operation:string, subtype:string }|null}
 */
export function findSubtypeOwner(st) {
  for (const op of operationIds()) {
    if (isValidSubtype(op, st)) {
      return { operation: op, subtype: st };
    }
  }
  return null;
}

/**
 * Devolve o subtipo completo (com label, parent, traits).
 * @param {string} st
 * @returns {Object|null}
 */
export function getSubtype(st) {
  const owner = findSubtypeOwner(st);
  if (!owner) return null;
  return OPERATIONS[owner.operation].subtypes[st] ?? null;
}

/**
 * Devolve o label PT-BR do subtipo.
 * @param {string} st
 * @returns {string}
 */
export function labelForSubtype(st) {
  return getSubtype(st)?.label ?? st;
}

/**
 * Devolve o parent de um subtipo (para herança), ou null.
 * @param {string} st
 * @returns {string|null}
 */
export function parentOf(st) {
  return getSubtype(st)?.parent ?? null;
}

/**
 * Devolve os traits declarados de um subtipo (incluindo os da operação).
 * @param {string} op
 * @param {string} st
 * @returns {string[]}
 */
export function traitsForSubtype(op, st) {
  const operation = OPERATIONS[op];
  if (!operation) return [];
  const subtype = operation.subtypes?.[st];
  if (!subtype) return [];
  return [
    ...(operation.traits ?? []),
    ...(subtype.traits ?? []),
  ];
}

// ══════════════════════════════════════════════════════════════
// CONSULTAS — eixos
// ══════════════════════════════════════════════════════════════

/**
 * Lista os nomes dos eixos de uma operação.
 * @param {string} op
 * @returns {string[]}
 */
export function axisNames(op) {
  const operation = OPERATIONS[op];
  return operation?.axes ? Object.keys(operation.axes) : [];
}

/**
 * Verifica se uma operação tem um eixo.
 * @param {string} op
 * @param {string} axis
 * @returns {boolean}
 */
export function isValidAxis(op, axis) {
  const operation = OPERATIONS[op];
  if (!operation?.axes) return false;
  return Object.prototype.hasOwnProperty.call(operation.axes, axis);
}

/**
 * Verifica se um valor é válido para um eixo.
 * @param {string} op
 * @param {string} axis
 * @param {string} value
 * @returns {boolean}
 */
export function isValidAxisValue(op, axis, value) {
  const operation = OPERATIONS[op];
  if (!operation?.axes) return false;
  const values = operation.axes[axis];
  return Array.isArray(values) && values.includes(value);
}

/**
 * Devolve os valores válidos de um eixo.
 * @param {string} op
 * @param {string} axis
 * @returns {string[]}
 */
export function axisValues(op, axis) {
  const operation = OPERATIONS[op];
  const values = operation?.axes?.[axis];
  return Array.isArray(values) ? [...values] : [];
}

// ══════════════════════════════════════════════════════════════
// CONSULTAS — traits
// ══════════════════════════════════════════════════════════════

/**
 * Verifica se um trait existe no catálogo.
 * @param {string} trait
 * @returns {boolean}
 */
export function isValidTrait(trait) {
  return typeof trait === 'string' && Object.prototype.hasOwnProperty.call(TRAITS, trait);
}

/**
 * Devolve o label PT-BR de um trait.
 * @param {string} trait
 * @returns {string}
 */
export function labelForTrait(trait) {
  return TRAITS[trait]?.label ?? trait;
}

/**
 * Lista todos os traits do catálogo.
 * @returns {string[]}
 */
export function traitNames() {
  return Object.keys(TRAITS);
}

// ══════════════════════════════════════════════════════════════
// CONSULTAS — aliases
// ══════════════════════════════════════════════════════════════

/**
 * Resolve um nome v1 para o ID canônico v2.
 * Se `name` já for um ID v2, devolve-o inalterado.
 * @param {string} name
 * @returns {string|null}
 */
export function resolveAlias(name) {
  if (typeof name !== 'string' || !name) return null;
  if (ALIASES[name]) return ALIASES[name];
  // Já é um ID v2?
  if (isValidOperation(name)) return name;
  if (findSubtypeOwner(name)) return name;
  return null;
}

/**
 * Verifica se um nome é um alias registrado.
 * @param {string} name
 * @returns {boolean}
 */
export function isAlias(name) {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(ALIASES, name);
}

// ══════════════════════════════════════════════════════════════
// ESTATÍSTICAS
// ══════════════════════════════════════════════════════════════

/**
 * Estatísticas do catálogo. Útil para validação e testes.
 * @returns {{
 *   version: string,
 *   operations: number,
 *   subtypes: number,
 *   subtypesByOperation: Object<string, number>,
 *   axes: number,
 *   axesByOperation: Object<string, number>,
 *   traits: number,
 *   aliases: number,
 * }}
 */
export function catalogStats() {
  const subtypesByOperation = {};
  const axesByOperation = {};
  let totalSubtypes = 0;
  let totalAxes = 0;

  for (const [opId, op] of Object.entries(OPERATIONS)) {
    const stCount = Object.keys(op.subtypes ?? {}).length;
    const axCount = Object.keys(op.axes ?? {}).length;
    subtypesByOperation[opId] = stCount;
    axesByOperation[opId] = axCount;
    totalSubtypes += stCount;
    totalAxes += axCount;
  }

  return {
    version: CATALOG_VERSION,
    operations: Object.keys(OPERATIONS).length,
    subtypes: totalSubtypes,
    subtypesByOperation,
    axes: totalAxes,
    axesByOperation,
    traits: Object.keys(TRAITS).length,
    aliases: Object.keys(ALIASES).length,
  };
}

// ══════════════════════════════════════════════════════════════
// LISTAGEM PLANA
// ══════════════════════════════════════════════════════════════

/**
 * Lista plana de todos os subtipos com metadados.
 * Útil para UI e para o comando `narr.catalog`.
 * @returns {Array<{ operation:string, id:string, label:string, traits:string[], parent:string|null }>}
 */
export function allSubtypes() {
  const out = [];
  for (const [opId, op] of Object.entries(OPERATIONS)) {
    for (const [stId, st] of Object.entries(op.subtypes ?? {})) {
      out.push({
        operation: opId,
        id: stId,
        label: st.label ?? stId,
        traits: [...(op.traits ?? []), ...(st.traits ?? [])],
        parent: st.parent ?? null,
      });
    }
  }
  return out;
}

/**
 * Lista plana de todos os eixos com metadados.
 * @returns {Array<{ operation:string, axis:string, values:string[] }>}
 */
export function allAxes() {
  const out = [];
  for (const [opId, op] of Object.entries(OPERATIONS)) {
    for (const [axis, values] of Object.entries(op.axes ?? {})) {
      out.push({
        operation: opId,
        axis,
        values: [...values],
      });
    }
  }
  return out;
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

/**
 * Fachada congelada do catálogo.
 * @type {Readonly<Object>}
 */
export const Catalog = Object.freeze({
  // Constantes
  CATALOG_VERSION,
  CATALOG,
  OPERATIONS,
  TRAITS,
  ALIASES,

  // Operações
  operationIds,
  isValidOperation,
  getOperation,
  labelForOperation,
  colorForOperation,
  roleForOperation,
  isCoordinator,

  // Subtipos
  subtypeIds,
  isValidSubtype,
  findSubtypeOwner,
  getSubtype,
  labelForSubtype,
  parentOf,
  traitsForSubtype,

  // Eixos
  axisNames,
  isValidAxis,
  isValidAxisValue,
  axisValues,

  // Traits
  isValidTrait,
  labelForTrait,
  traitNames,

  // Aliases
  resolveAlias,
  isAlias,

  // Estatísticas
  catalogStats,
  allSubtypes,
  allAxes,
});