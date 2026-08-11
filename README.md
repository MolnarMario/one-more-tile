# One More Tile: The Emergent Canvas

A single-file browser puzzle game inspired by [Proverbs](https://store.steampowered.com/app/2748080/Proverbs/)-style
**Fill-a-pix (Mosaic)** — with **sudoku** and **picross** puzzles woven directly into the same
canvas. Solve the cross-stitch board to reveal a hidden pixel-art painting, region by region.

No build, no server, no dependencies — open `index.html` in a browser and play. (Keep the small
`boards/` folder next to it for instant loading; without it the game just builds each canvas itself,
the slow way.)

**▶ Play it now: https://molnarmario.github.io/one-more-tile/**

> New here and want the full engineering rundown (architecture, data flow, key globals, where the
> seams are)? See **[CLAUDE.md](CLAUDE.md)** — a map of the codebase written for a new person or AI.

---

## What's inside

### A home menu, then multiple paintings
The game opens on a **home menu** — a vertical stack of buttons: **Single Player · Co-op ·
Continue · Options · Credits**. **Single Player** and **Co-op** lead to a **grid of canvas cards**
(each shows its region lines, and its region/square counts on hover); **Continue** drops you back
into your most recently played single-player canvas. Reopen the menu any time with the **🏠 Menu**
button in the toolbar. Each map is a different painting turned into its own puzzle, with
**separate, autosaved progress**. Drop in any pixel-art image and the generator builds a fitting
puzzle around it:

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
**5 tiers** (Very Easy → Very Hard) scale clue density, free 0/9 moves, sudoku givens, jigsaw
irregularity **and the picross patches** all at once. Switching tiers re-weaves the clues *without
losing your progress*.

- **Very Easy / Easy / Medium** are solvable by plain neighbour-counting alone.
- **Hard / Very Hard** add *Advanced Deductions* (comparing overlapping clues) — explained by an
  in-game tutorial the first time you reach them.
- **The picross patches scale too.** A nonogram's numbers *are* its answer, so there are no clues to
  hide — instead each patch is redrawn to demand the right amount of deduction, measured in how many
  full row-and-column passes it takes to crack from blank: **1–2 on Very Easy, around 8 on Very
  Hard**. Every patch stays solvable by pure line logic at every tier. Start stitching into a patch
  and it's left alone if you change difficulty — only untouched ones are redrawn.
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

**Mostly, you don't sit through it at all.** Every canvas ships **already generated**. The puzzles
were always identical for everyone — each canvas is built deterministically from its own seed — so
rather than have every player recompute the same bytes (between a second and *35 seconds* per canvas
per difficulty), that work is done once, ahead of time, and shipped with the game. On the biggest
canvas the stages it replaced now take **1.4 ms**, so the only thing you wait for is the loading
animation itself. Boards you've played are also
kept on your machine, which covers anything not shipped — a custom canvas, or one built before an
update. Either way the game re-checks every clue against the solution before trusting it, so a
restored board is identical to a freshly generated one, and your stitches are never affected.

### Finished a canvas? Weave it again
Every canvas ships with one fixed puzzle, the same for everyone. When you want a different one from
the same painting, pick **🎲 New weave** in the ⋯ menu: the artwork, its regions and its plots stay
exactly where they are, and a **completely new puzzle** is woven across them — new solution, new
clues, new sudoku and picross. This is the one board that isn't shipped ready-made, so it's built on
the spot and you'll see the full loading screen while it happens.

Your progress on the original isn't touched — each weave keeps its own save. **Back to the original**
in the same dialog returns you to it exactly as you left it, and you can switch back again whenever
you like. The canvas grid and the header mark a rewoven board `· new weave` so you always know which
puzzle you're on, and share codes carry the weave with them so a friend gets *your* board, not the
shipped one.

### Quality of life
- **Play timer** in the header — per canvas, and it *remembers your time*: leave and come back and
  it resumes where it stopped. It counts only active time (pauses when you open the menu, switch
  maps, background the tab or close the page; resumes on your next stitch).
- **Undo** (toolbar button or `Ctrl+Z`) — whole drag strokes, region completions and error
  sweeps all roll back as one step.
- **Local hints** — press `H`; it points at a forced move *near where you're working* and tells
  you the move (mark dark / light / compare an overlapping neighbour).
- **3×3 highlight** around the tile under your mouse/controller cursor.
- **Share** — export your whole canvas as a copy-pasteable code or a `.npxs` file, and import a
  friend's; the recipient's game replays the progress, completed regions and all.
- **Multiplayer** — local split-screen co-op (up to 4) and online co-op/watch (both peers must be
  on the same version). In an online session you can keep the shared board as your own solo save.
- **Options** (⚙ in the toolbar or on the home menu) — recolour the whole interface from a palette
  of presets or a hue slider (default purple), mute/adjust the music, set your default difficulty
  (Medium), and open **controller setup**.
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
| **Touch** — one finger | stitch/drag with the current brush · tap a sudoku cell to select (tap again cycles) · tap a finished region to replay its quote |
| **Touch** — two fingers | pan + pinch-zoom |
| 💡/⬛ brush button | (touch) flip what a tap places between light and dark |

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
5. **Shape the picross patches to the tier.** A nonogram has no redundant clues to prune, so
   `shapePicross()` instead redraws each patch's interior — a seeded hill-climb toward that tier's
   target run structure and solving depth, accepting only grids that stay fully line-solvable. It
   works from the patch's post-repair interior every time, so a patch depends only on
   (map, seed, tier). This is the one place `sol` changes after step 4, and it's safe because a
   patch is an island: no fill-a-pix clue can reach into a plot, and the revealed art comes from
   `cellCol`, not `sol`.
6. **Clues.** Every fill-a-pix number is the light-count of its region-clipped 3×3; every picross
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
- **`?bake=<map>`** — regenerate the shipped precomputed board payload for those maps (see below).
- **`?verifybake=<map>`** — rebuild those maps for real and assert the shipped payload is
  byte-identical. Run it after every re-bake.
- **`?nowork=1`** — force clue generation to run synchronously on the main thread instead of in the
  Web Worker (handy for headless testing / debugging).
- **`?nocache=1`** — bypass the shipped payload *and* the stored-board cache and force a real, cold
  build. (`?audit=`, `?bake=` and `?verifybake=` do the same, so they always exercise genuine
  generation.)

`?audit=`, `?bake=` and `?verifybake=` all take a comma-separated map list (`?audit=angels,castle`;
`1` or `all` means every map). A whole-registry run takes hours — shard it one map per browser tab
and read the verdict off each tab's title.

## Dev tools (not shipped)

Built from `index.html` so they reuse the game's *exact* generation code — rerun the builder after
changing the relevant part of `index.html`:

- **`region-editor.html`** — the map authoring editor described above.
  Built by `node _build_editor.js` (from `index.html` + `_editor.src.js`).
- **`region-map.html`** — a region inspector: renders each map's art with region borders and ids
  (`R`n region, `S`n sudoku, `P`n picross) plus each plot's home region, for assigning quotes.
  Built by `node _build_inspector.js`.
- **`_bake_map.js`** — bakes an exported `.npxsmap.json` into `index.html` as a built-in map.
- **`_bake_boards.js`** — folds the `?bake=` payloads into `index.html` + `boards/`, so canvases
  ship already generated. Re-run it (and then `?verifybake=`) after **any** change to generation —
  otherwise the shipped boards no longer match the code that makes them. The payloads are produced
  in the browser rather than in Node on purpose: generation starts with a canvas draw, so a Node
  reimplementation would defeat the whole point of the bake being the real output.
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
