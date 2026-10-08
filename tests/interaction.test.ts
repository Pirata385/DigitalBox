import { describe, expect, it } from 'vitest';
import {
  classifyPress,
  dragExceeded,
  fitView,
  hitRadiusWorld,
  marqueeHits,
  nearestPin,
  screenToWorld,
  wireAt,
  worldToScreen,
  zoomAt,
} from '../src/ui/interaction';
import { makeCircuit } from './helpers';

describe('viewport transforms', () => {
  it('screenToWorld inverts worldToScreen', () => {
    const v = { zoom: 2, panX: 10, panY: 20 };
    expect(worldToScreen(v, { x: 5, y: 7 })).toEqual({ x: 20, y: 34 });
    expect(screenToWorld(v, 20, 34)).toEqual({ x: 5, y: 7 });
  });

  it('zoomAt keeps the world point under the cursor fixed', () => {
    const v = { zoom: 1, panX: 0, panY: 0 };
    const under = screenToWorld(v, 100, 50);
    const next = zoomAt(v, 2, 100, 50);
    expect(next.zoom).toBe(2);
    expect(screenToWorld(next, 100, 50)).toEqual(under);
  });

  it('zoomAt clamps the zoom to 0.2 and 3', () => {
    const v = { zoom: 1, panX: 0, panY: 0 };
    expect(zoomAt(v, 10, 0, 0).zoom).toBe(3);
    expect(zoomAt(v, 0.01, 0, 0).zoom).toBe(0.2);
  });

  it('fitView centres a box in the viewport with 60 px padding', () => {
    const v = fitView({ x0: 0, y0: 0, x1: 200, y1: 100 }, 400, 300);
    expect(v.zoom).toBeCloseTo(1.4);
    expect(worldToScreen(v, { x: 100, y: 50 })).toEqual({ x: 200, y: 150 });
  });

  it('fitView with nothing to show centres the origin at zoom 1', () => {
    const v = fitView(null, 400, 300);
    expect(v.zoom).toBe(1);
    expect(worldToScreen(v, { x: 0, y: 0 })).toEqual({ x: 200, y: 150 });
  });

  it('hit radius is 10 px for a mouse and 18 px for touch, in world units', () => {
    expect(hitRadiusWorld({ zoom: 2, panX: 0, panY: 0 }, 'mouse')).toBe(5);
    expect(hitRadiusWorld({ zoom: 2, panX: 0, panY: 0 }, 'touch')).toBe(9);
  });
});

describe('hit testing', () => {
  // A NOT gate at (0,0) has its output at (40,10).
  const c = makeCircuit(
    [
      ['n1', 'not'],
      ['n2', 'not'],
    ],
    [],
  );
  const moved = { ...c, components: c.components.map((x) => (x.id === 'n2' ? { ...x, x: 200, y: 0 } : x)) };

  it('nearestPin finds a pin within the radius', () => {
    expect(nearestPin(moved, { x: 41, y: 10 }, 5)?.ref).toEqual({ component: 'n1', pin: 'out' });
  });

  it('nearestPin returns nothing outside the radius', () => {
    expect(nearestPin(moved, { x: 60, y: 10 }, 5)).toBeNull();
  });

  it('nearestPin skips the excluded start pin', () => {
    expect(nearestPin(moved, { x: 41, y: 10 }, 5, { component: 'n1', pin: 'out' })).toBeNull();
  });

  it('wireAt returns the wire whose route passes under the point', () => {
    const wired = makeCircuit(
      [
        ['a', 'not'],
        ['b', 'not'],
      ],
      [['a', 'out', 'b', 'in0']],
    );
    const moved2 = { ...wired, components: wired.components.map((x) => (x.id === 'b' ? { ...x, x: 100, y: 0 } : x)) };
    // The wire runs along y = 10 from x = 40 to x = 100.
    expect(wireAt(moved2, { x: 70, y: 11 }, 3)).toBe('w0');
    expect(wireAt(moved2, { x: 70, y: 30 }, 3)).toBeNull();
  });

  it('marqueeHits selects parts that overlap the rectangle', () => {
    expect(marqueeHits(moved, { x0: -10, y0: -10, x1: 60, y1: 40 })).toEqual({ components: ['n1'], wires: [] });
  });
});

describe('press classification', () => {
  const base = { target: 'empty' as const, tool: 'select' as const, button: 0, space: false, pointer: 'mouse' as const, isInput: false };

  it('a press on a pin starts a wire', () => {
    expect(classifyPress({ ...base, target: 'pin' })).toBe('wire');
  });

  it('a press on empty canvas pans in pan mode', () => {
    expect(classifyPress({ ...base, tool: 'pan' })).toBe('pan');
  });

  it('holding space on empty canvas pans', () => {
    expect(classifyPress({ ...base, space: true })).toBe('pan');
  });

  it('a touch on empty canvas with the select tool draws a marquee', () => {
    expect(classifyPress({ ...base, pointer: 'touch', tool: 'select' })).toBe('marquee');
  });

  it('a middle-button press on empty canvas pans', () => {
    expect(classifyPress({ ...base, button: 1 })).toBe('pan');
  });

  it('a press on an input part is a toggle; any other part is a move', () => {
    expect(classifyPress({ ...base, target: 'component', isInput: true })).toBe('toggle');
    expect(classifyPress({ ...base, target: 'component' })).toBe('move');
  });
});

describe('drag threshold', () => {
  it('is false for 3 px and true for 5 px', () => {
    expect(dragExceeded(3, 0)).toBe(false);
    expect(dragExceeded(5, 0)).toBe(true);
  });
});
