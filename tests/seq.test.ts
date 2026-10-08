import { describe, expect, it } from 'vitest';
import type { Props } from '../src/catalog/types';
import { clockPinOf, edgeUpdate, initState, isEdgeType, levelUpdate, outputs, SEQ_TYPES, type State } from '../src/sim/seq';
import type { Ins } from '../src/sim/comb';
import { known, make, unknown, type Sig } from '../src/sim/signal';

const K0 = known(0, 1);
const K1 = known(1, 1);
const X = unknown(1);

const edge = (type: string, props: Props, ins: Ins, st: State): State => edgeUpdate(type, props, ins, st);
const level = (type: string, props: Props, ins: Ins, st: State): State => levelUpdate(type, props, ins, st);

describe('catalog of sequential parts', () => {
  it('lists the latches and flip-flops and names clk only for edge types', () => {
    for (const t of ['sr', 'dlatch', 'dff', 'jkff', 'tff', 'reg', 'counter', 'shift']) {
      expect(SEQ_TYPES.has(t), t).toBe(true);
    }
    expect(isEdgeType('counter')).toBe(true);
    expect(isEdgeType('dlatch')).toBe(false);
    expect(clockPinOf('dff')).toBe('clk');
    expect(clockPinOf('sr')).toBeUndefined();
  });

  it('starts memory at 0 with complement outputs at 1', () => {
    expect(outputs('dff', {}, initState('dff', {}), {})).toEqual({ q: K0, qn: K1 });
    expect(outputs('reg', { bits: 4 }, initState('reg', { bits: 4 }), {}).q).toEqual(known(0, 4));
  });
});

describe('dff', () => {
  it('samples D only on a rising edge', () => {
    let st = initState('dff', {});
    st = level('dff', {}, { d: K1, clr: K0 }, st);
    expect(outputs('dff', {}, st, {}).q).toEqual(K0);
    st = edge('dff', {}, { d: K1, clr: K0, clk: K1 }, st);
    expect(outputs('dff', {}, st, {})).toEqual({ q: K1, qn: K0 });
  });

  it('clears Q asynchronously when CLR is 1', () => {
    let st = edge('dff', {}, { d: K1, clk: K1 }, initState('dff', {}));
    st = level('dff', {}, { d: K1, clr: K1 }, st);
    expect(outputs('dff', {}, st, {})).toEqual({ q: K0, qn: K1 });
  });

  it('gives X on the next edge when D is unknown', () => {
    const st = edge('dff', {}, { d: X, clk: K1 }, initState('dff', {}));
    expect(outputs('dff', {}, st, {}).q).toEqual(X);
  });
});

describe('jkff', () => {
  it('follows the J K truth table on each rising edge', () => {
    let st = initState('jkff', {});
    const step = (j: Sig, k: Sig): Sig => {
      st = edge('jkff', {}, { j, k, clk: K1 }, st);
      return outputs('jkff', {}, st, {}).q;
    };
    expect(step(K1, K0)).toEqual(K1); // 10 sets
    expect(step(K0, K1)).toEqual(K0); // 01 resets
    expect(step(K1, K1)).toEqual(K1); // 11 toggles from 0
    expect(step(K1, K1)).toEqual(K0); // 11 toggles from 1
    expect(step(K0, K0)).toEqual(K0); // 00 holds
  });
});

describe('tff', () => {
  it('returns to 0 after two edges with T = 1', () => {
    let st = initState('tff', {});
    st = edge('tff', {}, { t: K1, clk: K1 }, st);
    expect(outputs('tff', {}, st, {}).q).toEqual(K1);
    st = edge('tff', {}, { t: K1, clk: K1 }, st);
    expect(outputs('tff', {}, st, {}).q).toEqual(K0);
  });

  it('holds on an edge when T is 0', () => {
    const st = edge('tff', {}, { t: K0, clk: K1 }, initState('tff', {}));
    expect(outputs('tff', {}, st, {}).q).toEqual(K0);
  });
});

describe('register', () => {
  it('loads D on a rising edge only while EN is 1, and clears asynchronously', () => {
    const props = { bits: 4 };
    let st = initState('reg', props);
    st = edge('reg', props, { d: known(9, 4), en: K1, clk: K1 }, st);
    expect(outputs('reg', props, st, {}).q).toEqual(known(9, 4));
    st = edge('reg', props, { d: known(3, 4), en: K0, clk: K1 }, st);
    expect(outputs('reg', props, st, {}).q).toEqual(known(9, 4));
    st = level('reg', props, { clr: K1 }, st);
    expect(outputs('reg', props, st, {}).q).toEqual(known(0, 4));
  });
});

describe('counter', () => {
  it('counts modulo 16 and raises TC only at 15 while enabled', () => {
    const props = { bits: 4 };
    let st = initState('counter', props);
    for (let i = 0; i < 15; i++) st = edge('counter', props, { en: K1, clk: K1 }, st);
    expect(outputs('counter', props, st, { en: K1 }).q).toEqual(known(15, 4));
    expect(outputs('counter', props, st, { en: K1 }).tc).toEqual(K1);
    expect(outputs('counter', props, st, { en: K0 }).tc).toEqual(K0);
    st = edge('counter', props, { en: K1, clk: K1 }, st);
    expect(outputs('counter', props, st, { en: K1 }).q).toEqual(known(0, 4));
    expect(outputs('counter', props, st, { en: K1 }).tc).toEqual(K0);
  });

  it('holds on an edge while EN is 0', () => {
    const props = { bits: 4 };
    const st = edge('counter', props, { en: K0, clk: K1 }, initState('counter', props));
    expect(outputs('counter', props, st, { en: K0 }).q).toEqual(known(0, 4));
  });
});

describe('shift register', () => {
  it('shifts left and loads SER into bit 0', () => {
    const props = { bits: 4 };
    let st = initState('shift', props);
    for (const b of [1, 0, 1, 1]) st = edge('shift', props, { ser: known(b, 1), clk: K1 }, st);
    expect(outputs('shift', props, st, {}).q).toEqual(known(0b1011, 4));
  });

  it('puts an unknown SER into bit 0 as X', () => {
    const props = { bits: 4 };
    const st = edge('shift', props, { ser: X, clk: K1 }, initState('shift', props));
    expect(outputs('shift', props, st, {}).q).toEqual(make(0, 0b0001, 0, 4));
  });
});

describe('latches', () => {
  it('sr: S=1 and R=1 gives Q=0 and Qn=0, as NOR gates do', () => {
    const st = level('sr', {}, { s: K1, r: K1 }, initState('sr', {}));
    expect(outputs('sr', {}, st, {})).toEqual({ q: K0, qn: K0 });
  });

  it('sr: S sets, R resets, and both low holds', () => {
    let st = level('sr', {}, { s: K1, r: K0 }, initState('sr', {}));
    expect(outputs('sr', {}, st, {})).toEqual({ q: K1, qn: K0 });
    st = level('sr', {}, { s: K0, r: K0 }, st);
    expect(outputs('sr', {}, st, {})).toEqual({ q: K1, qn: K0 });
    st = level('sr', {}, { s: K0, r: K1 }, st);
    expect(outputs('sr', {}, st, {})).toEqual({ q: K0, qn: K1 });
  });

  it('sr: an unknown input gives X', () => {
    const st = level('sr', {}, { s: X, r: K0 }, initState('sr', {}));
    expect(outputs('sr', {}, st, {}).q).toEqual(X);
  });

  it('dlatch: follows D while EN is 1 and holds while EN is 0', () => {
    let st = level('dlatch', {}, { d: K1, en: K1 }, initState('dlatch', {}));
    expect(outputs('dlatch', {}, st, {})).toEqual({ q: K1, qn: K0 });
    st = level('dlatch', {}, { d: K0, en: K0 }, st);
    expect(outputs('dlatch', {}, st, {})).toEqual({ q: K1, qn: K0 });
  });

  it('dlatch: unknown EN gives X', () => {
    const st = level('dlatch', {}, { d: K1, en: X }, initState('dlatch', {}));
    expect(outputs('dlatch', {}, st, {}).q).toEqual(X);
  });
});
