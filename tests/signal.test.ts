import { describe, expect, it } from 'vitest';
import {
  and2,
  asLogic,
  bitStr,
  floating,
  hexStr,
  isKnown,
  known,
  make,
  mask,
  not1,
  or2,
  resolve,
  toInt,
  unknown,
  xor2,
} from '../src/sim/signal';

const K0 = known(0, 1);
const K1 = known(1, 1);
const X = unknown(1);
const Z = floating(1);

describe('mask', () => {
  it('covers w bits for widths 1 to 32', () => {
    expect(mask(1)).toBe(0b1);
    expect(mask(4)).toBe(0xf);
    expect(mask(31)).toBe(0x7fffffff);
    expect(mask(32)).toBe(0xffffffff);
  });

  it('rejects widths outside 1 to 32', () => {
    expect(() => mask(0)).toThrow(RangeError);
    expect(() => mask(33)).toThrow(RangeError);
  });
});

describe('make', () => {
  it('masks to w bits and keeps the masks unsigned', () => {
    expect(make(0xff, 0x0f, 0x30, 4)).toEqual({ v: 0, x: 0xf, z: 0 });
    expect(make(-1, 0, 0, 32).v).toBe(0xffffffff);
  });

  it('lets z win over x on the same bit', () => {
    expect(make(0, 0b1, 0b1, 1)).toEqual({ v: 0, x: 0, z: 1 });
  });

  it('clears known value bits that are unknown or floating', () => {
    expect(make(0b1111, 0b0100, 0b0001, 4)).toEqual({ v: 0b1010, x: 0b0100, z: 0b0001 });
  });
});

describe('constructors and conversions', () => {
  it('known masks the value to its width', () => {
    expect(known(0x1ff, 8)).toEqual({ v: 0xff, x: 0, z: 0 });
  });

  it('asLogic turns floating bits into unknown bits', () => {
    expect(asLogic(floating(4), 4)).toEqual(unknown(4));
  });

  it('isKnown ignores bits above the width', () => {
    expect(isKnown(known(3, 2), 2)).toBe(true);
    expect(isKnown(unknown(2), 2)).toBe(false);
    expect(isKnown(make(0, 0b10, 0, 2), 1)).toBe(true);
  });

  it('toInt returns null for any unknown or floating bit', () => {
    expect(toInt(known(10, 4), 4)).toBe(10);
    expect(toInt(unknown(4), 4)).toBeNull();
    expect(toInt(make(0, 0, 0b1000, 4), 4)).toBeNull();
  });
});

describe('gates with X and Z', () => {
  it('and2: 0 AND X is 0, 1 AND X is X, X AND X is X', () => {
    expect(and2(K0, X, 1)).toEqual(K0);
    expect(and2(K1, X, 1)).toEqual(X);
    expect(and2(X, X, 1)).toEqual(X);
  });

  it('and2 treats Z as X: 1 AND Z is X', () => {
    expect(and2(K1, Z, 1)).toEqual(X);
    expect(and2(K0, Z, 1)).toEqual(K0);
  });

  it('or2: 1 OR X is 1, 0 OR X is X', () => {
    expect(or2(K1, X, 1)).toEqual(K1);
    expect(or2(K0, X, 1)).toEqual(X);
  });

  it('xor2: any unknown input gives X', () => {
    expect(xor2(K1, X, 1)).toEqual(X);
    expect(xor2(K1, K1, 1)).toEqual(K0);
    expect(xor2(K1, K0, 1)).toEqual(K1);
  });

  it('not1: NOT Z is X and NOT 0 is 1', () => {
    expect(not1(Z, 1)).toEqual(X);
    expect(not1(K0, 1)).toEqual(K1);
  });

  it('operates bitwise across the width', () => {
    expect(and2(known(0b1100, 4), known(0b1010, 4), 4)).toEqual(known(0b1000, 4));
    expect(or2(known(0b1100, 4), known(0b1010, 4), 4)).toEqual(known(0b1110, 4));
    expect(xor2(known(0b1100, 4), known(0b1010, 4), 4)).toEqual(known(0b0110, 4));
    expect(not1(known(0b1100, 4), 4)).toEqual(known(0b0011, 4));
  });
});

describe('resolve', () => {
  it('ignores floating drivers', () => {
    expect(resolve([known(1, 1), floating(1)], 1)).toEqual({ value: K1, conflict: false });
  });

  it('flags disagreeing known drivers as a conflict', () => {
    expect(resolve([known(1, 1), known(0, 1)], 1)).toEqual({ value: X, conflict: true });
  });

  it('floats when nothing drives', () => {
    expect(resolve([floating(1), floating(1)], 1)).toEqual({ value: Z, conflict: false });
  });

  it('an unknown driver gives X without a conflict', () => {
    expect(resolve([unknown(1)], 1)).toEqual({ value: X, conflict: false });
  });

  it('agreeing known drivers do not conflict', () => {
    expect(resolve([known(1, 1), known(1, 1)], 1)).toEqual({ value: K1, conflict: false });
  });

  it('resolves bit by bit and marks only the clashing bit as X', () => {
    expect(resolve([make(0b1010, 0, 0b0101, 4), make(0b0100, 0, 0b1011, 4)], 4)).toEqual({
      value: make(0b1110, 0, 0b0001, 4),
      conflict: false,
    });
    expect(resolve([known(0b1010, 4), known(0b0010, 4)], 4)).toEqual({
      value: make(0b0010, 0b1000, 0, 4),
      conflict: true,
    });
  });
});

describe('formatting', () => {
  it('bitStr prints MSB first with X and Z', () => {
    expect(bitStr(make(0b0100, 0b1000, 0b0001, 4), 4)).toBe('X10Z');
  });

  it('hexStr prints one digit per nibble', () => {
    expect(hexStr(known(0xab, 8), 8)).toBe('AB');
    expect(hexStr(known(0x5, 3), 3)).toBe('5');
  });

  it('hexStr shows X for a nibble with an unknown bit and Z for a floating nibble', () => {
    expect(hexStr(make(0xa0, 0x0f, 0, 8), 8)).toBe('AX');
    expect(hexStr(make(0, 0, 0xf0, 8), 8)).toBe('Z0');
  });
});
