import type { ReactElement } from 'react';
import { EXAMPLES } from '../io/examples';
import { SPEEDS, editor } from '../state/store';
import { useEditor } from '../state/useEditor';
import { Icon } from './Icons';
import { Menu, MenuItem } from './Menu';
import { fitAll, loadExample, newCircuit, openCircuit, saveCircuit, zoomBy } from './actions';

export function TopBar(): ReactElement {
  const running = useEditor((s) => s.running);
  const speed = useEditor((s) => s.speed);
  const tool = useEditor((s) => s.tool);
  const snap = useEditor((s) => s.ui.snap);
  const canUndo = useEditor((s) => s.history.past.length > 0);
  const canRedo = useEditor((s) => s.history.future.length > 0);
  const hasSelection = useEditor((s) => s.selection.components.length + s.selection.wires.length > 0);
  const hasClipboard = useEditor((s) => s.clipboard !== null);
  const toolboxOpen = useEditor((s) => s.ui.toolboxOpen);

  const s = () => editor.getState();

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo" aria-hidden="true">
          ◱
        </span>
        <span className="brand-name">DigitalBox</span>
      </div>

      <nav className="toolbar" aria-label="Editor">
        <Menu label="File" icon={<Icon name="file" />} dataTour="file">
          <MenuItem onSelect={newCircuit}>New circuit</MenuItem>
          <MenuItem onSelect={() => void openCircuit()}>Open…</MenuItem>
          <MenuItem onSelect={saveCircuit}>Save…</MenuItem>
          <div className="menu-heading">Examples</div>
          {EXAMPLES.map((ex) => (
            <MenuItem key={ex.id} onSelect={() => loadExample(ex.id)}>
              {ex.title}
            </MenuItem>
          ))}
        </Menu>

        <div className="group" role="group" aria-label="Edit">
          <button type="button" className="tool-btn" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={() => s().undo()}>
            <Icon name="undo" />
          </button>
          <button type="button" className="tool-btn" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!canRedo} onClick={() => s().redo()}>
            <Icon name="redo" />
          </button>
          <button type="button" className="tool-btn" title="Rotate (R)" aria-label="Rotate" disabled={!hasSelection} onClick={() => s().rotateSelected()}>
            <Icon name="rotate" />
          </button>
          <button type="button" className="tool-btn" title="Copy (Ctrl+C)" aria-label="Copy" disabled={!hasSelection} onClick={() => s().copySelected()}>
            <Icon name="copy" />
          </button>
          <button type="button" className="tool-btn" title="Paste (Ctrl+V)" aria-label="Paste" disabled={!hasClipboard} onClick={() => s().paste(20, 20)}>
            <Icon name="paste" />
          </button>
          <button type="button" className="tool-btn" title="Delete (Del)" aria-label="Delete" disabled={!hasSelection} onClick={() => s().deleteSelected()}>
            <Icon name="trash" />
          </button>
        </div>

        <div className="group" role="group" aria-label="View">
          <button type="button" className="tool-btn" title="Zoom in" aria-label="Zoom in" onClick={() => zoomBy(1.2)}>
            <Icon name="zoomIn" />
          </button>
          <button type="button" className="tool-btn" title="Zoom out" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)}>
            <Icon name="zoomOut" />
          </button>
          <button type="button" className="tool-btn" title="Fit to view (F)" aria-label="Fit to view" onClick={fitAll}>
            <Icon name="fit" />
          </button>
          <button
            type="button"
            className={snap ? 'tool-btn is-on' : 'tool-btn'}
            title="Snap to grid (G)"
            aria-label="Snap to grid"
            aria-pressed={snap}
            onClick={() => s().patchUi({ snap: !snap })}
          >
            <Icon name="magnet" />
          </button>
          <button
            type="button"
            className={tool === 'pan' ? 'tool-btn is-on' : 'tool-btn'}
            title={tool === 'pan' ? 'Pan tool (drag to move the view)' : 'Select tool (drag to select)'}
            aria-label={tool === 'pan' ? 'Pan tool' : 'Select tool'}
            aria-pressed={tool === 'pan'}
            onClick={() => s().setTool(tool === 'pan' ? 'select' : 'pan')}
          >
            <Icon name={tool === 'pan' ? 'pan' : 'select'} />
          </button>
        </div>

        <div className="group sim" role="group" aria-label="Simulation" data-tour="run">
          <button
            type="button"
            className={running ? 'tool-btn is-on' : 'tool-btn'}
            title={running ? 'Pause' : 'Run'}
            aria-label={running ? 'Pause simulation' : 'Run simulation'}
            aria-pressed={running}
            onClick={() => s().setRunning(!running)}
          >
            <Icon name={running ? 'pause' : 'play'} />
          </button>
          <button
            type="button"
            className="tool-btn"
            title="Single step to the next clock edge"
            aria-label="Step"
            onClick={() => {
              s().setRunning(false);
              s().stepSim();
            }}
          >
            <Icon name="step" />
          </button>
          <button type="button" className="tool-btn" title="Reset stored values and time" aria-label="Reset simulation" onClick={() => s().resetSim()}>
            <Icon name="reset" />
          </button>
          <select
            className="speed"
            aria-label="Simulation speed"
            value={speed}
            onChange={(e) => s().setSpeed(Number(e.target.value))}
          >
            {SPEEDS.map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
        </div>
      </nav>

      <div className="topbar-end">
        <button
          type="button"
          className={toolboxOpen ? 'tool-btn is-on' : 'tool-btn'}
          title="Show or hide the toolbox"
          aria-label="Toggle toolbox"
          aria-pressed={toolboxOpen}
          onClick={() => {
            const open = !s().ui.toolboxOpen;
            s().patchUi({ toolboxOpen: open, sheetOpen: open, drawerOpen: open });
          }}
        >
          <Icon name="toolbox" />
        </button>
        <Menu label="Help" icon={<Icon name="help" />}>
          <MenuItem onSelect={() => s().patchUi({ tutorialStep: 0 })}>Restart tutorial</MenuItem>
          <MenuItem onSelect={() => s().openDialog('shortcuts')}>Keyboard shortcuts</MenuItem>
          <MenuItem onSelect={() => s().openDialog('about')}>About DigitalBox</MenuItem>
        </Menu>
      </div>
    </header>
  );
}
