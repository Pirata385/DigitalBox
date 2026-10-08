import { DEF_BY_TYPE, layoutOf, normalizeProps } from '../catalog/registry';
import type { Circuit, Component, Rot, View, Wire } from '../model/types';
import type { Sig } from '../sim/signal';
import type { State } from '../sim/seq';
import type { SimSnapshot } from '../sim/simulator';

export const FORMAT = 'digitalbox';
export const VERSION = 1;
/** Largest circuit a file may hold. Bigger files are refused rather than loaded slowly. */
export const MAX_COMPONENTS = 5000;

export interface SaveData {
  format: 'digitalbox';
  version: 1;
  name: string;
  savedAt: string;
  components: Component[];
  wires: Wire[];
  sim: {
    running: boolean;
    speed: number;
    timeUs: number;
    inputs: Record<string, number>;
    states: Record<string, State>;
  };
  view: View;
}

export type ParseResult = { ok: true; data: SaveData; warnings: string[] } | { ok: false; error: string };

export function toSaveData(
  args: { doc: Circuit; running: boolean; speed: number; snap: SimSnapshot; view: View },
  now: Date = new Date(),
): SaveData {
  return {
    format: FORMAT,
    version: VERSION,
    name: args.doc.name,
    savedAt: now.toISOString(),
    components: args.doc.components,
    wires: args.doc.wires,
    sim: {
      running: args.running,
      speed: args.speed,
      timeUs: args.snap.timeUs,
      inputs: args.snap.inputs,
      states: args.snap.states,
    },
    view: args.view,
  };
}

export function serializeSave(data: SaveData): string {
  return JSON.stringify(data, null, 2);
}

type Json = Record<string, unknown>;

function isRecord(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finiteNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function isUint32(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
}

function isSig(v: unknown): v is Sig {
  return isRecord(v) && isUint32(v.v) && isUint32(v.x) && isUint32(v.z);
}

const ROTATIONS: readonly number[] = [0, 90, 180, 270];

function toRot(v: unknown): Rot {
  return typeof v === 'number' && ROTATIONS.includes(v) ? (v as Rot) : 0;
}

/** Reads a saved file, checking every field before it is trusted. */
export function parseSave(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }
  if (!isRecord(raw)) return { ok: false, error: 'The file does not hold a circuit.' };
  if (raw.format !== FORMAT) return { ok: false, error: 'This is not a DigitalBox file.' };
  if (raw.version !== VERSION) {
    return { ok: false, error: `Unsupported file version ${String(raw.version)}. This app reads version ${VERSION}.` };
  }
  if (!Array.isArray(raw.components) || !Array.isArray(raw.wires)) {
    return { ok: false, error: 'The file is missing its parts or wires.' };
  }
  if (raw.components.length > MAX_COMPONENTS) {
    return { ok: false, error: `The circuit has more than ${MAX_COMPONENTS} parts.` };
  }

  const warnings: string[] = [];

  const unknownTypes: string[] = [];
  const components: Component[] = [];
  const seenIds = new Set<string>();
  for (const item of raw.components) {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.type !== 'string') {
      warnings.push('Skipped a part with no id or type.');
      continue;
    }
    const d = DEF_BY_TYPE.get(item.type);
    if (!d) {
      unknownTypes.push(item.type);
      continue;
    }
    if (seenIds.has(item.id)) {
      warnings.push(`Skipped a second part with the id ${item.id}.`);
      continue;
    }
    seenIds.add(item.id);
    components.push({
      id: item.id,
      type: item.type,
      x: finiteNumber(item.x) ?? 0,
      y: finiteNumber(item.y) ?? 0,
      rot: toRot(item.rot),
      props: normalizeProps(d, isRecord(item.props) ? item.props : {}),
    });
  }
  if (unknownTypes.length > 0) {
    const names = [...new Set(unknownTypes)].join(', ');
    return { ok: false, error: `The file uses part types this app does not know: ${names}.` };
  }

  const pinWidths = new Map<string, number>();
  for (const c of components) {
    for (const p of layoutOf(c).pins) pinWidths.set(`${c.id}#${p.key}`, p.width);
  }
  const wires: Wire[] = [];
  const seenWires = new Set<string>();
  for (const item of raw.wires) {
    const from = isRecord(item) && isRecord(item.from) ? item.from : undefined;
    const to = isRecord(item) && isRecord(item.to) ? item.to : undefined;
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      !from ||
      !to ||
      typeof from.component !== 'string' ||
      typeof from.pin !== 'string' ||
      typeof to.component !== 'string' ||
      typeof to.pin !== 'string'
    ) {
      warnings.push('Dropped a wire that is missing its ends.');
      continue;
    }
    if (seenWires.has(item.id)) {
      warnings.push(`Dropped a second wire with the id ${item.id}.`);
      continue;
    }
    const wa = pinWidths.get(`${from.component}#${from.pin}`);
    const wb = pinWidths.get(`${to.component}#${to.pin}`);
    if (wa === undefined || wb === undefined) {
      warnings.push(`Dropped wire ${item.id}: it refers to a part or pin that is not there.`);
      continue;
    }
    if (wa !== wb) {
      warnings.push(`Dropped wire ${item.id}: its two ends have different widths.`);
      continue;
    }
    seenWires.add(item.id);
    wires.push({
      id: item.id,
      from: { component: from.component, pin: from.pin },
      to: { component: to.component, pin: to.pin },
    });
  }

  const sim = isRecord(raw.sim) ? raw.sim : {};
  const inputs: Record<string, number> = {};
  for (const [key, value] of Object.entries(isRecord(sim.inputs) ? sim.inputs : {})) {
    const n = finiteNumber(value);
    if (n === undefined) warnings.push(`Ignored the input value for ${key}: it is not a number.`);
    else inputs[key] = n;
  }
  const states: Record<string, State> = {};
  for (const [key, value] of Object.entries(isRecord(sim.states) ? sim.states : {})) {
    if (isRecord(value) && Object.values(value).every(isSig)) states[key] = value as State;
    else warnings.push(`Ignored the stored state of ${key}: it is not a valid state.`);
  }
  const speed = finiteNumber(sim.speed);
  const view = isRecord(raw.view) ? raw.view : {};
  const zoom = finiteNumber(view.zoom);

  return {
    ok: true,
    data: {
      format: FORMAT,
      version: VERSION,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 120) : 'Untitled circuit',
      savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : '',
      components,
      wires,
      sim: {
        running: sim.running === true,
        speed: speed !== undefined && speed > 0 ? speed : 1,
        timeUs: finiteNumber(sim.timeUs) ?? 0,
        inputs,
        states,
      },
      view: {
        zoom: zoom !== undefined ? Math.min(3, Math.max(0.2, zoom)) : 1,
        panX: finiteNumber(view.panX) ?? 0,
        panY: finiteNumber(view.panY) ?? 0,
      },
    },
    warnings,
  };
}

/** A download name for a circuit, such as `half-adder.digitalbox.json`. */
export function fileNameFor(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'circuit'}.digitalbox.json`;
}
