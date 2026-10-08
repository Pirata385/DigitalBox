import { useEffect, useState, type ReactElement } from 'react';
import { def } from '../catalog/registry';
import type { PropSpec } from '../catalog/types';
import type { PropValue } from '../model/types';
import { bitStr, hexStr, known } from '../sim/signal';
import { editor, simulator } from '../state/store';
import { useEditor } from '../state/useEditor';
import { pinWidthOf } from './pins';
import { coercePropValue } from './propInput';

/** One prop as a form control. Text and numbers commit on blur or Enter, so typing does not flood undo history. */
function PropField({
  spec,
  value,
  onCommit,
}: {
  spec: PropSpec;
  value: PropValue | undefined;
  onCommit: (v: PropValue) => void;
}): ReactElement {
  const [draft, setDraft] = useState(String(value ?? ''));
  useEffect(() => setDraft(String(value ?? '')), [value]);

  const commit = (raw: string): void => {
    const v = coercePropValue(spec, raw);
    if (v !== undefined) onCommit(v);
    else setDraft(String(value ?? ''));
  };

  if (spec.kind === 'select') {
    return (
      <label className="field">
        <span>{spec.label}</span>
        <select value={String(value)} onChange={(e) => commit(e.target.value)}>
          {(spec.options ?? []).map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (spec.kind === 'text') {
    return (
      <label className="field">
        <span>{spec.label}</span>
        <textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => commit(draft)} />
      </label>
    );
  }
  return (
    <label className="field">
      <span>{spec.label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={spec.min}
        max={spec.max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(draft);
        }}
      />
    </label>
  );
}

function valueText(bits: number, value: number): string {
  const s = known(value, bits);
  return bits === 1 ? bitStr(s, 1) : `${hexStr(s, bits)} (${value})`;
}

function PartEditor({ id }: { id: string }): ReactElement | null {
  const comp = useEditor((s) => s.doc.components.find((c) => c.id === id));
  if (!comp) return null;
  const d = def(comp.type);
  const s = editor.getState;
  const setProp = (key: string, value: PropValue): void => s().setProp(comp.id, key, value);
  const bits = typeof comp.props.bits === 'number' ? comp.props.bits : 1;
  return (
    <>
      <header className="insp-head">
        <h2>{d.name}</h2>
        <span className="muted">{comp.id}</span>
      </header>
      <p className="tip">{d.tooltip}</p>
      {d.props.map((spec) => (
        <PropField key={spec.key} spec={spec} value={comp.props[spec.key]} onCommit={(v) => setProp(spec.key, v)} />
      ))}
      {comp.type === 'switch' && (
        <button type="button" className="wide" onClick={() => s().toggleInput(comp.id)}>
          Flip switch (now {simulator.getInput(comp.id) === 1 ? 'on' : 'off'})
        </button>
      )}
      {comp.type === 'word' && (
        <>
          <p className="readout">Value {valueText(bits, simulator.getInput(comp.id))}</p>
          <button type="button" className="wide" onClick={() => s().toggleInput(comp.id)}>
            Count up
          </button>
        </>
      )}
      <div className="insp-actions">
        <button type="button" onClick={() => s().rotateSelected()}>
          Rotate
        </button>
        <button
          type="button"
          onClick={() => {
            s().copySelected();
            s().paste(20, 20);
          }}
        >
          Duplicate
        </button>
        <button type="button" className="danger" onClick={() => s().deleteSelected()}>
          Delete
        </button>
      </div>
    </>
  );
}

function WireInfo({ id }: { id: string }): ReactElement | null {
  const doc = useEditor((s) => s.doc);
  const w = doc.wires.find((x) => x.id === id);
  if (!w) return null;
  const from = doc.components.find((c) => c.id === w.from.component);
  const to = doc.components.find((c) => c.id === w.to.component);
  const width = pinWidthOf(doc, w.from);
  const sig = simulator.wireSig(id);
  return (
    <>
      <header className="insp-head">
        <h2>Wire</h2>
        <span className="muted">{id}</span>
      </header>
      <p>
        From <strong>{from ? def(from.type).name : '?'}</strong> ({w.from.pin})
      </p>
      <p>
        To <strong>{to ? def(to.type).name : '?'}</strong> ({w.to.pin})
      </p>
      <p>
        Width {width} bit{width === 1 ? '' : 's'}
      </p>
      {sig && (
        <p className="readout">
          Value {width === 1 ? bitStr(sig, 1) : hexStr(sig, width)}
        </p>
      )}
      <div className="insp-actions">
        <button type="button" className="danger" onClick={() => editor.getState().deleteSelected()}>
          Delete wire
        </button>
      </div>
    </>
  );
}

export function Inspector(): ReactElement | null {
  const selection = useEditor((s) => s.selection);
  const version = useEditor((s) => s.simVersion);
  const count = selection.components.length + selection.wires.length;
  if (count === 0) return null;

  let body: ReactElement | null;
  if (count > 1) {
    body = (
      <>
        <header className="insp-head">
          <h2>{count} items selected</h2>
        </header>
        <div className="insp-actions">
          <button type="button" onClick={() => editor.getState().rotateSelected()}>
            Rotate
          </button>
          <button
            type="button"
            onClick={() => {
              editor.getState().copySelected();
              editor.getState().paste(20, 20);
            }}
          >
            Duplicate
          </button>
          <button type="button" className="danger" onClick={() => editor.getState().deleteSelected()}>
            Delete
          </button>
        </div>
      </>
    );
  } else if (selection.components.length === 1) {
    body = <PartEditor id={selection.components[0]} />;
  } else {
    body = <WireInfo id={selection.wires[0]} />;
  }

  return (
    <aside className="inspector" aria-label="Inspector" data-version={version}>
      {body}
    </aside>
  );
}
