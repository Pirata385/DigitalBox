import { describe, expect, it } from 'vitest';
import { def } from '../src/catalog/registry';
import { coercePropValue } from '../src/ui/propInput';
import { visiblePartsFor } from '../src/ui/toolboxModel';

describe('toolbox filtering', () => {
  it('lists every part under All', () => {
    expect(visiblePartsFor('all', '')).toHaveLength(45);
  });

  it('shows only the chosen category', () => {
    const gates = visiblePartsFor('gates', '');
    expect(gates.every((d) => d.category === 'gates')).toBe(true);
    expect(gates.map((d) => d.type)).toContain('and');
  });

  it('searches names and tooltips across every category when a search is typed', () => {
    const types = visiblePartsFor('inputs', 'flip-flop').map((d) => d.type);
    expect(types).toContain('dff');
    expect(types).toContain('jkff');
    expect(types).not.toContain('switch');
  });

  it('matches case-insensitively', () => {
    expect(visiblePartsFor('all', 'NOR').map((d) => d.type)).toContain('nor');
  });
});

describe('property input', () => {
  it('reads an integer and clamps it to the range', () => {
    const spec = def('and').props.find((p) => p.key === 'inputs');
    expect(spec).toBeDefined();
    expect(coercePropValue(spec!, '99')).toBe(8);
    expect(coercePropValue(spec!, '1')).toBe(2);
  });

  it('rejects text that is not a number', () => {
    const spec = def('and').props.find((p) => p.key === 'inputs');
    expect(coercePropValue(spec!, 'abc')).toBeUndefined();
  });

  it('accepts a select value only when it is one of the options', () => {
    const spec = def('clock').props[0];
    expect(coercePropValue(spec, '2')).toBe(2);
    expect(coercePropValue(spec, '3')).toBeUndefined();
  });

  it('trims text to 200 characters', () => {
    const spec = def('note').props[0];
    expect(coercePropValue(spec, 'x'.repeat(300))).toBe('x'.repeat(200));
  });
});
