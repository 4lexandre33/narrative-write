/**
 * @file types.js
 * @module core
 * @description JSDoc typedefs — documentação executável dos tipos do sistema.
 * @imports — (nenhum)
 * @importedBy — (só referência; nenhum import em runtime)
 * @level 0
 */

/**
 * @typedef {string} EntityId
 * Identificador interno de entidade (ex: 'Kaelin', 'e42').
 */

/**
 * @typedef {string} Shortcode
 * Código curto único e imutável (ex: 'CHR-KAE', 'LOC-CIN').
 */

/**
 * @typedef {string} Tick
 * String no formato 'T<n>' (ex: 'T0', 'T42').
 */

/**
 * @typedef {string} TimelineName
 * Nome de timeline (ex: 'main', 'alt_mira_morta').
 */

/**
 * @typedef {Object} Identity
 * @property {Shortcode} id
 * @property {string} name
 * @property {string} description
 * @property {string} type
 */

/**
 * @typedef {Object} Stats
 * @property {number} [k]
 */

/**
 * @typedef {Object} Flags
 * @property {string[]} values
 */

/**
 * @typedef {Object} Enums
 * @property {string} [k]
 */

/**
 * @typedef {Object} Tags
 * @property {string[]} values
 */

/**
 * @typedef {Object} Lists
 * @property {string[]} [k]
 */

/**
 * @typedef {Object} Texts
 * @property {string} [k]
 */

/**
 * @typedef {Object} Links
 * @property {EntityId|EntityId[]} [rel]
 */

/**
 * @typedef {Object} AST
 * @property {string} verb
 * @property {string} action
 * @property {string} [subtype]
 * @property {string} [target]
 * @property {string} [rel]
 * @property {string} [value]
 * @property {string[]} [path]
 * @property {string[]} [indexes]
 * @property {Object} [opts]
 * @property {string} raw
 */

/**
 * @typedef {Object} Mutation
 * @property {string} op
 * @property {string} kind
 * @property {EntityId} target
 * @property {string} path
 * @property {any} before
 * @property {any} after
 * @property {any} [value]
 * @property {boolean} [noop]
 */

/**
 * @typedef {Object} LinkChange
 * @property {string} action
 * @property {string} rel
 * @property {EntityId} from
 * @property {EntityId} [to]
 * @property {any} before
 * @property {any} after
 */

/**
 * @typedef {Object} PanelPayload
 * @property {'tree'|'card'|'table'|'graph'|'diff'|'alerts'|'resolve'|'menu'|'tutorial-card'|'confirm'} kind
 * @property {string} title
 * @property {any} data
 * @property {Array<{label:string, run:string}>} [actions]
 * @property {boolean} [sticky]
 * @property {string[]} [highlight]
 */

/**
 * @typedef {Object} SystemResult
 * @property {boolean} ok
 * @property {'command'|'prose'|'slash-command'|'empty'} [kind]
 * @property {string} [raw]
 * @property {boolean} [halt]
 * @property {boolean} [mutated]
 * @property {AST} [ast]
 * @property {Mutation} [mutation]
 * @property {LinkChange} [link]
 * @property {Object} [created]
 * @property {Object} [instance]
 * @property {Object} [identity]
 * @property {Object} [knowledge]
 * @property {Object} [rule]
 * @property {Object} [snippet]
 * @property {Object} [template]
 * @property {Object} [export]
 * @property {PanelPayload} [left]
 * @property {PanelPayload} [right]
 * @property {{tick:string,text:string}} [annotation]
 * @property {string} [error]
 */

/**
 * @typedef {Object} SnapshotData
 * @property {number} version
 * @property {string} takenAt
 * @property {Tick} tick
 * @property {TimelineName} timeline
 * @property {Object<string, Object>} entities
 * @property {string[]} schemas
 * @property {Object} [metadata]
 */

/**
 * @typedef {Object} DiffResult
 * @property {{tick:Tick,takenAt:string}} from
 * @property {{tick:Tick,takenAt:string}} to
 * @property {EntityId[]} added
 * @property {EntityId[]} removed
 * @property {Array<{id:EntityId, patch:Object}>} changed
 * @property {{added:number,removed:number,changed:number,total:number}} stats
 * @property {number} computedAt
 */

/**
 * @typedef {Object} Context
 * @property {Tick} tick
 * @property {TimelineName} timeline
 * @property {string} kind
 * @property {string} raw
 * @property {Object} linkIndex
 * @property {Object} ids
 */

/**
 * @typedef {Function} UnsubscribeFn
 * @returns {void}
 */

export {};