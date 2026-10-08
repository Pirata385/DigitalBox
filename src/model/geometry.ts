import { layoutOf } from '../catalog/registry';
import type { Side } from '../catalog/types';
import type { Dir } from '../sim/netlist';
import type { Circuit, Component, PinRef, Pt, Rot, Wire } from './types';

/** Grid spacing in world px. Pins and parts snap to it. */
export const GRID = 10;
/** Length of the straight stub a wire leaves a pin with, before it turns. */
export const STUB = 10;

/** Nearest grid multiple. `|| 0` turns -0 into 0. */
export function snap(v: number): number {
  return (Math.round(v / GRID) || 0) * GRID;
}

/** Exact cosine and sine for the four rotations, so quarter turns stay exact integers. */
const COS: Record<Rot, number> = { 0: 1, 90: 0, 180: -1, 270: 0 };
const SIN: Record<Rot, number> = { 0: 0, 90: 1, 180: 0, 270: -1 };

/** Rotates a point about `centre` by `rot` degrees, clockwise on screen (y grows downward). */
export function rotatePoint(p: Pt, centre: Pt, rot: Rot): Pt {
  const dx = p.x - centre.x;
  const dy = p.y - centre.y;
  return {
    x: centre.x + dx * COS[rot] - dy * SIN[rot] + 0,
    y: centre.y + dx * SIN[rot] + dy * COS[rot] + 0,
  };
}

function rotateVec(v: Pt, rot: Rot): Pt {
  return {
    x: v.x * COS[rot] - v.y * SIN[rot] + 0,
    y: v.x * SIN[rot] + v.y * COS[rot] + 0,
  };
}

const SIDE_VEC: Record<Exclude<Side, null>, Pt> = {
  L: { x: -1, y: 0 },
  R: { x: 1, y: 0 },
  T: { x: 0, y: -1 },
  B: { x: 0, y: 1 },
};

export interface PlacedPin {
  key: string;
  label: string;
  dir: Dir;
  width: number;
  clock: boolean;
  weak: boolean;
  /** World position. */
  p: Pt;
  /** Unit vector pointing away from the part, in world space. Null when the pin has no stub. */
  out: Pt | null;
}

function centreOf(c: Component, b: { x0: number; y0: number; x1: number; y1: number }): Pt {
  return { x: c.x + (b.x0 + b.x1) / 2, y: c.y + (b.y0 + b.y1) / 2 };
}

/** Every pin of a placed part, at its world position with its outward direction. */
export function placedPins(c: Component): PlacedPin[] {
  const layout = layoutOf(c);
  const centre = centreOf(c, layout);
  return layout.pins.map((pin) => ({
    key: pin.key,
    label: pin.label,
    dir: pin.dir,
    width: pin.width,
    clock: pin.clock === true,
    weak: pin.weak === true,
    p: rotatePoint({ x: c.x + pin.x, y: c.y + pin.y }, centre, c.rot),
    out: pin.side ? rotateVec(SIDE_VEC[pin.side], c.rot) : null,
  }));
}

export function pinPosition(c: Component, pinKey: string): PlacedPin | undefined {
  return placedPins(c).find((p) => p.key === pinKey);
}

/** World-space bounds of the rotated box. */
export function componentBox(c: Component): { x0: number; y0: number; x1: number; y1: number } {
  const l = layoutOf(c);
  const centre = centreOf(c, l);
  const corners = [
    { x: c.x + l.x0, y: c.y + l.y0 },
    { x: c.x + l.x1, y: c.y + l.y0 },
    { x: c.x + l.x1, y: c.y + l.y1 },
    { x: c.x + l.x0, y: c.y + l.y1 },
  ].map((p) => rotatePoint(p, centre, c.rot));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** The topmost part whose rotated body contains `p`. Parts later in the list draw on top. */
export function hitComponent(comps: readonly Component[], p: Pt): Component | undefined {
  for (let i = comps.length - 1; i >= 0; i--) {
    const c = comps[i];
    const l = layoutOf(c);
    const centre = centreOf(c, l);
    const local = rotatePoint(p, centre, ((360 - c.rot) % 360) as Rot);
    const lx = local.x - c.x;
    const ly = local.y - c.y;
    if (lx >= l.x0 && lx <= l.x1 && ly >= l.y0 && ly <= l.y1) return c;
  }
  return undefined;
}

export interface RouteEnd {
  p: Pt;
  out: Pt | null;
}

function add(a: Pt, b: Pt): Pt {
  return { x: a.x + b.x, y: a.y + b.y };
}

/** True when b lies on the straight line from a to c and continues in the same direction. */
function forwardOnLine(a: Pt, b: Pt, c: Pt): boolean {
  const d1x = b.x - a.x;
  const d1y = b.y - a.y;
  const d2x = c.x - b.x;
  const d2y = c.y - b.y;
  return d1x * d2y - d1y * d2x === 0 && d1x * d2x + d1y * d2y > 0;
}

/** Drops repeated points and interior points that sit on a straight run. */
function simplify(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    out.push(p);
    while (out.length >= 3 && forwardOnLine(out[out.length - 3], out[out.length - 2], out[out.length - 1])) {
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

/**
 * Orthogonal route between two pin ends. Each end leaves along its outward
 * direction for STUB px, then the route uses one or two elbows. Elbow positions
 * snap to the grid.
 */
export function routeWire(a: RouteEnd, b: RouteEnd): Pt[] {
  const a1 = a.out ? add(a.p, { x: a.out.x * STUB, y: a.out.y * STUB }) : a.p;
  const b1 = b.out ? add(b.p, { x: b.out.x * STUB, y: b.out.y * STUB }) : b.p;
  let mid: Pt[];
  if (a.out && b.out) {
    const aH = a.out.y === 0;
    const bH = b.out.y === 0;
    if (aH && bH) {
      const mx = snap((a1.x + b1.x) / 2);
      mid = [
        { x: mx, y: a1.y },
        { x: mx, y: b1.y },
      ];
    } else if (aH) {
      mid = [{ x: b1.x, y: a1.y }];
    } else if (bH) {
      mid = [{ x: a1.x, y: b1.y }];
    } else {
      const my = snap((a1.y + b1.y) / 2);
      mid = [
        { x: a1.x, y: my },
        { x: b1.x, y: my },
      ];
    }
  } else if (a.out) {
    mid = a.out.y === 0 ? [{ x: b1.x, y: a1.y }] : [{ x: a1.x, y: b1.y }];
  } else if (b.out) {
    mid = b.out.y === 0 ? [{ x: a1.x, y: b1.y }] : [{ x: b1.x, y: a1.y }];
  } else {
    const mx = snap((a1.x + b1.x) / 2);
    mid = [
      { x: mx, y: a1.y },
      { x: mx, y: b1.y },
    ];
  }
  return simplify([a.p, a1, ...mid, b1, b.p]);
}

function closestOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: a.x, y: a.y };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

/** The point on a polyline nearest to `p`, and its distance. */
export function closestOnPath(p: Pt, path: readonly Pt[]): { point: Pt; dist: number } {
  if (path.length === 1) return { point: path[0], dist: Math.hypot(path[0].x - p.x, path[0].y - p.y) };
  let best = { point: path[0], dist: Infinity };
  for (let i = 0; i + 1 < path.length; i++) {
    const q = closestOnSegment(p, path[i], path[i + 1]);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < best.dist) best = { point: q, dist: d };
  }
  return best;
}

export function distanceToPath(p: Pt, path: readonly Pt[]): number {
  return closestOnPath(p, path).dist;
}

function endOf(c: Circuit, ref: PinRef): RouteEnd | null {
  const comp = c.components.find((x) => x.id === ref.component);
  if (!comp) return null;
  const pin = pinPosition(comp, ref.pin);
  return pin ? { p: pin.p, out: pin.out } : null;
}

/** The routed path of a wire, or null when either end no longer exists. */
export function wirePath(w: Wire, c: Circuit): Pt[] | null {
  const a = endOf(c, w.from);
  const b = endOf(c, w.to);
  if (!a || !b) return null;
  return routeWire(a, b);
}
