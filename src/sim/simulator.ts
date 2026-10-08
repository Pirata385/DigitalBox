import { DEF_BY_TYPE, normalizeProps } from '../catalog/registry';
import type { Kind, Layout, PinSpec, Props } from '../catalog/types';
import type { Circuit } from '../model/types';
import { evalComb, type Ins, type Outs } from './comb';
import { buildNetlist, pinKey, type NetInfo, type Netlist, type PinSite, type WireEnds } from './netlist';
import { clockPinOf, edgeUpdate, initState, levelUpdate, outputs, type State } from './seq';
import { asLogic, floating, isKnown, known, make, mask, resolve, type Sig } from './signal';

export interface SimWarnings {
  /** Nets where two known drivers disagree. */
  conflicts: number;
  /** Set when a settle ran out of evaluations: the circuit does not settle. */
  oscillation: boolean;
  skippedWires: string[];
  /** Nets that feed at least one input pin but have no driver. */
  floating: number;
}

/** Runtime state for save files: time, input values, and stored states by component id. */
export interface SimSnapshot {
  timeUs: number;
  inputs: Record<string, number>;
  states: Record<string, State>;
}

/** Evaluations allowed per settle. Scales with circuit size, so large circuits are not cut short. */
export function budgetFor(elements: number): number {
  return 10_000 + 50 * elements;
}

/** Rising-edge rounds allowed in one settle before the circuit counts as oscillating. */
export const MAX_EDGE_PHASES = 1000;

/** Output values of a runtime-driven or constant part. */
export function sourceOutputs(type: string, props: Props, value: number): Outs {
  switch (type) {
    case 'switch':
    case 'button':
      return { out: known(value & 1, 1) };
    case 'const1':
    case 'vcc':
    case 'pullup':
      return { out: known(1, 1) };
    case 'const0':
    case 'gnd':
    case 'pulldown':
      return { out: known(0, 1) };
    case 'word':
      return { out: known(value, typeof props.bits === 'number' ? props.bits : 1) };
    default:
      return {};
  }
}

/** Half period of a clock in microseconds. Edges fall on whole multiples of it. */
export function clockHalfPeriodUs(freq: number): number {
  return Math.round(1e6 / (2 * freq));
}

interface Elem {
  id: string;
  type: string;
  kind: Kind;
  props: Props;
  /** Input pin key to net index. */
  inNets: Map<string, number>;
  /** Output pin key to net index. */
  outNets: Map<string, number>;
  /** Current value of each output pin. */
  outVal: Map<string, Sig>;
  state: State;
  /** Net of the clock pin, for edge-triggered parts. */
  clkNet: number | undefined;
  /** Last clock level seen: 0, 1, or 2 when unknown. */
  lastClk: number;
  /** Clock parts only: half period in microseconds. */
  half: number;
}

interface Driver {
  e: number;
  key: string;
  weak: boolean;
}

function sameSig(a: Sig, b: Sig): boolean {
  return a.v === b.v && a.x === b.x && a.z === b.z;
}

/** Floating bits of `strong` take their value from `weak`. Other bits keep `strong`. */
function fillFloating(strong: Sig, weak: Sig, width: number): Sig {
  const z = strong.z & mask(width);
  return make(
    (strong.v & ~z) | (weak.v & z),
    (strong.x & ~z) | (weak.x & z),
    (strong.z & ~z) | (weak.z & z),
    width,
  );
}

/**
 * Event-driven, zero-delay simulator. A settle propagates changes through
 * combinational and latch parts until nothing changes, then samples rising
 * clock edges and repeats. Clocks are integer microsecond square waves, and
 * `advance` processes every edge in time order.
 */
export class Simulator {
  private elems: Elem[] = [];
  private byId = new Map<string, number>();
  private clocks: number[] = [];
  private netlist: Netlist | undefined;
  private nets: NetInfo[] = [];
  private netVal: Sig[] = [];
  private netConflict: boolean[] = [];
  private netDrivers: Driver[][] = [];
  private netSinks: number[][] = [];
  private queue: number[] = [];
  private queueHead = 0;
  private queued: boolean[] = [];
  private evalsLeft = 0;
  private t = 0;
  private inputs: Record<string, number> = {};
  private oscillation = false;

  /** Rebuilds the netlist and elements. Inputs and states survive for parts that keep their id and type. */
  build(circuit: Circuit): void {
    const prev = new Map<string, { type: string; state: State }>();
    for (const el of this.elems) {
      if (el.kind === 'latch' || el.kind === 'ff') prev.set(el.id, { type: el.type, state: el.state });
    }

    const parts: { id: string; type: string; kind: Kind; props: Props; pins: PinSpec[] }[] = [];
    const sites: PinSite[] = [];
    for (const c of circuit.components) {
      const d = DEF_BY_TYPE.get(c.type);
      if (!d) continue;
      const props = normalizeProps(d, c.props);
      const layout: Layout = d.layout(props);
      for (const p of layout.pins) {
        sites.push({ component: c.id, pin: p.key, dir: p.dir, width: p.width, weak: p.weak });
      }
      parts.push({ id: c.id, type: c.type, kind: d.kind, props, pins: layout.pins });
    }

    const ends: WireEnds[] = circuit.wires.map((w) => ({ id: w.id, from: w.from, to: w.to }));
    const netlist = buildNetlist(sites, ends);
    this.netlist = netlist;
    this.nets = netlist.nets;
    this.netVal = this.nets.map((n) => floating(n.width));
    this.netConflict = this.nets.map(() => false);

    this.elems = [];
    this.byId = new Map();
    this.clocks = [];
    for (const part of parts) {
      if (part.kind === 'sink' || part.kind === 'junction' || part.kind === 'note') continue;
      const inNets = new Map<string, number>();
      const outNets = new Map<string, number>();
      for (const p of part.pins) {
        const n = netlist.pinNet.get(pinKey(part.id, p.key));
        if (n === undefined) continue;
        if (p.dir === 'in') inNets.set(p.key, n);
        else if (p.dir === 'out') outNets.set(p.key, n);
      }
      const clkKey = clockPinOf(part.type);
      const stateful = part.kind === 'latch' || part.kind === 'ff';
      const last = prev.get(part.id);
      const state: State = stateful
        ? last && last.type === part.type
          ? last.state
          : initState(part.type, part.props)
        : {};
      const outVal = new Map<string, Sig>();
      for (const [key, n] of outNets) outVal.set(key, known(0, this.nets[n].width));
      const e = this.elems.length;
      this.elems.push({
        id: part.id,
        type: part.type,
        kind: part.kind,
        props: part.props,
        inNets,
        outNets,
        outVal,
        state,
        clkNet: clkKey !== undefined ? inNets.get(clkKey) : undefined,
        lastClk: 2,
        half: part.kind === 'clock' ? clockHalfPeriodUs(Number(part.props.freq)) : 0,
      });
      this.byId.set(part.id, e);
      if (part.kind === 'clock') this.clocks.push(e);
    }

    for (const id of Object.keys(this.inputs)) {
      if (!this.byId.has(id)) delete this.inputs[id];
    }

    this.queue = [];
    this.queueHead = 0;
    this.queued = this.elems.map(() => false);
    this.netDrivers = this.nets.map(() => []);
    this.netSinks = this.nets.map(() => []);
    for (let n = 0; n < this.nets.length; n++) {
      for (const s of this.nets[n].drivers) {
        const e = this.byId.get(s.component);
        if (e !== undefined) this.netDrivers[n].push({ e, key: s.pin, weak: s.weak === true });
      }
      const sinks = new Set<number>();
      for (const s of this.nets[n].sinks) {
        const e = this.byId.get(s.component);
        if (e === undefined) continue;
        const kind = this.elems[e].kind;
        if (kind === 'comb' || kind === 'latch' || kind === 'ff') sinks.add(e);
      }
      this.netSinks[n] = [...sinks];
    }

    for (let n = 0; n < this.nets.length; n++) this.recomputeNet(n);
    for (let e = 0; e < this.elems.length; e++) {
      const el = this.elems[e];
      if (el.kind === 'source') this.applySource(e);
      else if (el.kind === 'clock') this.setOut(e, 'out', known(this.clockLevel(el), 1));
    }
    this.evaluateAll();
    this.settle(true);
  }

  /** Sets a runtime input (switch, button or word) and settles at once, even while paused. */
  setInput(componentId: string, value: number): void {
    this.inputs[componentId] = value;
    const e = this.byId.get(componentId);
    if (e === undefined) return;
    if (this.elems[e].kind !== 'source') return;
    const outs = sourceOutputs(this.elems[e].type, this.elems[e].props, value);
    for (const key of Object.keys(outs)) this.setOut(e, key, outs[key]);
    this.settle();
  }

  getInput(componentId: string): number {
    return this.inputs[componentId] ?? 0;
  }

  /** Advances time by `us` microseconds, processing every clock edge on the way in order. */
  advance(us: number): void {
    const delta = Math.max(0, Math.round(us));
    const target = this.t + delta;
    for (;;) {
      const prev = this.t;
      let next = Infinity;
      for (const e of this.clocks) {
        const h = this.elems[e].half;
        next = Math.min(next, (Math.floor(prev / h) + 1) * h);
      }
      if (next > target) break;
      this.t = next;
      for (const e of this.clocks) {
        const h = this.elems[e].half;
        if ((Math.floor(prev / h) + 1) * h === next) this.setOut(e, 'out', known((next / h) % 2, 1));
      }
      this.settle();
    }
    this.t = target;
  }

  /** Advances to the next clock edge. With no clocks, re-settles the circuit. */
  step(): void {
    if (this.clocks.length === 0) {
      this.settle();
      return;
    }
    const t0 = this.t;
    let next = Infinity;
    for (const e of this.clocks) {
      const h = this.elems[e].half;
      next = Math.min(next, (Math.floor(t0 / h) + 1) * h);
    }
    this.advance(next - t0);
  }

  /** Time 0, every stored value back to its start, clocks low. Inputs are kept. */
  reset(): void {
    this.t = 0;
    for (const el of this.elems) {
      if (el.kind === 'latch' || el.kind === 'ff') el.state = initState(el.type, el.props);
    }
    for (let e = 0; e < this.elems.length; e++) {
      if (this.elems[e].kind === 'clock') this.setOut(e, 'out', known(0, 1));
    }
    this.evaluateAll();
    this.settle(true);
  }

  time(): number {
    return this.t;
  }

  /** Value on a pin's net. A pin the engine does not know reads as floating. */
  pinSig(componentId: string, pin: string): Sig {
    const n = this.netlist?.pinNet.get(pinKey(componentId, pin));
    return n === undefined ? floating(1) : this.netVal[n];
  }

  /** True when the wire's net has two known drivers that disagree. */
  wireConflict(wireId: string): boolean {
    const n = this.netlist?.wireNet.get(wireId);
    return n !== undefined && this.netConflict[n] === true;
  }

  wireSig(wireId: string): Sig | undefined {
    const n = this.netlist?.wireNet.get(wireId);
    return n === undefined ? undefined : this.netVal[n];
  }

  warnings(): SimWarnings {
    let conflicts = 0;
    for (const c of this.netConflict) if (c) conflicts++;
    let floatingNets = 0;
    for (const net of this.nets) {
      if (net.drivers.length === 0 && net.sinks.length > 0) floatingNets++;
    }
    return {
      conflicts,
      oscillation: this.oscillation,
      skippedWires: this.netlist ? [...this.netlist.skippedWires] : [],
      floating: floatingNets,
    };
  }

  snapshot(): SimSnapshot {
    const states: Record<string, State> = {};
    for (const el of this.elems) {
      if (el.kind === 'latch' || el.kind === 'ff') states[el.id] = el.state;
    }
    return { timeUs: this.t, inputs: { ...this.inputs }, states };
  }

  restore(snap: SimSnapshot): void {
    this.t = snap.timeUs;
    this.inputs = { ...snap.inputs };
    for (const el of this.elems) {
      if (el.kind !== 'latch' && el.kind !== 'ff') continue;
      const st = snap.states[el.id];
      if (st) el.state = st;
    }
    for (let e = 0; e < this.elems.length; e++) {
      const el = this.elems[e];
      if (el.kind === 'source') this.applySource(e);
      else if (el.kind === 'clock') this.setOut(e, 'out', known(this.clockLevel(el), 1));
    }
    this.evaluateAll();
    this.settle(true);
  }

  private clockLevel(el: Elem): number {
    return Math.floor(this.t / el.half) % 2;
  }

  private applySource(e: number): void {
    const el = this.elems[e];
    const outs = sourceOutputs(el.type, el.props, this.inputs[el.id] ?? 0);
    for (const key of Object.keys(outs)) this.setOut(e, key, outs[key]);
  }

  private evaluateAll(): void {
    for (let e = 0; e < this.elems.length; e++) {
      const kind = this.elems[e].kind;
      if (kind === 'comb' || kind === 'latch' || kind === 'ff') this.enqueue(e);
    }
  }

  private enqueue(e: number): void {
    if (this.queued[e]) return;
    this.queued[e] = true;
    this.queue.push(e);
  }

  private insOf(el: Elem): Ins {
    const ins: Ins = {};
    for (const [key, n] of el.inNets) ins[key] = asLogic(this.netVal[n], this.nets[n].width);
    return ins;
  }

  private levelOf(n: number): number {
    const s = this.netVal[n];
    return isKnown(s, this.nets[n].width) ? s.v & 1 : 2;
  }

  private syncLastClk(): void {
    for (const el of this.elems) {
      if (el.clkNet !== undefined) el.lastClk = this.levelOf(el.clkNet);
    }
  }

  /**
   * Settles the circuit. `syncFirst` makes clock levels the baseline after the
   * first propagation, so that building or restoring a circuit creates no edges.
   */
  private settle(syncFirst = false): void {
    this.oscillation = false;
    this.evalsLeft = budgetFor(this.elems.length);
    for (let phase = 0; ; phase++) {
      if (!this.propagate()) {
        this.oscillation = true;
        return;
      }
      if (phase === 0 && syncFirst) this.syncLastClk();
      if (phase >= MAX_EDGE_PHASES) {
        this.oscillation = true;
        return;
      }
      if (!this.edgePhase()) return;
    }
  }

  /** Part A: evaluates queued elements until nothing changes. Returns false when the budget runs out. */
  private propagate(): boolean {
    while (this.queueHead < this.queue.length) {
      const e = this.queue[this.queueHead++];
      this.queued[e] = false;
      if (--this.evalsLeft < 0) {
        for (let i = this.queueHead; i < this.queue.length; i++) this.queued[this.queue[i]] = false;
        this.queue = [];
        this.queueHead = 0;
        return false;
      }
      this.evalElem(e);
    }
    this.queue = [];
    this.queueHead = 0;
    return true;
  }

  private evalElem(e: number): void {
    const el = this.elems[e];
    if (el.kind === 'comb') {
      const outs = evalComb(el.type, el.props, this.insOf(el));
      for (const key of Object.keys(outs)) this.setOut(e, key, outs[key]);
      return;
    }
    if (el.kind === 'latch' || el.kind === 'ff') {
      const ins = this.insOf(el);
      el.state = levelUpdate(el.type, el.props, ins, el.state);
      const outs = outputs(el.type, el.props, el.state, ins);
      for (const key of Object.keys(outs)) this.setOut(e, key, outs[key]);
    }
  }

  /**
   * Part B: finds rising edges on the clock pins of edge-triggered parts. Every
   * triggered part samples its inputs before any state changes, so simultaneous
   * edges cannot see each other's results. Returns true when anything fired.
   */
  private edgePhase(): boolean {
    const samples: { e: number; el: Elem; ins: Ins; state: State }[] = [];
    for (let e = 0; e < this.elems.length; e++) {
      const el = this.elems[e];
      if (el.clkNet === undefined) continue;
      const cur = this.levelOf(el.clkNet);
      const rising = el.lastClk === 0 && cur === 1;
      el.lastClk = cur;
      if (rising) samples.push({ e, el, ins: this.insOf(el), state: el.state });
    }
    if (samples.length === 0) return false;

    const updated = samples.map(({ e, el, ins, state }) => ({
      e,
      el,
      ins,
      state: levelUpdate(el.type, el.props, ins, edgeUpdate(el.type, el.props, ins, state)),
    }));
    for (const u of updated) u.el.state = u.state;
    const results = updated.map((u) => ({ e: u.e, outs: outputs(u.el.type, u.el.props, u.state, u.ins) }));
    for (const r of results) {
      for (const key of Object.keys(r.outs)) this.setOut(r.e, key, r.outs[key]);
    }
    return true;
  }

  private setOut(e: number, key: string, sig: Sig): void {
    const el = this.elems[e];
    const prev = el.outVal.get(key);
    if (prev !== undefined && sameSig(prev, sig)) return;
    el.outVal.set(key, sig);
    const n = el.outNets.get(key);
    if (n !== undefined) this.recomputeNet(n);
  }

  /** Recomputes a net from its drivers. Strong drivers resolve first, and weak ones fill floating bits. */
  private recomputeNet(n: number): void {
    const width = this.nets[n].width;
    const strong: Sig[] = [];
    const weak: Sig[] = [];
    for (const d of this.netDrivers[n]) {
      const v = this.elems[d.e].outVal.get(d.key);
      if (v !== undefined) (d.weak ? weak : strong).push(v);
    }
    const r = resolve(strong, width);
    const value = weak.length > 0 ? fillFloating(r.value, resolve(weak, width).value, width) : r.value;
    this.netConflict[n] = r.conflict;
    if (!sameSig(value, this.netVal[n])) {
      this.netVal[n] = value;
      for (const s of this.netSinks[n]) this.enqueue(s);
    }
  }
}
