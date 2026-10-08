import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../src/catalog/types';
import { DEFS } from '../src/catalog/defs';
import { bitsOf, def, layoutOf, normalizeProps } from '../src/catalog/registry';

describe('catalog composition', () => {
  it('has exactly 45 parts with unique types', () => {
    expect(DEFS).toHaveLength(45);
    expect(new Set(DEFS.map((d) => d.type)).size).toBe(45);
  });

  it('matches the category counts in the spec', () => {
    const count: Record<string, number> = {};
    for (const d of DEFS) count[d.category] = (count[d.category] ?? 0) + 1;
    expect(count).toEqual({
      inputs: 6,
      outputs: 6,
      gates: 9,
      memory: 8,
      arithmetic: 4,
      mux: 4,
      buses: 3,
      power: 4,
      misc: 1,
    });
  });

  it('gives every category at least one part', () => {
    for (const c of CATEGORIES) {
      expect(DEFS.some((d) => d.category === c.id), c.id).toBe(true);
    }
  });
});

describe('layouts', () => {
  it('keeps pin keys unique, inside bounds, on the 10 px grid and apart', () => {
    for (const d of DEFS) {
      const l = d.layout(d.defaults);
      const keys = l.pins.map((p) => p.key);
      expect(new Set(keys).size, `${d.type} pin keys`).toBe(keys.length);
      const spots = new Set<string>();
      for (const p of l.pins) {
        const inside = p.x >= l.x0 && p.x <= l.x1 && p.y >= l.y0 && p.y <= l.y1;
        expect(inside, `${d.type}.${p.key} inside bounds`).toBe(true);
        expect(p.x % 10 === 0 && p.y % 10 === 0, `${d.type}.${p.key} on grid`).toBe(true);
        spots.add(`${p.x},${p.y}`);
      }
      expect(spots.size, `${d.type} pins overlap`).toBe(l.pins.length);
    }
  });

  it('keeps sinks and notes free of outputs, and junctions to io pins only', () => {
    for (const d of DEFS) {
      const l = d.layout(d.defaults);
      if (d.kind === 'sink' || d.kind === 'note') {
        expect(l.pins.some((p) => p.dir === 'out'), d.type).toBe(false);
      }
      if (d.kind === 'junction') {
        expect(l.pins.every((p) => p.dir === 'io'), d.type).toBe(true);
      }
    }
  });
});

describe('props', () => {
  it('clamps integer props to their range', () => {
    expect(normalizeProps(def('and'), { inputs: 99 }).inputs).toBe(8);
  });

  it('limits word width to 16 bits', () => {
    expect(bitsOf(def('word'), { bits: 40 })).toBe(16);
  });

  it('falls back to the default for a select value that is not an option', () => {
    expect(normalizeProps(def('clock'), { freq: 3 }).freq).toBe(1);
  });

  it('truncates note text to 200 characters', () => {
    const text = normalizeProps(def('note'), { text: 'x'.repeat(300) }).text as string;
    expect(text.length).toBe(200);
  });

  it('gives every prop key a default value', () => {
    for (const d of DEFS) {
      for (const p of d.props) {
        expect(d.defaults[p.key], `${d.type}.${p.key}`).toBeDefined();
      }
    }
  });
});

describe('lookup', () => {
  it('throws for an unknown type', () => {
    expect(() => def('nope')).toThrow();
  });

  it('layoutOf uses normalised props for the pin count and width', () => {
    const l = layoutOf({ type: 'and', props: { inputs: 3, bits: 4 } });
    const ins = l.pins.filter((p) => p.dir === 'in');
    expect(ins).toHaveLength(3);
    expect(ins.every((p) => p.width === 4)).toBe(true);
  });
});
