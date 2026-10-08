import { useEffect, type ReactElement } from 'react';
import { EXAMPLES } from '../io/examples';
import { editor } from '../state/store';
import { useEditor } from '../state/useEditor';
import { loadExample } from './actions';
import { Icon } from './Icons';

const TITLES = {
  shortcuts: 'Keyboard shortcuts',
  about: 'About DigitalBox',
  error: 'Something went wrong',
  examples: 'Examples',
} as const;

const SHORTCUTS: [string, string][] = [
  ['Ctrl/Cmd + Z', 'Undo'],
  ['Ctrl/Cmd + Shift + Z, or Ctrl + Y', 'Redo'],
  ['Delete or Backspace', 'Delete the selection'],
  ['R', 'Rotate the selection 90°'],
  ['Ctrl/Cmd + A', 'Select everything'],
  ['Ctrl/Cmd + C, V, D', 'Copy, paste, duplicate'],
  ['Arrow keys (Shift for 10 px)', 'Nudge the selection'],
  ['Tab / Shift + Tab', 'Cycle through parts (canvas focused)'],
  ['Enter', 'Flip the selected switch, or count up a word input'],
  ['Escape', 'Cancel a wire, or clear the selection'],
  ['+, −, 0, F', 'Zoom in, zoom out, reset zoom, fit to view'],
  ['G', 'Toggle grid snap'],
  ['Space + drag, or middle drag', 'Pan the view'],
  ['Ctrl/Cmd + S, O', 'Save or open a file'],
  ['?', 'Show this list'],
];

/** The modal panels: shortcuts, about, examples and errors. Escape or a click outside closes them. */
export function Dialogs(): ReactElement | null {
  const dialog = useEditor((s) => s.ui.dialog);
  const message = useEditor((s) => s.ui.errorMessage);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') editor.getState().closeDialog();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog]);

  if (!dialog) return null;
  const close = (): void => editor.getState().closeDialog();

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <header className="dialog-head">
          <h2 id="dialog-title">{TITLES[dialog]}</h2>
          <button type="button" className="tool-btn" aria-label="Close" onClick={close}>
            <Icon name="close" />
          </button>
        </header>
        <div className="dialog-body">
          {dialog === 'shortcuts' && (
            <dl className="shortcuts">
              {SHORTCUTS.map(([keys, what]) => (
                <div key={keys}>
                  <dt>
                    <kbd>{keys}</kbd>
                  </dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          )}
          {dialog === 'about' && (
            <p>
              DigitalBox is a sandbox for digital logic that runs entirely in your browser. Circuits are simulated on this
              device and nothing is uploaded. Save files are plain JSON that you can keep or share.
            </p>
          )}
          {dialog === 'error' && <p role="alert">{message || 'That did not work. Please try again.'}</p>}
          {dialog === 'examples' && (
            <ul className="example-list">
              {EXAMPLES.map((ex) => (
                <li key={ex.id}>
                  <button
                    type="button"
                    onClick={() => {
                      loadExample(ex.id);
                      close();
                    }}
                  >
                    <strong>{ex.title}</strong>
                    <span className="muted">{ex.blurb}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
