import type { PropValue } from '../model/types';
import type { Dir } from '../sim/netlist';

export type Category = 'inputs' | 'outputs' | 'gates' | 'memory' | 'arithmetic' | 'mux' | 'buses' | 'power' | 'misc';

export const CATEGORIES: readonly { id: Category; label: string }[] = [
  { id: 'inputs', label: 'Inputs' },
  { id: 'outputs', label: 'Outputs' },
  { id: 'gates', label: 'Gates' },
  { id: 'memory', label: 'Memory' },
  { id: 'arithmetic', label: 'Arithmetic' },
  { id: 'mux', label: 'Mux & decode' },
  { id: 'buses', label: 'Buses' },
  { id: 'power', label: 'Power & passive' },
  { id: 'misc', label: 'Misc' },
];

export type Props = Record<string, PropValue>;

/** The side of the box a pin leaves from. `null` means no stub (junction). */
export type Side = 'L' | 'R' | 'T' | 'B' | null;

export interface PinSpec {
  key: string;
  label: string;
  /** Position relative to the component origin (top-left of the unrotated box). */
  x: number;
  y: number;
  side: Side;
  dir: Dir;
  width: number;
  /** Marks a clock input, drawn with a triangle. */
  clock?: boolean;
  /** Marks a weak driver (pull-up or pull-down). */
  weak?: boolean;
}

/** Bounds of the part relative to its origin, plus its pins. */
export interface Layout {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  pins: PinSpec[];
}

/** How the simulator treats a part. */
export type Kind = 'source' | 'clock' | 'comb' | 'latch' | 'ff' | 'sink' | 'junction' | 'note';

export interface PropSpec {
  key: string;
  label: string;
  kind: 'int' | 'select' | 'text';
  min?: number;
  max?: number;
  options?: { value: PropValue; label: string }[];
  /** Marks the prop that sets the bus width of the part's pins. */
  isWidth?: boolean;
}

export interface ComponentDef {
  type: string;
  name: string;
  category: Category;
  kind: Kind;
  tooltip: string;
  defaults: Props;
  props: PropSpec[];
  layout: (p: Props) => Layout;
}
