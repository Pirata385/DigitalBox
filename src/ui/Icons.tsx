import type { ReactElement } from 'react';

const PATHS = {
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  play: 'M8 5l11 7-11 7z',
  pause: 'M8 5v14M16 5v14',
  step: 'M6 5l9 7-9 7zM18 5v14',
  reset: 'M4 12a8 8 0 1 0 2.3-5.6L4 9M4 4v5h5',
  zoomIn: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3M11 8v6M8 11h6',
  zoomOut: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3M8 11h6',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  grid: 'M4 8h16M4 16h16M8 4v16M16 4v16',
  select: 'M5 4l14 8-6 1.5L10 20z',
  pan: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3M12 21l-3-3M12 21l3-3',
  toolbox: 'M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v7H4zM13 14h7v7h-7z',
  file: 'M6 3h8l5 5v13H6zM14 3v5h5',
  help: 'M9 9a3 3 0 1 1 4 2.8c-.7.3-1 1-1 1.7V15M12 18.5v.01',
  rotate: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5',
  copy: 'M9 9h11v11H9zM4 15V4h11',
  paste: 'M9 4h6v3H9zM6 6h12v15H6z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  magnet: 'M5 4v8a7 7 0 0 0 14 0V4h-4v8a3 3 0 0 1-6 0V4z',
  close: 'M6 6l12 12M18 6 6 18',
  chevron: 'M6 9l6 6 6-6',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
} as const;

export type IconName = keyof typeof PATHS;

/** A 24 by 24 line icon. It is decorative, so it is hidden from assistive technology. */
export function Icon({ name }: { name: IconName }): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
