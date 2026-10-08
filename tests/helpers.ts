import { def, normalizeProps } from '../src/catalog/registry';
import type { Circuit, Component, PropValue, Wire } from '../src/model/types';

/**
 * Builds a circuit for tests. Each part is [id, type, props?]. Each wire is
 * [fromComponent, fromPin, toComponent, toPin]. Wires get ids w0, w1, and so on.
 */
export function makeCircuit(
  parts: [id: string, type: string, props?: Record<string, PropValue>][],
  wires: [fromComponent: string, fromPin: string, toComponent: string, toPin: string][],
): Circuit {
  const components: Component[] = parts.map(([id, type, props]) => ({
    id,
    type,
    x: 0,
    y: 0,
    rot: 0,
    props: normalizeProps(def(type), props ?? {}),
  }));
  const wireList: Wire[] = wires.map(([fc, fp, tc, tp], i) => ({
    id: `w${i}`,
    from: { component: fc, pin: fp },
    to: { component: tc, pin: tp },
  }));
  return { name: 'test', components, wires: wireList };
}
