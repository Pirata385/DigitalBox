import { mask, type Sig } from '../sim/signal';

/**
 * Visual class of a net value. A single bit is hi, lo, x or z. A bus is bus
 * when every bit is known, x when any bit is unknown, and z when it floats.
 */
export type SigClass = 'hi' | 'lo' | 'x' | 'z' | 'bus';

export function sigClass(s: Sig, w: number): SigClass {
  if (w === 1) {
    if (s.z & 1) return 'z';
    if (s.x & 1) return 'x';
    return s.v & 1 ? 'hi' : 'lo';
  }
  const m = mask(w);
  if (s.x & m) return 'x';
  if ((s.z & m) === m) return 'z';
  if (s.z & m) return 'x';
  return 'bus';
}

/** A text key that changes exactly when the value changes. Used for memoisation. */
export function sigKey(s: Sig, w: number): string {
  const m = mask(w);
  return `${s.v & m}.${s.x & m}.${s.z & m}`;
}
