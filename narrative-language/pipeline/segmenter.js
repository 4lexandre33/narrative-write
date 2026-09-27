/**
 * @file segmenter.js
 * @module narrative-language/pipeline
 * @description Segmentação de texto em sentenças e spans com offsets
 *              absolutos preservados. Respeita abreviações, números
 *              decimais, travessões de diálogo e reticências.
 * @imports — (nenhum)
 * @importedBy narrative-language/pipeline/interpreter,
 *             narrative-language/index
 * @level N1
 *
 * Contrato:
 *   segment(text) → { sentences: Sentence[], spans: Span[], text: string }
 *
 * Determinismo: IDs são posicionais (`s1`, `s2`, ...), estáveis sob
 * re-segmentação do mesmo texto. Reanálise da mesma string produz
 * exatamente os mesmos IDs.
 *
 * Escopo (Fase 1):
 *   - Detecção de fim de sentença (. ! ? … ?! !?)
 *   - Respeito a abreviações (Dr. Sr. Sra. etc.)
 *   - Respeito a números decimais (3.14)
 *   - Detecção de discurso direto com travessão (—)
 *   - Segmentação de spans internos (coordenação, subordinação)
 *
 * Fora de escopo (fases posteriores):
 *   - Análise semântica de spans
 *   - Detecção de encaixes complexos
 *   - Estrutura de parágrafos (retorna flat)
 */

// ══════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════

/**
 * Abreviações que NÃO terminam sentença.
 * @type {ReadonlyArray<string>}
 */
const ABBREVIATIONS = Object.freeze([
  'dr', 'dra', 'sr', 'sra', 'srta',
  'prof', 'profa', 'eng', 'engª',
  'etc', 'ex', 'obs', 'p.ex', 'pag',
  'av', 'r', 'tv', 'ed',
  'a.c', 'd.c', 'aC', 'dC',
]);

/**
 * Marcadores de coordenação que separam spans dentro de uma sentença.
 * @type {ReadonlyArray<string>}
 */
const COORD_MARKERS = Object.freeze([
  ' e ', ' mas ', ' ou ', ' porém ', ' contudo ', ' entretanto ',
  ' todavia ', ' nem ', ' portanto ',
]);

/**
 * Marcadores de subordinação que iniciam spans dependentes.
 * @type {ReadonlyArray<string>}
 */
const SUBORD_MARKERS = Object.freeze([
  'quando ', 'se ', 'enquanto ', 'porque ', 'embora ',
  'caso ', 'conforme ', 'segundo ', 'depois que ',
  'antes que ', 'sempre que ', 'assim que ',
]);

// ══════════════════════════════════════════════════════════════
// DETECÇÃO DE FIM DE SENTENÇA
// ══════════════════════════════════════════════════════════════

/**
 * Verifica se um `.` na posição `i` é decimal (parte de número).
 * @param {string} text
 * @param {number} i
 * @returns {boolean}
 * @private
 */
function _isDecimalPoint(text, i) {
  if (i <= 0 || i >= text.length - 1) return false;
  const prev = text[i - 1];
  const next = text[i + 1];
  return /\d/.test(prev) && /\d/.test(next);
}

/**
 * Verifica se um `.` na posição `i` fecha uma abreviação conhecida.
 * @param {string} text
 * @param {number} i
 * @returns {boolean}
 * @private
 */
function _isAbbreviation(text, i) {
  // Pega a palavra antes do ponto (até 10 chars para trás)
  let j = i - 1;
  while (j >= 0 && /[A-Za-zÀ-ÿ.]/.test(text[j]) && i - j < 12) j--;
  const word = text.slice(j + 1, i).toLowerCase().replace(/\./g, '');
  return ABBREVIATIONS.includes(word);
}

/**
 * Verifica se um `.` na posição `i` é fim real de sentença.
 * @param {string} text
 * @param {number} i
 * @returns {boolean}
 * @private
 */
function _isSentenceEnd(text, i) {
  const ch = text[i];

  if (ch === '!' || ch === '?') return true;
  if (ch === '…') return true;

  if (ch === '.') {
    if (_isDecimalPoint(text, i)) return false;
    if (_isAbbreviation(text, i)) return false;
    return true;
  }

  return false;
}

// ══════════════════════════════════════════════════════════════
// SEGMENTAÇÃO DE SENTENÇAS
// ══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} SourceSpan
 * @property {number} start
 * @property {number} end
 * @property {number} line
 * @property {number} column
 * @property {string} raw
 */

/**
 * @typedef {Object} Sentence
 * @property {string} id
 * @property {string} raw
 * @property {SourceSpan} source
 * @property {Span[]} spans
 * @property {number} paragraphIndex
 */

/**
 * @typedef {Object} Span
 * @property {string} id
 * @property {string} raw
 * @property {SourceSpan} source
 * @property {string|null} parentId
 * @property {string|null} relation
 */

/**
 * Encontra o índice do primeiro caractere não-whitespace a partir de i.
 * @param {string} text
 * @param {number} i
 * @returns {number}
 * @private
 */
function _skipWhitespace(text, i) {
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
}

/**
 * Converte um offset absoluto para {line, column} (1-based line, 0-based column).
 * @param {string} text
 * @param {number} offset
 * @returns {{ line:number, column:number }}
 * @private
 */
function _offsetToLineCol(text, offset) {
  let line = 1;
  let lastNL = -1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      lastNL = i;
    }
  }
  return { line, column: offset - lastNL - 1 };
}

/**
 * Segmenta o texto em sentenças, preservando offsets absolutos.
 * @param {string} text
 * @returns {Sentence[]}
 * @private
 */
function _segmentSentences(text) {
  const sentences = [];
  const n = text.length;
  let i = 0;
  let paragraphIndex = 0;
  let sentenceIndex = 0;

  while (i < n) {
    // Pula whitespace inicial
    const start = _skipWhitespace(text, i);

    // Detecta mudança de parágrafo (linha em branco)
    if (start > i) {
      const skipped = text.slice(i, start);
      if ((skipped.match(/\n/g) || []).length >= 2) {
        paragraphIndex++;
      }
    }

    if (start >= n) break;

    // Encontra fim da sentença
    let end = start;
    while (end < n) {
      if (_isSentenceEnd(text, end)) {
        end++;
        // Captura caracteres extras: ?! !? !!! ???
        while (end < n && /[!?…]/.test(text[end])) end++;
        break;
      }
      // Nova linha dupla também termina (mesmo sem pontuação)
      if (text[end] === '\n' && end + 1 < n && text[end + 1] === '\n') {
        break;
      }
      end++;
    }

    if (end <= start) end = start + 1;

    const raw = text.slice(start, end);
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      i = end;
      continue;
    }

    const realStart = start + raw.indexOf(trimmed[0]);
    const realEnd = realStart + trimmed.length;

    const { line, column } = _offsetToLineCol(text, realStart);

    sentenceIndex++;
    sentences.push({
      id: `s${sentenceIndex}`,
      raw: trimmed,
      source: {
        start: realStart,
        end: realEnd,
        line,
        column,
        raw: trimmed,
      },
      spans: [],       // preenchido abaixo
      paragraphIndex,
    });

    i = end;
  }

  return sentences;
}

// ══════════════════════════════════════════════════════════════
// SEGMENTAÇÃO DE SPANS
// ══════════════════════════════════════════════════════════════

/**
 * Verifica se a sentença é discurso direto (começa com travessão).
 * @param {string} s
 * @returns {boolean}
 * @private
 */
function _isDirectSpeech(s) {
  return s.startsWith('—') || s.startsWith('–') || s.startsWith('--');
}

/**
 * Segmenta uma sentença em spans internos.
 *
 * Estratégia:
 *   1. Discurso direto (travessão) → 1 span (o conteúdo)
 *   2. Subordinação (se/quando/... ) → 2 spans: principal + dependente
 *   3. Coordenação (e/mas/ou...) → N spans
 *   4. Caso contrário → 1 span
 *
 * @param {Sentence} sentence
 * @param {string} fullText
 * @returns {Span[]}
 * @private
 */
function _segmentSpans(sentence, fullText) {
  const s = sentence.raw;
  const sBase = sentence.source.start;
  const spans = [];

  // Caso 1: discurso direto — span único
  if (_isDirectSpeech(s)) {
    spans.push(_mkSpan(sentence.id, 1, s, sBase, fullText, null, null));
    return spans;
  }

  // Caso 2: subordinação inicial (quando/se/enquanto/...)
  for (const marker of SUBORD_MARKERS) {
    const lower = s.toLowerCase();
    if (lower.startsWith(marker)) {
      const commaIdx = s.indexOf(',');
      if (commaIdx > 0) {
        const head = s.slice(0, commaIdx).trim();
        const tail = s.slice(commaIdx + 1).trim();
        if (head.length > 0 && tail.length > 0) {
          const headOffset = s.indexOf(head);
          const tailOffset = s.lastIndexOf(tail);
          spans.push(_mkSpan(
            sentence.id, 1, head, sBase + headOffset, fullText, null, null
          ));
          spans.push(_mkSpan(
            sentence.id, 2, tail, sBase + tailOffset, fullText,
            `${sentence.id}.1`, 'subordinate'
          ));
          return spans;
        }
      }
      // Sem vírgula: tenta split por verbo
      break;
    }
  }

  // Caso 3: coordenação (e/mas/ou/...)
  for (const marker of COORD_MARKERS) {
    if (s.includes(marker)) {
      const parts = s.split(marker);
      if (parts.length === 2) {
        const a = parts[0].trim();
        const b = parts[1].trim();
        if (a.length > 0 && b.length > 0) {
          const relation = marker.trim() === 'mas' || marker.trim() === 'porém' ||
                           marker.trim() === 'contudo' || marker.trim() === 'entretanto' ||
                           marker.trim() === 'todavia'
            ? 'contrast'
            : 'sequence';

          const aOffset = s.indexOf(a);
          const bOffset = s.lastIndexOf(b);

          spans.push(_mkSpan(
            sentence.id, 1, a, sBase + aOffset, fullText, null, null
          ));
          spans.push(_mkSpan(
            sentence.id, 2, b, sBase + bOffset, fullText, null, relation
          ));
          return spans;
        }
      }
    }
  }

  // Caso 4: default — 1 span
  spans.push(_mkSpan(sentence.id, 1, s, sBase, fullText, null, null));
  return spans;
}

/**
 * Cria um objeto Span.
 * @private
 */
function _mkSpan(sentenceId, index, raw, absoluteStart, fullText, parentId, relation) {
  const start = absoluteStart;
  const end = absoluteStart + raw.length;
  const { line, column } = _offsetToLineCol(fullText, start);
  return {
    id: `${sentenceId}.${index}`,
    raw,
    source: { start, end, line, column, raw },
    parentId,
    relation,
  };
}

// ══════════════════════════════════════════════════════════════
// API PÚBLICA
// ══════════════════════════════════════════════════════════════

/**
 * Segmenta um texto completo em sentenças e spans.
 *
 * @param {string} text
 * @returns {{ sentences: Sentence[], spans: Span[], text: string }}
 */
export function segment(text) {
  const original = String(text ?? '');

  if (original.length === 0) {
    return { sentences: [], spans: [], text: original };
  }

  let sentences;
  try {
    sentences = _segmentSentences(original);
  } catch {
    // Fallback: uma sentença única com o texto todo
    sentences = original.trim() ? [{
      id: 's1',
      raw: original.trim(),
      source: {
        start: original.indexOf(original.trim()),
        end: original.indexOf(original.trim()) + original.trim().length,
        line: 1,
        column: 0,
        raw: original.trim(),
      },
      spans: [],
      paragraphIndex: 0,
    }] : [];
  }

  // Preenche spans de cada sentença
  const allSpans = [];
  for (const sentence of sentences) {
    try {
      sentence.spans = _segmentSpans(sentence, original);
    } catch {
      sentence.spans = [{
        id: `${sentence.id}.1`,
        raw: sentence.raw,
        source: sentence.source,
        parentId: null,
        relation: null,
      }];
    }
    allSpans.push(...sentence.spans);
  }

  return {
    sentences,
    spans: allSpans,
    text: original,
  };
}

/**
 * Segmenta uma única sentença em spans. Utilitário para testes e
 * para reprocessamento parcial (F9+).
 *
 * @param {Sentence} sentence
 * @param {string} [fullText]
 * @returns {Span[]}
 */
export function segmentSentence(sentence, fullText = null) {
  if (!sentence || typeof sentence.raw !== 'string') return [];
  try {
    return _segmentSpans(sentence, fullText ?? sentence.raw);
  } catch {
    return [{
      id: `${sentence.id}.1`,
      raw: sentence.raw,
      source: sentence.source,
      parentId: null,
      relation: null,
    }];
  }
}

/**
 * Devolve estatísticas de segmentação (útil para diagnóstico).
 * @param {{ sentences: Sentence[], spans: Span[] }} result
 * @returns {{ sentenceCount:number, spanCount:number, avgSpansPerSentence:number, paragraphs:number }}
 */
export function segmentStats(result) {
  const sCount = result?.sentences?.length ?? 0;
  const spCount = result?.spans?.length ?? 0;
  const paragraphs = sCount > 0
    ? Math.max(...result.sentences.map((s) => s.paragraphIndex ?? 0)) + 1
    : 0;
  return {
    sentenceCount: sCount,
    spanCount: spCount,
    avgSpansPerSentence: sCount > 0 ? Math.round((spCount / sCount) * 100) / 100 : 0,
    paragraphs,
  };
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const Segmenter = Object.freeze({
  segment,
  segmentSentence,
  segmentStats,
  ABBREVIATIONS,
  COORD_MARKERS,
  SUBORD_MARKERS,
});