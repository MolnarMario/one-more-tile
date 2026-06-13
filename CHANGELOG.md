# Changelog

All notable changes to **Number Puzzles × Steroids**. Newest first. Dates are when the change
shipped to the live site.

---

## [0.4.0] — 2026-06-14 — Region quotes & polish

### Added
- **Per-region character quotes** (crew map): a region's line shows once, when that region *and*
  every sudoku/picross attached to it are all solved. Quotes live in an editable `MAP_QUOTES`
  table keyed by region id; unassigned regions stay silent.
- **Replay a quote** by clicking any cell of a finished region (or one of its attached plots);
  works with mouse and gamepad **A**.

### Changed
- Header progress now reads **"n/N regions"** instead of "maps".

### Fixed
- **Solved picross patches stay revealed (full colour) after a reload.** The load-time recompute
  skipped picross region ids (they sit above the pixel-region range), so a solved patch reverted
  to its two-tone look on refresh.

---

## [0.3.0] — 2026-06-13 — Multiple maps, content-aware generation, characters

### Added
- **Multiple maps** with a toolbar dropdown (Castle + The Crew), each with **separate, autosaved
  progress** (per-map save keys; global difficulty/controller/tutorial prefs).
- **Per-map board dimensions** derived from each image's aspect ratio at a constant ~7,680-cell
  budget — wide images make wide boards, square images square boards.
- **Per-map seed** → each painting grows its own distinct puzzle (regions, sudoku, pockets, clues).
- **Content-aware region borders** — a marker-controlled watershed floods region seeds along the
  image's edges, so finishing a region reveals a coherent chunk of the art.
- **Scattered, varied region seeding** (replacing the fixed grid) so each image's regions differ in
  count, size and arrangement.
- **Auto-placed sudoku/picross** on non-castle maps (seeded, non-overlapping, clue-strips on
  canvas), each **attached to its home organic region**.
- **Character dialogue** boxes (crew map) — completing sections greets you with a quote; fires on
  manual play and during auto-solve; Reset re-arms them.
- **Share** — export your full progress as a copy-pasteable code, and **import** one; later also as
  a **`.npxs` file** (save/open). Self-describing (carries map + board dimensions).
- **Play timer** in the header, counting from your first stitch.
- **In-game "Advanced Deductions" tutorial**, shown the first time you reach a tier that needs the
  overlap technique.
- **Auto-solver gated behind a PIN** (developer/test use).

### Changed
- Region borders recoloured to a clearly-visible **gold** (the old dark purple vanished over
  dark-stitched squares); slightly thicker line.
- The castle stays pinned to its original 120×64 layout so existing saves remain valid; its plots
  remain the hand-placed, verified set.

---

## [0.2.0] — 2026-06-13 — Solvability, hints & quality of life

### Added
- **Undo** — toolbar button and `Ctrl+Z`; whole drag strokes, region completions and error sweeps
  roll back as a single step.
- **3×3 neighbourhood highlight** around the tile under the mouse or controller cursor (suppressed
  inside sudoku/picross plots).
- **Re-centering** — on window resize the last-worked cell glides to centre; in controller mode the
  active square stays centred while zooming.

### Changed
- **Easy tiers are now pure counting.** Very Easy / Easy / Medium are guaranteed solvable by plain
  neighbour-counting alone; Hard / Very Hard reserve the cross-clue "Advanced Deductions".
- **Hints stay local and explain themselves** — `H` points at a forced move near your view and says
  what it is, instead of flying to a random 0/9 clue across the board.

### Fixed
- Hover highlight no longer ignores the mouse when a controller is connected (tracks last-used
  input).

---

## [0.1.0] — 2026-06-13 — Initial release

### Added
- **Number Puzzles × Steroids** — a single-file Fill-a-pix (Mosaic) game with woven-in sudoku and
  picross, organic region maps, 5 difficulty tiers, mistake forgiveness, animated auto-solver,
  pan/zoom, autosave and gamepad support. The board reveals a hidden pixel-art painting as it's
  solved.
- A **lavender** UI/canvas theme.
- `verify-puzzle.js` solvability proof harness.

### Fixed
- Solve-all crash on picross regions; "solve this map" targets the last-touched region.
