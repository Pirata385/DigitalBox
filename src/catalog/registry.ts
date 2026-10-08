import type { PropValue } from '../model/types';
import { DEFS } from './defs';
import type { ComponentDef, Layout, Props } from './types';

export { DEFS };

export const DEF_BY_TYPE: ReadonlyMap<string, ComponentDef> = new Map(DEFS.map((d) => [d.type, d]));

/** The definition for a type. Throws for a type that is not in the catalog. */
export function def(type: string): ComponentDef {
  const d = DEF_BY_TYPE.get(type);
  if (!d) throw new Error(`Unknown component type: ${type}`);
  return d;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * Fills defaults and keeps only valid values: integers are rounded and clamped,
 * select values must be listed options, and text is cut to 200 characters.
 * Anything invalid falls back to the default.
 */
export function normalizeProps(d: ComponentDef, input: Record<string, unknown>): Props {
  const out: Props = { ...d.defaults };
  for (const spec of d.props) {
    const raw = input[spec.key];
    if (raw === undefined) continue;
    if (spec.kind === 'int') {
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        out[spec.key] = clamp(Math.round(raw), spec.min ?? -Infinity, spec.max ?? Infinity);
      }
    } else if (spec.kind === 'select') {
      if (spec.options?.some((o) => o.value === raw)) out[spec.key] = raw as PropValue;
    } else if (typeof raw === 'string') {
      out[spec.key] = raw.slice(0, 200);
    }
  }
  return out;
}

/** The part's bus width from its width prop, clamped to that prop's range. Defaults to 1. */
export function bitsOf(d: ComponentDef, p: Props): number {
  const spec = d.props.find((s) => s.isWidth);
  if (!spec) return 1;
  const raw = p[spec.key];
  const n = typeof raw === 'number' ? Math.round(raw) : Number(d.defaults[spec.key]);
  return clamp(n, spec.min ?? 1, spec.max ?? 32);
}

/** Layout for a placed component, using normalised props. */
export function layoutOf(c: { type: string; props: Props }): Layout {
  const d = def(c.type);
  return d.layout(normalizeProps(d, c.props));
}
