/** Undo and redo for any immutable value. `present` is the current value. */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export const HISTORY_LIMIT = 200;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/** Records `next` as the new present. Committing the same value again changes nothing. */
export function commitHistory<T>(h: History<T>, next: T, limit = HISTORY_LIMIT): History<T> {
  if (next === h.present) return h;
  const past = [...h.past, h.present];
  if (past.length > limit) past.splice(0, past.length - limit);
  return { past, present: next, future: [] };
}

export function undoHistory<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
  };
}

export function redoHistory<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present], present: next, future: rest };
}
