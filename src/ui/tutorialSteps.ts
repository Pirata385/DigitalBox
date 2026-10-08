import type { Circuit } from '../model/types';

/** What the tutorial needs to know about the app: part types, wires by "type.pin", and whether an LED is lit. */
export interface TutorialSnap {
  parts: string[];
  wires: { from: string; to: string }[];
  ledLit: boolean;
  running: boolean;
}

export function tutorialSnapshot(c: Circuit, ledLit: boolean, running: boolean): TutorialSnap {
  const typeOf = new Map(c.components.map((x) => [x.id, x.type]));
  const end = (component: string, pin: string): string => `${typeOf.get(component) ?? '?'}.${pin}`;
  return {
    parts: c.components.map((x) => x.type),
    wires: c.wires.map((w) => ({ from: end(w.from.component, w.from.pin), to: end(w.to.component, w.to.pin) })),
    ledLit,
    running,
  };
}

export interface TutorialStep {
  id: string;
  title: string;
  body: string;
  /** The value of a data-tour attribute to spotlight. */
  target?: string;
  /** Automatic steps finish when the app state shows the action was done. */
  auto?: (s: TutorialSnap) => boolean;
  /** Opens the toolbox first, on screens where it is hidden by default. */
  openToolbox?: boolean;
}

const hasWire = (s: TutorialSnap, a: string, b: string): boolean =>
  s.wires.some((w) => (w.from === a && w.to === b) || (w.from === b && w.to === a));

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to DigitalBox',
    body: 'Build digital circuits by placing parts and wiring them together. This short tour takes about two minutes.',
  },
  {
    id: 'toolbox',
    title: 'Add parts',
    body: 'Tap a part in the Toolbox to place it in the middle of the view, or drag it onto the canvas.',
    target: 'toolbox',
    openToolbox: true,
    auto: (s) => s.parts.length >= 1,
  },
  {
    id: 'input',
    title: 'An input',
    body: 'Find the Toggle switch under Inputs and place one. A switch drives a 0 or a 1 from its output pin.',
    target: 'toolbox',
    openToolbox: true,
    auto: (s) => s.parts.includes('switch'),
  },
  {
    id: 'output',
    title: 'An output',
    body: 'Now place an LED from Outputs. It lights up while its input is HIGH.',
    target: 'toolbox',
    openToolbox: true,
    auto: (s) => s.parts.includes('led'),
  },
  {
    id: 'wire',
    title: 'Connect them',
    body: "Drag from the switch's output pin, on its right edge, to the LED's input pin, on its left edge. Wires snap to pins.",
    target: 'canvas',
    auto: (s) => hasWire(s, 'switch.out', 'led.in'),
  },
  {
    id: 'run',
    title: 'Run and toggle',
    body: 'Press Run in the top bar, then click the switch to flip it. The LED lights when the switch is on.',
    target: 'run',
    auto: (s) => s.ledLit,
  },
  {
    id: 'gate',
    title: 'Logic gates',
    body: 'Gates combine signals. Try an AND gate between two switches and an LED. This step is optional, so you can skip it.',
    target: 'toolbox',
    openToolbox: true,
  },
  {
    id: 'inspect',
    title: 'Inspect and edit',
    body: 'Click any part to see its settings in the Inspector. Press R to rotate, Delete to remove, and Ctrl+Z to undo.',
    target: 'canvas',
  },
  {
    id: 'files',
    title: 'Save and open',
    body: 'File, then Save, downloads your circuit as a JSON file. File, then Open, loads one back. Your work is also kept in this browser.',
    target: 'file',
  },
  {
    id: 'done',
    title: "You're ready",
    body: 'Explore the examples under File, then Examples. Press ? at any time for the keyboard shortcuts.',
  },
];

/** Whether a step's goal has been met. Manual steps are always complete. */
export function stepComplete(step: TutorialStep, s: TutorialSnap): boolean {
  return step.auto ? step.auto(s) : true;
}
