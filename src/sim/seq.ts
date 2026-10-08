import type { Props } from '../catalog/types';
import type { Ins, Outs } from './comb';
import { asLogic, isKnown, known, make, mask, not1, toInt, unknown, type Sig } from './signal';

/** Stored values by name. Single-bit parts keep `q` and `qn`; word parts keep `q` only. */
export type State = Record<string, Sig>;

const LATCHES = ['sr', 'dlatch'];
const EDGE_PARTS = ['dff', 'jkff', 'tff', 'reg', 'counter', 'shift'];
const WORD_PARTS = new Set(['reg', 'counter', 'shift']);

export const SEQ_TYPES: ReadonlySet<string> = new Set([...LATCHES, ...EDGE_PARTS]);

export function isEdgeType(type: string): boolean {
  return EDGE_PARTS.includes(type);
}

/** The clock pin of an edge-triggered part, or undefined for level-sensitive latches. */
export function clockPinOf(type: string): string | undefined {
  return isEdgeType(type) ? 'clk' : undefined;
}

/** Width of the stored word: the bits prop for word parts, otherwise one bit. */
function widthOf(type: string, props: Props): number {
  return WORD_PARTS.has(type) && typeof props.bits === 'number' ? props.bits : 1;
}

/**
 * Starting state. Stored bits are 0, and complement outputs start at 1 so that Q
 * and Qn always form a complementary pair.
 */
export function initState(type: string, props: Props): State {
  if (WORD_PARTS.has(type)) return { q: known(0, widthOf(type, props)) };
  return { q: known(0, 1), qn: known(1, 1) };
}

/** Applies an asynchronous clear. An unknown clear makes the stored value unknown. */
function withClear(st: State, clr: Sig | undefined, w: number): State {
  const c = asLogic(clr ?? unknown(1), 1);
  if (isKnown(c, 1) && (c.v & 1) === 0) return st;
  const active = isKnown(c, 1);
  const next: State = { ...st, q: active ? known(0, w) : unknown(w) };
  if (st.qn !== undefined) next.qn = active ? known(1, 1) : unknown(1);
  return next;
}

function srLevel(ins: Ins, st: State): State {
  const s = ins.s ?? unknown(1);
  const r = ins.r ?? unknown(1);
  if (!isKnown(s, 1) || !isKnown(r, 1)) return { q: unknown(1), qn: unknown(1) };
  const sv = s.v & 1;
  const rv = r.v & 1;
  if (sv === 1 && rv === 0) return { q: known(1, 1), qn: known(0, 1) };
  if (sv === 0 && rv === 1) return { q: known(0, 1), qn: known(1, 1) };
  if (sv === 1 && rv === 1) return { q: known(0, 1), qn: known(0, 1) };
  return st;
}

function dlatchLevel(ins: Ins, st: State): State {
  const en = ins.en ?? unknown(1);
  if (!isKnown(en, 1)) return { q: unknown(1), qn: unknown(1) };
  if ((en.v & 1) === 0) return st;
  const q = asLogic(ins.d ?? unknown(1), 1);
  return { q, qn: not1(q, 1) };
}

/** Level-sensitive update: transparent latches and asynchronous clears. Called whenever inputs change. */
export function levelUpdate(type: string, props: Props, ins: Ins, st: State): State {
  switch (type) {
    case 'sr':
      return srLevel(ins, st);
    case 'dlatch':
      return dlatchLevel(ins, st);
    case 'dff':
    case 'reg':
    case 'counter':
    case 'shift':
      return withClear(st, ins.clr, widthOf(type, props));
    default:
      return st;
  }
}

function jkEdge(ins: Ins, st: State): State {
  const j = ins.j ?? unknown(1);
  const k = ins.k ?? unknown(1);
  if (!isKnown(j, 1) || !isKnown(k, 1)) return { q: unknown(1), qn: unknown(1) };
  const jv = j.v & 1;
  const kv = k.v & 1;
  let q: Sig;
  if (jv === 0 && kv === 0) q = st.q;
  else if (jv === 1 && kv === 0) q = known(1, 1);
  else if (jv === 0 && kv === 1) q = known(0, 1);
  else q = not1(st.q, 1);
  return { q, qn: not1(q, 1) };
}

function tEdge(ins: Ins, st: State): State {
  const t = ins.t ?? unknown(1);
  if (!isKnown(t, 1)) return { q: unknown(1), qn: unknown(1) };
  const q = (t.v & 1) === 1 ? not1(st.q, 1) : st.q;
  return { q, qn: not1(q, 1) };
}

function regEdge(ins: Ins, st: State, w: number): State {
  const en = ins.en ?? unknown(1);
  if (!isKnown(en, 1)) return { q: unknown(w) };
  if ((en.v & 1) === 0) return st;
  return { q: asLogic(ins.d ?? unknown(w), w) };
}

function counterEdge(ins: Ins, st: State, w: number): State {
  const en = ins.en ?? unknown(1);
  if (!isKnown(en, 1)) return { q: unknown(w) };
  if ((en.v & 1) === 0) return st;
  const cur = toInt(st.q, w);
  if (cur === null) return { q: unknown(w) };
  return { q: known((cur + 1) % 2 ** w, w) };
}

function shiftEdge(ins: Ins, st: State, w: number): State {
  const ser = asLogic(ins.ser ?? unknown(1), 1);
  const m = mask(w);
  const v = ((st.q.v << 1) | (ser.v & 1)) & m;
  const x = ((st.q.x << 1) | (ser.x & 1)) & m;
  return { q: make(v, x, 0, w) };
}

/**
 * Rising-edge update. `ins` holds the inputs sampled just before the edge, so
 * every element sees the same pre-edge values.
 */
export function edgeUpdate(type: string, props: Props, ins: Ins, st: State): State {
  const w = widthOf(type, props);
  switch (type) {
    case 'dff': {
      const q = asLogic(ins.d ?? unknown(1), 1);
      return { q, qn: not1(q, 1) };
    }
    case 'jkff':
      return jkEdge(ins, st);
    case 'tff':
      return tEdge(ins, st);
    case 'reg':
      return regEdge(ins, st, w);
    case 'counter':
      return counterEdge(ins, st, w);
    case 'shift':
      return shiftEdge(ins, st, w);
    default:
      return st;
  }
}

/** Terminal count: HIGH only when every bit of q is 1 and EN is 1. */
function terminalCount(q: Sig, w: number, en: Sig | undefined): Sig {
  const m = mask(w);
  const enLogic = asLogic(en ?? unknown(1), 1);
  const enOff = isKnown(enLogic, 1) && (enLogic.v & 1) === 0;
  const knownZero = m & ~(q.v | q.x | q.z);
  if (enOff || knownZero !== 0) return known(0, 1);
  const allOnes = isKnown(q, w) && q.v === m;
  if (allOnes && isKnown(enLogic, 1) && (enLogic.v & 1) === 1) return known(1, 1);
  return unknown(1);
}

/** Output values of a part, given its stored state and current inputs. */
export function outputs(type: string, props: Props, st: State, ins: Ins): Outs {
  switch (type) {
    case 'sr':
    case 'dlatch':
    case 'dff':
    case 'jkff':
    case 'tff':
      return { q: st.q, qn: st.qn ?? not1(st.q, 1) };
    case 'reg':
    case 'shift':
      return { q: st.q };
    case 'counter':
      return { q: st.q, tc: terminalCount(st.q, widthOf(type, props), ins.en) };
    default:
      throw new Error(`outputs: '${type}' is not a sequential part`);
  }
}
