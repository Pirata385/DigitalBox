import { describe, expect, it } from 'vitest';
import { buildNetlist, pinKey, type PinSite, type WireEnds } from '../src/sim/netlist';

const site = (component: string, pin: string, dir: PinSite['dir'], width = 1): PinSite => ({
  component,
  pin,
  dir,
  width,
});

const wire = (id: string, a: [string, string], b: [string, string]): WireEnds => ({
  id,
  from: { component: a[0], pin: a[1] },
  to: { component: b[0], pin: b[1] },
});

describe('buildNetlist', () => {
  it('puts two wired pins on one net with the right drivers and sinks', () => {
    const sites = [site('sw', 'out', 'out'), site('led', 'in', 'in')];
    const net = buildNetlist(sites, [wire('w1', ['sw', 'out'], ['led', 'in'])]);

    const driverNet = net.pinNet.get(pinKey('sw', 'out'));
    const sinkNet = net.pinNet.get(pinKey('led', 'in'));
    expect(driverNet).toBeDefined();
    expect(sinkNet).toBe(driverNet);

    const info = net.nets[driverNet!];
    expect(info.drivers.map((s) => pinKey(s.component, s.pin))).toEqual([pinKey('sw', 'out')]);
    expect(info.sinks.map((s) => pinKey(s.component, s.pin))).toEqual([pinKey('led', 'in')]);
    expect(info.width).toBe(1);
  });

  it('joins three pins through an io junction into one net', () => {
    const sites = [
      site('a', 'out', 'out'),
      site('j', 'p', 'io'),
      site('b', 'in', 'in'),
      site('c', 'in', 'in'),
    ];
    const net = buildNetlist(sites, [
      wire('w1', ['a', 'out'], ['j', 'p']),
      wire('w2', ['j', 'p'], ['b', 'in']),
      wire('w3', ['j', 'p'], ['c', 'in']),
    ]);

    const n = net.pinNet.get(pinKey('a', 'out'));
    expect(net.pinNet.get(pinKey('b', 'in'))).toBe(n);
    expect(net.pinNet.get(pinKey('c', 'in'))).toBe(n);
    expect(net.pinNet.get(pinKey('j', 'p'))).toBe(n);
    expect(net.nets[n!].sinks).toHaveLength(2);
    expect(net.nets[n!].drivers).toHaveLength(1);
  });

  it('gives an unwired pin its own net with no drivers', () => {
    const net = buildNetlist([site('x', 'in', 'in')], []);
    const n = net.pinNet.get(pinKey('x', 'in'));
    expect(n).toBeDefined();
    expect(net.nets).toHaveLength(1);
    expect(net.nets[n!].drivers).toEqual([]);
    expect(net.nets[n!].sinks).toHaveLength(1);
  });

  it('skips a wire between widths 1 and 4 and reports its id', () => {
    const sites = [site('a', 'out', 'out', 1), site('b', 'in', 'in', 4)];
    const net = buildNetlist(sites, [wire('w9', ['a', 'out'], ['b', 'in'])]);

    expect(net.skippedWires).toEqual(['w9']);
    expect(net.pinNet.get(pinKey('a', 'out'))).not.toBe(net.pinNet.get(pinKey('b', 'in')));
    expect(net.wireNet.has('w9')).toBe(false);
  });

  it('skips a wire that names an unknown component', () => {
    const net = buildNetlist([site('a', 'out', 'out')], [wire('w2', ['a', 'out'], ['ghost', 'p'])]);
    expect(net.skippedWires).toEqual(['w2']);
  });

  it('maps each wire to the net of its from end', () => {
    const sites = [site('a', 'out', 'out'), site('b', 'in', 'in')];
    const net = buildNetlist(sites, [wire('w1', ['a', 'out'], ['b', 'in'])]);
    expect(net.wireNet.get('w1')).toBe(net.pinNet.get(pinKey('a', 'out')));
  });

  it('gives a net the width of its pins', () => {
    const sites = [site('bus', 'out', 'out', 4), site('probe', 'in', 'in', 4)];
    const net = buildNetlist(sites, [wire('w1', ['bus', 'out'], ['probe', 'in'])]);
    expect(net.nets[net.pinNet.get(pinKey('bus', 'out'))!].width).toBe(4);
  });

  it('lists every site in pinNet', () => {
    const sites = [site('a', 'out', 'out'), site('b', 'in', 'in'), site('c', 'in', 'in')];
    const net = buildNetlist(sites, [wire('w1', ['a', 'out'], ['b', 'in'])]);
    for (const s of sites) {
      expect(net.pinNet.has(pinKey(s.component, s.pin))).toBe(true);
    }
  });
});
