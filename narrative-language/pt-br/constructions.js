/**
 * @file constructions.js
 * @module narrative-language/pt-br
 * @description Reconhecedores de construções narrativas recorrentes.
 *              Complementa o NLP backend com padrões que ele não
 *              cobre bem em PT-BR (focalização subjetiva, discurso
 *              direto, citação, marcadores discursivos).
 * @imports — (nenhum)
 * @importedBy narrative-language/pipeline/analyzer,
 *             narrative-language/acts/classifier,
 *             narrative-language/acts/dimensions,
 *             narrative-language/acts/rule-compiler (F11)
 * @level N1
 *
 * ═══════════════════════════════════════════════════════════════
 * CAMADA 3 — CONSTRUCTIONS EXPANDIDAS
 * ═══════════════════════════════════════════════════════════════
 *
 * Além das 24 construções originais (discurso direto, focalização,
 * interioridade, regras, exposição), esta versão adiciona 12 novas
 * que cobrem construções sintáticas frequentes que o spaCy
 * identifica mas o classifier não tratava:
 *
 *   1. relative-clause-restrictive    — oração relativa restritiva
 *   2. relative-clause-explanatory    — oração relativa explicativa
 *   3. apposition                     — aposto
 *   4. consecutive-clause             — consecutiva (tão… que)
 *   5. comparison                     — comparativa (tão… quanto)
 *   6. causal-gerund                  — gerúndio causal (…, vendo …)
 *   7. concession                     — concessiva (embora…, …)
 *   8. purpose-clause                 — final (…para que…)
 *   9. nested-indirect-speech         — discurso indireto de 2 níveis
 *  10. explicit-expectation           — expectativa explícita
 *  11. pseudo-cleft                   — clivada enfática
 *  12. free-indirect-doubt            — discurso indireto livre com dúvida
 *
 * Uma "construção" é um padrão (regex + handler) que reconhece uma
 * forma linguística e devolve pistas semânticas (`hints`) para as
 * camadas posteriores. Não decide operações — apenas sugere.
 *
 * Contrato de retorno:
 *   {
 *     id: string,
 *     groups: Object<string,string>,  // grupos capturados
 *     span: { start:number, end:number, raw:string },
 *     hints: {
 *       operation?: string,
 *       focalization?: string,
 *       voice?: string,
 *       form?: string,
 *       relation?: string,
 *       ruleTrigger?: string,
 *     },
 *     confidence: number,             // [0, 1]
 *   }
 */

// ══════════════════════════════════════════════════════════════
// HELPERS INTERNOS
// ══════════════════════════════════════════════════════════════

/**
 * Extrai um match de regex numa sentença, normalizando o span.
 * @param {string} sentence
 * @param {RegExp} re
 * @param {(m: RegExpMatchArray) => Object} handler
 * @returns {Object|null}
 * @private
 */
function _tryMatch(sentence, re, handler) {
  const m = sentence.match(re);
  if (!m) return null;
  const raw = m[0];
  const start = m.index ?? 0;
  const end = start + raw.length;
  return handler(m, { start, end, raw });
}

/**
 * Verifica se uma string está vazia ou é só whitespace.
 * @param {string} s
 * @returns {boolean}
 * @private
 */
function _isEmpty(s) {
  return !s || s.trim().length === 0;
}

/**
 * Cria um objeto Match padronizado.
 * @private
 */
function _mk(id, groups, span, hints, confidence) {
  return {
    id,
    groups,
    span,
    hints,
    confidence: typeof confidence === 'number' ? confidence : 0.9,
  };
}

// ══════════════════════════════════════════════════════════════
// CATÁLOGO DE CONSTRUÇÕES
// ══════════════════════════════════════════════════════════════

/**
 * Catálogo de construções. Ordem importa: as primeiras casam antes.
 * @type {ReadonlyArray<{ id:string, matcher:Function }>}
 */
export const CONSTRUCTIONS = Object.freeze([

  // ══════════════════════════════════════════════════════════
  // FOCALIZAÇÃO SUBJETIVA
  // ══════════════════════════════════════════════════════════
  {
    id: 'para-x-parecia-y',
    matcher: (s) => _tryMatch(
      s,
      /^para\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+),\s+(.+?)\s+(parecia|era|estava|ficava|tornava-se)\s+(.+?)\.?$/i,
      (m, span) => _mk('para-x-parecia-y', {
        focalizer: m[1].trim(),
        theme: m[2].trim(),
        verb: m[3].trim(),
        quality: m[4].trim(),
      }, span, {
        operation: 'describe',
        focalization: m[1].trim(),
        form: 'subjective-perception',
      }, 0.92)
    ),
  },

  {
    id: 'para-x-y-era-z',
    matcher: (s) => _tryMatch(
      s,
      /^para\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+),\s+(.+?)\s+(era|estava|parecia)\s+(.+?)\.?$/i,
      (m, span) => _mk('para-x-y-era-z', {
        focalizer: m[1].trim(),
        theme: m[2].trim(),
        verb: m[3].trim(),
        quality: m[4].trim(),
      }, span, {
        operation: 'describe',
        focalization: m[1].trim(),
        form: 'subjective-perception',
      }, 0.90)
    ),
  },

  // ══════════════════════════════════════════════════════════
  // FOCALIZAÇÃO NEGATIVA
  // ══════════════════════════════════════════════════════════
  {
    id: 'x-nao-viu-y',
    matcher: (s) => _tryMatch(
      s,
      /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+n[ãa]o\s+(viu|ouviu|percebeu|notou)\s+(.+?)\.?$/i,
      (m, span) => _mk('x-nao-viu-y', {
        perceiver: m[1].trim(),
        verb: m[2].trim(),
        theme: m[3].trim(),
      }, span, {
        operation: 'describe',
        focalization: m[1].trim(),
        form: 'subjective-perception',
      }, 0.88)
    ),
  },

  // ══════════════════════════════════════════════════════════
  // DISCURSO DIRETO / INDIRETO
  // ══════════════════════════════════════════════════════════
  {
    id: 'direct-speech-dash',
    matcher: (s) => _tryMatch(
      s,
      /^—\s+(.+?)(\s+—\s+disse\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+))?\.?$/,
      (m, span) => {
        const groups = { content: m[1].trim() };
        if (m[3]) groups.attributedTo = m[3].trim();
        return _mk('direct-speech-dash', groups, span, {
          operation: 'enunciate',
          voice: 'character',
          form: 'direct-speech',
        }, 0.95);
      }
    ),
  },

  {
    id: 'x-disse-que-y',
    matcher: (s) => _tryMatch(
      s,
      /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(disse|falou|contou|afirmou|declarou|respondeu|perguntou)\s+que\s+(.+?)\.?$/i,
      (m, span) => _mk('x-disse-que-y', {
        speaker: m[1].trim(),
        verb: m[2].trim(),
        content: m[3].trim(),
      }, span, {
        operation: 'enunciate',
        voice: 'character',
        form: 'indirect-speech',
      }, 0.93)
    ),
  },

  {
    id: 'x-y-disse',
    matcher: (s) => _tryMatch(
      s,
      /^(.+?),\s+(disse|falou|respondeu|perguntou|gritou|sussurrou)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\.?$/i,
      (m, span) => _mk('x-y-disse', {
        content: m[1].trim(),
        verb: m[2].trim(),
        speaker: m[3].trim(),
      }, span, {
        operation: 'enunciate',
        voice: 'character',
        form: 'direct-speech',
      }, 0.91)
    ),
  },

  // ══════════════════════════════════════════════════════════
  // EPISTEMOLOGIA
  // ══════════════════════════════════════════════════════════
  {
    id: 'x-sabia-que-y',
    matcher: (s) => _tryMatch(
      s,
      /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(sabia|conhecia|entendia|compreendia)\s+que\s+(.+?)\.?$/i,
      (m, span) => _mk('x-sabia-que-y', {
        holder: m[1].trim(),
        verb: m[2].trim(),
        proposition: m[3].trim(),
      }, span, {
        operation: 'interiorize',
        form: 'thought',
      }, 0.94)
    ),
  },

  {
    id: 'x-achava-que-y',
    matcher: (s) => _tryMatch(
      s,
      /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(achava|pensava|acreditava|imaginava|supunha|julgava)\s+que\s+(.+?)\.?$/i,
      (m, span) => _mk('x-achava-que-y', {
        holder: m[1].trim(),
        verb: m[2].trim(),
        proposition: m[3].trim(),
      }, span, {
        operation: 'interiorize',
        form: 'thought',
      }, 0.93)
    ),
  },

  {
    id: 'x-viu-y',
    matcher: (s) => _tryMatch(
      s,
      /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(viu|ouviu|olhou\s+para|observou|escutou)\s+(.+?)\.?$/i,
      (m, span) => _mk('x-viu-y', {
        perceiver: m[1].trim(),
        verb: m[2].trim(),
        target: m[3].trim(),
      }, span, {
        operation: 'represent',
        form: 'narration',
      }, 0.85)
    ),
  },

  // ══════════════════════════════════════════════════════════
  // INTERIORIDADE
  // ══════════════════════════════════════════════════════════
  {
    id: 'x-sentiu-y',
    matcher: (s) => _tryMatch(
      s,
      /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+sentiu\s+(.+?)\.?$/i,
      (m, span) => _mk('x-sentiu-y', {
        experiencer: m[1].trim(),
        object: m[2].trim(),
      }, span, {
        operation: 'interiorize',
        form: 'thought',
      }, 0.88)
    ),
  },

  {
    id: 'x-queria-y',
    matcher: (s) => _tryMatch(
      s,
      /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(queria|desejava|pretendia|esperava)\s+(.+?)\.?$/i,
      (m, span) => _mk('x-queria-y', {
        experiencer: m[1].trim(),
        verb: m[2].trim(),
        target: m[3].trim(),
      }, span, {
        operation: 'interiorize',
        form: 'thought',
      }, 0.92)
    ),
  },

  {
    id: 'x-lembrou-de-y',
    matcher: (s) => _tryMatch(
      s,
      /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(lembrou|recordou|lembrou-se|recordou-se)\s+(de|do|da)\s+(.+?)\.?$/i,
      (m, span) => _mk('x-lembrou-de-y', {
        holder: m[1].trim(),
        verb: m[2].trim(),
        proposition: m[4].trim(),
      }, span, {
        operation: 'interiorize',
        form: 'thought',
      }, 0.91)
    ),
  },

  {
    id: 'maybe-error',
    matcher: (s) => _tryMatch(
      s,
      /^(talvez|porventura|quem\s+sabe)\s+(.+?)\.?$/i,
      (m, span) => _mk('maybe-error', {
        marker: m[1].trim(),
        content: m[2].trim(),
      }, span, {
        operation: 'interiorize',
        form: 'free-indirect-discourse',
      }, 0.82)
    ),
  },

  // ══════════════════════════════════════════════════════════
  // ESTRUTURA TEMPORAL
  // ══════════════════════════════════════════════════════════
  {
    id: 'anos-antes',
    matcher: (s) => _tryMatch(
      s,
      /^(anos\s+antes|décadas\s+antes|séculos\s+antes|muito\s+antes|tempo\s+atrás|muito\s+tempo\s+atrás),\s*(.+?)\.?$/i,
      (m, span) => _mk('anos-antes', {
        marker: m[1].trim(),
        content: m[2].trim(),
      }, span, {
        operation: 'structure',
        relation: 'retrospection',
      }, 0.95)
    ),
  },

  {
    id: 'mais-tarde',
    matcher: (s) => _tryMatch(
      s,
      /^(mais\s+tarde|depois\s+disso|algum\s+tempo\s+depois|dias\s+depois|anos\s+depois),\s*(.+?)\.?$/i,
      (m, span) => _mk('mais-tarde', {
        marker: m[1].trim(),
        content: m[2].trim(),
      }, span, {
        operation: 'structure',
        relation: 'anticipation',
      }, 0.94)
    ),
  },

  {
    id: 'enquanto-isso',
    matcher: (s) => _tryMatch(
      s,
      /^(enquanto\s+isso|ao\s+mesmo\s+tempo|simultaneamente|naquele\s+momento),\s*(.+?)\.?$/i,
      (m, span) => _mk('enquanto-isso', {
        marker: m[1].trim(),
        content: m[2].trim(),
      }, span, {
        operation: 'structure',
        relation: 'simultaneity',
      }, 0.93)
    ),
  },

  {
    id: 'havia-tempo',
    matcher: (s) => _tryMatch(
      s,
      /^(.+?)\s+(havia|existia|estava)\s+(.+\s+(anos?|décadas?|séculos?)\s+(antes|atrás))\.?$/i,
      (m, span) => _mk('havia-tempo', {
        theme: m[1].trim(),
        verb: m[2].trim(),
        duration: m[3].trim(),
      }, span, {
        operation: 'expose',
        relation: 'exposition',
      }, 0.86)
    ),
  },

  // ══════════════════════════════════════════════════════════
  // AVALIAÇÃO
  // ══════════════════════════════════════════════════════════
  {
    id: 'foi-uma-avaliacao',
    matcher: (s) => _tryMatch(
      s,
      /^(foi|era|seria)\s+(uma|um)\s+(péssima?|ótima?|má|boa|terrível|excelente|imprudente|sábia|estúpida)\s+(ideia|decisão|escolha)\.?$/i,
      (m, span) => _mk('foi-uma-avaliacao', {
        verb: m[1].trim(),
        article: m[2].trim(),
        qualifier: m[3].trim(),
        target: m[4].trim(),
      }, span, {
        operation: 'evaluate',
        form: 'commentary',
      }, 0.94)
    ),
  },

  // ══════════════════════════════════════════════════════════
  // REGRAS NATURAIS
  // ══════════════════════════════════════════════════════════
  {
    id: 'rule-se',
    matcher: (s) => _tryMatch(
      s,
      /^se\s+(.+?),\s*(.+?)\.?$/i,
      (m, span) => _mk('rule-se', {
        condition: m[1].trim(),
        effect: m[2].trim(),
      }, span, {
        operation: 'structure',
        ruleTrigger: 'conditional',
      }, 0.92)
    ),
  },

  {
    id: 'rule-quando',
    matcher: (s) => _tryMatch(
      s,
      /^quando\s+(.+?),\s*(.+?)\.?$/i,
      (m, span) => _mk('rule-quando', {
        condition: m[1].trim(),
        effect: m[2].trim(),
      }, span, {
        operation: 'structure',
        ruleTrigger: 'temporal',
      }, 0.93)
    ),
  },

  {
    id: 'rule-sempre-que',
    matcher: (s) => _tryMatch(
      s,
      /^sempre\s+que\s+(.+?),\s*(.+?)\.?$/i,
      (m, span) => _mk('rule-sempre-que', {
        condition: m[1].trim(),
        effect: m[2].trim(),
      }, span, {
        operation: 'structure',
        ruleTrigger: 'habitual',
      }, 0.93)
    ),
  },

  {
    id: 'rule-depois-que',
    matcher: (s) => _tryMatch(
      s,
      /^depois\s+que\s+(.+?),\s*(.+?)\.?$/i,
      (m, span) => _mk('rule-depois-que', {
        condition: m[1].trim(),
        effect: m[2].trim(),
      }, span, {
        operation: 'structure',
        ruleTrigger: 'after',
      }, 0.92)
    ),
  },

  // ══════════════════════════════════════════════════════════
  // IDENTIDADE / LOCALIZAÇÃO
  // ══════════════════════════════════════════════════════════
  {
    id: 'x-e-um-y',
    matcher: (s) => _tryMatch(
      s,
      /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+é\s+(um|uma)\s+([a-záéíóúâêôãõç]+)\.?$/i,
      (m, span) => _mk('x-e-um-y', {
        subject: m[1].trim(),
        article: m[2].trim(),
        type: m[3].trim(),
      }, span, {
        operation: 'expose',
        form: 'exposition',
      }, 0.90)
    ),
  },

  {
    id: 'x-fica-em-y',
    matcher: (s) => _tryMatch(
      s,
      /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(fica|está|mora|vive)\s+(em|no|na|nos|nas)\s+(.+?)\.?$/i,
      (m, span) => _mk('x-fica-em-y', {
        subject: m[1].trim(),
        verb: m[2].trim(),
        preposition: m[3].trim(),
        location: m[4].trim(),
      }, span, {
        operation: 'expose',
        relation: 'location',
      }, 0.91)
    ),
  },

  // ══════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════
  // CAMADA 3 — CONSTRUCTIONS EXPANDIDAS
  // ══════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════

  // ── 1. Oração relativa restritiva ──────────────────────────
  //
  // "O homem que viu o lobo fugiu."
  // Casa: <head> que <sujeito> <predicado>
  // Não casa se houver vírgula antes do "que" (isso é explicativa)
  {
    id: 'relative-clause-restrictive',
    matcher: (s) => {
      // Rejeita se houver vírgula antes do "que"
      if (/,\s*que\b/i.test(s)) return null;
      return _tryMatch(
        s,
        /^(.+?)\s+que\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(.+?)\.?$/i,
        (m, span) => _mk('relative-clause-restrictive', {
          head: m[1].trim(),
          subject: m[2].trim(),
          rel: m[3].trim(),
        }, span, {
          operation: 'describe',
          form: 'description',
          relation: 'restrictive-relative',
        }, 0.88)
      );
    },
  },

  // ── 2. Oração relativa explicativa ─────────────────────────
  //
  // "João, que viu o lobo, fugiu."
  // Casa: <head>, que <relativa>[, <continuação>]
  {
    id: 'relative-clause-explanatory',
    matcher: (s) => _tryMatch(
      s,
      /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+),\s+que\s+(.+?)\.?$/i,
      (m, span) => _mk('relative-clause-explanatory', {
        head: m[1].trim(),
        rel: m[2].trim(),
      }, span, {
        operation: 'expose',
        form: 'exposition',
        relation: 'explanatory-relative',
      }, 0.86)
    ),
  },

  // ── 3. Aposto ──────────────────────────────────────────────
  //
  // "João, o Bravo, atacou o dragão."
  // "Maria, uma guerreira experiente, liderou o grupo."
  {
    id: 'apposition',
    matcher: (s) => _tryMatch(
      s,
      /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+),\s+(o|a|um|uma)\s+([\wáéíóúâêôãõç ]+?),\s+(.+?)\.?$/i,
      (m, span) => _mk('apposition', {
        subject: m[1].trim(),
        article: m[2].trim(),
        apposition: m[3].trim(),
        rest: m[4].trim(),
      }, span, {
        operation: 'expose',
        form: 'exposition',
        relation: 'apposition',
      }, 0.90)
    ),
  },

  // ── 4. Consecutiva ─────────────────────────────────────────
  //
  // "Ele correu tão rápido que tropeçou."
  // "Gritou de modo que todos ouviram."
  {
    id: 'consecutive-clause',
    matcher: (s) => _tryMatch(
      s,
      /^(.+?),\s+(tão|de modo que|de forma que|tanto que)\s+(.+?)\.?$/i,
      (m, span) => _mk('consecutive-clause', {
        cause: m[1].trim(),
        connector: m[2].trim(),
        effect: m[3].trim(),
      }, span, {
        operation: 'structure',
        relation: 'consequence',
      }, 0.88)
    ),
  },

  // ── 5. Comparativa ─────────────────────────────────────────
  //
  // "Ela era tão alta quanto o irmão."
  // "O dragão era mais feroz do que qualquer lobo."
  {
    id: 'comparison',
    matcher: (s) => _tryMatch(
      s,
      /^(.+?)\s+(tão|mais|menos)\s+(.+?)\s+(quanto|do que|que)\s+(.+?)\.?$/i,
      (m, span) => _mk('comparison', {
        subject: m[1].trim(),
        degree: m[2].trim(),
        quality: m[3].trim(),
        connector: m[4].trim(),
        object: m[5].trim(),
      }, span, {
        operation: 'evaluate',
        form: 'commentary',
        relation: 'comparison',
      }, 0.85)
    ),
  },

  // ── 6. Gerúndio causal ─────────────────────────────────────
  //
  // "Ele desmaiou, sentindo a dor subir."
  // "João parou, ouvindo passos atrás de si."
  {
    id: 'causal-gerund',
    matcher: (s) => _tryMatch(
      s,
      /^(.+?),\s+(\w+ndo)\s+(.+?)\.?$/i,
      (m, span) => _mk('causal-gerund', {
        effect: m[1].trim(),
        gerund: m[2].trim(),
        cause: m[3].trim(),
      }, span, {
        operation: 'structure',
        relation: 'cause',
      }, 0.82)
    ),
  },

  // ── 7. Concessiva ──────────────────────────────────────────
  //
  // "Embora estivesse cansado, ele continuou."
  // "Ainda que chovesse, saíram."
  {
    id: 'concession',
    matcher: (s) => _tryMatch(
      s,
      /^(embora|ainda que|mesmo que|apesar de que|posto que)\s+(.+?),\s*(.+?)\.?$/i,
      (m, span) => _mk('concession', {
        marker: m[1].trim(),
        concession: m[2].trim(),
        main: m[3].trim(),
      }, span, {
        operation: 'structure',
        relation: 'concession',
      }, 0.90)
    ),
  },

  // ── 8. Final ───────────────────────────────────────────────
  //
  // "Ele treinou muito para que pudesse vencer."
  // "Fecharam a porta a fim de que ninguém ouvisse."
  {
    id: 'purpose-clause',
    matcher: (s) => _tryMatch(
      s,
      /^(.+?)\s+(para que|a fim de que|com o objetivo de que)\s+(.+?)\.?$/i,
      (m, span) => _mk('purpose-clause', {
        action: m[1].trim(),
        marker: m[2].trim(),
        purpose: m[3].trim(),
      }, span, {
        operation: 'structure',
        relation: 'purpose',
      }, 0.89)
    ),
  },

  // ── 9. Discurso indireto de 2 níveis ───────────────────────
  //
  // "João disse que Maria achava que estava chovendo."
  // "O mestre falou que o aluno pensava que era fácil."
  {
    id: 'nested-indirect-speech',
    matcher: (s) => _tryMatch(
      s,
      /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(disse|falou|contou)\s+que\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(achava|pensava|acreditava|disse)\s+que\s+(.+?)\.?$/i,
      (m, span) => _mk('nested-indirect-speech', {
        speaker1: m[1].trim(),
        verb1: m[2].trim(),
        speaker2: m[3].trim(),
        verb2: m[4].trim(),
        content: m[5].trim(),
      }, span, {
        operation: 'enunciate',
        form: 'indirect-speech',
        relation: 'nested-report',
      }, 0.87)
    ),
  },

  // ── 10. Expectativa explícita ──────────────────────────────
  //
  // "João esperava que Maria voltasse."
  // "Ela aguardava que a resposta chegasse."
  {
    id: 'explicit-expectation',
    matcher: (s) => _tryMatch(
      s,
      /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç]+)\s+(esperava|aguardava|previa|anteveria)\s+que\s+(.+?)\.?$/i,
      (m, span) => _mk('explicit-expectation', {
        holder: m[1].trim(),
        verb: m[2].trim(),
        proposition: m[3].trim(),
      }, span, {
        operation: 'interiorize',
        form: 'thought',
        epistemic: 'belief',
      }, 0.90)
    ),
  },

  // ── 11. Clivada enfática (pseudo-cleft) ────────────────────
  //
  // "O que importava era a verdade."
  // "Quem gritou foi Maria."
  {
    id: 'pseudo-cleft',
    matcher: (s) => _tryMatch(
      s,
      /^(o que|quem|onde|quando)\s+(.+?)\s+(foi|é|era|será)\s+(.+?)\.?$/i,
      (m, span) => _mk('pseudo-cleft', {
        cleft: m[1].trim(),
        subordinate: m[2].trim(),
        copula: m[3].trim(),
        focus: m[4].trim(),
      }, span, {
        operation: 'evaluate',
        form: 'commentary',
        relation: 'emphasis',
      }, 0.84)
    ),
  },

  // ── 12. Discurso indireto livre com dúvida ─────────────────
  //
  // "Talvez fosse melhor esperar."
  // "Quiçá houvesse outra saída."
  //
  // Nota: sobrepõe `maybe-error` quando o conteúdo tem verbo no
  // subjuntivo/imperfeito, indicando discurso indireto livre claro.
  {
    id: 'free-indirect-doubt',
    matcher: (s) => _tryMatch(
      s,
      /^(talvez|quiçá|porventura)\s+(.+?)\.?$/i,
      (m, span) => _mk('free-indirect-doubt', {
        marker: m[1].trim(),
        proposition: m[2].trim(),
      }, span, {
        operation: 'interiorize',
        form: 'free-indirect-discourse',
        epistemic: 'doubt',
      }, 0.87)
    ),
  },

]);

// ══════════════════════════════════════════════════════════════
// MATCHING
// ══════════════════════════════════════════════════════════════

/**
 * Tenta casar todas as construções contra uma sentença. Devolve a
 * primeira que casar (a ordem do catálogo define prioridade).
 *
 * @param {string} sentence
 * @returns {Object|null}
 */
export function matchConstruction(sentence) {
  if (_isEmpty(sentence)) return null;
  const s = String(sentence).trim();

  for (const c of CONSTRUCTIONS) {
    try {
      const m = c.matcher(s);
      if (m) return m;
    } catch {
      // Isola erro de regex individual
    }
  }
  return null;
}

/**
 * Devolve todos os matches possíveis (útil para debug).
 * A ordem reflete prioridade.
 *
 * @param {string} sentence
 * @returns {Array<Object>}
 */
export function matchAllConstructions(sentence) {
  if (_isEmpty(sentence)) return [];
  const s = String(sentence).trim();
  const out = [];

  for (const c of CONSTRUCTIONS) {
    try {
      const m = c.matcher(s);
      if (m) out.push(m);
    } catch {
      // isola
    }
  }
  return out;
}

/**
 * Lista os IDs de todas as construções registradas.
 * @returns {string[]}
 */
export function listConstructionIds() {
  return CONSTRUCTIONS.map((c) => c.id);
}

/**
 * Busca uma construção pelo ID (para testes).
 * @param {string} id
 * @returns {Object|null}
 */
export function getConstruction(id) {
  return CONSTRUCTIONS.find((c) => c.id === id) ?? null;
}

/**
 * Número de construções registradas.
 * @returns {number}
 */
export function size() {
  return CONSTRUCTIONS.length;
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const Constructions = Object.freeze({
  CONSTRUCTIONS,
  matchConstruction,
  matchAllConstructions,
  listConstructionIds,
  getConstruction,
  size,
});