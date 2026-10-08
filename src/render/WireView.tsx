import { memo, type ReactElement } from 'react';
import type { Pt } from '../model/types';
import type { SigClass } from './sig';

export interface WireViewProps {
  id: string;
  path: Pt[];
  width: number;
  cls: SigClass;
  selected: boolean;
  conflict: boolean;
}

function pathD(path: readonly Pt[]): string {
  return path.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
}

function WireViewImpl({ id, path, width, cls, selected, conflict }: WireViewProps): ReactElement {
  const klass = `wire wire-${conflict ? 'conflict' : cls}${selected ? ' is-selected' : ''}`;
  return (
    <g data-wire={id}>
      <path className={klass} d={pathD(path)} strokeWidth={width} fill="none" />
    </g>
  );
}

/** A wire re-renders only when its shape or its value class changes. */
export const WireView = memo(
  WireViewImpl,
  (a, b) =>
    a.id === b.id &&
    a.cls === b.cls &&
    a.selected === b.selected &&
    a.conflict === b.conflict &&
    a.width === b.width &&
    pathD(a.path) === pathD(b.path),
);
