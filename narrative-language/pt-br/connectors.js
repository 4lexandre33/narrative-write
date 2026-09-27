/**
 * @file connectors.js
 * @module narrative-language/pt-br
 * @description Conectores discursivos do PT-BR mapeados para eixos
 *              dimensionais do catálogo canônico (D5, D7, D8).
 *              Consumido pelo `axis-detector.js` para inferir eixos
 *              a partir de marcadores explícitos no texto.
 * @imports narrative-language/ir/catalog
 * @importedBy narrative-language/acts/axis-detector
 * @level N0
 *
 * ═══════════════════════════════════════════════════════════════
 * CAMADA 3 — CONNECTORS EXPANDIDOS
 * ═══════════════════════════════════════════════════════════════
 *
 * Adicionados conectores novos para:
 *   - D8.temporal      → concessivos e finais temporais
 *   - D8.discursiva    → intercalação e bloco explícitos
 *   - D8.informacional → retardo e payoff adicionais
 *
 * Estrutura de uma entrada:
 *   {
 *     pattern: RegExp,
 *     operation: 'D5'|'D7'|'D8',
 *     axis: string,
 *     value: string,
 *     weight: number,
 *     reason: string,
 *   }
 *
 * Determinismo: padrões são testados na ordem declarada; primeiro hit ganha.
 */

// ══════════════════════════════════════════════════════════════
// D8 — TEMPORAL
// ══════════════════════════════════════════════════════════════

/**
 * Marcadores do eixo D8.temporal.
 * @type {ReadonlyArray<Object>}
 */
const _D8_TEMPORAL = Object.freeze([
  // Linear (sequência direta)
  { pattern: /\b(depois|em seguida|logo após|então|a seguir)\b/i,
    operation: 'D8', axis: 'temporal', value: 'linear', weight: 0.85,
    reason: 'conector de sequência temporal linear' },

  // Analepse (retrospecção)
  { pattern: /\b(anos antes|tempo atrás|outrora|antigamente|no passado|antes disso|antes daquilo|no dia anterior)\b/i,
    operation: 'D8', axis: 'temporal', value: 'analepse', weight: 0.92,
    reason: 'marcador de retrospecção' },

  // Prolepse (antecipação)
  { pattern: /\b(mais tarde|depois disso|anos depois|no dia seguinte|logo depois|tempo depois)\b/i,
    operation: 'D8', axis: 'temporal', value: 'prolepse', weight: 0.92,
    reason: 'marcador de antecipação' },

  // Simultaneidade
  { pattern: /\b(enquanto isso|simultaneamente|ao mesmo tempo|no mesmo instante|paralelamente)\b/i,
    operation: 'D8', axis: 'temporal', value: 'simultaneous', weight: 0.90,
    reason: 'marcador de simultaneidade' },

  // ── CAMADA 3 — Temporal via concessão ─────────────────────
  // Concessivos temporais: indicam que o tempo decorreu apesar do obstáculo
  { pattern: /\b(embora|ainda que|mesmo que|apesar de que|posto que|conquanto)\b/i,
    operation: 'D8', axis: 'temporal', value: 'linear', weight: 0.72,
    reason: 'concessivo temporal — linha temporal mantida apesar do obstáculo' },

  // ── CAMADA 3 — Temporal via finalidade ────────────────────
  // Finais temporais: ações encadeadas em sequência (antes → depois)
  { pattern: /\b(para que|a fim de que|com o objetivo de que|a fim de)\b/i,
    operation: 'D8', axis: 'temporal', value: 'linear', weight: 0.68,
    reason: 'final temporal — relação sequencial antes/depois' },
]);

// ══════════════════════════════════════════════════════════════
// D8 — DISTÂNCIA (ritmo narrativo)
// ══════════════════════════════════════════════════════════════

/**
 * Marcadores do eixo D8.distancia.
 * @type {ReadonlyArray<Object>}
 */
const _D8_DISTANCIA = Object.freeze([
  // Cena (tempo real)
  { pattern: /\b(de repente|subitamente|de súbito|naquele instante)\b/i,
    operation: 'D8', axis: 'distancia', value: 'scene', weight: 0.88,
    reason: 'marcador de cena em tempo real' },

  // Sumário (compressão)
  { pattern: /\b(durante (anos|meses|dias)|por muito tempo|por (longos )?anos)\b/i,
    operation: 'D8', axis: 'distancia', value: 'summary', weight: 0.85,
    reason: 'marcador de compressão temporal' },

  // Elipse (corte)
  { pattern: /\b(algum tempo depois|tempo passou|quando voltou|ao retornar)\b/i,
    operation: 'D8', axis: 'distancia', value: 'ellipsis', weight: 0.82,
    reason: 'marcador de elipse temporal' },

  // Pausa (tempo parado)
  { pattern: /\b(durante aquele instante|naquele momento exato)\b/i,
    operation: 'D8', axis: 'distancia', value: 'pause', weight: 0.78,
    reason: 'marcador de pausa descritiva' },

  // Iterativo (hábito)
  { pattern: /\b(todos os (dias|anos|meses)|costumeiramente|habitualmente|como de costume|sempre que)\b/i,
    operation: 'D8', axis: 'distancia', value: 'iterative', weight: 0.90,
    reason: 'marcador de iteratividade' },
]);

// ══════════════════════════════════════════════════════════════
// D8 — INFORMACIONAL
// ══════════════════════════════════════════════════════════════

/**
 * Marcadores do eixo D8.informacional.
 * @type {ReadonlyArray<Object>}
 */
const _D8_INFORMACIONAL = Object.freeze([
  { pattern: /\b(como se verá|mais adiante|no próximo capítulo)\b/i,
    operation: 'D8', axis: 'informacional', value: 'delay', weight: 0.80,
    reason: 'marcador de retardo informacional' },

  { pattern: /\b(como (já )?mencionado|como dito antes)\b/i,
    operation: 'D8', axis: 'informacional', value: 'payoff', weight: 0.78,
    reason: 'marcador de pagamento informacional' },

  { pattern: /\b(uma pista|um indício|suspeitava)\b/i,
    operation: 'D8', axis: 'informacional', value: 'hint', weight: 0.72,
    reason: 'marcador de pista' },

  // ── CAMADA 3 — Informacional via clivada ─────────────────
  // Clivadas enfáticas normalmente marcadoras de payoff (revelação)
  { pattern: /^(o que|quem|onde|quando)\s+.+\s+(foi|é|era|será)\s+/i,
    operation: 'D8', axis: 'informacional', value: 'payoff', weight: 0.75,
    reason: 'clivada enfática — foco informacional' },

  // ── CAMADA 3 — Informacional via omissão ─────────────────
  { pattern: /\b(preferiu não contar|deixou no ar|omitiu|não disse nada)\b/i,
    operation: 'D8', axis: 'informacional', value: 'omit', weight: 0.82,
    reason: 'marcador de omissão deliberada' },
]);

// ══════════════════════════════════════════════════════════════
// D8 — DISCURSIVA
// ══════════════════════════════════════════════════════════════

/**
 * Marcadores do eixo D8.discursiva.
 * @type {ReadonlyArray<Object>}
 */
const _D8_DISCURSIVA = Object.freeze([
  { pattern: /\b(a história de|o conto de|o relato de|a lenda de)\b/i,
    operation: 'D8', axis: 'discursiva', value: 'frame', weight: 0.88,
    reason: 'narrativa emoldurada' },

  { pattern: /^\s*(capítulo|parte|seção)\s+\w+/im,
    operation: 'D8', axis: 'discursiva', value: 'segment', weight: 0.85,
    reason: 'segmentação explícita' },

  // ── CAMADA 3 — Intercalação ──────────────────────────────
  { pattern: /^\s*\(/,
    operation: 'D8', axis: 'discursiva', value: 'intercalation', weight: 0.78,
    reason: 'parêntese narrativo — intercalação' },

  { pattern: /\b(a propósito|por falar nisso|incidentalmente|entre parênteses)\b/i,
    operation: 'D8', axis: 'discursiva', value: 'intercalation', weight: 0.82,
    reason: 'marcador de intercalação' },

  // ── CAMADA 3 — Bloco ─────────────────────────────────────
  { pattern: /^\s*\*\s*\*\s*\*/,
    operation: 'D8', axis: 'discursiva', value: 'block', weight: 0.85,
    reason: 'separador de bloco narrativo' },

  { pattern: /^\s*---\s*$/m,
    operation: 'D8', axis: 'discursiva', value: 'block', weight: 0.85,
    reason: 'divisor de bloco narrativo' },
]);

// ══════════════════════════════════════════════════════════════
// D7 — GRAU DE FOCALIZAÇÃO
// ══════════════════════════════════════════════════════════════

/**
 * Marcadores do eixo D7.grau.
 * @type {ReadonlyArray<Object>}
 */
const _D7_GRAU = Object.freeze([
  // Internal (filtrado por consciência)
  { pattern: /^\s*para\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]\w+/,
    operation: 'D7', axis: 'grau', value: 'internal', weight: 0.92,
    reason: 'focalizador explícito ("para X")' },

  { pattern: /^\s*segundo\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]\w+/,
    operation: 'D7', axis: 'grau', value: 'internal', weight: 0.90,
    reason: 'focalizador explícito ("segundo X")' },

  { pattern: /\b(do ponto de vista de|na perspectiva de)\s+\w+/i,
    operation: 'D7', axis: 'grau', value: 'internal', weight: 0.92,
    reason: 'focalizador explícito ("ponto de vista de X")' },

  // External (comportamental)
  { pattern: /\b(aparentemente|ao que parecia|supostamente)\b/i,
    operation: 'D7', axis: 'grau', value: 'external', weight: 0.75,
    reason: 'focalização externa (observador)' },

  // Zero (onisciente)
  { pattern: /\b(em todo o reino|do alto|de todos os cantos|naquele mundo inteiro)\b/i,
    operation: 'D7', axis: 'grau', value: 'zero', weight: 0.80,
    reason: 'focalização onisciente' },
]);

// ══════════════════════════════════════════════════════════════
// D7 — ESTABILIDADE
// ══════════════════════════════════════════════════════════════

/**
 * Marcadores do eixo D7.estabilidade.
 * @type {ReadonlyArray<Object>}
 */
const _D7_ESTABILIDADE = Object.freeze([
  { pattern: /\b(por outro lado|entretanto, do outro lado|em contrapartida)\b/i,
    operation: 'D7', axis: 'estabilidade', value: 'variable', weight: 0.75,
    reason: 'alternância de foco' },
]);

// ══════════════════════════════════════════════════════════════
// D7 — ALCANCE DE K
// ══════════════════════════════════════════════════════════════

/**
 * Marcadores do eixo D7.alcanceK.
 * @type {ReadonlyArray<Object>}
 */
const _D7_ALCANCE_K = Object.freeze([
  { pattern: /\b(mas o leitor já sabia|o leitor não sabia|sem que soubesse|o que ele não sabia)\b/i,
    operation: 'D7', axis: 'alcanceK', value: 'asymmetric-reader', weight: 0.88,
    reason: 'assimetria leitor↔personagem' },

  { pattern: /\b(sem que ninguém soubesse|sem testemunhas|em segredo)\b/i,
    operation: 'D7', axis: 'alcanceK', value: 'asymmetric-narrator', weight: 0.82,
    reason: 'assimetria narrador↔personagens' },
]);

// ══════════════════════════════════════════════════════════════
// D5 — MODO
// ══════════════════════════════════════════════════════════════

/**
 * Marcadores do eixo D5.modo.
 * @type {ReadonlyArray<Object>}
 */
const _D5_MODO = Object.freeze([
  { pattern: /^\s*—\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/,
    operation: 'D5', axis: 'modo', value: 'direct', weight: 0.95,
    reason: 'discurso direto (travessão)' },

  { pattern: /^\s*["""]\S/,
    operation: 'D5', axis: 'modo', value: 'direct', weight: 0.92,
    reason: 'discurso direto (aspas)' },

  { pattern: /\b(disse|falou|respondeu|perguntou|contou)\s+que\b/i,
    operation: 'D5', axis: 'modo', value: 'indirect', weight: 0.90,
    reason: 'discurso indireto' },

  { pattern: /\b(talvez|porventura|quem sabe)\s+(fosse|tivesse|pudesse|quisesse)\b/i,
    operation: 'D5', axis: 'modo', value: 'free-indirect', weight: 0.85,
    reason: 'discurso indireto livre' },
]);

// ══════════════════════════════════════════════════════════════
// D5 — ENUNCIADOR
// ══════════════════════════════════════════════════════════════

/**
 * Marcadores do eixo D5.enunciador.
 * @type {ReadonlyArray<Object>}
 */
const _D5_ENUNCIADOR = Object.freeze([
  { pattern: /^\s*—\s+/,
    operation: 'D5', axis: 'enunciador', value: 'character', weight: 0.90,
    reason: 'travessão indica personagem falando' },

  { pattern: /\b(eu|mim|me|meu|minha)\b/i,
    operation: 'D5', axis: 'enunciador', value: 'character', weight: 0.80,
    reason: 'primeira pessoa em discurso' },

  { pattern: /\b(caro leitor|leitor amigo|você que lê)\b/i,
    operation: 'D5', axis: 'enunciador', value: 'reader', weight: 0.92,
    reason: 'apóstrofe ao leitor' },
]);

// ══════════════════════════════════════════════════════════════
// CATÁLOGO AGREGADO
// ══════════════════════════════════════════════════════════════

/**
 * Todos os conectores, agrupados por eixo.
 * @type {Readonly<Object<string, ReadonlyArray<Object>>>}
 */
export const CONNECTORS = Object.freeze({
  'D8.temporal':       _D8_TEMPORAL,
  'D8.distancia':      _D8_DISTANCIA,
  'D8.informacional':  _D8_INFORMACIONAL,
  'D8.discursiva':     _D8_DISCURSIVA,
  'D7.grau':           _D7_GRAU,
  'D7.estabilidade':   _D7_ESTABILIDADE,
  'D7.alcanceK':       _D7_ALCANCE_K,
  'D5.modo':           _D5_MODO,
  'D5.enunciador':     _D5_ENUNCIADOR,
});

// ══════════════════════════════════════════════════════════════
// API PÚBLICA
// ══════════════════════════════════════════════════════════════

/**
 * Lista todos os conectores de um eixo específico.
 * @param {string} axisKey
 * @returns {Array<Object>}
 */
export function connectorsFor(axisKey) {
  const list = CONNECTORS[axisKey];
  return Array.isArray(list) ? [...list] : [];
}

/**
 * Lista todas as chaves de eixo registradas.
 * @returns {string[]}
 */
export function axisKeys() {
  return Object.keys(CONNECTORS);
}

/**
 * Número total de conectores.
 * @returns {number}
 */
export function size() {
  let n = 0;
  for (const list of Object.values(CONNECTORS)) n += list.length;
  return n;
}

/**
 * Estatísticas.
 * @returns {{ total:number, byAxis:Object }}
 */
export function stats() {
  const byAxis = {};
  for (const [k, list] of Object.entries(CONNECTORS)) {
    byAxis[k] = list.length;
  }
  return {
    total: size(),
    byAxis,
  };
}

/**
 * Testa todos os conectores contra um texto. Devolve o primeiro match
 * para cada eixo distinto.
 *
 * @param {string} text
 * @returns {Array<Object>}
 */
export function detect(text) {
  const s = String(text ?? '');
  if (!s) return [];

  const seen = new Set();
  const out = [];

  for (const [axisKey, list] of Object.entries(CONNECTORS)) {
    if (seen.has(axisKey)) continue;

    for (const entry of list) {
      if (entry.pattern.test(s)) {
        out.push({
          operation: entry.operation,
          axis: entry.axis,
          value: entry.value,
          weight: entry.weight,
          reason: entry.reason,
          axisKey,
        });
        seen.add(axisKey);
        break;
      }
    }
  }

  return out;
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const Connectors = Object.freeze({
  CONNECTORS,
  connectorsFor,
  axisKeys,
  size,
  stats,
  detect,
});