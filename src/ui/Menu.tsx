import type { ReactElement, ReactNode } from 'react';

/**
 * A dropdown built on <details>, so it opens and closes without script, and
 * closes again after an item is chosen.
 */
export function Menu({
  label,
  icon,
  children,
  dataTour,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
  dataTour?: string;
}): ReactElement {
  return (
    <details className="menu" data-tour={dataTour}>
      <summary className="menu-button">
        {icon}
        <span>{label}</span>
      </summary>
      <div
        className="menu-panel"
        role="menu"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) {
            (e.currentTarget.parentElement as HTMLDetailsElement | null)?.removeAttribute('open');
          }
        }}
      >
        {children}
      </div>
    </details>
  );
}

export function MenuItem({
  onSelect,
  children,
  disabled,
}: {
  onSelect: () => void;
  children: ReactNode;
  disabled?: boolean;
}): ReactElement {
  return (
    <button type="button" role="menuitem" className="menu-item" onClick={onSelect} disabled={disabled}>
      {children}
    </button>
  );
}
