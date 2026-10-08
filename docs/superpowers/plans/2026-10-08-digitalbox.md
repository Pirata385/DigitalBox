# DigitalBox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build DigitalBox, a static React + TypeScript digital-logic sandbox with 45 parts, a three-valued event-driven simulator, JSON save and load, a touch-capable responsive UI, an interactive tutorial, and GitHub Pages deployment.

**Architecture:** Pure TypeScript layers (`sim/`, `catalog/`, `model/`, `io/`, `state/store.ts`) are tested in Node with Vitest. React renders circuits as SVG from a Zustand store. Pointer logic lives in `Canvas.tsx` and calls pure helpers. The simulator is a zero-delay fixed-point engine with rising-edge flip-flops and integer-microsecond clocks.

**Tech Stack:** React 19, TypeScript 5 (strict), Vite, Zustand 5 (vanilla store plus hook), Vitest, Playwright (local smoke run against the system Chromium), GitHub Actions with `actions/deploy-pages`.

**Spec:** `docs/superpowers/specs/2026-10-08-digitalbox-design.md`

## Global Constraints

- Grid 10 px. Pin stub 10 px. Single-bit wires 2 px, bus wires 3.5 px.
- A component's origin is the top-left corner of its unrotated box. Rotation is about the box centre. Rotations are 0, 90, 180 or 270.
- Width props: `bits` 1 to 8 for most parts, 1 to 16 for `word`, `busmon`, `adder`, `cmp` and `junction`. `inputs` 2 to 8 for n-input gates. `n` 2 to 8 for `split` and `merge`.
- Values are 0, 1, X and Z. Gate inputs see Z as X. An unconnected pin reads Z for display and X for logic.
- Clock half period is `hp = Math.round(1e6 / (2 * freq))` µs. The level after edge `n` is `n % 2`. Frequencies are 0.5, 1, 2, 5, 10, 20, 50 and 100 Hz, default 1.
- Event budget per settle is `10000 + 50 * elementCount`. Edge phases per settle are capped at 1000.
- Speeds are 0.25, 0.5, 1, 2 and 4. The real-time frame delta is capped at 100 ms.
- Memories start at 0.
- Zoom range 0.2 to 3. Undo limit 200. Autosave debounce 400 ms.
- Pin hit radius is 18 px on touch and 10 px on mouse, in screen space. Wire-on-wire drop tolerance is 8 px in screen space.
- Breakpoints: desktop layout when width is at least 960 px. Landscape-compact when height is under 520 px.
- Colours: HIGH `#34d399`, LOW `#475569`, X `#f59e0b`, Z `#64748b`, conflict `#fb7185`, selection `#38bdf8`.
- Save file: `format: "digitalbox"`, `version: 1`, extension `.digitalbox.json`.
- localStorage keys: `digitalbox.autosave.v1` and `digitalbox.tutorial.done.v1`.
- Every commit ends with these trailers:
  `Co-Authored-By: Claude <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01R2oyv66Tx85zQ3KCinnsd6`.
- No model identifier appears in commits, PR text or code.

## Review Focus

1. **Malformed or hand-edited save files** (non-JSON, wrong version, unknown types, wires to missing pins, width mismatches, corrupted autosave) must produce an error or a counted partial load, never a crash. Tests: Task 10, `tests/serialize.test.ts`: "rejects non-JSON", "rejects unknown version", "reports unknown component types", "drops dangling and width-mismatched wires and counts them", "ignores corrupted autosave".
2. **Prop changes that shrink pins while wires are attached** (gate inputs 4 to 2, bits 4 to 1) must remove only the wires that lost a pin or width, in one undoable step. Tests: Task 8, `tests/circuit.test.ts`: "setComponentProp prunes wires on removed pins". Task 9, `tests/store.test.ts`: "undo restores pruned wires".
3. **Large gaps between frames** (background tab, slow device) with fast clocks must process every edge in order so counters stay exact. Test: Task 7, `tests/simulator.test.ts`: "advance over 60 s at 10 Hz counts exactly 600 edges".
4. **Oscillating feedback** (a ring of three NOT gates) must terminate and warn, and the UI must keep responding. Tests: Task 7: "three-NOT ring terminates and warns", "NOR latch with S=R=1 holds both outputs at 0 without a warning".
5. **Contention on shared nets** (two outputs wired together, two enabled tri-state drivers, a pull-up against a driven LOW) must resolve to X with a conflict count and never throw. Tests: Task 7: "two enabled tri-state drivers conflict to X", "pull-up holds HIGH only when nothing drives", "driven LOW overrides pull-up".

## Conventions

- Imports use relative paths. No path aliases.
- TypeScript strict. No `any`. Parse external JSON as `unknown` and narrow it.
- Each task writes its tests first, watches them fail, implements, watches them pass, then commits.
- Tests live in `tests/` and run in Node. Only Task 11 and later may touch the DOM, and only through the browser smoke test.

---

## Task 1: Scaffold the project

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/main.tsx`, `src/App.tsx`, `src/styles/global.css`

**Interfaces:**
- Produces scripts: `test` (`vitest run`), `typecheck` (`tsc --noEmit`), `build` (`tsc --noEmit && vite build`).

- [ ] **Step 1: Install dependencies**

Run `npm install react@^19 react-dom@^19 zustand@^5`, then `npm install -D vite @vitejs/plugin-react typescript@^5 vitest @types/react @types/react-dom @types/node`. Accept the versions npm resolves.

- [ ] **Step 2: Configure Vite and TypeScript**

`vite.config.ts` sets `base: './'`, the React plugin, and `test: { environment: 'node', include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'], passWithNoTests: true }`. `tsconfig.json` is strict, uses `"jsx": "react-jsx"`, and includes `src`, `tests` and `vite.config.ts`.

- [ ] **Step 3: Placeholder app**

`src/main.tsx` mounts `App` into `#root`. `src/App.tsx` renders the text "DigitalBox".

- [ ] **Step 4: Verify**

Run `npm run build`. Expected: exit code 0 and `dist/index.html` exists.

- [ ] **Step 5: Commit**

`chore: scaffold Vite React TypeScript project`

---

## Task 2: Three-valued signal arithmetic

**Files:**
- Create: `src/sim/signal.ts`
- Test: `tests/signal.test.ts`

**Interfaces Produces:**

```ts
export interface Sig { readonly v: number; readonly x: number; readonly z: number } // unsigned 32-bit masks
export function mask(w: number): number                       // w in 1..32, unsigned
export function make(v: number, x: number, z: number, w: number): Sig // masks to w bits; z wins over x; v cleared under x|z
export function known(value: number, w: number): Sig
export function unknown(w: number): Sig                       // all X
export function floating(w: number): Sig                      // all Z
export function asLogic(s: Sig, w: number): Sig               // Z bits become X
export function and2(a: Sig, b: Sig, w: number): Sig          // Z inputs count as X
export function or2(a: Sig, b: Sig, w: number): Sig
export function xor2(a: Sig, b: Sig, w: number): Sig
export function not1(a: Sig, w: number): Sig
export function resolve(drivers: readonly Sig[], w: number): { value: Sig; conflict: boolean }
export function isKnown(s: Sig, w: number): boolean
export function toInt(s: Sig, w: number): number | null       // null when any bit is X or Z
export function bitStr(s: Sig, w: number): string             // MSB first, chars 0 1 X Z
export function hexStr(s: Sig, w: number): string             // nibble with any X shows X, else any Z shows Z
```

- [ ] **Step 1: Write the failing tests**

- `and2`: `0 AND X = 0`, `1 AND X = X`, `X AND X = X`, `1 AND Z = X` (w = 1).
- `or2`: `1 OR X = 1`, `0 OR X = X`.
- `xor2`: any unknown input gives X.
- `not1`: `NOT Z = X`.
- `resolve([known(1), floating(1)], 1)` gives value 1 and `conflict: false`.
- `resolve([known(1), known(0)], 1)` gives X and `conflict: true`.
- `resolve([floating(1), floating(1)], 1)` gives Z.
- `resolve([unknown(1)], 1)` gives X and `conflict: false`.
- `make(0xff, 0x0f, 0x30, 4)` gives `z = 0`, `x = 0xf`, `v = 0`.
- `bitStr(make(0b0100, 0b1000, 0b0001, 4), 4) === "X10Z"`.
- `hexStr(known(0xab, 8), 8) === "AB"`.
- `toInt(known(10, 4), 4) === 10`, and `toInt(unknown(4), 4) === null`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run `npx vitest run tests/signal.test.ts`. Expected: fails with an import error.

- [ ] **Step 3: Implement**

Use known-zero and known-one masks. Known-one is `v & m`. Known-zero is `m & ~(v | x | z)`. Build outputs with `make`. For XOR, `v = (ko(a) & kz(b)) | (kz(a) & ko(b))` and `x` is any unknown bit.

- [ ] **Step 4: Run the tests and confirm they pass**

Run `npx vitest run tests/signal.test.ts`. Expected: all pass.

- [ ] **Step 5: Commit**

`feat(sim): three-valued bit-vector signal ops`

---

## Task 3: Model types and netlist

**Files:**
- Create: `src/model/types.ts`, `src/sim/netlist.ts`
- Test: `tests/netlist.test.ts`

**Interfaces Produces:**

```ts
// src/model/types.ts
export type Rot = 0 | 90 | 180 | 270;
export interface Pt { x: number; y: number }
export interface PinRef { component: string; pin: string }
export type PropValue = number | string | boolean;
export interface Component { id: string; type: string; x: number; y: number; rot: Rot; props: Record<string, PropValue> }
export interface Wire { id: string; from: PinRef; to: PinRef }
export interface Circuit { name: string; components: Component[]; wires: Wire[] }
export interface Selection { components: string[]; wires: string[] }
export interface View { zoom: number; panX: number; panY: number }

// src/sim/netlist.ts
export type Dir = 'in' | 'out' | 'io';
export interface PinSite { component: string; pin: string; dir: Dir; width: number; weak?: boolean }
export interface WireEnds { id: string; from: PinRef; to: PinRef }
export interface NetInfo { width: number; drivers: PinSite[]; sinks: PinSite[] }
export interface Netlist { nets: NetInfo[]; pinNet: Map<string, number>; wireNet: Map<string, number>; skippedWires: string[] }
export function pinKey(component: string, pin: string): string        // `${component}#${pin}`
export function buildNetlist(sites: PinSite[], wires: WireEnds[]): Netlist
```

- [ ] **Step 1: Write the failing tests**

- Two wired pins share one net. The net's `drivers` and `sinks` hold the correct sites.
- Three pins joined through an `io` junction form one net.
- An unwired pin gets its own net with no drivers.
- A wire between widths 1 and 4 is skipped and its id appears in `skippedWires`.
- A wire to an unknown component is skipped.
- `wireNet` maps each wire to the net of its `from` end.
- Every site appears in `pinNet`.

- [ ] **Step 2: Run and confirm failure**

- [ ] **Step 3: Implement**

Use union-find over site indices. Process wires in order. Skip a wire when either end is not a known site or the widths differ. Each root becomes a net. Its width is the width of its sites.

- [ ] **Step 4: Run and confirm pass**

- [ ] **Step 5: Commit**

`feat(sim): netlist built from pins and wires`

---

## Task 4: Component catalog

**Files:**
- Create: `src/catalog/types.ts`, `src/catalog/layouts.ts`, `src/catalog/defs.ts`, `src/catalog/registry.ts`
- Test: `tests/catalog.test.ts`

**Interfaces Produces:**

```ts
// types.ts
export type Category = 'inputs' | 'outputs' | 'gates' | 'memory' | 'arithmetic' | 'mux' | 'buses' | 'power' | 'misc';
export const CATEGORIES: readonly { id: Category; label: string }[];  // labels: Inputs, Outputs, Gates, Memory, Arithmetic, Mux & decode, Buses, Power & passive, Misc
export type Props = Record<string, PropValue>;                       // PropValue from model/types
export type Side = 'L' | 'R' | 'T' | 'B' | null;
export interface PinSpec { key: string; label: string; x: number; y: number; side: Side; dir: Dir; width: number; clock?: boolean; weak?: boolean }
export interface Layout { x0: number; y0: number; x1: number; y1: number; pins: PinSpec[] }   // pins relative to the origin
export type Kind = 'source' | 'clock' | 'comb' | 'latch' | 'ff' | 'sink' | 'junction' | 'note';
export interface PropSpec { key: string; label: string; kind: 'int' | 'select' | 'text'; min?: number; max?: number; options?: { value: PropValue; label: string }[]; isWidth?: boolean }
export interface ComponentDef { type: string; name: string; category: Category; kind: Kind; tooltip: string; defaults: Props; props: PropSpec[]; layout: (p: Props) => Layout }

// registry.ts
export const DEFS: readonly ComponentDef[];                 // exactly 45 entries, spec section 7
export const DEF_BY_TYPE: ReadonlyMap<string, ComponentDef>;
export function def(type: string): ComponentDef;            // throws on unknown type
export function normalizeProps(d: ComponentDef, input: Record<string, unknown>): Props;  // fill defaults, clamp ints, check select options, trim text to 200 chars
export function bitsOf(d: ComponentDef, p: Props): number;   // the prop marked isWidth; default 1
export function layoutOf(c: { type: string; props: Props }): Layout;

// layouts.ts
export function gateLayout(n: number): Layout;               // W 60, H 20n, in{i} at (0, 10+20i) side L, out at (60, 10n) side R
export function blockLayout(left: Omit<PinSpec, 'x' | 'y' | 'side'>[], right: Omit<PinSpec, 'x' | 'y' | 'side'>[]): Layout;  // W 60, H 20(max+1), left at (0, 20(i+1)), right at (60, 20(j+1))
export function boxLayout(w: number, h: number, pins: PinSpec[]): Layout;
```

Pin keys and widths for every part follow spec section 7. Fixed-size parts use these boxes. `switch`, `button`, `clock`, `const0`, `const1`, `vcc`, `gnd`, `pullup`, `pulldown` use 40×40 with out at (40, 20). `word` uses 60×40 with out at (60, 20). `led`, `probe`, `buzzer` use 40×40 with in at (0, 20). `seghex` uses 60×80 with `in` at (0, 40). `segraw` uses `blockLayout` with 7 left pins. `busmon` uses 80×40 with in at (0, 20). `split` and `merge` use `blockLayout`, with the bus pin at (0, 10(n+1)) for split. `junction` uses bounds (-5, -5, 5, 5) with pin `p` at (0, 0) and side `null`. `note` has no pins and its size depends on its text.

- [ ] **Step 1: Write the failing tests**

- `DEFS.length === 45`, types are unique, and every category in `CATEGORIES` has at least one part.
- Every pin key is unique within its part and lies inside its bounds.
- Parts of kind `sink` and `note` have no `out` pins. Parts of kind `junction` have only an `io` pin.
- `normalizeProps(def('and'), { inputs: 99 }).inputs === 8`.
- `bitsOf(def('word'), { bits: 40 })` gives 16 when the value is clamped first.
- `normalizeProps(def('clock'), { freq: 3 }).freq` is 1 when 3 is not an option.
- `normalizeProps(def('note'), { text: 'x'.repeat(300) }).text.length === 200`.
- `def('nope')` throws.

- [ ] **Step 2: Run and confirm failure**

- [ ] **Step 3: Implement**

Write the 45 definitions in `defs.ts`. Each `layout` function returns pins from the helpers in `layouts.ts`. Labels use the spec's pin names.

- [ ] **Step 4: Run and confirm pass**

- [ ] **Step 5: Commit**

`feat(catalog): 45 component definitions with layouts and props`

---

## Task 5: Combinational behaviours

**Files:**
- Create: `src/sim/comb.ts`
- Test: `tests/comb.test.ts`

**Interfaces Produces:**

```ts
export type Ins = Record<string, Sig>;   // the engine has already applied asLogic, so no Z bits
export type Outs = Record<string, Sig>;
export const COMB_TYPES: ReadonlySet<string>;   // not, buf, and, or, nand, nor, xor, xnor, tri, ha, fa, adder, cmp, mux2, mux4, demux4, dec24, split, merge
export function evalComb(type: string, props: Props, ins: Ins): Outs;
```

Semantics:

- `not` and `buf` read `in0`. `not` returns `not1`.
- The gates read `in0` through `in{n-1}` with `n = props.inputs`, folded with `and2`, `or2` or `xor2` at width `bits`. `nand`, `nor` and `xnor` invert the result.
- `tri` gives `in` when `en` is known 1, Z when `en` is known 0, and X when `en` is unknown.
- `ha` gives `s = a ^ b` and `c = a & b`. `fa` gives `s = a ^ b ^ cin` and the majority carry.
- `adder` adds known integers. Any unknown bit makes `s` and `cout` unknown. `cmp` gives `eq`, with X when unknown.
- `mux2` and `mux4` give the selected input. An unknown select gives the common value when all candidates agree, otherwise X.
- `demux4` drives the selected output with `d` and the others with 0. An unknown select makes all outputs X.
- `dec24` gives all zeros when `en` is 0, one-hot when `en` and `a` are known, and X otherwise.
- `split` gives one bit per output. `merge` concatenates its inputs.

- [ ] **Step 1: Write the failing tests**

- NAND of 1 and 1 is 0. XOR of three inputs (1, 1, 1) is 1. XNOR of 1 and 1 is 1.
- `tri` with `en = 0` gives Z. With `en = 1` it passes the data.
- `mux2` with select X and both inputs 1 gives 1. With select X and inputs 0 and 1 gives X.
- `adder` with bits 4, `a = 9`, `b = 9`, `cin = 0` gives `s = 2` and `cout = 1`.
- `dec24` with `en = 1`, `a = 2` gives `y2 = 1` and others 0.
- `split` and `merge` round-trip a 4-bit value.
- An X input to `and` with a known 0 input gives 0.

- [ ] **Step 2: Run and confirm failure**

- [ ] **Step 3: Implement**

Dispatch with a `switch` on `type`. Use `signal.ts` helpers.

- [ ] **Step 4: Run and confirm pass**

- [ ] **Step 5: Commit**

`feat(sim): combinational gate, arithmetic and mux behaviours`

---

## Task 6: Sequential behaviours

**Files:**
- Create: `src/sim/seq.ts`
- Test: `tests/seq.test.ts`

**Interfaces Produces:**

```ts
export type State = Record<string, Sig>;
export const SEQ_TYPES: ReadonlySet<string>;        // sr, dlatch, dff, jkff, tff, reg, counter, shift
export function isEdgeType(type: string): boolean;  // dff, jkff, tff, reg, counter, shift
export function clockPinOf(type: string): string | undefined;  // 'clk' for edge types, undefined otherwise
export function initState(type: string, props: Props): State;   // every value 0
export function levelUpdate(type: string, props: Props, ins: Ins, st: State): State;  // latches and async clear
export function edgeUpdate(type: string, props: Props, ins: Ins, st: State): State;   // applied to sampled inputs on a rising clock
export function outputs(type: string, props: Props, st: State, ins: Ins): Outs;
```

Semantics:

- `sr` is level-sensitive, state `{ q, qn }`. `s=1, r=0` gives q=1. `s=0, r=1` gives q=0. `s=1, r=1` gives q=0 and qn=0, as NOR gates do. `s=0, r=0` holds. Unknown inputs give X.
- `dlatch` is transparent while `en` is 1, so `q = d`. It holds while `en` is 0. Unknown `en` gives X.
- `dff` samples `d` on the rising edge. `clr` is asynchronous: when `clr` is 1, q goes to 0.
- `jkff` samples `j` and `k` on the rising edge. 00 holds, 10 sets, 01 resets, 11 toggles.
- `tff` toggles on the rising edge when `t` is 1.
- `reg` loads `d` when `en` is 1. `clr` is asynchronous.
- `counter` increments modulo 2^bits when `en` is 1. Its output `tc` is 1 when all bits of `q` are 1 and `en` is 1.
- `shift` shifts left on the rising edge and puts `ser` into bit 0. `clr` is asynchronous.
- `outputs` returns `q` and `qn` where they exist. `q` for `reg`, `counter` and `shift`. Unknown `ins` values give X.

- [ ] **Step 1: Write the failing tests**

- `dff`: after `edgeUpdate` with `d = 1`, `q = 1` and `qn = 0`. A change of `d` with no edge does not change `q`.
- `dff`: `levelUpdate` with `clr = 1` gives `q = 0`.
- `jkff` truth table on edges: 10 sets, 01 resets, 11 toggles, 00 holds.
- `tff`: two edges with `t = 1` return to 0.
- `counter`, bits 4: 15 increments followed by one more give 0 and `tc = 1` before the last increment.
- `shift`, bits 4: `ser` values 1, 0, 1, 1 shift in to give `q = 0b1011`.
- `sr`: `s=1, r=1` gives `q = 0` and `qn = 0`.
- `dlatch`: with `en = 1`, `q` follows `d`. With `en = 0`, `q` holds.

- [ ] **Step 2: Run and confirm failure**

- [ ] **Step 3: Implement**

Each edge type's `edgeUpdate` reads the already-sampled `ins` and returns a new state. Use `signal.ts` helpers for arithmetic, and return `unknown` bits when inputs are unknown.

- [ ] **Step 4: Run and confirm pass**

- [ ] **Step 5: Commit**

`feat(sim): latches, flip-flops, register, counter and shift register`

---

## Task 7: Simulation engine

**Files:**
- Create: `src/sim/simulator.ts`, `tests/helpers.ts`
- Test: `tests/simulator.test.ts`

**Interfaces Produces:**

```ts
export interface SimWarnings { conflicts: number; oscillation: boolean; skippedWires: string[] }
export interface SimSnapshot { timeUs: number; inputs: Record<string, number>; states: Record<string, State> }
export function sourceOutputs(type: string, props: Props, value: number): Outs;   // switch, button, const0, const1, vcc, gnd, word, pullup, pulldown
export function clockHalfPeriodUs(freq: number): number;   // Math.round(1e6 / (2 * freq))
export class Simulator {
  build(circuit: Circuit): void;                  // keeps inputs and states for surviving ids of the same type
  setInput(componentId: string, value: number): void;   // settles immediately, even when paused
  getInput(componentId: string): number;
  advance(us: number): void;                      // processes every clock edge in order, then sets time to target
  step(): void;                                   // advance to the next clock edge, or settle if there are no clocks
  reset(): void;                                  // time 0, states initialised, clock levels 0, inputs kept
  time(): number;
  pinSig(componentId: string, pin: string): Sig;  // FLOATING(1) when the pin is unknown
  wireSig(wireId: string): Sig | undefined;
  warnings(): SimWarnings;
  snapshot(): SimSnapshot;
  restore(snap: SimSnapshot): void;
}
```

`tests/helpers.ts` exports `makeCircuit(parts: [id: string, type: string, props?: Record<string, PropValue>][], wires: [string, string, string, string][]): Circuit` where each wire is `[fromComponent, fromPin, toComponent, toPin]`, and generated wire ids are `w0`, `w1`, and so on.

- [ ] **Step 1: Write the failing tests**

- Half adder: switches `a` and `b`, XOR and AND gates, LED outputs. Set every input pair and check `sum` and `carry`.
- SR latch from two `nor` gates: set `S` to 1 and then 0, and check that Q holds at 1. Set `R` to 1 and check that Q goes to 0.
- Three-NOT ring: `build` completes, `warnings().oscillation === true`, and `advance(1e6)` returns.
- NOR latch with S=R=1 holds both outputs at 0 without a warning.
- A `tff` with `t = 1` on a 1 Hz clock: after `advance(2e6)` there are two rising edges and `q` is back to its starting value.
- Counter, 4 bits, clock at 10 Hz: `advance(10e6)` gives `q = 4`.
- Advance over 60 s at 10 Hz counts exactly 600 edges, so `q = 8` after `reset()`.
- Two enabled tri-state drivers on one bus give X and `conflicts >= 1`.
- Pull-up holds HIGH when nothing drives the net. A driven LOW overrides it.
- Changing a switch while paused settles the output immediately, without `advance`.
- `snapshot` then `restore` into a fresh engine preserves `timeUs`, inputs and states.

- [ ] **Step 2: Run and confirm failure**

- [ ] **Step 3: Implement**

Build elements for every part whose `kind` is `source`, `clock`, `comb`, `latch` or `ff`. Sinks and junctions have no element. Output values are stored per (element, output pin). A net's value is `resolve` over its drivers, with strong drivers first and weak drivers used only where no strong driver is active. Settle has two parts. Part A runs an event queue over combinational and latch elements, and charges one evaluation to the budget per element run. Part B finds rising edges on each flip-flop's clock net against its stored last level. It samples every triggered element's inputs before applying any update, then loops. Advance computes the next edge across all clocks, sets each clock output for that time, and settles, until the next edge passes the target.

- [ ] **Step 4: Run and confirm pass**

- [ ] **Step 5: Commit**

`feat(sim): event-driven engine with clocks and rising-edge state`

---

## Task 8: Geometry and circuit operations

**Files:**
- Create: `src/model/geometry.ts`, `src/model/circuit.ts`
- Test: `tests/geometry.test.ts`, `tests/circuit.test.ts`

**Interfaces Produces:**

```ts
// geometry.ts
export const GRID = 10;
export const STUB = 10;
export function snap(v: number): number;   // nearest multiple of GRID
export interface PlacedPin { key: string; label: string; dir: Dir; width: number; clock: boolean; weak: boolean; p: Pt; out: Pt | null }  // world position; out is a unit vector away from the part
export function placedPins(c: Component): PlacedPin[];
export function pinPosition(c: Component, pinKey: string): PlacedPin | undefined;
export function componentBox(c: Component): { x0: number; y0: number; x1: number; y1: number };   // world bounds of the rotated box
export function hitComponent(comps: readonly Component[], p: Pt): Component | undefined;        // topmost wins
export function routeWire(a: { p: Pt; out: Pt | null }, b: { p: Pt; out: Pt | null }): Pt[];  // simplified orthogonal path
export function distanceToPath(p: Pt, path: readonly Pt[]): number;
export function closestOnPath(p: Pt, path: readonly Pt[]): { point: Pt; dist: number };
export function wirePath(w: Wire, c: Circuit): Pt[] | null;   // null when either end is missing

// circuit.ts
export function emptyCircuit(name?: string): Circuit;
export function freshId(c: Circuit, prefix: string): string;   // prefix plus the smallest unused integer
export function topologySignature(c: Circuit): string;          // used to decide when the engine rebuilds
export function addComponent(c: Circuit, type: string, x: number, y: number, props?: Record<string, unknown>): { circuit: Circuit; id: string };
export function moveComponents(c: Circuit, ids: readonly string[], dx: number, dy: number): Circuit;
export function rotateComponents(c: Circuit, ids: readonly string[], turns: 1 | -1): Circuit;   // rotation about the centre; origin unchanged
export function setComponentProp(c: Circuit, id: string, key: string, value: unknown): Circuit;  // normalises, then prunes
export function removeItems(c: Circuit, sel: Selection): Circuit;     // also removes wires attached to removed parts
export function connect(c: Circuit, a: PinRef, b: PinRef): { ok: true; circuit: Circuit; wireId: string } | { ok: false; reason: 'same-pin' | 'missing-pin' | 'width-mismatch' | 'duplicate' };
export function insertJunction(c: Circuit, wireId: string, at: Pt, start: PinRef): { circuit: Circuit; junctionId: string } | null;
export function pruneWires(c: Circuit): { circuit: Circuit; removed: number };
export interface Clipboard { components: Component[]; wires: Wire[] }
export function copyItems(c: Circuit, sel: Selection): Clipboard;
export function pasteItems(c: Circuit, clip: Clipboard, dx: number, dy: number): { circuit: Circuit; selection: Selection };
```

Notes:
- `routeWire` leaves each pin along its `out` vector with a stub of length `STUB`, then uses one or two elbows. Midpoints snap to GRID. It removes duplicate and collinear points.
- `insertJunction` creates a `junction` part at `at` with `bits` equal to the wire's width. It replaces the wire with two wires. It then connects `start` to the junction.
- `copyItems` keeps only wires whose two ends are both selected parts.

- [ ] **Step 1: Write the failing tests (geometry)**

- Rotating a left-side pin by 90° gives `out = (0, -1)`.
- Four rotations give the original pin positions.
- `routeWire` between two pins at the same y returns a two-point path.
- `distanceToPath` gives 0 for a point on a segment.
- `hitComponent` finds a rotated part at its rotated bounds.

- [ ] **Step 2: Write the failing tests (circuit)**

- `addComponent` with `inputs: 99` stores 8.
- `connect` rejects the same pin, a missing pin, a width mismatch and a duplicate.
- `setComponentProp` on an `and` gate from 4 inputs to 2 removes the wire to `in3` and keeps the wire to `in0`.
- `setComponentProp` changing a 1-bit `and` gate to 4 bits removes a 1-bit wire to it and reports the count.
- `insertJunction` replaces the wire with two wires and connects `start` to the junction.
- `removeItems` removes wires attached to deleted parts.
- `pasteItems` gives new ids, remaps wires, and drops wires that cross the selection.

- [ ] **Step 3: Run and confirm failure**

- [ ] **Step 4: Implement**

Use `layoutOf` for every pin query.

- [ ] **Step 5: Run and confirm pass, then commit**

`feat(model): geometry, routing and undoable circuit operations`

---

## Task 9: History and store

**Files:**
- Create: `src/model/history.ts`, `src/state/store.ts`, `src/state/useEditor.ts`
- Test: `tests/history.test.ts`, `tests/store.test.ts`

**Interfaces Produces:**

```ts
// history.ts
export interface History<T> { past: T[]; present: T; future: T[] }
export function createHistory<T>(present: T): History<T>;
export function commitHistory<T>(h: History<T>, next: T, limit?: number): History<T>;   // no-op when next === present
export function undoHistory<T>(h: History<T>): History<T>;
export function redoHistory<T>(h: History<T>): History<T>;

// store.ts
export type Tool = 'select' | 'pan';   // View is imported from model/types.ts
export interface UiState { toolboxOpen: boolean; inspectorOpen: boolean; sheetOpen: boolean; drawerOpen: boolean; dialog: 'shortcuts' | 'about' | 'error' | 'examples' | null; errorMessage: string; tutorialStep: number | null; category: Category | 'all'; search: string; snap: boolean; flash: string | null }
export interface EditorState {
  history: History<Circuit>;
  doc: Circuit;                    // always equal to history.present
  selection: Selection;
  view: View;
  tool: Tool;
  running: boolean;
  speed: number;
  simVersion: number;
  clipboard: Clipboard | null;
  ui: UiState;
  addAt(type: string, x: number, y: number): string;
  beginMove(): void;               // remembers the base document for coalescing
  moveSelected(dx: number, dy: number): void;   // live, no history
  endMove(): void;                 // commits one history entry when anything moved
  rotateSelected(): void;
  deleteSelected(): void;
  selectAll(): void;
  setSelection(sel: Selection): void;
  toggleSelect(kind: 'component' | 'wire', id: string): void;
  clearSelection(): void;
  connectPins(a: PinRef, b: PinRef): boolean;
  connectToWire(start: PinRef, wireId: string, at: Pt): boolean;
  setProp(id: string, key: string, value: unknown): void;
  toggleInput(id: string): void;   // switch flips, word increments; runtime only
  undo(): void;
  redo(): void;
  copySelected(): void;
  paste(dx: number, dy: number): void;
  newCircuit(): void;
  loadCircuit(c: Circuit, sim: Partial<SimSnapshot>, view?: View): void;   // clears history
  setTool(t: Tool): void;
  setView(v: View): void;
  setRunning(on: boolean): void;
  setSpeed(s: number): void;
  stepSim(): void;
  resetSim(): void;
  tick(us: number): void;          // runs the engine and bumps simVersion
  openDialog(d: UiState['dialog'], message?: string): void;
  closeDialog(): void;
  patchUi(p: Partial<UiState>): void;
}
export const simulator: Simulator;   // singleton engine, from store.ts
export const editor: StoreApi<EditorState>;   // createStore from 'zustand/vanilla'

// useEditor.ts
export function useEditor<T>(selector: (s: EditorState) => T): T;   // useStore(editor, selector)
```

Rules:
- Every document change rebuilds the engine only when `topologySignature` changes.
- `connectPins` and `connectToWire` return `false` on any failed validation and leave history unchanged.
- Toggling an input does not touch history or the document.

- [ ] **Step 1: Write the failing tests (history)**

- `commitHistory` pushes the previous present. `undo` restores it. `redo` restores the next. A new commit clears `future`.
- `commitHistory` with the same object returns the same history.
- The limit drops the oldest past entries.

- [ ] **Step 2: Write the failing tests (store)**

- `addAt`, then `undo` removes the part, then `redo` restores it.
- `beginMove`, three `moveSelected` calls and `endMove` form one undo step.
- `connectPins` for a duplicate returns `false` and does not add history.
- Shrinking an `and` gate's inputs with a wire attached, then `undo`, restores the wire. Test name: "undo restores pruned wires".
- `deleteSelected` removes attached wires.
- `paste` gives new ids.
- `toggleInput` flips a switch. The engine reflects it. History length is unchanged.

- [ ] **Step 3: Run and confirm failure**

- [ ] **Step 4: Implement**

Keep `store.ts` free of React imports. Call `simulator.build(doc)` inside a helper that compares `topologySignature` with the last built value. `tick` calls `simulator.advance(us)` only when `running` is true, then bumps `simVersion`.

- [ ] **Step 5: Run and confirm pass, then commit**

`feat(state): undoable editor store wired to the engine`

---

## Task 10: Save, load, examples and autosave

**Files:**
- Create: `src/io/serialize.ts`, `src/io/examples.ts`, `src/state/autosave.ts`
- Test: `tests/serialize.test.ts`

**Interfaces Produces:**

```ts
// serialize.ts
export const FORMAT = 'digitalbox';
export const VERSION = 1;
export interface SaveData { format: 'digitalbox'; version: 1; name: string; savedAt: string; components: Component[]; wires: Wire[]; sim: { running: boolean; speed: number; timeUs: number; inputs: Record<string, number>; states: Record<string, State> }; view: View }
export type ParseResult = { ok: true; data: SaveData; warnings: string[] } | { ok: false; error: string };
export function toSaveData(args: { doc: Circuit; running: boolean; speed: number; snap: SimSnapshot; view: View }, now?: Date): SaveData;
export function serializeSave(data: SaveData): string;   // pretty JSON, 2 spaces
export function parseSave(text: string): ParseResult;
export function fileNameFor(name: string): string;       // `${slug}.digitalbox.json`, slug falls back to 'circuit'

// examples.ts
export interface Example { id: string; title: string; blurb: string; build: () => SaveData }
export const EXAMPLES: readonly Example[];   // "Half adder", "SR latch", "4-bit counter", "Blinking LED"

// autosave.ts
export const AUTOSAVE_KEY = 'digitalbox.autosave.v1';
export function readAutosave(storage?: Storage): string | null;   // null when unavailable or throws
export function writeAutosave(text: string, storage?: Storage): void;   // swallows errors
```

`parseSave` rules:
- The text must parse as JSON. Otherwise return `ok: false` with error "The file is not valid JSON."
- `format` must be `digitalbox`. `version` must be 1. Otherwise return `ok: false`.
- Unknown component types are an error, and the message lists them.
- A wire whose ends reference a missing part or pin, or whose widths differ, is dropped. Each drop adds one warning.
- Numeric props are normalised with `normalizeProps`.
- Sim values must be numbers. Other values are ignored with a warning.
- More than 5000 components is an error.

- [ ] **Step 1: Write the failing tests**

- `serializeSave` then `parseSave` round-trips components, wires, view and sim inputs.
- "rejects non-JSON": `parseSave('{')` returns `ok: false`.
- "rejects unknown version": version 2 returns `ok: false`.
- "reports unknown component types": the error lists the unknown type names.
- "drops dangling and width-mismatched wires and counts them": two wires dropped, two warnings.
- "ignores corrupted autosave": `readAutosave` with a storage whose `getItem` throws returns `null`, and `parseSave` of corrupted text is `ok: false`.
- Each example in `EXAMPLES` parses back with `ok: true`, and the half adder example gives `sum` = 1 for inputs 1 and 0 after a `Simulator` build and settle.

- [ ] **Step 2: Run and confirm failure**

- [ ] **Step 3: Implement**

Validate parsed JSON field by field, narrowing `unknown`. Build each example through `makeCircuit`-style helpers, with the same pin keys as the catalog.

- [ ] **Step 4: Run and confirm pass, then commit**

`feat(io): versioned JSON save, validated load, examples and autosave`

---

## Task 11: Render symbols and views

**Files:**
- Create: `src/render/symbols.tsx`, `src/render/ComponentView.tsx`, `src/render/WireView.tsx`, `src/render/Grid.tsx`, `src/render/sig.ts`
- Test: `tests/symbols.test.ts` (a coverage check only)

**Interfaces Produces:**

```ts
// sig.ts
export type SigClass = 'hi' | 'lo' | 'x' | 'z' | 'bus';   // single bit hi/lo; bus when width > 1 and fully known
export function sigClass(s: Sig, w: number): SigClass;
export function sigKey(s: Sig, w: number): string;         // stable text key for memoisation

// symbols.tsx
export interface PainterProps { type: string; props: Props; w: number; h: number; pin: (key: string) => Sig; inputValue: number; on: boolean; selected: boolean }
export const PAINTERS: Record<string, (p: PainterProps) => ReactElement>;   // one per DEFS type
export function Symbol(p: PainterProps): ReactElement;

// ComponentView.tsx
export const ComponentView: React.MemoExoticComponent<(p: { comp: Component; placed: PlacedPin[]; sigs: Record<string, Sig>; inputValue: number; on: boolean; selected: boolean; sigKey: string }) => ReactElement>;

// WireView.tsx
export const WireView: React.MemoExoticComponent<(p: { id: string; path: Pt[]; width: number; cls: SigClass; selected: boolean; conflict: boolean }) => ReactElement>;

// Grid.tsx
export function GridPattern(p: { zoom: number }): ReactElement;   // SVG pattern, `visibility` hidden below zoom 0.4
```

Painter families:
- `gate` for `and`, `or`, `nand`, `nor`, `xor`, `xnor`, `not` and `buf`. Inverting gates add a bubble of radius 4 at x 52 to 60.
- `tri` draws a triangle with an enable tab.
- `block` draws a labelled rounded box with the part name and pin labels. It is used for the memory, arithmetic, mux, decoder, splitter and merger families. Clock pins get a small triangle.
- `source` draws the switch lever, the button cap, the clock wave, the constant digit, VCC and ground symbols, and the resistor zigzag for pull-ups.
- `sink` draws the LED disc in its colour with glow when `on`, the probe value, the seven-segment glyph, the bus monitor value text, and the buzzer waves when `on`.
- `note` draws wrapped text. `junction` draws a dot.

- [ ] **Step 1: Write the coverage test**

Assert that `Object.keys(PAINTERS)` contains every `DEFS` type. Import `PAINTERS` from `src/render/symbols.tsx`. The test runs in Node, so React only needs to import, not render.

- [ ] **Step 2: Run and confirm failure**

- [ ] **Step 3: Implement**

Pin dots are drawn by `ComponentView`, not the painters. A painter only draws the body and labels.

- [ ] **Step 4: Run and confirm pass, then commit**

`feat(render): SVG symbols for all 45 parts and memoised views`

---

## Task 12: Canvas, interaction helpers and keymap

**Files:**
- Create: `src/ui/interaction.ts`, `src/ui/keymap.ts`, `src/ui/Canvas.tsx`
- Test: `tests/interaction.test.ts`, `tests/keymap.test.ts`

**Interfaces Produces:**

```ts
// interaction.ts
export function screenToWorld(v: View, sx: number, sy: number): Pt;
export function worldToScreen(v: View, p: Pt): Pt;
export function zoomAt(v: View, nextZoom: number, sx: number, sy: number): View;   // clamps to 0.2..3, keeps the point under the cursor
export function fitView(box: { x0: number; y0: number; x1: number; y1: number } | null, width: number, height: number): View;   // 60 px padding; zoom 1 when empty
export function hitRadiusWorld(v: View, pointer: 'mouse' | 'touch' | 'pen'): number;   // 10 or 18 screen px, divided by zoom
export function nearestPin(c: Circuit, p: Pt, radius: number, exclude?: PinRef): { ref: PinRef; p: Pt; dir: Dir; width: number } | null;
export function wireAt(c: Circuit, p: Pt, radius: number): string | null;   // wire id, nearest first
export function marqueeHits(c: Circuit, rect: { x0: number; y0: number; x1: number; y1: number }): Selection;
export type PressAction = 'pan' | 'marquee' | 'move' | 'wire' | 'toggle' | 'select';
export function classifyPress(args: { target: 'pin' | 'component' | 'wire' | 'empty'; tool: Tool; button: number; space: boolean; pointer: 'mouse' | 'touch' | 'pen'; isInput: boolean }): PressAction;
export function dragExceeded(dx: number, dy: number, threshold?: number): boolean;   // default threshold 4 px

// keymap.ts
export type KeyCommand = 'undo' | 'redo' | 'delete' | 'rotate' | 'selectAll' | 'copy' | 'paste' | 'duplicate' | 'escape' | 'zoomIn' | 'zoomOut' | 'zoomReset' | 'fit' | 'toggleSnap' | 'save' | 'open' | 'help' | 'nudge' | 'cycle' | 'activate';
export function commandFor(e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }): KeyCommand | null;
export function nudgeFor(e: { key: string; shiftKey: boolean }): { dx: number; dy: number } | null;
```

Canvas notes:
- Pointer events use `setPointerCapture` on the SVG root. Hit testing runs in world space through the helpers above, not DOM hit testing.
- Wheel zooms at the cursor.
- Two active pointers pinch-zoom and pan at the same time.
- `pointercancel` ends any drag and clears transient state.
- A press on an input part (switch, button, word) toggles it on pointer up when the pointer did not drag. A push button is held high while the pointer is down.
- Dropping a wire on a wire calls `connectToWire`. Dropping on a pin calls `connectPins`. Anywhere else cancels the wire.
- Escape cancels a wire in progress.
- The canvas has `tabIndex=0` and `role="application"`. Tab cycles the selection when the canvas is focused.

- [ ] **Step 1: Write the failing tests**

- `screenToWorld` inverts `worldToScreen`.
- `zoomAt` keeps the world point under the cursor fixed.
- `zoomAt` clamps to 0.2 and 3.
- `fitView` of a box has the box's centre at the view centre.
- `nearestPin` respects the radius, and excludes the start pin.
- `classifyPress`: a pin gives `wire`, an empty canvas with `tool: 'pan'` gives `pan`, an empty canvas with `space: true` gives `pan`, and a touch on an empty canvas with `tool: 'select'` gives `marquee`.
- `dragExceeded` is false for 3 px and true for 5 px.
- `commandFor`: Ctrl+Z is `undo`, Ctrl+Shift+Z is `redo`, Ctrl+Y is `redo`, `r` is `rotate`, `?` is `help`, and Ctrl+S is `save`.
- `nudgeFor` gives 1 unit for arrows, and 10 units with Shift.

- [ ] **Step 2: Run and confirm failure**

- [ ] **Step 3: Implement the helpers**

- [ ] **Step 4: Implement Canvas.tsx**

Subscribe to `view`, `doc`, `selection`, `simVersion` and `tool`. Build `placedPins` per part, `routeWire` per wire, and sig values from `simulator`. Render with `GridPattern`, `ComponentView` and `WireView`. Draw the wire in progress and the marquee rectangle as overlays.

- [ ] **Step 5: Run and confirm pass, then commit**

`feat(ui): canvas with pan, zoom, selection, wiring and touch gestures`

---

## Task 13: Application shell, toolbox, inspector and bars

**Files:**
- Create: `src/ui/App.tsx`, `src/ui/TopBar.tsx`, `src/ui/Toolbox.tsx`, `src/ui/Inspector.tsx`, `src/ui/StatusBar.tsx`, `src/ui/SimController.tsx`, `src/ui/Menu.tsx`, `src/ui/Icons.tsx`
- Modify: `src/App.tsx` (re-export `ui/App`), `src/styles/global.css`

**Interfaces Produces:**
- `App` composes `TopBar`, `Toolbox`, `Canvas`, `Inspector`, `StatusBar`, `SimController`, `Dialogs` and `Tutorial`. Layout is CSS-driven: a sidebar at 960 px and wider, a bottom sheet in portrait under 960 px, and a left drawer in landscape under 520 px tall.
- Autosave: after each document change, write `serializeSave(toSaveData(...))` with `writeAutosave`, debounced 400 ms. On start, `readAutosave` and load the result with `parseSave` when `ok`. Show any warnings as a flash message.
- `SimController` runs a `requestAnimationFrame` loop while `running` is true. Each frame it calls `editor.getState().tick(min(dt, 100) * 1000 * speed)`.
- `Toolbox` lists `DEFS` filtered by category or search. A tap calls `addAt` at the view centre. A pointer drag shows a ghost and drops with `addAt` at the snapped world point. Items carry `data-testid="tool-item"`.
- `Inspector` shows a single part's props with controls from `def(type).props`, plus Rotate, Duplicate and Delete. Word inputs show their runtime value. Wires show their endpoints and width.
- `TopBar` has File (New, Open, Save, Examples), Edit (Undo, Redo, Copy, Paste, Select all, Delete), View (zoom in, zoom out, fit, grid snap, Select or Pan), Simulation (Run or Pause, Step, Reset, Speed) and Help. Elements that the tutorial targets carry `data-tour` attributes: `toolbox`, `canvas`, `run`, `file`.
- `StatusBar` shows sim state and time, component and wire counts, warnings, zoom and cursor position. It is hidden in landscape-compact layouts.

- [ ] **Step 1: Implement the shell and panels**

Use the store actions from Task 9 and the helpers from Task 12. Keep logic in the store. Components only read state and dispatch actions.

- [ ] **Step 2: Implement responsive CSS**

Use CSS variables for every colour. Set `touch-action: none` on the canvas. Keep touch targets at least 40 px. Set `body` background explicitly. Layout has a 16 px side gutter and no horizontal page scroll.

- [ ] **Step 3: Verify**

Run `npm run build`. Expected: exit code 0. The browser check follows in Task 15.

- [ ] **Step 4: Commit**

`feat(ui): app shell with toolbox, inspector, bars and responsive layout`

---

## Task 14: Tutorial and dialogs

**Files:**
- Create: `src/ui/tutorialSteps.ts`, `src/ui/Tutorial.tsx`, `src/ui/Dialogs.tsx`
- Test: `tests/tutorial.test.ts`

**Interfaces Produces:**

```ts
export interface TutorialSnap { parts: string[]; wires: { from: string; to: string }[]; ledLit: boolean; running: boolean }   // wire ends are "type.pin"
export function tutorialSnapshot(c: Circuit, ledLit: boolean, running: boolean): TutorialSnap;
export interface TutorialStep { id: string; title: string; body: string; target?: string; auto?: (s: TutorialSnap) => boolean; openToolbox?: boolean }
export const TUTORIAL_STEPS: readonly TutorialStep[];
// Order: welcome, toolbox, input, output, wire, run, gate, inspect, files, done.
// auto steps: toolbox (≥1 part), input (a switch exists), output (an LED exists), wire (switch.out to led.in), run (ledLit).
export function stepComplete(step: TutorialStep, s: TutorialSnap): boolean;   // auto steps check the snapshot; manual steps are always complete
```

Tutorial rules:
- It starts on first visit, when `digitalbox.tutorial.done.v1` is absent.
- Auto steps enable Next only when complete. Every step has Skip.
- The Help menu restarts the tutorial from step 0.
- Spotlight: the target element found by `data-tour` is outlined. The card is centred when there is no target.
- Steps that set `openToolbox` open the toolbox sheet or drawer on narrow screens.

- [ ] **Step 1: Write the failing tests**

- `tutorialSnapshot` finds a switch-to-LED wire by type.
- `stepComplete` for `wire` is false without the wire and true with it.
- `stepComplete` for `run` depends on `ledLit`.
- Manual steps are always complete.
- `TUTORIAL_STEPS` ends with the id `done` and has unique ids.

- [ ] **Step 2: Run and confirm failure**

- [ ] **Step 3: Implement**

`Tutorial.tsx` reads the store and calls `tutorialSnapshot` on each change. `Dialogs.tsx` provides the shortcuts list (from the spec's keyboard table), the About panel, the error panel and the examples chooser.

- [ ] **Step 4: Run and confirm pass, then commit**

`feat(ui): interactive first-visit tutorial and help dialogs`

---

## Task 15: Deployment, README and verification

**Files:**
- Create: `.github/workflows/pages.yml`, `README.md`, `playwright.config.ts`, `e2e/smoke.spec.ts`

**Interfaces Produces:**
- Workflow: triggers on push to `main` and `ccr-6411cd06-bbym7b`, plus `workflow_dispatch`. Job `build` runs on Node 22 with `npm ci`, `npm test`, `npm run build`, and uploads `dist` with `actions/upload-pages-artifact`. Job `deploy` runs `actions/deploy-pages` with `pages: write` and `id-token: write`.
- `README.md` covers the features, the controls, the file format, development commands, and the GitHub Pages setup. The setup is Settings, then Pages, then Source "GitHub Actions". It also covers the alternative of publishing `dist` to a branch.
- `e2e/smoke.spec.ts` covers four checks: the page loads with no console errors; the tutorial shows on first visit; the toolbox has at least 40 `tool-item` entries; the "Half adder" example loads and the canvas holds parts. Run it with `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` if that is the binary path, otherwise find the path with `ls /opt/pw-browsers`.

- [ ] **Step 1: Write the workflow and README**

- [ ] **Step 2: Run the full check**

Run `npm run typecheck`, `npm test`, `npm run build`. Expected: all exit 0.

- [ ] **Step 3: Browser smoke test and screenshots**

Run `npx playwright test` with the Chromium path. Take screenshots at 1440×900, 390×844 portrait and 844×390 landscape into the scratchpad directory. Open each screenshot and check the layout by eye. Fix any overlap, clipping or horizontal scroll, then repeat steps 2 and 3.

- [ ] **Step 4: Commit**

`ci: GitHub Pages deployment; docs: README; test: browser smoke test`

---

## Task 16: Commit and open the pull request

**Files:** none new.

- [ ] **Step 1: Review the diff**

Run `git status` and `git diff --stat`. Check that no build output, `node_modules` or screenshot is staged.

- [ ] **Step 2: Push**

Run `git push -u origin ccr-6411cd06-bbym7b`. Retry network errors with 2, 4, 8 and 16 second waits.

- [ ] **Step 3: Open the pull request**

Use `mcp__github__create_pull_request` with `base: main` and `head: ccr-6411cd06-bbym7b`. Check for a PR template first. None exists in this repository, so write the body by hand. Describe the features, the verification run, and the decisions listed in the spec. End the body with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
