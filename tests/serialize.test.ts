import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../src/io/examples';
import { fileNameFor, FORMAT, parseSave, serializeSave, toSaveData, VERSION } from '../src/io/serialize';
import { AUTOSAVE_KEY, readAutosave, writeAutosave } from '../src/state/autosave';
import { known } from '../src/sim/signal';
import { Simulator } from '../src/sim/simulator';
import { makeCircuit } from './helpers';

const NOW = new Date('2026-10-08T12:00:00.000Z');
const VIEW = { zoom: 1.5, panX: 40, panY: -20 };

describe('save format', () => {
  it('serializes then parses back to the same circuit, view and inputs', () => {
    const doc = { ...makeCircuit([['sw', 'switch'], ['n', 'not']], [['sw', 'out', 'n', 'in0']]), name: 'Round trip' };
    const data = toSaveData(
      { doc, running: true, speed: 2, snap: { timeUs: 5000, inputs: { sw: 1 }, states: {} }, view: VIEW },
      NOW,
    );
    const parsed = parseSave(serializeSave(data));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.components).toEqual(doc.components);
    expect(parsed.data.wires).toEqual(doc.wires);
    expect(parsed.data.view).toEqual(VIEW);
    expect(parsed.data.sim.inputs).toEqual({ sw: 1 });
    expect(parsed.data.sim.timeUs).toBe(5000);
    expect(parsed.data.name).toBe('Round trip');
    expect(parsed.warnings).toEqual([]);
  });

  it('writes the format and version markers and the save time', () => {
    const doc = makeCircuit([], []);
    const json = JSON.parse(
      serializeSave(toSaveData({ doc, running: false, speed: 1, snap: { timeUs: 0, inputs: {}, states: {} }, view: VIEW }, NOW)),
    ) as Record<string, unknown>;
    expect(json.format).toBe(FORMAT);
    expect(json.version).toBe(VERSION);
    expect(json.savedAt).toBe(NOW.toISOString());
  });

  it('rejects non-JSON', () => {
    expect(parseSave('{')).toEqual({ ok: false, error: 'The file is not valid JSON.' });
  });

  it('rejects an unknown version', () => {
    const text = JSON.stringify({ format: 'digitalbox', version: 2, components: [], wires: [] });
    expect(parseSave(text).ok).toBe(false);
  });

  it('reports unknown component types by name', () => {
    const text = JSON.stringify({
      format: 'digitalbox',
      version: 1,
      components: [
        { id: 'a', type: 'flux', x: 0, y: 0, rot: 0, props: {} },
        { id: 'b', type: 'warp', x: 0, y: 0, rot: 0, props: {} },
      ],
      wires: [],
    });
    const r = parseSave(text);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('flux');
    expect(r.error).toContain('warp');
  });

  it('drops dangling and width-mismatched wires and counts them', () => {
    const text = JSON.stringify({
      format: 'digitalbox',
      version: 1,
      name: 'x',
      components: [
        { id: 'a', type: 'not', x: 0, y: 0, rot: 0, props: { bits: 1 } },
        { id: 'b', type: 'not', x: 100, y: 0, rot: 0, props: { bits: 1 } },
        { id: 'p', type: 'probe', x: 200, y: 0, rot: 0, props: { bits: 4 } },
      ],
      wires: [
        { id: 'ok', from: { component: 'a', pin: 'out' }, to: { component: 'b', pin: 'in0' } },
        { id: 'wide', from: { component: 'a', pin: 'out' }, to: { component: 'p', pin: 'in' } },
        { id: 'ghost', from: { component: 'a', pin: 'out' }, to: { component: 'missing', pin: 'in' } },
      ],
    });
    const r = parseSave(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.wires.map((w) => w.id)).toEqual(['ok']);
    expect(r.warnings).toHaveLength(2);
  });

  it('ignores non-numeric simulation values with a warning', () => {
    const text = JSON.stringify({
      format: 'digitalbox',
      version: 1,
      components: [],
      wires: [],
      sim: { running: false, speed: 1, timeUs: 0, inputs: { sw: 'on' }, states: {} },
    });
    const r = parseSave(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.sim.inputs).toEqual({});
    expect(r.warnings).toHaveLength(1);
  });

  it('names files from the circuit name, falling back to circuit', () => {
    expect(fileNameFor('Half adder!')).toBe('half-adder.digitalbox.json');
    expect(fileNameFor('   ')).toBe('circuit.digitalbox.json');
  });
});

describe('autosave storage', () => {
  it('ignores a corrupted or unreadable autosave', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('full');
      },
    } as unknown as Storage;
    expect(readAutosave(broken)).toBeNull();
    expect(() => writeAutosave('{', broken)).not.toThrow();
    expect(parseSave('{"format":').ok).toBe(false);
  });

  it('reads and writes the autosave key when storage works', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    } as unknown as Storage;
    writeAutosave('{"x":1}', storage);
    expect(data.get(AUTOSAVE_KEY)).toBe('{"x":1}');
    expect(readAutosave(storage)).toBe('{"x":1}');
  });
});

describe('examples', () => {
  it('ships the four examples from the spec', () => {
    expect(EXAMPLES.map((e) => e.title)).toEqual(['Half adder', 'SR latch', '4-bit counter', 'Blinking LED']);
  });

  it('every example parses back with no warnings', () => {
    for (const ex of EXAMPLES) {
      const r = parseSave(serializeSave(ex.build()));
      expect(r.ok, ex.id).toBe(true);
      if (r.ok) expect(r.warnings, ex.id).toEqual([]);
    }
  });

  it('the half adder gives sum 1 and carry 0 for inputs 1 and 0', () => {
    const data = EXAMPLES.find((e) => e.id === 'half-adder')!.build();
    const sim = new Simulator();
    sim.build({ name: data.name, components: data.components, wires: data.wires });
    sim.setInput('c1', 1);
    sim.setInput('c2', 0);
    expect(sim.pinSig('c5', 'in')).toEqual(known(1, 1));
    expect(sim.pinSig('c6', 'in')).toEqual(known(0, 1));
  });

  it('the 4-bit counter shows 4 after 4 s at 1 Hz', () => {
    const data = EXAMPLES.find((e) => e.id === 'counter-4bit')!.build();
    const sim = new Simulator();
    sim.build({ name: data.name, components: data.components, wires: data.wires });
    sim.advance(4e6);
    expect(sim.pinSig('c4', 'q')).toEqual(known(4, 4));
  });
});
