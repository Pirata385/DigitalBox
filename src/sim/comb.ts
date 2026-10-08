import type { Props } from '../catalog/types';
import { and2, asLogic, floating, isKnown, known, make, mask, not1, or2, toInt, unknown, xor2, type Sig } from './signal';

/** Input values by pin key. The engine has already applied asLogic, so no Z bits appear here. */
export type Ins = Record<string, Sig>;
/** Output values by pin key. */
export type Outs = Record<string, Sig>;

export const COMB_TYPES: ReadonlySet<string> = new Set([
  'not',
  'buf',
  'and',
  'or',
  'nand',
  'nor',
  'xor',
  'xnor',
  'tri',
  'ha',
  'fa',
  'adder',
  'cmp',
  'mux2',
  'mux4',
  'demux4',
  'dec24',
  'split',
  'merge',
]);

const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback);

/** Bits that are known and equal in both a and b keep their value. Every other bit is X. */
function agree(a: Sig, b: Sig, w: number): Sig {
  const m = mask(w);
  const ka = m & ~(a.x | a.z);
  const kb = m & ~(b.x | b.z);
  const same = ka & kb & ~(a.v ^ b.v);
  return make(a.v & same, m & ~same, 0, w);
}

/**
 * Output of a multiplexer. An input is a candidate when every known select bit
 * matches its index. Unknown select bits leave every input a candidate, and the
 * result is the value the candidates agree on.
 */
function muxOut(inputs: readonly Sig[], selects: readonly Sig[], w: number): Sig {
  let out: Sig | undefined;
  for (let index = 0; index < inputs.length; index++) {
    const consistent = selects.every((s, bit) => !isKnown(s, 1) || (s.v & 1) === ((index >> bit) & 1));
    if (!consistent) continue;
    const data = asLogic(inputs[index], w);
    out = out === undefined ? data : agree(out, data, w);
  }
  return out ?? unknown(w);
}

/** Evaluates one combinational part. Output keys match the part's output pins. */
export function evalComb(type: string, props: Props, ins: Ins): Outs {
  const w = num(props.bits, 1);
  const inp = (key: string, width = w): Sig => ins[key] ?? unknown(width);
  const fold = (n: number, op: (a: Sig, b: Sig, width: number) => Sig): Sig => {
    let acc = inp('in0');
    for (let i = 1; i < n; i++) acc = op(acc, inp(`in${i}`), w);
    return acc;
  };

  switch (type) {
    case 'not':
      return { out: not1(inp('in0'), w) };
    case 'buf':
      return { out: asLogic(inp('in0'), w) };
    case 'and':
      return { out: fold(num(props.inputs, 2), and2) };
    case 'or':
      return { out: fold(num(props.inputs, 2), or2) };
    case 'xor':
      return { out: fold(num(props.inputs, 2), xor2) };
    case 'nand':
      return { out: not1(fold(num(props.inputs, 2), and2), w) };
    case 'nor':
      return { out: not1(fold(num(props.inputs, 2), or2), w) };
    case 'xnor':
      return { out: not1(fold(num(props.inputs, 2), xor2), w) };
    case 'tri': {
      const en = inp('en', 1);
      if (!isKnown(en, 1)) return { out: unknown(w) };
      return { out: (en.v & 1) === 1 ? asLogic(inp('in'), w) : floating(w) };
    }
    case 'ha': {
      const a = inp('a', 1);
      const b = inp('b', 1);
      return { s: xor2(a, b, 1), c: and2(a, b, 1) };
    }
    case 'fa': {
      const a = inp('a', 1);
      const b = inp('b', 1);
      const c = inp('cin', 1);
      const p = xor2(a, b, 1);
      return { s: xor2(p, c, 1), cout: or2(and2(a, b, 1), and2(c, p, 1), 1) };
    }
    case 'adder': {
      const ai = toInt(inp('a'), w);
      const bi = toInt(inp('b'), w);
      const ci = toInt(inp('cin', 1), 1);
      if (ai === null || bi === null || ci === null) return { s: unknown(w), cout: unknown(1) };
      const sum = ai + bi + ci;
      const span = 2 ** w;
      return { s: known(sum % span, w), cout: known(sum >= span ? 1 : 0, 1) };
    }
    case 'cmp': {
      const ai = toInt(inp('a'), w);
      const bi = toInt(inp('b'), w);
      if (ai === null || bi === null) return { eq: unknown(1) };
      return { eq: known(ai === bi ? 1 : 0, 1) };
    }
    case 'mux2':
      return { y: muxOut([inp('i0'), inp('i1')], [inp('s', 1)], w) };
    case 'mux4':
      return {
        y: muxOut([inp('i0'), inp('i1'), inp('i2'), inp('i3')], [inp('s0', 1), inp('s1', 1)], w),
      };
    case 'demux4': {
      const d = inp('d', 1);
      const s0 = inp('s0', 1);
      const s1 = inp('s1', 1);
      const out: Outs = {};
      if (!isKnown(s0, 1) || !isKnown(s1, 1)) {
        for (let i = 0; i < 4; i++) out[`y${i}`] = unknown(1);
        return out;
      }
      const sel = ((s1.v & 1) << 1) | (s0.v & 1);
      for (let i = 0; i < 4; i++) out[`y${i}`] = i === sel ? asLogic(d, 1) : known(0, 1);
      return out;
    }
    case 'dec24': {
      const a0 = inp('a0', 1);
      const a1 = inp('a1', 1);
      const en = inp('en', 1);
      const out: Outs = {};
      if (isKnown(en, 1) && (en.v & 1) === 0) {
        for (let i = 0; i < 4; i++) out[`y${i}`] = known(0, 1);
        return out;
      }
      if (isKnown(en, 1) && isKnown(a0, 1) && isKnown(a1, 1)) {
        const sel = ((a1.v & 1) << 1) | (a0.v & 1);
        for (let i = 0; i < 4; i++) out[`y${i}`] = known(i === sel ? 1 : 0, 1);
        return out;
      }
      for (let i = 0; i < 4; i++) out[`y${i}`] = unknown(1);
      return out;
    }
    case 'split': {
      const n = num(props.n, 4);
      const bus = inp('in', n);
      const out: Outs = {};
      for (let i = 0; i < n; i++) out[`b${i}`] = make((bus.v >>> i) & 1, (bus.x >>> i) & 1, 0, 1);
      return out;
    }
    case 'merge': {
      const n = num(props.n, 4);
      let v = 0;
      let x = 0;
      for (let i = 0; i < n; i++) {
        const b = inp(`b${i}`, 1);
        v |= (b.v & 1) << i;
        x |= (b.x & 1) << i;
      }
      return { out: make(v, x, 0, n) };
    }
    default:
      throw new Error(`evalComb: '${type}' is not a combinational part`);
  }
}
