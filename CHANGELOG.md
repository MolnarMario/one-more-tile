# Changelog

All notable changes to **One More Tile: The Emergent Canvas**. Newest first. Dates are when the change
shipped to the live site.

---

## [0.33.0] — unreleased — Online play: who is actually speaking

A security pass over online co-op and versus. The through-line: every privileged
action was authorised against a peer id **the sender wrote into its own frame**,
while the transport quietly knew who really sent it and threw that away.

### Fixed
- **A peer can no longer speak as the host.** Identity now comes from the
  connection a frame arrived on, never from `msg.pid`. Because the host relays
  guests' frames to each other, it also **stamps the true origin** on everything it
  forwards — so a relayed guest frame can never be mistaken for one the host
  authored. Previously, in any session with two or more guests, one guest could
  push a board at the others, forge a match result, cancel their match, or
  disconnect them.
- **The host is decided once.** `hostPid` was set by *any* `hello` at *any* time, so
  a single frame from another guest was enough to become "the host" for that
  player and pass every host-only check from then on. It is now bound at the first
  handshake, to the connection, and never reassigned.
- **Joining a friend's game no longer hides your own progress.** Adopting the
  host's board also adopted their *weave*, and that was written to your seed store
  — which re-files every save key for that canvas under their `-s<seed>` suffix.
  Your solo progress read as empty and the map card dropped to 0%. Disconnecting
  put it back; closing the tab did not. An adopted weave is now used for
  generation but never recorded as yours, unless you explicitly choose **Save this
  board as mine**, which commits it.
- **Presence can't stuff a room.** A `cursor` frame created a roster entry for
  whatever id it claimed, so one forged frame could fill the host's guest slots and
  turn real friends away with "That game is full", or grow the peer list without
  bound. The host now accepts presence only from peers it actually accepted, and a
  guest only from origins the host has attested. Naming a peer no longer adds it to
  the roster either.
- **`bye` evicts the sender**, not whoever it names — a guest could previously drop
  a *different* guest, and in a match that was enough to end it for everyone.
- **No move or board push crosses the wire during a versus match.** Sending was
  already blocked; receiving was not, so a peer could stitch on your match board or
  replace it outright. `move`, `resync` and `snapshot` are now refused while a match
  is live.
- **Sudoku digits obey the match clock.** `setZoneDigit` was missing the phase gate
  `setCell` has, so digits could be entered during the lobby before "Go!" and after
  the whistle — a free head start on every sudoku plot, in local versus too.
- **Bounded buffers.** The queue of peer moves held while a joiner imports the
  board was unbounded, and a board payload went to `atob` before its size was
  checked. Both are capped now.

### Changed
- **The multiplayer library is now shipped with the game** (`vendor/peerjs.js`)
  instead of being pulled from a CDN the moment you connect. A runtime import puts
  whoever controls that CDN inside the page, with reach over every save you have,
  and there is no way to attach an integrity check to it. It is still loaded lazily
  — a solo player never downloads it — and loading it as a script tag means online
  play now also works when you open `index.html` straight off disk. The page also
  carries a **Content-Security-Policy** that refuses script from anywhere but
  itself.
- The online versus lobby now says plainly that a match runs on the **honour
  system**: each player scores their own board and reports it, and there is no way
  to verify that from the other side. This was always true — it is now stated where
  people can read it.
- `BOARD_COMPAT` 6 → 7 (the relay stamp is new, and a peer on the old build does not
  produce it). **`GEN_COMPAT` is unchanged and nothing was re-baked** — none of this
  touches the puzzle-maker.

---

## [0.32.0] — unreleased — Versus: race a friend for the canvas

### Added
- **Versus mode**, on the home menu beside Single Player and Co-op. Two shapes,
  because a shared screen and two separate screens leak completely different
  amounts of information:
  - **Local versus (2–4, split-screen).** One shared canvas. Every region is
    **claimed by whoever stitched the most of it**, and a tie goes to whoever laid
    the *last* tile — so a region someone has nearly finished can still be stolen
    out from under them. Sharing one canvas is the point here: there is no way to
    stop someone glancing at the other half of a screen, so instead of pretending
    otherwise, both players are looking at the same board by design.
  - **Online versus (2–4, over a code).** Everyone gets their **own copy of the
    same puzzle**. Moves are not shared. You see your rival's pace — completion %,
    regions held, and a live minimap of the tiles they have committed to — but
    **never which colour they chose**. The minimap reads identically for a light
    tile, a dark tile and an outright mistake.
- **Three match rules**, picked by the host on the canvas grid: **Full canvas**
  (play it out, most regions wins), **First to N regions**, and **Timed** (most
  regions when the clock stops, tiles break the tie).
- A match scoreboard under the header, claimed regions outlined in their owner's
  colour on the board itself, and a final standings screen.

### Changed
- **A match never touches your save.** Starting one banks your real canvas,
  blanks the board in memory, and switches off every save path for the duration;
  leaving puts your canvas back exactly as it was — marks, play-time, and even
  which proverbs you had yet to see. Nothing about a match is written to disk.
- `BOARD_COMPAT` 5 → 6 (seven new message types, and a versus session
  deliberately stops syncing moves). **`GEN_COMPAT` is unchanged and no board was
  re-baked** — this release does not touch the puzzle-maker at all, which is
  exactly the split introduced in 0.31.0 paying for itself.
- Region proverbs appear as a toast rather than a modal during a match; a dialog
  over the board is a real time penalty in a race.

### Fixed
- **Sudoku digits entered by mouse or controller were credited to nobody.**
  `cycleZone` — the path for every click and every pad press on a sudoku cell —
  never recorded who entered the digit, while typing one did. Co-op has been
  quietly routing those regions' proverbs to the wrong player since per-player
  attribution landed in 0.25.0.
- **Split-screen touch stitches were credited to the wrong seat.** Touch always
  drove player 1 and never set the acting seat, so a tile placed by touch was
  attributed to whichever player last used a controller or the keyboard. The seat
  is now taken from the pane the finger lands in, and held for the whole stroke.
- **Players 2–4 could not undo.** Undo was hard-wired to player 1, and only the
  keyboard and the header button could reach it — so a controller seat had no way
  to take back its own work. Undo now acts on the seat that asked for it, and
  there is a controller binding for it.

---

## [0.31.0] — 2026-08-11 — Weave a brand-new puzzle from any canvas

### Added
- **"New weave" (🎲, in the ⋯ menu).** Every canvas ships with one fixed puzzle,
  identical for everyone. Now you can ask any canvas for a *completely different*
  one: same painting, same regions, same plots — but a new solution, new clues,
  and new sudoku and picross puzzles across them. This is the one board that
  isn't shipped ready-made, so it's built on the spot; the long loading screen
  is back for exactly this case.
- **Your original progress is kept, not overwritten.** Each weave of a canvas
  gets its own save slot, so you can go **Back to the original** from the same
  dialog and pick up precisely where you left off — then switch again. Both the
  canvas grid and the header label a rewoven board as `· new weave`, so you can
  always tell which puzzle you're looking at.

### Changed
- **Share codes and co-op now carry the weave** (`SHARE_VER` 7, four bytes of
  seed). A recipient rebuilds the board locally before replaying progress, so a
  code that didn't name its weave would have them rebuild the *original* board
  and read every one of your marks as a mistake — the same trap the per-patch
  picross tiers closed in 0.26.0. Older codes decode as "the original weave" and
  still import fine.
- `BOARD_COMPAT` 4 → 5, so co-op partners on older builds are told to update
  rather than silently disagreeing about which puzzle they're solving.
- **Split the compatibility stamp in two.** One number was doing two unrelated
  jobs: "can these two players talk to each other" *and* "were the shipped
  puzzles built by this version of the puzzle-maker". So a change to the share
  format — which is all the seed above is — marked every precomputed board
  stale and forced a full rebuild that produced **byte-identical** puzzles.
  `BOARD_COMPAT` now covers only the share/network side; the new `GEN_COMPAT`
  covers the precomputed boards and the on-device cache. Nothing about the
  puzzles changed; future protocol work just stops throwing away good ones.

### Notes
- A canvas's **layout never follows the weave**. Regions, region ids and plot
  positions come from the shipped partition, which is keyed by canvas alone —
  which is why proverbs, unlocked-region masks and the grid's card previews all
  stay correct on a rewoven board. Only the puzzle itself changes.
- Reweaving is unavailable during an online session, since everyone there shares
  one board.

---

## [0.30.0] — 2026-08-11 — Boards ship precomputed: no more waiting to start

### Added
- **Every canvas now ships already generated.** The puzzle was always identical
  for everyone — the whole pipeline is deterministic from each canvas's seed —
  but each player was recomputing the same bytes on their own machine, which
  cost between one second (Castle) and about **35 seconds** (Angels) the first
  time you opened a canvas, and again for every difficulty you tried. That work
  is now done once, ahead of time, and shipped with the game. On the largest
  canvas the stages it replaced now take **1.4 ms** (0.2 decoding the solution,
  0.6 the clues, 0.6 re-checking them against the solution), so what you wait
  for is the loading animation's own ~0.9 s beat, not the computation.
- **`boards/<map>.js`** — the clue set for all five difficulties, four bits per
  square, loaded only for the canvas you actually pick (26–122 KB each). The
  solution grids and the region partitions are small enough to live inside
  `index.html` itself (+38 KB total).
- **`?bake=<map>`** — a developer mode that produces those payloads by running
  the real generation pipeline in the browser, so the shipped bytes are always
  exactly what the shipped code makes, never a reimplementation of it. Paired
  with **`_bake_boards.js`**, which folds the result into the game.
- **`?verifybake=<map>`** — the guardrail: rebuilds every canvas and difficulty
  from scratch and asserts the shipped payload is byte-for-byte identical.

### Changed
- **The same board on every machine, guaranteed.** Generation began with a
  canvas draw to sample the artwork, and that one step could in principle differ
  between browsers — which would have shifted the solution *and* the region
  borders derived from it. With the partitions and solutions baked, nothing
  about the puzzle depends on the local browser any more; only the revealed
  artwork is still sampled per machine.
- `?audit=`, `?bake=` and `?verifybake=` all accept a comma-separated canvas
  list now (`?audit=angels,castle`), so a full check can be sharded across tabs
  instead of running for hours in one.

### Notes
- Nothing about the puzzles themselves changed — the baked boards are provably
  the same boards the game generated before, so saves, share codes and co-op
  sessions all carry over untouched (`BOARD_COMPAT` is unchanged at 4).
- If a payload is ever missing, stale or damaged, the game silently generates
  the board itself exactly as it used to. A bad bake can cost you the wait; it
  cannot hand you a wrong board.

---

## [0.29.0] — 2026-08-10 — Canvas grid shows the regions you've unlocked

### Added
- **Map cards now reveal your progress as picture, not just a number.** Every
  region you've finished on a canvas is painted with that canvas's *real
  artwork* on its card in the Single Player grid — exactly what the board shows
  when a region is revealed — while unfinished regions stay flat region tint.
  The Continue card gets the same treatment. Nothing is spoiled: a card can only
  ever show what you already earned.
- **A progress bar on each map card**: `NN% · unlocked/total regions`, in the
  same style as the Continue card. Cards for canvases you haven't started are
  unchanged.
- **Thumbnails are pre-warmed at the home screen.** While you're on the landing
  menu, the played canvases' artwork is decoded and their cards rendered during
  idle time (one canvas per idle slot, resume canvas first), so the grid is
  already painted the moment you press Single Player.

### Changed
- `saveNow()` now also records which regions are finished, as a compact
  `0`/`1`-per-region string under `proverbs2-<map>-v3-done`. This is what lets
  the menu draw the unlocked set without regenerating a board. It is refreshed
  whenever a board is opened, so existing saves fill theirs in on first visit.

### Fixed
- **Resetting a canvas now clears its menu summaries too.** `resetGame()` left
  the stored completion `%` behind (and a debounced save could land *after* the
  reset and re-create every key), so a reset canvas kept showing stale progress
  in the grid.
- **A canvas shown in two places no longer loses its thumbnail.** Rendered
  thumbnails are cached as canvas elements, and one element can only live in one
  spot in the page — so when the resume canvas appeared both on its own card and
  on the Continue card, the second one stole the picture and left the first
  blank. Each slot now gets its own copy.

---

## [0.28.0] — 2026-08-10 — UI polish pass: HUD, menus, loading, Options

### Changed
- **HUD rebuilt as a calmer single-row toolbar**: the old two-row stat cluster +
  progress bar is now one status line (bold `%` · map name · timer · mistakes)
  with a slim progress hairline pinned under the header, and a segmented zoom
  control. Secondary actions (music, Clear errors, Solve, Multiplayer, Save/
  share, Options, How to play, Reset canvas) moved into a new **⋯ overflow
  popover**, and the map legend became a small pill anchored bottom-left,
  replacing the old full-width footer bar.
- **Options rebuilt as a rail-and-pane dialog** (Colour / Music / Difficulty /
  Controller sections in a left rail) instead of a single scrolling column.
- **Loading screen** now shows a phase trail (bloom → compute → thin) with the
  target map name and an inline percentage next to the bar, instead of a bare
  title + progress bar.
- **Home menu** buttons now carry a sub-label (canvas count, co-op mode
  description); **Continue** shows the resumed canvas's live progress % and
  play time.
- **Canvas grid** reworked board-first: brand + Options/How-to-play move to a
  header row, Single player/Local co-op/Online co-op become an in-grid mode
  switcher, sort moves to a pill, and map cards show plain name/region/square
  info instead of a hover-only overlay; Continue gets its own wide progress
  card, pinned first.
- Purely presentational — no changes to generation, clue, or save logic;
  `?audit=1` unaffected.

---

## [0.27.0] — 2026-08-07 — New map: In-and-Out 🌀

### Added
- **New map "In-and-Out 🌀"** (237×158, 25 regions, 8 sudoku plots, 8 picross
  plots, 15 region quotes), hand-laid out and baked in via `_bake_map.js`.

---

## [0.26.5] — 2026-08-05 — Bold column headers in Controller setup

### Changed
- **The "Xbox"/"PlayStation" column headers are now bold** and use the regular
  text color instead of the muted one, so they read clearly as column headers
  above the button chips, with a bit more breathing room before the first row.

---

## [0.26.4] — 2026-08-05 — Controller icons: centered columns, bigger chips

### Changed
- **Xbox/PlayStation button chips are now center-aligned under their column
  headers.** The header cells and the chip cells were sized/aligned
  inconsistently (44px right-aligned vs. 40px centered for Xbox, 74px centered
  vs. 40px centered for PlayStation), so the icons didn't sit under their labels.
  Both now share the same column width and centering.
- **Chips are larger** for visibility: face buttons 22px → 26px, bumpers/
  triggers/pills/stick-clicks scaled up proportionally, symbol strokes sized to
  match.

---

## [0.26.3] — 2026-08-05 — Controller icon polish: hollow triangle, lighter labels

### Changed
- **PlayStation's Triangle symbol is now a hollow outline**, matching Circle and
  Square instead of being the only filled shape.
- **Non-face button labels (LB/RB/L1/R1/…) are less heavy** — chip text dropped
  from `font-weight:800` to `600` so they read as labels, not shouting.
- **The PlayStation header column now reads "PlayStation" instead of "PS", and is
  centered** rather than right-aligned.

---

## [0.26.2] — 2026-08-05 — Controller buttons drawn to scale, in their real colors

### Changed
- **Controller setup's button chips are now CSS-drawn icons, not text.** Xbox face
  buttons render as solid-colored round caps in their real colors (A green, B red,
  X blue, Y yellow) with the letter in white/black; PlayStation face buttons render
  as a neutral dark cap with the correct colored outline symbol (✕ blue, ○ red,
  □ pink, △ green) — matching how the actual hardware looks, where the color lives
  in the symbol, not the cap. Bumpers, triggers, select/start/share/options, and
  stick clicks aren't color-coded on real controllers, so they share one neutral
  chip per shape (flat bar, tapered trigger, pill, circle) instead.

---

## [0.26.1] — 2026-08-05 — Controller setup shows PlayStation buttons too

### Changed
- **Controller setup (⚙ Options → 🎮 Controller setup) now lists PlayStation button
  names alongside Xbox.** The keybinding list was Xbox-labelled only (A/B/X/Y/LB/RB/…)
  even though any standard gamepad works; it now shows both (✕/○/□/△/L1/R1/L2/R2/…)
  side by side per action.

---

## [0.26.0] — 2026-08-02 — Boards you've played open in about a second

### Added
- **Picross patches now scale with the difficulty.** They never did before: a patch
  was whatever light/dark pattern the photograph happened to leave behind, so on
  Castle some patches averaged **0.67 runs per line** — a line that's one solid block
  or nothing, which solves itself. That was the same on Very Easy and Very Hard alike.
  Each patch is now shaped to the tier you're playing, measured by how much deduction
  it actually demands (full row-and-column passes needed to crack it from blank):

  | | Very Easy | Easy | Medium | Hard | Very Hard |
  |---|---|---|---|---|---|
  | passes needed | 1.4 | 2 | 3 | 5 | 7.6 |
  | runs per line | 0.9 | 1.3 | 2.0 | 2.4 | 2.5 |

  Every patch stays **provably solvable by pure line logic at every tier** — harder
  never means guessing, and still nothing is ever pre-filled for you.
- **A patch you've already started is left alone.** Change difficulty mid-canvas and
  any patch you've stitched into keeps the shape you were solving; only the untouched
  ones are redrawn for the new tier. Nothing you've worked on is ever invalidated —
  the same courtesy the sudoku plots already got.
- This doesn't change the finished picture at all. The art you uncover comes from the
  photograph itself, not from the puzzle layer, and a patch's tiles are invisible to
  every counting clue on the board (clues never reach across a plot border), so
  reshaping one can't disturb anything outside it.

### Changed
- **Coming back to a canvas is now near-instant.** Until now the game rebuilt every
  board from scratch on every single page load — so closing the tab and reopening it
  meant sitting through the whole weave again. The finished board is now kept on your
  own machine and restored instead.
  - Angels went from **~37 seconds to under a second** of work; Inferno from ~16s;
    Castle from ~1.8s. The bigger the canvas, the more you save.
  - A restored board plays a short **“Restoring the canvas…”** beat (about a second)
    rather than the full weave animation — long enough to see it happen, short enough
    that you're playing almost immediately.
  - **Difficulty tiers are remembered separately.** The first time you try a new tier
    it still has to be woven, but going back to one you've already played is instant.
    Your stitches are untouched by any of this, exactly as before.
- Nothing about the puzzles themselves changed. A restored board is byte-for-byte the
  board you would have got by generating it, and the game checks every restored clue
  against the solution before trusting it — if anything doesn't line up it quietly
  throws the copy away and weaves a fresh one.
- Only boards are stored, never your progress (that already had its own save). Older
  boards are cleaned up automatically, and the whole thing sits in well under a
  megabyte. If your browser blocks local storage the game simply works as it did.

### Notes for developers
- Cache lives in IndexedDB (`proverbs2-boards`), keyed on map · seed · dimensions ·
  `BOARD_COMPAT`, plus difficulty for clue sets. `?nocache=1` bypasses it; `?audit=1`
  disables it outright so the audit always exercises real generation.
- Picross shaping is `shapePicross()` (targets `DIFF[tier].pRuns` / `.pRounds`), always
  starting from `capturePicBase()`'s canonical interiors so a patch depends only on
  (map, seed, tier) — never on which tiers you passed through. Which tier each patch
  sits at is `picTier[]`, persisted per map and carried in **share format v6**, because
  a recipient (and a co-op guest) regenerates the board locally before replaying
  progress. **`BOARD_COMPAT` 3 → 4** — 0.26.0 peers cannot play with older builds.
  v3/v4/v5 codes still import; they carry no tiers, so every patch is shaped at the
  code's own difficulty.

---

## [0.25.0] — 2026-07-31 — Personal co-op moments

### Changed
- **Mistake warnings are now personal in co-op.** The “four mistakes” prompt used
  to pop for *everyone* whenever the board crossed four wrong tiles. Now it counts
  each player’s own tiles: only the player who made the mistakes is asked to sweep
  them, and **Clear my errors** clears just their tiles (never a teammate’s work).
  - Local split-screen: the prompt appears **inside that player’s pane**.
  - Online: the mistaken player gets the prompt; teammates get a small,
    self-dismissing notice (“Player 2 has four mistakes on their side”).
- **Region quotes go to the people who earned them.** When a finished region has a
  character quote, only the players who placed a tile in it (or solved an attached
  sudoku/picross plot) see the quote card.
  - Local split-screen: the quote shows **in each contributor’s pane**.
  - Online: contributors get the quote modal; everyone else gets a **“Player X
    finished a region”** notice with a **View quote** button to read it themselves.
- **Controllers can work these cards/modals.** A player’s pad now navigates the
  buttons on their region-quote card and the four-mistakes prompt: the **light
  stitch** button presses the focused button (closing a quote outright), and the
  **d-pad / left stick** moves a focus ring between the two mistake buttons. The
  same focus-ring navigation now applies to the full-screen modals too.
- Renamed the Options button to **🎮 Controller setup** (dropped the trailing “…”).

### Fixed
- The co-op **clear-errors** action no longer wipes teammates’ mistakes — over the
  network it now clears only the sender’s own tiles. (Bumps the online-play
  compatibility key, so all players should be on 0.25.0+ to play together.)
- **Header no longer overlaps at some widths.** When the window was a certain
  width the **🏠 Menu** button could slide over the play timer instead of dropping
  to a second row. The stats cluster (progress · mistakes · timer) can no longer
  shrink narrower than its own text, so the toolbar wraps onto two rows cleanly
  before anything can collide.

---

## [0.24.1] — 2026-07-30 — Clearer Save button

### Changed
- The toolbar’s **⇄ Share** button is now a compact **💾** save icon — it reads
  as “save my progress,” which is what most players use it for.
- The modal it opens is retitled **Save this canvas** and now explains you can
  also hand your board to a friend, with a warning that importing it **replaces**
  their existing progress on that map.

---

## [0.24.0] — 2026-07-27 — New canvas: Inferno

### Added
- **A new canvas — “Inferno 🔥”.** A 184×164 board (30,176 stitches) with 52
  hand-drawn regions plus the usual 8 sudoku plots and 8 picross patches. Woven
  and repaired like every other map, so it ships fully solvable with zero
  pre-filled tiles on every difficulty.

---

## [0.23.0] — 2026-07-27 — Touch play, sturdier saves & sharing

### Added
- **Play on a phone or tablet.** One finger stitches and drags to paint; two fingers pan and pinch
  to zoom. A new **brush toggle** in the header (💡 Light ⇄ ⬛ Dark) chooses what a tap places, and a
  finger on a sudoku cell selects it (tap again to cycle its digit). The mouse experience is
  unchanged. *(finding: no touch support)*

### Fixed
- **Typing in a text field no longer reaches the board.** Entering a share code, a PIN or a join
  code used to trigger pan/zoom/hint/stitch shortcuts through the field. *(input scoping)*
- **Your last stitch is no longer lost on a quick close.** Saves are now flushed immediately when the
  tab is hidden or closed, instead of only on the 400 ms debounce. *(save flush)*
- **Music on/off is remembered**, and you can turn it off even while the track is still loading (the
  button now follows your choice, not the buffering state). If you've turned music off, the large
  track is no longer downloaded at all. *(music toggle + persistence)*
- **The dropdown chevron now follows the interface colour** instead of staying purple.
- **Sweeping the interface-hue slider no longer leaks memory** (stale cached menu thumbnails are
  dropped on each theme change). *(menu-card cache)*

### Changed
- **Shared/saved canvas codes now identify the map by name, not by list position**, so reordering
  the map list can never load the wrong painting for an old code. Older codes still load. *(share
  format v5)*
- **Online co-op no longer breaks on every release.** Compatibility is now gated on a board/format
  key that only changes when generation, the code format or the protocol changes — friends on
  adjacent UI builds can still play together. Only the host can push a full board snapshot, so a
  guest can't accidentally overwrite everyone's board. *(co-op robustness)*
- **Co-op undo is now per-player.** In both local split-screen and online co-op, your Undo rolls
  back only the tiles and digits *you* placed — never a teammate's work — and it stops at any region
  that's already been completed, so finished art never disappears. *(per-player undo)*

---

## [0.22.1] — 2026-07-27 — Music from the first moment

### Changed
- **The music now starts as soon as the game opens** (at the home menu) and plays right through
  picking a canvas, loading and playing — instead of only starting once a board was generated.
  Browsers that block autoplay start it on your first click. Turn it off any time in **Options** or
  the header music player.

---

## [0.22.0] — 2026-07-24 — A visual tutorial

### Added
- **The "How to play" screen now shows the rules, not just tells them.** New little tile diagrams
  illustrate: counting the light neighbours (a worked “5”), the **0 / 9** footholds, how a clue
  stays inside its **map** (two regions split by a gold border), and what **gold sudoku plots** and
  **teal picross patches** look like. All theme-coloured.

### Changed
- The home-menu **"How to play"** button lost its leading “?” and is now a softer outlined pill —
  distinct from the main menu buttons without shouting.

---

## [0.21.2] — 2026-07-24 — Cozy menu

### Changed
- **The home menu is centred** vertically and horizontally on the landing screen (it already was
  in-game).
- **A soft ambient background** on the home menu — a few theme-coloured orbs drifting slowly. It
  never shows any map art (nothing to spoil) and moves gently; it stops entirely if your system
  prefers reduced motion. Hidden in-game, where the board shows through the menu modal.

---

## [0.21.1] — 2026-07-24 — Menu/modal polish

### Fixed
- **In-game menu is now a proper centred modal** over a dimmed board, dismissable by clicking the
  backdrop (same as Esc) — not a full-screen page. The landing page keeps its full layout.
- **Clicking outside any modal closes it** (same as its Close/Done button) — including Options.
- **Controller setup** opened from Options now sits **above** it (z-index) instead of behind, and
  closes back to Options.
- **Dropdowns** get a clean custom chevron with proper padding (the native arrow is gone); modals
  have edge padding so nothing crowds the screen.

---

## [0.21.0] — 2026-07-24 — The play timer resumes where you left off

### Changed
- **The timer is now per-canvas and remembers your time.** Come back to a map later and it picks up
  from where it stopped instead of resetting to `00:00`. It counts only **active** time — it pauses
  when you open the menu, switch maps, background the tab, or close the page, so time spent away is
  never added; it resumes on your next stitch. Reset a canvas and its clock starts fresh.

---

## [0.20.0] — 2026-07-24 — Home menu as a stacked button list

### Changed
- **The home screen is now a classic vertical menu** — same-size buttons, one under another:
  **Single Player · Co-op · Continue · Options · Credits** — instead of the two side-by-side cards.
- **Continue** jumps straight back into your **most recently played single-player canvas** (greyed
  out until you've played one).
- **Options** and **Credits** are first-class menu entries now; **Credits** opens a small about
  screen. The buttons follow the interface theme you pick in Options.
- **The canvas grid has a Sort control** — Name A→Z / Z→A, Newest / Oldest added, or Most / Fewest
  squares (your choice is remembered).
- Map names now read with the **emoji at the end** (e.g. “Castle 🏰”), so alphabetical sorting works
  naturally.

### Fixed
- Menu buttons no longer flash **white-on-white** (invisible label) on hover.

---

## [0.19.0] — 2026-07-24 — Options menu: themes, music, difficulty, controller

### Added
- **An ⚙ Options menu** (from the toolbar and the home menu) collecting the game's settings:
  - **Interface colour.** Pick from preset swatches (Purple is the default) or drag a hue slider —
    the *entire* interface recolours from one hue: chrome, panels, gradients, the board background,
    region tints and clue ink, live. Gold (sudoku), teal (picross) and red (errors) stay put on
    purpose, so those cues remain readable in any theme. Your choice is saved.
  - **Music** — mute/resume and a volume slider, kept in sync with the toolbar's player.
  - **Default difficulty** (Medium by default) — the tier new canvases start at. The toolbar
    dropdown still switches tiers live mid-game.
- The **controller setup** (🎮) moved from the toolbar into Options.

### Changed
- The toolbar's 🎮 button is now **⚙ Options**; the music player stays in the toolbar.
- Difficulty is no longer chosen on the map-picker grid (it lives in Options + the toolbar dropdown).

### Notes
- Theming only changes colours — puzzle generation, the zero-given guarantee and your saves are
  untouched.

---

## [0.18.0] — 2026-07-24 — Home menu: Single Player / Co-op + a map picker

### Added
- **A proper home menu on launch.** The game now opens on a landing screen instead of dropping
  straight into a board. Choose **▶ Single Player** or **👥 Co-op**, then pick a canvas from a grid
  of cards. Each card shows the map's **region lines** in the background; hover (or focus) a card to
  see how many **regions** and **squares** that canvas has.
- **Difficulty is chosen right in the menu** (a row of pills above the grid), alongside the map — it
  still lives in the toolbar too, so you can switch tiers mid-game exactly as before.
- **Co-op flows through the menu.** *Local* lets you set 2–4 players up front before the split-screen
  board loads; *Online* offers **Host** (pick a canvas and get a code to share) and **Join** (enter a
  friend's code — you'll play their board). The online code-sharing, loopback test, and disconnect
  controls are unchanged.

### Changed
- **The toolbar's map dropdown is now a 🏠 Menu button** that reopens the home menu, where you switch
  canvas or mode. Difficulty, and every other toolbar control, is unchanged.

### Notes
- Puzzle generation is untouched — the zero-given guarantee and every difficulty tier behave exactly
  as before; your per-map saves, shared codes and settings carry over.

---

## [0.17.0] — 2026-07-14 — Renamed to "One More Tile: The Emergent Canvas"

### Changed
- **The game is now "One More Tile: The Emergent Canvas"** (formerly *Number Puzzles × Steroids*).
  New title bar, on-screen heading, loading screen, and docs. The live site moved to
  **https://molnarmario.github.io/one-more-tile/** (the old address redirects). Your saved progress,
  settings, shared codes, and `.npxs` files are unaffected — only the name changed.

---

## [0.16.3] — 2026-07-08 — "Clear errors" button

### Added
- **A "🧹 Clear errors" button in the toolbar.** It sweeps away every incorrect tile — the same
  action as the "Clear my errors" button in the four-mistakes prompt — but you can now do it any
  time, not just once you've hit four. It stays greyed out while you have zero mistakes.

---

## [0.16.2] — 2026-07-08 — Consistent click-and-drag painting

### Changed
- **Dragging now paints every square it crosses, exactly like clicking each one.** Before, a drag
  only filled *blank* squares — if you dragged over a square of the opposite colour it was left
  unchanged, so fixing a mistake (e.g. repainting a dark run light) only flipped the first square.
  Now a left-drag turns every square it touches light and a right-drag turns them dark, regardless
  of what was there; dragging back over a square that's already your colour clears it to blank. Each
  square flips once per stroke, so holding still doesn't make it flicker.

---

## [0.16.1] — 2026-07-08 — Pan while loading

### Added
- **Pan the board during the loading animation.** Hold the middle mouse button (the scroll wheel)
  and drag to move around the map while it's still generating — the same free-look panning you have
  once it's loaded, alongside the existing scroll-to-zoom. (Gameplay is still off until generation
  finishes; only the camera moves.)

---

## [0.16.0] — 2026-07-07 — New map: Angels

### Added
- **👼 Angels** — a new built-in map (204×136, 20 regions, with sudoku and picross plots and a full set
  of per-region quotes). Pick it from the map menu.

---

## [0.15.3] — 2026-07-03 — Drop the skip prompt

### Removed
- **The "click or Esc to skip" prompt is gone.** Skipping could only ever take effect *after* the
  puzzle finished generating (there's no board to skip to before then), so an early click did
  nothing — confusing for no real benefit. The loading card now just shows the "scroll to zoom" hint.

---

## [0.15.2] — 2026-07-03 — Loading progress, zoom, and a readable title card

### Added
- **A readable title card at the top.** The title, a live status line, and the progress bar now sit
  in an opaque card pinned to the top of the screen, so they stay legible over the moving board —
  previously the purple-on-purple could wash them out, especially once you zoomed in.
- **A slim progress bar during loading** shows real clue-thinning progress (with a live %), so on a
  big map you can see how much is actually done while the squares are twitching — not just a spinner.
- **Zoom while the map is loading.** Scroll (or press +/−, and F to fit) to zoom the board during the
  loading animation — handy for watching the numbers resolve up close, and it makes the shimmer
  legible on very large maps. Clicking or pressing Esc still skips to the board.

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
- **One More Tile: The Emergent Canvas** — a single-file Fill-a-pix (Mosaic) game with woven-in sudoku and
  picross, organic region maps, 5 difficulty tiers, mistake forgiveness, animated auto-solver,
  pan/zoom, autosave and gamepad support. The board reveals a hidden pixel-art painting as it's
  solved.
- A **lavender** UI/canvas theme.
- `verify-puzzle.js` solvability proof harness.

### Fixed
- Solve-all crash on picross regions; "solve this map" targets the last-touched region.
