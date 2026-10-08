import { EXAMPLES } from '../io/examples';
import { downloadText, pickTextFile } from '../io/files';
import { fileNameFor, parseSave, serializeSave, toSaveData } from '../io/serialize';
import { componentBox } from '../model/geometry';
import type { Circuit, Pt } from '../model/types';
import { editor, simulator } from '../state/store';
import { fitView, screenToWorld, zoomAt } from './interaction';

/** Loads a save file's text into the editor. Problems are reported in the flash message. */
export function loadText(text: string, source: string, fit = false): boolean {
  const s = editor.getState();
  const r = parseSave(text);
  if (!r.ok) {
    s.patchUi({ flash: r.error });
    return false;
  }
  s.loadCircuit({ name: r.data.name, components: r.data.components, wires: r.data.wires }, r.data.sim, r.data.view);
  s.setRunning(r.data.sim.running);
  s.setSpeed(r.data.sim.speed);
  if (fit) fitAll();
  const fixed = r.warnings.length > 0 ? ` (${r.warnings.length} problem${r.warnings.length === 1 ? '' : 's'} fixed)` : '';
  s.patchUi({ flash: `Opened ${source}${fixed}` });
  return true;
}

export function saveCircuit(): void {
  const s = editor.getState();
  const data = toSaveData({ doc: s.doc, running: s.running, speed: s.speed, snap: simulator.snapshot(), view: s.view });
  const name = fileNameFor(s.doc.name);
  downloadText(name, serializeSave(data));
  s.patchUi({ flash: `Saved ${name}` });
}

export async function openCircuit(): Promise<void> {
  const picked = await pickTextFile('.json,application/json');
  if (picked) loadText(picked.text, picked.name);
}

export function newCircuit(): void {
  const s = editor.getState();
  if (s.doc.components.length > 0 && !window.confirm('Start a blank circuit? The current one will be cleared.')) return;
  s.newCircuit();
}

export function loadExample(id: string): void {
  const ex = EXAMPLES.find((e) => e.id === id);
  if (ex) loadText(serializeSave(ex.build()), ex.title, true);
}

/** Centre of the canvas in screen pixels, measured from the canvas element. */
export function canvasCentre(): Pt {
  const rect = document.querySelector('.canvas')?.getBoundingClientRect();
  return { x: (rect?.width ?? 0) / 2, y: (rect?.height ?? 0) / 2 };
}

export function zoomBy(factor: number): void {
  const s = editor.getState();
  const c = canvasCentre();
  s.setView(zoomAt(s.view, s.view.zoom * factor, c.x, c.y));
}

export function fitAll(): void {
  const rect = document.querySelector('.canvas')?.getBoundingClientRect();
  const doc = editor.getState().doc;
  const box = doc.components.length === 0 ? null : fitBox(doc);
  editor.getState().setView(fitView(box, rect?.width ?? 800, rect?.height ?? 600));
}

/** Bounds of the parts in world coordinates, for fitting the view. */
function fitBox(doc: Circuit): { x0: number; y0: number; x1: number; y1: number } {
  const boxes = doc.components.map(componentBox);
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
}

/** World point at the centre of the canvas. */
export function worldCentre(): Pt {
  const s = editor.getState();
  const c = canvasCentre();
  return screenToWorld(s.view, c.x, c.y);
}
