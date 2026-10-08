import type { Dir } from '../sim/netlist';
import { blockLayout, boxLayout, gateLayout, pin, type PinSlot } from './layouts';
import type { ComponentDef, Layout, PinSpec, PropSpec } from './types';

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v));

const FREQ_OPTIONS = [0.5, 1, 2, 5, 10, 20, 50, 100].map((f) => ({ value: f, label: `${f} Hz` }));
const COLOR_OPTIONS = [
  { value: 'red', label: 'Red' },
  { value: 'green', label: 'Green' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'blue', label: 'Blue' },
  { value: 'white', label: 'White' },
];
const FORMAT_OPTIONS = [
  { value: 'hex', label: 'Hex' },
  { value: 'dec', label: 'Decimal' },
  { value: 'bin', label: 'Binary' },
];

const bitsProp = (max: number): PropSpec => ({ key: 'bits', label: 'Bits', kind: 'int', min: 1, max, isWidth: true });
const inputsProp: PropSpec = { key: 'inputs', label: 'Inputs', kind: 'int', min: 2, max: 8 };
const nProp: PropSpec = { key: 'n', label: 'Bits', kind: 'int', min: 2, max: 8, isWidth: true };

const slot = (key: string, label: string, dir: Dir, width = 1): PinSlot => ({ key, label, dir, width });
const clk = (key: string, label: string): PinSlot => ({ key, label, dir: 'in', width: 1, clock: true });

/** A 40 by 40 part with one output on the right edge. */
const sourceBox = (): Layout => boxLayout(40, 40, [pin('out', '', 40, 20, 'R', 'out')]);

/** A 40 by 40 part with one input on the left edge. */
const sinkBox = (width = 1): Layout => boxLayout(40, 40, [pin('in', '', 0, 20, 'L', 'in', width)]);

/** A bus splitter or merger: one n-bit bus on one side, n single bits on the other. */
function busSplit(n: number): Layout {
  const pins = [pin('in', 'IN', 0, 10 * (n + 1), 'L', 'in', n)];
  for (let i = 0; i < n; i++) pins.push(pin(`b${i}`, `${i}`, 60, 20 * (i + 1), 'R', 'out'));
  return boxLayout(60, 20 * (n + 1), pins);
}

function busMerge(n: number): Layout {
  const pins: PinSpec[] = [];
  for (let i = 0; i < n; i++) pins.push(pin(`b${i}`, `${i}`, 0, 20 * (i + 1), 'L', 'in'));
  pins.push(pin('out', 'OUT', 60, 10 * (n + 1), 'R', 'out', n));
  return boxLayout(60, 20 * (n + 1), pins);
}

const latchOutputs = (): PinSlot[] => [slot('q', 'Q', 'out'), slot('qn', 'Qn', 'out')];

export const DEFS: readonly ComponentDef[] = [
  // Inputs
  {
    type: 'switch',
    name: 'Toggle switch',
    category: 'inputs',
    kind: 'source',
    tooltip: 'Click to flip between 0 and 1.',
    defaults: {},
    props: [],
    layout: sourceBox,
  },
  {
    type: 'button',
    name: 'Push button',
    category: 'inputs',
    kind: 'source',
    tooltip: 'Hold to drive 1. Releasing drives 0.',
    defaults: {},
    props: [],
    layout: sourceBox,
  },
  {
    type: 'clock',
    name: 'Clock',
    category: 'inputs',
    kind: 'clock',
    tooltip: 'Square-wave generator. Set its frequency in the inspector.',
    defaults: { freq: 1 },
    props: [{ key: 'freq', label: 'Frequency', kind: 'select', options: FREQ_OPTIONS }],
    layout: sourceBox,
  },
  {
    type: 'const0',
    name: 'Constant 0',
    category: 'inputs',
    kind: 'source',
    tooltip: 'Always LOW (0).',
    defaults: {},
    props: [],
    layout: sourceBox,
  },
  {
    type: 'const1',
    name: 'Constant 1',
    category: 'inputs',
    kind: 'source',
    tooltip: 'Always HIGH (1).',
    defaults: {},
    props: [],
    layout: sourceBox,
  },
  {
    type: 'word',
    name: 'Word input',
    category: 'inputs',
    kind: 'source',
    tooltip: 'A binary word you set by clicking. Each click counts up by one.',
    defaults: { bits: 4 },
    props: [bitsProp(16)],
    layout: (p) => boxLayout(60, 40, [pin('out', '', 60, 20, 'R', 'out', num(p.bits))]),
  },

  // Outputs
  {
    type: 'led',
    name: 'LED',
    category: 'outputs',
    kind: 'sink',
    tooltip: 'Glows while its input is HIGH.',
    defaults: { color: 'red' },
    props: [{ key: 'color', label: 'Colour', kind: 'select', options: COLOR_OPTIONS }],
    layout: () => sinkBox(),
  },
  {
    type: 'probe',
    name: 'Probe',
    category: 'outputs',
    kind: 'sink',
    tooltip: 'Shows its wire as 0, 1, X or Z, or as hex for a bus.',
    defaults: { bits: 1 },
    props: [bitsProp(8)],
    layout: (p) => sinkBox(num(p.bits)),
  },
  {
    type: 'seghex',
    name: '7-segment (hex)',
    category: 'outputs',
    kind: 'sink',
    tooltip: 'Shows a 4-bit value as one hexadecimal digit.',
    defaults: {},
    props: [],
    layout: () => boxLayout(60, 80, [pin('in', 'D', 0, 40, 'L', 'in', 4)]),
  },
  {
    type: 'segraw',
    name: '7-segment (a–g)',
    category: 'outputs',
    kind: 'sink',
    tooltip: 'Drives the seven segments a to g directly.',
    defaults: {},
    props: [],
    layout: () => blockLayout(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((k) => slot(k, k, 'in')), []),
  },
  {
    type: 'busmon',
    name: 'Bus monitor',
    category: 'outputs',
    kind: 'sink',
    tooltip: 'Shows a bus value in hex, decimal or binary.',
    defaults: { bits: 8, format: 'hex' },
    props: [bitsProp(16), { key: 'format', label: 'Format', kind: 'select', options: FORMAT_OPTIONS }],
    layout: (p) => boxLayout(80, 40, [pin('in', '', 0, 20, 'L', 'in', num(p.bits))]),
  },
  {
    type: 'buzzer',
    name: 'Buzzer',
    category: 'outputs',
    kind: 'sink',
    tooltip: 'Sounds a tone while its input is HIGH.',
    defaults: {},
    props: [],
    layout: () => sinkBox(),
  },

  // Gates
  {
    type: 'not',
    name: 'NOT',
    category: 'gates',
    kind: 'comb',
    tooltip: 'Inverts its input: 1 becomes 0 and 0 becomes 1.',
    defaults: { bits: 1 },
    props: [bitsProp(8)],
    layout: (p) =>
      boxLayout(40, 20, [pin('in0', '', 0, 10, 'L', 'in', num(p.bits)), pin('out', '', 40, 10, 'R', 'out', num(p.bits))]),
  },
  {
    type: 'buf',
    name: 'Buffer',
    category: 'gates',
    kind: 'comb',
    tooltip: 'Passes its input through unchanged. Useful for strengthening a signal.',
    defaults: { bits: 1 },
    props: [bitsProp(8)],
    layout: (p) =>
      boxLayout(40, 20, [pin('in0', '', 0, 10, 'L', 'in', num(p.bits)), pin('out', '', 40, 10, 'R', 'out', num(p.bits))]),
  },
  {
    type: 'and',
    name: 'AND',
    category: 'gates',
    kind: 'comb',
    tooltip: 'HIGH only when every input is HIGH.',
    defaults: { inputs: 2, bits: 1 },
    props: [inputsProp, bitsProp(8)],
    layout: (p) => gateLayout(num(p.inputs), num(p.bits)),
  },
  {
    type: 'nand',
    name: 'NAND',
    category: 'gates',
    kind: 'comb',
    tooltip: 'LOW only when every input is HIGH.',
    defaults: { inputs: 2, bits: 1 },
    props: [inputsProp, bitsProp(8)],
    layout: (p) => gateLayout(num(p.inputs), num(p.bits)),
  },
  {
    type: 'or',
    name: 'OR',
    category: 'gates',
    kind: 'comb',
    tooltip: 'HIGH when at least one input is HIGH.',
    defaults: { inputs: 2, bits: 1 },
    props: [inputsProp, bitsProp(8)],
    layout: (p) => gateLayout(num(p.inputs), num(p.bits)),
  },
  {
    type: 'nor',
    name: 'NOR',
    category: 'gates',
    kind: 'comb',
    tooltip: 'HIGH only when every input is LOW.',
    defaults: { inputs: 2, bits: 1 },
    props: [inputsProp, bitsProp(8)],
    layout: (p) => gateLayout(num(p.inputs), num(p.bits)),
  },
  {
    type: 'xor',
    name: 'XOR',
    category: 'gates',
    kind: 'comb',
    tooltip: 'HIGH when an odd number of inputs are HIGH.',
    defaults: { inputs: 2, bits: 1 },
    props: [inputsProp, bitsProp(8)],
    layout: (p) => gateLayout(num(p.inputs), num(p.bits)),
  },
  {
    type: 'xnor',
    name: 'XNOR',
    category: 'gates',
    kind: 'comb',
    tooltip: 'HIGH when an even number of inputs are HIGH.',
    defaults: { inputs: 2, bits: 1 },
    props: [inputsProp, bitsProp(8)],
    layout: (p) => gateLayout(num(p.inputs), num(p.bits)),
  },
  {
    type: 'tri',
    name: 'Tri-state buffer',
    category: 'gates',
    kind: 'comb',
    tooltip: 'Passes its input to the output while EN is HIGH. Otherwise the output floats (Z).',
    defaults: { bits: 1 },
    props: [bitsProp(8)],
    layout: (p) => blockLayout([slot('in', 'A', 'in', num(p.bits)), slot('en', 'EN', 'in')], [slot('out', 'Y', 'out', num(p.bits))]),
  },

  // Memory
  {
    type: 'sr',
    name: 'SR latch',
    category: 'memory',
    kind: 'latch',
    tooltip: 'Set/reset latch built from NOR logic. S sets Q to 1; R clears it to 0.',
    defaults: {},
    props: [],
    layout: () => blockLayout([slot('s', 'S', 'in'), slot('r', 'R', 'in')], latchOutputs()),
  },
  {
    type: 'dlatch',
    name: 'D latch',
    category: 'memory',
    kind: 'latch',
    tooltip: 'Follows D while EN is HIGH, then holds its value when EN goes LOW.',
    defaults: {},
    props: [],
    layout: () => blockLayout([slot('d', 'D', 'in'), slot('en', 'EN', 'in')], latchOutputs()),
  },
  {
    type: 'dff',
    name: 'D flip-flop',
    category: 'memory',
    kind: 'ff',
    tooltip: 'Copies D to Q on each rising clock edge. CLR clears Q at once.',
    defaults: {},
    props: [],
    layout: () => blockLayout([slot('d', 'D', 'in'), clk('clk', 'CLK'), slot('clr', 'CLR', 'in')], latchOutputs()),
  },
  {
    type: 'jkff',
    name: 'JK flip-flop',
    category: 'memory',
    kind: 'ff',
    tooltip: 'On each rising edge: J=1 sets Q, K=1 clears it, and J=K=1 toggles it.',
    defaults: {},
    props: [],
    layout: () => blockLayout([slot('j', 'J', 'in'), clk('clk', 'CLK'), slot('k', 'K', 'in')], latchOutputs()),
  },
  {
    type: 'tff',
    name: 'T flip-flop',
    category: 'memory',
    kind: 'ff',
    tooltip: 'Toggles Q on each rising clock edge while T is HIGH.',
    defaults: {},
    props: [],
    layout: () => blockLayout([slot('t', 'T', 'in'), clk('clk', 'CLK')], latchOutputs()),
  },
  {
    type: 'reg',
    name: 'Register',
    category: 'memory',
    kind: 'ff',
    tooltip: 'Stores a word on each rising clock edge while EN is HIGH.',
    defaults: { bits: 4 },
    props: [bitsProp(8)],
    layout: (p) =>
      blockLayout(
        [slot('d', 'D', 'in', num(p.bits)), clk('clk', 'CLK'), slot('en', 'EN', 'in'), slot('clr', 'CLR', 'in')],
        [slot('q', 'Q', 'out', num(p.bits))],
      ),
  },
  {
    type: 'counter',
    name: 'Counter',
    category: 'memory',
    kind: 'ff',
    tooltip: 'Counts up on each rising edge while EN is HIGH. TC is HIGH at the maximum count.',
    defaults: { bits: 4 },
    props: [bitsProp(8)],
    layout: (p) =>
      blockLayout(
        [clk('clk', 'CLK'), slot('en', 'EN', 'in'), slot('clr', 'CLR', 'in')],
        [slot('q', 'Q', 'out', num(p.bits)), slot('tc', 'TC', 'out')],
      ),
  },
  {
    type: 'shift',
    name: 'Shift register',
    category: 'memory',
    kind: 'ff',
    tooltip: 'Shifts left on each rising edge and loads SER into bit 0.',
    defaults: { bits: 4 },
    props: [bitsProp(8)],
    layout: (p) => blockLayout([slot('ser', 'SER', 'in'), clk('clk', 'CLK'), slot('clr', 'CLR', 'in')], [slot('q', 'Q', 'out', num(p.bits))]),
  },

  // Arithmetic
  {
    type: 'ha',
    name: 'Half adder',
    category: 'arithmetic',
    kind: 'comb',
    tooltip: 'Adds two bits, giving a sum and a carry.',
    defaults: {},
    props: [],
    layout: () => blockLayout([slot('a', 'A', 'in'), slot('b', 'B', 'in')], [slot('s', 'S', 'out'), slot('c', 'C', 'out')]),
  },
  {
    type: 'fa',
    name: 'Full adder',
    category: 'arithmetic',
    kind: 'comb',
    tooltip: 'Adds two bits and a carry in, giving a sum and a carry out.',
    defaults: {},
    props: [],
    layout: () =>
      blockLayout(
        [slot('a', 'A', 'in'), slot('b', 'B', 'in'), slot('cin', 'CIN', 'in')],
        [slot('s', 'S', 'out'), slot('cout', 'COUT', 'out')],
      ),
  },
  {
    type: 'adder',
    name: 'N-bit adder',
    category: 'arithmetic',
    kind: 'comb',
    tooltip: 'Adds two words plus a carry in. COUT is the carry out of the top bit.',
    defaults: { bits: 4 },
    props: [bitsProp(16)],
    layout: (p) =>
      blockLayout(
        [slot('a', 'A', 'in', num(p.bits)), slot('b', 'B', 'in', num(p.bits)), slot('cin', 'CIN', 'in')],
        [slot('s', 'S', 'out', num(p.bits)), slot('cout', 'COUT', 'out')],
      ),
  },
  {
    type: 'cmp',
    name: 'Equality comparator',
    category: 'arithmetic',
    kind: 'comb',
    tooltip: 'HIGH when two words are equal.',
    defaults: { bits: 4 },
    props: [bitsProp(16)],
    layout: (p) => blockLayout([slot('a', 'A', 'in', num(p.bits)), slot('b', 'B', 'in', num(p.bits))], [slot('eq', 'EQ', 'out')]),
  },

  // Mux and decode
  {
    type: 'mux2',
    name: '2:1 multiplexer',
    category: 'mux',
    kind: 'comb',
    tooltip: 'Routes I0 or I1 to Y, chosen by S.',
    defaults: { bits: 1 },
    props: [bitsProp(8)],
    layout: (p) =>
      blockLayout(
        [slot('i0', 'I0', 'in', num(p.bits)), slot('i1', 'I1', 'in', num(p.bits)), slot('s', 'S', 'in')],
        [slot('y', 'Y', 'out', num(p.bits))],
      ),
  },
  {
    type: 'mux4',
    name: '4:1 multiplexer',
    category: 'mux',
    kind: 'comb',
    tooltip: 'Routes one of four inputs to Y, chosen by S0 and S1.',
    defaults: { bits: 1 },
    props: [bitsProp(8)],
    layout: (p) =>
      blockLayout(
        [
          slot('i0', 'I0', 'in', num(p.bits)),
          slot('i1', 'I1', 'in', num(p.bits)),
          slot('i2', 'I2', 'in', num(p.bits)),
          slot('i3', 'I3', 'in', num(p.bits)),
          slot('s0', 'S0', 'in'),
          slot('s1', 'S1', 'in'),
        ],
        [slot('y', 'Y', 'out', num(p.bits))],
      ),
  },
  {
    type: 'demux4',
    name: '1:4 demultiplexer',
    category: 'mux',
    kind: 'comb',
    tooltip: 'Routes D to one of four outputs, chosen by S0 and S1.',
    defaults: {},
    props: [],
    layout: () =>
      blockLayout(
        [slot('d', 'D', 'in'), slot('s0', 'S0', 'in'), slot('s1', 'S1', 'in')],
        [slot('y0', 'Y0', 'out'), slot('y1', 'Y1', 'out'), slot('y2', 'Y2', 'out'), slot('y3', 'Y3', 'out')],
      ),
  },
  {
    type: 'dec24',
    name: '2-to-4 decoder',
    category: 'mux',
    kind: 'comb',
    tooltip: 'Raises exactly one output for each input code while EN is HIGH.',
    defaults: {},
    props: [],
    layout: () =>
      blockLayout(
        [slot('a0', 'A0', 'in'), slot('a1', 'A1', 'in'), slot('en', 'EN', 'in')],
        [slot('y0', 'Y0', 'out'), slot('y1', 'Y1', 'out'), slot('y2', 'Y2', 'out'), slot('y3', 'Y3', 'out')],
      ),
  },

  // Buses
  {
    type: 'split',
    name: 'Bus splitter',
    category: 'buses',
    kind: 'comb',
    tooltip: 'Splits an n-bit bus into n single wires. Bit 0 is the least significant.',
    defaults: { n: 4 },
    props: [nProp],
    layout: (p) => busSplit(num(p.n)),
  },
  {
    type: 'merge',
    name: 'Bus merger',
    category: 'buses',
    kind: 'comb',
    tooltip: 'Combines n single wires into one n-bit bus. Wire 0 is the least significant bit.',
    defaults: { n: 4 },
    props: [nProp],
    layout: (p) => busMerge(num(p.n)),
  },
  {
    type: 'junction',
    name: 'Junction',
    category: 'buses',
    kind: 'junction',
    tooltip: 'A solder point. Wires joined here share one net.',
    defaults: { bits: 1 },
    props: [bitsProp(16)],
    layout: (p) => ({ x0: -5, y0: -5, x1: 5, y1: 5, pins: [pin('p', '', 0, 0, null, 'io', num(p.bits))] }),
  },

  // Power and passive
  {
    type: 'vcc',
    name: 'VCC',
    category: 'power',
    kind: 'source',
    tooltip: 'Supply rail: constant 1.',
    defaults: {},
    props: [],
    layout: () => boxLayout(40, 40, [pin('out', 'VCC', 40, 20, 'R', 'out')]),
  },
  {
    type: 'gnd',
    name: 'Ground',
    category: 'power',
    kind: 'source',
    tooltip: 'Ground rail: constant 0.',
    defaults: {},
    props: [],
    layout: () => boxLayout(40, 40, [pin('out', 'GND', 40, 20, 'R', 'out')]),
  },
  {
    type: 'pullup',
    name: 'Pull-up resistor',
    category: 'power',
    kind: 'source',
    tooltip: 'Weakly pulls its net to 1 when nothing else drives it.',
    defaults: {},
    props: [],
    layout: () => boxLayout(40, 40, [pin('out', '', 40, 20, 'R', 'out', 1, { weak: true })]),
  },
  {
    type: 'pulldown',
    name: 'Pull-down resistor',
    category: 'power',
    kind: 'source',
    tooltip: 'Weakly pulls its net to 0 when nothing else drives it.',
    defaults: {},
    props: [],
    layout: () => boxLayout(40, 40, [pin('out', '', 40, 20, 'R', 'out', 1, { weak: true })]),
  },

  // Misc
  {
    type: 'note',
    name: 'Text note',
    category: 'misc',
    kind: 'note',
    tooltip: 'A label for your circuit. It has no electrical effect.',
    defaults: { text: 'Note' },
    props: [{ key: 'text', label: 'Text', kind: 'text' }],
    layout: (p) => {
      const text = String(p.text);
      const lines = Math.max(1, Math.ceil(text.length / 40));
      const width = Math.max(80, Math.min(text.length, 40) * 7 + 16);
      return boxLayout(width, 16 * lines + 16, []);
    },
  },
];
