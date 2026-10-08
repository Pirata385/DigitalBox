import { addComponent, connect, emptyCircuit } from '../model/circuit';
import type { Circuit } from '../model/types';
import { toSaveData, type SaveData } from './serialize';

export interface Example {
  id: string;
  title: string;
  blurb: string;
  build: () => SaveData;
}

interface PartSpec {
  name: string;
  type: string;
  x: number;
  y: number;
  props?: Record<string, unknown>;
}

/** Wires are [fromPartName, fromPin, toPartName, toPin]. */
type WireSpec = [string, string, string, string];

/**
 * Builds an example through the same operations the editor uses, so every
 * example is a valid circuit. Parts get ids c1, c2, … in the order listed.
 */
function circuitFrom(title: string, parts: PartSpec[], wires: WireSpec[]): Circuit {
  let c = emptyCircuit(title);
  const ids = new Map<string, string>();
  for (const p of parts) {
    const added = addComponent(c, p.type, p.x, p.y, p.props ?? {});
    c = added.circuit;
    ids.set(p.name, added.id);
  }
  for (const [fromName, fromPin, toName, toPin] of wires) {
    const from = ids.get(fromName);
    const to = ids.get(toName);
    if (from === undefined || to === undefined) {
      throw new Error(`example "${title}": unknown part in ${fromName} to ${toName}`);
    }
    const res = connect(c, { component: from, pin: fromPin }, { component: to, pin: toPin });
    if (!res.ok) throw new Error(`example "${title}": ${fromName}.${fromPin} to ${toName}.${toPin} is ${res.reason}`);
    c = res.circuit;
  }
  return c;
}

function saved(c: Circuit): SaveData {
  return toSaveData({
    doc: c,
    running: false,
    speed: 1,
    snap: { timeUs: 0, inputs: {}, states: {} },
    view: { zoom: 1, panX: 0, panY: 0 },
  });
}

export const EXAMPLES: readonly Example[] = [
  {
    id: 'half-adder',
    title: 'Half adder',
    blurb: 'Two switches feed an XOR (sum) and an AND (carry). Flip the switches to add.',
    build: () =>
      saved(
        circuitFrom(
          'Half adder',
          [
            { name: 'a', type: 'switch', x: 0, y: 0 },
            { name: 'b', type: 'switch', x: 0, y: 100 },
            { name: 'x', type: 'xor', x: 160, y: 0 },
            { name: 'n', type: 'and', x: 160, y: 100 },
            { name: 'sum', type: 'led', x: 320, y: 0 },
            { name: 'carry', type: 'led', x: 320, y: 100 },
          ],
          [
            ['a', 'out', 'x', 'in0'],
            ['b', 'out', 'x', 'in1'],
            ['a', 'out', 'n', 'in0'],
            ['b', 'out', 'n', 'in1'],
            ['x', 'out', 'sum', 'in'],
            ['n', 'out', 'carry', 'in'],
          ],
        ),
      ),
  },
  {
    id: 'sr-latch',
    title: 'SR latch',
    blurb: 'Two cross-coupled NOR gates remember a bit. S sets Q, R clears it.',
    build: () =>
      saved(
        circuitFrom(
          'SR latch',
          [
            { name: 's', type: 'switch', x: 0, y: 0 },
            { name: 'r', type: 'switch', x: 0, y: 120 },
            { name: 'q1', type: 'nor', x: 160, y: 0 },
            { name: 'q2', type: 'nor', x: 160, y: 120 },
            { name: 'qLed', type: 'led', x: 320, y: 0, props: { color: 'green' } },
            { name: 'qnLed', type: 'led', x: 320, y: 120, props: { color: 'red' } },
          ],
          [
            ['r', 'out', 'q1', 'in0'],
            ['q2', 'out', 'q1', 'in1'],
            ['s', 'out', 'q2', 'in0'],
            ['q1', 'out', 'q2', 'in1'],
            ['q1', 'out', 'qLed', 'in'],
            ['q2', 'out', 'qnLed', 'in'],
          ],
        ),
      ),
  },
  {
    id: 'counter-4bit',
    title: '4-bit counter',
    blurb: 'A 1 Hz clock drives a 4-bit counter. The bus monitor shows the count.',
    build: () =>
      saved(
        circuitFrom(
          '4-bit counter',
          [
            { name: 'clk', type: 'clock', x: 0, y: 0, props: { freq: 1 } },
            { name: 'en', type: 'const1', x: 0, y: 100 },
            { name: 'clr', type: 'const0', x: 0, y: 160 },
            { name: 'cnt', type: 'counter', x: 160, y: 40, props: { bits: 4 } },
            { name: 'bm', type: 'busmon', x: 320, y: 40, props: { bits: 4, format: 'dec' } },
            { name: 'tcLed', type: 'led', x: 320, y: 160, props: { color: 'yellow' } },
          ],
          [
            ['clk', 'out', 'cnt', 'clk'],
            ['en', 'out', 'cnt', 'en'],
            ['clr', 'out', 'cnt', 'clr'],
            ['cnt', 'q', 'bm', 'in'],
            ['cnt', 'tc', 'tcLed', 'in'],
          ],
        ),
      ),
  },
  {
    id: 'blinking-led',
    title: 'Blinking LED',
    blurb: 'A clock wired straight to an LED. Change its frequency in the inspector.',
    build: () =>
      saved(
        circuitFrom(
          'Blinking LED',
          [
            { name: 'clk', type: 'clock', x: 0, y: 0, props: { freq: 2 } },
            { name: 'led', type: 'led', x: 160, y: 0, props: { color: 'blue' } },
          ],
          [['clk', 'out', 'led', 'in']],
        ),
      ),
  },
];
