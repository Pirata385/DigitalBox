import { describe, expect, it } from 'vitest';
import { def, normalizeProps } from '../src/catalog/registry';
import {
  closestOnPath,
  componentBox,
  distanceToPath,
  hitComponent,
  pinPosition,
  placedPins,
  rotatePoint,
  routeWire,
  snap,
} from '../src/model/geometry';
import type { Component, Rot } from '../src/model/types';

const comp = (type: string, x: number, y: number, rot: Rot = 0, props: Record<string, unknown> = {}): Component => ({
  id: 'c',
  type,
  x,
  y,
  rot,
  props: normalizeProps(def(type), props),
});

describe('snap', () => {
  it('rounds to the nearest 10 px grid line', () => {
    expect(snap(14)).toBe(10);
    expect(snap(16)).toBe(20);
    expect(snap(-4)).toBe(0);
  });
});

describe('rotation', () => {
  it('four quarter turns return a point to where it started', () => {
    const centre = { x: 10, y: 10 };
    let p = { x: 3, y: 7 };
    for (let i = 0; i < 4; i++) p = rotatePoint(p, centre, 90);
    expect(p).toEqual({ x: 3, y: 7 });
  });

  it('rotating a left-side pin by 90 degrees points its stub upward', () => {
    const pin = pinPosition(comp('and', 0, 0, 90), 'in0');
    expect(pin?.out).toEqual({ x: 0, y: -1 });
  });

  it('a half turn mirrors each pin through the centre of the box', () => {
    const flat = placedPins(comp('and', 0, 0, 0));
    const turned = placedPins(comp('and', 0, 0, 180));
    const box = componentBox(comp('and', 0, 0, 0));
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    for (const p of flat) {
      const q = turned.find((t) => t.key === p.key);
      expect(q?.p.x).toBe(2 * cx - p.p.x);
      expect(q?.p.y).toBe(2 * cy - p.p.y);
    }
  });

  it('places the AND output on the right edge at the vertical centre', () => {
    expect(pinPosition(comp('and', 0, 0, 0), 'out')?.p).toEqual({ x: 60, y: 20 });
  });
});

describe('hit testing', () => {
  const notGate = comp('not', 100, 100, 90);

  it('a quarter-turned part has rotated bounds', () => {
    expect(componentBox(notGate)).toEqual({ x0: 110, y0: 90, x1: 130, y1: 130 });
  });

  it('hitComponent finds a rotated part inside its rotated bounds', () => {
    expect(hitComponent([notGate], { x: 120, y: 95 })).toBe(notGate);
  });

  it('hitComponent misses inside the unrotated box but outside the rotated one', () => {
    expect(hitComponent([notGate], { x: 135, y: 110 })).toBeUndefined();
  });
});

describe('wire routing', () => {
  it('routes two pins at the same y as a straight two-point path', () => {
    const path = routeWire({ p: { x: 0, y: 0 }, out: { x: 1, y: 0 } }, { p: { x: 100, y: 0 }, out: { x: -1, y: 0 } });
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
  });

  it('gives a route between offset pins that turns at grid-snapped elbows', () => {
    const path = routeWire({ p: { x: 0, y: 0 }, out: { x: 1, y: 0 } }, { p: { x: 60, y: 40 }, out: { x: -1, y: 0 } });
    for (const p of path) {
      expect(p.x % 10).toBe(0);
      expect(p.y % 10).toBe(0);
    }
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 60, y: 40 });
  });

  it('distanceToPath is 0 on a segment and the perpendicular distance off it', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(distanceToPath({ x: 50, y: 0 }, path)).toBe(0);
    expect(distanceToPath({ x: 50, y: 5 }, path)).toBe(5);
  });

  it('closestOnPath returns the nearest point on the path', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(closestOnPath({ x: 30, y: 9 }, path).point).toEqual({ x: 30, y: 0 });
  });
});
