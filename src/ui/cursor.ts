import type { Pt } from '../model/types';

/** Last pointer position in world coordinates. A plain observable, so pointer moves never touch the store. */
type Listener = () => void;

let current: Pt | null = null;
const listeners = new Set<Listener>();

export function setCursor(p: Pt | null): void {
  current = p;
  for (const l of listeners) l();
}

export function getCursor(): Pt | null {
  return current;
}

export function subscribeCursor(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
