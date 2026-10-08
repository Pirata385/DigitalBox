export type KeyCommand =
  | 'undo'
  | 'redo'
  | 'delete'
  | 'rotate'
  | 'selectAll'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'escape'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'fit'
  | 'toggleSnap'
  | 'save'
  | 'open'
  | 'help'
  | 'nudge'
  | 'cycle'
  | 'activate';

export interface KeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** The editor command for a key press, or null when the key is not ours. */
export function commandFor(e: KeyEvent): KeyCommand | null {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.ctrlKey || e.metaKey) {
    switch (k) {
      case 'z':
        return e.shiftKey ? 'redo' : 'undo';
      case 'y':
        return 'redo';
      case 'a':
        return 'selectAll';
      case 'c':
        return 'copy';
      case 'v':
        return 'paste';
      case 'd':
        return 'duplicate';
      case 's':
        return 'save';
      case 'o':
        return 'open';
      default:
        return null;
    }
  }
  if (e.altKey) return null;
  switch (e.key) {
    case 'Delete':
    case 'Backspace':
      return 'delete';
    case 'Escape':
      return 'escape';
    case 'Tab':
      return 'cycle';
    case 'Enter':
    case ' ':
      return 'activate';
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowUp':
    case 'ArrowDown':
      return 'nudge';
  }
  switch (k) {
    case 'r':
      return 'rotate';
    case '+':
    case '=':
      return 'zoomIn';
    case '-':
    case '_':
      return 'zoomOut';
    case '0':
      return 'zoomReset';
    case 'f':
      return 'fit';
    case 'g':
      return 'toggleSnap';
    case '?':
      return 'help';
    default:
      return null;
  }
}

/** How far an arrow key moves the selection: 1 px, or 10 px with Shift. */
export function nudgeFor(e: { key: string; shiftKey: boolean }): { dx: number; dy: number } | null {
  const step = e.shiftKey ? 10 : 1;
  switch (e.key) {
    case 'ArrowLeft':
      return { dx: -step, dy: 0 };
    case 'ArrowRight':
      return { dx: step, dy: 0 };
    case 'ArrowUp':
      return { dx: 0, dy: -step };
    case 'ArrowDown':
      return { dx: 0, dy: step };
    default:
      return null;
  }
}
