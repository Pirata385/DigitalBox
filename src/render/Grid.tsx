import type { ReactElement } from 'react';
import { GRID } from '../model/geometry';

/**
 * Dot grid in world coordinates, so it pans and zooms with the parts. It hides
 * below zoom 0.4, where the dots would be too small to see or too dense to read.
 */
export function GridPattern({ zoom }: { zoom: number }): ReactElement {
  return (
    <g visibility={zoom < 0.4 ? 'hidden' : 'visible'}>
      <defs>
        <pattern id="dot-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
          <circle className="grid-dot" cx={0} cy={0} r={1} />
        </pattern>
      </defs>
      <rect x={-50000} y={-50000} width={100000} height={100000} fill="url(#dot-grid)" />
    </g>
  );
}
