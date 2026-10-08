import type { PropValue } from '../model/types';
import type { PropSpec } from '../catalog/types';

/**
 * Turns text from an input control into a valid prop value. Returns undefined
 * when the text cannot be a value for this prop, so the caller keeps the old one.
 */
export function coercePropValue(spec: PropSpec, raw: string): PropValue | undefined {
  if (spec.kind === 'int') {
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) return undefined;
    const lo = spec.min ?? -Infinity;
    const hi = spec.max ?? Infinity;
    return Math.min(hi, Math.max(lo, Math.round(n)));
  }
  if (spec.kind === 'select') {
    return spec.options?.find((o) => String(o.value) === raw)?.value;
  }
  return raw.slice(0, 200);
}
