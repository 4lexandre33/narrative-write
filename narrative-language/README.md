# narrative-language

**Subsistema de interpretação de prosa narrativa em português brasileiro.**
Parte do projeto `projeto_editorNarrative`, mas com fronteira arquitetural clara.

---

## Índice

1. [O que é](#o-que-é)
2. [Modelo Canônico (Norma C)](#modelo-canônico-norma-c)
   - [2.1 As 8 operações](#21-as-8-operações)
   - [2.2 Os 45 subtipos atômicos](#22-os-45-subtipos-atômicos)
   - [2.3 Os 9 eixos dimensionais](#23-os-9-eixos-dimensionais)
   - [2.4 Traits transversais](#24-traits-transversais)
   - [2.5 Aliases v1 → v2](#25-aliases-v1--v2)
   - [2.6 Forma do NarrativeAct](#26-forma-do-narrativeact)
3. [Arquitetura](#arquitetura)
4. [Modos de operação](#modos-de-operação)
5. [Comandos `narr.*`](#comandos-narr)
6. [Estrutura de arquivos](#estrutura-de-arquivos)
7. [Como usar no código](#como-usar-no-código)
8. [Escopo e cobertura](#escopo-e-cobertura)
9. [Fixtures](#fixtures)
10. [Estender o léxico](#estender-o-léxico)
11. [Registrar projeções customizadas](#registrar-projeções-customizadas)
12. [Overrides e user-lexicon](#overrides-e-user-lexicon)
13. [Diagnósticos](#diagnósticos)
14. [Troubleshooting](#troubleshooting)
15. [Referência rápida](#referência-rápida)

---

## O que é

`narrative-language` transforma **prosa em português brasileiro** em uma
representação semântica estruturada (**Narrative IR**) capaz de alimentar o
ECS do projeto `projeto_editorNarrative`.

O autor escreve:

```
João abriu a porta.
Para ele, a sala parecia enorme.
Anos antes, já estivera ali.
```

E o sistema produz:

- **8 operações narrativas** canônicas (Norma C) — D1..D8
- **45 subtipos atômicos** (D1.1 .. D6.6)
- **9 eixos dimensionais** (D5, D7, D8)
- **27 traits transversais** (`+agentive`, `-telic`, ...)
- **Propostas de projeção** para o ECS (`ent.*`, `mut.*`, `link.*`, `rul.add`)

Sem exigir que o autor aprenda sintaxe de programação.

---

## Modelo Canônico (Norma C)

A taxonomia das operações narrativas segue a **Norma C**: 8 operações
fundamentais divididas em **3 papéis** (core, mind, coord), com **45 subtipos
atômicos**, **9 eixos dimensionais** e **27 traits transversais**.

Toda a taxonomia é definida em `narrative-language/ir/catalog.js` — fonte
única de verdade.

### 2.1 As 8 operações

| ID | Operação | Papel | Descrição |
|---|---|---|---|
| **D1** | Representar | core | Ocorrências materiais, ações, estados e o relógio do mundo em cena |
| **D2** | Descrever | core | Qualidades e traços perceptíveis, com o relógio da ação pausado |
| **D3** | Expor | core | Informação proposicional, leis e históricos atemporais |
| **D4** | Interiorizar | mind | Fluxo das experiências psicológicas e mentais |
| **D5** | Enunciar | mind | Atos de fala e pragmática do diálogo (taxonomia de Searle) |
| **D6** | Avaliar | mind | Julgamentos, leituras e ponderações do narrador |
| **D7** | Focalizar | coord | Regula o filtro de visão e os desníveis de conhecimento |
| **D8** | Estruturar | coord | Governa o relógio do texto e a entrega de informação |

**Papéis:**
- **core** — conteúdo factual (o que aconteceu / existe)
- **mind** — consciência e discurso (vida interna, fala, juízo)
- **coord** — operações coordenadoras: só têm eixos, não subtipos

### 2.2 Os 45 subtipos atômicos

#### D1 — Representar (7 subtipos)

| ID | Subtipo | Traits |
|---|---|---|
| `D1.1` | Acontecimento | `-agentive`, `+punctual` |
| `D1.2` | Ação | `+agentive`, `+volitive` |
| `D1.3` | Estado-em-cena | `+stative`, `-telic` |
| `D1.4` | Mudança-em-cena | `+change`, `+telic`, `+observable` |
| `D1.5` | Processo | `+durative`, `-telic` |
| `D1.6` | Conduta Fisiológica | `-volitive`, `+observable` |
| `D1.7` | Fenômeno Atmosférico | `-agentive`, `+ambient`, `+durative` |

#### D2 — Descrever (5)

| ID | Subtipo |
|---|---|
| `D2.1` | Entidade/Corpo |
| `D2.2` | Espaço |
| `D2.3` | Objeto |
| `D2.4` | Gesto/Porte |
| `D2.5` | Atmosfera |

#### D3 — Expor (9)

| ID | Subtipo |
|---|---|
| `D3.1` | Contextualizar |
| `D3.2` | Anteceder |
| `D3.3` | Conceituar |
| `D3.4a` | Explicar — Causal |
| `D3.4b` | Explicar — Procedural |
| `D3.4c` | Explicar — Condicional |
| `D3.4d` | Explicar — Final |
| `D3.5` | Especificar |
| `D3.6` | Relacionar |

#### D4 — Interiorizar (10)

| ID | Subtipo | Traits |
|---|---|---|
| `D4.1` | Percepção | `+perceptive` |
| `D4.2` | Cognição | `+cognitive` |
| `D4.3` | Crença/Dúvida | `+belief` |
| `D4.4` | Memória | `+memory` |
| `D4.5` | Imaginação | `+imagination` |
| `D4.6` | Emoção | `+affective` |
| `D4.7` | Desejo | `+affective` |
| `D4.8` | Intenção | `+volitive`, `+cognitive` |
| `D4.9` | Decisão-interna | `+volitive` |
| `D4.10` | Planejamento | `+volitive`, `+durative` |

#### D5 — Enunciar (7)

| ID | Subtipo | Traits |
|---|---|---|
| `D5.1` | Assertivo | `+truth-claim` |
| `D5.2` | Interrogativo | `+information-seeking` |
| `D5.3` | Diretivo | `+action-oriented` |
| `D5.4` | Comissivo | `+future-commitment` |
| `D5.5` | Expressivo | `+affective` |
| `D5.6` | Declarativo | `+world-changing` |
| `D5.7` | Fático | `+channel-oriented` |

#### D6 — Avaliar (6)

| ID | Subtipo |
|---|---|
| `D6.1` | Juízo Ético/Prático |
| `D6.2` | Juízo Epistêmico |
| `D6.3` | Interpretar |
| `D6.4` | Ironia/Contraste |
| `D6.5` | Comentar |
| `D6.6` | Refletir |

#### D7 e D8 — Coordenadores

D7 e D8 **não têm subtipos**. Só eixos (ver §2.3).

### 2.3 Os 9 eixos dimensionais

Operações coordenadoras (D5, D7, D8) são multidimensionais.

#### D5 — Enunciar (2 eixos)

| Eixo | Valores |
|---|---|
| `modo` | `direct` · `indirect` · `free-indirect` |
| `enunciador` | `character` · `narrator` · `reader` |

#### D7 — Focalizar (3 eixos)

| Eixo | Valores |
|---|---|
| `grau` | `zero` · `external` · `internal` |
| `estabilidade` | `fixed` · `variable` · `multiple` |
| `alcanceK` | `symmetric` · `asymmetric-narrator` · `asymmetric-reader` |

#### D8 — Estruturar (4 eixos)

| Eixo | Valores |
|---|---|
| `temporal` | `linear` · `analepse` · `prolepse` · `simultaneous` |
| `informacional` | `omit` · `delay` · `hint` · `payoff` |
| `discursiva` | `segment` · `intercalation` · `frame` · `block` |
| `distancia` | `scene` · `summary` · `ellipsis` · `pause` · `iterative` |

### 2.4 Traits transversais

27 traits que cortam através das operações. Convenção: `+trait` (presente),
`-trait` (ausente explicitamente).

**Temporalidade/Aspecto:** `+telic`, `-telic`, `+durative`, `+punctual`,
`+iterative`, `+habitual`, `+change`, `+stative`.

**Agência/Volição:** `+agentive`, `-agentive`, `+volitive`, `-volitive`.

**Percepção/Cognição:** `+perceptive`, `+cognitive`, `+affective`.

**Observabilidade:** `+observable`, `+focal-able`.

**Modalidade/Força:** `+intensive`, `+social`, `+ambient`, `+eventive`.

**Atos de fala (Searle):** `+truth-claim`, `+information-seeking`,
`+action-oriented`, `+future-commitment`, `+world-changing`,
`+channel-oriented`.

**Modalidade epistêmica:** `+belief`, `+doubt`, `+memory`, `+imagination`.

### 2.5 Aliases v1 → v2

Para retrocompatibilidade, nomes antigos são resolvidos via `resolveAlias(name)`
em `catalog.js`:

```js
resolveAlias('represent')  // → 'D1'
resolveAlias('emotion')    // → 'D4.6'
resolveAlias('motion')     // → 'D1.2'
resolveAlias('belief')     // → 'D4.3'
resolveAlias('D1.2')       // → 'D1.2'  (já é canônico)
```

### 2.6 Forma do NarrativeAct

Cada ato produzido pelo interpreter tem o formato:

```javascript
{
  id: 'act-s1-1',
  kind: 'narrative-act',
  operations: ['represent'],           // operações v1 (retrocompat)
  subtypes: {                          // rich (D-numbers)
    D1: {
      operation: 'D1',
      id: 'D1.2',
      label: 'Ação',
      confidence: 0.88,
      source: 'lexicon',
      reason: 'lema "entrar"',
      value: 'entrar',
      traits: ['+eventive', '+agentive', '+volitive', '+telic'],
      chain: ['D1', 'D1.2'],
    }
  },
  subtypesFlat: { represent: 'D1.2' },  // flat (retrocompat v1)
  axes: {                               // eixos (D5, D7, D8)
    D8: { temporal: 'analepse' },
  },
  traits: ['+eventive', '+agentive', '+volitive', '+telic'],
  confidence: 0.88,
  voice: { kind: 'narrator', sourceId: null },
  focalization: null,
  form: 'narration',
  tense: 'past',
  aspect: null,
  modality: null,
  negation: null,
  epistemic: 'fact',
  proposition: { predicate: 'entrar', predicateLemma: 'entrar', roles: {...} },
  references: [...],
  discourseRelations: [...],
  source: { start: 0, end: 20, line: 1, column: 0, raw: 'João entrou em Cinza.' },
  provenance: {
    segmenter: 'segmenter-1.0.0',
    nlpBackend: 'heuristic',
    classifier: 'classifier-2.0.0',
    lexicon: 'lexicon-2.0.0',
    catalog: '2.0.0',
    analyzedBy: 'interpreter-1.2.0',
  },
}
```

---

## Arquitetura

```
┌───────────────────────────────────────────────────────────────┐
│ AUTOR digita prosa em português                               │
└───────────────────────────┬───────────────────────────────────┘
                            ▼
┌───────────────────────────────────────────────────────────────┐
│ narrative-language/index.js  →  analyze(text, ctx)            │
│                                                                │
│  segmenter  →  sentences + spans                              │
│  adapter    →  tokens (POS, lemma, features)                  │
│  analyzer   →  sujeito, predicado, roles, tempo, aspecto      │
│  resolver   →  referências resolvidas                         │
│  classifier →  operações narrativas + evidências (D1..D8)     │
│  subtype-detector → subtipos + eixos + traits                 │
│  dimensions →  voz, focalização, forma, temporalidade         │
│  interpreter→  NarrativeAct[]                                 │
│  validator  →  narrativeIR@1.0 válido                         │
└───────────────────────────┬───────────────────────────────────┘
                            ▼
┌───────────────────────────────────────────────────────────────┐
│ NarrativeSystem (systems/narrative-system.js)                 │
│  - modo off/preview/suggest/auto                              │
│  - emite narrative:preview, narrative:suggest, ...            │
│  - em modo auto, aplica via machine.handleLine()              │
└───────────────────────────┬───────────────────────────────────┘
                            ▼
┌───────────────────────────────────────────────────────────────┐
│ Pipeline ECS existente (31 sistemas)                          │
└───────────────────────────────────────────────────────────────┘
```

**Fronteira:** o `narrative-language/` importa do ECS apenas
`core/constants.js` (2 chaves de storage). A integração acontece via
`systems/narrative-system.js`.

---

## Modos de operação

Persistido em `narr:narrative:mode`.

| Modo | Análise | Mutação | Quando usar |
|---|---|---|---|
| `off` | nenhuma | nenhuma | Escrita puramente literária |
| `preview` | completa | **zero** | Autor vê análise, não aplica |
| `suggest` | completa | **por clique** | Autor aprova sugestão a sugestão |
| `auto` | completa | **se confiança > 0.95** | Simulação / jogo |

**Default:** `off`. Seguro por definição.

---

## Comandos `narr.*`

| Comando | Efeito |
|---|---|
| `narr.off` | Desativa análise narrativa |
| `narr.preview` | Análise visível, sem mutação |
| `narr.suggest` | Propostas com aprovação manual |
| `narr.auto` | Aplicação automática (confiança > 0.95) |
| `narr.status` | Modo atual + estatísticas |
| `narr.stats` | Métricas acumuladas |
| `narr.overrides` | Overrides do autor |
| `narr.lexicon` | Preferências aprendidas |
| `narr.catalog` | **Catálogo canônico** (operações + subtipos) |

E o prefixo `diag.narrative.*`:

| Comando | Efeito |
|---|---|
| `diag.narrative.recent [n]` | Últimos N atos do IR |
| `diag.narrative.why <actId>` | Trace completo de um ato |
| `diag.narrative.stats` | Estatísticas do NarrativeSystem |
| `diag.narrative.overrides` | Overrides persistidos |
| `diag.narrative.lexicon` | Preferências aprendidas |
| `diag.narrative.replay <actId>` | Propostas para um ato (não aplica) |
| `diag.narrative.clear` | Limpa IR em cache |
| `diag.narrative.help` | Ajuda |

---

## Estrutura de arquivos

```
narrative-language/
├── README.md                            ← este arquivo
├── index.js                             ← API pública
├── config.js                            ← thresholds, escopo, políticas
├── mode.js                              ← persistência do modo
├── overrides.js                         ← overrides do autor
├── user-lexicon.js                      ← preferências aprendidas
│
├── ir/
│   ├── schema.js                        ← constantes, enums, typedefs
│   ├── catalog.js                       ← ★ Catálogo Canônico Norma C
│   ├── operations.js                    ← deprecated shim (usa catalog)
│   ├── validator.js                     ← validadores do IR
│   └── source-map.js                    ← IR ↔ texto original
│
├── pt-br/
│   ├── adapter.js                       ← interface com NLP backend
│   ├── lexicon.js                       ← léxico migrado (D-numbers)
│   ├── connectors.js                    ← conectores discursivos (eixos)
│   ├── constructions.js                 ← padrões narrativos recorrentes
│   └── _migration-map.js                ← referência de migração v1→v2
│
├── pipeline/
│   ├── segmenter.js                     ← texto → sentenças + spans
│   ├── analyzer.js                      ← análise linguística
│   ├── resolver.js                      ← resolução de referências
│   ├── discourse-analyzer.js            ← relações entre spans
│   └── interpreter.js                   ← núcleo: AST → NarrativeAct[]
│
├── acts/
│   ├── classifier.js                    ← 8 operações + evidências
│   ├── subtype-detector.js              ← subtipos + traits + eixos
│   ├── axis-detector.js                 ← detecção de eixos D5/D7/D8
│   ├── dimensions.js                    ← voz, focalização, forma, ...
│   ├── projector.js                     ← NarrativeAct → comandos ECS
│   ├── focalization-analyzer.js         ← análise de focalização
│   ├── interiority-analyzer.js          ← análise de interioridade
│   ├── temporality-analyzer.js          ← análise de temporalidade
│   ├── epistemic-analyzer.js            ← análise de epistemologia
│   └── rule-compiler.js                 ← regras naturais → rul.add
│
├── diagnostics/
│   ├── narrative-diagnostics.js         ← fábrica de diagnósticos
│   ├── trace.js                         ← trace end-to-end
│   └── diag-handlers.js                 ← handlers de diag.narrative.*
│
└── fixtures/
    └── runner.js                        ← runner + CANONICAL_FIXTURES
```

---

## Como usar no código

### API pública

```js
import { analyze, API } from './narrative-language/index.js';

const ir = await analyze('João abriu a porta.', {
  documentId: 'default',
  projectEntities: [
    { id: 'joao', name: 'João', shortId: 'CHR-JOA', gender: 'masculine' },
  ],
});

console.log(ir.acts[0].operations);   // ['represent']
console.log(ir.acts[0].subtypes);     // { D1: { id: 'D1.2', ... } }
console.log(ir.acts[0].subtypesFlat); // { represent: 'D1.2' }
console.log(ir.acts[0].axes);         // {}
console.log(ir.acts[0].traits);       // ['+eventive', '+agentive', ...]
```

### Catálogo

```js
import { Catalog } from './narrative-language/ir/catalog.js';

console.log(Catalog.operationIds());          // ['D1', ..., 'D8']
console.log(Catalog.subtypeIds('D1'));        // ['D1.1', ..., 'D1.7']
console.log(Catalog.axisValues('D8', 'temporal'));
// ['linear', 'analepse', 'prolepse', 'simultaneous']

console.log(Catalog.catalogStats());
// { version: '2.0.0', operations: 8, subtypes: 45, axes: 9, traits: 27, aliases: ~95 }
```

### Via pipeline ECS

```js
machine.handleLine('narr.preview');
machine.handleLine('João abriu a porta.');
// → evento 'narrative:preview' com IR

machine.handleLine('narr.catalog');
// → tabela com operações + subtipos no painel direito
```

---

## Escopo e cobertura

O subsistema cobre **8 níveis** (L0..L7). Fora desse escopo, o sistema
**diagnostica explicitamente** em vez de adivinhar.

| Nível | Cobertura |
|---|---|
| **L0** | Frases declarativas curtas |
| **L1** | Discurso direto e indireto |
| **L2** | Coordenação + subordinação básica |
| **L3** | Interioridade + focalização |
| **L4** | Temporalidade complexa |
| **L5** | Modalidade + aspecto + negação fina |
| **L6** | Epistemologia |
| **L7** | Regras narrativas naturais |

**Fora do escopo:** clíticos avançados, anáforas de longa distância,
ironia profunda, regionalismos, poesia não-canônica.

---

## Fixtures

45 fixtures canônicas cobrem os 8 níveis + subtipos + eixos.

### Rodar fixtures

```js
import { runFixtures, reportToText } from './narrative-language/fixtures/runner.js';

const report = await runFixtures();
console.log(reportToText(report));
// → Fixtures: 45/45 passaram em XXXms
```

### Filtros

```js
await runFixtures({ level: 'L3' });          // só L3
await runFixtures({ category: 'interiority' });
await runFixtures({ name: 'D1.' });          // só as canônicas de D1
```

### Registro externo

```js
import { registerFixtures, allFixtures, runFixtures } from './narrative-language/fixtures/runner.js';

registerFixtures([{
  name: 'custom-test',
  level: 'L0',
  category: 'representing',
  input: 'João saltou.',
  expect: {
    acts: [{
      operations: ['represent'],
      subtypes: { D1: 'D1.2' },
    }],
  },
}]);

const report = await runFixtures({ fixtures: allFixtures() });
```

---

## Estender o léxico

O léxico vive em `narrative-language/pt-br/lexicon.js`. Para adicionar
uma entrada:

```js
export const LEXICON = Object.freeze({
  // ...

  'trotar': {
    type: 'motion',
    subtype: 'D1.2',                          // D-number canônico
    traits: ['+agentive', '+volitive', '+manner'],
    roles: ['agent', 'manner'],
    class: 'running',
  },

  'sentir': {
    type: 'experiential',
    subtype: 'D4.1',
    traits: ['+perceptive'],
    roles: ['experiencer', 'target'],
    variants: [
      { objectTypes: ['emotion'],   subtype: 'D4.6' },
      { objectTypes: ['sensation'], subtype: 'D4.1' },
    ],
  },
});
```

---

## Registrar projeções customizadas

```js
import { registerProjection } from './narrative-language/acts/projector.js';

registerProjection('brilhar', (act) => {
  const t = act.proposition?.roles?.theme?.raw;
  if (!t) return [];
  return [`mut.flag.on ${t} brilhando`];
});
```

Uma projeção customizada **substitui** a projeção padrão por subtipo.

---

## Overrides e user-lexicon

### Overrides (span-level)

Quando o autor clica numa referência ambígua no editor e escolhe o
candidato correto, o sistema grava:

```js
{
  "s1.o42": {
    "chose": "carlos",
    "rejected": ["joao"],
    "ts": 1712345678901,
    "ttl": 2592000000,
    "uses": 0
  }
}
```

Em `narr:narrative:overrides`. TTL: 30 dias.

### User-lexicon (lemma-level)

Quando o autor marca "Lembrar esta correção":

```js
{
  "ele": { "prefer": "carlos", "context": null, "ts": ..., "uses": 1 }
}
```

Em `narr:narrative:user-lexicon`. Boost de +0.30 no resolver.

---

## Diagnósticos

| Code | Severidade | Quando |
|---|---|---|
| `LEX_UNKNOWN_WORD` | info | Palavra fora do léxico |
| `SYN_NO_VERB` | warning | Sentença sem predicado |
| `SYN_AMBIGUOUS_SUBJECT` | warning | Sujeito elíptico irresolvível |
| `SEM_OP_LOW_CONFIDENCE` | info | Classificação com baixa confiança |
| `REF_AMBIGUOUS` | warning | Pronome com 2+ candidatos |
| `REF_UNRESOLVED` | warning | Pronome sem candidato |
| `NAR_VOICE_UNCERTAIN` | info | Voz não determinável |
| `NAR_FOCALIZATION_UNCERTAIN` | info | Focalização ambígua |
| `EPI_BELIEF_AS_FACT` | warning | Crença interpretada como fato |
| `CONT_ENTITY_MISSING` | warning | Referência a entidade inexistente |
| `EXECUTION_FAILED` | error | Falha de execução |

### Trace end-to-end

```
diag.narrative.why <actId>
```

Re-executa o pipeline e mostra cada estágio.

---

## Troubleshooting

### "Nada acontece quando escrevo prosa"

```
narr.status
narr.preview
```

### "Análise errada / baixa confiança"

Use `diag.narrative.why <actId>` para ver o trace. Cada decisão tem
evidências rastreáveis.

### "Referências não resolvem"

Verifique se as entidades existem no World:

```
ent.list
```

### "Quero ver o catálogo"

```
narr.catalog
```

---

## Referência rápida

```js
// API principal
import { analyze, stats, reset } from './narrative-language/index.js';

// Catálogo
import { Catalog } from './narrative-language/ir/catalog.js';

// Fixtures
import { runFixtures, reportToText } from './narrative-language/fixtures/runner.js';

// Léxico
import { lookupLemma, classOf, subtypeOf } from './narrative-language/pt-br/lexicon.js';

// Projeções
import { registerProjection } from './narrative-language/acts/projector.js';

// Modos
import { readMode, writeMode, nextMode } from './narrative-language/mode.js';
```

---

## Invariantes do sistema

1. O texto do autor **nunca é silenciosamente reescrito**.
2. **Falha de parsing não muta o domínio**.
3. **Falha semântica não destrói o último IR válido**.
4. **Focalização não altera a verdade do mundo**.
5. **Crença não pode ser confundida com fato**.
6. **Percepção não é conhecimento pleno**.
7. **Voz não é focalização**.
8. **Mesma entrada + mesmo contexto = mesma interpretação**.
9. **Ambiguidade relevante gera diagnóstico**.
10. **Determinismo garantido — sem `Math.random`, sem `wall-clock` na semântica**.

---

**Fim do README.**