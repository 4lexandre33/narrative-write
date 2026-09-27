/**
 * @file adapter.js
 * @module narrative-language/pt-br
 * @description Interface plugável com backend NLP para PT-BR. Suporta
 *              spaCy via HTTP (recomendado), wink-nlp e NLP.js (via
 *              import dinâmico) e fallback heurístico puro. Nunca lança.
 *              Sempre devolve análise estruturalmente válida.
 * @imports — (nenhum)
 * @importedBy narrative-language/pt-br/constructions,
 *             narrative-language/pipeline/analyzer,
 *             narrative-language/index,
 *             boot.js
 * @level N1
 *
 * ═══════════════════════════════════════════════════════════════
 * CONTRATO PÚBLICO
 * ═══════════════════════════════════════════════════════════════
 *
 *   Adapter.init({ backend })    → Promise<boolean>
 *   Adapter.analyze(sentence)    → Promise<NLPAnalysis>
 *   Adapter.isAvailable()        → boolean
 *   Adapter.version()            → string
 *   Adapter.backend()            → string
 *   Adapter.clearCache()         → void
 *   Adapter.destroy()            → void
 *   Adapter.probe()              → Promise<{ ok, backend, version, latencyMs }>
 *   Adapter.setBackendUrl(url)   → boolean
 *   Adapter.getBackendUrl()      → string
 *   Adapter.stats()              → Object
 *   Adapter.resetStats()         → void
 *
 * ═══════════════════════════════════════════════════════════════
 * BACKENDS
 * ═══════════════════════════════════════════════════════════════
 *
 *   'spacy'      → backend HTTP (padrão). Requer servidor Python
 *                  rodando `tools/spacy-server/`. Fallback silencioso
 *                  para heurística quando indisponível.
 *
 *   'wink-nlp'   → biblioteca client-side. Detecção via import()
 *                  dinâmico. Hoje delega para heurística (wrapper
 *                  definitivo pendente de instalação do pacote).
 *
 *   'nlp.js'     → alternativa client-side. Mesmo comportamento.
 *
 *   'heuristic'  → puro JS, sempre disponível, qualidade L0–L3.
 *                  Fallback universal — nunca falha.
 *
 * ═══════════════════════════════════════════════════════════════
 * NLPAnalysis (formato canônico de retorno)
 * ═══════════════════════════════════════════════════════════════
 *
 *   {
 *     tokens: Token[],
 *     tree: Object|null,
 *     sentence: string,
 *     backend: string,       // 'spacy' | 'heuristic' | ...
 *     version: string,       // ex: 'spacy-pt-lg'
 *   }
 *
 *   Token:
 *     {
 *       text: string,
 *       lemma: string,
 *       pos: string,         // uma das POS_TAGS
 *       dep: string,         // dependência sintática (vazio na heurística)
 *       head: number,        // índice do head (-1 na heurística)
 *       features: Object,    // { tense, aspect, mood, person, number, gender }
 *       source: { start, end }  // offsets relativos à sentença
 *     }
 *
 * ═══════════════════════════════════════════════════════════════
 * DETERMINISMO
 * ═══════════════════════════════════════════════════════════════
 *
 *   - Não usa Math.random na semântica
 *   - Não usa wall-clock (o timestamp só aparece em telemetria)
 *   - Cache FIFO com limite fixo
 *   - Duas chamadas com a mesma sentença devolvem o mesmo objeto
 *     (deep-equal), independentemente do backend ativo
 *
 * ═══════════════════════════════════════════════════════════════
 * CONFIGURAÇÃO
 * ═══════════════════════════════════════════════════════════════
 *
 *   URL do servidor spaCy é lida de localStorage:
 *     localStorage.setItem('narr:config:nlp:url', 'http://...')
 *
 *   Ou via API:
 *     Adapter.setBackendUrl('http://192.168.1.5:8000')
 *
 *   Trocar backend em runtime limpa o cache automaticamente.
 */

// ══════════════════════════════════════════════════════════════
// CONSTANTES PÚBLICAS
// ══════════════════════════════════════════════════════════════

/**
 * Backends reconhecidos.
 * @type {ReadonlyArray<string>}
 */
export const BACKENDS = Object.freeze(['spacy', 'wink-nlp', 'nlp.js', 'heuristic']);

/**
 * Backend default. Cai para heurística se indisponível.
 * @type {string}
 */
export const DEFAULT_BACKEND = 'spacy';

/**
 * POS tags canônicas (Universal Dependencies simplificado).
 * @type {ReadonlyArray<string>}
 */
export const POS_TAGS = Object.freeze([
  'VERB', 'NOUN', 'ADJ', 'ADV', 'PRON', 'DET',
  'ADP', 'CCONJ', 'SCONJ', 'NUM', 'PROPN', 'PUNCT', 'INTJ',
]);

// ══════════════════════════════════════════════════════════════
// CONSTANTES PRIVADAS
// ══════════════════════════════════════════════════════════════

/** @type {string} @private */
const _NLP_URL_KEY = 'narr:config:nlp:url';

/** @type {string} @private */
const _NLP_URL_DEFAULT = 'http://127.0.0.1:8000';

/** @type {number} @private */
const _NLP_TIMEOUT_MS = 5000;

/** @type {number} @private */
const _NLP_PROBE_TIMEOUT_MS = 1500;

/** @type {number} @private */
const _CACHE_MAX = 500;

// ══════════════════════════════════════════════════════════════
// HEURÍSTICA — DICIONÁRIOS
// ══════════════════════════════════════════════════════════════

/** @private */
const _PRONOUNS = new Set([
  'eu', 'tu', 'ele', 'ela', 'nós', 'vós', 'eles', 'elas',
  'você', 'vocês', 'o', 'a', 'os', 'as', 'lhe', 'lhes',
  'me', 'te', 'se', 'nos', 'vos', 'mim', 'ti', 'si',
  'isto', 'isso', 'aquilo', 'este', 'esta', 'estes', 'estas',
  'esse', 'essa', 'esses', 'essas', 'aquele', 'aquela',
  'aqueles', 'aquelas', 'quem', 'qual', 'quais',
]);

/** @private */
const _DETERMINERS = new Set([
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
  'meu', 'minha', 'meus', 'minhas',
  'seu', 'sua', 'seus', 'suas',
  'nosso', 'nossa', 'nossos', 'nossas',
  'este', 'esta', 'estes', 'estas',
  'esse', 'essa', 'esses', 'essas',
  'aquele', 'aquela', 'aqueles', 'aquelas',
  'algum', 'alguma', 'alguns', 'algumas',
  'nenhum', 'nenhuma', 'nenhuns', 'nenhumas',
  'todo', 'toda', 'todos', 'todas',
  'outro', 'outra', 'outros', 'outras',
]);

/** @private */
const _PREPOSITIONS = new Set([
  'a', 'ante', 'após', 'até', 'com', 'contra', 'de', 'desde',
  'em', 'entre', 'para', 'per', 'por', 'sem', 'sob', 'sobre',
  'trás', 'durante', 'mediante', 'conforme', 'segundo',
]);

/** @private */
const _CONJUNCTIONS_COORD = new Set([
  'e', 'ou', 'mas', 'porém', 'contudo', 'todavia', 'entretanto',
  'nem', 'tampouco', 'logo', 'portanto', 'pois',
]);

/** @private */
const _CONJUNCTIONS_SUBORD = new Set([
  'que', 'se', 'quando', 'enquanto', 'porque', 'como', 'embora',
  'caso', 'conquanto', 'conforme', 'segundo', 'posto', 'visto',
  'ainda', 'logo', 'assim', 'depois', 'antes',
]);

/** @private */
const _NEGATIONS = new Set([
  'não', 'nunca', 'jamais', 'nem', 'tampouco', 'sequer',
]);

/** @private */
const _MODAL_ADVERBS = new Set([
  'talvez', 'provavelmente', 'possivelmente', 'certamente',
  'decerto', 'porventura', 'acaso',
]);

/** @private */
const _VERB_SUFFIX_PERFECT = ['ou', 'eu', 'iu'];
/** @private */
const _VERB_SUFFIX_IMPERFECT = ['ava', 'ávamos', 'avam', 'ia', 'íamos', 'iam'];
/** @private */
const _VERB_SUFFIX_GERUND = ['ando', 'endo', 'indo'];
/** @private */
const _VERB_SUFFIX_INF = ['ar', 'er', 'ir', 'or'];
/** @private */
const _VERB_SUFFIX_SUBJ = ['sse', 'ssem', 'sseis'];
/** @private */
const _VERB_SUFFIX_FUTURE = ['rei', 'rás', 'rá', 'remos', 'reis', 'rão'];
/** @private */
const _VERB_SUFFIX_COND = ['ria', 'rias', 'ríamos', 'ríeis', 'riam'];
/** @private */
const _VERB_SUFFIX_PARTICIPLE = ['ado', 'ada', 'ados', 'adas', 'ido', 'ida', 'idos', 'idas'];

// ══════════════════════════════════════════════════════════════
// HEURÍSTICA — TOKENIZAÇÃO
// ══════════════════════════════════════════════════════════════

/**
 * @param {string} ch
 * @returns {boolean}
 * @private
 */
function _isPunct(ch) {
  return ch === '.' || ch === ',' || ch === ';' || ch === ':' ||
         ch === '!' || ch === '?' || ch === '…' ||
         ch === '(' || ch === ')' || ch === '[' || ch === ']' ||
         ch === '{' || ch === '}' ||
         ch === '"' || ch === "'" || ch === '`' ||
         ch === '—' || ch === '–' || ch === '-' ||
         ch === '«' || ch === '»';
}

/**
 * @param {string} ch
 * @returns {boolean}
 * @private
 */
function _isSpace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

/**
 * Tokeniza uma sentença preservando offsets absolutos.
 * @param {string} sentence
 * @param {number} [baseOffset=0]
 * @returns {Array<{ text:string, start:number, end:number }>}
 * @private
 */
function _tokenize(sentence, baseOffset = 0) {
  const tokens = [];
  const n = sentence.length;
  let i = 0;

  while (i < n) {
    while (i < n && _isSpace(sentence[i])) i++;
    if (i >= n) break;

    const start = i;

    // Pontuação: cada caractere é um token próprio
    if (_isPunct(sentence[i])) {
      const ch = sentence[i];
      let j = i + 1;
      while (j < n && sentence[j] === ch && (ch === '!' || ch === '?' || ch === '.')) j++;
      if (j < n && (sentence[j] === '!' || sentence[j] === '?') && sentence[j] !== ch) {
        j++;
      }
      tokens.push({
        text: sentence.slice(i, j),
        start: baseOffset + i,
        end: baseOffset + j,
      });
      i = j;
      continue;
    }

    // Palavra
    let j = i;
    while (j < n && !_isSpace(sentence[j]) && !_isPunct(sentence[j])) j++;

    if (j === i) j = i + 1;

    tokens.push({
      text: sentence.slice(i, j),
      start: baseOffset + i,
      end: baseOffset + j,
    });
    i = j;
  }

  return tokens;
}

// ══════════════════════════════════════════════════════════════
// HEURÍSTICA — MORFOLOGIA
// ══════════════════════════════════════════════════════════════

/**
 * @param {string} word
 * @param {string[]} suffixes
 * @returns {boolean}
 * @private
 */
function _endsWith(word, suffixes) {
  for (const s of suffixes) {
    if (word.length > s.length && word.endsWith(s)) return true;
  }
  return false;
}

/**
 * Classifica um token quanto à POS. Puramente heurístico.
 * @param {string} text
 * @param {boolean} isFirstWord
 * @returns {string}
 * @private
 */
function _classifyPOS(text, isFirstWord) {
  const lower = text.toLowerCase();

  if (_isPunct(text)) return 'PUNCT';
  if (/^\d+([.,]\d+)?$/.test(text)) return 'NUM';

  if (_PRONOUNS.has(lower)) return 'PRON';
  if (_DETERMINERS.has(lower)) return 'DET';
  if (_PREPOSITIONS.has(lower)) return 'ADP';
  if (_CONJUNCTIONS_COORD.has(lower)) return 'CCONJ';
  if (_CONJUNCTIONS_SUBORD.has(lower)) return 'SCONJ';

  if (_endsWith(lower, _VERB_SUFFIX_PERFECT))  return 'VERB';
  if (_endsWith(lower, _VERB_SUFFIX_GERUND))   return 'VERB';
  if (_endsWith(lower, _VERB_SUFFIX_SUBJ))     return 'VERB';
  if (_endsWith(lower, _VERB_SUFFIX_FUTURE))   return 'VERB';
  if (_endsWith(lower, _VERB_SUFFIX_COND))     return 'VERB';
  if (_endsWith(lower, _VERB_SUFFIX_IMPERFECT) && lower.length > 4) return 'VERB';
  if (_endsWith(lower, _VERB_SUFFIX_INF) && lower.length > 3) return 'VERB';
  if (_endsWith(lower, _VERB_SUFFIX_PARTICIPLE) && lower.length > 5) return 'ADJ';

  if (lower.endsWith('mente') && lower.length > 7) return 'ADV';

  if (_endsWith(lower, ['oso', 'osa', 'osos', 'osas', 'ivo', 'iva', 'ável', 'ível'])) {
    return 'ADJ';
  }

  if (!isFirstWord && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(text)) return 'PROPN';

  if (lower.length > 0) return 'NOUN';

  return 'PUNCT';
}

/**
 * Extrai features morfológicas de um token.
 * @param {string} text
 * @param {string} pos
 * @returns {Object}
 * @private
 */
function _extractFeatures(text, pos) {
  const lower = text.toLowerCase();
  const feat = {};

  if (pos === 'VERB') {
    if (_endsWith(lower, _VERB_SUFFIX_PERFECT))        feat.tense = 'past';
    else if (_endsWith(lower, _VERB_SUFFIX_IMPERFECT)) feat.tense = 'past';
    else if (_endsWith(lower, _VERB_SUFFIX_GERUND))    feat.aspect = 'ongoing';
    else if (_endsWith(lower, _VERB_SUFFIX_INF))       feat.mood = 'infinitive';
    else if (_endsWith(lower, _VERB_SUFFIX_SUBJ))      feat.mood = 'subjunctive';
    else if (_endsWith(lower, _VERB_SUFFIX_FUTURE))    feat.tense = 'future';
    else if (_endsWith(lower, _VERB_SUFFIX_COND))      feat.mood = 'conditional';

    if (_endsWith(lower, ['ou', 'eu', 'iu', 'a', 'e', 'ava', 'ia'])) {
      feat.person = 3;
      feat.number = 'singular';
    } else if (_endsWith(lower, ['am', 'em', 'ram', 'avam', 'iam'])) {
      feat.person = 3;
      feat.number = 'plural';
    } else if (_endsWith(lower, ['o'])) {
      feat.person = 1;
      feat.number = 'singular';
    } else if (_endsWith(lower, ['mos'])) {
      feat.person = 1;
      feat.number = 'plural';
    }
  }

  if (pos === 'NOUN' || pos === 'ADJ' || pos === 'PROPN') {
    if (lower.endsWith('s') && lower.length > 3) {
      feat.number = 'plural';
    } else {
      feat.number = 'singular';
    }
    if (lower.endsWith('a') || lower.endsWith('as')) {
      feat.gender = 'feminine';
    } else if (lower.endsWith('o') || lower.endsWith('os')) {
      feat.gender = 'masculine';
    }
  }

  return feat;
}

/**
 * Lematiza um token. Heurístico, baseado em regras de sufixo.
 * @param {string} text
 * @param {string} pos
 * @returns {string}
 * @private
 */
function _lemmatize(text, pos) {
  const lower = text.toLowerCase();

  if (pos === 'VERB') {
    if (_endsWith(lower, ['ar', 'er', 'ir', 'or'])) return lower;
    if (lower.endsWith('ando')) return lower.slice(0, -4) + 'ar';
    if (lower.endsWith('endo')) return lower.slice(0, -4) + 'er';
    if (lower.endsWith('indo')) return lower.slice(0, -4) + 'ir';
    if (lower.endsWith('ou')) return lower.slice(0, -2) + 'ar';
    if (lower.endsWith('eu')) return lower.slice(0, -2) + 'er';
    if (lower.endsWith('iu')) return lower.slice(0, -2) + 'ir';
    if (lower.endsWith('ava')) return lower.slice(0, -3) + 'ar';
    if (lower.endsWith('ia'))  return lower.slice(0, -2) + 'er';
    if (lower.endsWith('sse')) return lower.slice(0, -3) + 'r';
    if (lower.endsWith('rei') || lower.endsWith('rá') || lower.endsWith('rás')) {
      return lower.replace(/r(ei|á|ás|emos|eis|ão)$/, 'r');
    }
    return lower;
  }

  if ((pos === 'NOUN' || pos === 'ADJ') && lower.endsWith('s') && lower.length > 3) {
    return lower.slice(0, -1);
  }

  if (pos === 'ADJ' && lower.endsWith('a') && lower.length > 3) {
    return lower.slice(0, -1) + 'o';
  }

  return lower;
}

// ══════════════════════════════════════════════════════════════
// HEURÍSTICA — ANÁLISE COMPLETA
// ══════════════════════════════════════════════════════════════

/**
 * Analisa uma sentença usando o backend heurístico.
 * @param {string} sentence
 * @returns {Object} NLPAnalysis
 * @private
 */
function _analyzeHeuristic(sentence) {
  const rawTokens = _tokenize(sentence, 0);
  const tokens = rawTokens.map((t, idx) => {
    const pos = _classifyPOS(t.text, idx === 0);
    const lemma = _lemmatize(t.text, pos);
    const features = _extractFeatures(t.text, pos);

    return {
      text: t.text,
      lemma,
      pos,
      dep: '',
      head: -1,
      features,
      source: { start: t.start, end: t.end },
    };
  });

  return {
    tokens,
    tree: null,
    sentence,
    backend: 'heuristic',
    version: 'heuristic-1.0.0',
  };
}

// ══════════════════════════════════════════════════════════════
// CONFIG — URL DO SERVIDOR
// ══════════════════════════════════════════════════════════════

/**
 * Lê a URL do servidor spaCy de localStorage.
 * @returns {string}
 * @private
 */
function _readNlpUrl() {
  try {
    if (typeof localStorage === 'undefined') return _NLP_URL_DEFAULT;
    const v = localStorage.getItem(_NLP_URL_KEY);
    return v === null || v === '' ? _NLP_URL_DEFAULT : v;
  } catch {
    return _NLP_URL_DEFAULT;
  }
}

/**
 * Grava a URL do servidor spaCy em localStorage.
 * @param {string} url
 * @returns {boolean}
 * @private
 */
function _writeNlpUrl(url) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(_NLP_URL_KEY, String(url));
    return true;
  } catch {
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
// SPAcy — NORMALIZAÇÃO DE RESULTADO
// ══════════════════════════════════════════════════════════════

/**
 * Remove chaves com valores null/undefined/vazios de features.
 * @param {Object} features
 * @returns {Object}
 * @private
 */
function _cleanFeatures(features) {
  if (!features || typeof features !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(features)) {
    if (v !== null && v !== undefined && v !== '') out[k] = v;
  }
  return out;
}

/**
 * Anexa offsets `source` a tokens que não os trazem.
 * Fallback defensivo: escaneia o texto original em sequência.
 *
 * @param {Array} tokens
 * @param {string} originalText
 * @returns {Array}
 * @private
 */
function _attachSources(tokens, originalText) {
  const text = String(originalText ?? '');
  let cursor = 0;

  for (const t of tokens) {
    if (t.source && typeof t.source.start === 'number') continue;

    const tText = String(t.text ?? '');
    if (!tText) {
      t.source = { start: cursor, end: cursor };
      continue;
    }

    const idx = text.indexOf(tText, cursor);
    if (idx >= 0) {
      t.source = { start: idx, end: idx + tText.length };
      cursor = idx + tText.length;
    } else {
      t.source = { start: cursor, end: cursor + tText.length };
      cursor += tText.length;
    }
  }

  return tokens;
}

/**
 * Converte o resultado do servidor spaCy para o formato canônico
 * NLPAnalysis consumido pelo analyzer.js.
 *
 * @param {Object} spacyResult
 * @param {string} originalText
 * @returns {Object} NLPAnalysis
 * @private
 */
function _normalizeSpacyResult(spacyResult, originalText) {
  const rawTokens = Array.isArray(spacyResult?.tokens) ? spacyResult.tokens : [];

  const tokens = rawTokens.map((t) => {
    const text = String(t.text ?? '');
    const lemma = String(t.lemma ?? text).toLowerCase();
    const pos = POS_TAGS.includes(t.pos) ? t.pos : 'NOUN';
    const dep = String(t.dep ?? '');
    const head = typeof t.head === 'number' ? t.head : -1;
    const features = _cleanFeatures(t.features);

    let source;
    if (typeof t.idx === 'number') {
      source = { start: t.idx, end: t.idx + text.length };
    } else if (t.source && typeof t.source.start === 'number') {
      source = { start: t.source.start, end: t.source.end };
    } else {
      source = null;
    }

    return { text, lemma, pos, dep, head, features, source };
  });

  _attachSources(tokens, originalText);

  return {
    tokens,
    tree: spacyResult?.tree ?? null,
    sentence: String(originalText ?? ''),
    backend: 'spacy',
    version: String(spacyResult?.version ?? 'spacy-unknown'),
  };
}

// ══════════════════════════════════════════════════════════════
// SPAcy — ADAPTER HTTP
// ══════════════════════════════════════════════════════════════

/**
 * Cria um adapter spaCy contra uma URL base.
 *
 * @param {string} baseUrl
 * @returns {{ backend:string, analyze:(text:string) => Promise<Object> }}
 * @private
 */
function _spacyAdapter(baseUrl) {
  const url = String(baseUrl).replace(/\/+$/, '');

  return {
    backend: 'spacy',

    async analyze(text) {
      const controller = typeof AbortController !== 'undefined'
        ? new AbortController()
        : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), _NLP_TIMEOUT_MS)
        : null;

      try {
        const res = await fetch(`${url}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: String(text ?? '') }),
          signal: controller?.signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        return _normalizeSpacyResult(data, text);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    },
  };
}

/**
 * Testa se um servidor spaCy está acessível.
 * Aceita qualquer resposta HTTP como sinal de vida.
 *
 * @param {string} url
 * @param {number} [timeoutMs=_NLP_PROBE_TIMEOUT_MS]
 * @returns {Promise<{ ok:boolean, status?:number, error?:string, latencyMs:number }>}
 * @private
 */
async function _probeSpaCy(url, timeoutMs = _NLP_PROBE_TIMEOUT_MS) {
  const t0 = _now();
  const controller = typeof AbortController !== 'undefined'
    ? new AbortController()
    : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    await fetch(String(url).replace(/\/+$/, ''), {
      method: 'HEAD',
      signal: controller?.signal,
    });
    return { ok: true, latencyMs: _round(_now() - t0) };
  } catch (err) {
    return {
      ok: false,
      error: err?.message ?? String(err),
      latencyMs: _round(_now() - t0),
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// ══════════════════════════════════════════════════════════════
// ESTADO INTERNO
// ══════════════════════════════════════════════════════════════

/** @type {string} @private */
let _activeBackend = 'heuristic';

/** @type {Object|null} @private */
let _activeImpl = null;

/** @type {string} @private */
let _version = 'heuristic-1.0.0';

/** @type {boolean} @private */
let _initialized = false;

/**
 * Cache FIFO de análises.
 * Chave: texto da sentença. Valor: NLPAnalysis.
 * @type {Map<string, Object>}
 * @private
 */
const _cache = new Map();

/**
 * Contadores de telemetria.
 * @type {Object}
 * @private
 */
const _stats = {
  totalAnalyzed: 0,
  byBackend: { spacy: 0, heuristic: 0, 'wink-nlp': 0, 'nlp.js': 0 },
  fallbacks: 0,
  errors: 0,
  cacheHits: 0,
  cacheMisses: 0,
  totalLatencyMs: 0,
  slowCalls: 0,
};

// ══════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ══════════════════════════════════════════════════════════════

/** @returns {number} @private */
function _now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/** @param {number} n @returns {number} @private */
function _round(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

/**
 * Limpa o cache se a chave do backend mudou.
 * @param {string} oldBackend
 * @param {string} newBackend
 * @private
 */
function _invalidateCacheOnBackendChange(oldBackend, newBackend) {
  if (oldBackend === newBackend) return;
  _cache.clear();
}

// ══════════════════════════════════════════════════════════════
// API PÚBLICA — INICIALIZAÇÃO
// ══════════════════════════════════════════════════════════════

/**
 * Inicializa o adapter com um backend específico.
 * Idempotente. Nunca lança.
 *
 * @param {Object} [opts={}]
 * @param {string} [opts.backend='spacy']
 * @param {boolean} [opts.silent=false]
 * @returns {Promise<boolean>} sempre true
 */
async function init({ backend = DEFAULT_BACKEND, silent = false } = {}) {
  if (!BACKENDS.includes(backend)) {
    backend = 'heuristic';
  }

  const previousBackend = _activeBackend;

  if (_initialized && _activeBackend === backend) {
    return true;
  }

  // ── spaCy via HTTP ────────────────────────────────────────
  if (backend === 'spacy') {
    const url = _readNlpUrl();
    const probe = await _probeSpaCy(url);

    if (probe.ok) {
      _activeBackend = 'spacy';
      _activeImpl = _spacyAdapter(url);
      _version = 'spacy-pt-lg';
      _initialized = true;
      _invalidateCacheOnBackendChange(previousBackend, _activeBackend);

      if (!silent && typeof console !== 'undefined') {
        console.log(`[Adapter] spaCy conectado em ${url} (${probe.latencyMs}ms)`);
      }
      return true;
    }

    if (!silent && typeof console !== 'undefined') {
      console.warn(
        `[Adapter] spaCy indisponível em ${url} (${probe.error ?? 'timeout'}). ` +
        `Usando heurística. Configure via ` +
        `localStorage.setItem('${_NLP_URL_KEY}', 'http://...')`
      );
    }
    _activeBackend = 'heuristic';
    _activeImpl = null;
    _version = 'heuristic-1.0.0';
    _initialized = true;
    _invalidateCacheOnBackendChange(previousBackend, _activeBackend);
    return true;
  }

  // ── wink-nlp / nlp.js via import dinâmico ─────────────────
  if (backend === 'wink-nlp' || backend === 'nlp.js') {
    try {
      const mod = await import(/* @vite-ignore */ backend).catch(() => null);
      if (mod) {
        _activeBackend = 'heuristic';
        _activeImpl = null;
        _version = `${backend}-detected`;
        _initialized = true;
        _invalidateCacheOnBackendChange(previousBackend, _activeBackend);
        if (!silent && typeof console !== 'undefined') {
          console.warn(
            `[Adapter] ${backend} detectado mas wrapper não implementado — ` +
            `usando heurística.`
          );
        }
        return true;
      }
    } catch { /* cai para heurística */ }

    _activeBackend = 'heuristic';
    _activeImpl = null;
    _version = 'heuristic-1.0.0';
    _initialized = true;
    _invalidateCacheOnBackendChange(previousBackend, _activeBackend);
    return true;
  }

  // ── heurística explícita ──────────────────────────────────
  _activeBackend = 'heuristic';
  _activeImpl = null;
  _version = 'heuristic-1.0.0';
  _initialized = true;
  _invalidateCacheOnBackendChange(previousBackend, _activeBackend);
  return true;
}

// ══════════════════════════════════════════════════════════════
// API PÚBLICA — ANÁLISE
// ══════════════════════════════════════════════════════════════

/**
 * Analisa uma sentença. Nunca lança.
 *
 * @param {string} sentence
 * @returns {Promise<Object>} NLPAnalysis
 */
async function analyze(sentence) {
  const text = String(sentence ?? '');

  const cached = _cache.get(text);
  if (cached) {
    _stats.cacheHits++;
    return cached;
  }

  _stats.cacheMisses++;
  _stats.totalAnalyzed++;

  const t0 = _now();
  let result = null;

  if (_activeImpl && typeof _activeImpl.analyze === 'function') {
    try {
      result = await _activeImpl.analyze(text);
      if (result && Array.isArray(result.tokens)) {
        _stats.byBackend[_activeBackend] =
          (_stats.byBackend[_activeBackend] ?? 0) + 1;
      } else {
        throw new Error('resultado inválido do backend');
      }
    } catch (err) {
      _stats.errors++;
      _stats.fallbacks++;

      if (typeof console !== 'undefined') {
        console.warn(
          `[Adapter] ${_activeBackend} falhou em runtime — ` +
          `caindo para heurística: ${err?.message ?? String(err)}`
        );
      }

      _activeImpl = null;
      _activeBackend = 'heuristic';
      _version = 'heuristic-1.0.0';
      _cache.clear();
      result = null;
    }
  }

  if (!result) {
    result = _analyzeHeuristic(text);
    _stats.byBackend.heuristic++;
  }

  const latencyMs = _now() - t0;
  _stats.totalLatencyMs += latencyMs;
  if (latencyMs > 500) {
    _stats.slowCalls++;
    if (typeof console !== 'undefined') {
      console.warn(
        `[Adapter] análise lenta: ${_round(latencyMs)}ms para "${text.slice(0, 40)}..."`
      );
    }
  }

  _cache.set(text, result);
  while (_cache.size > _CACHE_MAX) {
    const oldest = _cache.keys().next().value;
    if (oldest === undefined) break;
    _cache.delete(oldest);
  }

  return result;
}

// ══════════════════════════════════════════════════════════════
// API PÚBLICA — CONSULTAS
// ══════════════════════════════════════════════════════════════

/**
 * Verifica se o adapter está operacional.
 * @returns {boolean}
 */
function isAvailable() {
  return true;
}

/**
 * Versão do backend ativo.
 * @returns {string}
 */
function version() {
  return _version;
}

/**
 * Nome do backend ativo.
 * @returns {string}
 */
function backend() {
  return _activeBackend;
}

/**
 * Limpa o cache interno.
 */
function clearCache() {
  _cache.clear();
}

/**
 * Reseta o adapter para o estado inicial.
 * @internal
 */
function destroy() {
  _cache.clear();
  _activeImpl = null;
  _activeBackend = 'heuristic';
  _version = 'heuristic-1.0.0';
  _initialized = false;
  resetStats();
}

// ══════════════════════════════════════════════════════════════
// API PÚBLICA — PROBE / CONFIG
// ══════════════════════════════════════════════════════════════

/**
 * Verifica o estado do backend ativo.
 * @returns {Promise<{ ok:boolean, backend:string, version:string, latencyMs:number, error?:string }>}
 */
async function probe() {
  if (_activeBackend === 'spacy') {
    const url = _readNlpUrl();
    const p = await _probeSpaCy(url);
    return {
      ok: p.ok,
      backend: 'spacy',
      version: _version,
      latencyMs: p.latencyMs,
      error: p.error,
    };
  }
  return {
    ok: true,
    backend: _activeBackend,
    version: _version,
    latencyMs: 0,
  };
}

/**
 * Define a URL do servidor spaCy. Persiste em localStorage.
 * @param {string} url
 * @returns {boolean}
 */
function setBackendUrl(url) {
  const cleanUrl = String(url ?? '').trim();
  if (!cleanUrl) return false;

  const wrote = _writeNlpUrl(cleanUrl);
  if (!wrote) return false;

  if (_activeBackend === 'spacy' || _activeBackend === 'heuristic') {
    _initialized = false;
    _activeBackend = 'heuristic';
    _activeImpl = null;
    _cache.clear();
  }
  return true;
}

/**
 * Devolve a URL configurada do servidor spaCy.
 * @returns {string}
 */
function getBackendUrl() {
  return _readNlpUrl();
}

// ══════════════════════════════════════════════════════════════
// API PÚBLICA — TELEMETRIA
// ══════════════════════════════════════════════════════════════

/**
 * Devolve estatísticas de uso.
 * @returns {Object}
 */
function stats() {
  const totalCalls = _stats.cacheHits + _stats.cacheMisses;
  return {
    initialized: _initialized,
    backend: _activeBackend,
    version: _version,
    backendUrl: _activeBackend === 'spacy' ? _readNlpUrl() : null,
    cacheSize: _cache.size,
    cacheMax: _CACHE_MAX,
    cacheHitRate: totalCalls > 0
      ? _round(_stats.cacheHits / totalCalls)
      : 0,
    totalAnalyzed: _stats.totalAnalyzed,
    byBackend: { ..._stats.byBackend },
    fallbacks: _stats.fallbacks,
    errors: _stats.errors,
    slowCalls: _stats.slowCalls,
    avgLatencyMs: _stats.cacheMisses > 0
      ? _round(_stats.totalLatencyMs / _stats.cacheMisses)
      : 0,
  };
}

/**
 * Zera contadores. Mantém cache e backend.
 */
function resetStats() {
  _stats.totalAnalyzed = 0;
  _stats.byBackend = { spacy: 0, heuristic: 0, 'wink-nlp': 0, 'nlp.js': 0 };
  _stats.fallbacks = 0;
  _stats.errors = 0;
  _stats.cacheHits = 0;
  _stats.cacheMisses = 0;
  _stats.totalLatencyMs = 0;
  _stats.slowCalls = 0;
}

// ══════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════

export const Adapter = Object.freeze({
  init,
  destroy,
  analyze,
  isAvailable,
  version,
  backend,
  probe,
  setBackendUrl,
  getBackendUrl,
  clearCache,
  stats,
  resetStats,
  BACKENDS,
  DEFAULT_BACKEND,
  POS_TAGS,
});

export {
  init,
  analyze,
  isAvailable,
  version,
  backend,
  clearCache,
  destroy,
  probe,
  setBackendUrl,
  getBackendUrl,
  stats,
  resetStats,
};