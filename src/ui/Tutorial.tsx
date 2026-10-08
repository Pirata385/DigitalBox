import { useEffect, useState, type ReactElement } from 'react';
import type { Circuit } from '../model/types';
import { isKnown } from '../sim/signal';
import { editor, simulator } from '../state/store';
import { useEditor } from '../state/useEditor';
import { TUTORIAL_STEPS, stepComplete, tutorialSnapshot } from './tutorialSteps';

export const TUTORIAL_DONE_KEY = 'digitalbox.tutorial.done.v1';

/** Whether the tutorial was finished or skipped on this browser. Storage problems count as not done. */
export function tutorialDone(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_DONE_KEY) === '1';
  } catch {
    return false;
  }
}

function markTutorialDone(): void {
  try {
    localStorage.setItem(TUTORIAL_DONE_KEY, '1');
  } catch {
    // Storage is blocked. The tour will simply show again next time.
  }
}

/** True when any LED in the circuit has a known HIGH on its input. */
function anyLedLit(doc: Circuit): boolean {
  return doc.components.some((c) => {
    if (c.type !== 'led') return false;
    const s = simulator.pinSig(c.id, 'in');
    return isKnown(s, 1) && (s.v & 1) === 1;
  });
}

export function Tutorial(): ReactElement | null {
  const index = useEditor((s) => s.ui.tutorialStep);
  const doc = useEditor((s) => s.doc);
  const running = useEditor((s) => s.running);
  const version = useEditor((s) => s.simVersion);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const target = index === null ? undefined : TUTORIAL_STEPS[index].target;

  // Measure the spotlight target again after the layout changes, and on resize.
  useEffect(() => {
    const measure = (): void => {
      setRect(target ? (document.querySelector(`[data-tour="${target}"]`)?.getBoundingClientRect() ?? null) : null);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [target, version, index]);

  if (index === null) return null;
  const step = TUTORIAL_STEPS[index];
  const last = index === TUTORIAL_STEPS.length - 1;
  const complete = stepComplete(step, tutorialSnapshot(doc, anyLedLit(doc), running));

  const go = (i: number): void => {
    const next = TUTORIAL_STEPS[i];
    editor.getState().patchUi({
      tutorialStep: i,
      ...(next.openToolbox ? { toolboxOpen: true, sheetOpen: true, drawerOpen: true } : {}),
    });
  };
  const finish = (): void => {
    markTutorialDone();
    editor.getState().patchUi({ tutorialStep: null });
  };

  return (
    <div className="tour">
      {rect && (
        <div
          className="tour-spot"
          aria-hidden="true"
          style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      <section className="tour-card" role="dialog" aria-label={`Tutorial: ${step.title}`}>
        <p className="tour-progress">
          Step {index + 1} of {TUTORIAL_STEPS.length}
        </p>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        {!complete && <p className="tour-hint">Try it to continue, or skip ahead.</p>}
        <div className="tour-actions">
          <button type="button" className="quiet" onClick={finish}>
            Skip tour
          </button>
          <span className="spacer" />
          {index > 0 && (
            <button type="button" onClick={() => go(index - 1)}>
              Back
            </button>
          )}
          <button type="button" className="primary" disabled={!complete} onClick={() => (last ? finish() : go(index + 1))}>
            {last ? 'Finish' : 'Next'}
          </button>
        </div>
      </section>
    </div>
  );
}
