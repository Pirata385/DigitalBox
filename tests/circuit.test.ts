import { describe, expect, it } from 'vitest';
import {
  addComponent,
  connect,
  copyItems,
  emptyCircuit,
  freshId,
  insertJunction,
  moveComponents,
  pasteItems,
  pruneWires,
  removeItems,
  rotateComponents,
  setComponentProp,
  topologySignature,
} from '../src/model/circuit';
import type { Circuit } from '../src/model/types';
import { makeCircuit } from './helpers';

const byId = (c: Circuit, id: string) => c.components.find((x) => x.id === id);

describe('addComponent and ids', () => {
  it('clamps props when a part is added', () => {
    const { circuit, id } = addComponent(emptyCircuit(), 'and', 0, 0, { inputs: 99 });
    expect(byId(circuit, id)?.props.inputs).toBe(8);
  });

  it('freshId returns the smallest unused integer for the prefix', () => {
    const c = makeCircuit(
      [
        ['c1', 'and'],
        ['c3', 'and'],
      ],
      [],
    );
    expect(freshId(c, 'c')).toBe('c2');
  });
});

describe('connect', () => {
  const base = () =>
    makeCircuit(
      [
        ['n1', 'not'],
        ['n2', 'not'],
        ['p', 'probe', { bits: 4 }],
      ],
      [],
    );

  it('rejects the same pin twice', () => {
    expect(connect(base(), { component: 'n1', pin: 'out' }, { component: 'n1', pin: 'out' })).toEqual({
      ok: false,
      reason: 'same-pin',
    });
  });

  it('rejects a pin the part does not have', () => {
    expect(connect(base(), { component: 'n1', pin: 'out' }, { component: 'n2', pin: 'nope' })).toEqual({
      ok: false,
      reason: 'missing-pin',
    });
  });

  it('rejects wires between different widths', () => {
    expect(connect(base(), { component: 'n1', pin: 'out' }, { component: 'p', pin: 'in' })).toEqual({
      ok: false,
      reason: 'width-mismatch',
    });
  });

  it('rejects a second wire between the same two pins', () => {
    const first = connect(base(), { component: 'n1', pin: 'out' }, { component: 'n2', pin: 'in0' });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(connect(first.circuit, { component: 'n2', pin: 'in0' }, { component: 'n1', pin: 'out' })).toEqual({
      ok: false,
      reason: 'duplicate',
    });
  });
});

describe('setComponentProp', () => {
  it('shrinking an and gate from 4 inputs to 2 removes the wire to in3 and keeps in0', () => {
    const c = makeCircuit(
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
    const next = setComponentProp(c, 'g', 'inputs', 2);
    const toPins = next.wires.map((w) => w.to.pin);
    expect(toPins).toContain('in0');
    expect(toPins).not.toContain('in3');
  });

  it('widening a 1-bit and gate to 4 bits removes its 1-bit wires and reports how many', () => {
    const c = makeCircuit(
      [
        ['s0', 'switch'],
        ['s1', 'switch'],
        ['g', 'and', { inputs: 2, bits: 1 }],
      ],
      [
        ['s0', 'out', 'g', 'in0'],
        ['s1', 'out', 'g', 'in1'],
      ],
    );
    const before = c.wires.length;
    const next = setComponentProp(c, 'g', 'bits', 4);
    expect(before - next.wires.length).toBe(2);
  });

  it('ignores a prop the part does not have', () => {
    const c = makeCircuit([['g', 'and']], []);
    expect(setComponentProp(c, 'g', 'nope', 3)).toEqual(c);
  });
});

describe('insertJunction', () => {
  it('replaces the wire with two wires and connects the start pin to the junction', () => {
    const c = makeCircuit(
      [
        ['sw', 'switch'],
        ['led', 'led'],
        ['g', 'not'],
      ],
      [['sw', 'out', 'led', 'in']],
    );
    const result = insertJunction(c, 'w0', { x: 50, y: 20 }, { component: 'g', pin: 'in0' });
    expect(result).not.toBeNull();
    if (!result) return;
    const { circuit, junctionId } = result;
    expect(byId(circuit, junctionId)?.type).toBe('junction');
    expect(circuit.wires.some((w) => w.id === 'w0')).toBe(false);
    expect(circuit.wires.some((w) => w.from.component === 'sw' && w.to.component === junctionId)).toBe(true);
    expect(circuit.wires.some((w) => w.from.component === junctionId && w.to.component === 'led')).toBe(true);
    expect(circuit.wires.some((w) => w.from.component === 'g' && w.to.component === junctionId)).toBe(true);
  });
});

describe('removeItems and pruneWires', () => {
  it('removes the wires attached to deleted parts', () => {
    const c = makeCircuit(
      [
        ['a', 'not'],
        ['b', 'not'],
      ],
      [['a', 'out', 'b', 'in0']],
    );
    expect(removeItems(c, { components: ['a'], wires: [] }).wires).toEqual([]);
  });

  it('pruneWires counts the wires it removes', () => {
    const c = makeCircuit(
      [
        ['a', 'not'],
        ['b', 'not', { bits: 1 }],
      ],
      [['a', 'out', 'b', 'in0']],
    );
    const broken: Circuit = {
      ...c,
      components: c.components.map((x) => (x.id === 'b' ? { ...x, props: { bits: 4 } } : x)),
    };
    expect(pruneWires(broken)).toEqual({ circuit: { ...broken, wires: [] }, removed: 1 });
  });
});

describe('copy and paste', () => {
  const pair = () =>
    makeCircuit(
      [
        ['a', 'not'],
        ['b', 'not'],
      ],
      [['a', 'out', 'b', 'in0']],
    );

  it('gives pasted parts new ids and remaps their wires', () => {
    const c = pair();
    const clip = copyItems(c, { components: ['a', 'b'], wires: [] });
    const { circuit, selection } = pasteItems(c, clip, 20, 20);
    expect(selection.components).toHaveLength(2);
    expect(selection.components.every((id) => id !== 'a' && id !== 'b')).toBe(true);
    const wire = circuit.wires.find((w) => w.id === selection.wires[0]);
    expect(wire?.from.component).toBe(selection.components[0]);
    expect(wire?.to.component).toBe(selection.components[1]);
  });

  it('copying one end of a wire does not carry the wire', () => {
    const clip = copyItems(pair(), { components: ['a'], wires: [] });
    expect(clip.wires).toEqual([]);
  });

  it('paste drops any wire whose ends are not both pasted', () => {
    const c = pair();
    const clip = { components: [c.components[0]], wires: c.wires };
    expect(pasteItems(c, clip, 0, 0).circuit.wires).toHaveLength(1); // only the original wire remains
    expect(pasteItems(c, clip, 0, 0).selection.wires).toEqual([]);
  });
});

describe('rotation, movement and topology', () => {
  it('four quarter turns return to rotation 0', () => {
    let c = makeCircuit([['g', 'not']], []);
    for (let i = 0; i < 4; i++) c = rotateComponents(c, ['g'], 1);
    expect(byId(c, 'g')?.rot).toBe(0);
  });

  it('one turn backwards from 0 gives 270', () => {
    expect(byId(rotateComponents(makeCircuit([['g', 'not']], []), ['g'], -1), 'g')?.rot).toBe(270);
  });

  it('moving changes position but not the topology signature', () => {
    const c = makeCircuit([['g', 'not']], []);
    const moved = moveComponents(c, ['g'], 30, 40);
    expect(byId(moved, 'g')?.x).toBe(30);
    expect(topologySignature(moved)).toBe(topologySignature(c));
  });

  it('changing a width prop changes the topology signature', () => {
    const c = makeCircuit([['g', 'and']], []);
    expect(topologySignature(setComponentProp(c, 'g', 'bits', 4))).not.toBe(topologySignature(c));
  });
});
