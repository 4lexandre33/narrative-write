/**
 * @file runner.js
 * @module narrative-language/fixtures
 * @description Runner de fixtures end-to-end. Aceita fixtures em forma
 *              canônica (objeto JS), roda o pipeline completo
 *              (segmenter → analyzer → resolver → classifier → dimensions
 *              → interpreter), compara com o esperado e produz relatório
 *              estruturado (JSON, Markdown, texto).
 * @imports narrative-language/pt-br/adapter,
 *          narrative-language/pipeline/interpreter,
 *          narrative-language/ir/schema
 * @importedBy diagnostics/test-battery (via import dinâmico),
 *             console/tests (uso manual)
 * @level N4
 *
 * ═══════════════════════════════════════════════════════════════
 * CAMADA 3 — FIXTURES EXPANDIDAS
 * ═══════════════════════════════════════════════════════════════
 *
 * Adicionadas 12 fixtures para as 12 novas constructions:
 *   1.  D3-relative-restrictive
 *   2.  D3-relative-explanatory
 *   3.  D3-apposition
 *   4.  D8-consecutive
 *   5.  D6-comparison
 *   6.  D8-causal-gerund
 *   7.  D8-concession
 *   8.  D8-purpose
 *   9.  D5-nested-indirect
 *  10.  D4-expectation
 *  11.  D6-pseudo-cleft
 *  12.  D4-free-indirect-doubt
 *
 * Total: 57 fixtures (45 originais + 12 novas).
 *
 * Contrato:
 *   runFixtures(opts)              → Promise<FixtureReport>
 *   reportToMarkdown(report)       → string
 *   reportToJSON(report)           → Object
 *   reportToText(report)           → string
 *   listFixtureCategories(fixtures)→ string[]
 *   listFixtureLevels(fixtures)    → string[]
 *   normalizeForCompare(interpret) → Object
 *   CANONICAL_FIXTURES             → Array<Fixture>
 *
 * Determinismo: para a mesma fixture + mesmo estado, o report é idêntico.
 * Nunca lança — falhas viram `failures[]` no report.
 */

import { Adapter } from '../pt-br/adapter.js';
import { interpretDocument } from '../pipeline/interpreter.js';
import { project } from '../acts/projector.js';

// ══════════════════════════════════════════════════════════════
// FIXTURES CANÔNICAS
// ══════════════════════════════════════════════════════════════

/**
 * @type {ReadonlyArray<Object>}
 */
export const CANONICAL_FIXTURES = Object.freeze([

  // ═══════════════════════════════════════════════════════════
  // L0 — REPRESENTAR
  // ═══════════════════════════════════════════════════════════
  {
    name: 'L0-represent-basic',
    level: 'L0',
    category: 'representing',
    input: 'João abriu a porta.',
    expect: {
      acts: [{
        operations: ['represent'],
        primaryOperation: 'represent',
        subtypes: { D1: 'D1.2' },
        voice: 'narrator',
        form: 'narration',
        epistemic: 'fact',
        tense: 'past',
      }],
    },
  },
  {
    name: 'L0-describe-state',
    level: 'L0',
    category: 'describing',
    input: 'A sala estava escura.',
    expect: {
      acts: [{
        operations: ['describe'],
        primaryOperation: 'describe',
        subtypes: { D1: 'D1.3' },
        form: 'description',
      }],
    },
  },
  {
    name: 'L0-motion-enter',
    level: 'L0',
    category: 'representing',
    input: 'Maria entrou na casa.',
    expect: {
      acts: [{
        operations: ['represent'],
        primaryOperation: 'represent',
        subtypes: { D1: 'D1.2' },
      }],
    },
  },
  {
    name: 'D1.2-action-motion',
    level: 'L0',
    category: 'representing',
    input: 'João entrou em Cinza.',
    expect: {
      acts: [{
        operations: ['represent'],
        subtypes: { D1: 'D1.2' },
        traits: ['+agentive', '+volitive'],
      }],
    },
  },
  {
    name: 'D1.2-action-combat',
    level: 'L0',
    category: 'combat',
    input: 'Kaelin golpeou o goblin.',
    expect: {
      acts: [{
        operations: ['represent'],
        subtypes: { D1: 'D1.2' },
        traits: ['+agentive', '+volitive', '+intensive'],
      }],
    },
  },
  {
    name: 'D1.6-somatic-tremor',
    level: 'L0',
    category: 'somatic',
    input: 'João tremeu.',
    expect: {
      acts: [{
        operations: ['represent'],
        subtypes: { D1: 'D1.6' },
        traits: ['-volitive', '+observable'],
      }],
    },
  },
  {
    name: 'D1.6-somatic-death',
    level: 'L0',
    category: 'somatic',
    input: 'O velho morreu.',
    expect: {
      acts: [{
        operations: ['represent'],
        subtypes: { D1: 'D1.6' },
      }],
    },
  },
  {
    name: 'D1.7-weather-rain',
    level: 'L0',
    category: 'weather',
    input: 'Chovia sobre a cidade.',
    expect: {
      acts: [{
        operations: ['represent'],
        subtypes: { D1: 'D1.7' },
        traits: ['-agentive', '+ambient'],
      }],
    },
  },

  // ═══════════════════════════════════════════════════════════
  // L1 — EXPOR / DESCREVER
  // ═══════════════════════════════════════════════════════════
  {
    name: 'L1-expose-identity',
    level: 'L1',
    category: 'exposition',
    input: 'Kaelin era um guerreiro.',
    expect: {
      acts: [{
        operations: ['expose'],
        subtypes: { D3: 'D3.3' },
      }],
    },
  },
  {
    name: 'L1-expose-location',
    level: 'L1',
    category: 'exposition',
    input: 'O templo ficava na colina.',
    expect: {
      acts: [{
        operations: ['expose'],
        subtypes: { D3: 'D3.1' },
      }],
    },
  },

  // ═══════════════════════════════════════════════════════════
  // L1 — ENUNCIAR
  // ═══════════════════════════════════════════════════════════
  {
    name: 'L1-direct-speech',
    level: 'L1',
    category: 'enunciation',
    input: '— Eu vou embora.',
    expect: {
      acts: [{
        operations: ['enunciate'],
        primaryOperation: 'enunciate',
        subtypes: { D5: 'D5.1' },
        axes: { D5: { modo: 'direct', enunciador: 'character' } },
        voice: 'character',
        form: 'direct-speech',
      }],
    },
  },
  {
    name: 'L1-indirect-speech',
    level: 'L1',
    category: 'enunciation',
    input: 'João disse que iria embora.',
    expect: {
      acts: [{
        operations: ['enunciate'],
        primaryOperation: 'enunciate',
        subtypes: { D5: 'D5.1' },
        axes: { D5: { modo: 'indirect', enunciador: 'character' } },
        voice: 'character',
        form: 'indirect-speech',
      }],
    },
  },
  {
    name: 'D5.3-order',
    level: 'L1',
    category: 'speech-act',
    input: 'Ele ordenou a retirada.',
    expect: {
      acts: [{
        operations: ['enunciate'],
        subtypes: { D5: 'D5.3' },
        traits: ['+action-oriented'],
      }],
    },
  },
  {
    name: 'D5.4-promise',
    level: 'L1',
    category: 'speech-act',
    input: 'Ele prometeu voltar.',
    expect: {
      acts: [{
        operations: ['enunciate'],
        subtypes: { D5: 'D5.4' },
        traits: ['+future-commitment'],
      }],
    },
  },

  // ═══════════════════════════════════════════════════════════
  // L2 — COORDENAÇÃO E SUBORDINAÇÃO
  // ═══════════════════════════════════════════════════════════
  {
    name: 'L2-coordination-contrast',
    level: 'L2',
    category: 'coordination',
    input: 'João abriu a porta, mas não entrou.',
    expect: {
      acts: [{
        operations: ['represent'],
      }],
    },
  },
  {
    name: 'L2-subordination-conditional',
    level: 'L2',
    category: 'subordination',
    input: 'Se João entrar, Maria foge.',
    expect: {
      acts: [{
        operations: ['structure'],
      }],
    },
  },
  {
    name: 'L2-subordination-temporal',
    level: 'L2',
    category: 'subordination',
    input: 'Quando João entrou, Maria saiu.',
    expect: {
      acts: [{
        operations: ['structure'],
      }],
    },
  },

  // ═══════════════════════════════════════════════════════════
  // L3 — INTERIORIDADE
  // ═══════════════════════════════════════════════════════════
  {
    name: 'L3-interiority-emotion',
    level: 'L3',
    category: 'interiority',
    input: 'João sentiu medo.',
    expect: {
      acts: [{
        operations: ['interiorize'],
        primaryOperation: 'interiorize',
        subtypes: { D4: 'D4.6' },
        traits: ['+affective'],
        form: 'thought',
      }],
    },
  },
  {
    name: 'D4.3-belief',
    level: 'L3',
    category: 'interiority',
    input: 'João achava que Maria estava ali.',
    expect: {
      acts: [{
        operations: ['interiorize'],
        subtypes: { D4: 'D4.3' },
        traits: ['+belief'],
      }],
    },
  },
  {
    name: 'D4.4-memory',
    level: 'L3',
    category: 'interiority',
    input: 'João lembrou de Maria.',
    expect: {
      acts: [{
        operations: ['interiorize'],
        subtypes: { D4: 'D4.4' },
        traits: ['+memory'],
      }],
    },
  },
  {
    name: 'D4.7-desire',
    level: 'L3',
    category: 'interiority',
    input: 'Maria queria fugir.',
    expect: {
      acts: [{
        operations: ['interiorize'],
        subtypes: { D4: 'D4.7' },
      }],
    },
  },
  {
    name: 'L3-focalization-explicit',
    level: 'L3',
    category: 'focalization',
    input: 'Para João, a sala parecia enorme.',
    expect: {
      acts: [{
        operations: ['describe', 'focalize'],
        axes: { D7: { grau: 'internal' } },
        form: 'description',
      }],
    },
  },
  {
    name: 'D7-internal-pov',
    level: 'L3',
    category: 'focalization',
    input: 'Ela achava que sabia a verdade.',
    expect: {
      acts: [{
        operations: ['interiorize', 'focalize'],
        axes: { D7: { grau: 'internal' } },
      }],
    },
  },

  // ═══════════════════════════════════════════════════════════
  // L4 — TEMPORALIDADE
  // ═══════════════════════════════════════════════════════════
  {
    name: 'L4-retrospection',
    level: 'L4',
    category: 'temporality',
    input: 'Anos antes, João já estivera ali.',
    expect: {
      acts: [{
        operations: ['structure'],
        axes: { D8: { temporal: 'analepse' } },
      }],
    },
  },
  {
    name: 'L4-anticipation',
    level: 'L4',
    category: 'temporality',
    input: 'Mais tarde, ele entenderia tudo.',
    expect: {
      acts: [{
        operations: ['structure'],
        axes: { D8: { temporal: 'prolepse' } },
      }],
    },
  },
  {
    name: 'L4-simultaneity',
    level: 'L4',
    category: 'temporality',
    input: 'Enquanto isso, Maria esperava.',
    expect: {
      acts: [{
        operations: ['structure'],
        axes: { D8: { temporal: 'simultaneous' } },
      }],
    },
  },

  // ═══════════════════════════════════════════════════════════
  // L5 — MODALIDADE / ASPECTO / NEGAÇÃO
  // ═══════════════════════════════════════════════════════════
  {
    name: 'L5-modal-attempt',
    level: 'L5',
    category: 'modality',
    input: 'João pode ter tentado abrir a porta.',
    expect: {
      acts: [{
        modality: 'attempt',
      }],
    },
  },
  {
    name: 'L5-modal-intention',
    level: 'L5',
    category: 'modality',
    input: 'João pretendia fugir.',
    expect: {
      acts: [{
        modality: 'intention',
      }],
    },
  },
  {
    name: 'L5-aspect-concluded',
    level: 'L5',
    category: 'aspect',
    input: 'João já abriu a porta.',
    expect: {
      acts: [{
        aspect: 'concluded',
      }],
    },
  },
  {
    name: 'L5-aspect-iterative',
    level: 'L5',
    category: 'aspect',
    input: 'João leu o livro de novo.',
    expect: {
      acts: [{
        aspect: 'iterative',
      }],
    },
  },
  {
    name: 'L5-aspect-punctual',
    level: 'L5',
    category: 'aspect',
    input: 'De repente, a porta abriu.',
    expect: {
      acts: [{
        aspect: 'punctual',
      }],
    },
  },
  {
    name: 'L5-negation-never',
    level: 'L5',
    category: 'negation',
    input: 'João nunca abriu a porta.',
    expect: {
      acts: [{
        negation: 'never',
      }],
    },
  },

  // ═══════════════════════════════════════════════════════════
  // L6 — EPISTEMOLOGIA
  // ═══════════════════════════════════════════════════════════
  {
    name: 'L6-knowledge',
    level: 'L6',
    category: 'epistemic',
    input: 'Maria sabia que João havia voltado.',
    expect: {
      acts: [{
        operations: ['interiorize'],
        epistemic: 'knowledge',
      }],
    },
  },
  {
    name: 'L6-belief',
    level: 'L6',
    category: 'epistemic',
    input: 'João achava que Maria estava ali.',
    expect: {
      acts: [{
        operations: ['interiorize'],
        epistemic: 'belief',
      }],
    },
  },
  {
    name: 'L6-perception',
    level: 'L6',
    category: 'epistemic',
    input: 'João viu Maria na sala.',
    expect: {
      acts: [{
        operations: ['represent'],
        epistemic: 'perception',
      }],
    },
  },
  {
    name: 'L6-ignorance',
    level: 'L6',
    category: 'epistemic',
    input: 'João não sabia que Maria estava ali.',
    expect: {
      acts: [{
        operations: ['interiorize'],
        epistemic: 'ignorance',
      }],
    },
  },
  {
    name: 'L6-memory',
    level: 'L6',
    category: 'epistemic',
    input: 'João lembrou de Maria.',
    expect: {
      acts: [{
        operations: ['interiorize'],
        epistemic: 'memory',
      }],
    },
  },

  // ═══════════════════════════════════════════════════════════
  // L7 — REGRAS NATURAIS
  // ═══════════════════════════════════════════════════════════
  {
    name: 'L7-rule-conditional',
    level: 'L7',
    category: 'rules',
    input: 'Se João entrar no quarto, Maria fugirá pela janela.',
    expect: {
      acts: [{
        operations: ['structure'],
      }],
      proposals: [
        { command: 'rul.add' },
      ],
    },
  },
  {
    name: 'L7-rule-temporal',
    level: 'L7',
    category: 'rules',
    input: 'Quando João abrir a porta, Maria sairá.',
    expect: {
      acts: [{
        operations: ['structure'],
      }],
    },
  },
  {
    name: 'L7-rule-habitual',
    level: 'L7',
    category: 'rules',
    input: 'Sempre que alguém entrar na floresta, sentirá frio.',
    expect: {
      acts: [{
        operations: ['structure'],
      }],
    },
  },

  // ═══════════════════════════════════════════════════════════
  // D6 — AVALIAR
  // ═══════════════════════════════════════════════════════════
  {
    name: 'D6.1-judgment-moral',
    level: 'L3',
    category: 'evaluation',
    input: 'Foi uma péssima ideia.',
    expect: {
      acts: [{
        operations: ['evaluate'],
        subtypes: { D6: 'D6.1' },
      }],
    },
  },
  {
    name: 'D6.1-judgment-cruel',
    level: 'L3',
    category: 'evaluation',
    input: 'Aquilo foi covarde.',
    expect: {
      acts: [{
        operations: ['evaluate'],
      }],
    },
  },

  // ═══════════════════════════════════════════════════════════
  // D8 — DISTÂNCIA
  // ═══════════════════════════════════════════════════════════
  {
    name: 'D8-distancia-scene',
    level: 'L4',
    category: 'pacing',
    input: 'De repente, a porta abriu.',
    expect: {
      acts: [{
        operations: ['structure'],
        axes: { D8: { distancia: 'scene' } },
      }],
    },
  },
  {
    name: 'D8-distancia-iterative',
    level: 'L4',
    category: 'pacing',
    input: 'Todas as noites, ele pensava nela.',
    expect: {
      acts: [{
        operations: ['structure'],
        axes: { D8: { distancia: 'iterative' } },
      }],
    },
  },
  {
    name: 'D8-distancia-summary',
    level: 'L4',
    category: 'pacing',
    input: 'Durante anos, ninguém o viu.',
    expect: {
      acts: [{
        operations: ['structure'],
        axes: { D8: { distancia: 'summary' } },
      }],
    },
  },

  // ══════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════
  // CAMADA 3 — FIXTURES DAS NOVAS CONSTRUCTIONS
  // ══════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════

  // ── 1. Relativa restritiva ────────────────────────────────
  {
    name: 'CAM3-relative-restrictive',
    level: 'L2',
    category: 'relative-clause',
    input: 'O homem que viu o lobo fugiu.',
    expect: {
      acts: [{
        operations: ['describe'],
        form: 'description',
      }],
    },
  },

  // ── 2. Relativa explicativa ───────────────────────────────
  {
    name: 'CAM3-relative-explanatory',
    level: 'L2',
    category: 'relative-clause',
    input: 'João, que viu o lobo, fugiu.',
    expect: {
      acts: [{
        operations: ['expose'],
        form: 'exposition',
      }],
    },
  },

  // ── 3. Aposto ─────────────────────────────────────────────
  {
    name: 'CAM3-apposition',
    level: 'L2',
    category: 'apposition',
    input: 'João, o Bravo, atacou o dragão.',
    expect: {
      acts: [{
        operations: ['expose'],
        form: 'exposition',
      }],
    },
  },

  // ── 4. Consecutiva ────────────────────────────────────────
  {
    name: 'CAM3-consecutive',
    level: 'L2',
    category: 'subordination',
    input: 'Ele correu tão rápido que tropeçou.',
    expect: {
      acts: [{
        operations: ['structure'],
      }],
    },
  },

  // ── 5. Comparativa ────────────────────────────────────────
  {
    name: 'CAM3-comparison',
    level: 'L3',
    category: 'evaluation',
    input: 'Ela era tão alta quanto o irmão.',
    expect: {
      acts: [{
        operations: ['evaluate'],
        form: 'commentary',
      }],
    },
  },

  // ── 6. Gerúndio causal ────────────────────────────────────
  {
    name: 'CAM3-causal-gerund',
    level: 'L2',
    category: 'subordination',
    input: 'Ele desmaiou, sentindo a dor subir.',
    expect: {
      acts: [{
        operations: ['structure'],
      }],
    },
  },

  // ── 7. Concessiva ─────────────────────────────────────────
  {
    name: 'CAM3-concession',
    level: 'L2',
    category: 'subordination',
    input: 'Embora estivesse cansado, ele continuou.',
    expect: {
      acts: [{
        operations: ['structure'],
      }],
    },
  },

  // ── 8. Final ──────────────────────────────────────────────
  {
    name: 'CAM3-purpose',
    level: 'L2',
    category: 'subordination',
    input: 'Ele treinou muito para que pudesse vencer.',
    expect: {
      acts: [{
        operations: ['structure'],
      }],
    },
  },

  // ── 9. Discurso indireto aninhado ─────────────────────────
  {
    name: 'CAM3-nested-indirect',
    level: 'L1',
    category: 'enunciation',
    input: 'João disse que Maria achava que estava chovendo.',
    expect: {
      acts: [{
        operations: ['enunciate'],
        form: 'indirect-speech',
      }],
    },
  },

  // ── 10. Expectativa explícita ─────────────────────────────
  {
    name: 'CAM3-expectation',
    level: 'L3',
    category: 'interiority',
    input: 'João esperava que Maria voltasse.',
    expect: {
      acts: [{
        operations: ['interiorize'],
        form: 'thought',
      }],
    },
  },

  // ── 11. Clivada enfática ──────────────────────────────────
  {
    name: 'CAM3-pseudo-cleft',
    level: 'L3',
    category: 'evaluation',
    input: 'O que importava era a verdade.',
    expect: {
      acts: [{
        operations: ['evaluate'],
        form: 'commentary',
      }],
    },
  },

  // ── 12. Discurso indireto livre com dúvida ────────────────
  {
    name: 'CAM3-free-indirect-doubt',
    level: 'L3',
    category: 'interiority',
    input: 'Talvez fosse melhor esperar.',
    expect: {
      acts: [{
        operations: ['interiorize'],
        form: 'free-indirect-discourse',
      }],
    },
  },

]);

// ══════════════════════════════════════════════════════════════
// HELPERS INTERNOS
// ══════════════════════════════════════════════════════════════

function _now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function _round(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

/** @type {Readonly<Object<string, string>>} @private */
const _V1_TO_D = Object.freeze({
  'represent':   'D1',
  'describe':    'D2',
  'expose':      'D3',
  'interiorize': 'D4',
  'enunciate':   'D5',
  'evaluate':    'D6',
  'focalize':    'D7',
  'structure':   'D8',
});

function _operationOfDNumber(dnumber) {
  if (typeof dnumber !== 'string') return null;
  const m = /^(D\d+)/.exec(dnumber);
  return m ? m[1] : null;
}

function _collectActualSubtypes(act) {
  const out = {};

  const rich = act?.subtypes;
  if (rich && typeof rich === 'object' && !Array.isArray(rich)) {
    for (const [key, value] of Object.entries(rich)) {
      if (typeof value === 'string' && /^D\d/.test(value)) {
        out[key] = value;
      } else if (value && typeof value === 'object' && typeof value.id === 'string') {
        out[key] = value.id;
      }
    }
  }

  const flat = act?.subtypesFlat;
  if (flat && typeof flat === 'object' && !Array.isArray(flat)) {
    for (const [key, value] of Object.entries(flat)) {
      if (typeof value !== 'string') continue;
      if (!out[key]) out[key] = value;
      const dKey = _V1_TO_D[key];
      if (dKey && !out[dKey]) out[dKey] = value;
    }
  }

  return out;
}

/**
 * Normaliza o resultado de `interpretDocument`.
 * @param {Object} interpretResult
 * @param {string} input
 * @returns {Object}
 */
export function normalizeForCompare(interpretResult, input) {
  const acts = Array.isArray(interpretResult?.acts) ? interpretResult.acts : [];
  const diagnostics = Array.isArray(interpretResult?.diagnostics) ? interpretResult.diagnostics : [];

  const normalizedActs = acts.map((a) => {
    const subtypes = {};
    const rich = a.subtypes ?? {};
    for (const [dOp, sub] of Object.entries(rich)) {
      const id = typeof sub === 'string' ? sub : sub?.id;
      if (id) subtypes[dOp] = id;
    }
    const flat = a.subtypesFlat ?? {};
    for (const [v1op, id] of Object.entries(flat)) {
      const dOp = _V1_TO_D[v1op];
      if (dOp && !subtypes[dOp]) subtypes[dOp] = id;
    }

    const axes = {};
    const rawAxes = a.axes ?? {};
    for (const [dOp, opAxes] of Object.entries(rawAxes)) {
      if (!opAxes || typeof opAxes !== 'object') continue;
      const copy = {};
      for (const [axis, value] of Object.entries(opAxes)) {
        if (typeof value === 'string') copy[axis] = value;
      }
      if (Object.keys(copy).length > 0) axes[dOp] = copy;
    }

    const traits = Array.isArray(a.traits) ? [...a.traits] : [];

    return {
      id: a.id,
      operations: Array.isArray(a.operations) ? [...a.operations].sort() : [],
      primaryOperation: a.operations?.[0] ?? null,
      subtypes,
      axes,
      traits,
      voice: a.voice?.kind ?? null,
      voiceSourceId: a.voice?.sourceId ?? null,
      focalization: a.focalization?.targetId ?? a.focalization?.kind ?? null,
      form: a.form ?? null,
      tense: a.tense ?? null,
      aspect: a.aspect ?? null,
      modality: a.modality ?? null,
      negation: a.negation ?? null,
      epistemic: a.epistemic ?? null,
      confidence: a.confidence ?? 0,
    };
  });

  const normalizedDiagnostics = diagnostics.map((d) => ({
    code: d.code ?? null,
    severity: d.severity ?? null,
    phase: d.phase ?? null,
    message: d.message ?? '',
  }));

  const proposals = [];
  try {
    for (const act of acts) {
      const props = project(act, { projection: 'simulate' });
      for (const p of props) {
        proposals.push({
          actId: p.actId,
          command: p.command,
          kind: p.kind,
          confidence: p.confidence,
          subtypeId: p.subtypeId ?? null,
          source: p.source ?? null,
        });
      }
    }
  } catch { /* isola */ }

  return {
    acts: normalizedActs,
    diagnostics: normalizedDiagnostics,
    proposals,
  };
}

function _isSubsetStrings(expected, actual) {
  if (!Array.isArray(expected) || expected.length === 0) return { ok: true, missing: [] };
  const set = new Set(Array.isArray(actual) ? actual : []);
  const missing = expected.filter((x) => !set.has(x));
  return { ok: missing.length === 0, missing };
}

function _compareSubtypes(expected, actual) {
  const diffs = [];
  if (!expected || typeof expected !== 'object') return diffs;

  for (const [key, val] of Object.entries(expected)) {
    const expectedId = typeof val === 'string'
      ? val
      : (val && typeof val === 'object' ? val.id : null);
    if (!expectedId) continue;

    const actualId = actual?.[key];
    if (actualId !== expectedId) {
      diffs.push({
        field: `subtypes.${key}`,
        expected: expectedId,
        actual: actualId ?? null,
      });
    }
  }

  return diffs;
}

function _compareAxes(expected, actual) {
  const diffs = [];
  if (!expected || typeof expected !== 'object') return diffs;

  for (const [dOp, opAxes] of Object.entries(expected)) {
    if (!opAxes || typeof opAxes !== 'object') continue;
    const actualOp = actual?.[dOp] ?? {};

    for (const [axis, val] of Object.entries(opAxes)) {
      const aVal = actualOp[axis];
      if (aVal !== val) {
        diffs.push({
          field: `axes.${dOp}.${axis}`,
          expected: val,
          actual: aVal ?? null,
        });
      }
    }
  }

  return diffs;
}

function _compareTraits(expected, actual) {
  if (!Array.isArray(expected) || expected.length === 0) return [];
  const sub = _isSubsetStrings(expected, actual);
  if (sub.ok) return [];
  return [{
    field: 'traits',
    expected,
    actual: Array.isArray(actual) ? actual : [],
    missing: sub.missing,
  }];
}

function _compareAct(expected, actual) {
  const diffs = [];

  if (Array.isArray(expected.operations)) {
    const sub = _isSubsetStrings(expected.operations, actual.operations);
    if (!sub.ok) {
      diffs.push({
        field: 'operations',
        expected: expected.operations,
        actual: actual.operations,
        missing: sub.missing,
      });
    }
  }

  if ('primaryOperation' in expected) {
    if (expected.primaryOperation !== actual.primaryOperation) {
      diffs.push({
        field: 'primaryOperation',
        expected: expected.primaryOperation,
        actual: actual.primaryOperation,
      });
    }
  }

  if (expected.subtypes) {
    diffs.push(..._compareSubtypes(expected.subtypes, actual.subtypes));
  }

  if (expected.axes) {
    diffs.push(..._compareAxes(expected.axes, actual.axes));
  }

  if (expected.traits) {
    diffs.push(..._compareTraits(expected.traits, actual.traits));
  }

  if ('voice' in expected) {
    if (expected.voice !== actual.voice) {
      diffs.push({ field: 'voice', expected: expected.voice, actual: actual.voice });
    }
  }

  if ('focalization' in expected) {
    const e = expected.focalization;
    const a = actual.focalization;
    if (e !== a) {
      diffs.push({ field: 'focalization', expected: e, actual: a });
    }
  }

  if ('form' in expected) {
    if (expected.form !== actual.form) {
      diffs.push({ field: 'form', expected: expected.form, actual: actual.form });
    }
  }

  if ('epistemic' in expected) {
    if (expected.epistemic !== actual.epistemic) {
      diffs.push({ field: 'epistemic', expected: expected.epistemic, actual: actual.epistemic });
    }
  }

  if ('tense' in expected) {
    if (expected.tense !== actual.tense) {
      diffs.push({ field: 'tense', expected: expected.tense, actual: actual.tense });
    }
  }

  if ('aspect' in expected) {
    if (expected.aspect !== actual.aspect) {
      diffs.push({ field: 'aspect', expected: expected.aspect, actual: actual.aspect });
    }
  }

  if ('modality' in expected) {
    if (expected.modality !== actual.modality) {
      diffs.push({ field: 'modality', expected: expected.modality, actual: actual.modality });
    }
  }

  if ('negation' in expected) {
    if (expected.negation !== actual.negation) {
      diffs.push({ field: 'negation', expected: expected.negation, actual: actual.negation });
    }
  }

  return diffs;
}

function _compareDiagnostics(expected, actual) {
  if (!Array.isArray(expected) || expected.length === 0) return [];

  const diffs = [];
  const actualCodes = new Set((actual ?? []).map((d) => d.code));

  for (const e of expected) {
    if (!e || typeof e.code !== 'string') continue;
    if (!actualCodes.has(e.code)) {
      diffs.push({
        field: 'diagnostics',
        expected: e.code,
        actual: null,
      });
    }
  }

  return diffs;
}

function _compareProposals(expected, actual) {
  if (!Array.isArray(expected) || expected.length === 0) return [];

  const diffs = [];
  const actualCommands = (actual ?? []).map((p) => p.command ?? '');

  for (const e of expected) {
    if (!e || typeof e.command !== 'string') continue;
    const found = actualCommands.some((c) => c.startsWith(e.command));
    if (!found) {
      diffs.push({
        field: 'proposals',
        expected: e.command,
        actual: actualCommands.slice(0, 5),
      });
    }
  }

  return diffs;
}

// ══════════════════════════════════════════════════════════════
// EXECUÇÃO
// ══════════════════════════════════════════════════════════════

async function _runOne(fixture) {
  const result = {
    name: fixture.name ?? '?',
    level: fixture.level ?? '?',
    category: fixture.category ?? '?',
    input: String(fixture.input ?? ''),
    ok: false,
    durationMs: 0,
    failures: [],
    error: null,
    actual: null,
  };

  const t0 = _now();

  try {
    const interpretResult = await interpretDocument(result.input, fixture.context ?? {});
    const normalized = normalizeForCompare(interpretResult, result.input);
    result.actual = normalized;
  } catch (err) {
    result.error = err?.message ?? String(err);
    result.durationMs = _round(_now() - t0);
    return result;
  }

  const expectedActs = Array.isArray(fixture.expect?.acts) ? fixture.expect.acts : [];
  const actualActs = result.actual.acts;

  if (expectedActs.length !== actualActs.length) {
    result.failures.push({
      field: 'acts.length',
      expected: expectedActs.length,
      actual: actualActs.length,
    });
  }

  for (let i = 0; i < Math.min(expectedActs.length, actualActs.length); i++) {
    const diffs = _compareAct(expectedActs[i], actualActs[i]);
    for (const d of diffs) {
      result.failures.push({ ...d, actIndex: i });
    }
  }

  const expectedDiags = Array.isArray(fixture.expect?.diagnostics) ? fixture.expect.diagnostics : [];
  const diagDiffs = _compareDiagnostics(expectedDiags, result.actual.diagnostics);
  for (const d of diagDiffs) result.failures.push(d);

  const expectedProps = Array.isArray(fixture.expect?.proposals) ? fixture.expect.proposals : [];
  const propDiffs = _compareProposals(expectedProps, result.actual.proposals);
  for (const d of propDiffs) result.failures.push(d);

  result.ok = result.failures.length === 0;
  result.durationMs = _round(_now() - t0);

  return result;
}

// ══════════════════════════════════════════════════════════════
// API PRINCIPAL
// ══════════════════════════════════════════════════════════════

/**
 * Roda uma lista de fixtures.
 * @param {Object} [opts={}]
 * @returns {Promise<Object>}
 */
export async function runFixtures(opts = {}) {
  const all = Array.isArray(opts.fixtures) ? opts.fixtures : CANONICAL_FIXTURES;

  const filtered = all.filter((f) => {
    if (opts.level && f.level !== opts.level) return false;
    if (opts.category && f.category !== opts.category) return false;
    if (opts.name && !String(f.name).includes(opts.name)) return false;
    return true;
  });

  try {
    if (!Adapter.isAvailable()) {
      await Adapter.init();
    }
  } catch { /* isola */ }

  const t0 = _now();
  const results = [];

  for (let i = 0; i < filtered.length; i++) {
    const fixture = filtered[i];
    let r;
    try {
      r = await _runOne(fixture);
    } catch (err) {
      r = {
        name: fixture.name,
        level: fixture.level,
        category: fixture.category,
        input: fixture.input,
        ok: false,
        durationMs: 0,
        failures: [],
        error: err?.message ?? String(err),
        actual: null,
      };
    }
    results.push(r);

    if (typeof opts.onProgress === 'function') {
      try {
        opts.onProgress({ result: r, index: i, total: filtered.length });
      } catch { /* isola */ }
    }

    if (opts.stopOnFirstFailure && !r.ok) break;
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;

  const byLevel = {};
  const byCategory = {};
  for (const r of results) {
    const lv = r.level ?? '?';
    const ct = r.category ?? '?';
    if (!byLevel[lv]) byLevel[lv] = { passed: 0, failed: 0 };
    if (!byCategory[ct]) byCategory[ct] = { passed: 0, failed: 0 };
    if (r.ok) { byLevel[lv].passed++; byCategory[ct].passed++; }
    else { byLevel[lv].failed++; byCategory[ct].failed++; }
  }

  return {
    ok: failed === 0,
    total: results.length,
    passed,
    failed,
    durationMs: _round(_now() - t0),
    results,
    byLevel,
    byCategory,
  };
}

// ══════════════════════════════════════════════════════════════
// RELATÓRIOS
// ══════════════════════════════════════════════════════════════

export function reportToMarkdown(report) {
  if (!report) return '# Fixtures vazio\n';

  const lines = [];
  const verdict = report.ok ? '✓ APROVADO' : '✗ REPROVADO';
  const icon = report.ok ? '✅' : '❌';

  lines.push(`# ${icon} Fixtures Narrativas — ${verdict}`);
  lines.push('');
  lines.push(`**Total:** ${report.total}`);
  lines.push(`**Aprovadas:** ${report.passed}`);
  lines.push(`**Reprovadas:** ${report.failed}`);
  lines.push(`**Duração:** ${report.durationMs}ms`);
  lines.push('');

  if (report.byLevel) {
    lines.push('## Por nível');
    lines.push('');
    lines.push('| Nível | Aprovadas | Reprovadas |');
    lines.push('|---|---:|---:|');
    for (const [level, st] of Object.entries(report.byLevel).sort()) {
      lines.push(`| ${level} | ${st.passed} | ${st.failed} |`);
    }
    lines.push('');
  }

  if (report.byCategory) {
    lines.push('## Por categoria');
    lines.push('');
    lines.push('| Categoria | Aprovadas | Reprovadas |');
    lines.push('|---|---:|---:|');
    for (const [cat, st] of Object.entries(report.byCategory).sort()) {
      lines.push(`| ${cat} | ${st.passed} | ${st.failed} |`);
    }
    lines.push('');
  }

  lines.push('## Resultados');
  lines.push('');
  for (const r of report.results) {
    const mark = r.ok ? '✓' : '✗';
    lines.push(`### ${mark} \`${r.name}\` (${r.level} · ${r.category})`);
    lines.push('');
    lines.push(`- **Input:** "${r.input}"`);
    lines.push(`- **Duração:** ${r.durationMs}ms`);
    if (r.error) {
      lines.push(`- **Erro:** \`${r.error}\``);
    }
    if (!r.ok && r.failures.length > 0) {
      lines.push(`- **Falhas:** ${r.failures.length}`);
      lines.push('');
      for (const f of r.failures.slice(0, 10)) {
        const exp = JSON.stringify(f.expected);
        const act = JSON.stringify(f.actual);
        lines.push(`  - \`${f.field}\`: esperado=${exp}, real=${act}`);
      }
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Gerado por narrative-language/fixtures/runner.js*`);
  return lines.join('\n');
}

export function reportToJSON(report) {
  if (!report) return null;
  try {
    return JSON.parse(JSON.stringify(report));
  } catch {
    return null;
  }
}

export function reportToText(report) {
  if (!report) return '';
  const lines = [];
  lines.push(`Fixtures: ${report.passed}/${report.total} passaram em ${report.durationMs}ms`);
  for (const r of report.results) {
    const mark = r.ok ? '✓' : '✗';
    const suffix = r.ok ? '' : ` [${r.failures.length} falha(s)]`;
    lines.push(`${mark} ${r.level} ${r.category} ${r.name}${suffix}`);
  }
  return lines.join('\n');
}

// ══════════════════════════════════════════════════════════════
// CONSULTAS
// ══════════════════════════════════════════════════════════════

export function listFixtureCategories(fixtures) {
  const set = new Set();
  for (const f of fixtures ?? []) {
    if (f?.category) set.add(f.category);
  }
  return Array.from(set).sort();
}

export function listFixtureLevels(fixtures) {
  const set = new Set();
  for (const f of fixtures ?? []) {
    if (f?.level) set.add(f.level);
  }
  return Array.from(set).sort();
}

export function fixturesByLevel(fixtures, level) {
  return (fixtures ?? []).filter((f) => f?.level === level);
}

export function fixturesByCategory(fixtures, category) {
  return (fixtures ?? []).filter((f) => f?.category === category);
}

// ══════════════════════════════════════════════════════════════
// REGISTRO DE FIXTURES EXTERNAS
// ══════════════════════════════════════════════════════════════

const _externalFixtures = [];

export function registerFixtures(fixtures) {
  const list = Array.isArray(fixtures) ? fixtures : [fixtures];
  for (const f of list) {
    if (f && typeof f.name === 'string' && typeof f.input === 'string') {
      _externalFixtures.push(f);
    }
  }
  return _externalFixtures.length;
}

export function clearRegisteredFixtures() {
  const n = _externalFixtures.length;
  _externalFixtures.length = 0;
  return n;
}

export function allFixtures() {
  return [...CANONICAL_FIXTURES, ..._externalFixtures];
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const FixtureRunner = Object.freeze({
  CANONICAL_FIXTURES,
  runFixtures,
  reportToMarkdown,
  reportToJSON,
  reportToText,
  normalizeForCompare,
  listFixtureCategories,
  listFixtureLevels,
  fixturesByLevel,
  fixturesByCategory,
  registerFixtures,
  clearRegisteredFixtures,
  allFixtures,
});