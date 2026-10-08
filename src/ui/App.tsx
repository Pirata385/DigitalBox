import { useEffect, type ReactElement } from 'react';
import { parseSave, serializeSave, toSaveData } from '../io/serialize';
import { readAutosave, writeAutosave } from '../state/autosave';
import { editor, simulator } from '../state/store';
import { useEditor } from '../state/useEditor';
import { Canvas } from './Canvas';
import { Dialogs } from './Dialogs';
import { Inspector } from './Inspector';
import { SimController } from './SimController';
import { StatusBar } from './StatusBar';
import { Toolbox } from './Toolbox';
import { Tutorial, tutorialDone } from './Tutorial';
import { TopBar } from './TopBar';
import { openCircuit, saveCircuit } from './actions';

const AUTOSAVE_DEBOUNCE_MS = 400;
const FLASH_MS = 4000;

function isTextEntry(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

/** Opens the last autosaved circuit, silently. Nothing happens when the saved text is missing or invalid. */
function restoreSession(): void {
  const text = readAutosave();
  if (!text) return;
  const r = parseSave(text);
  if (!r.ok) return;
  const s = editor.getState();
  s.loadCircuit({ name: r.data.name, components: r.data.components, wires: r.data.wires }, r.data.sim, r.data.view);
  s.setRunning(r.data.sim.running);
  s.setSpeed(r.data.sim.speed);
}

export function App(): ReactElement {
  const hasSelection = useEditor((s) => s.selection.components.length + s.selection.wires.length > 0);
  const toolboxOpen = useEditor((s) => s.ui.toolboxOpen);
  const sheetOpen = useEditor((s) => s.ui.sheetOpen);
  const drawerOpen = useEditor((s) => s.ui.drawerOpen);
  const flash = useEditor((s) => s.ui.flash);

  useEffect(() => {
    restoreSession();
    if (!tutorialDone()) editor.getState().patchUi({ tutorialStep: 0 });
  }, []);

  // Autosave after changes settle. While the simulation runs, values change every frame, so only the stopped state is saved.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = editor.subscribe((s, prev) => {
      const changed =
        s.doc !== prev.doc || s.running !== prev.running || s.speed !== prev.speed || (!s.running && s.simVersion !== prev.simVersion);
      if (!changed) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const st = editor.getState();
        writeAutosave(
          serializeSave(toSaveData({ doc: st.doc, running: st.running, speed: st.speed, snap: simulator.snapshot(), view: st.view })),
        );
      }, AUTOSAVE_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => editor.getState().patchUi({ flash: null }), FLASH_MS);
    return () => clearTimeout(t);
  }, [flash]);

  // File and help shortcuts. Editing shortcuts live in the canvas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isTextEntry(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 's') {
        e.preventDefault();
        saveCircuit();
      } else if (mod && key === 'o') {
        e.preventDefault();
        void openCircuit();
      } else if (!mod && e.key === '?') {
        editor.getState().openDialog('shortcuts');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const workspace = [
    'workspace',
    hasSelection ? 'has-selection' : '',
    toolboxOpen ? '' : 'no-toolbox',
    sheetOpen ? 'sheet-open' : '',
    drawerOpen ? 'drawer-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="app">
      <TopBar />
      <div className={workspace}>
        <Toolbox />
        <div className="canvas-wrap" data-tour="canvas">
          <Canvas />
        </div>
        <Inspector />
        {flash && (
          <div className="flash" role="status">
            {flash}
          </div>
        )}
        <SimController />
      </div>
      <StatusBar />
      <Tutorial />
      <Dialogs />
    </div>
  );
}
