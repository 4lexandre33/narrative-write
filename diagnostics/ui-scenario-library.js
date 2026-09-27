/**
 * @file ui-scenario-library.js
 * @module diagnostics
 * @description Catálogo de cenários de UI. Puro dado.
 * @imports — (nenhum)
 * @importedBy diagnostics/ui-battery
 * @level 9
 *
 * Fase E — fase `flow` roda contra pipeline sandbox real.
 * Setup/act/expect recebem `ctx.sandbox` (UI sandbox), `ctx.machine`
 * (pipeline sandbox machine), `ctx.world`, `ctx.bus`, `ctx.doc`, `ctx.win`.
 *
 * Uso típico:
 *   setup: (ctx) => { ctx.app = ctx.sandbox.mountFullUI(ctx.machine); }
 *   act:   (ctx) => { ctx.machine.handleLine('ent.create.character Kaelin'); }
 *   expect: [ { check: 'selector', selector: '.tree-item[data-id="Kaelin"]' } ]
 */

export const UI_PHASE_ORDER = Object.freeze([
  'primitives',
  'editor',
  'overlays',
  'flow',
]);

export const UI_SCENARIOS = Object.freeze([

  // ══════════════════════════════════════════════════════════
  // FASE B — primitives (15)
  // ══════════════════════════════════════════════════════════

  {
    name: 'toast-appears-and-dismisses',
    phase: 'primitives',
    category: 'mount',
    description: 'Toast aparece e some sozinho após duration',
    setup: (ctx) => {
      ctx.toast = ctx.sandbox.mount(ctx.ToastManager, ctx.sandbox.container);
    },
    act: (ctx) => {
      ctx.toast.show('mensagem de teste', { duration: 80 });
    },
    expect: (ctx) => [
      { check: 'count', selector: '.toast', equal: 1 },
      { check: 'fn', name: 'some depois de 400ms', fn: async () => {
        await new Promise(r => setTimeout(r, 400));
        return ctx.sandbox.container.querySelectorAll('.toast').length === 0;
      }},
    ],
  },

  {
    name: 'toast-stacks-up-to-max',
    phase: 'primitives',
    category: 'structure',
    description: 'Máximo de 4 toasts simultâneos',
    setup: (ctx) => {
      ctx.toast = ctx.sandbox.mount(ctx.ToastManager, ctx.sandbox.container);
    },
    act: async (ctx) => {
      for (let i = 0; i < 6; i++) ctx.toast.info(`msg ${i}`, 5000);
      await new Promise(r => setTimeout(r, 300));
    },
    expect: [
      { check: 'count', selector: '.toast', equal: 4 },
    ],
  },

  {
    name: 'toast-clear-removes-all',
    phase: 'primitives',
    category: 'cleanup',
    description: 'clear() remove todos os toasts',
    setup: (ctx) => {
      ctx.toast = ctx.sandbox.mount(ctx.ToastManager, ctx.sandbox.container);
    },
    act: async (ctx) => {
      ctx.toast.info('a', 5000);
      ctx.toast.info('b', 5000);
      ctx.toast.info('c', 5000);
      ctx.toast.clear();
      await new Promise(r => setTimeout(r, 300));
    },
    expect: [
      { check: 'count', selector: '.toast', equal: 0 },
    ],
  },

  {
    name: 'modal-open-close',
    phase: 'primitives',
    category: 'mount',
    description: 'Modal abre e fecha com classe .visible',
    setup: (ctx) => {
      ctx.modal = ctx.sandbox.mount(
        ctx.ModalManager,
        { container: ctx.sandbox.container }
      );
    },
    act: (ctx) => {
      ctx.modal.open({ title: 'Título', body: 'Corpo', actions: [] });
    },
    expect: [
      { check: 'hasClass', selector: '.modal-overlay', className: 'visible' },
      { check: 'text', selector: '.modal-title', equal: 'Título' },
      { check: 'text', selector: '.modal-body', equal: 'Corpo' },
    ],
  },

  {
    name: 'modal-confirm-returns-true',
    phase: 'primitives',
    category: 'event-response',
    description: 'confirm() resolve true ao clicar no botão primário',
    setup: (ctx) => {
      ctx.modal = ctx.sandbox.mount(
        ctx.ModalManager,
        { container: ctx.sandbox.container }
      );
      ctx.promise = ctx.modal.confirm('Apagar?', 'Tem certeza?', { danger: true });
      ctx.resolved = null;
      ctx.promise.then((v) => { ctx.resolved = v; });
    },
    act: async (ctx) => {
      await new Promise(r => setTimeout(r, 20));
      const btn = ctx.sandbox.container.querySelector('.modal-btn:last-child');
      btn.click();
      await new Promise(r => setTimeout(r, 20));
    },
    expect: (ctx) => [
      { check: 'fn', name: 'promise resolveu true', fn: () => ctx.resolved === true },
      { check: 'notHasClass', selector: '.modal-overlay', className: 'visible' },
    ],
  },

  {
    name: 'modal-prompt-returns-value',
    phase: 'primitives',
    category: 'event-response',
    description: 'prompt() resolve com o valor do input',
    setup: (ctx) => {
      ctx.modal = ctx.sandbox.mount(
        ctx.ModalManager,
        { container: ctx.sandbox.container }
      );
      ctx.promise = ctx.modal.prompt('Nome', 'default');
      ctx.resolved = null;
      ctx.promise.then((v) => { ctx.resolved = v; });
    },
    act: async (ctx) => {
      await new Promise(r => setTimeout(r, 60));
      const input = ctx.sandbox.container.querySelector('.modal-body input');
      input.value = 'Kaelin';
      const btn = ctx.sandbox.container.querySelector('.modal-btn:last-child');
      btn.click();
      await new Promise(r => setTimeout(r, 20));
    },
    expect: (ctx) => [
      { check: 'fn', name: 'promise resolveu "Kaelin"', fn: () => ctx.resolved === 'Kaelin' },
    ],
  },

  {
    name: 'panel-left-mounts-empty',
    phase: 'primitives',
    category: 'mount',
    description: 'PanelLeft em mundo vazio mostra .tree-empty',
    act: (ctx) => {
      ctx.panel = ctx.sandbox.mount(
        ctx.PanelLeft,
        ctx.machine,
        ctx.sandbox.container
      );
    },
    expect: [
      { check: 'selector', selector: '.tree-empty' },
      { check: 'noSelector', selector: '.tree-item' },
    ],
  },

  {
    name: 'panel-left-renders-entities',
    phase: 'primitives',
    category: 'data-binding',
    description: 'Criar entidades aparece na árvore',
    setup: (ctx) => {
      ctx.machine.world.createEntity({
        Identity: { id: 'CHR-KAE', name: 'Kaelin', description: '', type: 'character' },
        Meta: { createdAt: 'T0', updatedAt: 'T0', builtin: false, dirty: false },
      }, { id: 'Kaelin' });
      ctx.machine.world.createEntity({
        Identity: { id: 'LOC-CIN', name: 'Cinza', description: '', type: 'location' },
        Meta: { createdAt: 'T0', updatedAt: 'T0', builtin: false, dirty: false },
      }, { id: 'Cinza' });
    },
    act: (ctx) => {
      ctx.panel = ctx.sandbox.mount(
        ctx.PanelLeft,
        ctx.machine,
        ctx.sandbox.container
      );
    },
    expect: [
      { check: 'count', selector: '.tree-item', equal: 2 },
      { check: 'selector', selector: '.tree-item[data-id="Kaelin"]' },
    ],
  },

  {
    name: 'panel-left-destroy-clears',
    phase: 'primitives',
    category: 'cleanup',
    description: 'destroy() remove os filhos do container',
    act: (ctx) => {
      const panel = ctx.sandbox.mount(
        ctx.PanelLeft,
        ctx.machine,
        ctx.sandbox.container
      );
      panel.destroy();
    },
    expect: [
      { check: 'count', selector: '.tree-section', equal: 0 },
      { check: 'count', selector: '.tree-empty',  equal: 0 },
    ],
  },

  {
    name: 'panel-right-renders-card',
    phase: 'primitives',
    category: 'data-binding',
    description: 'PanelRight.update com kind:card renderiza título e rows',
    act: (ctx) => {
      ctx.panel = ctx.sandbox.mount(
        ctx.PanelRight,
        ctx.machine,
        ctx.sandbox.container
      );
      ctx.panel.update({
        kind: 'card',
        title: 'Ficha de Kaelin',
        data: { fear: 3, courage: 5 },
      });
    },
    expect: [
      { check: 'text', selector: '.result-title', equal: 'Ficha de Kaelin' },
      { check: 'count', selector: '.result-row', equal: 2 },
    ],
  },

  {
    name: 'panel-right-renders-table',
    phase: 'primitives',
    category: 'data-binding',
    description: 'PanelRight.update com kind:table renderiza <table>',
    act: (ctx) => {
      ctx.panel = ctx.sandbox.mount(
        ctx.PanelRight,
        ctx.machine,
        ctx.sandbox.container
      );
      ctx.panel.update({
        kind: 'table',
        title: 'Entidades',
        data: [
          { name: 'Kaelin', type: 'character' },
          { name: 'Cinza',  type: 'location'  },
        ],
      });
    },
    expect: [
      { check: 'selector', selector: '.result-table' },
      { check: 'count', selector: '.result-table tbody tr', equal: 2 },
      { check: 'text', selector: '.result-table tbody tr:first-child td:first-child', equal: 'Kaelin' },
    ],
  },

  {
    name: 'panel-right-renders-alerts',
    phase: 'primitives',
    category: 'data-binding',
    description: 'PanelRight.update com kind:alerts renderiza alert rows',
    act: (ctx) => {
      ctx.panel = ctx.sandbox.mount(
        ctx.PanelRight,
        ctx.machine,
        ctx.sandbox.container
      );
      ctx.panel.update({
        kind: 'alerts',
        title: 'Auditoria',
        data: {
          alerts: [
            { level: 'error', code: 'LINK_DANGLING', from: 'Kaelin', rel: 'location', to: 'X' },
            { level: 'info',  code: 'RULE_NEVER_FIRED', rule: 'goblins' },
          ],
        },
      });
    },
    expect: [
      { check: 'count', selector: '.alert-row', equal: 2 },
      { check: 'hasClass', selector: '.alert-row', className: 'error' },
      { check: 'text', selector: '.alert-code', equal: 'LINK_DANGLING' },
    ],
  },

  {
    name: 'floating-menu-open-close',
    phase: 'primitives',
    category: 'mount',
    description: 'Menu abre com itens e fecha com close()',
    act: (ctx) => {
      ctx.menu = ctx.sandbox.mount(
        ctx.FloatingMenu,
        ctx.machine,
        { container: ctx.sandbox.container }
      );
      ctx.menu.open({
        trigger: 'per.',
        items: [
          { id: 'a', trigger: 'per.kaelin', type: 'text',   source: 'user',    body: 'Kaelin' },
          { id: 'b', trigger: 'per.mira',   type: 'text',   source: 'builtin', body: 'Mira'   },
        ],
        cursor: { x: 100, y: 100 },
      });
    },
    expect: [
      { check: 'hasClass', selector: '.narrative-floating-menu', className: 'visible' },
      { check: 'count', selector: '.menu-item', equal: 2 },
      { check: 'hasClass', selector: '.menu-item[data-index="0"]', className: 'selected' },
    ],
  },

  {
    name: 'floating-menu-confirm-text',
    phase: 'primitives',
    category: 'event-dispatch',
    description: 'Confirmar item de texto emite ui:snippet:insert',
    setup: (ctx) => {
      ctx.spy = ctx.sandbox.spyOn(ctx.machine.bus, 'ui:snippet:insert');
    },
    act: (ctx) => {
      ctx.menu = ctx.sandbox.mount(
        ctx.FloatingMenu,
        ctx.machine,
        { container: ctx.sandbox.container }
      );
      ctx.menu.open({
        trigger: 'per.',
        items: [
          { id: 'a', trigger: 'per.kaelin', type: 'text', source: 'user', body: 'Kaelin' },
        ],
        cursor: { x: 100, y: 100 },
      });
      ctx.menu.confirm();
    },
    expect: (ctx) => [
      { check: 'emitCount', spy: ctx.spy, equal: 1 },
      { check: 'emitWith', spy: ctx.spy, predicate: (p) => p.text === 'Kaelin' },
      { check: 'notHasClass', selector: '.narrative-floating-menu', className: 'visible' },
    ],
  },

  {
    name: 'floating-menu-keyboard-nav',
    phase: 'primitives',
    category: 'keyboard',
    description: 'moveSelection avança e volta circularmente',
    act: (ctx) => {
      ctx.menu = ctx.sandbox.mount(
        ctx.FloatingMenu,
        ctx.machine,
        { container: ctx.sandbox.container }
      );
      ctx.menu.open({
        trigger: 'x.',
        items: [
          { id: '1', trigger: 'x.a', type: 'text', source: 'user', body: 'a' },
          { id: '2', trigger: 'x.b', type: 'text', source: 'user', body: 'b' },
          { id: '3', trigger: 'x.c', type: 'text', source: 'user', body: 'c' },
        ],
        cursor: { x: 100, y: 100 },
      });
      ctx.menu.moveSelection(1);
      ctx.menu.moveSelection(1);
    },
    expect: [
      { check: 'hasClass', selector: '.menu-item[data-index="2"]', className: 'selected' },
    ],
  },

  // ══════════════════════════════════════════════════════════
  // FASE C — editor (12)
  // ══════════════════════════════════════════════════════════

  {
    name: 'editor-mounts',
    phase: 'editor',
    category: 'mount',
    description: 'Editor monta textarea + backdrop + annotations + inline',
    act: (ctx) => {
      ctx.editor = ctx.sandbox.mount(
        ctx.Editor,
        ctx.machine,
        ctx.sandbox.container
      );
    },
    expect: [
      { check: 'selector', selector: '.editor-wrapper' },
      { check: 'selector', selector: '.editor-backdrop' },
      { check: 'selector', selector: '.editor-input' },
      { check: 'selector', selector: '.editor-annotations' },
      { check: 'selector', selector: '.editor-inline-template' },
    ],
  },

  {
    name: 'editor-insert-at-cursor',
    phase: 'editor',
    category: 'data-binding',
    description: 'insert() insere na posição do cursor',
    setup: (ctx) => {
      ctx.editor = ctx.sandbox.mount(
        ctx.Editor,
        ctx.machine,
        ctx.sandbox.container
      );
    },
    act: (ctx) => {
      const ta = ctx.sandbox.container.querySelector('.editor-input');
      ta.value = 'abcdef';
      ta.selectionStart = 3;
      ta.selectionEnd = 3;
      ctx.editor.insert('XYZ');
    },
    expect: (ctx) => [
      { check: 'fn', name: 'valor = abcXYZdef', fn: () => {
        const ta = ctx.sandbox.container.querySelector('.editor-input');
        return ta.value === 'abcXYZdef';
      }},
      { check: 'fn', name: 'cursor após insert = 6', fn: () => {
        const ta = ctx.sandbox.container.querySelector('.editor-input');
        return ta.selectionStart === 6;
      }},
    ],
  },

  {
    name: 'editor-enter-classifies-command',
    phase: 'editor',
    category: 'event-dispatch',
    description: 'Enter em comando chama machine.handleLine com a linha exata',
    setup: (ctx) => {
      ctx.editor = ctx.sandbox.mount(
        ctx.Editor,
        ctx.machine,
        ctx.sandbox.container
      );
      ctx.calls = [];
      ctx.machine.handleLine = (line) => {
        ctx.calls.push(line);
        return { ok: true, mutated: false };
      };
    },
    act: (ctx) => {
      const ta = ctx.sandbox.container.querySelector('.editor-input');
      ta.value = 'mut.add.stats Kaelin.fear 3';
      ta.selectionStart = ta.value.length;
      ta.selectionEnd = ta.value.length;
      ta.dispatchEvent(new ctx.win.KeyboardEvent('keydown', {
        key: 'Enter', bubbles: true, cancelable: true,
      }));
    },
    expect: (ctx) => [
      { check: 'fn', name: 'handleLine chamado 1x', fn: () => ctx.calls.length === 1 },
      { check: 'fn', name: 'com linha correta', fn: () => ctx.calls[0] === 'mut.add.stats Kaelin.fear 3' },
    ],
  },

  {
    name: 'editor-enter-keeps-prose',
    phase: 'editor',
    category: 'event-dispatch',
    description: 'Enter em prosa não chama machine.handleLine',
    setup: (ctx) => {
      ctx.editor = ctx.sandbox.mount(
        ctx.Editor,
        ctx.machine,
        ctx.sandbox.container
      );
      ctx.calls = [];
      ctx.machine.handleLine = (line) => {
        ctx.calls.push(line);
        return { ok: true };
      };
    },
    act: (ctx) => {
      const ta = ctx.sandbox.container.querySelector('.editor-input');
      ta.value = 'Era uma vez, num reino distante...';
      ta.selectionStart = ta.value.length;
      ta.selectionEnd = ta.value.length;
      ta.dispatchEvent(new ctx.win.KeyboardEvent('keydown', {
        key: 'Enter', bubbles: true, cancelable: true,
      }));
    },
    expect: (ctx) => [
      { check: 'fn', name: 'handleLine NÃO chamado', fn: () => ctx.calls.length === 0 },
      { check: 'fn', name: 'texto preservado', fn: () => {
        const ta = ctx.sandbox.container.querySelector('.editor-input');
        return ta.value.includes('Era uma vez');
      }},
    ],
  },

  {
    name: 'editor-enter-clears-command-line',
    phase: 'editor',
    category: 'event-response',
    description: 'Enter em comando bem-sucedido limpa a linha do textarea',
    setup: (ctx) => {
      ctx.editor = ctx.sandbox.mount(
        ctx.Editor,
        ctx.machine,
        ctx.sandbox.container
      );
      ctx.machine.handleLine = () => ({ ok: true, mutated: true });
    },
    act: (ctx) => {
      const ta = ctx.sandbox.container.querySelector('.editor-input');
      ta.value = 'mut.add.stats Kaelin.fear 3';
      ta.selectionStart = ta.value.length;
      ta.selectionEnd = ta.value.length;
      ta.dispatchEvent(new ctx.win.KeyboardEvent('keydown', {
        key: 'Enter', bubbles: true, cancelable: true,
      }));
    },
    expect: (ctx) => [
      { check: 'fn', name: 'linha vazia após Enter', fn: () => {
        const ta = ctx.sandbox.container.querySelector('.editor-input');
        return ta.value.trim() === '';
      }},
    ],
  },

  {
    name: 'editor-ctrl-shift-r-reveals-block',
    phase: 'editor',
    category: 'event-dispatch',
    description: 'Ctrl+Shift+R sobre bloco escondido revela o conteúdo',
    setup: (ctx) => {
      ctx.editor = ctx.sandbox.mount(
        ctx.Editor,
        ctx.machine,
        ctx.sandbox.container
      );
    },
    act: (ctx) => {
      const BLOCK_START = '\u2063\u2063\u2063';
      const PAYLOAD_END = '\u2063\u2064\u2063';
      const BLOCK_END   = '\u2064\u2064\u2064';
      const hidden = `before ${BLOCK_START}P${PAYLOAD_END}REVEALED${BLOCK_END} after`;

      const ta = ctx.sandbox.container.querySelector('.editor-input');
      ta.value = hidden;
      const pos = hidden.indexOf('REVEALED') + 4;
      ta.selectionStart = pos;
      ta.selectionEnd = pos;
      ta.dispatchEvent(new ctx.win.KeyboardEvent('keydown', {
        key: 'R', ctrlKey: true, shiftKey: true,
        bubbles: true, cancelable: true,
      }));
    },
    expect: (ctx) => [
      { check: 'fn', name: 'contém REVEALED sem markers', fn: () => {
        const ta = ctx.sandbox.container.querySelector('.editor-input');
        return ta.value.includes('REVEALED')
            && !ta.value.includes('\u2063\u2063\u2063');
      }},
      { check: 'fn', name: 'contém before e after', fn: () => {
        const ta = ctx.sandbox.container.querySelector('.editor-input');
        return ta.value.includes('before') && ta.value.includes('after');
      }},
    ],
  },

  {
    name: 'editor-highlighter-applies-class',
    phase: 'editor',
    category: 'async',
    description: 'Após input, backdrop aplica .hl-command (assíncrono)',
    setup: (ctx) => {
      ctx.editor = ctx.sandbox.mount(
        ctx.Editor,
        ctx.machine,
        ctx.sandbox.container
      );
    },
    act: async (ctx) => {
      const ta = ctx.sandbox.container.querySelector('.editor-input');
      ta.value = 'mut.add.stats Kaelin.fear 3';
      ta.selectionStart = ta.value.length;
      ta.selectionEnd = ta.value.length;
      ta.dispatchEvent(new ctx.win.Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 60));
    },
    expect: (ctx) => [
      { check: 'fn', name: 'backdrop tem .hl-command', fn: () => {
        const bd = ctx.sandbox.container.querySelector('.editor-backdrop');
        return bd && bd.innerHTML.includes('hl-command');
      }},
    ],
  },

  {
    name: 'keyboard-router-ctrl-s',
    phase: 'editor',
    category: 'event-dispatch',
    description: 'Ctrl+S emite persist:flush',
    setup: (ctx) => {
      ctx.emits = [];
      ctx.machine.bus.emit = (event, payload) => {
        ctx.emits.push({ event, payload });
      };
      ctx.router = ctx.sandbox.mount(
        ctx.KeyboardRouter,
        ctx.machine,
        {},
        { target: ctx.doc }
      );
    },
    act: (ctx) => {
      ctx.doc.dispatchEvent(new ctx.win.KeyboardEvent('keydown', {
        key: 's', ctrlKey: true, bubbles: true, cancelable: true,
      }));
    },
    expect: (ctx) => [
      { check: 'fn', name: 'emit persist:flush', fn: () =>
        ctx.emits.some(e => e.event === 'persist:flush'),
      },
    ],
  },

  {
    name: 'keyboard-router-ctrl-h',
    phase: 'editor',
    category: 'event-dispatch',
    description: 'Ctrl+H chama historyPanel.toggle()',
    setup: (ctx) => {
      ctx.toggled = 0;
      const stubHistory = {
        visible: false,
        toggle() { ctx.toggled++; },
      };
      ctx.router = ctx.sandbox.mount(
        ctx.KeyboardRouter,
        ctx.machine,
        { historyPanel: stubHistory },
        { target: ctx.doc }
      );
    },
    act: (ctx) => {
      ctx.doc.dispatchEvent(new ctx.win.KeyboardEvent('keydown', {
        key: 'h', ctrlKey: true, bubbles: true, cancelable: true,
      }));
    },
    expect: (ctx) => [
      { check: 'fn', name: 'toggle chamado 1x', fn: () => ctx.toggled === 1 },
    ],
  },

  {
    name: 'keyboard-router-escape-closes-menu',
    phase: 'editor',
    category: 'keyboard',
    description: 'Esc com menu flutuante visível chama floatingMenu.close()',
    setup: (ctx) => {
      ctx.closed = 0;
      const stubMenu = {
        visible: true,
        close() { ctx.closed++; },
      };
      ctx.router = ctx.sandbox.mount(
        ctx.KeyboardRouter,
        ctx.machine,
        { floatingMenu: stubMenu },
        { target: ctx.doc }
      );
    },
    act: (ctx) => {
      ctx.doc.dispatchEvent(new ctx.win.KeyboardEvent('keydown', {
        key: 'Escape', bubbles: true, cancelable: true,
      }));
    },
    expect: (ctx) => [
      { check: 'fn', name: 'close chamado 1x', fn: () => ctx.closed === 1 },
    ],
  },

  {
    name: 'focus-manager-cycle-forward',
    phase: 'editor',
    category: 'focus',
    description: 'cycle(1) avança editor → left → right',
    setup: (ctx) => {
      const container = ctx.sandbox.container;
      ctx.left = ctx.doc.createElement('div');
      ctx.right = ctx.doc.createElement('div');
      ctx.editorEl = ctx.doc.createElement('div');
      container.appendChild(ctx.editorEl);
      container.appendChild(ctx.left);
      container.appendChild(ctx.right);

      ctx.fm = ctx.sandbox.mount(ctx.FocusManager, {
        editor: ctx.editorEl,
        panelLeft: ctx.left,
        panelRight: ctx.right,
      });
    },
    act: (ctx) => {
      ctx.fm.cycle(1);
      ctx.fm.cycle(1);
    },
    expect: (ctx) => [
      { check: 'fn', name: 'right tem .panel-focus', fn: () => ctx.right.classList.contains('panel-focus') },
      { check: 'fn', name: 'left NÃO tem .panel-focus', fn: () => !ctx.left.classList.contains('panel-focus') },
      { check: 'fn', name: 'editor NÃO tem .panel-focus', fn: () => !ctx.editorEl.classList.contains('panel-focus') },
    ],
  },

  {
    name: 'focus-manager-cycle-backward',
    phase: 'editor',
    category: 'focus',
    description: 'cycle(-1) volta editor → right → left',
    setup: (ctx) => {
      const container = ctx.sandbox.container;
      ctx.left = ctx.doc.createElement('div');
      ctx.right = ctx.doc.createElement('div');
      ctx.editorEl = ctx.doc.createElement('div');
      container.appendChild(ctx.editorEl);
      container.appendChild(ctx.left);
      container.appendChild(ctx.right);

      ctx.fm = ctx.sandbox.mount(ctx.FocusManager, {
        editor: ctx.editorEl,
        panelLeft: ctx.left,
        panelRight: ctx.right,
      });
    },
    act: (ctx) => {
      ctx.fm.cycle(-1);
      ctx.fm.cycle(-1);
    },
    expect: (ctx) => [
      { check: 'fn', name: 'left tem .panel-focus', fn: () => ctx.left.classList.contains('panel-focus') },
      { check: 'fn', name: 'right NÃO tem .panel-focus', fn: () => !ctx.right.classList.contains('panel-focus') },
    ],
  },

  // ══════════════════════════════════════════════════════════
  // FASE D — overlays (10)
  // ══════════════════════════════════════════════════════════

  {
    name: 'roll-overlay-start',
    phase: 'overlays',
    category: 'overlay-lifecycle',
    description: 'start() adiciona .visible e renderiza a sequência',
    act: (ctx) => {
      ctx.roll = ctx.sandbox.mount(
        ctx.RollOverlay,
        ctx.machine,
        { container: ctx.sandbox.container, target: ctx.doc }
      );
      ctx.roll.setPicker(() => 'texto');
      ctx.roll.start({
        sequence: ['Apresentação', 'Combate'],
        interval: 5000,
      });
    },
    expect: [
      { check: 'hasClass', selector: '.roll-overlay', className: 'visible' },
      { check: 'count', selector: '.roll-line', equal: 2 },
      { check: 'count', selector: '.roll-line.roll-active', equal: 1 },
    ],
  },

  {
    name: 'roll-overlay-fix-and-commit',
    phase: 'overlays',
    category: 'overlay-lifecycle',
    description: 'fixCurrent() completa a sequência e emite ui:roll:committed',
    setup: (ctx) => {
      ctx.spy = ctx.sandbox.spyOn(ctx.machine.bus, 'ui:roll:committed');
    },
    act: (ctx) => {
      ctx.roll = ctx.sandbox.mount(
        ctx.RollOverlay,
        ctx.machine,
        { container: ctx.sandbox.container, target: ctx.doc }
      );
      ctx.roll.setPicker((cat) => `frase-${cat}`);
      ctx.roll.start({
        sequence: ['A', 'B'],
        interval: 5000,
      });
      ctx.roll.fixCurrent();
      ctx.roll.fixCurrent();
    },
    expect: (ctx) => [
      { check: 'emitCount', spy: ctx.spy, equal: 1 },
      { check: 'emitWith', spy: ctx.spy, predicate: (p) =>
        Array.isArray(p.lines) && p.lines.length === 2,
      },
      { check: 'notHasClass', selector: '.roll-overlay', className: 'visible' },
    ],
  },

  {
    name: 'roll-overlay-cancel',
    phase: 'overlays',
    category: 'overlay-lifecycle',
    description: 'stop(false) emite ui:roll:cancelled',
    setup: (ctx) => {
      ctx.roll = ctx.sandbox.mount(
        ctx.RollOverlay,
        ctx.machine,
        { container: ctx.sandbox.container, target: ctx.doc }
      );
      ctx.roll.setPicker(() => 'x');
      ctx.roll.start({
        sequence: ['A'],
        interval: 5000,
      });
      ctx.spy = ctx.sandbox.spyOn(ctx.machine.bus, 'ui:roll:cancelled');
    },
    act: (ctx) => {
      ctx.roll.stop(false);
    },
    expect: (ctx) => [
      { check: 'emitCount', spy: ctx.spy, equal: 1 },
      { check: 'notHasClass', selector: '.roll-overlay', className: 'visible' },
    ],
  },

  {
    name: 'play-overlay-enter-exit',
    phase: 'overlays',
    category: 'overlay-lifecycle',
    description: 'enter() adiciona .visible, exit() remove',
    act: (ctx) => {
      ctx.play = ctx.sandbox.mount(
        ctx.PlayOverlay,
        ctx.machine,
        { container: ctx.sandbox.container, target: ctx.doc }
      );
      ctx.play.enter();
    },
    expect: [
      { check: 'hasClass', selector: '.play-overlay', className: 'visible' },
      { check: 'selector', selector: '.play-header' },
      { check: 'selector', selector: '.play-input-row input' },
    ],
  },

  {
    name: 'play-overlay-input-submits',
    phase: 'overlays',
    category: 'event-dispatch',
    description: 'Digitar no input + Enter chama machine.handleLine',
    setup: (ctx) => {
      ctx.calls = [];
      ctx.machine.handleLine = (line) => {
        ctx.calls.push(line);
        return { ok: true };
      };
      ctx.play = ctx.sandbox.mount(
        ctx.PlayOverlay,
        ctx.machine,
        { container: ctx.sandbox.container, target: ctx.doc }
      );
      ctx.play.enter();
    },
    act: (ctx) => {
      const input = ctx.sandbox.container.querySelector('.play-input-row input');
      input.value = 'ent.list';
      input.dispatchEvent(new ctx.win.KeyboardEvent('keydown', {
        key: 'Enter', bubbles: true, cancelable: true,
      }));
    },
    expect: (ctx) => [
      { check: 'fn', name: 'handleLine chamado 1x', fn: () => ctx.calls.length === 1 },
      { check: 'fn', name: 'com linha ent.list', fn: () => ctx.calls[0] === 'ent.list' },
    ],
  },

  {
    name: 'history-panel-opens-with-entries',
    phase: 'overlays',
    category: 'data-binding',
    description: 'open() renderiza N .history-entry a partir de TimelineSystem',
    setup: (ctx) => {
      ctx.machine.systems = new Map();
      ctx.machine.systems.set('TimelineSystem', {
        getTimeline: () => [
          { tick: 'T0', kind: 'init', mutation: null, created: null, link: null },
          { tick: 'T1', kind: 'mutation',
            mutation: { op: 'add', target: 'Kaelin', path: 'fear' },
            created: null, link: null },
          { tick: 'T2', kind: 'mutation',
            mutation: { op: 'set', target: 'Kaelin', path: 'courage' },
            created: null, link: null },
        ],
      });
      ctx.machine.getTick = () => 'T2';
    },
    act: (ctx) => {
      ctx.hist = ctx.sandbox.mount(
        ctx.HistoryPanel,
        ctx.machine,
        { container: ctx.sandbox.container, target: ctx.doc }
      );
      ctx.hist.open();
    },
    expect: [
      { check: 'hasClass', selector: '.history-panel', className: 'visible' },
      { check: 'count', selector: '.history-entry', equal: 3 },
      { check: 'text', selector: '.history-header',
        equal: 'Histórico (3)' },
    ],
  },

  {
    name: 'history-panel-navigates',
    phase: 'overlays',
    category: 'overlay-lifecycle',
    description: 'moveSelection(1) move a classe .selected',
    setup: (ctx) => {
      ctx.machine.systems = new Map();
      ctx.machine.systems.set('TimelineSystem', {
        getTimeline: () => [
          { tick: 'T0', kind: 'init', mutation: null, created: null, link: null },
          { tick: 'T1', kind: 'mutation',
            mutation: { op: 'add', target: 'Kaelin', path: 'fear' },
            created: null, link: null },
          { tick: 'T2', kind: 'mutation',
            mutation: { op: 'set', target: 'Kaelin', path: 'courage' },
            created: null, link: null },
        ],
      });
      ctx.machine.getTick = () => 'T2';
    },
    act: (ctx) => {
      ctx.hist = ctx.sandbox.mount(
        ctx.HistoryPanel,
        ctx.machine,
        { container: ctx.sandbox.container, target: ctx.doc }
      );
      ctx.hist.open();
      ctx.hist.moveSelection(1);
    },
    expect: [
      { check: 'hasClass', selector: '.history-entry[data-index="1"]', className: 'selected' },
      { check: 'notHasClass', selector: '.history-entry[data-index="0"]', className: 'selected' },
    ],
  },

  {
    name: 'history-panel-jumps',
    phase: 'overlays',
    category: 'event-dispatch',
    description: 'jumpToSelected() chama machine.restoreFrom(tick)',
    setup: (ctx) => {
      ctx.machine.systems = new Map();
      ctx.machine.systems.set('TimelineSystem', {
        getTimeline: () => [
          { tick: 'T0', kind: 'init', mutation: null, created: null, link: null },
          { tick: 'T1', kind: 'mutation',
            mutation: { op: 'add', target: 'Kaelin', path: 'fear' },
            created: null, link: null },
        ],
      });
      ctx.machine.getTick = () => 'T1';
      ctx.restored = [];
      ctx.machine.restoreFrom = (tick) => {
        ctx.restored.push(tick);
        return { ok: true, tick };
      };
    },
    act: (ctx) => {
      ctx.hist = ctx.sandbox.mount(
        ctx.HistoryPanel,
        ctx.machine,
        { container: ctx.sandbox.container, target: ctx.doc }
      );
      ctx.hist.open();
      ctx.hist.jumpToSelected();
    },
    expect: (ctx) => [
      { check: 'fn', name: 'restoreFrom chamado 1x', fn: () => ctx.restored.length === 1 },
      { check: 'fn', name: 'com tick T1', fn: () => ctx.restored[0] === 'T1' },
    ],
  },

  {
    name: 'command-guide-toggle',
    phase: 'overlays',
    category: 'overlay-lifecycle',
    description: 'toggle() alterna .visible e renderiza as seções',
    setup: (ctx) => {
      ctx.machine.registry = {
        getCommands: () => [
          { verb: 'ent', description: 'entidades', examples: ['ent.create.character Kaelin'] },
          { verb: 'mut', description: 'mutação',   examples: ['mut.add.stats Kaelin.fear 3'] },
        ],
      };
    },
    act: (ctx) => {
      ctx.guide = ctx.sandbox.mount(
        ctx.CommandGuide,
        ctx.machine,
        { container: ctx.sandbox.container }
      );
      ctx.guide.toggle();
    },
    expect: [
      { check: 'hasClass', selector: '.command-guide', className: 'visible' },
      { check: 'count', selector: '.guide-section', equal: 2 },
      { check: 'text', selector: '.guide-section:first-child .guide-section-title', equal: 'ent.' },
    ],
  },

  {
    name: 'floating-menu-submenu',
    phase: 'overlays',
    category: 'event-dispatch',
    description: 'Item com def.menu expande em sub-itens ao confirm',
    act: (ctx) => {
      ctx.menu = ctx.sandbox.mount(
        ctx.FloatingMenu,
        ctx.machine,
        { container: ctx.sandbox.container }
      );
      ctx.menu.open({
        trigger: 'per.',
        items: [
          {
            id: 'builtin:per.',
            trigger: 'per.',
            type: 'menu',
            source: 'builtin',
            body: 'menu de personagens',
            def: {
              menu: [
                { key: 'kaelin', label: 'Kaelin' },
                { key: 'mira',   label: 'Mira'   },
                { key: 'selo',   label: 'Selo'   },
              ],
            },
          },
        ],
        cursor: { x: 100, y: 100 },
      });
      ctx.menu.confirm();
    },
    expect: [
      { check: 'count', selector: '.menu-item', equal: 3 },
      { check: 'hasClass', selector: '.menu-item[data-index="0"]', className: 'selected' },
      { check: 'text', selector: '.menu-item[data-index="0"] .menu-item-label', equal: 'Kaelin' },
    ],
  },

  // ══════════════════════════════════════════════════════════
  // FASE E — flow (8)
  // ══════════════════════════════════════════════════════════

  {
    name: 'flow-create-entity-renders',
    phase: 'flow',
    category: 'flow',
    description: 'ent.create aparece na árvore do painel esquerdo',
    setup: (ctx) => {
      ctx.app = ctx.sandbox.mountFullUI(ctx.machine);
    },
    act: async (ctx) => {
      ctx.machine.handleLine('ent.create.character Kaelin');
      await new Promise(r => setTimeout(r, 30));
    },
    expect: (ctx) => [
      { check: 'fn', name: 'tree-item[Kaelin] existe', fn: () => {
        return ctx.sandbox.container.querySelector('.tree-item[data-id="Kaelin"]') !== null;
      }},
    ],
  },

  {
    name: 'flow-mutate-highlights',
    phase: 'flow',
    category: 'flow',
    description: 'mut.add.stats aplica .pulse no tree-item do alvo',
    setup: (ctx) => {
      ctx.machine.handleLine('ent.create.character Kaelin');
      ctx.app = ctx.sandbox.mountFullUI(ctx.machine);
    },
    act: async (ctx) => {
      ctx.machine.handleLine('mut.add.stats Kaelin.fear 3');
      await new Promise(r => setTimeout(r, 30));
    },
    expect: (ctx) => [
      { check: 'fn', name: '.pulse em Kaelin', fn: () => {
        const node = ctx.sandbox.container.querySelector('.tree-item[data-id="Kaelin"]');
        return node !== null && node.classList.contains('pulse');
      }},
    ],
  },

  {
    name: 'flow-tick-header-updates',
    phase: 'flow',
    category: 'flow',
    description: 'Mutação atualiza o tick badge no header',
    setup: (ctx) => {
      ctx.app = ctx.sandbox.mountFullUI(ctx.machine);
    },
    act: async (ctx) => {
      ctx.machine.handleLine('ent.create.character Kaelin');
      await new Promise(r => setTimeout(r, 30));
    },
    expect: (ctx) => [
      { check: 'fn', name: 'tick ≠ T0', fn: () => {
        const badge = ctx.sandbox.container.querySelector('[data-tick]');
        return badge !== null && badge.textContent !== 'T0';
      }},
    ],
  },

  {
    name: 'flow-command-shows-card',
    phase: 'flow',
    category: 'flow',
    description: 'ent.show renderiza card no painel direito',
    setup: (ctx) => {
      ctx.machine.handleLine('ent.create.character Kaelin');
      ctx.app = ctx.sandbox.mountFullUI(ctx.machine);
    },
    act: async (ctx) => {
      ctx.machine.handleLine('ent.show Kaelin');
      await new Promise(r => setTimeout(r, 30));
    },
    expect: (ctx) => [
      { check: 'fn', name: '.result-card existe', fn: () => {
        return ctx.sandbox.container.querySelector('.result-card') !== null;
      }},
    ],
  },

  {
    name: 'flow-error-shows-toast',
    phase: 'flow',
    category: 'flow',
    description: 'Comando inválido exibe toast de erro',
    setup: (ctx) => {
      ctx.app = ctx.sandbox.mountFullUI(ctx.machine);
    },
    act: async (ctx) => {
      const result = ctx.machine.handleLine('mut.add.stats NaoExiste.fear 1');
      if (result.ok === false) {
        ctx.machine.bus.emit('ui:flash-error', { message: result.error });
      }
      await new Promise(r => setTimeout(r, 30));
    },
    expect: (ctx) => [
      { check: 'fn', name: '.toast.error existe', fn: () => {
        return ctx.sandbox.container.querySelector('.toast.error') !== null;
      }},
    ],
  },

  {
    name: 'flow-save-pulses-indicator',
    phase: 'flow',
    category: 'flow',
    description: '/save marca o save indicator com .pulse',
    setup: (ctx) => {
      ctx.app = ctx.sandbox.mountFullUI(ctx.machine);
    },
    act: async (ctx) => {
      ctx.machine.handleLine('/save');
      await new Promise(r => setTimeout(r, 250));
    },
    expect: (ctx) => [
      { check: 'fn', name: 'save indicator tem .pulse', fn: () => {
        const dot = ctx.sandbox.container.querySelector('[data-save-indicator]');
        return dot !== null && dot.classList.contains('pulse');
      }},
    ],
  },

  {
    name: 'flow-export-shows-toast',
    phase: 'flow',
    category: 'flow',
    description: 'exp.json exibe toast de sucesso',
    setup: (ctx) => {
      ctx.app = ctx.sandbox.mountFullUI(ctx.machine);
    },
    act: async (ctx) => {
      ctx.machine.handleLine('exp.json');
      await new Promise(r => setTimeout(r, 50));
    },
    expect: (ctx) => [
      { check: 'fn', name: '.toast.success existe', fn: () => {
        return ctx.sandbox.container.querySelector('.toast.success') !== null;
      }},
    ],
  },

  {
    name: 'flow-full-narrative',
    phase: 'flow',
    category: 'flow',
    description: 'Fluxo completo: criar + link + mutar + mostrar',
    setup: (ctx) => {
      ctx.app = ctx.sandbox.mountFullUI(ctx.machine);
    },
    act: async (ctx) => {
      ctx.machine.handleLine('ent.create.character Kaelin');
      ctx.machine.handleLine('ent.create.location Cinza');
      ctx.machine.handleLine('link.set.location Kaelin Cinza');
      ctx.machine.handleLine('mut.add.stats Kaelin.fear 3');
      ctx.machine.handleLine('ent.show Kaelin');
      await new Promise(r => setTimeout(r, 50));
    },
    expect: (ctx) => [
      { check: 'fn', name: 'Kaelin na árvore', fn: () => {
        return ctx.sandbox.container.querySelector('.tree-item[data-id="Kaelin"]') !== null;
      }},
      { check: 'fn', name: 'Cinza na árvore', fn: () => {
        return ctx.sandbox.container.querySelector('.tree-item[data-id="Cinza"]') !== null;
      }},
      { check: 'fn', name: 'result-card no painel direito', fn: () => {
        return ctx.sandbox.container.querySelector('.result-card') !== null;
      }},
      { check: 'fn', name: 'tick avançou', fn: () => {
        const badge = ctx.sandbox.container.querySelector('[data-tick]');
        return badge !== null && badge.textContent !== 'T0';
      }},
    ],
  },

]);

// ══════════════════════════════════════════════════════════════
// Consultas
// ══════════════════════════════════════════════════════════════

export function getUIScenario(name) {
  if (!name) return null;
  return UI_SCENARIOS.find(s => s.name === name) ?? null;
}

export function listUIPhases() {
  const set = new Set();
  for (const s of UI_SCENARIOS) set.add(s.phase);
  return Array.from(set);
}

export function listUICategories() {
  const set = new Set();
  for (const s of UI_SCENARIOS) set.add(s.category);
  return set.size > 0 ? Array.from(set).sort() : [];
}

export function countByPhase() {
  const out = {};
  for (const s of UI_SCENARIOS) {
    out[s.phase] = (out[s.phase] ?? 0) + 1;
  }
  return out;
}