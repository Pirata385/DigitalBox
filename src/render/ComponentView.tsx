import { memo, useMemo, type ReactElement } from 'react';
import { layoutOf } from '../catalog/registry';
import type { Component } from '../model/types';
import { floating, type Sig } from '../sim/signal';
import { sigClass } from './sig';
import { PartSymbol } from './symbols';

export interface ComponentViewProps {
  comp: Component;
  /** Value on each pin's net, keyed by pin key. */
  sigs: Record<string, Sig>;
  /** Text key of every pin value. The memo compares this instead of the objects. */
  sigKey: string;
  inputValue: number;
  on: boolean;
  selected: boolean;
}

/**
 * One placed part. The group is drawn in the part's local coordinates and then
 * rotated about the centre of its box, so pin positions come straight from the layout.
 */
function ComponentViewImpl({ comp, sigs, inputValue, on, selected }: ComponentViewProps): ReactElement {
  const layout = useMemo(() => layoutOf(comp), [comp]);
  const w = layout.x1 - layout.x0;
  const h = layout.y1 - layout.y0;
  const cx = (layout.x0 + layout.x1) / 2;
  const cy = (layout.y0 + layout.y1) / 2;
  const pinSig = (key: string): Sig => sigs[key] ?? floating(1);
  return (
    <g
      transform={`translate(${comp.x} ${comp.y}) rotate(${comp.rot} ${cx} ${cy})`}
      className={selected ? 'part is-selected' : 'part'}
      data-part={comp.id}
    >
      <PartSymbol
        type={comp.type}
        props={comp.props}
        w={w}
        h={h}
        pins={layout.pins}
        pin={pinSig}
        inputValue={inputValue}
        on={on}
        selected={selected}
      />
      {layout.pins.map((pin) => (
        <circle
          key={pin.key}
          className={`pin pin-${sigClass(pinSig(pin.key), pin.width)}`}
          cx={pin.x}
          cy={pin.y}
          r={3}
        />
      ))}
      {selected && (
        <rect className="sel-box" x={layout.x0 - 4} y={layout.y0 - 4} width={w + 8} height={h + 8} rx={6} />
      )}
    </g>
  );
}

export const ComponentView = memo(
  ComponentViewImpl,
  (a, b) =>
    a.comp === b.comp &&
    a.sigKey === b.sigKey &&
    a.inputValue === b.inputValue &&
    a.on === b.on &&
    a.selected === b.selected,
);
