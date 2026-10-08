import { describe, expect, it } from 'vitest';
import type { Props } from '../src/catalog/types';
import { COMB_TYPES, evalComb, type Ins } from '../src/sim/comb';
import { floating, known, unknown } from '../src/sim/signal';

const K0 = known(0, 1);
const K1 = known(1, 1);
const X = unknown(1);

const run = (type: string, props: Props, ins: Ins) => evalComb(type, props, ins);

describe('COMB_TYPES', () => {
  it('lists every combinational part and no sequential ones', () => {
    const comb = ['not', 'buf', 'and', 'or', 'nand', 'nor', 'xor', 'xnor', 'tri', 'ha', 'fa', 'adder', 'cmp'];
    const more = ['mux2', 'mux4', 'demux4', 'dec24', 'split', 'merge'];
    for (const t of [...comb, ...more]) expect(COMB_TYPES.has(t), t).toBe(true);
    expect(COMB_TYPES.has('dff')).toBe(false);
  });
});

describe('gates', () => {
  it('NAND of 1 and 1 is 0', () => {
    expect(run('nand', { inputs: 2, bits: 1 }, { in0: K1, in1: K1 }).out).toEqual(K0);
  });

  it('XOR of three 1s is 1', () => {
    expect(run('xor', { inputs: 3, bits: 1 }, { in0: K1, in1: K1, in2: K1 }).out).toEqual(K1);
  });

  it('XNOR of 1 and 1 is 1', () => {
    expect(run('xnor', { inputs: 2, bits: 1 }, { in0: K1, in1: K1 }).out).toEqual(K1);
  });

  it('AND with an X input and a known 0 gives 0', () => {
    expect(run('and', { inputs: 2, bits: 1 }, { in0: X, in1: K0 }).out).toEqual(K0);
  });

  it('folds an 8-input AND', () => {
    const ins: Ins = {};
    for (let i = 0; i < 8; i++) ins[`in${i}`] = K1;
    expect(run('and', { inputs: 8, bits: 1 }, ins).out).toEqual(K1);
  });

  it('NOT inverts across the width and passes X through', () => {
    expect(run('not', { bits: 4 }, { in0: known(0b1100, 4) }).out).toEqual(known(0b0011, 4));
    expect(run('not', { bits: 1 }, { in0: X }).out).toEqual(X);
  });

  it('buffer passes its input through unchanged', () => {
    expect(run('buf', { bits: 4 }, { in0: known(0b1010, 4) }).out).toEqual(known(0b1010, 4));
  });
});

describe('tri-state buffer', () => {
  it('floats when disabled and passes the data when enabled', () => {
    expect(run('tri', { bits: 1 }, { in: K1, en: K0 }).out).toEqual(floating(1));
    expect(run('tri', { bits: 1 }, { in: K1, en: K1 }).out).toEqual(K1);
  });

  it('gives X when the enable is unknown', () => {
    expect(run('tri', { bits: 1 }, { in: K1, en: X }).out).toEqual(X);
  });
});

describe('arithmetic', () => {
  it('half adder matches its truth table', () => {
    for (const a of [0, 1]) {
      for (const b of [0, 1]) {
        const out = run('ha', {}, { a: known(a, 1), b: known(b, 1) });
        expect(out.s).toEqual(known(a ^ b, 1));
        expect(out.c).toEqual(known(a & b, 1));
      }
    }
  });

  it('full adder matches its truth table', () => {
    for (let a = 0; a < 2; a++) {
      for (let b = 0; b < 2; b++) {
        for (let c = 0; c < 2; c++) {
          const out = run('fa', {}, { a: known(a, 1), b: known(b, 1), cin: known(c, 1) });
          const total = a + b + c;
          expect(out.s).toEqual(known(total & 1, 1));
          expect(out.cout).toEqual(known(total >> 1, 1));
        }
      }
    }
  });

  it('adds 9 + 9 + 0 in 4 bits to give 2 with carry 1', () => {
    expect(run('adder', { bits: 4 }, { a: known(9, 4), b: known(9, 4), cin: K0 })).toEqual({
      s: known(2, 4),
      cout: K1,
    });
  });

  it('gives unknown sum and carry when an input bit is unknown', () => {
    const out = run('adder', { bits: 4 }, { a: unknown(4), b: known(1, 4), cin: K0 });
    expect(out.s).toEqual(unknown(4));
    expect(out.cout).toEqual(X);
  });

  it('compares words for equality and gives X when unknown', () => {
    expect(run('cmp', { bits: 4 }, { a: known(5, 4), b: known(5, 4) }).eq).toEqual(K1);
    expect(run('cmp', { bits: 4 }, { a: known(5, 4), b: known(6, 4) }).eq).toEqual(K0);
    expect(run('cmp', { bits: 4 }, { a: unknown(4), b: known(6, 4) }).eq).toEqual(X);
  });
});

describe('multiplexers, demultiplexers and decoders', () => {
  it('mux2 with an unknown select gives 1 when both inputs are 1', () => {
    expect(run('mux2', { bits: 1 }, { i0: K1, i1: K1, s: X }).y).toEqual(K1);
  });

  it('mux2 with an unknown select gives X when the inputs differ', () => {
    expect(run('mux2', { bits: 1 }, { i0: K0, i1: K1, s: X }).y).toEqual(X);
  });

  it('mux2 with a known select routes that input', () => {
    expect(run('mux2', { bits: 4 }, { i0: known(3, 4), i1: known(12, 4), s: K1 }).y).toEqual(known(12, 4));
  });

  it('mux4 routes the input chosen by S1 and S0', () => {
    const ins: Ins = { i0: known(1, 4), i1: known(2, 4), i2: known(4, 4), i3: known(8, 4), s0: K0, s1: K1 };
    expect(run('mux4', { bits: 4 }, ins).y).toEqual(known(4, 4));
  });

  it('demux4 drives the selected output and zeros the rest', () => {
    expect(run('demux4', {}, { d: K1, s0: K1, s1: K0 })).toEqual({ y0: K0, y1: K1, y2: K0, y3: K0 });
  });

  it('demux4 makes every output X when a select is unknown', () => {
    expect(run('demux4', {}, { d: K1, s0: X, s1: K0 })).toEqual({ y0: X, y1: X, y2: X, y3: X });
  });

  it('dec24 is one-hot when enabled and all zero when disabled', () => {
    expect(run('dec24', {}, { a0: K0, a1: K1, en: K1 })).toEqual({ y0: K0, y1: K0, y2: K1, y3: K0 });
    expect(run('dec24', {}, { a0: K0, a1: K1, en: K0 })).toEqual({ y0: K0, y1: K0, y2: K0, y3: K0 });
  });
});

describe('bus splitter and merger', () => {
  it('round-trips a 4-bit value', () => {
    const bus = known(0b1011, 4);
    const split = run('split', { n: 4 }, { in: bus });
    expect(split).toEqual({ b0: K1, b1: K1, b2: K0, b3: K1 });
    expect(run('merge', { n: 4 }, split).out).toEqual(bus);
  });
});
