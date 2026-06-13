# Number Puzzles × Steroids

A single-file browser puzzle game inspired by [Proverbs](https://store.steampowered.com/app/2748080/Proverbs/)-style
Fill-a-pix (Mosaic) — with sudoku and picross puzzles woven directly into the same canvas.

Solve the 120×64 cross-stitch board to reveal a hidden pixel-art painting. No build, no
server, no dependencies: open `proverbs.html` in a browser and play.

## What's inside

- **Fill-a-pix core** — each numbered clue counts the light tiles in the 3×3 block centered
  on it (itself included). Organic, blob-shaped region maps; clues never count across a
  map border.
- **8 sudoku plots** stitched into the grid, from 4×4 up to 9×9 — several with irregular
  **jigsaw boxes**. Click a tile and type digits.
- **8 picross patches** whose nonogram solution is the painting itself. Hover near one and
  its run clues appear; stitch with the same controls as the main board.
- **5 difficulty tiers** (Very Easy → Very Hard) scaling everything at once: clue density,
  free 0/9 moves, sudoku givens, jigsaw irregularity, and picross head starts. Switching
  tiers reweaves the clues without losing your progress.
- **Quality of life** — mistake forgiveness (no game over), hint system that understands
  cross-clue subtraction, animated auto-solver, pan/zoom canvas, autosave, and full
  **gamepad support** with remappable buttons.

## Controls

| Input | Action |
|---|---|
| Left click / `A` | stitch light (toggle) · cycle sudoku digit up |
| Right click / `B` | mark dark (toggle) · cycle sudoku digit down |
| Drag | paint multiple tiles |
| Wheel / `RB`·`LB` | zoom |
| Middle-drag, space-drag / right stick | pan |
| `H` / `X` | hint · `F`/`Y` fit view · `Z`/`X` mark hovered tile |
| 🎮 button | controller status + button remapping |

## Generation guarantees

Everything is generated deterministically from the embedded painting at load time, and
`verify-puzzle.js` (run with `node verify-puzzle.js`; needs the `_pixels.txt` dump) proves:

- every region map is solvable by pure logic (basic counting + cross-clue subtraction) —
  no guessing, at every difficulty tier
- the board is *woven*: flat areas get cross-stitch specks so 0/9 clues only exist in a
  few sheltered pockets, scaled by difficulty
- every sudoku variant has a unique solution at every tier; every picross patch is
  line-solvable

The final painting is only ever revealed by playing — the puzzle layer is two-tone, the
art appears as each map, plot, or patch is completed.
