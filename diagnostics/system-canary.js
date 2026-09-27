/**
 * @file system-canary.js
 * @module diagnostics
 * @description Compara a lista de sistemas registrados entre boot e
 *              sandbox. Detecta divergência que tornaria os testes
 *              automáticos não-representativos.
 * @imports — (nenhum)
 * @importedBy boot.js
 * @level 9
 *
 * Motivação (auditoria 25/09/2026):
 *   O boot registra 32 sistemas, o sandbox 29. As fases `narrative`,
 *   `replay` e `regression` da TestBattery rodam contra um sandbox
 *   sem NarrativeSystem, PhraseSystem e DiagnosticsSystem. Os cenários
 *   passam por vacuidade — dão falso positivo.
 *
 *   Este canário é a rede de segurança: se alguém adicionar/remover
 *   um sistema num dos lados, o warning aparece imediatamente no
 *   console do boot.
 *
 * Uso (manual, no console):
 *   const boot = Array.from(window.__NarrativeApp.machine.systems.keys());
 *   const sbMod = await import('/diagnostics/sandbox.js');
 *   const sb = await sbMod.createSandbox();
 *   const report = canary.compare(boot, Array.from(sb.machine.systems.keys()));
 *
 * Uso (programático):
 *   import { SystemCanary } from './diagnostics/system-canary.js';
 *   const canary = new SystemCanary();
 *   const report = canary.compare(bootNames, sandboxNames);
 *   if (!report.ok) bus.emit('canary:divergence', report);
 *
 * Contrato:
 *   compare(bootNames, sandboxNames) → CanaryReport
 *   assertEqual(bootNames, sandboxNames) → void   (lança em divergência)
 *   static normalize(names) → string[]            (filtro + dedupe)
 *   static summarize(report) → string             (log legível)
 *
 * Determinismo: sem Math.random, sem wall-clock.
 * Nunca lança em `compare`. `assertEqual` lança intencionalmente.
 */

// ══════════════════════════════════════════════════════════════
// TYPEDEFS
// ══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} CanaryReport
 * @property {boolean}  ok                — true se boot === sandbox
 * @property {number}   bootCount
 * @property {number}   sandboxCount
 * @property {string[]} missingInSandbox  — presentes no boot, ausentes no sandbox
 * @property {string[]} extraInSandbox    — presentes no sandbox, ausentes no boot
 * @property {boolean}  orderMismatch     — true se conjuntos iguais mas ordem difere
 * @property {string[]} bootOrder
 * @property {string[]} sandboxOrder
 */

// ══════════════════════════════════════════════════════════════
// CLASSE
// ══════════════════════════════════════════════════════════════

export class SystemCanary {
  /**
   * @param {Object} [opts={}]
   * @param {boolean} [opts.throwOnOrderMismatch=false] — em assertEqual,
   *        trata ordem diferente como erro (default: só reporta)
   */
  constructor({ throwOnOrderMismatch = false } = {}) {
    this.throwOnOrderMismatch = !!throwOnOrderMismatch;
  }

  // ══════════════════════════════════════════════════════════
  // API PRINCIPAL
  // ══════════════════════════════════════════════════════════

  /**
   * Compara dois arrays de nomes de sistema.
   *
   * Regras:
   *   - `ok = true` exige: mesmos nomes (conjuntos iguais) E mesma ordem.
   *   - `missingInSandbox` e `extraInSandbox` são reportados separadamente.
   *   - `orderMismatch` é independente — só true se conjuntos iguais mas ordem difere.
   *
   * @param {string[]} bootNames
   * @param {string[]} sandboxNames
   * @returns {CanaryReport}
   */
  compare(bootNames, sandboxNames) {
    const boot = SystemCanary.normalize(bootNames);
    const sandbox = SystemCanary.normalize(sandboxNames);

    const bootSet = new Set(boot);
    const sandboxSet = new Set(sandbox);

    const missingInSandbox = boot.filter((n) => !sandboxSet.has(n));
    const extraInSandbox = sandbox.filter((n) => !bootSet.has(n));

    // Comparação de ordem só faz sentido quando os conjuntos batem
    let orderMismatch = false;
    if (missingInSandbox.length === 0 && extraInSandbox.length === 0) {
      if (boot.length !== sandbox.length) {
        orderMismatch = true;
      } else {
        for (let i = 0; i < boot.length; i++) {
          if (boot[i] !== sandbox[i]) {
            orderMismatch = true;
            break;
          }
        }
      }
    }

    const ok =
      missingInSandbox.length === 0 &&
      extraInSandbox.length === 0 &&
      !orderMismatch;

    return {
      ok,
      bootCount: boot.length,
      sandboxCount: sandbox.length,
      missingInSandbox,
      extraInSandbox,
      orderMismatch,
      bootOrder: [...boot],
      sandboxOrder: [...sandbox],
    };
  }

  /**
   * Como `compare`, mas lança `Error` em divergência.
   * Use apenas em canários de boot/testes.
   *
   * @param {string[]} bootNames
   * @param {string[]} sandboxNames
   * @throws {Error}
   * @returns {void}
   */
  assertEqual(bootNames, sandboxNames) {
    const report = this.compare(bootNames, sandboxNames);

    // Se `throwOnOrderMismatch=false`, ordem diferente não lança
    const orderBlocks = this.throwOnOrderMismatch && report.orderMismatch;
    const namesBlock =
      report.missingInSandbox.length > 0 || report.extraInSandbox.length > 0;

    if (!namesBlock && !orderBlocks) return;

    const lines = [
      '[SystemCanary] divergência entre boot e sandbox:',
      `  boot=${report.bootCount} sandbox=${report.sandboxCount}`,
    ];

    if (report.missingInSandbox.length > 0) {
      lines.push(`  faltam no sandbox: ${report.missingInSandbox.join(', ')}`);
    }
    if (report.extraInSandbox.length > 0) {
      lines.push(`  sobram no sandbox: ${report.extraInSandbox.join(', ')}`);
    }
    if (orderBlocks) {
      lines.push('  ordem difere (throwOnOrderMismatch=true)');
    }

    throw new Error(lines.join('\n'));
  }

  // ══════════════════════════════════════════════════════════
  // HELPERS ESTÁTICOS
  // ══════════════════════════════════════════════════════════

  /**
   * Normaliza uma lista de nomes:
   *   - descarta entradas não-string, vazias, whitespace
   *   - trim
   *   - preserva a ordem do input
   *   - remove duplicatas (mantendo a primeira ocorrência)
   *
   * @param {any} names
   * @returns {string[]}
   */
  static normalize(names) {
    if (!Array.isArray(names)) return [];

    const seen = new Set();
    const out = [];

    for (const raw of names) {
      if (typeof raw !== 'string') continue;
      const name = raw.trim();
      if (!name) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }

    return out;
  }

  /**
   * Resumo legível (para logs).
   * @param {CanaryReport} report
   * @returns {string}
   */
  static summarize(report) {
    if (!report) return '(sem relatório)';

    if (report.ok) {
      return `✓ boot=${report.bootCount} sandbox=${report.sandboxCount} — em sincronia`;
    }

    const parts = [`✗ boot=${report.bootCount} sandbox=${report.sandboxCount}`];
    if (report.missingInSandbox.length > 0) {
      parts.push(`faltam: ${report.missingInSandbox.join(', ')}`);
    }
    if (report.extraInSandbox.length > 0) {
      parts.push(`sobram: ${report.extraInSandbox.join(', ')}`);
    }
    if (report.orderMismatch) {
      parts.push('ordem difere');
    }
    return parts.join(' · ');
  }
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

/**
 * Fachada congelada.
 * @type {Readonly<Object>}
 */
export const Canary = Object.freeze({
  SystemCanary,
});