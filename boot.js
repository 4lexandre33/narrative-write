/**
 * @file boot.js
 * @module boot
 * @description Ponto de entrada. Orquestra infraestrutura, sistemas, registries, UI.
 * @level 13
 *
 * Fase 6 boot: adiciona botão 📖 no header; função
 *              `wireNarrativeModeButton` que cicla modos;
 *              instancia `NarrativeOverlay` (Fase 6).
 *
 * Fase 13 boot: importa e registra `PhraseSystem` (phr.*).
 *
 * Fase 13.7 (auditoria 25/09/2026):
 *   Instala `SystemCanary` para detectar divergência entre boot e sandbox.
 *
 * Camada 1 (backend NLP):
 *   Inicializa o `Adapter` com backend `spacy` via HTTP antes de
 *   registrar os sistemas. Se o servidor estiver indisponível, cai
 *   silenciosamente para heurística e o boot continua.
 */

// ══════════════════════════════════════════════════════════════
// 1. IMPORTS
// ══════════════════════════════════════════════════════════════

import { EventBus } from './ecs/event-bus.js';
import { World } from './ecs/world.js';
import { Machine } from './context-machine/machine.js';

import { Adapter } from './narrative-language/pt-br/adapter.js';

import { ParseSystem } from './systems/parse-system.js';
import { CommandSystem } from './systems/command-system.js';
import { EntitySystem } from './systems/entity-system.js';
import { IdentitySystem } from './systems/identity-system.js';
import { InstantiationSystem } from './systems/instantiation-system.js';
import { InheritanceSystem } from './systems/inheritance-system.js';
import { MutationSystem } from './systems/mutation-system.js';
import { LinkSystem } from './systems/link-system.js';
import { LinkQuerySystem } from './systems/link-query-system.js';
import { QuerySystem } from './systems/query-system.js';
import { SearchQuerySystem } from './systems/search-query-system.js';
import { KnowledgeSystem } from './systems/knowledge-system.js';
import { SearchSystem } from './systems/search-system.js';
import { SnippetSystem } from './systems/snippet-system.js';
import { TemplateSystem } from './systems/template-system.js';
import { RuleSystem } from './systems/rule-system.js';
import { ManualRuleSystem } from './systems/manual-rule-system.js';
import { PhraseSystem } from './systems/phrase-system.js';
import { DiagnosticsSystem } from './systems/diagnostics-system.js';
import { TimelineSystem } from './systems/timeline-system.js';
import { StaleSystem } from './systems/stale-system.js';
import { AuditSystem } from './systems/audit-system.js';
import { ForkSystem } from './systems/fork-system.js';
import { DiffSystem } from './systems/diff-system.js';
import { ValidationSystem } from './systems/validation-system.js';
import { ExportSystem } from './systems/export-system.js';
import { HelpSystem } from './systems/help-system.js';
import { SlashCommandSystem } from './systems/slash-command-system.js';
import { RenderSystem } from './systems/render-system.js';
import { NarrativeSystem } from './systems/narrative-system.js';
import { PersistenceSystem } from './systems/persistence-system.js';
import { SeedSystem } from './systems/seed-system.js';

import { GMStorageAdapter } from './data/storage-gm.js';
import { LocalStorageAdapter } from './data/storage-ls.js';
import { IndexedDBAdapter } from './data/storage-idb.js';

import { bootstrapRegistries } from './schemas/bootstrap.js';

import { ToastManager } from './ui/toast.js';
import { ModalManager } from './ui/modal.js';
import { FocusManager } from './ui/focus-manager.js';
import { PanelLeft } from './ui/panel-left.js';
import { PanelRight } from './ui/panel-right.js';
import { FloatingMenu } from './ui/floating-menu.js';
import { HistoryPanel } from './ui/history-panel.js';
import { RollOverlay } from './ui/roll-overlay.js';
import { PlayOverlay } from './ui/play-overlay.js';
import { CommandGuide } from './ui/command-guide.js';
import { KeyboardRouter } from './ui/keyboard-router.js';
import { NarrativeOverlay } from './ui/narrative-overlay.js';

import { wireUI, updateNarrativeButton, cycleNarrativeMode } from './ui/ui-wires.js';

import { Editor } from './editor/editor.js';

import { DiagnosticsSuite } from './diagnostics/index.js';

// Import por efeito colateral: registra window.__UIBattery para inspeção manual
import './diagnostics/ui-battery.js';

import { STORAGE_KEYS, APP_VERSION, APP_NAME } from './core/constants.js';
import { el } from './core/utils/dom.js';
import { nowISO } from './core/utils/time.js';
import { deepClone } from './core/utils/object.js';

// ══════════════════════════════════════════════════════════════
// 2. GUARDS INICIAIS
// ══════════════════════════════════════════════════════════════

if (typeof window !== 'undefined') {
  if (window.top !== window.self) {
    // Não roda em iframe — aborta silenciosamente
  } else if (!window.__NarrativeAppLoaded) {
    window.__NarrativeAppLoaded = true;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => bootstrap().catch(console.error));
    } else {
      bootstrap().catch(console.error);
    }
  }
}

// ══════════════════════════════════════════════════════════════
// 3. BOOTSTRAP PRINCIPAL
// ══════════════════════════════════════════════════════════════

async function bootstrap() {
  const bus = new EventBus();
  const world = new World({ bus });
  const machine = new Machine({ world, bus });

  // ── 1b. Inicializa o Adapter NLP (Camada 1) ─────────────
  // Roda antes do registro de sistemas. O NarrativeSystem usará
  // o backend para analisar prosa assincronamente. Se o servidor
  // spaCy estiver indisponível, cai silenciosamente para heurística.
  try {
    await Adapter.init({ backend: 'spacy' });
    console.log('[boot] NLP backend:', Adapter.backend(), Adapter.version());
  } catch (err) {
    console.warn('[boot] Adapter NLP falhou, continuando em heurística:', err);
  }

  // ── 2. Registro dos sistemas ─────────────────────────────
  machine.registerSystem(new ParseSystem());
  machine.registerSystem(new CommandSystem());
  machine.registerSystem(new EntitySystem());
  machine.registerSystem(new IdentitySystem());
  machine.registerSystem(new InstantiationSystem());
  machine.registerSystem(new InheritanceSystem());
  machine.registerSystem(new MutationSystem());
  machine.registerSystem(new LinkSystem());
  machine.registerSystem(new LinkQuerySystem());
  machine.registerSystem(new QuerySystem());
  machine.registerSystem(new SearchQuerySystem());
  machine.registerSystem(new KnowledgeSystem());
  machine.registerSystem(new SearchSystem());
  machine.registerSystem(new SnippetSystem());
  machine.registerSystem(new TemplateSystem());
  machine.registerSystem(new RuleSystem());
  machine.registerSystem(new ManualRuleSystem());
  machine.registerSystem(new PhraseSystem());
  machine.registerSystem(new DiagnosticsSystem());
  machine.registerSystem(new TimelineSystem());
  machine.registerSystem(new StaleSystem());
  machine.registerSystem(new AuditSystem());
  machine.registerSystem(new ForkSystem());
  machine.registerSystem(new DiffSystem());
  machine.registerSystem(new ValidationSystem());
  machine.registerSystem(new ExportSystem());
  machine.registerSystem(new HelpSystem());
  machine.registerSystem(new SlashCommandSystem());
  machine.registerSystem(new RenderSystem());
  machine.registerSystem(new NarrativeSystem());
  machine.registerSystem(new PersistenceSystem());
  machine.registerSystem(new SeedSystem());

  // ── 2b. Canário de integridade ────────────────────────────
  // Compara a lista de sistemas registrados no boot com a do sandbox
  // de testes. Previne divergência silenciosa (ver auditoria 25/09/2026).
  const { SystemCanary } = await import('./diagnostics/system-canary.js');
  const bootNames = Array.from(machine.systems.keys());
  const canary = new SystemCanary();

  bus.on('sandbox:created', ({ names } = {}) => {
    const report = canary.compare(bootNames, names);
    if (!report.ok) {
      console.warn('[boot] sandbox divergiu do boot:', report);
      bus.emit('canary:divergence', report);
    }
  });

  // ── 3. Registries ────────────────────────────────────────
  bootstrapRegistries(world.registry, machine.registry);

  // ── 4. Adapter de persistência ───────────────────────────
  const adapter = await pickStorageAdapter();
  const persist = machine.systems.get('PersistenceSystem');
  persist.setAdapter(adapter);

  // ── 5. Cold ou warm boot ─────────────────────────────────
  let bootMode = 'cold';
  let bootStats = null;

  try {
    const state = await persist.loadWorld();
    if (state) {
      bootStats = restoreFromState(machine, state);
      bootMode = 'warm';
    } else {
      bootStats = seedFreshWorld(machine, world);
      await persist.flush('seed');
    }
  } catch (err) {
    console.warn('[boot] restore falhou, caindo para cold:', err);
    bootStats = seedFreshWorld(machine, world);
  }

  // ── 6. UI ────────────────────────────────────────────────
  const app = mountUI(machine);

  // ── 6b. Diagnostics Suite ────────────────────────────────
  const diag = new DiagnosticsSuite();
  diag.install(machine, world, bus, { persist });

  // ── 7. Wire de eventos ───────────────────────────────────
  wireUI(machine, app);

  // ── 8. First run ─────────────────────────────────────────
  try {
    const firstRun = await adapter.get(STORAGE_KEYS.META_FIRST_RUN);
    if (!firstRun) {
      await adapter.set(STORAGE_KEYS.META_FIRST_RUN, nowISO());
      app.toast.info(
        '👋 Bem-vindo ao Editor Narrativo. Digite help.tutorial para um tour.',
        6000
      );
    }
  } catch { /* não bloqueia */ }

  // ── 9. API global ────────────────────────────────────────
  window.__NarrativeApp = {
    machine,
    world,
    bus,
    adapter,
    persist,
    diag,
    canary,
    bootMode,
    bootStats,
    version: APP_VERSION,
    name: APP_NAME,
  };

  // ── 10. Notifica ─────────────────────────────────────────
  bus.emit('boot:complete', {
    mode: bootMode,
    tick: machine.getTick(),
    entityCount: world.allEntities().length,
    systemCount: machine.systems.size,
    version: APP_VERSION,
  });

  // ── 10b. Auto-run de testes via URL ──────────────────────
  if (typeof window !== 'undefined' && typeof URLSearchParams === 'function') {
    try {
      const params = new URLSearchParams(window.location.search);
      const testParam = params.get('test');
      if (testParam) {
        const seedParam = params.get('seed');
        const iterParam = params.get('iterations');

        const parts = [`diag.test ${testParam}`];
        if (seedParam) parts.push(`seed=${seedParam}`);
        if (iterParam) parts.push(`iterations=${iterParam}`);
        const command = parts.join(' ');

        setTimeout(() => {
          try {
            machine.handleLine(command);
          } catch (err) {
            console.error('[boot] falha ao rodar bateria via URL:', err);
          }
        }, 600);
      }
    } catch { /* isola */ }
  }

  return window.__NarrativeApp;
}

// ══════════════════════════════════════════════════════════════
// 4. COLD BOOT
// ══════════════════════════════════════════════════════════════

function seedFreshWorld(machine, world) {
  const seedSystem = machine.systems.get('SeedSystem');
  const result = seedSystem ? seedSystem.seed() : { seeded: 0 };

  const timeline = machine.systems.get('TimelineSystem');
  if (timeline) {
    timeline.clear();
    timeline.init();
  }

  return {
    applied: result.applied ?? result.seeded ?? 0,
    byType: result.byType ?? {},
  };
}

// ══════════════════════════════════════════════════════════════
// 5. WARM BOOT
// ══════════════════════════════════════════════════════════════

function restoreFromState(machine, state) {
  if (!state || state.version !== 1) {
    throw new Error('schema version incompatível');
  }

  const world = machine.world;
  world.clear();

  for (const [id, comps] of Object.entries(state.world || {})) {
    const cloned = deepClone(comps);

    if (cloned && cloned.Meta) {
      cloned.Meta.createdAt = 'T0';
      cloned.Meta.updatedAt = 'T0';
    }

    world.createEntity(cloned, { id });
  }

  const timeline = machine.systems.get('TimelineSystem');
  if (timeline && state.timelines) {
    timeline.clear();
    for (const [name, tl] of Object.entries(state.timelines)) {
      const snapshots = new Map(Object.entries(tl.snapshots || {}));
      timeline.timelines.set(name, {
        entries: tl.entries || [],
        snapshots,
      });
    }
    timeline.switchTo(state.timeline || 'main');
  }

  machine.state.tick = state.tick ?? 'T0';
  machine.state.tickNumber = parseInt(String(state.tick).slice(1), 10) || 0;
  machine.state.timeline = state.timeline ?? 'main';

  machine.links.rebuild(world);
  machine.ids.rebuildFromWorld(world);

  return {
    entities: world.allEntities().length,
    timelines: Object.keys(state.timelines || {}).length,
  };
}

// ══════════════════════════════════════════════════════════════
// 6. STORAGE ADAPTER
// ══════════════════════════════════════════════════════════════

async function pickStorageAdapter() {
  const candidates = [
    new GMStorageAdapter(),
    new IndexedDBAdapter(),
    new LocalStorageAdapter(),
  ];

  for (const adapter of candidates) {
    try {
      if (await adapter.isAvailable()) return adapter;
    } catch { /* tenta próximo */ }
  }

  throw new Error('[boot] nenhum storage adapter disponível');
}

// ══════════════════════════════════════════════════════════════
// 7. UI
// ══════════════════════════════════════════════════════════════

function mountUI(machine) {
  injectStyles();

  const root = ensureRoot();

  const icon = createFloatingIcon();
  root.appendChild(icon);

  const platform = createPlatform();
  root.appendChild(platform);

  const editorContainer = platform.querySelector('.editor-container');
  const editor = new Editor(machine, editorContainer);

  const leftContainer = platform.querySelector('.panel-left');
  const panelLeft = new PanelLeft(machine, leftContainer);

  const rightContainer = platform.querySelector('.panel-right');
  const panelRight = new PanelRight(machine, rightContainer);

  const floatingMenu = new FloatingMenu(machine);
  const historyPanel = new HistoryPanel(machine);
  const rollOverlay = new RollOverlay(machine);
  const playOverlay = new PlayOverlay(machine);
  const commandGuide = new CommandGuide(machine);

  const narrativeOverlay = new NarrativeOverlay(machine);

  const toast = new ToastManager();
  const modal = new ModalManager();

  const focusManager = new FocusManager({
    panelLeft: leftContainer,
    panelRight: rightContainer,
    editor: editorContainer,
  });

  const keyboardRouter = new KeyboardRouter(machine, {
    floatingMenu,
    historyPanel,
    rollOverlay,
    playOverlay,
    commandGuide,
  });

  const togglePlatform = () => {
    platform.classList.toggle('visible');
    if (platform.classList.contains('visible')) {
      positionPlatform(platform, icon);
      editor.focus();
    }
  };

  wireFloatingIcon(icon, platform, togglePlatform);

  const guideBtn = platform.querySelector('[data-action="guide"]');
  const configBtn = platform.querySelector('[data-action="config"]');
  const modeBtn = platform.querySelector('[data-action="mode"]');

  if (guideBtn) guideBtn.addEventListener('click', () => commandGuide.toggle());
  if (configBtn) configBtn.addEventListener('click', () => {
    toast.info('Configurações em breve.');
  });
  if (modeBtn) modeBtn.addEventListener('click', () => {
    machine.state.play = !machine.state.play;
    playOverlay.toggle();
  });

  wireNarrativeModeButton(machine, platform, toast);
  wireTestButton(machine, platform, toast);
  wireNarrativeOverlay(machine, editor, narrativeOverlay);

  return {
    root, icon, platform, editor, panelLeft, panelRight,
    floatingMenu, historyPanel, rollOverlay, playOverlay,
    commandGuide, toast, modal, focusManager, keyboardRouter,
    narrativeOverlay,
    togglePlatform,
  };
}

// ══════════════════════════════════════════════════════════════
// 7a. BOTÃO 📖 — Modo narrativo (Fase 6)
// ══════════════════════════════════════════════════════════════

function wireNarrativeModeButton(machine, platform, toast) {
  const btn = platform.querySelector('[data-action="narrative-mode"]');
  if (!btn) return;

  try {
    const sys = machine.systems.get('NarrativeSystem');
    const mode = sys?.getMode?.() ?? 'off';
    updateNarrativeButton(platform, mode);
  } catch { /* isola */ }

  btn.addEventListener('click', () => {
    const next = cycleNarrativeMode(machine);
    const label = {
      off: 'Narrativa desativada',
      preview: 'Modo preview — análise visível, sem mutação',
      suggest: 'Modo suggest — aprovação manual',
      auto: 'Modo auto — aplicação automática',
    }[next] ?? next;
    toast.info(label, 2500);
  });
}

// ══════════════════════════════════════════════════════════════
// 7a-bis. WIRING DO OVERLAY NARRATIVO (Fase 6)
// ══════════════════════════════════════════════════════════════

function wireNarrativeOverlay(machine, editor, overlay) {
  if (!overlay || !editor) return;

  try {
    const ta = editor.textarea;
    if (!ta) return;

    ta.addEventListener('click', () => {
      try {
        const pos = ta.selectionStart;
        const spans = editor.highlighter?.getNarrativeSpans?.() ?? [];
        const hit = spans.find((s) => s.ambiguous && pos >= s.start && pos <= s.end);

        if (!hit) return;

        const ir = machine.systems.get('NarrativeSystem')?._lastIR;
        if (!ir) return;

        const diag = (ir.diagnostics ?? []).find(
          (d) => d.code === 'REF_AMBIGUOUS' &&
            d.sourceSpan?.start === hit.start
        );
        if (!diag || !diag.context?.candidates) return;

        overlay.open({
          spanKey: `${ir.documentId ?? 's1'}.t${hit.start}`,
          candidates: diag.context.candidates,
          current: null,
          sourceSpan: { start: hit.start, end: hit.end, raw: hit.raw },
        });
      } catch { /* isola */ }
    });
  } catch { /* isola */ }
}

// ══════════════════════════════════════════════════════════════
// 7b. BOTÃO 🧪 — Bateria de testes
// ══════════════════════════════════════════════════════════════

function wireTestButton(machine, platform, toast) {
  const testBtn = platform.querySelector('[data-action="test"]');
  if (!testBtn) return;

  const SAFETY_MS = 90_000;
  let running = false;
  let safetyTimer = null;

  const reset = () => {
    running = false;
    testBtn.disabled = false;
    testBtn.textContent = '🧪';
    if (safetyTimer) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
  };

  machine.bus.on('test:battery:complete', reset);
  machine.bus.on('test:battery:error', reset);

  testBtn.addEventListener('click', () => {
    if (running) return;
    running = true;
    testBtn.disabled = true;
    testBtn.textContent = '⏳';

    safetyTimer = setTimeout(() => {
      if (running) {
        toast.warning(
          'Bateria não respondeu em 90s — destravando o botão. Veja o console.',
          5000
        );
        reset();
      }
    }, SAFETY_MS);

    try {
      machine.handleLine('diag.test full');
    } catch (err) {
      toast.error(`Bateria falhou ao iniciar: ${err.message}`);
      reset();
    }
  });
}

// ══════════════════════════════════════════════════════════════
// 8. HELPERS DE DOM
// ══════════════════════════════════════════════════════════════

function ensureRoot() {
  let root = document.getElementById('narrative-root');
  if (!root) {
    root = el('div', { id: 'narrative-root' });
    document.body.appendChild(root);
  }
  root.hidden = false;
  return root;
}

function injectStyles() {
  if (document.getElementById('narrative-styles')) return;
  const link = el('link', {
    id: 'narrative-styles',
    rel: 'stylesheet',
    href: new URL('./ui/styles.css', import.meta.url).href,
  });
  document.head.appendChild(link);
}

function createFloatingIcon() {
  const icon = el('div', {
    id: 'narrative-floating-icon',
    title: 'Editor Narrativo (clique para abrir)',
  }, 'N');
  icon.appendChild(el('div', { class: 'global-indicator' }));
  return icon;
}

function createPlatform() {
  const platform = el('div', { id: 'narrative-platform' });

  const header = el('div', { class: 'narrative-header' });
  header.appendChild(el('div', {}, 'Editor Narrativo ECS'));

  const actions = el('div', { class: 'narrative-header-actions' });
  actions.appendChild(el('span', { 'data-tick': '' }, 'T0'));
  actions.appendChild(el('span', { 'data-boot-mode': '' }, '—'));
  actions.appendChild(el('span', { 'data-save-indicator': '' }, '●'));

  actions.appendChild(el('button', {
    class: 'header-btn',
    'data-action': 'narrative-mode',
    title: 'Modo narrativo — clique para ciclar (OFF → PRV → SUG → AUTO)',
  }, '📖 OFF'));

  actions.appendChild(el('button', {
    class: 'header-btn',
    'data-action': 'test',
    title: 'Rodar bateria de testes automáticos (diag.test)',
  }, '🧪'));
  actions.appendChild(el('button', { class: 'header-btn', 'data-action': 'guide' }, 'Comandos'));
  actions.appendChild(el('button', { class: 'header-btn', 'data-action': 'config' }, 'Config'));
  actions.appendChild(el('button', { class: 'header-btn', 'data-action': 'mode' }, '🌐'));
  header.appendChild(actions);
  platform.appendChild(header);

  const body = el('div', { class: 'narrative-body' });
  body.appendChild(el('aside', { class: 'panel-left' }));
  body.appendChild(el('main', { class: 'editor-container' }));
  body.appendChild(el('aside', { class: 'panel-right' }));
  platform.appendChild(body);

  return platform;
}

function wireFloatingIcon(icon, platform, onToggle) {
  let dragging = false;
  let moved = false;
  let offsetX = 0;
  let offsetY = 0;
  let startX = 0;
  let startY = 0;

  const onMouseDown = (e) => {
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    const rect = icon.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    icon.style.cursor = 'grabbing';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const onMouseMove = (e) => {
    if (!dragging) return;
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > 4 || dy > 4) moved = true;
    if (!moved) return;
    const x = Math.max(0, Math.min(e.clientX - offsetX, window.innerWidth - 52));
    const y = Math.max(0, Math.min(e.clientY - offsetY, window.innerHeight - 52));
    icon.style.left = `${x}px`;
    icon.style.top = `${y}px`;
    if (platform.classList.contains('visible')) positionPlatform(platform, icon);
  };

  const onMouseUp = () => {
    dragging = false;
    icon.style.cursor = 'grab';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    if (!moved) onToggle();
  };

  icon.addEventListener('mousedown', onMouseDown);
  icon.style.cursor = 'grab';
}

function positionPlatform(platform, icon) {
  const rect = icon.getBoundingClientRect();
  const w = 1120;
  const h = 640;
  let left = rect.left + 60;
  let top = rect.top;
  if (left + w > window.innerWidth - 10) left = rect.left - w - 10;
  if (top + h > window.innerHeight - 10) top = window.innerHeight - h - 10;
  if (left < 10) left = 10;
  if (top < 10) top = 10;
  platform.style.left = `${left}px`;
  platform.style.top = `${top}px`;
}