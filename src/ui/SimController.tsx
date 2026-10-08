import { useEffect, type ReactElement } from 'react';
import { editor } from '../state/store';
import { useEditor } from '../state/useEditor';

/** Advances the simulation once per animation frame while it is running. Renders nothing. */
export function SimController(): ReactElement | null {
  const running = useEditor((s) => s.running);

  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    let frame = 0;
    const step = (now: number): void => {
      const dtMs = Math.min(now - last, 100);
      last = now;
      editor.getState().tick(dtMs * 1000 * editor.getState().speed);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  return null;
}
