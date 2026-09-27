/**
 * @file command-runner.js
 * @module systems/helpers
 * @description Executa uma linha de comando via Machine, retornando o resultado.
 * @imports — (nenhum)
 * @importedBy systems/helpers/rule-executor, systems/template-system, systems/snippet-system
 * @level 8
 *
 * Este é o ÚNICO ponto onde um sistema pode invocar o pipeline completo
 * indiretamente. Não importa nenhum sistema específico.
 */

export class CommandRunner {
  /**
   * @param {Object} machine  — instância do Context Machine
   */
  constructor(machine) {
    this.machine = machine;
  }

  /**
   * Executa uma linha no pipeline, capturando o resultado.
   * Nunca lança — retorna `{ ok:false, error }` em falha.
   *
   * @param {string} line
   * @param {Object} [ctx={}]  — contexto adicional (opcional)
   * @returns {Object} SystemResult
   */
  run(line, ctx = {}) {
    if (!line || typeof line !== 'string') {
      return { ok: false, error: 'linha vazia' };
    }
    try {
      const result = this.machine.handleLine(line);
      return result ?? { ok: false, error: 'sem resultado' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Executa várias linhas em sequência.
   * @param {string[]} lines
   * @returns {{ ok:boolean, results:Object[], errors:string[] }}
   */
  runMany(lines = []) {
    const results = [];
    const errors = [];
    for (const line of lines) {
      const res = this.run(line);
      results.push(res);
      if (!res.ok) errors.push(res.error || 'unknown');
    }
    return {
      ok: errors.length === 0,
      results,
      errors,
    };
  }

  /**
   * Executa um comando interno (prefixo `__`) diretamente.
   * @param {string} raw  — ex: '__download:pdf'
   * @param {Object} [opts={}]
   * @returns {Object}
   */
  runInternal(raw, opts = {}) {
    if (!raw || !raw.startsWith('__')) {
      return { ok: false, error: 'não é comando interno' };
    }
    const [verb, arg] = raw.slice(2).split(':');
    switch (verb) {
      case 'download':
        return this.machine.bus?.emit ? { ok: true, action: 'download', format: arg } : { ok: false };
      case 'copy':
        return { ok: true, action: 'copy', format: arg };
      case 'preview':
        return { ok: true, action: 'preview', format: arg };
      case 'close':
        return { ok: true, action: 'close' };
      case 'jump':
        return { ok: true, action: 'jump', tick: arg };
      case 'save':
        this.machine.bus.emit('persist:flush', { reason: 'manual' });
        return { ok: true, action: 'save' };
      default:
        return { ok: false, error: `ação interna desconhecida: ${verb}` };
    }
  }
}