/**
 * Three-valued bit-vector signals.
 *
 * A signal of width w is three bit masks. Bit i of `x` marks an unknown bit,
 * bit i of `z` marks a floating (high-impedance) bit, and bit i of `v` holds
 * the value of a known bit. The masks never overlap: x and z are disjoint, and
 * v is zero wherever x or z is set. All masks are unsigned 32-bit values.
 */
export interface Sig {
  readonly v: number;
  readonly x: number;
  readonly z: number;
}

function checkWidth(w: number): void {
  if (!Number.isInteger(w) || w < 1 || w > 32) {
    throw new RangeError(`signal width ${w} is outside 1..32`);
  }
}

/** All-ones mask for a width of 1 to 32 bits. */
export function mask(w: number): number {
  checkWidth(w);
  return 2 ** w - 1;
}

/** Builds a normalised signal. z wins over x; v is cleared under x or z. */
export function make(v: number, x: number, z: number, w: number): Sig {
  const m = mask(w);
  const zz = z & m;
  const xx = x & m & ~zz;
  const vv = v & m & ~(xx | zz);
  return { v: vv >>> 0, x: xx >>> 0, z: zz >>> 0 };
}

export function known(value: number, w: number): Sig {
  return make(value, 0, 0, w);
}

export function unknown(w: number): Sig {
  return make(0, mask(w), 0, w);
}

export function floating(w: number): Sig {
  return make(0, 0, mask(w), w);
}

/** Floating bits become unknown, which is how gate inputs see them. */
export function asLogic(s: Sig, w: number): Sig {
  return make(s.v, s.x | s.z, 0, w);
}

/** Bits that are known to be 1. */
function ones(s: Sig, m: number): number {
  return m & s.v & ~(s.x | s.z);
}

/** Bits that are known to be 0. */
function zeros(s: Sig, m: number): number {
  return m & ~(s.v | s.x | s.z);
}

export function and2(a: Sig, b: Sig, w: number): Sig {
  const m = mask(w);
  const A = asLogic(a, w);
  const B = asLogic(b, w);
  const one = ones(A, m) & ones(B, m);
  const zero = zeros(A, m) | zeros(B, m);
  return make(one, m & ~(one | zero), 0, w);
}

export function or2(a: Sig, b: Sig, w: number): Sig {
  const m = mask(w);
  const A = asLogic(a, w);
  const B = asLogic(b, w);
  const one = ones(A, m) | ones(B, m);
  const zero = zeros(A, m) & zeros(B, m);
  return make(one, m & ~(one | zero), 0, w);
}

export function xor2(a: Sig, b: Sig, w: number): Sig {
  const m = mask(w);
  const A = asLogic(a, w);
  const B = asLogic(b, w);
  const one = (ones(A, m) & zeros(B, m)) | (zeros(A, m) & ones(B, m));
  const zero = (ones(A, m) & ones(B, m)) | (zeros(A, m) & zeros(B, m));
  return make(one, m & ~(one | zero), 0, w);
}

export function not1(a: Sig, w: number): Sig {
  const m = mask(w);
  const A = asLogic(a, w);
  const one = zeros(A, m);
  const zero = ones(A, m);
  return make(one, m & ~(one | zero), 0, w);
}

/**
 * Resolves every driver on one net, bit by bit.
 *
 * Floating drivers contribute nothing. Two known drivers that disagree give X
 * on that bit and set `conflict`. An unknown driver gives X without a conflict.
 * A net that nothing drives is floating.
 */
export function resolve(drivers: readonly Sig[], w: number): { value: Sig; conflict: boolean } {
  const m = mask(w);
  let rv = 0; // resolved known bits
  let rx = 0; // resolved unknown bits
  let rz = m; // resolved floating bits, all floating before any driver
  let conflict = false;
  for (const d of drivers) {
    const dz = d.z & m;
    const dx = d.x & m & ~dz;
    const dk = m & ~(dz | dx);
    const dv = d.v & dk;
    const resolvedKnown = m & ~(rz | rx);
    const clash = resolvedKnown & dk & (rv ^ dv);
    if (clash !== 0) conflict = true;
    const wasFloating = rz;
    rx = (rx | dx | clash) & m;
    rv = ((rv & ~(dx | clash)) | (dv & wasFloating)) & m;
    rz = rz & ~(dx | dk) & m;
  }
  return { value: make(rv, rx, rz, w), conflict };
}

/** True when no bit within the width is unknown or floating. */
export function isKnown(s: Sig, w: number): boolean {
  return ((s.x | s.z) & mask(w)) === 0;
}

/** The unsigned integer value, or null when any bit is unknown or floating. */
export function toInt(s: Sig, w: number): number | null {
  if (!isKnown(s, w)) return null;
  return (s.v & mask(w)) >>> 0;
}

/** Bits as text, most significant first, using 0, 1, X and Z. */
export function bitStr(s: Sig, w: number): string {
  checkWidth(w);
  let out = '';
  for (let i = w - 1; i >= 0; i--) {
    if ((s.x >>> i) & 1) out += 'X';
    else if ((s.z >>> i) & 1) out += 'Z';
    else out += ((s.v >>> i) & 1) ? '1' : '0';
  }
  return out;
}

/** One hex digit per nibble. A nibble with any X shows X, else any Z shows Z. */
export function hexStr(s: Sig, w: number): string {
  checkWidth(w);
  let out = '';
  for (let low = Math.floor((w - 1) / 4) * 4; low >= 0; low -= 4) {
    const bits = Math.min(4, w - low);
    const nib = 2 ** bits - 1;
    if ((s.x >>> low) & nib) out += 'X';
    else if ((s.z >>> low) & nib) out += 'Z';
    else out += ((s.v >>> low) & nib).toString(16).toUpperCase();
  }
  return out;
}
