/**
 * @file ui-harness.js
 * @module diagnostics
 * @description Ferramentaria para testes de UI em iframe isolado.
 * @imports ecs/event-bus, ecs/world, ui/ui-wires, ui/*, editor/editor
 * @importedBy diagnostics/ui-battery
 * @level 9
 *
 * Fase E:
 *   - `sandbox.mountFullUI(machine)` monta a plataforma completa
 *     (header + editor + painéis + overlays) e chama `wireUI`.
 *     Retorna o `app` — mesmo shape que `mountUI` do boot retorna.
 *   - Todos os componentes criados são rastreados para `destroy()`.
 */

import { EventBus } from '../ecs/event-bus.js';
import { World } from '../ecs/world.js';

import { wireUI, createPlatformDOM } from '../ui/ui-wires.js';

import { ToastManager } from '../ui/toast.js';
import { ModalManager } from '../ui/modal.js';
import { PanelLeft } from '../ui/panel-left.js';
import { PanelRight } from '../ui/panel-right.js';
import { FloatingMenu } from '../ui/floating-menu.js';
import { HistoryPanel } from '../ui/history-panel.js';
import { RollOverlay } from '../ui/roll-overlay.js';
import { PlayOverlay } from '../ui/play-overlay.js';
import { CommandGuide } from '../ui/command-guide.js';
import { KeyboardRouter } from '../ui/keyboard-router.js';
import { FocusManager } from '../ui/focus-manager.js';
import { Editor } from '../editor/editor.js';

const IFRAME_WIDTH = 1120;
const IFRAME_HEIGHT = 640;
const DEFAULT_WAIT_TIMEOUT = 1000;
const DEFAULT_WAIT_INTERVAL = 16;

// ══════════════════════════════════════════════════════════════
// Phase context
// ══════════════════════════════════════════════════════════════

export async function createPhaseContext({ parent = document, cssHref = null } = {}) {
  let iframe = null;
  let win = null;
  let doc = null;
  let fallbackContainer = null;
  let mode = 'iframe';
  let warning = null;

  try {
    iframe = parent.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-99999px';
    iframe.style.top = '0';
    iframe.style.width = `${IFRAME_WIDTH}px`;
    iframe.style.height = `${IFRAME_HEIGHT}px`;
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    iframe.setAttribute('title', 'UI test iframe (isolated)');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('src', 'about:blank');

    parent.body.appendChild(iframe);

    await new Promise((r) => setTimeout(r, 0));

    win = iframe.contentWindow;
    doc = iframe.contentDocument;

    if (!win || !doc) {
      throw new Error('contentWindow/contentDocument indisponível');
    }

    void doc.body;

    if (cssHref) {
      try {
        const link = doc.createElement('link');
        link.rel = 'stylesheet';
        link.href = cssHref;
        doc.head.appendChild(link);
        await new Promise((resolve) => {
          link.addEventListener('load', resolve, { once: true });
          link.addEventListener('error', resolve, { once: true });
          setTimeout(resolve, 500);
        });
      } catch { /* CSS é best-effort */ }
    }

    try {
      doc.body.style.margin = '0';
      doc.body.style.padding = '0';
      doc.body.style.backgroundColor = '#ffffff';
      doc.body.style.fontFamily =
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    } catch { /* isola */ }
  } catch (err) {
    mode = 'fallback';
    warning = `iframe falhou (${err.message}); usando container no parent`;

    if (iframe && iframe.parentNode) {
      try { iframe.parentNode.removeChild(iframe); } catch { /* isola */ }
    }
    iframe = null;

    fallbackContainer = parent.createElement('div');
    fallbackContainer.className = 'ui-sandbox-fallback';
    fallbackContainer.style.position = 'fixed';
    fallbackContainer.style.left = '-99999px';
    fallbackContainer.style.top = '0';
    fallbackContainer.style.width = `${IFRAME_WIDTH}px`;
    fallbackContainer.style.height = `${IFRAME_HEIGHT}px`;
    fallbackContainer.style.overflow = 'hidden';
    fallbackContainer.style.background = '#ffffff';
    parent.body.appendChild(fallbackContainer);

    win = parent.defaultView || window;
    doc = parent;
  }

  const containerParent = mode === 'iframe' ? doc.body : fallbackContainer;

  return {
    mode,
    warning,
    iframe,
    fallbackContainer,
    win,
    doc,
    containerParent,

    async destroy() {
      try {
        if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
      } catch { /* isola */ }
      try {
        if (fallbackContainer && fallbackContainer.parentNode) {
          fallbackContainer.parentNode.removeChild(fallbackContainer);
        }
      } catch { /* isola */ }
    },
  };
}

export function getStylesHref() {
  try {
    return new URL('../ui/styles.css', import.meta.url).href;
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// Sandbox
// ══════════════════════════════════════════════════════════════

export function createSandbox(ctx) {
  const { doc, win, containerParent } = ctx;

  const container = doc.createElement('div');
  container.className = 'ui-sandbox';
  container.style.position = 'relative';
  container.style.width = `${IFRAME_WIDTH}px`;
  container.style.height = `${IFRAME_HEIGHT}px`;
  container.style.overflow = 'hidden';
  containerParent.appendChild(container);

  const mounted = [];
  const spies = [];

  return {
    ctx,
    container,
    win,
    doc,

    mount(ComponentClass, ...args) {
      const instance = new ComponentClass(...args);
      mounted.push(instance);
      return instance;
    },

    spyOn(target, event) {
      const calls = [];
      const handler = (payload) => calls.push(payload);
      const unsub = target.on(event, handler);

      const spy = {
        calls,
        count: () => calls.length,
        first: () => calls[0],
        last: () => calls[calls.length - 1],
        clear: () => { calls.length = 0; },
        restore: () => { try { unsub(); } catch { /* isola */ } },
      };
      spies.push(spy);
      return spy;
    },

    spyOnMethod(target, methodName) {
      if (!target || typeof target[methodName] !== 'function') {
        throw new Error(`spyOnMethod: "${methodName}" não é função`);
      }
      const original = target[methodName];
      const calls = [];

      target[methodName] = function(...args) {
        calls.push(args);
        return original.apply(this, args);
      };

      const spy = {
        calls,
        count: () => calls.length,
        first: () => calls[0],
        last: () => calls[calls.length - 1],
        clear: () => { calls.length = 0; },
        restore: () => { target[methodName] = original; },
      };
      spies.push(spy);
      return spy;
    },

    /**
     * Fase E — monta a plataforma completa (header + editor + painéis
     * + overlays + toasts + modais) e chama `wireUI`.
     *
     * @param {Object} machine
     * @returns {Object} app — mesmo shape que `mountUI` do boot retorna
     */
    mountFullUI(machine) {
      const resource = buildFullUI(machine, { container, doc, win });
      mounted.push(resource);
      return resource.app;
    },

    destroy() {
      for (const spy of spies.splice(0)) {
        try { spy.restore(); } catch { /* isola */ }
      }
      for (const instance of mounted.splice(0).reverse()) {
        try {
          if (instance && typeof instance.destroy === 'function') {
            instance.destroy();
          }
        } catch { /* isola */ }
      }
      try {
        if (container.parentNode) container.parentNode.removeChild(container);
      } catch { /* isola */ }
    },
  };
}

// ══════════════════════════════════════════════════════════════
// buildFullUI — implementação
// ══════════════════════════════════════════════════════════════

/**
 * Constrói a plataforma completa dentro do container fornecido.
 * Não exportado — usado apenas por `sandbox.mountFullUI()`.
 *
 * @param {Object} machine
 * @param {Object} env — { container, doc, win }
 * @returns {{ app:Object, destroy:Function }}
 * @private
 */
function buildFullUI(machine, { container, doc, win }) {
  const { platform, leftEl, editorEl, rightEl } = createPlatformDOM(doc);

  // Ajusta a plataforma para ficar contida no sandbox (não fixed).
  platform.style.position = 'relative';
  platform.style.top = '0';
  platform.style.left = '0';
  platform.style.width = '100%';
  platform.style.height = '100%';
  platform.classList.add('visible');

  container.appendChild(platform);

  const editor = new Editor(machine, editorEl);
  const panelLeft = new PanelLeft(machine, leftEl);
  const panelRight = new PanelRight(machine, rightEl);

  const floatingMenu = new FloatingMenu(machine, { container });
  const historyPanel = new HistoryPanel(machine, { container, target: doc });
  const rollOverlay = new RollOverlay(machine, { container, target: doc });
  const playOverlay = new PlayOverlay(machine, { container, target: doc });
  const commandGuide = new CommandGuide(machine, { container });

  const toast = new ToastManager(container);
  const modal = new ModalManager({ container });

  const focusManager = new FocusManager({
    panelLeft: leftEl,
    panelRight: rightEl,
    editor: editorEl,
  });

  const keyboardRouter = new KeyboardRouter(machine, {
    floatingMenu,
    historyPanel,
    rollOverlay,
    playOverlay,
    commandGuide,
  }, { target: doc });

  const app = {
    platform,
    editor,
    panelLeft,
    panelRight,
    floatingMenu,
    historyPanel,
    rollOverlay,
    playOverlay,
    commandGuide,
    toast,
    modal,
    focusManager,
    keyboardRouter,
    togglePlatform() {
      platform.classList.toggle('visible');
    },
  };

  const unsubs = wireUI(machine, app);

  const components = [
    editor, panelLeft, panelRight,
    floatingMenu, historyPanel, rollOverlay, playOverlay, commandGuide,
    toast, modal, keyboardRouter, focusManager,
  ];

  return {
    app,
    destroy() {
      for (const u of unsubs) {
        try { u(); } catch { /* isola */ }
      }
      for (const c of components) {
        try { c?.destroy?.(); } catch { /* isola */ }
      }
      try {
        if (platform.parentNode) platform.parentNode.removeChild(platform);
      } catch { /* isola */ }
    },
  };
}

// ══════════════════════════════════════════════════════════════
// Máquina mínima
// ══════════════════════════════════════════════════════════════

export function createMinimalMachine() {
  const bus = new EventBus();
  const world = new World({ bus });

  return {
    bus,
    world,
    state: {
      tick: 'T0',
      tickNumber: 0,
      timeline: 'main',
      play: false,
      roll: null,
    },
    systems: new Map(),
    registry: {
      getCommands: () => [],
      getSnippets: () => [],
      getComponents: () => [],
    },
    handleLine: (_line) => ({ ok: false, error: 'minimal machine não processa comandos' }),
    getTick: () => 'T0',
    getTimeline: () => 'main',
    resolveTrigger: () => [],
    resolveExactTrigger: () => null,
  };
}

// ══════════════════════════════════════════════════════════════
// Async helpers
// ══════════════════════════════════════════════════════════════

export function waitFor(predicate, {
  timeout = DEFAULT_WAIT_TIMEOUT,
  interval = DEFAULT_WAIT_INTERVAL,
} = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      let result;
      try { result = predicate(); }
      catch (err) { return reject(err); }
      if (result) return resolve(result);
      if (Date.now() - start >= timeout) {
        return reject(new Error(`[ui-harness] waitFor timeout (${timeout}ms)`));
      }
      setTimeout(tick, interval);
    };
    tick();
  });
}

export function flushRAF(win = window) {
  return new Promise((resolve) => {
    if (win && typeof win.requestAnimationFrame === 'function') {
      win.requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 16);
    }
  });
}

export function flushMicrotasks() {
  return Promise.resolve();
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ══════════════════════════════════════════════════════════════
// waitFor*
// ══════════════════════════════════════════════════════════════

export function waitForSelector(root, selector, opts = {}) {
  return waitFor(() => {
    if (!root) return null;
    return root.querySelector(selector);
  }, opts);
}

export function waitForNoSelector(root, selector, opts = {}) {
  return waitFor(() => {
    if (!root) return true;
    return root.querySelector(selector) === null;
  }, opts);
}

export function waitForVisible(root, selector, opts = {}) {
  return waitFor(() => {
    if (!root) return null;
    const node = root.querySelector(selector);
    if (!node) return null;
    const win = node.ownerDocument.defaultView;
    const cs = win.getComputedStyle(node);
    if (cs.display === 'none') return null;
    if (cs.visibility === 'hidden') return null;
    if (node.offsetParent === null && cs.position !== 'fixed') return null;
    return node;
  }, opts);
}

export function waitForHidden(root, selector, opts = {}) {
  return waitFor(() => {
    if (!root) return true;
    const node = root.querySelector(selector);
    if (!node) return true;
    const win = node.ownerDocument.defaultView;
    const cs = win.getComputedStyle(node);
    if (cs.display === 'none') return true;
    if (cs.visibility === 'hidden') return true;
    if (node.offsetParent === null && cs.position !== 'fixed') return true;
    return false;
  }, opts);
}

export function waitForClass(root, selector, cls, opts = {}) {
  return waitFor(() => {
    if (!root) return null;
    const node = root.querySelector(selector);
    if (!node) return null;
    return node.classList.contains(cls) ? node : null;
  }, opts);
}

export function waitForNoClass(root, selector, cls, opts = {}) {
  return waitFor(() => {
    if (!root) return null;
    const node = root.querySelector(selector);
    if (!node) return null;
    return node.classList.contains(cls) ? null : node;
  }, opts);
}

export function waitForEmitCount(spy, n, opts = {}) {
  return waitFor(() => spy && spy.count() >= n, opts);
}

// ══════════════════════════════════════════════════════════════
// Synthetic events
// ══════════════════════════════════════════════════════════════

export function dispatchClick(node) {
  const win = node.ownerDocument?.defaultView || node.defaultView || window;
  const ev = new win.MouseEvent('click', { bubbles: true, cancelable: true });
  node.dispatchEvent(ev);
}

export function dispatchMouse(node, type, { clientX = 0, clientY = 0, button = 0 } = {}) {
  const win = node.ownerDocument?.defaultView || node.defaultView || window;
  const ev = new win.MouseEvent(type, {
    bubbles: true, cancelable: true, clientX, clientY, button,
  });
  node.dispatchEvent(ev);
}

export function dispatchKey(node, key, {
  shift = false, ctrl = false, meta = false, alt = false,
} = {}) {
  const win = node.ownerDocument?.defaultView || node.defaultView || window;
  const ev = new win.KeyboardEvent('keydown', {
    key, bubbles: true, cancelable: true,
    shiftKey: shift, ctrlKey: ctrl, metaKey: meta, altKey: alt,
  });
  node.dispatchEvent(ev);
}

export function dispatchInput(node, value) {
  node.value = String(value ?? '');
  const win = node.ownerDocument?.defaultView || node.defaultView || window;
  const ev = new win.Event('input', { bubbles: true });
  node.dispatchEvent(ev);
}

export function dispatchCustom(node, type, detail = null) {
  const win = node.ownerDocument?.defaultView || node.defaultView || window;
  const ev = new win.CustomEvent(type, { bubbles: true, detail });
  node.dispatchEvent(ev);
}

export function focusNode(node) {
  try { node.focus({ preventScroll: true }); }
  catch { try { node.focus(); } catch { /* isola */ } }
}

export function blurNode(node) {
  try { node.blur(); } catch { /* isola */ }
}

// ══════════════════════════════════════════════════════════════
// Assertions
// ══════════════════════════════════════════════════════════════

export class AssertionError extends Error {
  constructor(message, { expected, actual, node, snapshot } = {}) {
    super(message);
    this.name = 'AssertionError';
    this.expected = expected;
    this.actual = actual;
    this.node = node ?? null;
    this.snapshot = snapshot ?? (node ? snapshotNode(node) : null);
    if (Error.captureStackTrace) Error.captureStackTrace(this, AssertionError);
  }
}

export function assertVisible(node) {
  if (!node) throw new AssertionError('assertVisible: node é null/undefined');
  const win = node.ownerDocument.defaultView;
  const cs = win.getComputedStyle(node);
  if (cs.display === 'none') {
    throw new AssertionError('assertVisible: display é none', {
      node, expected: 'display != none', actual: cs.display,
    });
  }
  if (cs.visibility === 'hidden') {
    throw new AssertionError('assertVisible: visibility é hidden', {
      node, expected: 'visibility != hidden', actual: cs.visibility,
    });
  }
  if (node.offsetParent === null && cs.position !== 'fixed') {
    throw new AssertionError('assertVisible: offsetParent é null', { node });
  }
}

export function assertHidden(node) {
  if (!node) throw new AssertionError('assertHidden: node é null/undefined');
  const win = node.ownerDocument.defaultView;
  const cs = win.getComputedStyle(node);
  const isHidden =
    cs.display === 'none' ||
    cs.visibility === 'hidden' ||
    (node.offsetParent === null && cs.position !== 'fixed');
  if (!isHidden) {
    throw new AssertionError('assertHidden: node está visível', { node });
  }
}

export function assertHasClass(node, cls) {
  if (!node) throw new AssertionError(`assertHasClass: node é null (esperado "${cls}")`);
  if (!node.classList.contains(cls)) {
    throw new AssertionError(`assertHasClass: falta classe "${cls}"`, {
      node, expected: cls, actual: Array.from(node.classList).join(' ') || '(vazio)',
    });
  }
}

export function assertNotHasClass(node, cls) {
  if (!node) throw new AssertionError(`assertNotHasClass: node é null (esperado sem "${cls}")`);
  if (node.classList.contains(cls)) {
    throw new AssertionError(`assertNotHasClass: tem classe "${cls}"`, { node });
  }
}

export function assertText(node, expected) {
  if (!node) throw new AssertionError(`assertText: node é null (esperado "${expected}")`);
  const actual = (node.textContent ?? '').trim();
  if (actual !== String(expected).trim()) {
    throw new AssertionError(
      `assertText: esperado "${expected}", obtido "${actual}"`,
      { node, expected, actual }
    );
  }
}

export function assertContainsText(node, substring) {
  if (!node) throw new AssertionError(`assertContainsText: node é null (esperado "${substring}")`);
  const actual = String(node.textContent ?? '');
  if (!actual.includes(String(substring))) {
    throw new AssertionError(
      `assertContainsText: esperado conter "${substring}", obtido "${actual.slice(0, 120)}"`,
      { node, expected: substring, actual }
    );
  }
}

export function assertValue(input, expected) {
  if (!input) throw new AssertionError('assertValue: node é null');
  const actual = String(input.value ?? '');
  if (actual !== String(expected)) {
    throw new AssertionError(
      `assertValue: esperado "${expected}", obtido "${actual}"`,
      { node: input, expected, actual }
    );
  }
}

export function assertSelector(root, selector) {
  if (!root) throw new AssertionError('assertSelector: root é null');
  const found = root.querySelector(selector);
  if (!found) {
    throw new AssertionError(`assertSelector: "${selector}" não encontrado`, {
      node: root, expected: selector, actual: '(ausente)',
    });
  }
  return found;
}

export function assertNoSelector(root, selector) {
  if (!root) throw new AssertionError('assertNoSelector: root é null');
  const found = root.querySelector(selector);
  if (found) {
    throw new AssertionError(`assertNoSelector: "${selector}" existe mas não devia`, {
      node: root, expected: '(ausente)', actual: selector,
    });
  }
}

export function assertCount(root, selector, expected) {
  if (!root) throw new AssertionError('assertCount: root é null');
  const found = root.querySelectorAll(selector);
  if (found.length !== expected) {
    throw new AssertionError(
      `assertCount: esperado ${expected} "${selector}", obtido ${found.length}`,
      { node: root, expected, actual: found.length }
    );
  }
}

export function assertEmitCount(spy, expected) {
  if (!spy) throw new AssertionError('assertEmitCount: spy é null');
  if (spy.count() !== expected) {
    throw new AssertionError(
      `assertEmitCount: esperado ${expected}, obtido ${spy.count()}`,
      { expected, actual: spy.count() }
    );
  }
}

export function assertEmitWith(spy, predicate) {
  if (!spy) throw new AssertionError('assertEmitWith: spy é null');
  const match = spy.calls.find((c) => {
    try { return predicate(c); } catch { return false; }
  });
  if (!match) {
    throw new AssertionError('assertEmitWith: nenhum payload satisfez o predicado', {
      expected: predicate.toString(),
      actual: `${spy.count()} chamadas`,
    });
  }
  return match;
}

// ══════════════════════════════════════════════════════════════
// DOM utilities
// ══════════════════════════════════════════════════════════════

export function findByText(root, selector, substring) {
  if (!root) return null;
  const candidates = root.querySelectorAll(selector);
  const needle = String(substring);
  for (const node of candidates) {
    if (String(node.textContent ?? '').includes(needle)) return node;
  }
  return null;
}

export function countByText(root, selector, substring) {
  if (!root) return 0;
  const candidates = root.querySelectorAll(selector);
  const needle = String(substring);
  let n = 0;
  for (const node of candidates) {
    if (String(node.textContent ?? '').includes(needle)) n++;
  }
  return n;
}

export function snapshotNode(node, depth = 3) {
  if (!node || depth < 0) return null;
  const classes = node.classList ? Array.from(node.classList) : [];
  const children = node.children ? Array.from(node.children) : [];
  const text = children.length === 0
    ? String(node.textContent ?? '').slice(0, 80)
    : null;

  let visible = null;
  try {
    const win = node.ownerDocument.defaultView;
    const cs = win.getComputedStyle(node);
    visible = cs.display !== 'none' && cs.visibility !== 'hidden';
  } catch { /* isola */ }

  return {
    tag: node.tagName?.toLowerCase() ?? null,
    id: node.id || null,
    classes,
    visible,
    text,
    children: children.slice(0, 12).map((c) => snapshotNode(c, depth - 1)),
  };
}

export function isVisible(node) {
  if (!node) return false;
  try {
    const win = node.ownerDocument.defaultView;
    const cs = win.getComputedStyle(node);
    if (cs.display === 'none') return false;
    if (cs.visibility === 'hidden') return false;
    if (node.offsetParent === null && cs.position !== 'fixed') return false;
    return true;
  } catch {
    return false;
  }
}