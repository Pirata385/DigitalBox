# DigitalBox: Digital Circuit Sandbox Design

Date: 2026-10-08
Branch: `ccr-6411cd06-bbym7b`
Status: Written for implementation. See section 12 for the decisions taken without an interactive approval round.

## 1. Intent and success criteria

**Who:** students and hobbyists learning digital logic.

**Outcome:** a browser-only sandbox where the user places parts on a free-form canvas, wires them, runs the circuit, and watches signals change in real time. Circuits save and reload as JSON. An in-app tutorial teaches the basics.

**Success criteria**

1. Every requirement in the brief is met: canvas, toolbox, save/load, responsive UI, tutorial, Pages deployment, README.
2. The catalog holds at least 30 distinct parts. This design has 45.
3. The engine is correct for combinational and sequential logic, and tests cover it.
4. The layout works on desktop, phone portrait and phone landscape, with mouse, touch and keyboard.
5. `vite build` produces static files that deploy to GitHub Pages without a server.

**Assumptions (stated, not asked)**

- Stack: React 19, TypeScript, Vite, Zustand, SVG rendering.
- Dark theme only.
- Buses: pins carry words of 1 to 16 bits. Both ends of a wire must have the same width.
- Logic values are 0, 1, X (unknown or conflict) and Z (floating or high-impedance).
- Zero-delay simulation. Clocks are the only time source.
- JSON files are the source of truth. localStorage autosave is a per-viewer convenience only.
- English UI only.

## 2. Approaches considered

**Rendering**

- **A. React + SVG + custom engine (chosen).** Declarative and easy to style. Accessible. Hit testing runs in world coordinates, so touch and mouse share one code path. Handles hundreds of parts when components are memoised.
- **B. Raw Canvas 2D, immediate mode.** Fastest at large scale. More code for hit testing, text and focus, and weaker accessibility. Scale beyond a few thousand parts is not a target.
- **C. Node-editor library (React Flow).** Gives pan and zoom for free. It imposes its own edge routing and handle model, adds bundle weight, and makes multi-bit pins and the required touch behaviour harder to match.

**Simulation**

- **1. Event-driven three-valued delta-cycle simulation (chosen).** Supports memory, clocks and buses.
- **2. Truth tables only.** Cannot express memory, clocks or buses. Rejected.
- **3. Analog simulation.** Out of scope.

**Recommendation:** A and 1.

## 3. Architecture

```
src/
  main.tsx, App.tsx
  model/     types.ts        Circuit, Component, Wire, PinRef
             circuit.ts      pure edits: add, move, rotate, delete, connect, splitWire, prune, paste
             geometry.ts     rotation, pin world positions, orthogonal routing, hit tests
             history.ts      undo/redo snapshots
  sim/       signal.ts       three-valued bit-vector ops and driver resolution
             netlist.ts      union-find over pins -> nets
             simulator.ts    engine: settle, clocks, edges, step, reset, snapshot/restore
             behaviors.ts    per-type behaviour (source, comb, latch, ff)
  catalog/   categories.ts   category ids and labels
             defs.ts         the 45 ComponentDef records (layout, props, tooltip, behaviour key)
             registry.ts     lookup helpers
  render/    symbols.tsx     SVG painters, shared by canvas and toolbox icons
             WireView.tsx, ComponentView.tsx, Grid.tsx
  state/     store.ts        Zustand: document, history, selection, view, runtime inputs, UI flags
             autosave.ts     localStorage convenience
  io/        serialize.ts    save format, validation, import report
             examples.ts     built-in example circuits
             download.ts     Blob download and file read
  ui/        Canvas.tsx      pointer, touch and keyboard interaction; viewport
             Toolbox.tsx, Inspector.tsx, TopBar.tsx, StatusBar.tsx, MenuButton.tsx
             Dialogs.tsx     help and shortcuts, open-error report
             Tutorial.tsx, tutorialSteps.ts
  styles/    global.css
tests/       *.test.ts (vitest, Node environment, no DOM)
e2e/         smoke.spec.ts (Playwright, run locally against system Chromium)
```

**Boundaries.** `sim/` and `model/` import nothing from React or the DOM, so they test in Node. `catalog/` defines each part once. `render/symbols.tsx` draws it. `state/store.ts` owns the document. `ui/` reads the store and the engine.

## 4. Data model

```ts
type Rot = 0 | 90 | 180 | 270;
interface PinRef { component: string; pin: string }
interface Component { id: string; type: string; x: number; y: number; rot: Rot; props: Record<string, number | string | boolean> }
interface Wire { id: string; from: PinRef; to: PinRef }
interface Circuit { name: string; components: Component[]; wires: Wire[] }
```

- **Coordinates:** world units are CSS px at zoom 1. The grid is 10 px. A component's origin is the top-left corner of its unrotated box. Rotation is about the box centre. Pins sit at multiples of 10 from the origin. The junction's box is centred on its origin.
- **Document (undoable):** components and wires. Props that change structure are part of the document.
- **Runtime (not undoable):** switch, button and word-input values, the clock time, running flag and speed, and each stateful element's state. It is exported under `sim` in the save file.

## 5. Signal model (`sim/signal.ts`)

A value of width `w` is `{ v, x, z }`, three bit masks.

- `x` marks unknown bits. `z` marks floating bits. `v` holds the known values.
- `x` and `z` are disjoint. `v` is zero wherever `x` or `z` is set.
- Gate inputs treat Z as X.
- AND, OR, XOR and NOT follow the usual three-valued rules per bit. `0 AND X = 0`, `1 OR X = 1`, and anything else unknown is X.
- Driver resolution, per bit: Z drivers are ignored. If all driving values agree, the net takes that value. Any disagreement or X gives X and raises a conflict warning. No driver gives Z.
- Weak drivers (pull-up and pull-down) apply only where no strong driver is active.
- Arithmetic (adders, comparators, counters) uses known integers. Any unknown input bit makes the whole result X.

## 6. Simulation semantics (`sim/simulator.ts`)

- **Nets.** Union-find over pins joined by wires. Each pin has a direction. `in` is a sink, `out` is a driver, `io` (junction) only joins nets.
- **Combinational settle.** Event-driven. An element is re-evaluated when one of its input nets changes. An event budget guards against oscillation. Exceeding it sets an oscillation warning and stops propagation.
- **Level-sensitive state.** Latches follow their enable. Asynchronous clear inputs on flip-flops act during settle.
- **Edge-triggered state.** Flip-flops, registers, counters and shift registers sample on a rising edge (0 to 1) of their clock net. All triggered elements sample their inputs before any state is applied. Then the engine re-settles and checks for new edges. This repeats up to 1000 phases.
- **Clocks.** A square wave at frequency `f`. Half period `hp = round(1e6 / (2f))` µs. Level at time `t` is `floor(t / hp) mod 2`. Edges occur at multiples of `hp`. `advance(us)` processes edges in time order, so no edge is lost at any frame rate.
- **Run and pause.** Clocks advance only while running. Input changes settle immediately in both states.
- **Step.** Advance to the next clock edge. With no clocks, re-settle.
- **Reset.** Time goes to 0, element states go to 0, clocks go to level 0.
- **Speed presets.** 0.25×, 0.5×, 1×, 2×, 4×. The real-time frame delta is capped at 100 ms.
- **Memory initialisation.** Memories start at 0. This is a teaching simplification. Real parts power up in an unknown state.

## 7. Component catalog (45 parts)

Pin names are the keys used in wires and in the save file.

| Category | Id | Name | Pins | Props |
|---|---|---|---|---|
| Inputs | `switch` | Toggle switch | out `out` | |
| Inputs | `button` | Push button | out `out` | held = 1 |
| Inputs | `clock` | Clock | out `out` | freq (0.5 to 100 Hz) |
| Inputs | `const0` | Constant 0 (LOW) | out `out` | |
| Inputs | `const1` | Constant 1 (HIGH) | out `out` | |
| Inputs | `word` | Word input | out `out` (bits) | bits 1 to 16; click increments |
| Outputs | `led` | LED | in `in` | color |
| Outputs | `probe` | Probe | in `in` (bits) | bits; shows 0/1/X/Z or hex |
| Outputs | `seghex` | 7-segment (hex) | in `in` (4) | |
| Outputs | `segraw` | 7-segment (a–g) | in `a`…`g` | |
| Outputs | `busmon` | Bus monitor | in `in` (bits) | bits 1 to 16; format hex/dec/bin |
| Outputs | `buzzer` | Buzzer | in `in` | |
| Gates | `not` | NOT | in `in0`, out `out` | bits |
| Gates | `buf` | Buffer | in `in0`, out `out` | bits |
| Gates | `and`, `or`, `nand`, `nor`, `xor`, `xnor` | Gates | in `in0`…`in{n-1}`, out `out` | inputs 2 to 8; bits 1 to 8 |
| Gates | `tri` | Tri-state buffer | in `in` (bits), `en`, out `out` (bits) | bits; out is Z when `en` = 0 |
| Memory | `sr` | SR latch (NOR) | in `s`, `r`; out `q`, `qn` | level-sensitive |
| Memory | `dlatch` | D latch | in `d`, `en`; out `q`, `qn` | transparent while `en` = 1 |
| Memory | `dff` | D flip-flop | in `d`, `clk`, `clr`; out `q`, `qn` | rising edge; `clr` async |
| Memory | `jkff` | JK flip-flop | in `j`, `clk`, `k`; out `q`, `qn` | rising edge |
| Memory | `tff` | T flip-flop | in `t`, `clk`; out `q`, `qn` | rising edge |
| Memory | `reg` | Register | in `d` (bits), `clk`, `en`, `clr`; out `q` (bits) | bits; `en` gates load |
| Memory | `counter` | Counter | in `clk`, `en`, `clr`; out `q` (bits), `tc` | bits; `tc` = all ones and `en` |
| Memory | `shift` | Shift register | in `ser`, `clk`, `clr`; out `q` (bits) | bits; shifts left, new bit at bit 0 |
| Arithmetic | `ha` | Half adder | in `a`, `b`; out `s`, `c` | |
| Arithmetic | `fa` | Full adder | in `a`, `b`, `cin`; out `s`, `cout` | |
| Arithmetic | `adder` | N-bit adder | in `a`, `b` (bits), `cin`; out `s` (bits), `cout` | bits 1 to 16 |
| Arithmetic | `cmp` | Equality comparator | in `a`, `b` (bits); out `eq` | bits 1 to 16 |
| Mux and decode | `mux2` | 2:1 multiplexer | in `i0`, `i1`, `s`; out `y` | bits |
| Mux and decode | `mux4` | 4:1 multiplexer | in `i0`…`i3`, `s0`, `s1`; out `y` | bits |
| Mux and decode | `demux4` | 1:4 demultiplexer | in `d`, `s0`, `s1`; out `y0`…`y3` | |
| Mux and decode | `dec24` | 2-to-4 decoder | in `a0`, `a1`, `en`; out `y0`…`y3` | |
| Buses | `split` | Bus splitter | in `in` (n), out `b0`…`b{n-1}` | n 2 to 8 |
| Buses | `merge` | Bus merger | in `b0`…`b{n-1}`, out `out` (n) | n 2 to 8 |
| Buses | `junction` | Junction | io `p` (bits) | bits |
| Power | `vcc` | VCC | out `out` | constant 1 |
| Power | `gnd` | Ground | out `out` | constant 0 |
| Power | `pullup` | Pull-up resistor | out `out` (weak 1) | |
| Power | `pulldown` | Pull-down resistor | out `out` (weak 0) | |
| Misc | `note` | Text note | none | text |

Count: 6 inputs, 6 outputs, 9 gates, 8 memory, 4 arithmetic, 4 mux and decode, 3 buses, 4 power, 1 misc. Total 45.

## 8. Rendering

- One SVG root with a transform group for pan and zoom. The dot grid is an SVG pattern inside that group, so it moves with the world. It hides below zoom 0.4.
- Colours are CSS variables. HIGH emerald `#34d399`. LOW slate `#475569`. X amber `#f59e0b`, dashed. Z grey `#64748b`, dotted. Conflict rose `#fb7185`. Selection sky `#38bdf8`.
- Wires are orthogonal polylines. Each one leaves its pin with a 10 px stub in the pin's side direction, then uses elbows. Single-bit wires are 2 px wide. Buses are 3.5 px.
- Components are memoised. Equality is object identity plus a signature of their pin values.
- Pins are 3 px dots. Connected pins are filled. A snap target gets a highlight ring.

## 9. Interaction

**Mouse**

- Wheel zooms around the cursor.
- Left-drag on empty space draws a marquee in Select mode.
- Middle-drag, Space-drag or Pan mode pans.
- Click selects. Shift-click or Ctrl-click toggles.
- Dragging a selection moves it. With grid snap on, positions snap to 10 px.
- Dragging from a pin starts a wire. Dropping on a compatible pin connects it. Dropping on a wire inserts a junction at that point.
- Clicking a switch toggles it. Holding a push button sets it to 1.
- Clicking a word input increments it.

**Touch and pen**

- One finger on empty space pans, unless the Select tool is active.
- Two fingers pinch to zoom and pan together.
- Pins have an 18 px hit radius. Mouse uses 10 px.
- The Pan and Select toggle lives on the toolbar. Touch-only devices default to Pan.

**Keyboard**

| Keys | Action |
|---|---|
| Ctrl/Cmd+Z, Ctrl+Y or Ctrl+Shift+Z | Undo, redo |
| Delete, Backspace | Delete selection |
| R | Rotate selection 90° |
| Ctrl/Cmd+A, Ctrl/Cmd+C, Ctrl/Cmd+V, Ctrl/Cmd+D | Select all, copy, paste with offset, duplicate |
| Arrow keys (Shift for 10 px) | Nudge selection |
| Tab, Shift+Tab (canvas focused) | Cycle component selection |
| Enter, Space | Toggle a focused switch or button |
| Escape | Cancel wiring, clear selection |
| `+`, `-`, `0`, `F` | Zoom in, zoom out, reset zoom, fit to view |
| G | Toggle grid snap |
| Ctrl/Cmd+S, Ctrl/Cmd+O | Save, open |
| Space + drag | Pan |
| `?` | Shortcuts dialog |

## 10. Layout

- **Desktop (width at least 960 px).** Left Toolbox sidebar, 290 px, collapsible to a rail. Top bar. Canvas. Right Inspector, 280 px, shown when something is selected. Status bar at the bottom.
- **Phone portrait (width under 960 px, taller than wide).** Compact top bar. Toolbox as a bottom sheet with a drag handle. Collapsed it shows the header and tabs. Expanded it covers about 55% of the height. Inspector is a floating card at the top of the canvas.
- **Phone landscape (height under 520 px).** Toolbox is a left drawer overlay, at most 60% of the width and 320 px wide. Top bar is icon-only. Status bar is hidden.
- Touch targets are at least 40 px. Layout has a 16 px side gutter and no horizontal page scroll.

## 11. Persistence and I/O

**Save file** (`<name>.digitalbox.json`)

```json
{
  "format": "digitalbox",
  "version": 1,
  "name": "Half adder",
  "savedAt": "2026-10-08T12:00:00.000Z",
  "components": [],
  "wires": [],
  "sim": { "running": false, "speed": 1, "timeUs": 0, "inputs": {}, "states": {} },
  "view": { "zoom": 1, "panX": 0, "panY": 0 }
}
```

**Open.** The file is validated. Unknown component types are rejected and listed. Wires that reference a missing component or pin, or whose widths do not match, are dropped and counted. The dialog reports the count. Malformed JSON shows an error and never crashes the app.

**Autosave.** Debounced 400 ms to `localStorage` under `digitalbox.autosave.v1`. Restored on start when valid. Every access is wrapped in try/catch.

**New.** Clears the circuit after confirmation when the circuit is not empty.

## 12. Decisions taken without an interactive approval round

This session is autonomous, and the brief was complete. The brainstorming process calls for one question at a time and for user approval of the design and the plan. Neither was possible here. Instead, the most likely reading of the brief was taken and each choice above was recorded in this document, so the user can redirect any of them. Open choices include the component list, the 1 to 16 bit bus limit, zero-initialised memories, and the Pan and Select toolbar toggle.

## 13. Error handling and edge cases

- Changing props that alter pin layout prunes incompatible wires in one undoable step.
- Deleting a component removes its wires and its runtime state.
- Engine warnings (bus conflict, oscillation, floating input) appear as a badge in the status bar.
- Dropping a wire on the same pin it started from is ignored. Connecting two pins that are already wired is also ignored.
- Clipboard paste keeps only wires whose both ends were copied.
- WebAudio and localStorage failures are caught and ignored.

## 14. Testing strategy

- **Unit (vitest, Node).** Truth tables for every gate. Resolution of driver conflicts, tri-state buses and pull-ups. Engine behaviour: latch enable, flip-flop edge sampling, counter and shift sequences, oscillation detection, clock timing across frame sizes. Model operations: add, move, rotate, connect, split with junction, prune, delete, paste. Routing and hit tests. Save and load round trip and validation. Catalog consistency: every type has a layout, valid default props and a behaviour.
- **Browser smoke (Playwright, system Chromium, run locally).** The app loads. The tutorial appears on first visit. The toolbox holds at least 40 items. A switch and an LED can be added, wired and lit. Screenshots at desktop, portrait and landscape viewports are checked by eye.
- **Build.** `tsc --noEmit` and `vite build` must pass.

## 15. Deployment

`.github/workflows/pages.yml` runs on push to `main` and to the working branch. It installs, tests, builds and uploads `dist` with `actions/upload-pages-artifact`. It then deploys with `actions/deploy-pages`. Vite uses `base: './'`, so assets resolve under any repository path. The README explains that Pages must be set to source "GitHub Actions".

## 16. Out of scope

Waypoint editing for wires. Analog simulation. Hierarchical sub-circuits. Real-time collaboration. A light theme. Gate delays. Sound beyond a simple buzzer tone. Internationalisation.

## 17. Self-review

- **Placeholders.** None remain.
- **Consistency.** Gate inputs treat Z as X, as section 5 states. Pins sit on the grid, as section 4 states. Pin names in section 7 match the engine keys and the save format.
- **Scope.** One project. The plan splits it into modules, each with tests.
- **Ambiguity resolved.** Bus widths must match on each wire. X and Z propagation is defined. Clock presets and speed presets are listed. Memory initialisation is fixed at 0.
