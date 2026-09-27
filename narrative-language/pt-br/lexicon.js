/**
 * @file lexicon.js
 * @module narrative-language/pt-br
 * @description Léxico narrativo curado para PT-BR, migrado para a
 *              taxonomia canônica Norma C (D-numbers).
 * @imports narrative-language/ir/catalog,
 *          narrative-language/pt-br/lexicon.imported
 * @importedBy narrative-language/pipeline/analyzer,
 *             narrative-language/acts/classifier,
 *             narrative-language/acts/subtype-detector,
 *             narrative-language/acts/dimensions,
 *             narrative-language/acts/interiority-analyzer,
 *             narrative-language/acts/epistemic-analyzer,
 *             narrative-language/acts/rule-compiler
 * @level N0
 *
 * ═══════════════════════════════════════════════════════════════
 * CAMADA 2 — LÉXICO EXPANDIDO
 * ═══════════════════════════════════════════════════════════════
 *
 * Este arquivo combina DUAS fontes:
 *
 *   1. IMPORTED_LEXICON   — gerado automaticamente por
 *                           `tools/import-verbnet.js` a partir de um
 *                           dump do VerbNet.BR (~2000-3000 lemas).
 *
 *   2. CURATED_LEXICON    — escrito à mão, revisado, ~400 entradas.
 *
 * Regra de merge: o CURADO sempre vence. Entradas importadas só
 * preenchem lacunas. Isso permite ajustar um verbo específico
 * manualmente sem perder as milhares de entradas automáticas.
 *
 * Para regenerar o importado:
 *     node tools/import-verbnet.js
 *
 * Para adicionar uma entrada curada nova, edite CURATED_LEXICON
 * abaixo. Nunca edite `lexicon.imported.js` à mão.
 *
 * ═══════════════════════════════════════════════════════════════
 * ESTRUTURA DE UMA ENTRADA
 * ═══════════════════════════════════════════════════════════════
 *
 *   {
 *     type:        string,     // tipo semântico (agrupador lexical)
 *     subtype:     string,     // D-number canônico (ex: 'D1.2')
 *     traits:      string[],   // traits transversais
 *     roles?:      string[],   // papéis semânticos esperados
 *     class?:      string,     // classe semântica fina
 *     variants?:   Variant[],  // sentidos múltiplos (por tipo de objeto)
 *   }
 *
 * Variant:
 *   {
 *     objectTypes: string[],
 *     subtype:     string,     // D-number refinado
 *     operation?:  string,     // D-number da operação (opcional)
 *   }
 *
 * Convenção:
 *   type      — grupo lexical (usado para estatística e fallback)
 *   subtype   — D-number canônico (norma C)
 *   traits    — propriedades transversais (+agentive, -telic, ...)
 *   class     — classe fina (usada por variants)
 */

import { TRAITS as _CATALOG_TRAITS } from '../ir/catalog.js';
import { IMPORTED_LEXICON } from './lexicon.imported.js';

// ══════════════════════════════════════════════════════════════
// TIPOS SEMÂNTICOS (agrupamento lexical)
// ══════════════════════════════════════════════════════════════

/**
 * Tipos semânticos usados como agrupador lexical.
 * @type {ReadonlyArray<string>}
 */
export const PREDICATE_TYPES = Object.freeze([
  'motion', 'action', 'social', 'combat', 'transfer',
  'creation', 'destruction', 'ritual',
  'communicative', 'perception', 'experiential',
  'cognitive', 'emotion', 'state',
  'somatic', 'weather',
]);

/**
 * Classes semânticas de substantivo.
 * @type {ReadonlyArray<string>}
 */
export const NOUN_CLASSES = Object.freeze([
  'person', 'place', 'object', 'emotion', 'abstract',
  'body-part', 'time', 'event', 'group', 'artifact',
  'quality', 'size', 'temperature', 'age', 'aesthetic',
  'value', 'strength', 'speed', 'sound', 'sensation',
  'temporal', 'discourse', 'role', 'weapon', 'armor',
  'document', 'substance', 'plant', 'animal',
]);

// ══════════════════════════════════════════════════════════════
// CURATED LEXICON — entradas escritas à mão
// ══════════════════════════════════════════════════════════════
//
// Este bloco é o "override" humano do léxico importado. Toda entrada
// aqui tem precedência sobre uma entrada homônima em IMPORTED_LEXICON.
//
// Chave = lema (infinitivo para verbos, singular para nomes).

const CURATED_LEXICON = Object.freeze({

  // ═══════════════════════════════════════════════════════════
  // D1.2 — AÇÃO (movimento)
  // ═══════════════════════════════════════════════════════════
  'ir':        { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'destination'], class: 'directed' },
  'vir':       { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'origin'],      class: 'directed' },
  'chegar':    { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'destination'], class: 'punctual' },
  'partir':    { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'origin'],      class: 'punctual' },
  'sair':      { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'origin'],      class: 'egressive' },
  'entrar':    { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'destination'], class: 'ingressive' },
  'voltar':    { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'destination'], class: 'returning' },
  'regressar': { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'destination'], class: 'returning' },
  'retornar':  { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'destination'], class: 'returning' },
  'avançar':   { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'destination'], class: 'directed' },
  'recuar':    { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'origin'],      class: 'directed' },
  'subir':     { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'destination'], class: 'vertical-up' },
  'descer':    { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'destination'], class: 'vertical-down' },
  'fugir':     { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'origin'],      class: 'egressive' },
  'escapar':   { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'origin'],      class: 'egressive' },
  'saltar':    { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'destination'], class: 'jump' },
  'pular':     { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'destination'], class: 'jump' },
  'mergulhar': { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'destination'], class: 'dive' },
  'voar':      { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'destination'], class: 'aerial' },
  'cair':      { type: 'motion', subtype: 'D1.1', traits: ['-agentive', '+punctual'], roles: ['theme', 'destination'], class: 'fall' },
  'escalar':   { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+durative'], roles: ['agent', 'destination'], class: 'climb' },
  'escorregar':{ type: 'motion', subtype: 'D1.1', traits: ['-agentive', '+punctual'], roles: ['theme'], class: 'slip' },
  'deslizar':  { type: 'motion', subtype: 'D1.5', traits: ['-agentive', '+durative'], roles: ['theme'], class: 'slide' },
  'vaguear':   { type: 'motion', subtype: 'D1.5', traits: ['+agentive', '+durative', '-telic'], roles: ['agent', 'manner'], class: 'wander' },
  'perambular':{ type: 'motion', subtype: 'D1.5', traits: ['+agentive', '+durative', '-telic'], roles: ['agent', 'manner'], class: 'wander' },
  'perseguir': { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+durative'], roles: ['agent', 'target'], class: 'pursuit' },
  'alcançar':  { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'target'], class: 'reach' },
  'seguir':    { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+durative'], roles: ['agent', 'target'], class: 'follow' },
  'guiar':     { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'target'], class: 'guide' },
  'cavalgar':  { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'instrument'], class: 'riding' },
  'dirigir':   { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'instrument'], class: 'drive' },
  'pilotar':   { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'instrument'], class: 'pilot' },
  'velejar':   { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+durative'], roles: ['agent', 'instrument'], class: 'sail' },
  'remar':     { type: 'motion', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+iterative'], roles: ['agent', 'instrument'], class: 'row' },
  'marchar':   { type: 'motion', subtype: 'D1.5', traits: ['+agentive', '+durative', '-telic'], roles: ['agent', 'destination'], class: 'marching' },
  'rastejar':  { type: 'motion', subtype: 'D1.5', traits: ['+agentive', '+durative', '-telic'], roles: ['agent'], class: 'crawl' },
  'galopar':   { type: 'motion', subtype: 'D1.5', traits: ['+agentive', '+durative', '-telic'], roles: ['agent', 'manner'], class: 'gallop' },
  'tropeçar':  { type: 'motion', subtype: 'D1.1', traits: ['-agentive', '+punctual'], roles: ['theme'], class: 'stumble' },

  // ═══════════════════════════════════════════════════════════
  // D1.5 — PROCESSO (movimento contínuo sem destino)
  // ═══════════════════════════════════════════════════════════
  'correr':    { type: 'motion', subtype: 'D1.5', traits: ['+agentive', '+durative', '-telic'], roles: ['agent', 'manner'], class: 'running' },
  'caminhar':  { type: 'motion', subtype: 'D1.5', traits: ['+agentive', '+durative', '-telic'], roles: ['agent', 'manner'], class: 'walking' },
  'andar':     { type: 'motion', subtype: 'D1.5', traits: ['+agentive', '+durative', '-telic'], roles: ['agent', 'manner'], class: 'walking' },
  'nadar':     { type: 'motion', subtype: 'D1.5', traits: ['+agentive', '+durative', '-telic'], roles: ['agent', 'manner'], class: 'swimming' },

  // ═══════════════════════════════════════════════════════════
  // D1.2 — AÇÃO FÍSICA (manipulação)
  // ═══════════════════════════════════════════════════════════
  'abrir':     { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'fechar':    { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'pegar':     { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'soltar':    { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'colocar':   { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme', 'location'] },
  'tirar':     { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme', 'origin'] },
  'sentar':    { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'destination'] },
  'deitar':    { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'destination'] },
  'levantar':  { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'girar':     { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+iterative'], roles: ['agent', 'theme'] },
  'empurrar':  { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'puxar':     { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'bater':     { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+iterative'], roles: ['agent', 'target'] },
  'tocar':     { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'target'] },
  'segurar':   { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+durative', '-telic'], roles: ['agent', 'theme'] },
  'carregar':  { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+durative', '-telic'], roles: ['agent', 'theme'] },
  'jogar':     { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme', 'destination'] },
  'arremessar':{ type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme', 'destination'] },
  'escrever':  { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+durative'], roles: ['agent', 'theme'] },
  'ler':       { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+durative'], roles: ['agent', 'theme'] },
  'desenhar':  { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+durative'], roles: ['agent', 'theme'] },
  'pintar':    { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+durative'], roles: ['agent', 'theme'] },
  'esculpir':  { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+durative'], roles: ['agent', 'theme'] },
  'cantar':    { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+durative'], roles: ['agent', 'theme'] },
  'dançar':    { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+durative', '-telic', '+iterative'], roles: ['agent'] },
  'assobiar':  { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+durative'], roles: ['agent'] },
  'aplaudir':  { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+iterative'], roles: ['agent'] },
  'cortar':    { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'rasgar':    { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'furar':     { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'perfurar':  { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'acender':   { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'apagar':    { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'queimar':   { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'cozinhar':  { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+durative'], roles: ['agent', 'theme'] },
  'assar':     { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+durative'], roles: ['agent', 'theme'] },
  'ferver':    { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+durative'], roles: ['agent', 'theme'] },
  'servir':    { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+social'], roles: ['agent', 'theme', 'recipient'] },
  'encher':    { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'esvaziar':  { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'lavar':     { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+iterative'], roles: ['agent', 'theme'] },
  'limpar':    { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+iterative'], roles: ['agent', 'theme'] },
  'varrer':    { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+iterative'], roles: ['agent', 'theme'] },
  'esfregar':  { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+iterative'], roles: ['agent', 'theme'] },
  'costurar':  { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+iterative'], roles: ['agent', 'theme'] },
  'tecer':     { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+iterative'], roles: ['agent', 'theme'] },
  'bordar':    { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+iterative'], roles: ['agent', 'theme'] },
  'plantar':   { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme', 'location'] },
  'colher':    { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'regar':     { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+iterative'], roles: ['agent', 'theme'] },
  'podar':     { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'cavar':     { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+iterative'], roles: ['agent', 'theme'] },
  'martelar':  { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+iterative'], roles: ['agent', 'theme'] },
  'serrar':    { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+iterative'], roles: ['agent', 'theme'] },
  'lixar':     { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+iterative'], roles: ['agent', 'theme'] },
  'polir':     { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+iterative'], roles: ['agent', 'theme'] },
  'soldar':    { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'consertar': { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'reparar':   { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'montar':    { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'desmontar': { type: 'action', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },

  // ═══════════════════════════════════════════════════════════
  // D1.2 — COMBATE
  // ═══════════════════════════════════════════════════════════
  'golpear':   { type: 'combat', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+intensive'], roles: ['agent', 'target'] },
  'esfaquear': { type: 'combat', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+intensive'], roles: ['agent', 'target'] },
  'disparar':  { type: 'combat', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'target'] },
  'atirar':    { type: 'combat', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'target'] },
  'chutar':    { type: 'combat', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+intensive'], roles: ['agent', 'target'] },
  'socar':     { type: 'combat', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+intensive'], roles: ['agent', 'target'] },
  'ferir':     { type: 'combat', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'target'] },
  'matar':     { type: 'combat', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+intensive'], roles: ['agent', 'target'] },
  'derrotar':  { type: 'combat', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'target'] },
  'vencer':    { type: 'combat', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'target'] },
  'resistir':  { type: 'combat', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+durative', '-telic'], roles: ['agent', 'target'] },
  'atacar':    { type: 'combat', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+intensive'], roles: ['agent', 'target'] },
  'defender':  { type: 'combat', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+durative'], roles: ['agent', 'target'] },
  'bloquear':  { type: 'combat', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'target'] },
  'sacar':     { type: 'combat', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },

  // ═══════════════════════════════════════════════════════════
  // D1.2 — AÇÃO SOCIAL
  // ═══════════════════════════════════════════════════════════
  'abraçar':   { type: 'social', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+social'], roles: ['agent', 'target'] },
  'beijar':    { type: 'social', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+social'], roles: ['agent', 'target'] },
  'acariciar': { type: 'social', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+social', '+durative'], roles: ['agent', 'target'] },
  'ajudar':    { type: 'social', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+social', '+telic'], roles: ['agent', 'recipient'] },
  'trair':     { type: 'social', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+social', '+telic'], roles: ['agent', 'target'] },
  'proteger':  { type: 'social', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+social', '+durative'], roles: ['agent', 'target'] },
  'ameaçar':   { type: 'social', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+social', '+telic'], roles: ['agent', 'target'] },
  'escoltar':  { type: 'social', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+social', '+durative'], roles: ['agent', 'target'] },
  'ignorar':   { type: 'social', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+social', '-telic'], roles: ['agent', 'target'] },
  'desafiar':  { type: 'social', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+social', '+telic'], roles: ['agent', 'target'] },
  'encontrar': { type: 'social', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+social', '+telic'], roles: ['agent', 'target'] },

  // ═══════════════════════════════════════════════════════════
  // D1.2 — TRANSFERÊNCIA
  // ═══════════════════════════════════════════════════════════
  'dar':       { type: 'transfer', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'recipient', 'theme'] },
  'receber':   { type: 'transfer', subtype: 'D1.2', traits: ['+agentive', '+telic'], roles: ['recipient', 'source', 'theme'] },
  'entregar':  { type: 'transfer', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'recipient', 'theme'] },
  'enviar':    { type: 'transfer', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'recipient', 'theme'] },
  'trazer':    { type: 'transfer', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'recipient', 'theme'] },
  'levar':     { type: 'transfer', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'recipient', 'theme'] },
  'roubar':    { type: 'transfer', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'source', 'theme'] },
  'comprar':   { type: 'transfer', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'source', 'theme'] },
  'vender':    { type: 'transfer', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'recipient', 'theme'] },
  'oferecer':  { type: 'transfer', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'recipient', 'theme'] },
  'presentear':{ type: 'transfer', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+social'], roles: ['agent', 'recipient', 'theme'] },
  'doar':      { type: 'transfer', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'recipient', 'theme'] },
  'emprestar': { type: 'transfer', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'recipient', 'theme'] },
  'devolver':  { type: 'transfer', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'recipient', 'theme'] },
  'confiscar': { type: 'transfer', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'source', 'theme'] },
  'tomar':     { type: 'transfer', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'source', 'theme'] },
  'trocar':    { type: 'transfer', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'source', 'theme'] },
  'pagar':     { type: 'transfer', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'recipient', 'theme'] },
  'cobrar':    { type: 'transfer', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'recipient', 'theme'] },

  // ═══════════════════════════════════════════════════════════
  // D1.2 — CRIAÇÃO
  // ═══════════════════════════════════════════════════════════
  'criar':     { type: 'creation', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'construir': { type: 'creation', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+durative'], roles: ['agent', 'theme'] },
  'forjar':    { type: 'creation', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'fabricar':  { type: 'creation', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'produzir':  { type: 'creation', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+durative'], roles: ['agent', 'theme'] },
  'gerar':     { type: 'creation', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'inventar':  { type: 'creation', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+cognitive'], roles: ['agent', 'theme'] },
  'descobrir': { type: 'creation', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+cognitive'], roles: ['agent', 'theme'] },
  'fundar':    { type: 'creation', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'erguer':    { type: 'creation', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'compor':    { type: 'creation', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+durative'], roles: ['agent', 'theme'] },
  'redigir':   { type: 'creation', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+durative'], roles: ['agent', 'theme'] },
  'elaborar':  { type: 'creation', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },

  // ═══════════════════════════════════════════════════════════
  // D1.2 — DESTRUIÇÃO
  // ═══════════════════════════════════════════════════════════
  'destruir':  { type: 'destruction', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+intensive'], roles: ['agent', 'theme'] },
  'arruinar':  { type: 'destruction', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+intensive'], roles: ['agent', 'theme'] },
  'devastar':  { type: 'destruction', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+intensive'], roles: ['agent', 'theme'] },
  'aniquilar': { type: 'destruction', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+intensive'], roles: ['agent', 'theme'] },
  'exterminar':{ type: 'destruction', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+intensive'], roles: ['agent', 'theme'] },
  'eliminar':  { type: 'destruction', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'assassinar':{ type: 'destruction', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+intensive'], roles: ['agent', 'target'] },
  'incendiar': { type: 'destruction', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'explodir':  { type: 'destruction', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+intensive'], roles: ['agent', 'theme'] },
  'demolir':   { type: 'destruction', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'derrubar':  { type: 'destruction', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },
  'arrasar':   { type: 'destruction', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+intensive'], roles: ['agent', 'theme'] },
  'devorar':   { type: 'destruction', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+intensive'], roles: ['agent', 'theme'] },
  'consumir':  { type: 'destruction', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic', '+durative'], roles: ['agent', 'theme'] },
  'quebrar':   { type: 'destruction', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+telic'], roles: ['agent', 'theme'] },

  // ═══════════════════════════════════════════════════════════
  // D1.2 — ATO DE FALA (performativo)
  // ═══════════════════════════════════════════════════════════
  'batizar':   { type: 'ritual', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+social'], roles: ['agent', 'target', 'theme'] },
  'nomear':    { type: 'ritual', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+social'], roles: ['agent', 'target', 'theme'] },
  'consagrar': { type: 'ritual', subtype: 'D1.2', traits: ['+agentive', '+volitive', '+social'], roles: ['agent', 'theme'] },

  // ═══════════════════════════════════════════════════════════
  // D5.1 — ASSERTIVO
  // ═══════════════════════════════════════════════════════════
  'dizer':     { type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim'], roles: ['agent', 'recipient', 'theme'] },
  'falar':     { type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim'], roles: ['agent', 'recipient'] },
  'contar':    { type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim'], roles: ['agent', 'recipient', 'theme'] },
  'responder': { type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim'], roles: ['agent', 'recipient', 'theme'] },
  'declarar':  { type: 'communicative', subtype: 'D5.6', traits: ['+world-changing'], roles: ['agent', 'theme'] },
  'anunciar':  { type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim'], roles: ['agent', 'theme'] },
  'revelar':   { type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim'], roles: ['agent', 'recipient', 'theme'] },
  'confessar': { type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim'], roles: ['agent', 'recipient', 'theme'] },
  'admitir':   { type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim'], roles: ['agent', 'theme'] },
  'negar':     { type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim'], roles: ['agent', 'theme'] },
  'confirmar': { type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim'], roles: ['agent', 'theme'] },
  'repetir':   { type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim', '+iterative'], roles: ['agent', 'theme'] },
  'explicar':  { type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim'], roles: ['agent', 'recipient', 'theme'] },
  'esclarecer':{ type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim'], roles: ['agent', 'theme'] },
  'sugerir':   { type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim'], roles: ['agent', 'recipient', 'theme'] },
  'propor':    { type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim'], roles: ['agent', 'recipient', 'theme'] },
  'aconselhar':{ type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim'], roles: ['agent', 'recipient', 'theme'] },
  'advertir':  { type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim'], roles: ['agent', 'recipient', 'theme'] },
  'avisar':    { type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim'], roles: ['agent', 'recipient', 'theme'] },
  'alertar':   { type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim'], roles: ['agent', 'recipient', 'theme'] },
  'mencionar': { type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim'], roles: ['agent', 'theme'] },
  'comentar':  { type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim'], roles: ['agent', 'theme'] },
  'relatar':   { type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim'], roles: ['agent', 'theme'] },
  'informar':  { type: 'communicative', subtype: 'D5.1', traits: ['+truth-claim'], roles: ['agent', 'recipient', 'theme'] },

  // ═══════════════════════════════════════════════════════════
  // D5.2 — INTERROGATIVO
  // ═══════════════════════════════════════════════════════════
  'perguntar': { type: 'communicative', subtype: 'D5.2', traits: ['+information-seeking'], roles: ['agent', 'recipient', 'theme'] },
  'indagar':   { type: 'communicative', subtype: 'D5.2', traits: ['+information-seeking'], roles: ['agent', 'recipient', 'theme'] },
  'questionar':{ type: 'communicative', subtype: 'D5.2', traits: ['+information-seeking'], roles: ['agent', 'theme'] },
  'inquirir':  { type: 'communicative', subtype: 'D5.2', traits: ['+information-seeking'], roles: ['agent', 'recipient', 'theme'] },

  // ═══════════════════════════════════════════════════════════
  // D5.3 — DIRETIVO
  // ═══════════════════════════════════════════════════════════
  'ordenar':   { type: 'communicative', subtype: 'D5.3', traits: ['+action-oriented'], roles: ['agent', 'recipient', 'theme'] },
  'exigir':    { type: 'communicative', subtype: 'D5.3', traits: ['+action-oriented'], roles: ['agent', 'recipient', 'theme'] },
  'pedir':     { type: 'communicative', subtype: 'D5.3', traits: ['+action-oriented'], roles: ['agent', 'recipient', 'theme'] },
  'suplicar':  { type: 'communicative', subtype: 'D5.3', traits: ['+action-oriented', '+affective'], roles: ['agent', 'recipient', 'theme'] },
  'implorar':  { type: 'communicative', subtype: 'D5.3', traits: ['+action-oriented', '+affective'], roles: ['agent', 'recipient', 'theme'] },
  'rogar':     { type: 'communicative', subtype: 'D5.3', traits: ['+action-oriented', '+affective'], roles: ['agent', 'recipient', 'theme'] },
  'requerer':  { type: 'communicative', subtype: 'D5.3', traits: ['+action-oriented'], roles: ['agent', 'recipient', 'theme'] },
  'proibir':   { type: 'communicative', subtype: 'D5.3', traits: ['+action-oriented'], roles: ['agent', 'recipient', 'theme'] },
  'autorizar': { type: 'communicative', subtype: 'D5.3', traits: ['+action-oriented'], roles: ['agent', 'recipient', 'theme'] },
  'convidar':  { type: 'communicative', subtype: 'D5.3', traits: ['+action-oriented', '+social'], roles: ['agent', 'recipient', 'theme'] },

  // ═══════════════════════════════════════════════════════════
  // D5.4 — COMISSIVO
  // ═══════════════════════════════════════════════════════════
  'prometer':  { type: 'communicative', subtype: 'D5.4', traits: ['+future-commitment'], roles: ['agent', 'recipient', 'theme'] },
  'jurar':     { type: 'communicative', subtype: 'D5.4', traits: ['+future-commitment'], roles: ['agent', 'theme'] },
  'comprometer':{ type: 'communicative', subtype: 'D5.4', traits: ['+future-commitment'], roles: ['agent', 'theme'] },
  'votar':     { type: 'communicative', subtype: 'D5.4', traits: ['+future-commitment'], roles: ['agent', 'theme'] },

  // ═══════════════════════════════════════════════════════════
  // D5.5 — EXPRESSIVO
  // ═══════════════════════════════════════════════════════════
  'gritar':    { type: 'communicative', subtype: 'D5.5', traits: ['+affective', '+intensive'], roles: ['agent', 'theme'] },
  'berrar':    { type: 'communicative', subtype: 'D5.5', traits: ['+affective', '+intensive'], roles: ['agent', 'theme'] },
  'sussurrar': { type: 'communicative', subtype: 'D5.5', traits: ['+affective'], roles: ['agent', 'recipient', 'theme'] },
  'murmurar':  { type: 'communicative', subtype: 'D5.5', traits: ['+affective'], roles: ['agent', 'theme'] },
  'resmungar': { type: 'communicative', subtype: 'D5.5', traits: ['+affective'], roles: ['agent', 'theme'] },
  'gemer':     { type: 'communicative', subtype: 'D5.5', traits: ['+affective'], roles: ['agent'] },
  'suspirar':  { type: 'communicative', subtype: 'D5.5', traits: ['+affective'], roles: ['agent'] },
  'soluçar':   { type: 'communicative', subtype: 'D5.5', traits: ['+affective'], roles: ['agent'] },
  'chorar':    { type: 'communicative', subtype: 'D5.5', traits: ['+affective'], roles: ['agent'] },
  'rir':       { type: 'communicative', subtype: 'D5.5', traits: ['+affective'], roles: ['agent'] },
  'gargalhar': { type: 'communicative', subtype: 'D5.5', traits: ['+affective', '+intensive'], roles: ['agent'] },
  'sorrir':    { type: 'communicative', subtype: 'D5.5', traits: ['+affective'], roles: ['agent'] },
  'rugir':     { type: 'communicative', subtype: 'D5.5', traits: ['+affective', '+intensive'], roles: ['agent', 'theme'] },
  'rosnar':    { type: 'communicative', subtype: 'D5.5', traits: ['+affective'], roles: ['agent', 'theme'] },

  // ═══════════════════════════════════════════════════════════
  // D5.6 — DECLARATIVO
  // ═══════════════════════════════════════════════════════════
  'proclamar': { type: 'communicative', subtype: 'D5.6', traits: ['+world-changing'], roles: ['agent', 'theme'] },
  'decretar':  { type: 'communicative', subtype: 'D5.6', traits: ['+world-changing'], roles: ['agent', 'theme'] },
  'condenar':  { type: 'communicative', subtype: 'D5.6', traits: ['+world-changing'], roles: ['agent', 'target', 'theme'] },
  'absolver':  { type: 'communicative', subtype: 'D5.6', traits: ['+world-changing'], roles: ['agent', 'target'] },
  'abençoar':  { type: 'communicative', subtype: 'D5.6', traits: ['+world-changing'], roles: ['agent', 'target'] },
  'amaldiçoar':{ type: 'communicative', subtype: 'D5.6', traits: ['+world-changing'], roles: ['agent', 'target'] },
  'excomungar':{ type: 'communicative', subtype: 'D5.6', traits: ['+world-changing'], roles: ['agent', 'target'] },
  'coroar':    { type: 'communicative', subtype: 'D5.6', traits: ['+world-changing', '+social'], roles: ['agent', 'target'] },

  // ═══════════════════════════════════════════════════════════
  // D5.7 — FÁTICO
  // ═══════════════════════════════════════════════════════════
  'cumprimentar':{ type: 'communicative', subtype: 'D5.7', traits: ['+channel-oriented', '+social'], roles: ['agent', 'recipient'] },
  'saudar':      { type: 'communicative', subtype: 'D5.7', traits: ['+channel-oriented', '+social'], roles: ['agent', 'recipient'] },
  'despedir':    { type: 'communicative', subtype: 'D5.7', traits: ['+channel-oriented', '+social'], roles: ['agent', 'recipient'] },
  'agradecer':   { type: 'communicative', subtype: 'D5.5', traits: ['+affective', '+social'], roles: ['agent', 'recipient'] },
  'desculpar':   { type: 'communicative', subtype: 'D5.5', traits: ['+affective', '+social'], roles: ['agent', 'recipient', 'theme'] },

  // ═══════════════════════════════════════════════════════════
  // D4.1 — PERCEPÇÃO
  // ═══════════════════════════════════════════════════════════
  'ver':       { type: 'perception', subtype: 'D4.1', traits: ['+perceptive'], roles: ['experiencer', 'target'], class: 'visual' },
  'olhar':     { type: 'perception', subtype: 'D4.1', traits: ['+perceptive', '+durative'], roles: ['experiencer', 'target'], class: 'visual' },
  'observar':  { type: 'perception', subtype: 'D4.1', traits: ['+perceptive', '+durative'], roles: ['experiencer', 'target'], class: 'visual' },
  'ouvir':     { type: 'perception', subtype: 'D4.1', traits: ['+perceptive'], roles: ['experiencer', 'target'], class: 'auditory' },
  'escutar':   { type: 'perception', subtype: 'D4.1', traits: ['+perceptive', '+durative'], roles: ['experiencer', 'target'], class: 'auditory' },
  'vislumbrar':{ type: 'perception', subtype: 'D4.1', traits: ['+perceptive', '+punctual'], roles: ['experiencer', 'target'], class: 'visual' },
  'enxergar':  { type: 'perception', subtype: 'D4.1', traits: ['+perceptive'], roles: ['experiencer', 'target'], class: 'visual' },
  'fitar':     { type: 'perception', subtype: 'D4.1', traits: ['+perceptive', '+durative'], roles: ['experiencer', 'target'], class: 'visual' },
  'encarar':   { type: 'perception', subtype: 'D4.1', traits: ['+perceptive', '+durative'], roles: ['experiencer', 'target'], class: 'visual' },
  'avistar':   { type: 'perception', subtype: 'D4.1', traits: ['+perceptive', '+punctual'], roles: ['experiencer', 'target'], class: 'visual' },
  'flagrar':   { type: 'perception', subtype: 'D4.1', traits: ['+perceptive', '+punctual'], roles: ['experiencer', 'target'], class: 'visual' },
  'surpreender':{ type: 'perception', subtype: 'D4.1', traits: ['+perceptive', '+punctual'], roles: ['experiencer', 'target'], class: 'visual' },
  'apalpar':   { type: 'perception', subtype: 'D4.1', traits: ['+perceptive', '+durative'], roles: ['experiencer', 'target'], class: 'tactile' },
  'tatear':    { type: 'perception', subtype: 'D4.1', traits: ['+perceptive', '+durative'], roles: ['experiencer', 'target'], class: 'tactile' },
  'cheirar':   { type: 'perception', subtype: 'D4.1', traits: ['+perceptive'], roles: ['experiencer', 'target'], class: 'olfactory' },
  'farejar':   { type: 'perception', subtype: 'D4.1', traits: ['+perceptive', '+durative'], roles: ['experiencer', 'target'], class: 'olfactory' },
  'saborear':  { type: 'perception', subtype: 'D4.1', traits: ['+perceptive', '+durative'], roles: ['experiencer', 'target'], class: 'gustatory' },
  'provar':    { type: 'perception', subtype: 'D4.1', traits: ['+perceptive'], roles: ['experiencer', 'target'], class: 'gustatory' },
  'degustar':  { type: 'perception', subtype: 'D4.1', traits: ['+perceptive', '+durative'], roles: ['experiencer', 'target'], class: 'gustatory' },

  // ═══════════════════════════════════════════════════════════
  // D4.1 — EXPERIENCIAL (com variantes)
  // ═══════════════════════════════════════════════════════════
  'sentir': {
    type: 'experiential',
    subtype: 'D4.1',
    traits: ['+perceptive'],
    roles: ['experiencer', 'target'],
    variants: [
      { objectTypes: ['emotion'],   subtype: 'D4.6' },
      { objectTypes: ['sensation'], subtype: 'D4.1' },
      { objectTypes: ['body-part'], subtype: 'D4.1' },
      { objectTypes: ['object'],    subtype: 'D4.1' },
    ],
  },
  'perceber': { type: 'experiential', subtype: 'D4.1', traits: ['+perceptive'], roles: ['experiencer', 'target'] },
  'notar':    { type: 'experiential', subtype: 'D4.1', traits: ['+perceptive'], roles: ['experiencer', 'target'] },

  // ═══════════════════════════════════════════════════════════
  // D4.2 — COGNIÇÃO (pensar)
  // ═══════════════════════════════════════════════════════════
  'pensar':    { type: 'cognitive', subtype: 'D4.2', traits: ['+cognitive'], roles: ['experiencer', 'theme'] },
  'refletir':  { type: 'cognitive', subtype: 'D4.2', traits: ['+cognitive', '+durative'], roles: ['experiencer', 'theme'] },
  'cogitar':   { type: 'cognitive', subtype: 'D4.2', traits: ['+cognitive'], roles: ['experiencer', 'theme'] },
  'ponderar':  { type: 'cognitive', subtype: 'D4.2', traits: ['+cognitive', '+durative'], roles: ['experiencer', 'theme'] },
  'meditar':   { type: 'cognitive', subtype: 'D4.2', traits: ['+cognitive', '+durative'], roles: ['experiencer', 'theme'] },
  'contemplar':{ type: 'cognitive', subtype: 'D4.2', traits: ['+cognitive', '+durative'], roles: ['experiencer', 'theme'] },
  'considerar':{ type: 'cognitive', subtype: 'D4.2', traits: ['+cognitive'], roles: ['experiencer', 'theme'] },
  'analisar':  { type: 'cognitive', subtype: 'D4.2', traits: ['+cognitive', '+durative'], roles: ['experiencer', 'theme'] },
  'avaliar':   { type: 'cognitive', subtype: 'D4.2', traits: ['+cognitive'], roles: ['experiencer', 'theme'] },
  'deduzir':   { type: 'cognitive', subtype: 'D4.2', traits: ['+cognitive'], roles: ['experiencer', 'theme'] },
  'inferir':   { type: 'cognitive', subtype: 'D4.2', traits: ['+cognitive'], roles: ['experiencer', 'theme'] },
  'concluir':  { type: 'cognitive', subtype: 'D4.2', traits: ['+cognitive'], roles: ['experiencer', 'theme'] },
  'entender':  { type: 'cognitive', subtype: 'D4.2', traits: ['+cognitive'], roles: ['experiencer', 'theme'] },
  'compreender':{ type: 'cognitive', subtype: 'D4.2', traits: ['+cognitive'], roles: ['experiencer', 'theme'] },

  // ═══════════════════════════════════════════════════════════
  // D4.3 — CRENÇA / DÚVIDA
  // ═══════════════════════════════════════════════════════════
  'saber':     { type: 'cognitive', subtype: 'D4.3', traits: ['+cognitive', '+belief'], roles: ['experiencer', 'theme'] },
  'conhecer':  { type: 'cognitive', subtype: 'D4.3', traits: ['+cognitive', '+belief'], roles: ['experiencer', 'theme'] },
  'achar':     { type: 'cognitive', subtype: 'D4.3', traits: ['+cognitive', '+belief'], roles: ['experiencer', 'theme'] },
  'acreditar': { type: 'cognitive', subtype: 'D4.3', traits: ['+cognitive', '+belief'], roles: ['experiencer', 'theme'] },
  'crer':      { type: 'cognitive', subtype: 'D4.3', traits: ['+cognitive', '+belief'], roles: ['experiencer', 'theme'] },
  'duvidar':   { type: 'cognitive', subtype: 'D4.3', traits: ['+cognitive', '+doubt'], roles: ['experiencer', 'theme'] },
  'julgar':    { type: 'cognitive', subtype: 'D4.3', traits: ['+cognitive', '+belief'], roles: ['experiencer', 'theme'] },
  'supor':     { type: 'cognitive', subtype: 'D4.3', traits: ['+cognitive', '+belief'], roles: ['experiencer', 'theme'] },
  'presumir':  { type: 'cognitive', subtype: 'D4.3', traits: ['+cognitive', '+belief'], roles: ['experiencer', 'theme'] },
  'suspeitar': { type: 'cognitive', subtype: 'D4.3', traits: ['+cognitive', '+doubt'], roles: ['experiencer', 'theme'] },
  'desconfiar':{ type: 'cognitive', subtype: 'D4.3', traits: ['+cognitive', '+doubt'], roles: ['experiencer', 'theme'] },

  // ═══════════════════════════════════════════════════════════
  // D4.4 — MEMÓRIA
  // ═══════════════════════════════════════════════════════════
  'lembrar':   { type: 'cognitive', subtype: 'D4.4', traits: ['+cognitive', '+memory'], roles: ['experiencer', 'theme'] },
  'recordar':  { type: 'cognitive', subtype: 'D4.4', traits: ['+cognitive', '+memory'], roles: ['experiencer', 'theme'] },
  'relembrar': { type: 'cognitive', subtype: 'D4.4', traits: ['+cognitive', '+memory'], roles: ['experiencer', 'theme'] },
  'esquecer':  { type: 'cognitive', subtype: 'D4.4', traits: ['+cognitive', '+memory'], roles: ['experiencer', 'theme'] },

  // ═══════════════════════════════════════════════════════════
  // D4.5 — IMAGINAÇÃO
  // ═══════════════════════════════════════════════════════════
  'imaginar':  { type: 'cognitive', subtype: 'D4.5', traits: ['+cognitive', '+imagination'], roles: ['experiencer', 'theme'] },
  'fantasiar': { type: 'cognitive', subtype: 'D4.5', traits: ['+cognitive', '+imagination'], roles: ['experiencer', 'theme'] },
  'sonhar':    { type: 'cognitive', subtype: 'D4.5', traits: ['+cognitive', '+imagination'], roles: ['experiencer', 'theme'] },
  'visualizar':{ type: 'cognitive', subtype: 'D4.5', traits: ['+cognitive', '+imagination'], roles: ['experiencer', 'theme'] },

  // ═══════════════════════════════════════════════════════════
  // D4.6 — EMOÇÃO
  // ═══════════════════════════════════════════════════════════
  'amar':      { type: 'emotion', subtype: 'D4.6', traits: ['+affective'], roles: ['experiencer', 'target'], class: 'affection' },
  'odiar':     { type: 'emotion', subtype: 'D4.6', traits: ['+affective', '+intensive'], roles: ['experiencer', 'target'], class: 'hostility' },
  'temer':     { type: 'emotion', subtype: 'D4.6', traits: ['+affective'], roles: ['experiencer', 'target'], class: 'fear' },
  'gostar':    { type: 'emotion', subtype: 'D4.6', traits: ['+affective'], roles: ['experiencer', 'target'], class: 'affection' },
  'adorar':    { type: 'emotion', subtype: 'D4.6', traits: ['+affective'], roles: ['experiencer', 'target'], class: 'affection' },
  'detestar':  { type: 'emotion', subtype: 'D4.6', traits: ['+affective'], roles: ['experiencer', 'target'], class: 'hostility' },
  'abominar':  { type: 'emotion', subtype: 'D4.6', traits: ['+affective', '+intensive'], roles: ['experiencer', 'target'], class: 'hostility' },
  'desprezar': { type: 'emotion', subtype: 'D4.6', traits: ['+affective'], roles: ['experiencer', 'target'], class: 'hostility' },
  'invejar':   { type: 'emotion', subtype: 'D4.6', traits: ['+affective'], roles: ['experiencer', 'target'], class: 'envy' },
  'admirar':   { type: 'emotion', subtype: 'D4.6', traits: ['+affective'], roles: ['experiencer', 'target'], class: 'admiration' },
  'respeitar': { type: 'emotion', subtype: 'D4.6', traits: ['+affective'], roles: ['experiencer', 'target'], class: 'respect' },
  'honrar':    { type: 'emotion', subtype: 'D4.6', traits: ['+affective'], roles: ['experiencer', 'target'], class: 'respect' },
  'confiar':   { type: 'emotion', subtype: 'D4.6', traits: ['+affective'], roles: ['experiencer', 'target'], class: 'trust' },
  'sofrer':    { type: 'emotion', subtype: 'D4.6', traits: ['+affective', '+durative'], roles: ['experiencer'], class: 'suffering' },
  'alegrar':   { type: 'emotion', subtype: 'D4.6', traits: ['+affective'], roles: ['experiencer'], class: 'joy' },
  'entristecer':{ type: 'emotion', subtype: 'D4.6', traits: ['+affective'], roles: ['experiencer'], class: 'sadness' },
  'irritar':   { type: 'emotion', subtype: 'D4.6', traits: ['+affective'], roles: ['experiencer'], class: 'anger' },
  'enfurecer': { type: 'emotion', subtype: 'D4.6', traits: ['+affective', '+intensive'], roles: ['experiencer'], class: 'anger' },
  'horrorizar':{ type: 'emotion', subtype: 'D4.6', traits: ['+affective', '+intensive'], roles: ['experiencer'], class: 'horror' },
  'assustar':  { type: 'emotion', subtype: 'D4.6', traits: ['+affective'], roles: ['experiencer'], class: 'fear' },
  'consolar':  { type: 'emotion', subtype: 'D4.6', traits: ['+affective', '+social'], roles: ['agent', 'target'], class: 'consolation' },

  // ═══════════════════════════════════════════════════════════
  // D4.7 — DESEJO
  // ═══════════════════════════════════════════════════════════
  'querer':    { type: 'emotion', subtype: 'D4.7', traits: ['+affective'], roles: ['experiencer', 'theme'], class: 'desire' },
  'desejar':   { type: 'emotion', subtype: 'D4.7', traits: ['+affective'], roles: ['experiencer', 'theme'], class: 'desire' },
  'ansiar':    { type: 'emotion', subtype: 'D4.7', traits: ['+affective', '+intensive'], roles: ['experiencer', 'theme'], class: 'desire' },
  'almejar':   { type: 'emotion', subtype: 'D4.7', traits: ['+affective'], roles: ['experiencer', 'theme'], class: 'desire' },
  'cobiçar':   { type: 'emotion', subtype: 'D4.7', traits: ['+affective'], roles: ['experiencer', 'target'], class: 'envy' },

  // ═══════════════════════════════════════════════════════════
  // D4.8 — INTENÇÃO
  // ═══════════════════════════════════════════════════════════
  'pretender': { type: 'cognitive', subtype: 'D4.8', traits: ['+volitive', '+cognitive'], roles: ['experiencer', 'theme'] },
  'tencionar': { type: 'cognitive', subtype: 'D4.8', traits: ['+volitive', '+cognitive'], roles: ['experiencer', 'theme'] },
  'intencionar':{ type: 'cognitive', subtype: 'D4.8', traits: ['+volitive', '+cognitive'], roles: ['experiencer', 'theme'] },

  // ═══════════════════════════════════════════════════════════
  // D4.9 — DECISÃO
  // ═══════════════════════════════════════════════════════════
  'decidir':   { type: 'cognitive', subtype: 'D4.9', traits: ['+volitive', '+cognitive'], roles: ['experiencer', 'theme'] },

  // ═══════════════════════════════════════════════════════════
  // D4.10 — PLANEJAMENTO
  // ═══════════════════════════════════════════════════════════
  'planejar':  { type: 'cognitive', subtype: 'D4.10', traits: ['+volitive', '+cognitive', '+durative'], roles: ['experiencer', 'theme'] },
  'arquitetar':{ type: 'cognitive', subtype: 'D4.10', traits: ['+volitive', '+cognitive'], roles: ['experiencer', 'theme'] },
  'projetar':  { type: 'cognitive', subtype: 'D4.10', traits: ['+volitive', '+cognitive'], roles: ['experiencer', 'theme'] },

  // ═══════════════════════════════════════════════════════════
  // D1.3 — ESTADO
  // ═══════════════════════════════════════════════════════════
  'ser':       { type: 'state', subtype: 'D1.3', traits: ['+stative', '-telic'], roles: ['theme', 'target'] },
  'estar':     { type: 'state', subtype: 'D1.3', traits: ['+stative', '-telic'], roles: ['theme', 'target'] },
  'ficar':     { type: 'state', subtype: 'D1.3', traits: ['+stative', '-telic'], roles: ['theme', 'target'] },
  'permanecer':{ type: 'state', subtype: 'D1.3', traits: ['+stative', '-telic', '+durative'], roles: ['theme', 'target'] },
  'parecer':   { type: 'state', subtype: 'D1.3', traits: ['+stative', '-telic'], roles: ['theme', 'target'] },
  'tornar':    { type: 'state', subtype: 'D1.4', traits: ['+change', '+telic'], roles: ['theme', 'target'] },
  'virar':     { type: 'state', subtype: 'D1.4', traits: ['+change', '+telic'], roles: ['theme', 'target'] },
  'continuar': { type: 'state', subtype: 'D1.5', traits: ['+durative', '-telic'], roles: ['theme', 'target'] },
  'manter':    { type: 'state', subtype: 'D1.5', traits: ['+durative', '-telic'], roles: ['theme', 'target'] },
  'conservar': { type: 'state', subtype: 'D1.5', traits: ['+durative', '-telic'], roles: ['theme', 'target'] },
  'aparentar': { type: 'state', subtype: 'D1.3', traits: ['+stative', '-telic'], roles: ['theme', 'target'] },
  'transformar':{ type: 'state', subtype: 'D1.4', traits: ['+change', '+telic'], roles: ['theme', 'target'] },
  'converter': { type: 'state', subtype: 'D1.4', traits: ['+change', '+telic'], roles: ['theme', 'target'] },
  'mudar':     { type: 'state', subtype: 'D1.4', traits: ['+change', '+telic'], roles: ['theme', 'target'] },
  'alterar':   { type: 'state', subtype: 'D1.4', traits: ['+change', '+telic'], roles: ['theme', 'target'] },
  'modificar': { type: 'state', subtype: 'D1.4', traits: ['+change', '+telic'], roles: ['theme', 'target'] },

  // ═══════════════════════════════════════════════════════════
  // D1.6 — CONDUTA FISIOLÓGICA
  // ═══════════════════════════════════════════════════════════
  'tremer':    { type: 'somatic', subtype: 'D1.6', traits: ['-volitive', '+observable'], roles: ['experiencer'] },
  'suar':      { type: 'somatic', subtype: 'D1.6', traits: ['-volitive', '+observable'], roles: ['experiencer'] },
  'engasgar':  { type: 'somatic', subtype: 'D1.6', traits: ['-volitive', '+observable'], roles: ['experiencer'] },
  'arrepiar':  { type: 'somatic', subtype: 'D1.6', traits: ['-volitive', '+observable'], roles: ['experiencer'] },
  'empalidecer':{ type: 'somatic', subtype: 'D1.6', traits: ['-volitive', '+observable'], roles: ['experiencer'] },
  'corar':     { type: 'somatic', subtype: 'D1.6', traits: ['-volitive', '+observable'], roles: ['experiencer'] },
  'desmaiar':  { type: 'somatic', subtype: 'D1.6', traits: ['-volitive', '+observable', '+punctual'], roles: ['experiencer'] },
  'tossir':    { type: 'somatic', subtype: 'D1.6', traits: ['-volitive', '+observable'], roles: ['experiencer'] },
  'espirrar':  { type: 'somatic', subtype: 'D1.6', traits: ['-volitive', '+observable'], roles: ['experiencer'] },
  'bocejar':   { type: 'somatic', subtype: 'D1.6', traits: ['-volitive', '+observable'], roles: ['experiencer'] },
  'adormecer': { type: 'somatic', subtype: 'D1.6', traits: ['-volitive', '+observable'], roles: ['experiencer'] },
  'acordar':   { type: 'somatic', subtype: 'D1.6', traits: ['-volitive', '+observable'], roles: ['experiencer'] },
  'adoecer':   { type: 'somatic', subtype: 'D1.6', traits: ['-volitive', '+observable'], roles: ['experiencer'] },
  'sarar':     { type: 'somatic', subtype: 'D1.6', traits: ['-volitive', '+observable'], roles: ['experiencer'] },
  'morrer':    { type: 'somatic', subtype: 'D1.6', traits: ['-volitive', '+observable', '+punctual'], roles: ['experiencer'] },
  'nascer':    { type: 'somatic', subtype: 'D1.6', traits: ['-volitive', '+observable', '+punctual'], roles: ['experiencer'] },

  // ═══════════════════════════════════════════════════════════
  // D1.7 — FENÔMENO ATMOSFÉRICO
  // ═══════════════════════════════════════════════════════════
  'chover':    { type: 'weather', subtype: 'D1.7', traits: ['-agentive', '+ambient', '+durative'], roles: [] },
  'nevar':     { type: 'weather', subtype: 'D1.7', traits: ['-agentive', '+ambient', '+durative'], roles: [] },
  'ventar':    { type: 'weather', subtype: 'D1.7', traits: ['-agentive', '+ambient', '+durative'], roles: [] },
  'trovejar':  { type: 'weather', subtype: 'D1.7', traits: ['-agentive', '+ambient', '+punctual'], roles: [] },
  'relampejar':{ type: 'weather', subtype: 'D1.7', traits: ['-agentive', '+ambient', '+punctual'], roles: [] },
  'gear':      { type: 'weather', subtype: 'D1.7', traits: ['-agentive', '+ambient', '+durative'], roles: [] },

  // ═══════════════════════════════════════════════════════════
  // SUBSTANTIVOS — PESSOA
  // ═══════════════════════════════════════════════════════════
  'homem':     { type: 'noun', class: 'person', gender: 'masculine' },
  'mulher':    { type: 'noun', class: 'person', gender: 'feminine' },
  'garoto':    { type: 'noun', class: 'person', gender: 'masculine' },
  'garota':    { type: 'noun', class: 'person', gender: 'feminine' },
  'menino':    { type: 'noun', class: 'person', gender: 'masculine' },
  'menina':    { type: 'noun', class: 'person', gender: 'feminine' },
  'senhor':    { type: 'noun', class: 'person', gender: 'masculine' },
  'senhora':   { type: 'noun', class: 'person', gender: 'feminine' },
  'criança':   { type: 'noun', class: 'person' },
  'guerreiro': { type: 'noun', class: 'person', gender: 'masculine', role: 'warrior' },
  'guerreira': { type: 'noun', class: 'person', gender: 'feminine',  role: 'warrior' },
  'rainha':    { type: 'noun', class: 'person', gender: 'feminine',  role: 'ruler' },
  'rei':       { type: 'noun', class: 'person', gender: 'masculine', role: 'ruler' },
  'príncipe':  { type: 'noun', class: 'person', gender: 'masculine', role: 'ruler' },
  'princesa':  { type: 'noun', class: 'person', gender: 'feminine',  role: 'ruler' },
  'mago':      { type: 'noun', class: 'person', gender: 'masculine', role: 'mage' },
  'maga':      { type: 'noun', class: 'person', gender: 'feminine',  role: 'mage' },
  'feiticeiro':{ type: 'noun', class: 'person', gender: 'masculine', role: 'mage' },
  'feiticeira':{ type: 'noun', class: 'person', gender: 'feminine',  role: 'mage' },
  'sacerdote': { type: 'noun', class: 'person', gender: 'masculine', role: 'priest' },
  'sacerdotisa':{ type: 'noun', class: 'person', gender: 'feminine', role: 'priest' },
  'ladrão':    { type: 'noun', class: 'person', gender: 'masculine', role: 'thief' },
  'ladra':     { type: 'noun', class: 'person', gender: 'feminine',  role: 'thief' },
  'assassino': { type: 'noun', class: 'person', gender: 'masculine', role: 'assassin' },
  'mercenário':{ type: 'noun', class: 'person', gender: 'masculine', role: 'mercenary' },
  'amigo':     { type: 'noun', class: 'person', gender: 'masculine', relation: 'friend' },
  'amiga':     { type: 'noun', class: 'person', gender: 'feminine',  relation: 'friend' },
  'inimigo':   { type: 'noun', class: 'person', gender: 'masculine', relation: 'enemy' },
  'inimiga':   { type: 'noun', class: 'person', gender: 'feminine',  relation: 'enemy' },
  'irmão':     { type: 'noun', class: 'person', gender: 'masculine', relation: 'sibling' },
  'irmã':      { type: 'noun', class: 'person', gender: 'feminine',  relation: 'sibling' },
  'pai':       { type: 'noun', class: 'person', gender: 'masculine', relation: 'parent' },
  'mãe':       { type: 'noun', class: 'person', gender: 'feminine',  relation: 'parent' },
  'filho':     { type: 'noun', class: 'person', gender: 'masculine', relation: 'child' },
  'filha':     { type: 'noun', class: 'person', gender: 'feminine',  relation: 'child' },
  'avô':       { type: 'noun', class: 'person', gender: 'masculine', relation: 'grandparent' },
  'avó':       { type: 'noun', class: 'person', gender: 'feminine',  relation: 'grandparent' },
  'marido':    { type: 'noun', class: 'person', gender: 'masculine', relation: 'spouse' },
  'esposa':    { type: 'noun', class: 'person', gender: 'feminine',  relation: 'spouse' },

  // ═══════════════════════════════════════════════════════════
  // SUBSTANTIVOS — LUGAR
  // ═══════════════════════════════════════════════════════════
  'casa':      { type: 'noun', class: 'place', gender: 'feminine' },
  'sala':      { type: 'noun', class: 'place', gender: 'feminine' },
  'quarto':    { type: 'noun', class: 'place', gender: 'masculine' },
  'cozinha':   { type: 'noun', class: 'place', gender: 'feminine' },
  'banheiro':  { type: 'noun', class: 'place', gender: 'masculine' },
  'corredor':  { type: 'noun', class: 'place', gender: 'masculine' },
  'cidade':    { type: 'noun', class: 'place', gender: 'feminine' },
  'aldeia':    { type: 'noun', class: 'place', gender: 'feminine' },
  'vila':      { type: 'noun', class: 'place', gender: 'feminine' },
  'floresta':  { type: 'noun', class: 'place', gender: 'feminine' },
  'montanha':  { type: 'noun', class: 'place', gender: 'feminine' },
  'rio':       { type: 'noun', class: 'place', gender: 'masculine' },
  'mar':       { type: 'noun', class: 'place', gender: 'masculine' },
  'estrada':   { type: 'noun', class: 'place', gender: 'feminine' },
  'rua':       { type: 'noun', class: 'place', gender: 'feminine' },
  'praça':     { type: 'noun', class: 'place', gender: 'feminine' },
  'jardim':    { type: 'noun', class: 'place', gender: 'masculine' },
  'templo':    { type: 'noun', class: 'place', gender: 'masculine' },
  'igreja':    { type: 'noun', class: 'place', gender: 'feminine' },
  'torre':     { type: 'noun', class: 'place', gender: 'feminine' },
  'castelo':   { type: 'noun', class: 'place', gender: 'masculine' },
  'palácio':   { type: 'noun', class: 'place', gender: 'masculine' },
  'caverna':   { type: 'noun', class: 'place', gender: 'feminine' },
  'deserto':   { type: 'noun', class: 'place', gender: 'masculine' },
  'pântano':   { type: 'noun', class: 'place', gender: 'masculine' },
  'ilha':      { type: 'noun', class: 'place', gender: 'feminine' },
  'porto':     { type: 'noun', class: 'place', gender: 'masculine' },
  'taverna':   { type: 'noun', class: 'place', gender: 'feminine' },
  'mercado':   { type: 'noun', class: 'place', gender: 'masculine' },
  'biblioteca':{ type: 'noun', class: 'place', gender: 'feminine' },

  // ═══════════════════════════════════════════════════════════
  // SUBSTANTIVOS — OBJETO
  // ═══════════════════════════════════════════════════════════
  'porta':     { type: 'noun', class: 'object', gender: 'feminine', physical: true },
  'janela':    { type: 'noun', class: 'object', gender: 'feminine', physical: true },
  'mesa':      { type: 'noun', class: 'object', gender: 'feminine', physical: true },
  'cadeira':   { type: 'noun', class: 'object', gender: 'feminine', physical: true },
  'cama':      { type: 'noun', class: 'object', gender: 'feminine', physical: true },
  'livro':     { type: 'noun', class: 'object', gender: 'masculine', physical: true },
  'chave':     { type: 'noun', class: 'object', gender: 'feminine', physical: true },
  'tocha':     { type: 'noun', class: 'object', gender: 'feminine', physical: true },
  'lâmpada':   { type: 'noun', class: 'object', gender: 'feminine', physical: true },
  'espelho':   { type: 'noun', class: 'object', gender: 'masculine', physical: true },
  'papel':     { type: 'noun', class: 'object', gender: 'masculine' },
  'carta':     { type: 'noun', class: 'document', gender: 'feminine' },
  'mapa':      { type: 'noun', class: 'document', gender: 'masculine' },
  'documento': { type: 'noun', class: 'document', gender: 'masculine' },
  'diário':    { type: 'noun', class: 'document', gender: 'masculine' },
  'espada':    { type: 'noun', class: 'weapon', gender: 'feminine', physical: true },
  'arma':      { type: 'noun', class: 'weapon', gender: 'feminine', physical: true },
  'adaga':     { type: 'noun', class: 'weapon', gender: 'feminine', physical: true },
  'punhal':    { type: 'noun', class: 'weapon', gender: 'masculine', physical: true },
  'machado':   { type: 'noun', class: 'weapon', gender: 'masculine', physical: true },
  'lança':     { type: 'noun', class: 'weapon', gender: 'feminine', physical: true },
  'arco':      { type: 'noun', class: 'weapon', gender: 'masculine', physical: true },
  'flecha':    { type: 'noun', class: 'weapon', gender: 'feminine', physical: true },
  'escudo':    { type: 'noun', class: 'armor', gender: 'masculine', physical: true },
  'armadura':  { type: 'noun', class: 'armor', gender: 'feminine', physical: true },
  'elmo':      { type: 'noun', class: 'armor', gender: 'masculine', physical: true },

  // ═══════════════════════════════════════════════════════════
  // SUBSTANTIVOS — EMOÇÃO
  // ═══════════════════════════════════════════════════════════
  'medo':      { type: 'noun', class: 'emotion', gender: 'masculine', subtype: 'fear' },
  'raiva':     { type: 'noun', class: 'emotion', gender: 'feminine', subtype: 'anger' },
  'alegria':   { type: 'noun', class: 'emotion', gender: 'feminine', subtype: 'joy' },
  'tristeza':  { type: 'noun', class: 'emotion', gender: 'feminine', subtype: 'sadness' },
  'amor':      { type: 'noun', class: 'emotion', gender: 'masculine', subtype: 'love' },
  'ódio':      { type: 'noun', class: 'emotion', gender: 'masculine', subtype: 'hate' },
  'esperança': { type: 'noun', class: 'emotion', gender: 'feminine', subtype: 'hope' },
  'desespero': { type: 'noun', class: 'emotion', gender: 'masculine', subtype: 'despair' },
  'angústia':  { type: 'noun', class: 'emotion', gender: 'feminine', subtype: 'anxiety' },
  'culpa':     { type: 'noun', class: 'emotion', gender: 'feminine', subtype: 'guilt' },
  'vergonha':  { type: 'noun', class: 'emotion', gender: 'feminine', subtype: 'shame' },
  'saudade':   { type: 'noun', class: 'emotion', gender: 'feminine', subtype: 'longing' },
  'pavor':     { type: 'noun', class: 'emotion', gender: 'masculine', subtype: 'fear' },
  'terror':    { type: 'noun', class: 'emotion', gender: 'masculine', subtype: 'fear' },
  'pânico':    { type: 'noun', class: 'emotion', gender: 'masculine', subtype: 'fear' },
  'fúria':     { type: 'noun', class: 'emotion', gender: 'feminine', subtype: 'anger' },
  'revolta':   { type: 'noun', class: 'emotion', gender: 'feminine', subtype: 'anger' },
  'prazer':    { type: 'noun', class: 'emotion', gender: 'masculine', subtype: 'pleasure' },
  'contentamento':{ type: 'noun', class: 'emotion', gender: 'masculine', subtype: 'joy' },
  'desgosto':  { type: 'noun', class: 'emotion', gender: 'masculine', subtype: 'sadness' },
  'melancolia':{ type: 'noun', class: 'emotion', gender: 'feminine', subtype: 'sadness' },
  'serenidade':{ type: 'noun', class: 'emotion', gender: 'feminine', subtype: 'calm' },

  // ═══════════════════════════════════════════════════════════
  // SUBSTANTIVOS — SENSAÇÃO
  // ═══════════════════════════════════════════════════════════
  'aperto':    { type: 'noun', class: 'sensation', gender: 'masculine' },
  'frio':      { type: 'noun', class: 'sensation', gender: 'masculine' },
  'calor':     { type: 'noun', class: 'sensation', gender: 'masculine' },
  'dor':       { type: 'noun', class: 'sensation', gender: 'feminine' },
  'peso':      { type: 'noun', class: 'sensation', gender: 'masculine' },
  'ardor':     { type: 'noun', class: 'sensation', gender: 'masculine' },
  'queimação': { type: 'noun', class: 'sensation', gender: 'feminine' },
  'formigamento':{ type: 'noun', class: 'sensation', gender: 'masculine' },
  'pressão':   { type: 'noun', class: 'sensation', gender: 'feminine' },
  'tontura':   { type: 'noun', class: 'sensation', gender: 'feminine' },
  'náusea':    { type: 'noun', class: 'sensation', gender: 'feminine' },

  // ═══════════════════════════════════════════════════════════
  // SUBSTANTIVOS — TEMPO
  // ═══════════════════════════════════════════════════════════
  'ano':       { type: 'noun', class: 'time', gender: 'masculine' },
  'dia':       { type: 'noun', class: 'time', gender: 'masculine' },
  'noite':     { type: 'noun', class: 'time', gender: 'feminine' },
  'tarde':     { type: 'noun', class: 'time', gender: 'feminine' },
  'manhã':     { type: 'noun', class: 'time', gender: 'feminine' },
  'momento':   { type: 'noun', class: 'time', gender: 'masculine' },
  'instante':  { type: 'noun', class: 'time', gender: 'masculine' },
  'hora':      { type: 'noun', class: 'time', gender: 'feminine' },
  'semana':    { type: 'noun', class: 'time', gender: 'feminine' },
  'mês':       { type: 'noun', class: 'time', gender: 'masculine' },
  'década':    { type: 'noun', class: 'time', gender: 'feminine' },
  'século':    { type: 'noun', class: 'time', gender: 'masculine' },
  'minuto':    { type: 'noun', class: 'time', gender: 'masculine' },
  'segundo':   { type: 'noun', class: 'time', gender: 'masculine' },

  // ═══════════════════════════════════════════════════════════
  // SUBSTANTIVOS — PARTE DO CORPO
  // ═══════════════════════════════════════════════════════════
  'mão':       { type: 'noun', class: 'body-part', gender: 'feminine' },
  'braço':     { type: 'noun', class: 'body-part', gender: 'masculine' },
  'perna':     { type: 'noun', class: 'body-part', gender: 'feminine' },
  'cabeça':    { type: 'noun', class: 'body-part', gender: 'feminine' },
  'olho':      { type: 'noun', class: 'body-part', gender: 'masculine' },
  'olhos':     { type: 'noun', class: 'body-part', gender: 'masculine', number: 'plural' },
  'rosto':     { type: 'noun', class: 'body-part', gender: 'masculine' },
  'peito':     { type: 'noun', class: 'body-part', gender: 'masculine' },
  'coração':   { type: 'noun', class: 'body-part', gender: 'masculine' },
  'boca':      { type: 'noun', class: 'body-part', gender: 'feminine' },
  'orelha':    { type: 'noun', class: 'body-part', gender: 'feminine' },
  'nariz':     { type: 'noun', class: 'body-part', gender: 'masculine' },
  'dedo':      { type: 'noun', class: 'body-part', gender: 'masculine' },
  'pé':        { type: 'noun', class: 'body-part', gender: 'masculine' },
  'cabelo':    { type: 'noun', class: 'body-part', gender: 'masculine' },
  'pescoço':   { type: 'noun', class: 'body-part', gender: 'masculine' },
  'costas':    { type: 'noun', class: 'body-part', gender: 'feminine', number: 'plural' },

  // ═══════════════════════════════════════════════════════════
  // SUBSTANTIVOS — ABSTRATO
  // ═══════════════════════════════════════════════════════════
  'verdade':   { type: 'noun', class: 'abstract', gender: 'feminine' },
  'mentira':   { type: 'noun', class: 'abstract', gender: 'feminine' },
  'decisão':   { type: 'noun', class: 'abstract', gender: 'feminine' },
  'escolha':   { type: 'noun', class: 'abstract', gender: 'feminine' },
  'ideia':     { type: 'noun', class: 'abstract', gender: 'feminine' },
  'pensamento':{ type: 'noun', class: 'abstract', gender: 'masculine' },
  'memória':   { type: 'noun', class: 'abstract', gender: 'feminine' },
  'sonho':     { type: 'noun', class: 'abstract', gender: 'masculine' },
  'silêncio':  { type: 'noun', class: 'abstract', gender: 'masculine' },
  'som':       { type: 'noun', class: 'abstract', gender: 'masculine' },
  'barulho':   { type: 'noun', class: 'abstract', gender: 'masculine' },
  'nome':      { type: 'noun', class: 'abstract', gender: 'masculine' },
  'razão':     { type: 'noun', class: 'abstract', gender: 'feminine' },
  'vida':      { type: 'noun', class: 'abstract', gender: 'feminine' },
  'morte':     { type: 'noun', class: 'abstract', gender: 'feminine' },
  'destino':   { type: 'noun', class: 'abstract', gender: 'masculine' },
  'sorte':     { type: 'noun', class: 'abstract', gender: 'feminine' },
  'tempo':     { type: 'noun', class: 'abstract', gender: 'masculine' },
  'guerra':    { type: 'noun', class: 'abstract', gender: 'feminine' },
  'paz':       { type: 'noun', class: 'abstract', gender: 'feminine' },
  'honra':     { type: 'noun', class: 'abstract', gender: 'feminine' },
  'justiça':   { type: 'noun', class: 'abstract', gender: 'feminine' },
  'poder':     { type: 'noun', class: 'abstract', gender: 'masculine' },
  'força':     { type: 'noun', class: 'abstract', gender: 'feminine' },
  'magia':     { type: 'noun', class: 'abstract', gender: 'feminine' },

  // ═══════════════════════════════════════════════════════════
  // ADJETIVOS
  // ═══════════════════════════════════════════════════════════
  'escuro':    { type: 'adj', class: 'quality', antonym: 'claro' },
  'claro':     { type: 'adj', class: 'quality', antonym: 'escuro' },
  'quente':    { type: 'adj', class: 'temperature' },
  'grande':    { type: 'adj', class: 'size' },
  'pequeno':   { type: 'adj', class: 'size' },
  'enorme':    { type: 'adj', class: 'size', intensity: 'high' },
  'minúsculo': { type: 'adj', class: 'size', intensity: 'high' },
  'velho':     { type: 'adj', class: 'age' },
  'novo':      { type: 'adj', class: 'age' },
  'jovem':     { type: 'adj', class: 'age' },
  'belo':      { type: 'adj', class: 'aesthetic' },
  'feio':      { type: 'adj', class: 'aesthetic' },
  'bonito':    { type: 'adj', class: 'aesthetic' },
  'horrendo':  { type: 'adj', class: 'aesthetic' },
  'sublime':   { type: 'adj', class: 'aesthetic' },
  'gracioso':  { type: 'adj', class: 'aesthetic' },
  'bom':       { type: 'adj', class: 'value' },
  'mau':       { type: 'adj', class: 'value' },
  'forte':     { type: 'adj', class: 'strength' },
  'fraco':     { type: 'adj', class: 'strength' },
  'rápido':    { type: 'adj', class: 'speed' },
  'lento':     { type: 'adj', class: 'speed' },
  'cansado':   { type: 'adj', class: 'state' },
  'ferido':    { type: 'adj', class: 'state' },
  'vivo':      { type: 'adj', class: 'state' },
  'morto':     { type: 'adj', class: 'state' },
  'silencioso':{ type: 'adj', class: 'sound' },
  'barulhento':{ type: 'adj', class: 'sound' },
  'afiado':    { type: 'adj', class: 'quality' },
  'rombo':     { type: 'adj', class: 'quality' },
  'áspero':    { type: 'adj', class: 'quality' },
  'liso':      { type: 'adj', class: 'quality' },
  'doce':      { type: 'adj', class: 'taste' },
  'amargo':    { type: 'adj', class: 'taste' },
  'salgado':   { type: 'adj', class: 'taste' },
  'azedo':     { type: 'adj', class: 'taste' },
  'vermelho':  { type: 'adj', class: 'color' },
  'azul':      { type: 'adj', class: 'color' },
  'verde':     { type: 'adj', class: 'color' },
  'negro':     { type: 'adj', class: 'color' },
  'branco':    { type: 'adj', class: 'color' },
  'amarelo':   { type: 'adj', class: 'color' },
  'cinza':     { type: 'adj', class: 'color' },
  'dourado':   { type: 'adj', class: 'color' },
  'prateado':  { type: 'adj', class: 'color' },

  // ═══════════════════════════════════════════════════════════
  // ADVÉRBIOS TEMPORAIS / DISCURSIVOS
  // ═══════════════════════════════════════════════════════════
  'antes':     { type: 'adv', class: 'temporal', frame: 'story', direction: 'past' },
  'depois':    { type: 'adv', class: 'temporal', frame: 'story', direction: 'future' },
  'agora':     { type: 'adv', class: 'temporal', frame: 'discourse' },
  'então':     { type: 'adv', class: 'temporal', frame: 'story' },
  'enquanto':  { type: 'adv', class: 'temporal', frame: 'story', simultaneity: true },
  'durante':   { type: 'adv', class: 'temporal', frame: 'story', simultaneity: true },
  'cedo':      { type: 'adv', class: 'temporal', frame: 'story' },
  'sempre':    { type: 'adv', class: 'temporal', habitual: true },
  'nunca':     { type: 'adv', class: 'temporal', negated: true },
  'jamais':    { type: 'adv', class: 'temporal', negated: true },
  'logo':      { type: 'adv', class: 'temporal', frame: 'story' },
  'breve':     { type: 'adv', class: 'temporal', frame: 'story' },
});

// ══════════════════════════════════════════════════════════════
// MERGE — LEXICON FINAL (curado vence imported)
// ══════════════════════════════════════════════════════════════
//
// Ordem de precedência:
//   1. CURATED_LEXICON   — entradas revisadas à mão
//   2. IMPORTED_LEXICON  — gerado pelo script, preenche lacunas
//
// Se uma chave existe em ambos, o curado vence. Isso permite
// ajustar um verbo específico manualmente sem perder as milhares
// de entradas automáticas.
//
// A ordem das chaves no objeto final é: primeiro as importadas
// (ordem alfabética do script), depois as curadas sobrescrevem
// as que colidem. Como o JS preserva ordem de inserção, o
// resultado é estável e determinístico.

export const LEXICON = Object.freeze({
  ...IMPORTED_LEXICON,
  ...CURATED_LEXICON,
});

// ══════════════════════════════════════════════════════════════
// ÍNDICES DERIVADOS
// ══════════════════════════════════════════════════════════════
//
// Construídos sobre o LEXICON final (merge). Reconstruídos uma
// única vez na carga do módulo. Nunca mutados depois.

const _byType = new Map();
for (const [lemma, entry] of Object.entries(LEXICON)) {
  if (!entry.type) continue;
  if (!_byType.has(entry.type)) _byType.set(entry.type, new Set());
  _byType.get(entry.type).add(lemma);
}

const _byClass = new Map();
for (const [lemma, entry] of Object.entries(LEXICON)) {
  if (!entry.class) continue;
  if (!_byClass.has(entry.class)) _byClass.set(entry.class, new Set());
  _byClass.get(entry.class).add(lemma);
}

const _bySubtype = new Map();
for (const [lemma, entry] of Object.entries(LEXICON)) {
  if (!entry.subtype) continue;
  if (!_bySubtype.has(entry.subtype)) _bySubtype.set(entry.subtype, new Set());
  _bySubtype.get(entry.subtype).add(lemma);
}

// ══════════════════════════════════════════════════════════════
// API PÚBLICA — lookup básico
// ══════════════════════════════════════════════════════════════

/**
 * Busca uma entrada do léxico pelo lema.
 * @param {string} lemma
 * @returns {Object|null}
 */
export function lookupLemma(lemma) {
  if (typeof lemma !== 'string' || !lemma) return null;
  return LEXICON[lemma.toLowerCase()] ?? null;
}

/**
 * Verifica se um lema existe no léxico.
 * @param {string} lemma
 * @returns {boolean}
 */
export function hasLemma(lemma) {
  if (typeof lemma !== 'string' || !lemma) return false;
  return lemma.toLowerCase() in LEXICON;
}

/**
 * Devolve a classe semântica de um lema, ou null.
 * @param {string} lemma
 * @returns {string|null}
 */
export function classOf(lemma) {
  const entry = lookupLemma(lemma);
  return entry?.class ?? null;
}

/**
 * Devolve o tipo semântico de um lema, ou null.
 * @param {string} lemma
 * @returns {string|null}
 */
export function typeOf(lemma) {
  const entry = lookupLemma(lemma);
  return entry?.type ?? null;
}

/**
 * Devolve o D-number canônico do lema, ou null.
 * @param {string} lemma
 * @returns {string|null}
 */
export function subtypeOf(lemma) {
  const entry = lookupLemma(lemma);
  return entry?.subtype ?? null;
}

/**
 * Devolve os traits do lema (array vazio se nenhum).
 * @param {string} lemma
 * @returns {string[]}
 */
export function traitsOf(lemma) {
  const entry = lookupLemma(lemma);
  return Array.isArray(entry?.traits) ? [...entry.traits] : [];
}

/**
 * Verifica se o lema tem um trait específico.
 * @param {string} lemma
 * @param {string} trait
 * @returns {boolean}
 */
export function hasTrait(lemma, trait) {
  const entry = lookupLemma(lemma);
  return Array.isArray(entry?.traits) && entry.traits.includes(trait);
}

/**
 * Devolve as variantes de sentido de um lema.
 * @param {string} lemma
 * @returns {Array}
 */
export function variantsOf(lemma) {
  const entry = lookupLemma(lemma);
  return Array.isArray(entry?.variants) ? entry.variants : [];
}

/**
 * Seleciona a variante aplicável a um dado tipo de argumento.
 * @param {string} lemma
 * @param {string} argType
 * @returns {Object|null}
 */
export function variantFor(lemma, argType) {
  const variants = variantsOf(lemma);
  if (!argType) return null;
  for (const v of variants) {
    if (Array.isArray(v.objectTypes) && v.objectTypes.includes(argType)) {
      return v;
    }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════
// API PÚBLICA — listagens
// ══════════════════════════════════════════════════════════════

/**
 * Lista todos os lemas de um determinado tipo semântico.
 * @param {string} type
 * @returns {string[]}
 */
export function lemmasOfType(type) {
  const set = _byType.get(type);
  return set ? Array.from(set).sort() : [];
}

/**
 * Lista todos os lemas de uma classe semântica.
 * @param {string} cls
 * @returns {string[]}
 */
export function lemmasOfClass(cls) {
  const set = _byClass.get(cls);
  return set ? Array.from(set).sort() : [];
}

/**
 * Lista todos os lemas mapeados para um D-number.
 * @param {string} dnumber
 * @returns {string[]}
 */
export function lemmasOfSubtype(dnumber) {
  const set = _bySubtype.get(dnumber);
  return set ? Array.from(set).sort() : [];
}

/**
 * Número de entradas do léxico (curado + importado).
 * @returns {number}
 */
export function size() {
  return Object.keys(LEXICON).length;
}

/**
 * Estatísticas de cobertura.
 *
 * `bySource` separa curado vs importado para auditoria. O total é
 * o tamanho do merge (sem dupla contagem).
 *
 * @returns {{ total:number, byType:Object, byClass:Object, bySubtype:Object, bySource:Object }}
 */
export function stats() {
  const byType = {};
  for (const [t, set] of _byType) byType[t] = set.size;

  const byClass = {};
  for (const [c, set] of _byClass) byClass[c] = set.size;

  const bySubtype = {};
  for (const [st, set] of _bySubtype) bySubtype[st] = set.size;

  const bySource = {
    imported: Object.keys(IMPORTED_LEXICON).length,
    curated: Object.keys(CURATED_LEXICON).length,
    total: Object.keys(LEXICON).length,
    collision: 0,
  };

  // Conta quantas entradas curadas sobrescrevem uma importada
  for (const key of Object.keys(CURATED_LEXICON)) {
    if (Object.prototype.hasOwnProperty.call(IMPORTED_LEXICON, key)) {
      bySource.collision++;
    }
  }

  return {
    total: size(),
    byType,
    byClass,
    bySubtype,
    bySource,
  };
}

// ══════════════════════════════════════════════════════════════
// EXPORTS AGREGADOS
// ══════════════════════════════════════════════════════════════

export const Lexicon = Object.freeze({
  LEXICON,
  CURATED_LEXICON,
  IMPORTED_LEXICON,
  PREDICATE_TYPES,
  NOUN_CLASSES,
  lookupLemma,
  hasLemma,
  classOf,
  typeOf,
  subtypeOf,
  traitsOf,
  hasTrait,
  variantsOf,
  variantFor,
  lemmasOfType,
  lemmasOfClass,
  lemmasOfSubtype,
  size,
  stats,
});