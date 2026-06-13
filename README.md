# Number Puzzles × Steroids

A single-file browser puzzle game inspired by [Proverbs](https://store.steampowered.com/app/2748080/Proverbs/)-style
**Fill-a-pix (Mosaic)** — with **sudoku** and **picross** puzzles woven directly into the same
canvas. Solve the cross-stitch board to reveal a hidden pixel-art painting, region by region.

No build, no server, no dependencies — open `index.html` in a browser and play.

**▶ Play it now: https://molnarmario.github.io/number-puzzles-x-steroids/**

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

### Difficulty — guessing is never required
**5 tiers** (Very Easy → Very Hard) scale clue density, free 0/9 moves, sudoku givens, jigsaw
irregularity and picross head starts all at once. Switching tiers re-weaves the clues *without
losing your progress*.

- **Very Easy / Easy / Medium** are solvable by plain neighbour-counting alone.
- **Hard / Very Hard** add *Advanced Deductions* (comparing overlapping clues) — explained by an
  in-game tutorial the first time you reach them.
- At **every** tier the board is provably solvable with no guessing — the generator reveals a few
  pre-stitched starter tiles wherever pure logic would stall.

### Quality of life
- **Play timer** in the header, from your first stitch.
- **Undo** (toolbar button or `Ctrl+Z`) — whole drag strokes, region completions and error
  sweeps all roll back as one step.
- **Local hints** — press `H`; it points at a forced move *near where you're working* and tells
  you the move (mark dark / light / compare an overlapping neighbour).
- **3×3 highlight** around the tile under your mouse/controller cursor.
- **Share** — export your whole canvas as a copy-pasteable code or a `.npxs` file, and import a
  friend's; the recipient's game replays the progress, completed regions and all.
- **Mistake forgiveness** (no game over), autosave per map, pan/zoom, and full **gamepad support**
  with remappable buttons.

---

## Controls

| Input | Action |
|---|---|
| Left click / `A` | stitch light (toggle) · cycle sudoku digit up · replay a finished region's quote |
| Right click / `B` | mark dark (toggle) · cycle sudoku digit down |
| Drag | paint multiple tiles |
| Wheel / `RB`·`LB` | zoom |
| Middle-drag, space-drag / right stick | pan |
| `Ctrl+Z` | undo |
| `H` | hint · `F` fit view · `Z` / `X` mark hovered tile light / dark |
| 🎮 button | controller status + button remapping |

---

## How a painting becomes a puzzle

Everything is generated deterministically (per-map seed) at load time:

1. **Image → answer.** Downscale to the board, adaptive-threshold (Otsu + local mean) into a
   two-tone light/dark painting; keep the art colours for the reveal.
2. **Edges → borders.** Build an edge-strength map and flood region seeds as a marker-controlled
   watershed, so borders settle along the picture's outlines.
3. **Texture.** Shelter a few flat pockets, then "weave" cross-stitch specks so no 3×3 is uniform
   except in those pockets (the only places 0/9 clues can live).
4. **Clues.** Every fill-a-pix number is the light-count of its region-clipped 3×3; every picross
   run is read off the painting; sudoku grids come from the seed.
5. **Solvability guarantee.** The clue pruner only keeps a set its own logic-solver can finish, and
   reveals starter givens wherever logic would stall — for *any* image, shape or region layout.

`verify-puzzle.js` (run `node verify-puzzle.js`; needs the `_pixels.txt` dump) independently proves
the base Castle map solvable at every tier, with unique sudoku and line-solvable picross. Other
maps rely on the same in-engine guarantee, which holds structurally for any partition.

## Adding a map

Embed an image as a data URI and add an entry to the `MAPS` array in `index.html`:

```js
{ id: 'mymap', name: '🎨 My Map', src: IMG_SRC_3, seed: 12345 }
```

Omit `gw`/`gh` and the board auto-sizes to the image's aspect; plots auto-place; regions grow to
fit. Optionally add a `MAP_QUOTES['mymap']` table of region-id → quote.

## Dev tools (not shipped)

- `region-map.html` — a region inspector: renders each map's art with region borders and ids
  (`R`n region, `S`n sudoku, `P`n picross) plus each plot's home region, for assigning quotes.
  Built from `index.html` via `node _build_inspector.js`.
- `inspect-region.js` — per-region analysis (clue counts, the forced cross-clue subtractions a
  tier needs, a full step-by-step solve path).
