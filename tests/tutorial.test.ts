import { describe, expect, it } from 'vitest';
import { stepComplete, TUTORIAL_STEPS, tutorialSnapshot } from '../src/ui/tutorialSteps';
import { makeCircuit } from './helpers';

const byId = (id: string) => {
  const step = TUTORIAL_STEPS.find((s) => s.id === id);
  if (!step) throw new Error(`no tutorial step ${id}`);
  return step;
};

describe('tutorial snapshot', () => {
  it('lists part types and wire ends as type.pin', () => {
    const c = makeCircuit(
      [
        ['sw', 'switch'],
        ['led', 'led'],
      ],
      [['sw', 'out', 'led', 'in']],
    );
    const snap = tutorialSnapshot(c, false, false);
    expect(snap.parts).toEqual(['switch', 'led']);
    expect(snap.wires).toEqual([{ from: 'switch.out', to: 'led.in' }]);
  });
});

describe('step completion', () => {
  const empty = tutorialSnapshot(makeCircuit([], []), false, false);

  it('the wire step needs a switch wired to an LED, in either direction', () => {
    expect(stepComplete(byId('wire'), empty)).toBe(false);
    const backwards = tutorialSnapshot(
      makeCircuit(
        [
          ['sw', 'switch'],
          ['led', 'led'],
        ],
        [['led', 'in', 'sw', 'out']],
      ),
      false,
      false,
    );
    expect(stepComplete(byId('wire'), backwards)).toBe(true);
    const forwards = tutorialSnapshot(
      makeCircuit(
        [
          ['sw', 'switch'],
          ['led', 'led'],
        ],
        [['sw', 'out', 'led', 'in']],
      ),
      false,
      false,
    );
    expect(stepComplete(byId('wire'), forwards)).toBe(true);
  });

  it('the run step completes when the LED is lit', () => {
    expect(stepComplete(byId('run'), tutorialSnapshot(makeCircuit([], []), false, true))).toBe(false);
    expect(stepComplete(byId('run'), tutorialSnapshot(makeCircuit([], []), true, true))).toBe(true);
  });

  it('manual steps are always complete', () => {
    expect(stepComplete(byId('welcome'), empty)).toBe(true);
    expect(stepComplete(byId('files'), empty)).toBe(true);
  });
});

describe('tutorial structure', () => {
  it('starts at welcome, ends at done, and has unique ids', () => {
    expect(TUTORIAL_STEPS[0].id).toBe('welcome');
    expect(TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1].id).toBe('done');
    expect(new Set(TUTORIAL_STEPS.map((s) => s.id)).size).toBe(TUTORIAL_STEPS.length);
  });
});
