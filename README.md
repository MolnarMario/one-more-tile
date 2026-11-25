<h1 align="center">One More Tile</h1>

<p align="center">
  <b>A cross-stitch logic puzzle that paints a picture as you solve it.</b><br>
  Fill-a-pix clues cover the canvas, with sudoku and picross patches woven
  in. Every region you finish uncovers a piece of a hidden pixel-art
  painting. Solo, in co-op or in versus, in your browser, with nothing to
  install.
</p>

<p align="center">
  <a href="https://tile.thebarbellengineer.com/"><b>Play it now</b></a> ·
  <a href="https://thebarbellengineer.com/projects/one-more-tile/">Project page</a> ·
  <a href="#how-to-play">How to play</a> ·
  <a href="RELEASE-NOTES.md">Release notes</a> ·
  <a href="LICENSE">MIT license</a>
</p>

<p align="center">
  <img src="https://thebarbellengineer.com/assets/img/tile-1600.webp" alt="A One More Tile canvas, half solved, with the painting showing through the finished regions" width="720">
</p>

## Why

I loved the cross-stitch puzzles in
[Proverbs](https://store.steampowered.com/app/2748080/Proverbs/) and wanted
more of them, with two things they didn't have: a reward you can see as you
go, and a promise that you never have to guess. Here the solution is a
painting, so every finished region shows a recognisable piece of it, and
every board at every difficulty is checked to be solvable by logic alone.

## What it does

### Three puzzles on one canvas

- **Fill-a-pix** covers the board. Each number counts the light tiles in the
  3×3 block around it, itself included, and clues never count across a region
  border.
- **Sudoku patches**, 4×4 up to 9×9, some with irregular jigsaw boxes.
- **Picross patches** whose solution is part of the painting. Hover near one
  to see its run clues.

### A painting, region by region

- **Regions follow the picture.** They are grown along the painting's own
  edges, so a finished region shows a boat or a face, not a random blob.
- **Ten paintings**, each with its own autosaved progress and a play timer
  that remembers your time.
- **Characters with something to say.** On character maps, finishing a
  region and its patches makes that character speak. Click the region again
  to replay the line.
- **New weave.** Finished a canvas? **🎲 New weave** builds a completely new
  puzzle over the same painting, with its own save.

### Never a guess

- **Five difficulty tiers**, Very Easy to Very Hard. The easier three need
  only neighbour counting; Hard and Very Hard add comparing overlapping
  clues, with a short tutorial the first time.
- **Nothing is ever pre-filled**, on any tier, and an audit checks that every
  region of every painting solves from its clues alone.
- **Hints near where you're working.** Press `H` and it points at a forced
  move close to your cursor and says why it's forced.
- **No game over.** Mistakes are forgiven, and **Undo** takes back whole drag
  strokes.

### Play together

- **Co-op**: split-screen for up to four on one screen, or online with a
  room code.
- **Versus** for two to four. On one screen everyone races on the same
  canvas and each region goes to whoever stitched most of it. Online,
  everyone solves their own copy and sees rivals' progress, never their
  answers. Play the full canvas, first to N regions, or against the clock.
  A match never touches your own save. Each game holds the finished picture
  locally, so online versus is a friendly race, not a cheat-proof one.
- **Share codes.** Export a canvas as a code or a file and a friend's game
  replays it.

### Comfortable for hours

- **Mouse, touch or gamepad**, with remappable buttons. Pan and zoom freely.
- **Recolour the whole interface**, adjust the music, set a default
  difficulty.
- **Loads instantly.** Every canvas ships already generated, so the only wait
  is a short animation of the puzzle being built.

## How to play

1. Open **https://tile.thebarbellengineer.com/** in a desktop or mobile
   browser.
2. Pick **Single Player**, **Co-op** or **Versus**, then a painting.
3. Left-click (or tap) a tile to stitch it light, right-click to mark it
   dark. Drag to paint several. In a sudoku patch, click a cell and type a
   digit.
4. Finish a region to reveal its piece of the painting. Your progress saves
   itself, and **Continue** on the home menu takes you back.

To play offline, download this repository and open `index.html`. Keep the
`boards/` folder next to it so canvases load instantly; without it the game
builds each one itself, which can take a while on the largest.

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

Open `region-editor.html`, load an image, draw region borders (the tool auto-detects each region,
auto-places the sudoku/picross plots, and lets you attach a quote per region), and **Export** a
`.npxsmap.json`. Then, with Chrome installed:

```sh
node _release_map.js mymap.npxsmap.json --id my-map --name "My Map 🎨"
```

One command, unattended, and it only ever touches that map:

1. **insert** — validates the map (fails closed on a malformed partition, a bad name or quote, an
   id that was ever used before) and appends it to `index.html`;
2. **bake** — generates its board once in headless Chrome, auditing every difficulty on the exact
   bytes that will ship (≈15 min for the largest map, seconds for small ones);
3. **fold** — adds this map's records to the baked tables, leaving every other map's byte-for-byte;
4. **check** — proves nothing outside this map changed against the live release, and that the
   shipped bytes equal the audited bake;
5. **smoke** — boots the game normally and launches every map from its shipped board.

It is safe to re-run; each step picks up where the last stopped. Then bump `APP_VERSION`, add a
`CHANGELOG.md` entry, run `node _check_map_release.js my-map --payload .scratch/bake --ship`, and
open the PR — it should contain only `index.html`, `boards/my-map.js`, docs and (optionally) the
map's source `.npxsmap.json`. Because the gate
proves the other maps are untouched, there is no need to re-audit them.

*(A map can still be added by hand as a bare `MAPS` entry with no layout — the board then
auto-sizes, auto-places plots and grows regions at runtime — but it ships unbaked, so it generates
in every player's browser. The release check rejects it.)*

---

## Debug flags

- **`?audit=1`** — run the solvability audit across all maps × tiers (see above); skips normal boot.
- **`?bake=<map>`** — regenerate the shipped precomputed board payload for those maps (see below),
  auditing every tier on the bytes it ships; it refuses to produce a payload that fails.
- **`?verifybake=<map>`** — rebuild those maps for real and assert the shipped payload is
  byte-identical. Run it after every re-bake.
- **`?nowork=1`** — force clue generation to run synchronously on the main thread instead of in the
  Web Worker (handy for headless testing / debugging).
- **`?nocache=1`** — bypass the shipped payload *and* the stored-board cache and force a real, cold
  build. (`?audit=`, `?bake=` and `?verifybake=` do the same, so they always exercise genuine
  generation.)

`?audit=`, `?bake=` and `?verifybake=` all take a comma-separated map list (`?audit=angels,castle`;
`1` or `all` means every map). Rather than driving tabs by hand, run them headless:

```sh
node _headless.js audit all          # or bake / verifybake, with a map list instead of `all`
node _headless.js smoke              # normal boot: menu grid + every map from its shipped board
```

For `audit`/`bake`/`verifybake` each map gets its own headless Chrome, in parallel (`--jobs N`);
`smoke` walks the maps one after another in a single Chrome (~5 s each). The exit code is the verdict.
To drive a tab yourself, `node _dev_server.js` serves the page on `http://127.0.0.1:8923/` and
catches `?bake=` payloads in `.scratch/bake/`.

## Dev tools (not shipped)

Built from `index.html` so they reuse the game's *exact* generation code — rerun the builder after
changing the relevant part of `index.html`:

- **`region-editor.html`** — the map authoring editor described above.
  Built by `node _build_editor.js` (from `index.html` + `_editor.src.js`).
- **`region-map.html`** — a region inspector: renders each map's art with region borders and ids
  (`R`n region, `S`n sudoku, `P`n picross) plus each plot's home region, for assigning quotes.
  Built by `node _build_inspector.js`.
- **`_release_map.js`** — adds a map end to end (see *Adding a map*).
- **`_bake_map.js`** — inserts an exported `.npxsmap.json` into `index.html` as a built-in map.
- **`_bake_boards.js`** — folds the `?bake=` payloads into `index.html` + `boards/`, so canvases
  ship already generated. It updates only the maps you give it. After **any** change to generation,
  re-bake every map and fold them all (it insists), then `node _headless.js verifybake all` —
  otherwise the shipped boards no longer match the code that makes them. The payloads are produced
  in the browser rather than in Node on purpose: generation starts with a canvas draw, so a Node
  reimplementation would defeat the whole point of the bake being the real output.
- **`_check_map_release.js`** — the gate for a map-only release: proves nothing but that map changed.
- **`_headless.js`** / **`_dev_server.js`** — run the debug flags headless / serve them locally.
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

## License

[MIT](LICENSE). Built by Mario Molnar. Engineering map for new contributors and agents: [CLAUDE.md](CLAUDE.md).
