import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Category } from '../catalog/types';
import {
  addComponent,
  connect,
  copyItems,
  emptyCircuit,
  insertJunction,
  moveComponents,
  pasteItems,
  removeItems,
  rotateComponents,
  setComponentProp,
  topologySignature,
  type Clipboard,
} from '../model/circuit';
import { snap } from '../model/geometry';
import { commitHistory, createHistory, redoHistory, undoHistory, type History } from '../model/history';
import type { Circuit, PinRef, Pt, Selection, View } from '../model/types';
import { Simulator, type SimSnapshot } from '../sim/simulator';

export type Tool = 'select' | 'pan';

/** Simulation speed presets, as multiples of real time. */
export const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

export interface UiState {
  toolboxOpen: boolean;
  inspectorOpen: boolean;
  sheetOpen: boolean;
  drawerOpen: boolean;
  dialog: 'shortcuts' | 'about' | 'error' | 'examples' | null;
  errorMessage: string;
  tutorialStep: number | null;
  category: Category | 'all';
  search: string;
  snap: boolean;
  flash: string | null;
}

export interface EditorState {
  history: History<Circuit>;
  /** Always equal to `history.present`. */
  doc: Circuit;
  selection: Selection;
  view: View;
  tool: Tool;
  running: boolean;
  speed: number;
  /** Bumped whenever the engine's values may have changed, so views re-read them. */
  simVersion: number;
  clipboard: Clipboard | null;
  ui: UiState;

  addAt(type: string, x: number, y: number): string;
  beginMove(): void;
  moveSelected(dx: number, dy: number): void;
  endMove(): void;
  /** A second finger turned a one-finger drag into a pinch: keeps the movement so far and releases a held button. */
  abandonDrag(holdId?: string): void;
  rotateSelected(): void;
  /** Keyboard nudge: moves the selection by an exact amount, never snapped, as one undo step. */
  nudgeSelected(dx: number, dy: number): void;
  deleteSelected(): void;
  selectAll(): void;
  setSelection(sel: Selection): void;
  toggleSelect(kind: 'component' | 'wire', id: string): void;
  clearSelection(): void;
  connectPins(a: PinRef, b: PinRef): boolean;
  connectToWire(start: PinRef, wireId: string, at: Pt): boolean;
  setProp(id: string, key: string, value: unknown): void;
  toggleInput(id: string): void;
  setInputValue(id: string, value: number): void;
  undo(): void;
  redo(): void;
  copySelected(): void;
  paste(dx: number, dy: number): void;
  newCircuit(): void;
  loadCircuit(c: Circuit, sim: Partial<SimSnapshot>, view?: View): void;
  setTool(t: Tool): void;
  setView(v: View): void;
  setRunning(on: boolean): void;
  setSpeed(s: number): void;
  stepSim(): void;
  resetSim(): void;
  tick(us: number): void;
  openDialog(d: UiState['dialog'], message?: string): void;
  closeDialog(): void;
  patchUi(p: Partial<UiState>): void;
}

/** The one simulation engine. Views read values from it through the store's `simVersion`. */
export const simulator = new Simulator();

let builtSignature: string | null = null;

/** Rebuilds the engine only when the circuit's topology changes, not when parts move. */
function syncEngine(doc: Circuit): void {
  const sig = topologySignature(doc);
  if (sig === builtSignature) return;
  simulator.build(doc);
  builtSignature = sig;
}

const NO_SELECTION: Selection = { components: [], wires: [] };
const DEFAULT_VIEW: View = { zoom: 1, panX: 0, panY: 0 };
const DEFAULT_UI: UiState = {
  toolboxOpen: true,
  inspectorOpen: false,
  sheetOpen: false,
  drawerOpen: false,
  dialog: null,
  errorMessage: '',
  tutorialStep: null,
  category: 'all',
  search: '',
  snap: true,
  flash: null,
};

const EMPTY_DOC = emptyCircuit();
syncEngine(EMPTY_DOC);

/** Drops selected ids that no longer exist in the document. */
function keepExisting(sel: Selection, doc: Circuit): Selection {
  const parts = new Set(doc.components.map((c) => c.id));
  const wires = new Set(doc.wires.map((w) => w.id));
  return {
    components: sel.components.filter((id) => parts.has(id)),
    wires: sel.wires.filter((id) => wires.has(id)),
  };
}

/** True when any part sits somewhere else. Both documents list parts in the same order. */
function movedAny(base: Circuit, doc: Circuit): boolean {
  return doc.components.some((c, i) => c.x !== base.components[i].x || c.y !== base.components[i].y);
}

function samePropsOf(a: Circuit, b: Circuit, id: string): boolean {
  const pa = a.components.find((c) => c.id === id)?.props;
  const pb = b.components.find((c) => c.id === id)?.props;
  return JSON.stringify(pa) === JSON.stringify(pb);
}

/** Position of a live drag's start, held outside the state so it is not an undo step by itself. */
let moveBase: Circuit | null = null;

export const editor: StoreApi<EditorState> = createStore<EditorState>()((set, get) => {
  /** Records `next` as one undo step and keeps the engine in step with it. */
  const commit = (next: Circuit, extra: Partial<EditorState> = {}): void => {
    const { history } = get();
    if (next === history.present) return;
    syncEngine(next);
    set({ ...extra, history: commitHistory(history, next), doc: next, simVersion: get().simVersion + 1 });
  };

  /** Changes the document without an undo step. Used during a live drag. */
  const setLive = (next: Circuit): void => {
    set({ doc: next, history: { ...get().history, present: next } });
  };

  const applyHistory = (h: History<Circuit>): void => {
    syncEngine(h.present);
    set({
      history: h,
      doc: h.present,
      selection: keepExisting(get().selection, h.present),
      simVersion: get().simVersion + 1,
    });
  };

  const flash = (message: string): void => {
    set({ ui: { ...get().ui, flash: message } });
  };

  return {
    history: createHistory(EMPTY_DOC),
    doc: EMPTY_DOC,
    selection: NO_SELECTION,
    view: DEFAULT_VIEW,
    tool: 'select',
    running: false,
    speed: 1,
    simVersion: 0,
    clipboard: null,
    ui: DEFAULT_UI,

    addAt(type, x, y) {
      const { ui, doc } = get();
      const px = ui.snap ? snap(x) : x;
      const py = ui.snap ? snap(y) : y;
      const { circuit, id } = addComponent(doc, type, px, py);
      commit(circuit, { selection: { components: [id], wires: [] } });
      return id;
    },

    beginMove() {
      moveBase = get().doc;
    },

    moveSelected(dx, dy) {
      const { doc, selection, ui } = get();
      if (selection.components.length === 0) return;
      if (moveBase === null) moveBase = doc;
      const sx = ui.snap ? snap(dx) : dx;
      const sy = ui.snap ? snap(dy) : dy;
      setLive(moveComponents(moveBase, selection.components, sx, sy));
    },

    endMove() {
      const base = moveBase;
      moveBase = null;
      if (base === null) return;
      const { doc } = get();
      if (!movedAny(base, doc)) {
        setLive(base);
        return;
      }
      set({ history: { ...get().history, present: base } });
      commit(doc);
    },

    abandonDrag(holdId) {
      get().endMove();
      if (holdId !== undefined) get().setInputValue(holdId, 0);
    },

    rotateSelected() {
      const { doc, selection } = get();
      if (selection.components.length === 0) return;
      commit(rotateComponents(doc, selection.components, 1));
    },

    nudgeSelected(dx, dy) {
      const { doc, selection } = get();
      if (selection.components.length === 0) return;
      commit(moveComponents(doc, selection.components, dx, dy));
    },

    deleteSelected() {
      const { doc, selection } = get();
      if (selection.components.length === 0 && selection.wires.length === 0) return;
      commit(removeItems(doc, selection), { selection: NO_SELECTION });
    },

    selectAll() {
      const { doc } = get();
      set({ selection: { components: doc.components.map((c) => c.id), wires: doc.wires.map((w) => w.id) } });
    },

    setSelection(sel) {
      set({ selection: sel });
    },

    toggleSelect(kind, id) {
      const s = get().selection;
      if (kind === 'component') {
        const next = s.components.includes(id) ? s.components.filter((x) => x !== id) : [...s.components, id];
        set({ selection: { ...s, components: next } });
      } else {
        const next = s.wires.includes(id) ? s.wires.filter((x) => x !== id) : [...s.wires, id];
        set({ selection: { ...s, wires: next } });
      }
    },

    clearSelection() {
      set({ selection: NO_SELECTION });
    },

    connectPins(a, b) {
      const res = connect(get().doc, a, b);
      if (!res.ok) return false;
      commit(res.circuit, { selection: { components: [], wires: [res.wireId] } });
      return true;
    },

    connectToWire(start, wireId, at) {
      const { ui, doc } = get();
      const p = ui.snap ? { x: snap(at.x), y: snap(at.y) } : at;
      const res = insertJunction(doc, wireId, p, start);
      if (!res) return false;
      commit(res.circuit, { selection: { components: [res.junctionId], wires: [] } });
      return true;
    },

    setProp(id, key, value) {
      const { doc } = get();
      const next = setComponentProp(doc, id, key, value);
      if (next === doc) return;
      const removed = doc.wires.length - next.wires.length;
      if (removed === 0 && samePropsOf(doc, next, id)) return;
      commit(next);
      if (removed > 0) {
        flash(`${removed} wire${removed === 1 ? '' : 's'} removed because the pins changed`);
      }
    },

    toggleInput(id) {
      const comp = get().doc.components.find((c) => c.id === id);
      if (!comp) return;
      if (comp.type === 'switch') {
        simulator.setInput(id, 1 - simulator.getInput(id));
      } else if (comp.type === 'word') {
        const bits = typeof comp.props.bits === 'number' ? comp.props.bits : 1;
        simulator.setInput(id, (simulator.getInput(id) + 1) % 2 ** bits);
      } else {
        return;
      }
      set({ simVersion: get().simVersion + 1 });
    },

    setInputValue(id, value) {
      simulator.setInput(id, value);
      set({ simVersion: get().simVersion + 1 });
    },

    undo() {
      const h = undoHistory(get().history);
      if (h !== get().history) applyHistory(h);
    },

    redo() {
      const h = redoHistory(get().history);
      if (h !== get().history) applyHistory(h);
    },

    copySelected() {
      const { doc, selection } = get();
      if (selection.components.length === 0) return;
      set({ clipboard: copyItems(doc, selection) });
    },

    paste(dx, dy) {
      const clip = get().clipboard;
      if (!clip || clip.components.length === 0) return;
      const res = pasteItems(get().doc, clip, dx, dy);
      commit(res.circuit, { selection: res.selection });
    },

    newCircuit() {
      const c = emptyCircuit();
      syncEngine(c);
      simulator.reset();
      set({
        history: createHistory(c),
        doc: c,
        selection: NO_SELECTION,
        running: false,
        simVersion: get().simVersion + 1,
      });
    },

    loadCircuit(c, sim, view) {
      syncEngine(c);
      simulator.reset();
      simulator.restore({ timeUs: sim.timeUs ?? 0, inputs: sim.inputs ?? {}, states: sim.states ?? {} });
      set({
        history: createHistory(c),
        doc: c,
        selection: NO_SELECTION,
        view: view ?? get().view,
        simVersion: get().simVersion + 1,
      });
    },

    setTool(t) {
      set({ tool: t });
    },

    setView(v) {
      set({ view: v });
    },

    setRunning(on) {
      set({ running: on });
    },

    setSpeed(s) {
      set({ speed: s });
    },

    stepSim() {
      simulator.step();
      set({ simVersion: get().simVersion + 1 });
    },

    resetSim() {
      simulator.reset();
      set({ simVersion: get().simVersion + 1 });
    },

    tick(us) {
      if (!get().running) return;
      simulator.advance(us);
      set({ simVersion: get().simVersion + 1 });
    },

    openDialog(d, message) {
      set({ ui: { ...get().ui, dialog: d, errorMessage: message ?? '' } });
    },

    closeDialog() {
      set({ ui: { ...get().ui, dialog: null } });
    },

    patchUi(p) {
      set({ ui: { ...get().ui, ...p } });
    },
  };
});
