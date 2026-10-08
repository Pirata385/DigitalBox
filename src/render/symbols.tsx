import type { ReactElement } from 'react';
import type { PinSpec, Props } from '../catalog/types';
import { bitStr, hexStr, isKnown, known, toInt, type Sig } from '../sim/signal';

/** What a painter needs to draw one part. Coordinates are local to the part's origin. */
export interface PainterProps {
  type: string;
  props: Props;
  /** Box size from the layout. */
  w: number;
  h: number;
  pins: PinSpec[];
  /** Current value on a pin's net. Floating when the pin is unknown. */
  pin: (key: string) => Sig;
  /** Runtime input value (switch, button or word). */
  inputValue: number;
  /** Lit state: a switch closed, a button held, an LED or buzzer driven HIGH. */
  on: boolean;
  selected: boolean;
}

type Painter = (p: PainterProps) => ReactElement;

const LED_COLOURS: Record<string, string> = {
  red: '#f43f5e',
  green: '#22c55e',
  yellow: '#facc15',
  blue: '#38bdf8',
  white: '#f8fafc',
};

/** Segment masks for hex digits 0 to F. Bit 0 is segment a, and bit 6 is segment g. */
const SEG_MASK = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71];

/** Segment rectangles [x, y, w, h] in a 60 by 80 box, for segments a to g. */
const SEG_RECTS: [number, number, number, number][] = [
  [10, 6, 40, 6],
  [48, 12, 6, 26],
  [48, 42, 6, 26],
  [10, 68, 40, 6],
  [4, 42, 6, 26],
  [4, 12, 6, 26],
  [10, 37, 40, 6],
];

const SEG_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

function Glyph({ lit }: { lit: (i: number) => boolean }): ReactElement {
  return (
    <g>
      {SEG_RECTS.map(([x, y, w, h], i) => (
        <rect key={i} className={lit(i) ? 'seg seg-on' : 'seg'} x={x} y={y} width={w} height={h} rx={2} />
      ))}
    </g>
  );
}

/** Text for a value: a bit as 0, 1, X or Z, and a bus in the chosen base. */
function valueText(s: Sig, bits: number, format: string): string {
  if (bits === 1) return bitStr(s, 1);
  if (format === 'bin') return bitStr(s, bits);
  if (format === 'dec') {
    const n = toInt(s, bits);
    return n === null ? 'X' : String(n);
  }
  return hexStr(s, bits);
}

function PinLabel({ pin, w }: { pin: PinSpec; w: number }): ReactElement | null {
  if (!pin.label) return null;
  const left = pin.side === 'L';
  return (
    <text
      className="sym-pin"
      x={left ? (pin.clock ? 9 : 5) : w - 5}
      y={pin.y}
      textAnchor={left ? 'start' : 'end'}
      dominantBaseline="middle"
    >
      {pin.label}
    </text>
  );
}

/** A labelled box. Clock pins get a small triangle at their edge. */
function block(title: string): Painter {
  return (p) => (
    <g>
      <rect className="sym-body" x={0} y={0} width={p.w} height={p.h} rx={6} />
      <text className="sym-title" x={p.w / 2} y={p.h / 2} textAnchor="middle" dominantBaseline="middle">
        {title}
      </text>
      {p.pins.map((pin) => (
        <PinLabel key={pin.key} pin={pin} w={p.w} />
      ))}
      {p.pins
        .filter((pin) => pin.clock)
        .map((pin) => (
          <path key={`clk-${pin.key}`} className="sym-line" d={`M0 ${pin.y - 4} L6 ${pin.y} L0 ${pin.y + 4}`} fill="none" />
        ))}
    </g>
  );
}

/** Gates: AND and OR shapes, a triangle for buffers and NOT, and a bubble for inverting outputs. */
const gate: Painter = (p) => {
  const m = p.h / 2;
  const t = p.type;
  const body =
    t === 'and' || t === 'nand'
      ? `M0 0 H25 A25 ${m} 0 0 1 25 ${p.h} H0 Z`
      : t === 'not' || t === 'buf'
        ? `M0 0 L30 ${m} L0 ${p.h} Z`
        : `M0 0 Q25 0 50 ${m} Q25 ${p.h} 0 ${p.h} Q12 ${m} 0 0 Z`;
  const bubble = t === 'nand' || t === 'nor' || t === 'xnor' || t === 'not';
  const bubbleX = t === 'not' ? 34 : 54;
  return (
    <g>
      <path className="sym-body" d={body} />
      {(t === 'xor' || t === 'xnor') && <path className="sym-line" d={`M-6 0 Q6 ${m} -6 ${p.h}`} fill="none" />}
      {bubble && <circle className="sym-body" cx={bubbleX} cy={m} r={4} />}
    </g>
  );
};

const switchPainter: Painter = (p) => (
  <g>
    <rect className="sym-body" x={0} y={0} width={40} height={40} rx={6} />
    <rect className="sym-track" x={6} y={16} width={28} height={8} rx={4} />
    <circle className={p.on ? 'sym-knob sym-on' : 'sym-knob'} cx={p.on ? 28 : 12} cy={20} r={6} />
  </g>
);

const buttonPainter: Painter = (p) => (
  <g>
    <rect className="sym-body" x={0} y={0} width={40} height={40} rx={6} />
    <rect className="sym-track" x={8} y={28} width={24} height={4} rx={2} />
    <circle className={p.on ? 'sym-cap sym-on' : 'sym-cap'} cx={20} cy={p.on ? 19 : 17} r={9} />
  </g>
);

const clockPainter: Painter = () => (
  <g>
    <rect className="sym-body" x={0} y={0} width={40} height={40} rx={6} />
    <path className="sym-line" d="M6 28 H12 V12 H20 V28 H26 V12 H34" fill="none" />
  </g>
);

const constant = (digit: string): Painter => () => (
  <g>
    <rect className="sym-body" x={0} y={0} width={40} height={40} rx={6} />
    <text className="sym-value" x={20} y={20} textAnchor="middle" dominantBaseline="middle">
      {digit}
    </text>
  </g>
);

const rail = (name: string): Painter => () => (
  <g>
    <rect className="sym-body" x={0} y={0} width={40} height={40} rx={6} />
    <text className="sym-rail" x={20} y={20} textAnchor="middle" dominantBaseline="middle">
      {name}
    </text>
  </g>
);

const resistor: Painter = (p) => (
  <g>
    <rect className="sym-body" x={0} y={0} width={40} height={40} rx={6} />
    <path className="sym-line" d="M6 20 L10 12 L16 28 L22 12 L28 28 L32 20" fill="none" />
    <text className="sym-pin" x={20} y={35} textAnchor="middle">
      {p.type === 'pullup' ? 'UP' : 'DN'}
    </text>
  </g>
);

const wordPainter: Painter = (p) => {
  const bits = typeof p.props.bits === 'number' ? p.props.bits : 4;
  return (
    <g>
      <rect className="sym-body" x={0} y={0} width={60} height={40} rx={6} />
      <text className="sym-title" x={30} y={10} textAnchor="middle" dominantBaseline="middle">
        WORD
      </text>
      <text className="sym-value" x={30} y={27} textAnchor="middle" dominantBaseline="middle">
        {hexStr(known(p.inputValue, bits), bits)}
      </text>
    </g>
  );
};

const ledPainter: Painter = (p) => {
  const colour = LED_COLOURS[String(p.props.color)] ?? LED_COLOURS.red;
  return (
    <g>
      <circle cx={20} cy={20} r={14} fill={colour} opacity={p.on ? 0.25 : 0} />
      <circle className="sym-led-rim" cx={20} cy={20} r={10} fill={colour} opacity={p.on ? 1 : 0.18} />
    </g>
  );
};

const probePainter: Painter = (p) => {
  const bits = typeof p.props.bits === 'number' ? p.props.bits : 1;
  return (
    <g>
      <rect className="sym-body" x={0} y={0} width={40} height={40} rx={6} />
      <text className="sym-value" x={20} y={20} textAnchor="middle" dominantBaseline="middle">
        {valueText(p.pin('in'), bits, 'hex')}
      </text>
    </g>
  );
};

const segHexPainter: Painter = (p) => {
  const v = toInt(p.pin('in'), 4);
  const digit = v === null ? 0 : SEG_MASK[v];
  return (
    <g>
      <rect className="sym-body" x={0} y={0} width={60} height={80} rx={6} />
      <Glyph lit={(i) => ((digit >> i) & 1) === 1} />
      {v === null && (
        <text className="sym-pin" x={52} y={74} textAnchor="end">
          X
        </text>
      )}
    </g>
  );
};

const segRawPainter: Painter = (p) => {
  const lit = SEG_LETTERS.map((k) => {
    const s = p.pin(k);
    return isKnown(s, 1) && (s.v & 1) === 1;
  });
  return (
    <g>
      <rect className="sym-body" x={0} y={0} width={60} height={160} rx={6} />
      <g transform="translate(14 40) scale(0.7)">
        <Glyph lit={(i) => lit[i]} />
      </g>
      {p.pins.map((pin) => (
        <PinLabel key={pin.key} pin={pin} w={p.w} />
      ))}
    </g>
  );
};

const busPainter: Painter = (p) => {
  const bits = typeof p.props.bits === 'number' ? p.props.bits : 8;
  const format = typeof p.props.format === 'string' ? p.props.format : 'hex';
  return (
    <g>
      <rect className="sym-body" x={0} y={0} width={80} height={40} rx={6} />
      <text className="sym-value" x={40} y={20} textAnchor="middle" dominantBaseline="middle">
        {valueText(p.pin('in'), bits, format)}
      </text>
    </g>
  );
};

const buzzerPainter: Painter = (p) => (
  <g>
    <rect className="sym-body" x={0} y={0} width={40} height={40} rx={6} />
    <path className="sym-line" d="M8 16 H14 L22 10 V30 L14 24 H8 Z" fill="none" />
    {p.on && (
      <g>
        <path className="sym-line" d="M26 14 Q30 20 26 26" fill="none" />
        <path className="sym-line" d="M30 10 Q37 20 30 30" fill="none" />
      </g>
    )}
  </g>
);

const notePainter: Painter = (p) => {
  const text = String(p.props.text ?? '');
  const lines = text.match(/.{1,40}/g) ?? [''];
  return (
    <g>
      <rect className="sym-note" x={0} y={0} width={p.w} height={p.h} rx={6} />
      {lines.map((line, i) => (
        <text key={i} className="sym-note-text" x={8} y={16 + i * 16} dominantBaseline="middle">
          {line}
        </text>
      ))}
    </g>
  );
};

const junctionPainter: Painter = () => <circle className="sym-junction" cx={0} cy={0} r={4} />;

const BLOCK_TITLES: Record<string, string> = {
  tri: 'TRI',
  sr: 'SR',
  dlatch: 'D LATCH',
  dff: 'D FF',
  jkff: 'JK FF',
  tff: 'T FF',
  reg: 'REG',
  counter: 'COUNT',
  shift: 'SHIFT',
  ha: 'HALF +',
  fa: 'FULL +',
  adder: 'N-BIT +',
  cmp: 'EQ',
  mux2: 'MUX 2:1',
  mux4: 'MUX 4:1',
  demux4: 'DEMUX 1:4',
  dec24: 'DEC 2:4',
  split: 'SPLIT',
  merge: 'MERGE',
};

/** One painter per catalog type. The coverage test checks that none is missing. */
export const PAINTERS: Record<string, Painter> = {
  switch: switchPainter,
  button: buttonPainter,
  clock: clockPainter,
  const0: constant('0'),
  const1: constant('1'),
  word: wordPainter,
  led: ledPainter,
  probe: probePainter,
  seghex: segHexPainter,
  segraw: segRawPainter,
  busmon: busPainter,
  buzzer: buzzerPainter,
  not: gate,
  buf: gate,
  and: gate,
  nand: gate,
  or: gate,
  nor: gate,
  xor: gate,
  xnor: gate,
  vcc: rail('VCC'),
  gnd: rail('GND'),
  pullup: resistor,
  pulldown: resistor,
  note: notePainter,
  junction: junctionPainter,
};
for (const [type, title] of Object.entries(BLOCK_TITLES)) PAINTERS[type] = block(title);

/** Draws one part's body. Pin dots are drawn by ComponentView. */
export function PartSymbol(p: PainterProps): ReactElement {
  const paint = PAINTERS[p.type];
  return paint ? paint(p) : <rect className="sym-body" x={0} y={0} width={p.w} height={p.h} />;
}
