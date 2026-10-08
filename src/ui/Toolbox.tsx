import { useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { CATEGORIES, type ComponentDef, type Category } from '../catalog/types';
import { def, layoutOf } from '../catalog/registry';
import { floating } from '../sim/signal';
import { PartSymbol } from '../render/symbols';
import { editor } from '../state/store';
import { useEditor } from '../state/useEditor';
import { canvasCentre } from './actions';
import { Icon } from './Icons';
import { screenToWorld } from './interaction';
import { visiblePartsFor } from './toolboxModel';

/** Pixels the pointer must travel before a press becomes a drag. */
const DRAG_START = 6;

/** A small picture of a part, scaled to fit its icon box. */
function PartThumb({ d }: { d: ComponentDef }): ReactElement {
  const layout = layoutOf({ type: d.type, props: d.defaults });
  const w = layout.x1 - layout.x0;
  const h = layout.y1 - layout.y0;
  return (
    <svg
      className="thumb"
      viewBox={`${layout.x0 - 4} ${layout.y0 - 4} ${w + 8} ${h + 8}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <PartSymbol
        type={d.type}
        props={d.defaults}
        w={w}
        h={h}
        pins={layout.pins}
        pin={() => floating(1)}
        inputValue={0}
        on={false}
        selected={false}
      />
    </svg>
  );
}

function sizeOf(d: ComponentDef): { w: number; h: number } {
  const l = d.layout(d.defaults);
  return { w: l.x1 - l.x0, h: l.y1 - l.y0 };
}

export function Toolbox(): ReactElement {
  const category = useEditor((s) => s.ui.category);
  const search = useEditor((s) => s.ui.search);
  const toolboxOpen = useEditor((s) => s.ui.toolboxOpen);
  const sheetOpen = useEditor((s) => s.ui.sheetOpen);
  const drawerOpen = useEditor((s) => s.ui.drawerOpen);
  const [ghost, setGhost] = useState<{ type: string; x: number; y: number } | null>(null);

  const parts = visiblePartsFor(category, search);
  const patch = (p: Parameters<ReturnType<typeof editor.getState>['patchUi']>[0]) => editor.getState().patchUi(p);

  /** A press on a part either places it at the view centre (a tap) or drops it where the pointer lands (a drag). */
  const beginPlacement = (e: ReactPointerEvent<HTMLButtonElement>, type: string): void => {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    const finish = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      setGhost(null);
    };
    const onMove = (ev: PointerEvent): void => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_START) return;
      moved = true;
      setGhost({ type, x: ev.clientX, y: ev.clientY });
    };
    const onUp = (ev: PointerEvent): void => {
      finish();
      const s = editor.getState();
      if (!moved) {
        const c = canvasCentre();
        const world = screenToWorld(s.view, c.x, c.y);
        s.addAt(type, world.x, world.y);
        return;
      }
      const canvas = document.querySelector('.canvas')?.getBoundingClientRect();
      if (!canvas) return;
      const inside =
        ev.clientX >= canvas.left && ev.clientX <= canvas.right && ev.clientY >= canvas.top && ev.clientY <= canvas.bottom;
      if (!inside) return;
      const world = screenToWorld(s.view, ev.clientX - canvas.left, ev.clientY - canvas.top);
      const { w, h } = sizeOf(def(type));
      s.addAt(type, world.x - w / 2, world.y - h / 2);
    };
    const onCancel = (): void => finish();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  const sheetClass = [
    'toolbox',
    toolboxOpen ? '' : 'is-hidden',
    sheetOpen ? 'sheet-open' : '',
    drawerOpen ? 'drawer-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <aside className={sheetClass} data-tour="toolbox" aria-label="Toolbox">
      <div className="toolbox-head">
        <button
          type="button"
          className="sheet-handle"
          aria-label={sheetOpen ? 'Collapse toolbox' : 'Expand toolbox'}
          aria-expanded={sheetOpen}
          onClick={() => patch({ sheetOpen: !sheetOpen })}
        >
          <span className="grab" aria-hidden="true" />
        </button>
        <h2>Toolbox</h2>
        <button
          type="button"
          className="tool-btn"
          aria-label="Hide toolbox"
          title="Hide toolbox"
          onClick={() => patch({ toolboxOpen: false, sheetOpen: false, drawerOpen: false })}
        >
          <Icon name="close" />
        </button>
      </div>

      <label className="search">
        <Icon name="search" />
        <input
          type="search"
          placeholder="Search parts"
          aria-label="Search parts"
          value={search}
          onChange={(e) => patch({ search: e.target.value })}
        />
      </label>

      <div className="tabs" role="tablist" aria-label="Part categories">
        {(['all', ...CATEGORIES.map((c) => c.id)] as (Category | 'all')[]).map((id) => {
          const label = id === 'all' ? 'All' : (CATEGORIES.find((c) => c.id === id)?.label ?? id);
          const selected = category === id && !search;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={selected ? 'tab is-selected' : 'tab'}
              onClick={() => patch({ category: id, search: '' })}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="tool-grid">
        {parts.length === 0 && <p className="empty">No parts match “{search}”.</p>}
        {parts.map((d) => (
          <button
            key={d.type}
            type="button"
            className="tool-item"
            data-testid="tool-item"
            title={d.tooltip}
            aria-label={`${d.name}. ${d.tooltip}`}
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => beginPlacement(e, d.type)}
            onClick={(e) => {
              // A keyboard activation has detail 0. Pointer taps are handled on pointer up.
              if (e.detail === 0) {
                const s = editor.getState();
                const c = canvasCentre();
                const world = screenToWorld(s.view, c.x, c.y);
                s.addAt(d.type, world.x, world.y);
              }
            }}
          >
            <PartThumb d={d} />
            <span className="tool-name">{d.name}</span>
          </button>
        ))}
      </div>

      {ghost && (
        <div className="ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          <PartThumb d={def(ghost.type)} />
        </div>
      )}
    </aside>
  );
}
