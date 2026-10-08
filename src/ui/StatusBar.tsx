import { useSyncExternalStore, type ReactElement } from 'react';
import { simulator } from '../state/store';
import { useEditor } from '../state/useEditor';
import { getCursor, subscribeCursor } from './cursor';

export function StatusBar(): ReactElement {
  const running = useEditor((s) => s.running);
  const speed = useEditor((s) => s.speed);
  const doc = useEditor((s) => s.doc);
  const zoom = useEditor((s) => s.view.zoom);
  const snap = useEditor((s) => s.ui.snap);
  const flashOn = useEditor((s) => s.simVersion);
  const cursor = useSyncExternalStore(subscribeCursor, getCursor);

  const warnings = simulator.warnings();
  const seconds = (simulator.time() / 1e6).toFixed(2);
  const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

  return (
    <footer className="statusbar" data-version={flashOn}>
      <span className={running ? 'pill is-running' : 'pill'}>
        {running ? 'Running' : 'Paused'} · {seconds} s · {speed}×
      </span>
      <span className="muted">
        {plural(doc.components.length, 'part')} · {plural(doc.wires.length, 'wire')}
      </span>
      {warnings.conflicts > 0 && <span className="warn">Bus conflict on {plural(warnings.conflicts, 'net')}</span>}
      {warnings.oscillation && <span className="warn">Circuit does not settle (oscillation)</span>}
      {warnings.floating > 0 && <span className="note">{plural(warnings.floating, 'floating input')}</span>}
      {warnings.skippedWires.length > 0 && <span className="warn">{plural(warnings.skippedWires.length, 'wire')} skipped</span>}
      <span className="right muted">
        Zoom {Math.round(zoom * 100)}%{snap ? ' · grid on' : ''}
        {cursor ? ` · x ${Math.round(cursor.x)}, y ${Math.round(cursor.y)}` : ''}
      </span>
    </footer>
  );
}
