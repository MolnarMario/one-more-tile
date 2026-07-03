# Number Puzzles × Steroids

A single-file browser puzzle game inspired by [Proverbs](https://store.steampowered.com/app/2748080/Proverbs/)-style
**Fill-a-pix (Mosaic)** — with **sudoku** and **picross** puzzles woven directly into the same
canvas. Solve the cross-stitch board to reveal a hidden pixel-art painting, region by region.

No build, no server, no dependencies — open `index.html` in a browser and play.

**▶ Play it now: https://molnarmario.github.io/number-puzzles-x-steroids/**

> New here and want the full engineering rundown (architecture, data flow, key globals, where the
> seams are)? See **[CLAUDE.md](CLAUDE.md)** — a map of the codebase written for a new person or AI.

---

## What's inside

### Multiple paintings, each its own puzzle
Pick a **map** from the toolbar dropdown — each is a different painting turned into its own
puzzle, with **separate, autosaved progress**. Drop in any pixel-art image and the generator
builds a fitting puzzle around it:

- **The board's shape follows the image.** A wide painting makes a wide board, a square one a
  square board — derived from the image's aspect ratio at a roughly constant cell budget, so
  every puzzle is a similar size.
- **Region borders follow the picture.** Regions are grown as a *content-aware watershed* along
  the image's edges, so finishing a region reveals a coherent chunk of the art (a boat, a
  character) rather than an arbitrary blob.
- **Sudoku/picross are scattered to fit** each board, and each is attached to a "home" region.

### Three puzzle types on one canvas
- **Fill-a-pix core** — each numbered clue counts the light tiles in the 3×3 block centred on it
  (itself included). Clues never count across a region border or into a plot.
- **Sudoku plots** — square patches played as sudoku (4×4 up to 9×9), several with irregular
  **jigsaw boxes**. Click a tile and type a digit (or click to cycle).
- **Picross patches** — nonograms whose solution *is* the painting. Hover near one and its run
  clues appear; stitch with the usual light/dark controls.

### Characters & quotes
On character maps, each **home region is a character**. Complete a region *and* the
sudoku/picross attached to it, and that character greets you with a line in a dialogue box.
**Click a finished region again** to replay its quote. Quotes are an easy-to-edit table in the
source (`MAP_QUOTES`), keyed by region id — add maps and lines freely.

### Difficulty — nothing pre-filled, guessing never required
**5 tiers** (Very Easy → Very Hard) scale clue density, free 0/9 moves, sudoku givens, and jigsaw
irregularity all at once. Switching tiers re-weaves the clues *without losing your progress*.

- **Very Easy / Easy / Medium** are solvable by plain neighbour-counting alone.
- **Hard / Very Hard** add *Advanced Deductions* (comparing overlapping clues) — explained by an
  in-game tutorial the first time you reach them.
- **Every tile is yours to stitch — the board is never pre-filled.** At every tier the puzzle is
  provably solvable by pure logic, achieved by *repairing the texture* rather than revealing
  answers: before any clue is shown, the generator flips a handful of stitch pixels so the board
  falls to logic on its own (details below). No starter tiles, no head-starts, no guessing.

### The loading screen shows the puzzle being built
Instead of a plain progress bar, the load animates the real generation on the board: the
**territories bloom in** with their borders and plots, every square runs a **"compute shimmer"** of
flickering digits, then a sweep **thins down to the real clues**. It's spoiler-safe (the shimmer is
random digits, not the true counts) and it runs on the idle main thread while the clues are computed
in a background worker, so it's essentially free. A slim **progress bar** in the top card shows the
real clue-thinning progress, and you can **scroll to zoom** the board while it loads. Bigger maps
(more to compute) get a slower, more deliberate reveal.

### Quality of life
- **Play timer** in the header, from your first stitch.
- **Undo** (toolbar button or `Ctrl+Z`) — whole drag strokes, region completions and error
  sweeps all roll back as one step.
- **Local hints** — press `H`; it points at a forced move *near where you're working* and tells
  you the move (mark dark / light / compare an overlapping neighbour).
- **3×3 highlight** around the tile under your mouse/controller cursor.
- **Share** — export your whole canvas as a copy-pasteable code or a `.npxs` file, and import a
  friend's; the recipient's game replays the progress, completed regions and all.
- **Multiplayer** — local split-screen co-op (up to 4) and online co-op/watch (both peers must be
  on the same version). In an online session you can keep the shared board as your own solo save.
- **Mistake forgiveness** (no game over), autosave per map, pan/zoom, and full **gamepad support**
  with remappable buttons.

---

## Controls

| Input | Action |
|---|---|
| Left click / `A` | stitch light (toggle) · cycle sudoku digit up · replay a finished region's quote |
| Right click / `B` | mark dark (toggle) · cycle sudoku digit down |
| Drag | paint multiple tiles |
| Wheel / `RB`·`LB` | zoom (works during the loading animation too) |
| Middle-drag, space-drag / right stick | pan |
| `Ctrl+Z` | undo |
| `H` | hint · `F` fit view · `+`/`−` zoom · `Z` / `X` mark hovered tile light / dark |
| 🎮 button | controller status + button remapping |

---

## How a painting becomes a puzzle

Everything is generated deterministically (per-map seed) at load time:

1. **Image → answer.** Downscale to the board, adaptive-threshold (Otsu + local mean) into a
   two-tone light/dark painting (`sol`); keep the art colours (`cellCol`) for the reveal.
2. **Edges → borders.** Build an edge-strength map and flood region seeds as a marker-controlled
   watershed, so borders settle along the picture's outlines. (Hand-authored maps supply their
   partition directly instead.)
3. **Texture.** Shelter a few flat pockets, then "weave" cross-stitch specks so no 3×3 is uniform
   except in those pockets (the only places 0/9 clues can live).
4. **Repair to solvable.** `repairTexture()` runs the counting solver over each region (and a line
   solver over each picross patch) and, wherever they'd stall on a genuinely ambiguous spot, flips
   a few `sol` pixels to break the ambiguity — until every region falls to basic counting and every
   picross to line logic **with no pre-filled cells**. This is why the board is never seeded with
   answers, on any tier. `sol` is frozen after this step.
5. **Clues.** Every fill-a-pix number is the light-count of its region-clipped 3×3; every picross
   run is read off the painting; sudoku grids come from the seed. The clue pruner then removes as
   many clues as its own logic-solver can still finish without (fewer = harder tier).

### Verifying solvability
Open **`index.html?audit=1`** (or run `await auditGivens()` in the console). It rebuilds every map ×
every difficulty and asserts: **zero pre-filled cells**, every region solvable from the shipped
clues at that tier's technique level, and every picross line-solvable. The page title flips to
`AUDIT PASS`/`AUDIT FAIL` (headless-friendly). *(The older Node harnesses `verify-puzzle.js` and
`inspect-region.js` predate the no-givens rework and cover only the base Castle map — the in-browser
audit supersedes them.)*

---

## Adding a map

Two ways:

**By hand** — embed an image as a data URI and add an entry to the `MAPS` array in `index.html`:

```js
{ id: 'mymap', name: '🎨 My Map', src: IMG_SRC_3, seed: 12345 }
```

Omit `gw`/`gh` and the board auto-sizes to the image's aspect; plots auto-place; regions grow to
fit. Optionally add a `MAP_QUOTES['mymap']` table of region-id → quote.

**With the editor** — open `region-editor.html`, load an image, draw region borders (the tool
auto-detects each region, auto-places the sudoku/picross plots, and lets you attach a quote per
region), and **Export** a `.npxsmap.json`. Then bake it into the game:

```sh
node _bake_map.js mymap.npxsmap.json --name "🎨 My Map"
```

This inserts the image, a `HAND_LAYOUTS` partition, a `MAPS` entry and any quotes into `index.html`.

---

## Debug flags

- **`?audit=1`** — run the solvability audit across all maps × tiers (see above); skips normal boot.
- **`?nowork=1`** — force clue generation to run synchronously on the main thread instead of in the
  Web Worker (handy for headless testing / debugging).

## Dev tools (not shipped)

Built from `index.html` so they reuse the game's *exact* generation code — rerun the builder after
changing the relevant part of `index.html`:

- **`region-editor.html`** — the map authoring editor described above.
  Built by `node _build_editor.js` (from `index.html` + `_editor.src.js`).
- **`region-map.html`** — a region inspector: renders each map's art with region borders and ids
  (`R`n region, `S`n sudoku, `P`n picross) plus each plot's home region, for assigning quotes.
  Built by `node _build_inspector.js`.
- **`_bake_map.js`** — bakes an exported `.npxsmap.json` into `index.html` as a built-in map.
- **`verify-puzzle.js` / `inspect-region.js`** — legacy Castle-only Node analysis harnesses,
  superseded by `?audit=1` (kept for reference).

## Deploying

The live site is GitHub Pages (deploy-from-branch, `master` root, with a `.nojekyll` marker). A push
to `master` triggers the GitHub-managed "pages build and deployment" workflow. **Pages deploys one
at a time**, so avoid triggering concurrent deployments (empty re-trigger commits or explicit build
requests) — they make the deploy job fail with *"Deployment failed, try again later."* One clean
push per change; if a deploy flakes transiently, re-run *that* workflow run rather than pushing more.
`APP_VERSION` (top of the `index.html` script, echoed bottom-right) tracks the shipped version and
must match between online-multiplayer peers; keep it in sync with `CHANGELOG.md`.
