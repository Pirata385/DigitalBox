import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { layoutOf } from '../catalog/registry';
import { componentBox, hitComponent, routeWire, wirePath } from '../model/geometry';
import type { Circuit, Component, PinRef, Pt } from '../model/types';
import { ComponentView } from '../render/ComponentView';
import { GridPattern } from '../render/Grid';
import { sigClass, sigKey, type SigClass } from '../render/sig';
import { WireView } from '../render/WireView';
import { editor, simulator } from '../state/store';
import { useEditor } from '../state/useEditor';
import { floating, isKnown, type Sig } from '../sim/signal';
import { pinWidthOf } from './pins';
import {
  classifyPress,
  dragExceeded,
  fitView,
  hitRadiusWorld,
  marqueeHits,
  nearestPin,
  screenToWorld,
  wireAt,
  zoomAt,
  type PinHit,
  type PointerKind,
  type PressInput,
} from './interaction';
import { commandFor, nudgeFor } from './keymap';

const INPUT_TYPES = new Set(['switch', 'button', 'word']);

type Gesture =
  | { kind: 'none' }
  | { kind: 'pan'; pointer: number; sx: number; sy: number; panX: number; panY: number }
  | { kind: 'marquee'; pointer: number; start: Pt; cur: Pt; additive: boolean }
  | { kind: 'move'; pointer: number; sx: number; sy: number; moved: boolean; toggleId?: string; holdId?: string }
  | { kind: 'wire'; pointer: number; from: PinRef; fromPt: Pt; fromOut: Pt | null; cur: Pt }
  | { kind: 'pinch'; dist: number; zoom: number; world0: Pt };

/** Transient drawing for the gesture in progress. */
interface Overlay {
  wire?: Pt[];
  target?: Pt;
  marquee?: { x0: number; y0: number; x1: number; y1: number };
}

function pinSigs(comp: Component): { sigs: Record<string, Sig>; key: string } {
  const sigs: Record<string, Sig> = {};
  let key = '';
  for (const pin of layoutOf(comp).pins) {
    const s = simulator.pinSig(comp.id, pin.key);
    sigs[pin.key] = s;
    key += `${sigKey(s, pin.width)}|`;
  }
  return { sigs, key };
}

function boundsOf(c: Circuit): { x0: number; y0: number; x1: number; y1: number } | null {
  if (c.components.length === 0) return null;
  const boxes = c.components.map(componentBox);
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
}

function pathD(path: readonly Pt[]): string {
  return path.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
}

function isTextTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

export function Canvas(): ReactElement {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gesture = useRef<Gesture>({ kind: 'none' });
  const pointers = useRef(new Map<number, Pt>());
  const spaceDown = useRef(false);
  const [overlay, setOverlay] = useState<Overlay>({});

  const doc = useEditor((s) => s.doc);
  const view = useEditor((s) => s.view);
  const selection = useEditor((s) => s.selection);
  const simVersion = useEditor((s) => s.simVersion);

  const wirePaths = useMemo(() => {
    const out = new Map<string, { path: Pt[]; width: number }>();
    for (const w of doc.wires) {
      const path = wirePath(w, doc);
      if (path) out.set(w.id, { path, width: pinWidthOf(doc, w.from) });
    }
    return out;
  }, [doc]);

  const localPoint = (clientX: number, clientY: number): Pt => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  };

  const pointerKind = (type: string): PointerKind => (type === 'touch' ? 'touch' : type === 'pen' ? 'pen' : 'mouse');

  const startPinch = (): void => {
    setOverlay({});
    const [a, b] = [...pointers.current.values()];
    const v = editor.getState().view;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    gesture.current = {
      kind: 'pinch',
      dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      zoom: v.zoom,
      world0: screenToWorld(v, mid.x, mid.y),
    };
  };

  const updatePinch = (g: Extract<Gesture, { kind: 'pinch' }>): void => {
    const [a, b] = [...pointers.current.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const zoom = Math.min(3, Math.max(0.2, (g.zoom * (Math.hypot(b.x - a.x, b.y - a.y) || 1)) / g.dist));
    editor.getState().setView({ zoom, panX: mid.x - g.world0.x * zoom, panY: mid.y - g.world0.y * zoom });
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>): void => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.focus({ preventScroll: true });
    svg.setPointerCapture(e.pointerId);
    const s = localPoint(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, s);
    if (pointers.current.size === 2) {
      startPinch();
      return;
    }
    if (pointers.current.size > 2) return;

    const st = editor.getState();
    const kind = pointerKind(e.pointerType);
    const radius = hitRadiusWorld(st.view, kind);
    const world = screenToWorld(st.view, s.x, s.y);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;

    const pin: PinHit | null = nearestPin(st.doc, world, radius);
    const comp = pin ? undefined : hitComponent(st.doc.components, world);
    const wireId = pin || comp ? null : wireAt(st.doc, world, radius);
    const target: PressInput['target'] = pin ? 'pin' : comp ? 'component' : wireId ? 'wire' : 'empty';
    const action = classifyPress({
      target,
      tool: st.tool,
      button: e.button,
      space: spaceDown.current,
      pointer: kind,
      isInput: comp !== undefined && INPUT_TYPES.has(comp.type),
    });

    switch (action) {
      case 'wire': {
        if (!pin) return;
        const fromOut = pin.out;
        gesture.current = { kind: 'wire', pointer: e.pointerId, from: pin.ref, fromPt: pin.p, fromOut, cur: world };
        setOverlay({ wire: routeWire({ p: pin.p, out: fromOut }, { p: world, out: null }) });
        return;
      }
      case 'select': {
        if (!wireId) return;
        if (additive) st.toggleSelect('wire', wireId);
        else st.setSelection({ components: [], wires: [wireId] });
        return;
      }
      case 'move':
      case 'toggle': {
        if (!comp) return;
        if (additive) {
          st.toggleSelect('component', comp.id);
          if (!editor.getState().selection.components.includes(comp.id)) return;
        } else if (!st.selection.components.includes(comp.id)) {
          st.setSelection({ components: [comp.id], wires: [] });
        }
        const isInput = INPUT_TYPES.has(comp.type);
        const holdId = comp.type === 'button' ? comp.id : undefined;
        if (holdId) st.setInputValue(holdId, 1);
        st.beginMove();
        gesture.current = {
          kind: 'move',
          pointer: e.pointerId,
          sx: s.x,
          sy: s.y,
          moved: false,
          toggleId: isInput && action === 'toggle' ? comp.id : undefined,
          holdId,
        };
        return;
      }
      case 'marquee': {
        if (!additive) st.clearSelection();
        gesture.current = { kind: 'marquee', pointer: e.pointerId, start: world, cur: world, additive };
        setOverlay({ marquee: { x0: world.x, y0: world.y, x1: world.x, y1: world.y } });
        return;
      }
      case 'pan': {
        gesture.current = { kind: 'pan', pointer: e.pointerId, sx: s.x, sy: s.y, panX: st.view.panX, panY: st.view.panY };
        return;
      }
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (!pointers.current.has(e.pointerId)) return;
    const s = localPoint(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, s);
    const g = gesture.current;
    if (g.kind === 'pinch') {
      if (pointers.current.size >= 2) updatePinch(g);
      return;
    }
    const st = editor.getState();
    switch (g.kind) {
      case 'pan':
        if (e.pointerId !== g.pointer) return;
        st.setView({ zoom: st.view.zoom, panX: g.panX + (s.x - g.sx), panY: g.panY + (s.y - g.sy) });
        return;
      case 'move': {
        if (e.pointerId !== g.pointer) return;
        const dxScreen = s.x - g.sx;
        const dyScreen = s.y - g.sy;
        if (!g.moved) {
          if (!dragExceeded(dxScreen, dyScreen)) return;
          g.moved = true;
          if (g.holdId) st.setInputValue(g.holdId, 0);
        }
        st.moveSelected(dxScreen / st.view.zoom, dyScreen / st.view.zoom);
        return;
      }
      case 'marquee': {
        if (e.pointerId !== g.pointer) return;
        g.cur = screenToWorld(st.view, s.x, s.y);
        setOverlay({
          marquee: {
            x0: Math.min(g.start.x, g.cur.x),
            y0: Math.min(g.start.y, g.cur.y),
            x1: Math.max(g.start.x, g.cur.x),
            y1: Math.max(g.start.y, g.cur.y),
          },
        });
        return;
      }
      case 'wire': {
        if (e.pointerId !== g.pointer) return;
        const world = screenToWorld(st.view, s.x, s.y);
        const target = nearestPin(st.doc, world, hitRadiusWorld(st.view, pointerKind(e.pointerType)), g.from);
        const end = target ? { p: target.p, out: target.out } : { p: world, out: null };
        setOverlay({ wire: routeWire({ p: g.fromPt, out: g.fromOut }, end), target: target?.p });
        return;
      }
    }
  };

  const endPointer = (e: ReactPointerEvent<SVGSVGElement>, cancelled: boolean): void => {
    pointers.current.delete(e.pointerId);
    const svg = svgRef.current;
    if (svg?.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    const g = gesture.current;
    if (g.kind === 'pinch') {
      if (pointers.current.size < 2) gesture.current = { kind: 'none' };
      return;
    }
    if (g.kind === 'none' || ('pointer' in g && g.pointer !== e.pointerId)) return;
    const st = editor.getState();
    const s = localPoint(e.clientX, e.clientY);
    const world = screenToWorld(st.view, s.x, s.y);
    switch (g.kind) {
      case 'move':
        st.endMove();
        if (g.holdId) st.setInputValue(g.holdId, 0);
        if (!cancelled && !g.moved && g.toggleId) st.toggleInput(g.toggleId);
        break;
      case 'wire': {
        if (!cancelled) {
          const target = nearestPin(st.doc, world, hitRadiusWorld(st.view, pointerKind(e.pointerType)), g.from);
          if (target) {
            if (!st.connectPins(g.from, target.ref)) st.patchUi({ flash: 'Those two pins cannot be joined.' });
          } else {
            const wid = wireAt(st.doc, world, hitRadiusWorld(st.view, pointerKind(e.pointerType)));
            if (wid && !st.connectToWire(g.from, wid, world)) {
              st.patchUi({ flash: 'That wire cannot take a junction here.' });
            }
          }
        }
        break;
      }
      case 'marquee': {
        const rect = {
          x0: Math.min(g.start.x, world.x),
          y0: Math.min(g.start.y, world.y),
          x1: Math.max(g.start.x, world.x),
          y1: Math.max(g.start.y, world.y),
        };
        const hits = marqueeHits(st.doc, rect);
        if (g.additive) {
          const sel = st.selection;
          st.setSelection({
            components: [...new Set([...sel.components, ...hits.components])],
            wires: [...new Set([...sel.wires, ...hits.wires])],
          });
        } else {
          st.setSelection(hits);
        }
        break;
      }
    }
    gesture.current = { kind: 'none' };
    setOverlay({});
  };

  // Wheel zooms around the cursor. It is attached natively so it can call preventDefault.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const st = editor.getState();
      const rect = svg.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.0015);
      st.setView(zoomAt(st.view, st.view.zoom * factor, e.clientX - rect.left, e.clientY - rect.top));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  // Keyboard shortcuts that act on the circuit. Save, open and help belong to the app shell.
  useEffect(() => {
    const centre = (): Pt => {
      const rect = svgRef.current?.getBoundingClientRect();
      return { x: (rect?.width ?? 0) / 2, y: (rect?.height ?? 0) / 2 };
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (isTextTarget(e.target)) return;
      if (e.key === ' ') {
        if (document.activeElement === svgRef.current) e.preventDefault();
        if (!e.repeat) spaceDown.current = true;
        return;
      }
      const cmd = commandFor(e);
      if (!cmd) return;
      const onCanvas = document.activeElement === svgRef.current;
      const st = editor.getState();
      switch (cmd) {
        case 'undo':
          st.undo();
          break;
        case 'redo':
          st.redo();
          break;
        case 'delete':
          st.deleteSelected();
          break;
        case 'rotate':
          st.rotateSelected();
          break;
        case 'selectAll':
          st.selectAll();
          break;
        case 'copy':
          st.copySelected();
          break;
        case 'paste':
          st.paste(20, 20);
          break;
        case 'duplicate':
          st.copySelected();
          st.paste(20, 20);
          break;
        case 'escape':
          if (gesture.current.kind === 'wire') {
            gesture.current = { kind: 'none' };
            setOverlay({});
          } else {
            st.clearSelection();
          }
          break;
        case 'zoomIn':
          st.setView(zoomAt(st.view, st.view.zoom * 1.2, centre().x, centre().y));
          break;
        case 'zoomOut':
          st.setView(zoomAt(st.view, st.view.zoom / 1.2, centre().x, centre().y));
          break;
        case 'zoomReset':
          st.setView(zoomAt(st.view, 1, centre().x, centre().y));
          break;
        case 'fit': {
          const c = centre();
          st.setView(fitView(boundsOf(st.doc), c.x * 2, c.y * 2));
          break;
        }
        case 'toggleSnap':
          st.patchUi({ snap: !st.ui.snap });
          break;
        case 'nudge': {
          if (!onCanvas) return;
          const n = nudgeFor(e);
          if (n) st.nudgeSelected(n.dx, n.dy);
          break;
        }
        case 'cycle': {
          if (!onCanvas || st.doc.components.length === 0) return;
          const ids = st.doc.components.map((c) => c.id);
          const cur = st.selection.components.length === 1 ? ids.indexOf(st.selection.components[0]) : -1;
          const next = e.shiftKey ? (cur <= 0 ? ids.length - 1 : cur - 1) : (cur + 1) % ids.length;
          st.setSelection({ components: [ids[next]], wires: [] });
          break;
        }
        case 'activate': {
          if (!onCanvas || st.selection.components.length !== 1) return;
          const comp = st.doc.components.find((c) => c.id === st.selection.components[0]);
          if (comp && (comp.type === 'switch' || comp.type === 'word')) st.toggleInput(comp.id);
          break;
        }
        case 'save':
        case 'open':
        case 'help':
          return;
      }
      e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === ' ') spaceDown.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const wires = doc.wires.flatMap((w) => {
    const entry = wirePaths.get(w.id);
    if (!entry) return [];
    const sig = simulator.wireSig(w.id) ?? floating(entry.width);
    const cls: SigClass = sigClass(sig, entry.width);
    return [
      <WireView
        key={w.id}
        id={w.id}
        path={entry.path}
        width={entry.width > 1 ? 3.5 : 2}
        cls={cls}
        selected={selection.wires.includes(w.id)}
        conflict={simulator.wireConflict(w.id)}
      />,
    ];
  });

  const parts = doc.components.map((comp) => {
    const { sigs, key } = pinSigs(comp);
    const inputValue = simulator.getInput(comp.id);
    const in0 = sigs.in;
    const litInput = in0 !== undefined && isKnown(in0, 1) && (in0.v & 1) === 1;
    const on =
      comp.type === 'led' || comp.type === 'buzzer'
        ? litInput
        : comp.type === 'switch' || comp.type === 'button'
          ? inputValue === 1
          : false;
    return (
      <ComponentView
        key={comp.id}
        comp={comp}
        sigs={sigs}
        sigKey={key}
        inputValue={inputValue}
        on={on}
        selected={selection.components.includes(comp.id)}
      />
    );
  });

  return (
    <svg
      ref={svgRef}
      className="canvas"
      role="application"
      aria-label={`Circuit canvas with ${doc.components.length} parts and ${doc.wires.length} wires`}
      tabIndex={0}
      data-sim={simVersion}
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endPointer(e, false)}
      onPointerCancel={(e) => endPointer(e, true)}
    >
      <g transform={`translate(${view.panX} ${view.panY}) scale(${view.zoom})`}>
        <GridPattern zoom={view.zoom} />
        {wires}
        {parts}
        {overlay.wire && <path className="wire-preview" d={pathD(overlay.wire)} fill="none" />}
        {overlay.target && <circle className="pin-target" cx={overlay.target.x} cy={overlay.target.y} r={7} fill="none" />}
        {overlay.marquee && (
          <rect
            className="marquee"
            x={overlay.marquee.x0}
            y={overlay.marquee.y0}
            width={overlay.marquee.x1 - overlay.marquee.x0}
            height={overlay.marquee.y1 - overlay.marquee.y0}
          />
        )}
      </g>
    </svg>
  );
}

