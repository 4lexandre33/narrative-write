/**
 * @file lexicon.imported.js
 * @module narrative-language/pt-br
 * @description Léxico importado automaticamente do VerbNet.BR.
 *              NÃO EDITAR À MÃO — regenere com:
 *                  node tools/import-verbnet.js
 *
 * @generated 2026-09-25T00:00:00.000Z
 * @source    tools/data/verbnet-br.json
 * @shape     (placeholder — rode o script para gerar)
 * @entries   0
 *
 * ═══════════════════════════════════════════════════════════════
 * O QUE É ESTE ARQUIVO
 * ═══════════════════════════════════════════════════════════════
 *
 * O `lexicon.js` curado (escrito à mão) contém ~400 entradas
 * cuidadosamente revisadas. Ele sozinho cobre o vocabulário do
 * dia-a-dia, mas deixa lacunas em verbos específicos de narrativa
 * (esgueirar, perscrutar, irromper, aquiescer, rememorar, ...).
 *
 * Este arquivo é o ponto de extensão automático. Ele é gerado pelo
 * script `tools/import-verbnet.js` a partir de um dump do VerbNet.BR
 * (dicionário aberto de classes verbais do português brasileiro).
 *
 * O merge em `lexicon.js` é:
 *
 *     export const LEXICON = Object.freeze({
 *       ...IMPORTED_LEXICON,      // ← este arquivo (milhares de entradas)
 *       ...CURATED_LEXICON,       // ← curado (vence em colisão)
 *     });
 *
 * Ou seja: o curado SEMPRE vence. Entradas importadas só preenchem
 * lacunas. Isso permite ajustar um verbo específico manualmente sem
 * perder as milhares de entradas automáticas.
 *
 * ═══════════════════════════════════════════════════════════════
 * COMO POPULAR
 * ═══════════════════════════════════════════════════════════════
 *
 * 1. Baixe o dump do VerbNet.BR e salve em:
 *        tools/data/verbnet-br.json
 *
 * 2. Rode:
 *        node tools/import-verbnet.js
 *
 * 3. O script sobrescreve este arquivo com as entradas convertidas.
 *    Verifique as estatísticas impressas:
 *        - Total processado
 *        - Convertidos
 *        - Classes não mapeadas (fallback D1.2)
 *        - Distribuição por subtipo
 *
 * 4. Recarregue a página. O boot detecta o novo léxico e o
 *    `Adapter` passa a usá-lo.
 *
 * ═══════════════════════════════════════════════════════════════
 * FORMATO DE CADA ENTRADA
 * ═══════════════════════════════════════════════════════════════
 *
 *   "<lemma>": {
 *     type:    "verb",
 *     subtype: "D1.2",            // D-number canônico
 *     traits:  ["+agentive", "+volitive"],
 *     roles:   ["agent", "theme"],
 *     _source: "verbnet-br",      // ou "verbnet-br-unmapped"
 *   }
 *
 * O campo `_source` distingue:
 *   - "verbnet-br"           → classe mapeada para D-number conhecido
 *   - "verbnet-br-unmapped"  → classe não mapeada, caiu no fallback D1.2
 *
 * O campo `_class` (só em unmapped) preserva o nome original da classe
 * para auditoria posterior. Se você encontrar um `_class` recorrente
 * que mereça um D-number específico, adicione em `CLASS_MAP` no script
 * e regenere.
 *
 * ═══════════════════════════════════════════════════════════════
 * ESTADO ATUAL
 * ═══════════════════════════════════════════════════════════════
 *
 * Este arquivo está VAZIO (nenhuma entrada). Isso é esperado antes
 * da primeira execução do script. O `lexicon.js` continua funcionando
 * apenas com as entradas curadas.
 *
 * Para popular, siga os passos acima.
 */

export const IMPORTED_LEXICON = Object.freeze({

  // ────────────────────────────────────────────────────────────
  // Nenhuma entrada importada ainda.
  //
  // Rode `node tools/import-verbnet.js` para gerar as entradas
  // a partir de `tools/data/verbnet-br.json`.
  // ────────────────────────────────────────────────────────────

});