import { componentBox, distanceToPath, placedPins, wirePath } from '../model/geometry';
import type { Circuit, PinRef, Pt, Selection, View } from '../model/types';
import type { Dir } from '../sim/netlist';

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3;
/** Automatic fitting stops here, so a small circuit is not blown up to fill the screen. */
export const FIT_MAX_ZOOM = 1.5;

export type PointerKind = 'mouse' | 'touch' | 'pen';

export function screenToWorld(v: View, sx: number, sy: number): Pt {
  return { x: (sx - v.panX) / v.zoom, y: (sy - v.panY) / v.zoom };
}

export function worldToScreen(v: View, p: Pt): Pt {
  return { x: p.x * v.zoom + v.panX, y: p.y * v.zoom + v.panY };
}

/** New zoom, with the pan adjusted so the world point under the cursor stays under it. */
export function zoomAt(v: View, nextZoom: number, sx: number, sy: number): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  const world = screenToWorld(v, sx, sy);
  return { zoom, panX: sx - world.x * zoom, panY: sy - world.y * zoom };
}

/** A view that fits a world box in the viewport with 60 px of padding. */
export function fitView(
  box: { x0: number; y0: number; x1: number; y1: number } | null,
  width: number,
  height: number,
): View {
  if (!box) return { zoom: 1, panX: width / 2, panY: height / 2 };
  const pad = 60;
  const bw = Math.max(1, box.x1 - box.x0);
  const bh = Math.max(1, box.y1 - box.y0);
  const fit = Math.min((width - 2 * pad) / bw, (height - 2 * pad) / bh);
  const zoom = Math.min(FIT_MAX_ZOOM, Math.max(MIN_ZOOM, fit));
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  return { zoom, panX: width / 2 - cx * zoom, panY: height / 2 - cy * zoom };
}

/** Pins are easier to hit by finger, so touch gets a larger screen radius. */
export function hitRadiusWorld(v: View, pointer: PointerKind): number {
  const px = pointer === 'mouse' ? 10 : 18;
  return px / v.zoom;
}

export interface PinHit {
  ref: PinRef;
  p: Pt;
  dir: Dir;
  width: number;
  /** Outward unit vector, used to route a wire preview out of the pin. */
  out: Pt | null;
}

/** The pin nearest to `p` within `radius`, skipping `exclude`. */
export function nearestPin(c: Circuit, p: Pt, radius: number, exclude?: PinRef): PinHit | null {
  let best: PinHit | null = null;
  let bestDist = radius;
  for (const comp of c.components) {
    for (const pin of placedPins(comp)) {
      if (exclude && exclude.component === comp.id && exclude.pin === pin.key) continue;
      const d = Math.hypot(pin.p.x - p.x, pin.p.y - p.y);
      if (d <= bestDist) {
        bestDist = d;
        best = { ref: { component: comp.id, pin: pin.key }, p: pin.p, dir: pin.dir, width: pin.width, out: pin.out };
      }
    }
  }
  return best;
}

/** The wire nearest to `p` within `radius`, or null. */
export function wireAt(c: Circuit, p: Pt, radius: number): string | null {
  let best: string | null = null;
  let bestDist = radius;
  for (const w of c.wires) {
    const path = wirePath(w, c);
    if (!path) continue;
    const d = distanceToPath(p, path);
    if (d <= bestDist) {
      bestDist = d;
      best = w.id;
    }
  }
  return best;
}

/** Parts whose box overlaps the rectangle, and wires whose whole route lies inside it. */
export function marqueeHits(c: Circuit, rect: { x0: number; y0: number; x1: number; y1: number }): Selection {
  const components = c.components
    .filter((comp) => {
      const b = componentBox(comp);
      return b.x1 >= rect.x0 && b.x0 <= rect.x1 && b.y1 >= rect.y0 && b.y0 <= rect.y1;
    })
    .map((comp) => comp.id);
  const wires = c.wires
    .filter((w) => {
      const path = wirePath(w, c);
      return path !== null && path.every((p) => p.x >= rect.x0 && p.x <= rect.x1 && p.y >= rect.y0 && p.y <= rect.y1);
    })
    .map((w) => w.id);
  return { components, wires };
}

export type PressAction = 'pan' | 'marquee' | 'move' | 'wire' | 'toggle' | 'select';

export interface PressInput {
  target: 'pin' | 'component' | 'wire' | 'empty';
  tool: 'select' | 'pan';
  button: number;
  space: boolean;
  pointer: PointerKind;
  isInput: boolean;
}

/**
 * What a press means. Pins start wires. Input parts toggle on a tap and move on a
 * drag. Empty space pans when the pan tool, space or the middle button is held,
 * and otherwise draws a marquee.
 */
export function classifyPress(p: PressInput): PressAction {
  switch (p.target) {
    case 'pin':
      return 'wire';
    case 'wire':
      return 'select';
    case 'component':
      return p.isInput ? 'toggle' : 'move';
    case 'empty':
      return p.space || p.button === 1 || p.tool === 'pan' ? 'pan' : 'marquee';
  }
}

/** True once a pointer has moved more than `threshold` px, so a tap is no longer a drag. */
export function dragExceeded(dx: number, dy: number, threshold = 4): boolean {
  return Math.hypot(dx, dy) > threshold;
}
