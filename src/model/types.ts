/** Rotation of a part in degrees, clockwise on screen. */
export type Rot = 0 | 90 | 180 | 270;

/** A point in world coordinates (CSS pixels at zoom 1). */
export interface Pt {
  x: number;
  y: number;
}

/** A reference to one pin of one component. */
export interface PinRef {
  component: string;
  pin: string;
}

export type PropValue = number | string | boolean;

export interface Component {
  id: string;
  type: string;
  /** Top-left corner of the unrotated box, in world coordinates. */
  x: number;
  y: number;
  rot: Rot;
  props: Record<string, PropValue>;
}

export interface Wire {
  id: string;
  from: PinRef;
  to: PinRef;
}

export interface Circuit {
  name: string;
  components: Component[];
  wires: Wire[];
}

export interface Selection {
  components: string[];
  wires: string[];
}

/** Viewport: zoom factor and pan offset in screen pixels. */
export interface View {
  zoom: number;
  panX: number;
  panY: number;
}
