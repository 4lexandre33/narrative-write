/**
 * @file _migration-map.js
 * @module narrative-language/pt-br
 * @description Mapa de referência da migração v1 → v2 do léxico.
 *              NÃO é importado em runtime — serve apenas como documentação
 *              viva da estratégia de migração. Pode ser removido após a
 *              estabilização do novo `lexicon.js`.
 * @imports narrative-language/ir/catalog
 * @importedBy — (só documentação)
 * @level N0
 *
 * Estratégia:
 *   1. Cada tipo v1 (`action`, `emotion`, ...) mapeia para um D-number
 *      e um conjunto de traits default.
 *   2. Verbos com comportamento mais específico recebem refinamento manual
 *      no `lexicon.js` (sobrescrevendo o default).
 *   3. Novos verbos devem ser adicionados com D-number direto — este mapa
 *      é só para referência de migração.
 */

// ══════════════════════════════════════════════════════════════
// MAPA DE TIPO v1 → D-NUMBER + TRAITS
// ══════════════════════════════════════════════════════════════

/**
 * Tipo v1 → configuração canônica v2.
 * @type {Readonly<Object<string, { subtype:string, traits:string[] }>>}
 */
export const TYPE_TO_DNUMBER = Object.freeze({
  // ── D1 Representar ───────────────────────────────────────
  'motion':       { subtype: 'D1.2', traits: ['+agentive', '+volitive'] },
  'action':       { subtype: 'D1.2', traits: ['+agentive', '+volitive'] },
  'social':       { subtype: 'D1.2', traits: ['+agentive', '+volitive', '+social'] },
  'combat':       { subtype: 'D1.2', traits: ['+agentive', '+volitive', '+intensive'] },
  'transfer':     { subtype: 'D1.2', traits: ['+agentive', '+telic'] },
  'creation':     { subtype: 'D1.2', traits: ['+agentive', '+telic'] },
  'destruction':  { subtype: 'D1.2', traits: ['+agentive', '+telic', '+intensive'] },
  'ritual':       { subtype: 'D1.2', traits: ['+agentive', '+volitive', '+social'] },

  // Eventos não-agentivos
  'natural-event':{ subtype: 'D1.1', traits: ['-agentive', '+punctual'] },
  'biological-event':{ subtype: 'D1.6', traits: ['-volitive', '+observable'] },

  // ── D2 Descrever ─────────────────────────────────────────
  'state':        { subtype: 'D1.3', traits: ['+stative', '-telic'] },
  // Nota: `state` no v1 pode ser D1.3 (estado em cena) ou D2 (qualidade).
  // O lexicon.js decide caso a caso.

  // ── D4 Interiorizar ──────────────────────────────────────
  'perception':   { subtype: 'D4.1', traits: ['+perceptive'] },
  'experiential': { subtype: 'D4.1', traits: ['+perceptive'] },
  'cognitive':    { subtype: 'D4.2', traits: ['+cognitive'] },
  'emotion':      { subtype: 'D4.6', traits: ['+affective'] },

  // ── D5 Enunciar ──────────────────────────────────────────
  'communicative':{ subtype: 'D5.1', traits: ['+truth-claim'] },
});

// ══════════════════════════════════════════════════════════════
// NOTAS DE MIGRAÇÃO — decisões que fogem do mapa default
// ══════════════════════════════════════════════════════════════

/**
 * Decisões específicas tomadas durante a migração. Documentam
 * por que cada lema recebeu um D-number diferente do default do tipo.
 * @type {Readonly<Object<string, string>>}
 */
export const MIGRATION_NOTES = Object.freeze({
  // ── Verbos que NÃO são D1.2 (Ação) por padrão ────────────
  'tremer':   'D1.6 — reflexo involuntário, não volitivo',
  'suar':     'D1.6 — reação biológica',
  'engasgar': 'D1.6 — reflexo',
  'chorar':   'D1.6 quando visível (lágrimas); D5.5 quando ato vocal intencional',
  'rir':      'D1.6 quando expressão visível; D5.5 quando performático',
  'sorrir':   'D1.6 quando micro-expressão; D2.4 quando porte estático',

  'correr':   'D1.5 (Processo) sem destino; D1.2 (Ação) com destino explícito',
  'andar':    'D1.5 (Processo) sem destino; D1.2 (Ação) com destino explícito',
  'caminhar': 'D1.5 (Processo) sem destino; D1.2 (Ação) com destino explícito',
  'nadar':    'D1.5 (Processo) sem destino; D1.2 (Ação) com destino explícito',
  'voar':     'D1.5 (Processo) sem destino; D1.2 (Ação) com destino explícito',

  'chover':   'D1.7 — fenômeno atmosférico',
  'nevar':    'D1.7 — fenômeno atmosférico',
  'trovejar': 'D1.7 — fenômeno atmosférico',
  'ventar':   'D1.7 — fenômeno atmosférico',

  'abrir':    'D1.2 ou D1.4 dependendo do foco (ação vs mudança de estado)',
  'fechar':   'D1.2 ou D1.4 dependendo do foco',

  // ── Verbos que são D5.5 (Expressivo) e não D5.1 ──────────
  'gritar':    'D5.5 quando expele afeto; D5.1 quando relata conteúdo',
  'sussurrar': 'D5.5 quando segredo íntimo',
  'gemer':     'D5.5 — expressão vocálica de dor',
  'suspirar':  'D5.5 — expressão vocálica',
  'soluçar':   'D5.5 — expressão vocálica',

  // ── Verbos que são D5.2 (Interrogativo) ──────────────────
  'perguntar': 'D5.2',
  'indagar':   'D5.2',
  'questionar':'D5.2',
  'inquirir':  'D5.2',

  // ── Verbos que são D5.3 (Diretivo) ───────────────────────
  'ordenar':   'D5.3',
  'mandar':    'D5.3 (mandar como ordem); D1.2 (mandar como enviar)',
  'exigir':    'D5.3',
  'suplicar':  'D5.3 (pedido intenso)',
  'implorar':  'D5.3',
  'pedir':     'D5.3',

  // ── Verbos que são D5.4 (Comissivo) ──────────────────────
  'prometer':  'D5.4',
  'jurar':     'D5.4',
  'comprometer':'D5.4',

  // ── Verbos que são D5.6 (Declarativo) ────────────────────
  'batizar':   'D5.6',
  'nomear':    'D5.6',
  'condenar':  'D5.6',
  'absolver':  'D5.6',
  'abençoar':  'D5.6',
  'decretar':  'D5.6',
  'proclamar': 'D5.6',

  // ── Verbos que são D5.7 (Fático) ─────────────────────────
  'cumprimentar': 'D5.7',
  'saudar':       'D5.7',
  'despedir':     'D5.7',
  'agradecer':    'D5.7 (ou D5.5 dependendo do contexto)',

  // ── Verbos que são D4.7 (Desejo) e não D4.6 (Emoção) ─────
  'querer':    'D4.7',
  'desejar':   'D4.7',
  'ansiar':    'D4.7',
  'almejar':   'D4.7',
  'cobiçar':   'D4.7',

  // ── Verbos que são D4.8 (Intenção) ───────────────────────
  'pretender': 'D4.8',
  'tencionar': 'D4.8',
  'intencionar':'D4.8',

  // ── Verbos que são D4.9 (Decisão) ────────────────────────
  'decidir':   'D4.9',

  // ── Verbos que são D4.10 (Planejamento) ──────────────────
  'planejar':  'D4.10',
  'projetar':  'D4.10 (planejar); D1.2 (projetar fisicamente)',
  'arquitetar':'D4.10',

  // ── Verbos que são D4.5 (Imaginação) ─────────────────────
  'imaginar':  'D4.5',
  'fantasiar': 'D4.5',
  'sonhar':    'D4.5 (devaneio); D1.6 (sono biológico)',

  // ── Verbos que são D4.4 (Memória) ────────────────────────
  'lembrar':   'D4.4',
  'recordar':  'D4.4',
  'relembrar': 'D4.4',
  'esquecer':  'D4.4',
});

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const MigrationMap = Object.freeze({
  TYPE_TO_DNUMBER,
  MIGRATION_NOTES,
});