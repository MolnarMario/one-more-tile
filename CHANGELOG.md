# Changelog

All notable changes to **Number Puzzles × Steroids**. Newest first. Dates are when the change
shipped to the live site.

---

## [0.15.1] — 2026-07-03 — Loading animation paced to the map

### Changed
- **The loading animation now runs slower on bigger maps** — the ones with more clue-thinning to do.
  The opening bloom + number-shimmer are scaled to the board's size (up to ~2.5× on the largest
  maps), so a heavy map gets a slower, more deliberate reveal instead of racing through the opening
  and then waiting; small maps stay just as snappy as before.

---

## [0.15.0] — 2026-07-03 — Watch the canvas being woven

### Added
- **The loading screen now shows the puzzle being generated instead of a plain bar.** Three staged
  beats play on the board while the clues are computed: the **territories bloom in** (regions and
  their borders, sudoku/picross plots dropping into place), then **every square runs a "compute
  shimmer"** of flickering digits, then a sweep **thins down to the real clues**, the surviving
  numbers crystallising into place. It runs on the otherwise-idle main thread while the heavy work
  happens in a background worker, so it costs nothing extra, and it's **spoiler-safe** — the shimmer
  is random digits, never the true counts; only the clues you'd actually get resolve to real numbers.
- **Click or press any key to skip** straight to the board (it still waits for generation to finish).
- The animation is choreographed with a short minimum duration so quick maps still get a satisfying
  show, and it never ends before the board is truly ready. Difficulty changes jump straight to the
  re-thinning step (the territories don't change).

---

## [0.14.0] — 2026-07-02 — No pre-filled squares, ever

### Changed
- **Every tile is now yours to stitch — the game never pre-fills a square again.** Boards used to
  ship with a few pre-stitched starter tiles wherever pure logic stalled (genuinely ambiguous spots,
  like a thin 2-cell strip whose clues both read 1), plus a random "head start" in picross patches
  on the gentler difficulties. The generator now *repairs the stitch texture instead*: it flips a
  few solution pixels (exactly like the weave's own cross-stitch specks — the revealed artwork is
  untouched) until every region falls to plain 3×3 counting with the full clue set and every picross
  patch falls to line logic from a blank grid. Same guarantee as before, on every tier: *no guessing
  ever required* — but now also *nothing solved for you*.
- **One-time effect on old saves:** the repaired texture differs from the old one in a handful of
  cells per map, so a few of your previously-correct marks may show up red after updating — use
  **Clear my errors** and re-stitch those spots. A completed region containing such a cell may
  re-open. Your progress is otherwise intact.
- Online co-op needs both players on this version (the usual version handshake).

### Dev
- `index.html?audit=1` (or `await auditGivens()` in the console) proves the guarantee: for every
  map × difficulty it rebuilds the board and asserts zero pre-filled cells, every region solvable
  with that tier's technique from the shipped clues alone, and every picross patch line-solvable.

---

## [0.13.0] — 2026-07-02 — "Amigos" map

### Added
- **A new map — "🐾 Amigos"** — authored in the region editor: a 144×95 board with 10 regions,
  8 sudoku zones, 8 picross plots, and a quote per region, with its own autosaved progress.

---

## [0.12.4] — 2026-06-17 — Clean seams on revealed art

### Fixed
- **No more faint light/dark lines between tiles in a finished region.** A solved cell used to paint
  the picture colour *on top of* the light/dark solving square, and at fractional-pixel cell edges
  the near-white / near-black underlay bled through as thin seams. A fully revealed cell now paints
  only its pixel-art colour (the cross-fade reveal is unchanged), so the finished picture is clean.

---

## [0.12.3] — 2026-06-17 — Esc closes any modal

### Added
- **Press Esc to close the open dialog** — it runs that modal's own Close/Cancel action (so the win
  screen's Esc dismisses to admire the canvas rather than restarting, the PIN box cancels, etc.). It
  works even while the PIN field is focused; with no modal open, Esc still deselects a sudoku cell.

---

## [0.12.2] — 2026-06-17 — Keep a co-op board as your own

### Added
- **Guests can save the shared board as their own progress.** In an online session, open
  **👥 Multiplayer** and use **"Keep this board as my own"** (with a confirm) to copy the current
  co-op board into your solo save for *that map only* — so you can pick up where you and your friends
  left off, alone. It's the Share import in one click. As before, playing in multiplayer never
  touches your solo progress on any map unless you press this; and your other maps are never affected.

---

## [0.12.1] — 2026-06-17 — Modal button wrapping fix

### Fixed
- **The auto-solve dialog's buttons no longer overflow the box.** Its four buttons sat in a single
  non-wrapping row and spilled off both edges of the card; modal button rows now wrap, so they lay
  out tidily on any width. Modals are also capped to the viewport (with internal scroll if needed),
  so none can overflow a small or short window.

---

## [0.12.0] — 2026-06-17 — Up to 4 players + a Multiplayer menu

### Added
- **One 👥 Multiplayer button** replaces the separate Co-op/Online buttons: click it and pick **Local
  co-op** or **Online co-op**. (You can be in one mode at a time; the other becomes available again
  once everyone disconnects.)
- **2–4 players.** Local co-op now has a player-count picker (2–4); online hosts choose how many
  guests (1–3) and hand out the **same code** to all. The screen tiles to fit: **side-by-side** for
  2, **three columns** for 3, a **2×2 grid** for 4.
- **Join any time.** Players don't have to be there at the start. Locally, an extra player presses
  any controller button to claim the next spot mid-game; online, a friend can connect to the host's
  code whenever — they're handed the current board on arrival. Everyone's cursor shows live, in their
  own colour, with an edge arrow when they're off your screen; **⊟ Watch** tiles everyone's views.

### Changed
- **Responsive at any window size.** Panes are computed from the live window dimensions and re-fit on
  resize, so split-screen works beyond the usual 16:9 fullscreen.
- **Online stays host-authoritative for everyone.** All guests play on the host's board and every
  move — whoever makes it — is saved on the **host's** side; the host's map is never wiped. Each
  guest's own solo progress is untouched and restored when they leave.

---

## [0.11.1] — 2026-06-17 — Controller follows the mouse

### Fixed
- **The controller cursor now starts where you last clicked.** Clicking a square with the mouse and
  then reaching for the controller used to drop you at an unrelated spot (the controller's old
  position or the screen centre). Now a mouse click — and any paint stroke — moves the controller
  cursor with it, so picking the controller back up continues from the square you were just on.

---

## [0.11.0] — 2026-06-17 — Online co-op

### Added
- **Play online with a friend.** A new **🌐 Online** button lets one player *Host a game* (you get a
  short code) and the other *Join* by pasting it — then you both work the same board live over a
  peer-to-peer connection (great alongside a Discord call). Because every board is generated
  deterministically from its map + difficulty, only your *moves* travel the wire, not the whole
  canvas; the connection bootstraps by sending a one-time snapshot (the same format as Share codes).
  Your partner's stitches, digits and **cursor** appear in real time, with an edge arrow pointing to
  them when they're off your screen. Press **⊟ Watch** to split the screen and mirror their viewport
  live. Disconnects fall back to solo cleanly; undo re-syncs both sides.
- **The host owns the board.** A joiner plays *on the host's canvas* and all progress — whoever makes
  the move — is saved on the **host's** side; the host's map and progress are never wiped. The
  joiner's own solo progress for that map is left untouched and restored automatically when they
  disconnect.
- **One mode at a time.** Local split-screen and online can't run together — whichever you start
  holds until Player 2 disconnects, then either mode is available again (for host and joiner alike).
- **Transport is pluggable** behind a thin `Net` interface (WebRTC/PeerJS today; a relay could drop
  in later with no game-code change). A "test in two tabs" checkbox runs the whole thing locally over
  `BroadcastChannel` with no internet, for development.

### Notes
- The auto-solver is disabled during online co-op (it's a reveal tool, not collaborative play).
- Networking needs a real origin — use the live site (or a local server), not a `file://` page.

---

## [0.10.0] — 2026-06-17 — Local split-screen co-op

### Added
- **Two-player local split-screen co-op.** A new **👥 Co-op** button splits the canvas left/right so
  two players share one board, each with their own cursor and independent pan/zoom — solve together
  without fighting over the view. Player 1 keeps mouse & keyboard; Player 2 presses any button to
  join with a controller (two controllers also work — claim P2 first, then P1 grabs the other).
  Each pane shows its own cursor plus a dimmed ghost of where your partner is working; completing a
  region reveals it in both panes. Click 👥 again to return to solo.

### Changed
- **The camera and cursor are now per-player.** Rendering was refactored so the board draws once per
  viewport (`drawViewport`) and every camera/cursor/selection is owned by a player object. Solo play
  is unchanged — it's simply "one player" — but this is the groundwork that also enables an upcoming
  online co-op mode (a partner's view can be mirrored into the second pane).

---

## [0.9.4] — 2026-06-17 — Solver: "leave one square" debug option

### Added
- **A 🐞 "…but leave one square in each" button** in the (PIN-gated) solver. It solves the same
  region as "Solve this region" — its numbers plus every sudoku/picross it touches — but stops one
  square short in *each* puzzle, leaving every one of them a single move from done. Place those last
  squares by hand to test the final-move behaviour (region reveal, character quote, win) without
  re-solving a whole region each time.

---

## [0.9.3] — 2026-06-17 — Regions wait for their puzzles

### Fixed
- **A region no longer reveals while a sudoku/picross inside it is still unsolved.** Placing all of
  a region's fill-a-pix numbers used to complete and reveal it on its own, even with an embedded
  sudoku left half-filled. Now a region completes only when its numbers *and* every sudoku/picross
  plot sitting inside it (touching it, partially or fully) are all solved — finishing that last plot
  is what flips the surrounding region to "done". This matches when the region's character quote
  already fired; the reveal now lines up with it.

---

## [0.9.2] — 2026-06-17 — Strict region completion

### Changed
- **A region now reveals only when every tile is explicitly placed** — light tiles marked light
  (left click) *and* dark/background tiles marked dark (right click). Previously, placing all the
  light tiles auto-filled the remaining background and completed the region; now an unmarked tile
  keeps the region open, so it won't reveal while any square is still blank. The auto-solver and
  "solve region" place both colours, so they still complete as before.

---

## [0.9.1] — 2026-06-16 — Reliability fixes & repo cleanup

### Fixed
- **Sweeping your mistakes can now complete a region.** Clearing wrong tiles reset the cells but
  didn't re-check whether the region was finished, so a region you completed *by* fixing your last
  mistakes wouldn't reveal. `clearErrors` now re-checks every region it touched.
- **No region can strand cells outside its body.** A new load-time pass (`healRegions`) guarantees
  every region is a single connected blob: if a partition leaves a region in two pieces, the largest
  piece is kept and the stray fragment is folded into the neighbour it borders most — so you never
  have to hunt a few cells marooned inside another region. Region ids are preserved (quotes and
  saved progress are unaffected) and it's a no-op for well-formed maps. `_bake_map.js` also warns at
  authoring time if a map-def has a disconnected region.
- **Flash map: the top-right region no longer reaches across to the top-left.** A hand-transcription
  slip had scattered two of that region's cells onto the far-left border; they're reattached to the
  region that actually surrounds them.

### Changed
- The repo no longer tracks any image. The one committed-but-unused PNG was removed and `.gitignore`
  now ignores all image types, so debug screenshots and source art can't be pushed by accident (the
  game embeds all artwork as data URIs inside `index.html`).

---

## [0.9.0] — 2026-06-16 — Instant-loading clues

### Changed
- **Large maps no longer freeze the page while loading.** Fill-a-pix clue generation — the slow
  step that re-solves each region many times to prune clues — now runs in a Web Worker instead of on
  the main thread, so switching to a big, high-resolution map (e.g. Blinding Lights) keeps the UI
  responsive instead of locking up for several seconds. The generated puzzles are byte-for-byte
  identical; only *where* the work runs changed.

---

## [0.8.0] — 2026-06-16 — "Blinding Lights" map & higher resolutions

### Added
- **A new map — "🌙 Blinding Lights"** — authored in the region editor and baked in like the others,
  with its own autosaved progress.
- **Adjustable pixel-art resolution** in the region editor: an aspect-locked slider trades
  detail/length against generation time, and the engine's cell-count cap was raised to 320×180
  (57,600 cells) to allow much higher-resolution boards.

### Changed
- **Share codes now carry 2-byte board dimensions** (format v4) so the larger boards round-trip
  correctly; older v3 codes still import.

---

## [0.7.0] — 2026-06-15 — Region editor & the "Flash" map

### Added
- **A hand-drawn region-authoring editor** (`region-editor.html`): load an image, draw region
  borders with the mouse, and the tool auto-detects each region as you close it, auto-places the
  sudoku/picross plots, and lets you attach a quote per region. It reuses the game's *exact*
  generation code, so the board and region ids match in-game. Export a map-def and bake it into the
  game with `node _bake_map.js`. A read-only **region inspector** (`region-map.html`) renders any
  map's generated partition.
- **A new map — "Flash"** — the first map authored end-to-end in the editor, with per-region quotes.
  Its name is revealed **region by region** as you solve, instead of shown up front.

### Changed
- The region-solved (pin-locked) popup now says **"region"** instead of "map".

---

## [0.6.0] — 2026-06-15 — Music, focused hover & a responsive header

### Added
- **Background music player** in the header. The (large) audio file is deliberately loaded *last*,
  after the game is interactive, so it never slows the core load.

### Changed
- **The 3×3 hover highlight is clipped to the current region** — squares that would spill across a
  region border are no longer highlighted, since they don't count toward the tile you're on.
- **The header is responsive and grouped** — controls reflow into labelled groups and stay usable on
  small / narrow screens.

---

## [0.5.2] — 2026-06-14 — Undo fix

### Fixed
- **Undo now reverts exactly one move at a time when using a controller.** The gamepad
  light/dark buttons placed tiles without recording an undo step, so a single Undo rolled back
  every controller tile plus the last mouse tile at once. Each controller tile is now its own
  step, matching mouse and keyboard.

---

## [0.5.1] — 2026-06-14 — Fighters quotes

### Added
- **Quotes on "The Fighters" map** — six regions now carry an original, in-character line for the
  fighter who dominates that region's art (Piccolo, Tien, Goku, Krillin, Trunks, Vegeta), keyed in
  `MAP_QUOTES`. Regions that are background or too small/oddly-shaped to clearly belong to one
  fighter are left silent.

---

## [0.5.0] — 2026-06-14 — Third map

### Added
- **A third playable map — "🐉 The Fighters"** — a 16:9 character lineup, run through the same
  pipeline: the board auto-sizes to its aspect (117×66), regions grow content-aware along the
  image's edges (borders carry ~2.2× the average edge strength), sudoku/picross auto-place and
  attach to home regions, and it's logic-solvable like the others. Pick it from the map dropdown;
  it keeps its own autosaved progress. No character quotes yet.

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
