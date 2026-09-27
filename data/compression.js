/**
 * @file compression.js
 * @module data
 * @description Compressão gzip opcional via CompressionStream nativo.
 * @imports — (nenhum)
 * @importedBy systems/persistence-system, systems/export-system, boot
 * @level 1
 *
 * Formato do payload comprimido:
 *   "gz:" + base64(gzip(bytes))
 *
 * Fallback: se a API não existe, `compress` devolve a string original
 * sem prefixo, e `decompress` devolve o input intacto. Isso torna o
 * sistema compatível com navegadores antigos sem quebrar o storage.
 */

const GZ_PREFIX = 'gz:';
const CHUNK_SIZE = 0x8000; // 32 KiB — evita stack overflow no fromCharCode

/**
 * Verifica se a API nativa está disponível.
 * @returns {boolean}
 */
export function isSupported() {
  return (
    typeof CompressionStream !== 'undefined' &&
    typeof DecompressionStream !== 'undefined' &&
    typeof TextEncoder !== 'undefined' &&
    typeof TextDecoder !== 'undefined'
  );
}

/**
 * Comprime uma string.
 * Se a API não estiver disponível ou a entrada for vazia,
 * devolve a string original sem prefixo.
 *
 * @param {string} str
 * @returns {Promise<string>}
 */
export async function compress(str) {
  const input = String(str ?? '');
  if (!input) return input;
  if (!isSupported()) return input;

  try {
    const encoded = new TextEncoder().encode(input);
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(encoded);
    writer.close();

    const chunks = [];
    const reader = cs.readable.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }

    const total = chunks.reduce((n, c) => n + c.length, 0);
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }

    return GZ_PREFIX + bytesToBase64(bytes);
  } catch {
    // Em qualquer falha, devolve o input cru (sem compressão)
    return input;
  }
}

/**
 * Descomprime uma string.
 * Se não houver prefixo `gz:`, devolve o input intacto.
 *
 * @param {string} str
 * @returns {Promise<string>}
 */
export async function decompress(str) {
  const input = String(str ?? '');
  if (!input.startsWith(GZ_PREFIX)) return input;
  if (!isSupported()) {
    // Sem suporte, não conseguimos ler — devolve vazio em vez de lixo
    return '';
  }

  try {
    const b64 = input.slice(GZ_PREFIX.length);
    const bytes = base64ToBytes(b64);

    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();

    const chunks = [];
    const reader = ds.readable.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }

    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }

    return new TextDecoder().decode(out);
  } catch {
    return '';
  }
}

/**
 * Verifica se uma string está no formato comprimido.
 * @param {string} str
 * @returns {boolean}
 */
export function isCompressed(str) {
  return typeof str === 'string' && str.startsWith(GZ_PREFIX);
}

// ── Internos ───────────────────────────────────────────────────

/**
 * Converte Uint8Array para base64 (chunked).
 * @param {Uint8Array} bytes
 * @returns {string}
 * @private
 */
function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const slice = bytes.subarray(i, i + CHUNK_SIZE);
    bin += String.fromCharCode.apply(null, slice);
  }
  return btoa(bin);
}

/**
 * Converte base64 para Uint8Array.
 * @param {string} b64
 * @returns {Uint8Array}
 * @private
 */
function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

/**
 * Exporta como objeto — permite `import * as Compression`.
 */
export const Compression = {
  isSupported,
  compress,
  decompress,
  isCompressed,
  GZ_PREFIX,
};