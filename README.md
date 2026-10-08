# DigitalBox

An interactive sandbox for digital electronics. Place logic gates, flip-flops, counters, displays and inputs on a
free-form canvas, wire them together, and watch signals move through the circuit in real time.

DigitalBox runs entirely in the browser. It is a static site: there is no server, no account, and no upload. Circuits
are saved as plain JSON files that you keep on your own device.

## Features

- **45 parts** in nine categories: inputs, outputs, gates, memory, arithmetic, mux and decode, buses, power and passive,
  and a text note. Multi-bit buses run up to 16 bits wide.
- **Real-time simulation** with three-valued logic (0, 1, X and high-impedance Z), tri-state buses, pull-up and
  pull-down resistors, latches, edge-triggered flip-flops, counters and shift registers. Clocks run from 0.5 Hz to
  100 Hz. Speed presets run from 0.25× to 4×, and you can single-step to the next clock edge.
- **Warnings** in the status bar for bus conflicts, circuits that do not settle, and floating inputs.
- **Free-form editing**: drag parts, rotate them, multi-select, copy and paste, undo and redo (the last 200 changes),
  grid snap, and orthogonal wires that snap to pins. Dropping a wire onto another wire inserts a junction.
- **Touch and mouse**: pinch to zoom, two-finger pan, touch-friendly pin targets, and a toolbox that works as a bottom
  sheet on phones and as a drawer in landscape.
- **Save and open** as versioned `.digitalbox.json` files. The file keeps the circuit, its positions, the simulation
  state and the view. Your work is also autosaved in this browser.
- **Interactive tutorial** on first visit, restartable from the Help menu. A step that asks you to do something keeps
  Next disabled until you have done it.
- **Examples**: a half adder, an SR latch built from NOR gates, a 4-bit counter, and a blinking LED.

## Using it

### Mouse and touch

| Action | Mouse | Touch |
|---|---|---|
| Place a part | Click a tool, or drag it from the Toolbox onto the canvas | Tap a tool, or drag it onto the canvas |
| Select | Click; Shift or Ctrl adds to the selection | Tap; the Select tool turns on box selection |
| Box select | Drag on empty space (Select tool) | Drag on empty space with the Select tool on |
| Move | Drag a part | Drag a part |
| Wire | Drag from a pin to another pin, or onto a wire | Drag from a pin to another pin |
| Flip a switch | Click it | Tap it |
| Hold a push button | Press and hold | Press and hold |
| Pan | Middle-drag, Space-drag, or the Pan tool | Drag empty space, or use the Pan tool |
| Zoom | Mouse wheel, or the zoom buttons | Pinch |

### Keyboard

| Keys | Action |
|---|---|
| Ctrl/Cmd + Z; Ctrl/Cmd + Shift + Z or Ctrl + Y | Undo; redo |
| Delete or Backspace | Delete the selection |
| R | Rotate the selection 90° |
| Ctrl/Cmd + A, C, V, D | Select all; copy; paste; duplicate |
| Arrow keys (Shift for 10 px) | Nudge the selection |
| Tab and Shift + Tab | Cycle through parts (canvas focused) |
| Enter | Flip the selected switch, or count up a word input |
| Escape | Cancel a wire in progress, or clear the selection |
| + / −, 0, F | Zoom in, zoom out, reset zoom, fit to view |
| G | Toggle grid snap |
| Ctrl/Cmd + S, O | Save; open |
| ? | Show the shortcut list |

## Simulation model

- Logic is zero-delay. A change propagates through gates until the circuit settles.
- Memory elements start at 0, and their complement outputs start at 1. Real parts power up in an unknown state, so
  this is a teaching simplification.
- An input that nothing drives reads as X. A wire with no driver is counted as a floating input in the status bar.
- Two drivers on one net that disagree make the net X, and the status bar reports a conflict.
- A circuit that does not settle (for example a ring of three NOT gates) is reported as an oscillation, and the
  simulation keeps running.

## Save file format

```json
{
  "format": "digitalbox",
  "version": 1,
  "name": "My first circuit",
  "savedAt": "2026-10-08T12:00:00.000Z",
  "components": [
    { "id": "c1", "type": "switch", "x": 0, "y": 0, "rot": 0, "props": {} },
    { "id": "c2", "type": "led", "x": 160, "y": 0, "rot": 0, "props": {} }
  ],
  "wires": [{ "id": "w1", "from": { "component": "c1", "pin": "out" }, "to": { "component": "c2", "pin": "in" } }],
  "sim": { "running": false, "speed": 1, "timeUs": 0, "inputs": { "c1": 1 }, "states": {} },
  "view": { "zoom": 1, "panX": 0, "panY": 0 }
}
```

When you open a file, the app checks every field. Unknown part types are reported by name. Wires that refer to a
missing part or pin, or that join pins of different widths, are dropped and counted in the message bar. Malformed
JSON is reported and never crashes the app.

## Development

Requires Node.js 22 or later.

```bash
npm ci            # install dependencies
npm run dev       # start the development server
npm test          # run the unit tests (Vitest)
npm run typecheck # check types
npm run build     # type-check, then build the static site into dist/
npm run preview   # serve dist/ locally
npm run e2e       # browser tests against the production build (Playwright)
```

The browser tests use Playwright. If Playwright cannot download its own browser, point it at an installed Chromium:

```bash
CHROMIUM_PATH=/path/to/chrome npm run e2e
```

### Project layout

```
src/
  sim/        three-valued signals, netlist, simulator, combinational and sequential behaviour
  catalog/    the 45 part definitions: pins, layouts, properties
  model/      circuit data, geometry and routing, undo history
  io/         save format, examples, file helpers
  state/      the Zustand editor store and autosave
  render/     SVG symbols, wire and part views, grid
  ui/         canvas, toolbox, inspector, bars, tutorial, dialogs
tests/        unit tests for every non-visual module
e2e/          browser smoke and layout tests
docs/superpowers/   the design spec and the implementation plan
```

## Deploying to GitHub Pages

The site is static, so GitHub Pages can host it directly. The workflow in `.github/workflows/pages.yml` builds the app
and deploys it on every push to `main` and to `ccr-6411cd06-bbym7b`.

1. Push this repository to GitHub.
2. Open **Settings → Pages**. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push a commit, or run the **Deploy to GitHub Pages** workflow manually from the **Actions** tab.
4. When the `deploy` job finishes, the site is live at `https://<your-user>.github.io/<repository>/`.

The build uses relative asset paths, so the site works from any repository path without configuration.

If the `deploy` job reports that the branch is not allowed to deploy, add the branch under **Settings → Environments →
github-pages → Deployment branches**.

### Publishing without Actions

If you prefer a branch to Actions, build locally and push the `dist` folder as the root of a `gh-pages` branch:

```bash
npm ci && npm run build
cd dist
git init -q -b gh-pages && git add -A && git commit -qm "Deploy site"
git push -f "$(git -C .. remote get-url origin)" gh-pages:gh-pages
cd .. && rm -rf dist/.git
```

Then set **Settings → Pages → Source** to **Deploy from a branch**, with the `gh-pages` branch and the root folder.

## Limits

- Circuits are simulated in the browser, so very large circuits (several thousand parts) may slow down.
- The autosave copy lives in this browser only. Save a file to keep a circuit safely.
- The simulation is logical rather than electrical. It has no propagation delay and no analogue behaviour.
