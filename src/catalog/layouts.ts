import type { Dir } from '../sim/netlist';
import type { Layout, PinSpec, Side } from './types';

/** Width of a block-style part, in px. */
export const BLOCK_W = 60;

/** A pin before it is placed: everything except its position and side. */
export type PinSlot = Omit<PinSpec, 'x' | 'y' | 'side'>;

/** Builds one pin with explicit coordinates. */
export function pin(
  key: string,
  label: string,
  x: number,
  y: number,
  side: Side,
  dir: Dir,
  width = 1,
  extra: { clock?: boolean; weak?: boolean } = {},
): PinSpec {
  return { key, label, x, y, side, dir, width, ...extra };
}

/** A box of the given size with fixed pins. */
export function boxLayout(w: number, h: number, pins: PinSpec[]): Layout {
  return { x0: 0, y0: 0, x1: w, y1: h, pins };
}

/**
 * Gate body: n inputs on the left, 20 px apart, and one output on the right at
 * the vertical centre. The gate is 60 px wide and 20n px tall.
 */
export function gateLayout(n: number, width = 1): Layout {
  const pins: PinSpec[] = [];
  for (let i = 0; i < n; i++) {
    pins.push(pin(`in${i}`, '', 0, 10 + 20 * i, 'L', 'in', width));
  }
  pins.push(pin('out', '', BLOCK_W, 10 * n, 'R', 'out', width));
  return boxLayout(BLOCK_W, 20 * n, pins);
}

/**
 * Labelled block: left pins and right pins on rows 20 px apart, starting one row
 * down. The block is 60 px wide and 20 * (rows + 1) px tall.
 */
export function blockLayout(left: PinSlot[], right: PinSlot[]): Layout {
  const rows = Math.max(left.length, right.length) + 1;
  const pins: PinSpec[] = [];
  left.forEach((p, i) => pins.push({ ...p, x: 0, y: 20 * (i + 1), side: 'L' }));
  right.forEach((p, i) => pins.push({ ...p, x: BLOCK_W, y: 20 * (i + 1), side: 'R' }));
  return boxLayout(BLOCK_W, 20 * rows, pins);
}
