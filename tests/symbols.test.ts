import { describe, expect, it } from 'vitest';
import { DEFS } from '../src/catalog/defs';
import { sigClass, sigKey } from '../src/render/sig';
import { PAINTERS } from '../src/render/symbols';
import { floating, known, make, unknown } from '../src/sim/signal';

describe('symbols', () => {
  it('has a painter for every part in the catalog', () => {
    for (const d of DEFS) {
      expect(typeof PAINTERS[d.type], d.type).toBe('function');
    }
  });
});

describe('signal classes', () => {
  it('classifies single bits as hi, lo, x or z', () => {
    expect(sigClass(known(1, 1), 1)).toBe('hi');
    expect(sigClass(known(0, 1), 1)).toBe('lo');
    expect(sigClass(unknown(1), 1)).toBe('x');
    expect(sigClass(floating(1), 1)).toBe('z');
  });

  it('classifies buses as bus when fully known, x when any bit is unknown, and z when floating', () => {
    expect(sigClass(known(5, 4), 4)).toBe('bus');
    expect(sigClass(make(0, 1, 0, 4), 4)).toBe('x');
    expect(sigClass(floating(4), 4)).toBe('z');
  });

  it('keys are equal exactly when the values are', () => {
    expect(sigKey(known(3, 4), 4)).toBe(sigKey(known(3, 4), 4));
    expect(sigKey(known(3, 4), 4)).not.toBe(sigKey(known(2, 4), 4));
    expect(sigKey(unknown(1), 1)).not.toBe(sigKey(floating(1), 1));
  });
});
