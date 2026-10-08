import { def, layoutOf, normalizeProps } from '../catalog/registry';
import type { Layout } from '../catalog/types';
import type { Circuit, Component, PinRef, Pt, Rot, Selection, Wire } from './types';

export function emptyCircuit(name = 'Untitled circuit'): Circuit {
  return { name, components: [], wires: [] };
}

/** `prefix` followed by the smallest integer that no component or wire id uses. */
export function freshId(c: Circuit, prefix: string): string {
  const taken = new Set<string>([...c.components.map((x) => x.id), ...c.wires.map((w) => w.id)]);
  for (let k = 1; ; k++) {
    const id = `${prefix}${k}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * Text that changes exactly when the netlist may have changed: part types, their
 * props, and wires. Positions and rotation are left out.
 */
export function topologySignature(c: Circuit): string {
  const parts = c.components.map((x) => {
    const props = Object.keys(x.props)
      .sort()
      .map((k) => `${k}=${String(x.props[k])}`)
      .join(',');
    return `${x.id}:${x.type}:${props}`;
  });
  const wires = c.wires.map((w) => `${w.id}:${w.from.component}.${w.from.pin}>${w.to.component}.${w.to.pin}`);
  return `${parts.join(';')}|${wires.join(';')}`;
}

export function addComponent(
  c: Circuit,
  type: string,
  x: number,
  y: number,
  props: Record<string, unknown> = {},
): { circuit: Circuit; id: string } {
  const d = def(type);
  const id = freshId(c, 'c');
  const comp: Component = { id, type, x, y, rot: 0, props: normalizeProps(d, props) };
  return { circuit: { ...c, components: [...c.components, comp] }, id };
}

export function moveComponents(c: Circuit, ids: readonly string[], dx: number, dy: number): Circuit {
  const picked = new Set(ids);
  return {
    ...c,
    components: c.components.map((x) => (picked.has(x.id) ? { ...x, x: x.x + dx, y: x.y + dy } : x)),
  };
}

/** Rotates parts about their centres. The origin does not change. */
export function rotateComponents(c: Circuit, ids: readonly string[], turns: 1 | -1): Circuit {
  const picked = new Set(ids);
  return {
    ...c,
    components: c.components.map((x) => {
      if (!picked.has(x.id)) return x;
      const rot = ((((x.rot + 90 * turns) % 360) + 360) % 360) as Rot;
      return { ...x, rot };
    }),
  };
}

/**
 * Sets one prop and normalises it. Wires that lose a pin, or whose width no
 * longer matches, are removed in the same step. Unknown keys are ignored.
 */
export function setComponentProp(c: Circuit, id: string, key: string, value: unknown): Circuit {
  const comp = c.components.find((x) => x.id === id);
  if (!comp) return c;
  const d = def(comp.type);
  if (!d.props.some((p) => p.key === key)) return c;
  const props = normalizeProps(d, { ...comp.props, [key]: value });
  const next: Circuit = { ...c, components: c.components.map((x) => (x.id === id ? { ...x, props } : x)) };
  return pruneWires(next).circuit;
}

/** Removes the selected parts and wires, and every wire attached to a removed part. */
export function removeItems(c: Circuit, sel: Selection): Circuit {
  const deadParts = new Set(sel.components);
  const deadWires = new Set(sel.wires);
  return {
    ...c,
    components: c.components.filter((x) => !deadParts.has(x.id)),
    wires: c.wires.filter(
      (w) => !deadWires.has(w.id) && !deadParts.has(w.from.component) && !deadParts.has(w.to.component),
    ),
  };
}

function layoutFor(c: Circuit, id: string): Layout | undefined {
  const comp = c.components.find((x) => x.id === id);
  return comp ? layoutOf(comp) : undefined;
}

function pinWidth(c: Circuit, ref: PinRef): number | undefined {
  return layoutFor(c, ref.component)?.pins.find((p) => p.key === ref.pin)?.width;
}

function sameEnds(w: Wire, a: PinRef, b: PinRef): boolean {
  const same = (x: PinRef, y: PinRef) => x.component === y.component && x.pin === y.pin;
  return (same(w.from, a) && same(w.to, b)) || (same(w.from, b) && same(w.to, a));
}

export type ConnectResult =
  | { ok: true; circuit: Circuit; wireId: string }
  | { ok: false; reason: 'same-pin' | 'missing-pin' | 'width-mismatch' | 'duplicate' };

export function connect(c: Circuit, a: PinRef, b: PinRef): ConnectResult {
  if (a.component === b.component && a.pin === b.pin) return { ok: false, reason: 'same-pin' };
  const wa = pinWidth(c, a);
  const wb = pinWidth(c, b);
  if (wa === undefined || wb === undefined) return { ok: false, reason: 'missing-pin' };
  if (wa !== wb) return { ok: false, reason: 'width-mismatch' };
  if (c.wires.some((w) => sameEnds(w, a, b))) return { ok: false, reason: 'duplicate' };
  const wireId = freshId(c, 'w');
  const wire: Wire = { id: wireId, from: { ...a }, to: { ...b } };
  return { ok: true, circuit: { ...c, wires: [...c.wires, wire] }, wireId };
}

/**
 * Splits a wire at `at` with a junction part, then wires `start` to the
 * junction. The new ids are chosen while the original wire still exists, so the
 * removed id is never reused. Returns null when the wire is missing or the start
 * pin's width does not match.
 */
export function insertJunction(
  c: Circuit,
  wireId: string,
  at: Pt,
  start: PinRef,
): { circuit: Circuit; junctionId: string } | null {
  const wire = c.wires.find((w) => w.id === wireId);
  if (!wire) return null;
  const width = pinWidth(c, wire.from);
  if (width === undefined || pinWidth(c, start) !== width) return null;

  const junctionId = freshId(c, 'c');
  const junction: Component = {
    id: junctionId,
    type: 'junction',
    x: at.x,
    y: at.y,
    rot: 0,
    props: normalizeProps(def('junction'), { bits: width }),
  };
  const jPin: PinRef = { component: junctionId, pin: 'p' };
  let work: Circuit = { ...c, components: [...c.components, junction] };
  const idA = freshId(work, 'w');
  work = { ...work, wires: [...work.wires, { id: idA, from: { ...wire.from }, to: jPin }] };
  const idB = freshId(work, 'w');
  work = { ...work, wires: [...work.wires, { id: idB, from: jPin, to: { ...wire.to } }] };
  const idC = freshId(work, 'w');
  work = { ...work, wires: [...work.wires, { id: idC, from: { ...start }, to: jPin }] };
  work = { ...work, wires: work.wires.filter((w) => w.id !== wireId) };
  return { circuit: work, junctionId };
}

/** Removes wires whose pins are gone or whose two widths differ. */
export function pruneWires(c: Circuit): { circuit: Circuit; removed: number } {
  const layouts = new Map<string, Layout>(c.components.map((x) => [x.id, layoutOf(x)]));
  const widthOf = (ref: PinRef): number | undefined =>
    layouts.get(ref.component)?.pins.find((p) => p.key === ref.pin)?.width;
  const keep = c.wires.filter((w) => {
    const a = widthOf(w.from);
    const b = widthOf(w.to);
    return a !== undefined && b !== undefined && a === b;
  });
  return { circuit: { ...c, wires: keep }, removed: c.wires.length - keep.length };
}

export interface Clipboard {
  components: Component[];
  wires: Wire[];
}

/** Copies the selected parts, and the wires that join two selected parts. */
export function copyItems(c: Circuit, sel: Selection): Clipboard {
  const picked = new Set(sel.components);
  return {
    components: c.components.filter((x) => picked.has(x.id)).map((x) => ({ ...x, props: { ...x.props } })),
    wires: c
      .wires.filter((w) => picked.has(w.from.component) && picked.has(w.to.component))
      .map((w) => ({ ...w, from: { ...w.from }, to: { ...w.to } })),
  };
}

/**
 * Pastes a clipboard with fresh ids, offset by (dx, dy). A wire is kept only when
 * both of its parts are pasted too.
 */
export function pasteItems(c: Circuit, clip: Clipboard, dx: number, dy: number): { circuit: Circuit; selection: Selection } {
  const idMap = new Map<string, string>();
  let work: Circuit = c;
  const partIds: string[] = [];
  for (const comp of clip.components) {
    const id = freshId(work, 'c');
    idMap.set(comp.id, id);
    partIds.push(id);
    const copy: Component = { ...comp, id, x: comp.x + dx, y: comp.y + dy, props: { ...comp.props } };
    work = { ...work, components: [...work.components, copy] };
  }
  const wireIds: string[] = [];
  for (const w of clip.wires) {
    const from = idMap.get(w.from.component);
    const to = idMap.get(w.to.component);
    if (from === undefined || to === undefined) continue;
    const id = freshId(work, 'w');
    wireIds.push(id);
    work = {
      ...work,
      wires: [...work.wires, { id, from: { component: from, pin: w.from.pin }, to: { component: to, pin: w.to.pin } }],
    };
  }
  return { circuit: work, selection: { components: partIds, wires: wireIds } };
}
