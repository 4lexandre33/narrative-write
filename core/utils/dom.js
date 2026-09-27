/**
 * @file dom.js
 * @module core/utils
 * @description Helpers de DOM — criar, buscar, delegar.
 * @imports — (nenhum)
 * @importedBy ui/*, editor/editor, editor/inline-template
 * @level 0
 */

/**
 * Cria elemento DOM com atributos e filhos.
 * Uso:
 *   el('div', { class: 'x', id: 'y' }, 'texto')
 *   el('button', { onclick: fn }, el('span', {}, 'clique'))
 * @param {string} tag
 * @param {Object} [attrs]
 * @param {...(Node|string|Node[])} children
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'class' || key === 'className') {
      node.className = String(value);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value);
    } else if (key === 'dataset' && typeof value === 'object') {
      for (const [dk, dv] of Object.entries(value)) {
        node.dataset[dk] = String(dv);
      }
    } else if (key.startsWith('on') && typeof value === 'function') {
      const eventName = key.slice(2).toLowerCase();
      node.addEventListener(eventName, value);
    } else if (key === 'html' || key === 'innerHTML') {
      node.innerHTML = String(value);
    } else if (key === 'text' || key === 'textContent') {
      node.textContent = String(value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }

  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    if (child instanceof Node) {
      node.appendChild(child);
    } else {
      node.appendChild(document.createTextNode(String(child)));
    }
  }

  return node;
}

/**
 * Adiciona event listener e retorna função de remoção.
 * @param {EventTarget} target
 * @param {string} event
 * @param {Function} handler
 * @param {boolean|AddEventListenerOptions} [opts]
 * @returns {Function} unsubscribe
 */
export function on(target, event, handler, opts) {
  if (!target || typeof target.addEventListener !== 'function') {
    return () => {};
  }
  target.addEventListener(event, handler, opts);
  return () => target.removeEventListener(event, handler, opts);
}

/**
 * Remove event listener.
 * @param {EventTarget} target
 * @param {string} event
 * @param {Function} handler
 * @param {boolean|EventListenerOptions} [opts]
 */
export function off(target, event, handler, opts) {
  if (!target || typeof target.removeEventListener !== 'function') return;
  target.removeEventListener(event, handler, opts);
}

/**
 * querySelector wrapper.
 * @param {string} sel
 * @param {ParentNode} [root=document]
 * @returns {Element|null}
 */
export function $(sel, root = document) {
  return root.querySelector(sel);
}

/**
 * querySelectorAll wrapper — retorna Array.
 * @param {string} sel
 * @param {ParentNode} [root=document]
 * @returns {Element[]}
 */
export function $$(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

/**
 * Delegação de evento.
 * Uso:
 *   onDelegate(panel, '.item', 'click', (e, target) => { ... })
 * @param {Element} root
 * @param {string} selector
 * @param {string} event
 * @param {(event: Event, matchedTarget: Element) => void} handler
 * @returns {Function} unsubscribe
 */
export function onDelegate(root, selector, event, handler) {
  if (!root) return () => {};

  const wrapped = (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) {
      handler(e, target);
    }
  };

  root.addEventListener(event, wrapped);
  return () => root.removeEventListener(event, wrapped);
}

/**
 * Remove todos os filhos de um nó.
 * @param {Element} node
 */
export function clear(node) {
  if (!node) return;
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

/**
 * Substitui conteúdo por um nó ou string.
 * @param {Element} node
 * @param {Node|string} content
 */
export function setContent(node, content) {
  if (!node) return;
  clear(node);
  if (content instanceof Node) {
    node.appendChild(content);
  } else {
    node.textContent = String(content);
  }
}

/**
 * Adiciona/remove classe com base em condição.
 * @param {Element} node
 * @param {string} cls
 * @param {boolean} enabled
 */
export function toggleClass(node, cls, enabled) {
  if (!node) return;
  if (enabled) node.classList.add(cls);
  else node.classList.remove(cls);
}

/**
 * Mede largura de texto usando canvas.
 * @param {string} text
 * @param {string} font  ex: '14px Consolas'
 * @returns {number}
 */
export function measureText(text, font) {
  const canvas = measureText._canvas || (measureText._canvas = document.createElement('canvas'));
  const ctx = canvas.getContext('2d');
  if (font) ctx.font = font;
  return ctx.measureText(String(text || '')).width;
}

/**
 * Aguarda o próximo frame de render.
 * @returns {Promise<void>}
 */
export function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/**
 * Agenda callback para quando o browser estiver ocioso.
 * Fallback para setTimeout se requestIdleCallback indisponível.
 * @param {Function} cb
 * @param {number} [timeout=1000]
 */
export function whenIdle(cb, timeout = 1000) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(cb, { timeout });
  } else {
    setTimeout(() => cb({ didTimeout: true, timeRemaining: () => 0 }), 0);
  }
}

/**
 * Cria elemento a partir de HTML string.
 * @param {string} html
 * @returns {Element|null}
 */
export function fromHTML(html) {
  const tmp = document.createElement('template');
  tmp.innerHTML = String(html || '').trim();
  return tmp.content.firstElementChild;
}

/**
 * Verifica se um elemento está visível (não display:none, não oculto).
 * @param {Element} el
 * @returns {boolean}
 */
export function isVisible(el) {
  if (!el) return false;
  if (el.offsetParent === null && el.style.position !== 'fixed') return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

/**
 * Foca elemento sem jogar scroll.
 * @param {Element} el
 */
export function focusSilently(el) {
  if (!el || typeof el.focus !== 'function') return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}

/**
 * Cria um Blob URL de um texto.
 * @param {string} content
 * @param {string} [mime='text/plain']
 * @returns {string} url
 */
export function createBlobUrl(content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  return URL.createObjectURL(blob);
}

/**
 * Dispara download de um Blob.
 * @param {Blob} blob
 * @param {string} filename
 */
export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Copia texto para o clipboard.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(String(text));
      return true;
    }
  } catch {
    // fallback abaixo
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = String(text);
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}