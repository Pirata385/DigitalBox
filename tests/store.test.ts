import { beforeEach, describe, expect, it } from 'vitest';
import { emptyCircuit } from '../src/model/circuit';
import { editor, simulator } from '../src/state/store';
import { known } from '../src/sim/signal';
import { makeCircuit } from './helpers';

const state = () => editor.getState();

/** Replaces the document with a fresh one and clears history. */
function load(parts: Parameters<typeof makeCircuit>[0] = [], wires: Parameters<typeof makeCircuit>[1] = []): void {
  state().loadCircuit(parts.length ? makeCircuit(parts, wires) : emptyCircuit(), {});
}

beforeEach(() => {
  load();
});

describe('editor store: undo and redo', () => {
  it('addAt, then undo removes the part, then redo restores it', () => {
    const id = state().addAt('not', 100, 100);
    expect(state().doc.components).toHaveLength(1);
    state().undo();
    expect(state().doc.components).toHaveLength(0);
    state().redo();
    expect(state().doc.components.map((c) => c.id)).toEqual([id]);
  });

  it('a drag of three moves is one undo step', () => {
    const id = state().addAt('not', 100, 100);
    state().setSelection({ components: [id], wires: [] });
    const before = state().history.past.length;

    state().beginMove();
    state().moveSelected(10, 0);
    state().moveSelected(20, 0);
    state().moveSelected(30, 0);
    state().endMove();

    expect(state().history.past.length).toBe(before + 1);
    expect(state().doc.components[0].x).toBe(130);
    state().undo();
    expect(state().doc.components[0].x).toBe(100);
  });

  it('a drag that goes nowhere adds no history entry', () => {
    const id = state().addAt('not', 100, 100);
    state().setSelection({ components: [id], wires: [] });
    const before = state().history.past.length;
    state().beginMove();
    state().moveSelected(0, 0);
    state().endMove();
    expect(state().history.past.length).toBe(before);
  });

  it('undo restores pruned wires', () => {
    load(
      [
        ['s0', 'switch'],
        ['s3', 'switch'],
        ['g', 'and', { inputs: 4, bits: 1 }],
      ],
      [
        ['s0', 'out', 'g', 'in0'],
        ['s3', 'out', 'g', 'in3'],
      ],
    );
    state().setProp('g', 'inputs', 2);
    expect(state().doc.wires.map((w) => w.to.pin)).toEqual(['in0']);
    state().undo();
    expect(state().doc.wires.map((w) => w.to.pin)).toEqual(['in0', 'in3']);
  });
});

describe('editor store: wiring and selection', () => {
  it('connectPins returns false for a duplicate and adds no history', () => {
    const a = state().addAt('not', 0, 0);
    const b = state().addAt('not', 100, 0);
    expect(state().connectPins({ component: a, pin: 'out' }, { component: b, pin: 'in0' })).toBe(true);
    const len = state().history.past.length;
    expect(state().connectPins({ component: a, pin: 'out' }, { component: b, pin: 'in0' })).toBe(false);
    expect(state().history.past.length).toBe(len);
  });

  it('deleteSelected removes the attached wires', () => {
    load(
      [
        ['a', 'not'],
        ['b', 'not'],
      ],
      [['a', 'out', 'b', 'in0']],
    );
    state().setSelection({ components: ['a'], wires: [] });
    state().deleteSelected();
    expect(state().doc.components.map((c) => c.id)).toEqual(['b']);
    expect(state().doc.wires).toEqual([]);
  });

  it('paste gives the copied parts new ids', () => {
    load(
      [
        ['a', 'not'],
        ['b', 'not'],
      ],
      [['a', 'out', 'b', 'in0']],
    );
    state().setSelection({ components: ['a', 'b'], wires: [] });
    state().copySelected();
    state().paste(20, 20);
    const ids = state().doc.components.map((c) => c.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    expect(state().doc.wires).toHaveLength(2);
  });
});

describe('editor store: runtime inputs', () => {
  it('toggleInput flips a switch, the engine reflects it, and history is unchanged', () => {
    load(
      [
        ['sw', 'switch'],
        ['n', 'not'],
      ],
      [['sw', 'out', 'n', 'in0']],
    );
    const len = state().history.past.length;
    state().toggleInput('sw');
    expect(simulator.getInput('sw')).toBe(1);
    expect(simulator.pinSig('n', 'out')).toEqual(known(0, 1));
    expect(state().history.past.length).toBe(len);
  });

  it('setInputValue drives a button without touching history', () => {
    load([
      ['btn', 'button'],
      ['n', 'not'],
    ], [['btn', 'out', 'n', 'in0']]);
    const len = state().history.past.length;
    state().setInputValue('btn', 1);
    expect(simulator.pinSig('n', 'out')).toEqual(known(0, 1));
    state().setInputValue('btn', 0);
    expect(simulator.pinSig('n', 'out')).toEqual(known(1, 1));
    expect(state().history.past.length).toBe(len);
  });
});
