import type { PinRef } from '../model/types';

/** Pin direction: `in` is a sink, `out` drives its net, `io` only joins nets. */
export type Dir = 'in' | 'out' | 'io';

export interface PinSite {
  component: string;
  pin: string;
  dir: Dir;
  width: number;
  /** A weak driver (pull-up or pull-down) only applies where nothing strong drives. */
  weak?: boolean;
}

export interface WireEnds {
  id: string;
  from: PinRef;
  to: PinRef;
}

export interface NetInfo {
  width: number;
  drivers: PinSite[];
  sinks: PinSite[];
}

export interface Netlist {
  nets: NetInfo[];
  pinNet: Map<string, number>;
  wireNet: Map<string, number>;
  skippedWires: string[];
}

export function pinKey(component: string, pin: string): string {
  return `${component}#${pin}`;
}

/**
 * Groups pins into nets with union-find. A wire joins its two ends. A wire is
 * skipped when an end names an unknown pin or the two widths differ, and its id
 * is listed in `skippedWires`. Every site gets a net, even when nothing wires it.
 */
export function buildNetlist(sites: PinSite[], wires: WireEnds[]): Netlist {
  const index = new Map<string, number>();
  sites.forEach((s, i) => index.set(pinKey(s.component, s.pin), i));

  const parent = sites.map((_, i) => i);
  const find = (start: number): number => {
    let i = start;
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };

  const skipped = new Set<string>();
  for (const w of wires) {
    const a = index.get(pinKey(w.from.component, w.from.pin));
    const b = index.get(pinKey(w.to.component, w.to.pin));
    if (a === undefined || b === undefined || sites[a].width !== sites[b].width) {
      skipped.add(w.id);
      continue;
    }
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }

  const nets: NetInfo[] = [];
  const rootNet = new Map<number, number>();
  const pinNet = new Map<string, number>();
  sites.forEach((s, i) => {
    const root = find(i);
    let n = rootNet.get(root);
    if (n === undefined) {
      n = nets.length;
      rootNet.set(root, n);
      nets.push({ width: s.width, drivers: [], sinks: [] });
    }
    if (s.dir === 'out') nets[n].drivers.push(s);
    else if (s.dir === 'in') nets[n].sinks.push(s);
    pinNet.set(pinKey(s.component, s.pin), n);
  });

  const wireNet = new Map<string, number>();
  for (const w of wires) {
    if (skipped.has(w.id)) continue;
    const n = pinNet.get(pinKey(w.from.component, w.from.pin));
    if (n !== undefined) wireNet.set(w.id, n);
  }

  return { nets, pinNet, wireNet, skippedWires: [...skipped] };
}
