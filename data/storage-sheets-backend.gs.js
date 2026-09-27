/**
 * @file storage-sheets-backend.gs
 * @module data
 * @description Backend Google Apps Script (Web App) para o SheetsStorageAdapter.
 * @companion data/storage-sheets.js
 * @language Google Apps Script (JavaScript + APIs Google)
 *
 * ═══════════════════════════════════════════════════════════════════
 * INSTALAÇÃO (5 minutos)
 * ═══════════════════════════════════════════════════════════════════
 *
 * 1. Crie uma planilha Google Sheets em branco.
 *    (É onde os dados serão guardados.)
 *
 * 2. Abra a planilha → Extensões → Apps Script.
 *
 * 3. Apague o conteúdo padrão e cole TODO este arquivo.
 *
 * 4. Salve o projeto (Ctrl+S). Dê um nome, ex.: "Narrative Storage".
 *
 * 5. Rode a função `setup()` uma vez (menu ▶ Run).
 *    Isso cria a aba "KV" com os cabeçalhos corretos.
 *    Autorize as permissões quando o Google pedir.
 *
 * 6. (Opcional) Rode `setApiKey('sua-chave-secreta')` para ativar
 *    autenticação. Se não rodar, o backend fica em modo aberto.
 *
 * 7. Implantar → Nova implantação:
 *      - Tipo:  App da Web
 *      - Executar como:  Eu (seu@email.com)
 *      - Quem tem acesso:  Qualquer pessoa
 *    Copie a URL gerada (termina em /exec).
 *
 * 8. Cole essa URL no cliente:
 *      const adapter = new SheetsStorageAdapter({ webAppUrl: 'https://...' });
 *    Ou via localStorage:
 *      localStorage.setItem('narr:config:sheets:url', 'https://...');
 *    Ou via `setApiKey` no cliente, se você ativou auth no passo 6:
 *      localStorage.setItem('narr:config:sheets:key', 'sua-chave-secreta');
 *
 * ═══════════════════════════════════════════════════════════════════
 * PROTOCOLO (o que o cliente envia e o que este backend devolve)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Todos os requests têm um parâmetro `action`:
 *
 *   ping     → verifica se o backend está vivo
 *              req:  { action: 'ping' }
 *              res:  { ok: true }
 *
 *   get      → lê uma chave
 *              req:  { action: 'get', key: 'world:main' }
 *              res:  { ok: true, value: '...' | null }
 *
 *   set      → grava uma chave (POST)
 *              req:  { action: 'set', key: 'world:main', value: '...' }
 *              res:  { ok: true }
 *
 *   delete   → remove uma chave (POST)
 *              req:  { action: 'delete', key: 'world:main' }
 *              res:  { ok: true }
 *
 *   list     → lista todas as chaves
 *              req:  { action: 'list' }
 *              res:  { ok: true, keys: ['world:main', 'meta:lastTick', ...] }
 *
 * Erros:
 *   res: { ok: false, error: 'mensagem' }
 *
 * Autenticação (opcional):
 *   - Se a Script Property `API_KEY` estiver definida, todo request
 *     precisa enviar `apiKey` (query no GET, campo no body do POST).
 *   - Se `API_KEY` não existir, modo aberto (sem auth).
 *
 * ═══════════════════════════════════════════════════════════════════
 * ESTRUTURA DA PLANILHA
 * ═══════════════════════════════════════════════════════════════════
 *
 *   Aba "KV":
 *     ┌───────────┬───────────────┐
 *     │ A (key)   │ B (value)     │
 *     ├───────────┼───────────────┤
 *     │ world:main│ {"version":1..│
 *     │ meta:...  │ ...           │
 *     └───────────┴───────────────┘
 *
 * Valores são sempre strings. O cliente já cuida de compressão (gzip)
 * antes de enviar, então o backend não precisa saber o formato.
 */

// ═══════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════════════

/** Nome da aba que guarda os pares chave-valor */
var SHEET_NAME = 'KV';

/** Coluna da chave (1-indexada) */
var KEY_COL = 1;

/** Coluna do valor (1-indexada) */
var VALUE_COL = 2;

/** Timeout do lock (ms) */
var LOCK_TIMEOUT_MS = 10000;

/** Tamanho máximo do value (10 MB — limite de célula do Sheets é ~50k chars) */
var MAX_VALUE_LENGTH = 45000;

// ═══════════════════════════════════════════════════════════════════
// ENTRYPOINTS (chamados pelo Google Apps Script)
// ═══════════════════════════════════════════════════════════════════

/**
 * Handler de requisições GET.
 * @param {Object} e — evento do Apps Script (params em e.parameter)
 * @returns {ContentService.TextOutput}
 */
function doGet(e) {
  return _dispatch(e, false);
}

/**
 * Handler de requisições POST.
 * @param {Object} e — evento do Apps Script (body em e.postData.contents)
 * @returns {ContentService.TextOutput}
 */
function doPost(e) {
  return _dispatch(e, true);
}

/**
 * Handler de CORS preflight.
 * Apps Script não permite customizar headers CORS completamente, mas
 * responder OPTIONS evita alguns erros de preflight em navegadores.
 * @param {Object} e
 * @returns {ContentService.TextOutput}
 */
function doOptions(e) {
  return _jsonOutput({ ok: true });
}

// ═══════════════════════════════════════════════════════════════════
// DISPATCH
// ═══════════════════════════════════════════════════════════════════

/**
 * Roteia a requisição para o handler apropriado.
 * @param {Object} e
 * @param {boolean} isPost
 * @returns {ContentService.TextOutput}
 * @private
 */
function _dispatch(e, isPost) {
  var params;

  try {
    params = isPost ? _parsePostBody(e) : _parseGetParams(e);
  } catch (err) {
    return _error('payload inválido: ' + err.message);
  }

  var action = params.action;

  // Auth (só checa se API_KEY estiver configurada no servidor)
  var auth = _checkAuth(params.apiKey);
  if (!auth.ok) {
    return _error(auth.error || 'unauthorized');
  }

  try {
    switch (action) {
      case 'ping':   return _handlePing();
      case 'get':    return _handleGet(params);
      case 'set':    return _handleSet(params);
      case 'delete': return _handleDelete(params);
      case 'list':   return _handleList();
      default:       return _error('action desconhecida: ' + action);
    }
  } catch (err) {
    return _error('erro interno: ' + err.message);
  }
}

/**
 * Extrai params de uma requisição GET (e.parameter).
 * @param {Object} e
 * @returns {Object}
 * @private
 */
function _parseGetParams(e) {
  if (!e || !e.parameter) return {};
  return e.parameter;
}

/**
 * Extrai params do body de uma requisição POST.
 * Aceita Content-Type application/json OU text/plain (fallback).
 * @param {Object} e
 * @returns {Object}
 * @private
 */
function _parsePostBody(e) {
  if (!e || !e.postData || !e.postData.contents) {
    // Alguns clientes enviam como form-urlencoded → cai em e.parameter
    if (e && e.parameter) return e.parameter;
    return {};
  }

  var raw = e.postData.contents;
  try {
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    throw new Error('body não é JSON: ' + raw.slice(0, 100));
  }
}

// ═══════════════════════════════════════════════════════════════════
// HANDLERS
// ═══════════════════════════════════════════════════════════════════

/**
 * `ping` — health check.
 * @returns {ContentService.TextOutput}
 * @private
 */
function _handlePing() {
  return _ok({});
}

/**
 * `get` — lê uma chave.
 * @param {Object} params
 * @returns {ContentService.TextOutput}
 * @private
 */
function _handleGet(params) {
  var key = params.key;
  if (!key) return _error('get: key obrigatória');

  return _withLock(function() {
    var sheet = _getSheet();
    var row = _findRow(sheet, key);

    if (row < 0) {
      return _ok({ value: null });
    }

    var value = sheet.getRange(row, VALUE_COL).getValue();
    if (value === '' || value === null || value === undefined) {
      return _ok({ value: null });
    }

    return _ok({ value: String(value) });
  });
}

/**
 * `set` — grava uma chave.
 * @param {Object} params
 * @returns {ContentService.TextOutput}
 * @private
 */
function _handleSet(params) {
  var key = params.key;
  var value = params.value;

  if (!key) return _error('set: key obrigatória');
  if (typeof value !== 'string') return _error('set: value deve ser string');
  if (value.length > MAX_VALUE_LENGTH) {
    return _error('set: value excede ' + MAX_VALUE_LENGTH + ' chars (recebido ' + value.length + ')');
  }

  return _withLock(function() {
    var sheet = _getSheet();
    var row = _findRow(sheet, key);

    if (row < 0) {
      // Append nova linha
      sheet.appendRow([key, value]);
    } else {
      // Atualiza linha existente
      sheet.getRange(row, VALUE_COL).setValue(value);
    }

    return _ok({});
  });
}

/**
 * `delete` — remove uma chave.
 * @param {Object} params
 * @returns {ContentService.TextOutput}
 * @private
 */
function _handleDelete(params) {
  var key = params.key;
  if (!key) return _error('delete: key obrigatória');

  return _withLock(function() {
    var sheet = _getSheet();
    var row = _findRow(sheet, key);

    if (row > 0) {
      sheet.deleteRow(row);
    }

    return _ok({});
  });
}

/**
 * `list` — lista todas as chaves.
 * @returns {ContentService.TextOutput}
 * @private
 */
function _handleList() {
  return _withLock(function() {
    var sheet = _getSheet();
    var lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return _ok({ keys: [] });
    }

    var values = sheet.getRange(2, KEY_COL, lastRow - 1, 1).getValues();
    var keys = [];

    for (var i = 0; i < values.length; i++) {
      var k = values[i][0];
      if (k !== '' && k !== null && k !== undefined) {
        keys.push(String(k));
      }
    }

    return _ok({ keys: keys });
  });
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Retorna a aba "KV", criando-a se necessário.
 * @returns {Sheet}
 * @private
 */
function _getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('nenhuma planilha ativa (script não é container-bound?)');
  }

  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // Garante cabeçalho
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['key', 'value']);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Encontra a linha de uma chave (1-indexada). Retorna -1 se ausente.
 * Assume que o cabeçalho está na linha 1.
 * @param {Sheet} sheet
 * @param {string} key
 * @returns {number}
 * @private
 */
function _findRow(sheet, key) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  var values = sheet.getRange(2, KEY_COL, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    var k = values[i][0];
    if (k === key) return i + 2; // +2 por causa do header e 1-indexação
  }
  return -1;
}

/**
 * Verifica autenticação.
 * Se `API_KEY` não estiver definida em Script Properties, permite tudo.
 * @param {string} providedKey
 * @returns {{ ok:boolean, error?:string }}
 * @private
 */
function _checkAuth(providedKey) {
  var expected = null;
  try {
    expected = PropertiesService.getScriptProperties().getProperty('API_KEY');
  } catch (err) {
    // Sem acesso a Properties — modo aberto
    return { ok: true };
  }

  if (!expected) return { ok: true }; // modo aberto

  if (!providedKey) return { ok: false, error: 'apiKey ausente' };
  if (String(providedKey) !== String(expected)) {
    return { ok: false, error: 'apiKey inválida' };
  }

  return { ok: true };
}

/**
 * Executa `fn()` dentro de um Lock exclusivo.
 * Protege contra escritas concorrentes que corromperiam os dados.
 * @param {Function} fn
 * @returns {ContentService.TextOutput}
 * @private
 */
function _withLock(fn) {
  var lock = LockService.getScriptLock();
  var acquired = false;

  try {
    lock.waitLock(LOCK_TIMEOUT_MS);
    acquired = true;
    return fn();
  } catch (err) {
    return _error('lock timeout ou erro: ' + err.message);
  } finally {
    if (acquired) {
      try { lock.releaseLock(); } catch (e) { /* noop */ }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// OUTPUT
// ═══════════════════════════════════════════════════════════════════

/**
 * Serializa um objeto e devolve como JSON.
 * @param {Object} obj
 * @returns {ContentService.TextOutput}
 * @private
 */
function _jsonOutput(obj) {
  var json = JSON.stringify(obj);
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Resposta de sucesso.
 * @param {Object} data
 * @returns {ContentService.TextOutput}
 * @private
 */
function _ok(data) {
  var out = { ok: true };
  if (data && typeof data === 'object') {
    for (var k in data) {
      if (Object.prototype.hasOwnProperty.call(data, k)) {
        out[k] = data[k];
      }
    }
  }
  return _jsonOutput(out);
}

/**
 * Resposta de erro.
 * @param {string} message
 * @returns {ContentService.TextOutput}
 * @private
 */
function _error(message) {
  return _jsonOutput({ ok: false, error: String(message || 'erro desconhecido') });
}

// ═══════════════════════════════════════════════════════════════════
// SETUP (rodar uma vez manualmente)
// ═══════════════════════════════════════════════════════════════════

/**
 * Cria a aba "KV" com cabeçalhos, se não existir.
 * Rode isso UMA vez após colar este arquivo no Apps Script.
 */
function setup() {
  var sheet = _getSheet();
  Logger.log('OK — aba "%s" pronta com %s linhas', SHEET_NAME, sheet.getLastRow());
}

/**
 * Define a API key.
 * Depois de rodar isso, todo request precisa enviar `apiKey`.
 * @param {string} key
 */
function setApiKey(key) {
  if (!key) {
    Logger.log('Uso: setApiKey("sua-chave-secreta")');
    return;
  }
  PropertiesService.getScriptProperties().setProperty('API_KEY', String(key));
  Logger.log('API_KEY definida.');
}

/**
 * Remove a API key (volta ao modo aberto).
 */
function clearApiKey() {
  PropertiesService.getScriptProperties().deleteProperty('API_KEY');
  Logger.log('API_KEY removida — modo aberto.');
}

/**
 * Mostra a API key atual (para debug).
 */
function showApiKey() {
  var k = PropertiesService.getScriptProperties().getProperty('API_KEY');
  Logger.log('API_KEY: %s', k || '(não definida — modo aberto)');
}

/**
 * Roda um self-test do backend (sem rede).
 * Útil para verificar se a planilha está acessível.
 */
function selfTest() {
  Logger.log('=== selfTest ===');

  try {
    var sheet = _getSheet();
    Logger.log('Aba "%s" OK — %s linhas', SHEET_NAME, sheet.getLastRow());
  } catch (err) {
    Logger.log('FALHOU: _getSheet → %s', err.message);
    return;
  }

  try {
    _handleSet({ key: '__selftest__', value: 'hello ' + Date.now() });
    Logger.log('set OK');

    var got = _handleGet({ key: '__selftest__' });
    Logger.log('get OK — %s', got.getContent());

    var list = _handleList();
    Logger.log('list OK — %s', list.getContent());

    _handleDelete({ key: '__selftest__' });
    Logger.log('delete OK');

    Logger.log('=== todos os testes passaram ===');
  } catch (err) {
    Logger.log('FALHOU: %s', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
// NOTAS
// ═══════════════════════════════════════════════════════════════════
//
// • Limite de célula: ~50.000 caracteres. O cliente já comprime o
//   payload (gzip + base64), então o valor que chega aqui geralmente
//   é menor que o JSON cru. Se você tem mundos muito grandes, aumente
//   a frequência de `flush()` ou considere chunking (não implementado).
//
// • Limite de células da planilha: 10 milhões. Um mundo com 500 KB de
//   JSON gzipado ocupa 1 célula. O ring de chaves é pequeno (~10-20).
//
// • Concorrência: `_withLock()` serializa writes. Leituras também
//   passam por lock para evitar ler estado inconsistente durante
//   um set (Apps Script não tem transações reais).
//
// • Cold start: primeira requisição após deploy pode demorar ~2s.
//   O cliente já tolera com timeout de 10s (configurável).
//
// • CORS: Apps Script Web Apps (implantados como "Qualquer pessoa")
//   respondem com os headers CORS corretos automaticamente. Se você
//   encontrar erro de preflight, verifique se a implantação está
//   como "Qualquer pessoa" e não "Somente eu".
//
// • Re-deploy: se você alterar este arquivo depois de implantar,
//   precisa criar uma NOVA implantação (Implantar → Gerenciar
//   implantações → editar → nova versão) para as mudanças valerem.
//   A URL `/exec` continua a mesma.
//
// • Debug: use `Logger.log()` + menu Execuções no Apps Script.
//   Rode `selfTest()` após qualquer alteração para sanity-check.
//
// ═══════════════════════════════════════════════════════════════════