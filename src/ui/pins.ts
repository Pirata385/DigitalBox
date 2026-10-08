import { layoutOf } from '../catalog/registry';
import type { Circuit, PinRef } from '../model/types';

/** Bit width of a pin on a placed part, or 1 when the part or pin is not there. */
export function pinWidthOf(c: Circuit, ref: PinRef): number {
  const comp = c.components.find((x) => x.id === ref.component);
  if (!comp) return 1;
  return layoutOf(comp).pins.find((p) => p.key === ref.pin)?.width ?? 1;
}
