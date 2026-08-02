# CLAUDE.md — architecture map

Orientation for a new person or AI working on **One More Tile: The Emergent Canvas**. It explains how the
code is laid out, how a board goes from image → puzzle → play, the key state, and the invariants you
must not break. Player-facing docs live in [README.md](README.md); the shipped-change log is
[CHANGELOG.md](CHANGELOG.md).

> Anchors below are **function/global names** (stable) with occasional `~line` hints (drift as the
> file changes — search by name, don't trust the number). Everything is in `index.html` unless noted.

---

## 1. The shape of the project

- **`index.html`** — the entire game: HTML + CSS + one big inline `<script>` (~5,050 lines). No
  modules, no bundler, no dependencies. Open it in a browser and it runs. This is the only shipped
  file (plus its embedded image data URIs). Boot lands on the **home menu** (§10), not a board.
- **Dev tools** (not shipped; generated *from* `index.html` so they reuse its exact code):
  - `region-editor.html` ← `node _build_editor.js` (uses `index.html` + `_editor.src.js`) — author
    maps by drawing region borders; exports a `.npxsmap.json`.
  - `region-map.html` ← `node _build_inspector.js` — region inspector (borders + ids).
  - `_bake_map.js` — bakes a `.npxsmap.json` into `index.html` as a built-in map.
  - `verify-puzzle.js`, `inspect-region.js` — **legacy** Castle-only Node harnesses, superseded by
    the in-browser audit (below). Their headers say so.
- **Docs** — `README.md` (players), `CLAUDE.md` (this), `CHANGELOG.md` (per-version history).

### Running / verifying / debugging
- **Play**: open `index.html`. Live: https://molnarmario.github.io/one-more-tile/
- **`?audit=1`**: rebuilds every map × every difficulty and asserts zero pre-filled cells + full
  logical solvability; sets `document.title` to `AUDIT PASS`/`AUDIT FAIL` (headless-friendly). This
  is *the* correctness check — run it after touching generation. Entry: `auditGivens()` (~line 2063).
- **`?nowork=1`**: forces synchronous, worker-free clue generation (headless/debug).
- **`?nocache=1`**: bypasses the IndexedDB board cache (§7) so you always get a real, cold build.
  `?audit=1` disables it too — the audit must never validate cached bytes.
- Syntax check: extract the inline `<script>` and `new vm.Script(src)` it under Node.

---

## 2. Lifecycle: boot → menu → generate → play

**Boot lands on the home menu, not a board.** At the end of the script (`if (!AUDIT_MODE)`) the loader
is dismissed and `showMenu()` shows `#menuScreen`; nothing generates until the player picks a canvas
(see §10). `AUDIT_MODE` (`?audit=`) still skips everything and lets `auditGivens()` drive the pipeline
directly.

Picking a map calls `menuLaunch(id)` → **first launch** sets `img.onload = startGeneration; img.src =
…` (the classic boot, just deferred); a **later switch** calls `loadMap(id)`. The pipeline (same for
first load, `rebuildForMap` on map switch, and — minus the `sol` stages — `setDifficulty`):

```
sampleImage(img)      image → sol[] (light/dark) + cellCol[] (art) + edge[]
buildLayout()         plots, regions (watershed or hand layout), nbhd[]
clueCacheProbe(hit)   is this map+tier's clue set already banked? (§7)
prepareSolution()     restore sol[] from cache, ELSE weaveTexture() → repairTexture() → bank it
beginGen(kind, done, hit)  starts the loading animation (see §5); `hit` = short "restoring" beat
regenClues(genClueReady)   cache hit → return at once; else spawn the clue Worker + bank the result
   … the animation plays while the worker thins clues off-thread …
genComplete() → done()     handoff: finishSetup (load) / callbacks (map, diff)
```

The two cache-aware seams are `prepareSolution` and `regenClues`; **`auditGivens()` calls
`weaveTexture()` / `genRegionClues()` directly and is unaffected.**

`finishSetup()` (~1889): `generated = true`, `loadSave()`, `applyGivens()`, re-check regions, start
the render `loop()`, then `runPendingAfterGen()`. After this, gameplay is live and `loop()` runs
continuously. **`pendingAfterGen`** is a one-shot the menu stashes so a co-op session starts *after*
the board is ready; every completion path (`finishSetup`, `loadMap`'s rebuild callback, and
`setDifficulty`'s reweave) drains it.

**Determinism**: everything keys off `SEED = mapDef().seed`. Same map + seed ⇒ identical board.

---

## 3. Key global state

| Global | Type | Meaning |
|---|---|---|
| `GW,GH,N` / `MAXN` / `CELL_TARGET` | numbers | board dims / array ceiling (320×180) / auto-size budget (7680) |
| `SEED` | number | per-map RNG seed (via `mulberry32`) |
| `sol[]` | Uint8Array | **the answer**: 1=light, 0=dark. Frozen after `repairTexture()`. |
| `cellCol[]` | Array | per-cell art colour `rgb(...)`, revealed on completion |
| `clue[]` | Int8Array | fill-a-pix clue per cell: −1 none, else 0..9 |
| `state[]` | Uint8Array | player marks: 0 unknown, 1 light, 2 dark |
| `locked[]` | Uint8Array | pre-stitched givens — **always empty now** (see §4); only the warn-fallbacks write it |
| `edge[]` | Uint8Array | image edge strength, drives the watershed |
| `regionOf[]` | Int16Array | cell → region id (−1 none). Organic ids `0..REG_PIX-1`; plots get appended ids |
| `REG_PIX` / `REG_COUNT` | numbers | organic region count / total incl. plots (`REG_PIX + ZONES + PICROSS`) |
| `regionCells[]`, `regionTint[]` | Arrays | cells per region / background tint per region |
| `regionDone[]`, `regionDoneAt[]` | Arrays | solved flag / solve timestamp (drives the reveal fade) |
| `regionPlots[]` | Array | plot ids touching each pixel region (region reveals only when all are solved) |
| `nbhd[]` | Array | **region-clipped** 3×3 king-move neighbourhood per cell — the clue mechanic |
| `zoneOf[]`, `picrossOf[]` | Int8Array | cell → plot index or −1 |
| `ZONES`, `PICROSS`, `picrossByRegion` | Arrays/Map | plot descriptors (set by `buildLayout`) |
| `DIFF`, `DIFF_ORDER`, `difficulty` | table/…/string | difficulty tiers (see §4); `difficulty` persisted |
| `MAPS`, `currentMap`, `mapDef()`, `HAND_LAYOUTS`, `MAP_QUOTES` | — | maps registry, hand partitions, quotes-by-region-id |
| `MAP_META`, `PREVIEW_RLE`, `MAP_ADDED_ORDER` | objects/array | baked per-map region/square counts + region RLE for menu card previews (watershed maps); git add-order for the sort (see §10) |
| `GEN`, `GTL_BASE` | object/const | loading-animation state machine + base timeline (see §5) |
| `players[]`, `dpr`, `needsDraw`, `C`, `TINTS` | — | cameras, DPR, dirty flag, palette (mutated by `buildPalette`), region tints (derived from `themeHue`) |
| `themeHue`, `MENU`, `pendingAfterGen` | number/obj/fn | current interface hue (see §10) / menu state machine / one-shot post-generation action |
| `timerBase`, `timerStart` | numbers | per-map **accumulated** play-time + current run start (see §10) |
| `net`, `onlineRole`, `online`, `coop`, `PROTO_V` | — | multiplayer transport/role/flags |
| `solving`, `solveQueue`, `wrong` | — | auto-solve state / mistake set |

---

## 4. Generation & the "no pre-filled cells" guarantee

- **`sampleImage()`** (~1316): offscreen `GW×GH` draw → `cellCol`, luminance histogram, `edge`
  (local gradient), global **Otsu** threshold, then `sol[i]` = adaptive threshold (Otsu blended
  with a local-mean window, `MIX=0.75`).
- **`buildLayout()`** (~886): `choosePlots` → `fillPlotCells` → `growRegions()` (seeded
  edge-priority watershed) **or** `applyHandPartition(L)` (decode `HAND_LAYOUTS` RLE; organic ids
  used verbatim so they line up 1:1 with `MAP_QUOTES`) → `healRegions()` (each organic region = one
  connected blob, ids unchanged) → `attachPlots()` (each plot's home/`borderRegions`, `regionPlots`)
  → build the **region-clipped `nbhd`** → size `regionDone`.
- **Clue mechanic**: `clue[i]` = number of light cells in `nbhd[i]` (the 3×3 centred on `i`,
  clipped to `i`'s region, self included). Clues never cross a region border or enter a plot.
- **`weaveTexture()`** (~1365): shelter flat 5×5 pockets (the only place 0/9 clues live), sprinkle
  cross-stitch specks into flat fields, **then call `repairTexture()`**; returns a flip count.
- **`repairTexture()` / `repairRegion()` / `repairPicross()`**: THE zero-given mechanism. Runs the
  same counting solver used at clue-gen (basic 3×3 counting) over each region and a line solver over
  each picross patch; wherever they stall on a genuinely ambiguous spot, it **flips a few `sol`
  pixels** (greedy minimal flips, then a provably-terminating "flatten toward the region's majority
  colour" fallback) until every region is basic-counting solvable and every picross line-solvable —
  **with no locked cells**. Because it targets the *weakest* solver (basic counting, all clues
  shown), every difficulty tier is then solvable with zero givens. `sol` is frozen afterward.
- **`regenClues(done)`** (~ mid-file): resets `clue`/`locked`, runs `setupPicross`/`regenZones` on
  the main thread, then generates the per-region fill-a-pix clues in a **Web Worker**
  (`makeClueWorker` serializes `mulberry32` + `genRegionClues` into a Blob; posts `sol`/`regionOf`).
  `syncRegen` is the main-thread fallback (used when Workers are unavailable or `?nowork=1`). The
  worker posts per-region `{progress}` (drives the bar) then the final `clue`/`locked`.
- **`genRegionClues(r)`**: compute true `val` per cell, then greedily *thin* clues while
  `solvesWith(active)` still succeeds (`basicPass` counting; `advancedPass` cross-clue subtraction
  on Hard+ only). `extremeKeep` re-shows some 0/9 clues on easy tiers. A demoted
  **`console.warn` fallback** would reveal givens if the solver ever stalled — it should never fire
  in-game (repair prevents it); if it does, that's a regression. `setupPicross` has the analogous
  demoted fallback.
- **`DIFF`** (~920) fields per tier: `redundancy` (spare clues kept), `passes`, `extremeKeep`,
  `zGivens` (sudoku givens scale), `zSwaps` (jigsaw irregularity), `pRuns`/`pRounds` (picross patch
  shaping, below), `basicOnly` (true for Very Easy/Easy/Medium = counting only), `label`.
  **`pHelp` was removed** (no picross head-starts). Switching tiers re-runs `regenClues` only —
  `sol` is untouched **outside the picross patches**, so player marks survive.
- **Picross difficulty = `shapePicross()`.** A nonogram's clue strips *are* its answer: there is
  nothing redundant to thin the way `genRegionClues` thins fill-a-pix clues, and pre-filling tiles
  is barred by the zero-given guarantee. So its difficulty lives in the patch's own run structure,
  and the patch interior is reshaped per tier toward `pRuns` (average runs per line) and `pRounds`
  (full row+column propagation sweeps needed from blank — the truer measure; run count and
  propagation depth pull against each other, so `pRuns` plateaus ~2.5 at the top tiers).
  This is safe **only** because a patch is an island: `nbhd` is region-clipped and clues never enter
  a plot, so no clue anywhere reads a patch pixel (assert: 0 clue neighbourhoods touch one), and the
  revealed art comes from `cellCol`, not `sol`.
  - The search is a seeded greedy hill-climb over single-pixel flips that **only ever accepts a
    fully line-solvable grid** — so `?audit=1` still passes at every tier, with `locked` 0.
  - It always starts from **`capturePicBase()`** (the post-`weaveTexture` interiors), never from
    whatever the last tier left in `sol` — otherwise a patch would depend on which tiers you passed
    through and two peers could disagree. Called at every board-build site (`prepareSolution` on both
    hit and miss, and `auditGivens`).
  - **`picTier[]`** = which tier each patch currently sits at. Authoritative on entry to
    `regenClues`; only `setDifficulty` passes `retier` (untouched patches follow the new tier,
    started ones keep their shape). Set by `loadPicTier()` on a fresh board (from `picKey()`, but
    only for patches with saved marks) and by `importCode` from the payload. It rides in
    **`SHARE_VER` 6** because a recipient — including a co-op guest — regenerates locally before
    replaying progress, so it must rebuild the *sender's* patches or every mark inside one reads as
    a mistake.
- **Verification**: `auditGivens()` / `?audit=1` (~2063) rebuilds all maps × tiers and asserts
  `locked` count 0, every region solvable from shipped clues, every picross line-solvable.

---

## 5. The loading animation

Replaces the old progress bar; drawn on the game canvas while the clue worker runs (main thread is
otherwise idle). All state is in **`GEN`** (~1924): `{active, t0, clueReadyAt, done, kind, tl,
progress, _pct, _hdr}`.

- **`beginGen(kind, done, cached)`**: `kind` ∈ `'load' | 'map' | 'diff'`. When `cached` is set (this
  map+tier's clues came from the cache, §7) the timeline is `GTL_CACHED` instead — ~901ms total, or
  ~461ms on a `'diff'` switch that skips the bloom — with **no `sc` board-size scaling**, so a cached
  Inferno is no slower than a cached Castle. The shimmer collapses to a flicker because its only job
  is masking worker time. Every `GTL_CACHED` divisor stays non-zero (`drawGen` divides by `regDur`,
  `shimIn`, `settle`). Computes region centroid ranks
  (`genPrep`), a **per-run timeline `GEN.tl`** = `GTL_BASE` with the *initial* phases (bloom,
  shimmer ramp) scaled by board size `sc = clamp(N/7680, 1, 2.5)` (bigger map = slower reveal; the
  thinning/settle phases stay fixed since they're gated on real data), fits the camera (except
  `'diff'`, which keeps the player's view), shows the loader top card, adds `body.generating`, and
  starts the loop. **Skip was removed** — there is no skip listener.
- **`drawGen(now)`**: three staged beats — territories **bloom** in (region tint + borders + plots,
  by centroid order) → **compute-shimmer** (every organic cell shows `genScramble(i,rel)` random
  digits — *not* the true counts, so nothing is spoiled) → **thin** (a sweep where non-clue cells
  fade out and real clues crystallize from `clue[]`). On a `'diff'` switch, already-solved regions
  keep their revealed art (`regionDone[r]` → paint `cellCol`). Numbers only render at cell size ≥ 9.
- **`genThinBeginRel()` / `genDoneNow()`**: completion gating — the thinning can't start (and the
  animation can't finish) before the worker returns (`clueReadyAt`), and there's a minimum
  choreographed duration so fast/cached maps still get a satisfying show.
- **`genComplete()`**: sets `GEN.active=false`, removes `body.generating`, marks the loader done,
  and runs `GEN.done` (→ `finishSetup` / the map/diff callback).
- **`genUpdateHeader(phase, pct)`**: updates the **top card** DOM — `#genPanel` (opaque card so the
  title/subtitle/bar stay readable over the moving board), `#loadBar` width from `GEN.progress`, and
  the subtitle "`phase · NN%`". Loader CSS: `#loader.gen` is transparent + `pointer-events:none` (so
  scroll reaches the canvas to zoom), `body.generating` hides `#hud`/`#controls`/`#toast`.
- **Input during load**: gameplay input is gated on `GEN.active` (`keydown`/`mousedown`/`mousemove`/
  `wheel`), and `scheduleSave` bails — so a half-generated board is never mutated or persisted. The
  **camera stays live**: wheel, `+`/`−`, `F` zoom/fit, and **middle-button (or space) drag pans**
  the board while it loads (the pan branches sit *above* the `GEN.active` gate in `mousedown`/
  `mousemove`).

---

## 6. Rendering & input

- **`loop(now)`** (~ late file): the single rAF loop (started once via `startLoop()`). If
  `GEN.active` it calls `drawGen` and returns; otherwise it advances camera tweens, runs the
  auto-solve queue / hint pulse, and draws only when `needsDraw` or an animation is in flight.
- **`draw()` → `drawViewport(player, now, …)`** (~3513): paints cells (region tint, or
  light/dark from `state`, or the pixel-art **reveal cross-fade** timed by
  `(now - regionDoneAt[r]) / 900`), the fine grid, clue **numbers** (skipped once a region is
  revealed; fade when satisfied, red when contradicted), thick **region borders**, and the sudoku/
  picross plots.
- **Camera**: per-player `view {x,y,s}`; `fitView`, `zoomCenter`, wheel zoom (instant), `animateView`
  (450ms cubic tween), pan. Solo = one player full-screen; local co-op splits into panes.
- **Input**: `cvs` `mousedown`/`mousemove`/`wheel`, window `keydown`. `setCell(i, s)` is the single
  board-mutation choke point (guards on `regionDone`, `gameWon`, `locked`, `zoneOf`); it updates
  `state`, the `wrong` set, calls `checkRegion`, `scheduleSave`, `netEmit`. (`GEN.active` isn't
  checked inside `setCell` — it's gated upstream in the input handlers + `scheduleSave`; see §5/§8.)

---

## 7. State, sharing, multiplayer, QoL

- **Save** (per map, autosave): `stateKey()` = `proverbs2-<map>-v3`, `zonesKey()` = `…-plots`,
  `timerKey()` = `…-time` (accumulated play-time, see §10). `scheduleSave()` (debounced; bails when
  an online *joiner* or during `GEN.active`) writes `state` + zone entries + the timer to
  `localStorage`; `loadSave()` restores them (and `timerBase`) and recomputes the `wrong` set against
  the current `sol`. Other keys: `MAP_KEY` (`proverbs2-map`, last map), `DIFF_KEY` (default tier),
  `THEME_KEY` (`proverbs2-hue`), `MAP_SORT_KEY`, `LAST_SOLO_KEY` (Continue target), `MUSIC_VOL_KEY`,
  `MUSIC_ON_KEY` (`proverbs2-musicon`, persisted on/off), `PAD_KEY`, `proverbs2-quotes`,
  `proverbs2-advseen`. `saveNow()` is the immediate (non-debounced) write; `scheduleSave` debounces
  onto it, and `pagehide`/`visibilitychange` flush it so the last stitch survives a fast close.
  *After the zero-given change, an old save may have a few marks that now mismatch a repaired `sol`
  pixel — they surface as mistakes; "Clear my errors" fixes them.*
- **Board cache** (IndexedDB, `proverbs2-boards`): the *generated board* is persisted so a revisit
  skips the expensive stages. Measured cost of a cold build: `weaveTexture`+`repairTexture` 0.6–2.1s,
  and the clue worker 1.1s (Castle/Medium) to **35s** (Angels/Medium) — Very Hard is ~6.5× Medium.
  Everything else rebuilds in <50ms total, so **only two arrays are cached**:
  - `sol[]` — keyed by **map** (`sol|<map>|<seed>|<GW>x<GH>|<BOARD_COMPAT>`). Frozen after
    `repairTexture`, hence identical on every tier. A hit skips `weaveTexture()`.
  - `clue[]` — keyed by **map + difficulty** (`clue|…|<difficulty>|<BOARD_COMPAT>`). A hit skips the
    worker. `locked` is restored as all-zero (it must be); picross/sudoku clue cells are *not* taken
    from the blob — the restore loop is organic-cells-only, mirroring the worker merge.

  `sol` records are never evicted (~125KB for all 8 maps); `clue` is LRU-capped at `BCACHE_CLUE_MAX`
  (12). Entry points: `prepareSolution()` wraps `weaveTexture` at the two drivers (`startGeneration`,
  `rebuildForMap`); `regenClues()` consults the cache and falls back to `regenCluesFresh()`.
  `clueCacheProbe()` decides whether `beginGen` gets the short `GTL_CACHED` beat (§5).
  Every helper resolves to `null`/no-op on any failure, so blocked storage just means no cache.
  **`clueMatchesSol()` re-derives every restored clue from the restored `sol` and rejects the whole
  entry on any mismatch** — that's what makes a forgotten `BOARD_COMPAT` bump self-healing.
  `?nocache=1` bypasses the cache; `?audit=1` disables it (`BCACHE_OFF`) so the audit always
  exercises real generation.
- **Share**: `exportCode()` / `importCode()` / `applyImported()` (~2558+); `SHARE_VER = 6` — v6 adds
  the per-patch **picross tiers** (`picTier`, §4) after the zone blocks, because the recipient
  regenerates the board locally before replaying progress. v3/v4/v5 still decode (`pics` = null →
  shape every patch at the code's own difficulty). Older note: `SHARE_VER = 5` — v5
  encodes the map by **id** (`[2]`=idLen, then ASCII id), so reordering `MAPS` no longer corrupts a
  code. v3/v4 codes still decode via the **frozen** `LEGACY_MAP_IDS` table (the v4 `MAPS` order) —
  never edit it. Exports the whole canvas as a `NPXS…` code or `.npxs` file; import replays progress.
- **Multiplayer**: `net` transport + `onlineRole` (`'host'|'join'`); `PROTO_V = 1`;
  `netEnvelope`/`netSend`/`netEmit` (~3217). A `hello`/`hello-ack` handshake requires matching
  **`BOARD_COMPAT`** (bumped only on generation/share/protocol changes — *not* `APP_VERSION`, so UI
  releases don't break co-op). Host owns the canonical save; only the host may push `snapshot`/
  `resync` (guarded on `hostPid`). **Undo is per-player in co-op**: each player has its own
  `pl.editStack` of authored edits, and `undoOwn` reverts only that player's tiles/digits (skipping
  teammate-changed cells and already-completed regions), replaying the reverse through the normal
  move channel — solo keeps the whole-board snapshot `undoStack`. `saveCoopToLocal()` (~3342) lets a
  guest keep the shared board as their own solo save. Local split-screen co-op uses `players[]`/
  panes; `coop`/`online` flags distinguish modes.
- **Per-contributor co-op events**: every mark records **who placed it** in `cellOwner[i]`
  (`'me'` = this machine's local player/solo, `'L'+id` = a local split-screen seat, or a peer's
  **pid**; zones use `zone.owner[]`), set via `ownerForEdit()` off `coopActor` (local input) /
  `remoteOwner` (set in `applyRemote`). This drives audience routing so events go only to whoever
  earned them: **mistakes** (`maybeMistakePrompt`) count each owner's own wrong cells — solo/online
  show the shared `#mistakeModal` for *your* four, local split-screen shows a **pane card**; a
  teammate's four raises an online **notice**. **Region quotes** (`dispatchQuote` ← `maybeShowQuote`)
  go to `regionContributors(r)`: contributors get the modal / pane card, online non-contributors get
  a **"Player X finished a region" notice** with a *View quote* button. `clearErrors(seat?)` sweeps
  only that owner's tiles, and the co-op `{t:'clear'}` move now means "sender clears **their own**"
  (⚠ `BOARD_COMPAT` bump). Pane cards live in `#paneCards` (`layoutPaneCards` pins them to
  `localPaneRect`); online notices in `#coopNotes`. Reset every board-swap path (`cellOwner.fill`,
  `zone.owner=null`, `mistakeFlagged.clear()`, `clearPaneCards`/`clearCoopNotes`).
- **QoL**: `pushUndo`/`undo`/`clearUndo` (solo = whole-stroke snapshots; co-op = per-player authored
  edits, see §7 multiplayer); `giveHint(pl)` (~2830) points at
  a forced move near the cursor; auto-solve via `solving`+`solveQueue` (PIN-gated); mistake handling
  via the `wrong` set + `checkRegion`/`checkWin` + a forgiving modal; the **per-map play timer** and
  **Options/theming** (§10); gamepad support.
- **Quotes**: `MAP_QUOTES[map][regionId]`; `maybeShowQuote()` (~2344) fires when a region *and* its
  attached plots are done; clicking a finished region replays it.

---

## 8. Invariants & gotchas (don't break these)

1. **`sol` is frozen after `weaveTexture()`/`repairTexture()` — except inside picross patches.**
   A difficulty switch re-runs `regenClues` only and re-derives everything from `sol`, so player
   marks persist. Never rebuild `sol` on a difficulty change. The one carve-out is `shapePicross()`
   (§4), which rewrites *patch interiors* per tier; that is safe because no clue can see a patch
   pixel and the art comes from `cellCol`, and it never touches a patch the player has started.
   Everything the cache stores is the **pre-shaping** `sol`, so the cached bytes stay
   tier-independent.
2. **`nbhd` is region-clipped** — that clipping *is* the clue rule. Changing it changes every clue.
3. **`locked[]` must stay empty.** The zero-given guarantee comes from `repairTexture`; the given
   loops in `genRegionClues`/`setupPicross` are demoted `console.warn` fallbacks — if they ever fire
   in-game it's a regression. `?audit=1` is the guardrail.
4. **The clue Worker must stay self-contained.** `makeClueWorker` serializes `genRegionClues` (and
   any helper it calls) by `.toString()`; a new dependency that isn't serialized breaks *only* the
   worker path (the sync fallback masks it). Keep `genRegionClues` closure-free re: worker.
5. **Hand-layout region ids are used verbatim** (not recompacted) so they align with `MAP_QUOTES`
   keys and saved region-done flags. Don't renumber them.
6. **`APP_VERSION`** (top of the script, echoed bottom-right) marks the deployed version — bump it
   with any shipped change and keep `CHANGELOG.md` in sync. Online co-op is gated on **`BOARD_COMPAT`**
   (next to it), NOT `APP_VERSION`; bump `BOARD_COMPAT` only when generation, the share/snapshot
   format (`SHARE_VER`), or the net protocol changes, and leave `LEGACY_MAP_IDS` frozen forever.
   ⚠ **`BOARD_COMPAT` is also the board cache's invalidation key** (§7) — a generation change without
   a bump would hand players a stale board. `clueMatchesSol()` catches most of that automatically, but
   it *cannot* catch a clue set thinned by a **stronger** solver than the current code has (i.e. if you
   weaken the solver). Bump it when generation output changes.
7. **The dev tools are generated** from `index.html` via string-marker extraction. `_build_editor.js`
   splits on Block A (`'use strict';` → `// ---------- canvas / view ----------`), Block B
   (`function sampleImage(image){` → `function weaveTexture(){`), Block C
   (`function genRegionClues(r){` → `function applyGivens(){`). If you rename those boundary
   functions, update the builders and rerun them.
   ⚠ The checked-in `region-editor.html` / `region-map.html` are **stale relative to master** (they
   predate the Inferno map), so rerunning a builder emits a large diff that has nothing to do with
   your change — mostly `IMG_SRC_8`. Only rebuild when you actually touched a block boundary or the
   editor's own source, and `git checkout --` them otherwise; refreshing them is its own commit.
8. **Pages deploys one at a time.** Don't trigger concurrent deployments (empty re-trigger commits /
   forced builds) — the deploy job fails with "Deployment failed, try again later." One clean push;
   re-run the *failed run* if it flakes.

---

## 9. Where to change X

| Task | Where |
|---|---|
| Add a map | `MAPS` array (by hand) or the editor + `node _bake_map.js` |
| Add/adjust quotes | `MAP_QUOTES[mapId]` keyed by region id |
| Tune difficulty | the `DIFF` table (`redundancy`/`extremeKeep`/`zGivens`/`zSwaps`/`basicOnly`) |
| Tune picross difficulty | `DIFF[tier].pRuns`/`.pRounds` + `shapePicross`/`picrossProfile` (§4). Verify with `?audit=1` — the shaping must never make a patch unsolvable |
| Tune the loading animation | `GTL_BASE` (timeline), the `sc` scale in `beginGen`, `drawGen`; `GTL_CACHED` for the short cache-hit beat (keep every divisor non-zero — `drawGen` divides by `regDur`/`shimIn`/`settle`) |
| Board caching / eviction | the board-cache block just above `startGeneration` (§7); `BCACHE_CLUE_MAX`, `clueMatchesSol`, `prepareSolution`, `regenCluesFresh` |
| Change colours / theme | edit `:root` HSL vars (CSS chrome) **and** `buildPalette()` (canvas `C` + `TINTS`) together; both key off `--hue`/`themeHue`. Add/adjust theme swatches in `THEME_PRESETS` (§10) |
| The home menu / map grid | §10 — `#menuScreen` markup, `showMenu`/`menuShowView`/`menuOpenGrid`/`menuPlay`, sort in `menuSortedIds` |
| The play timer | §10 — `timerTotal`/`timerPause`/`persistTimer`, `timerKey()` |
| Change the clue rule | `nbhd` construction in `buildLayout` (⚠ affects everything) |
| Solvability logic | `repairTexture`/`repairRegion`/`repairPicross` and the `genRegionClues` solver |
| Verify a change | `?audit=1` (all maps × tiers); syntax-check the inline script under Node |
| Ship it | bump `APP_VERSION`, add a `CHANGELOG.md` entry, rebuild dev tools if blocks changed, one clean push |

---

## 10. Home menu, Options, theming & the play timer

Everything here is chrome around the generation core — none of it touches `sol`/`clue`/`nbhd`, so
`?audit=1` is unaffected.

### Home menu (`#menuScreen`)
- **Landing screen** (see §2). A vertical button stack — **Single Player · Co-op · Continue · Options ·
  Credits** — over swappable sub-views. `MENU = {view, mode, stepVal, …}` is the state; `menuShowView(v)`
  toggles the `.menuView` divs (`home`/`credits`/`coopMode`/`onlineChoice`/`grid`).
- **Map grid**: `menuOpenGrid(mode)` (`'solo'|'local'|'host'`) configures the title + player/guest
  stepper and shows cards built once by `menuBuildGrid()`. Each card's thumbnail is drawn by
  `menuRenderCard(id)` (region tint fill + gold borders, cached per `id@hue`); `menuPaintCards()`
  repaints them on a theme change. Card **counts** come from `MAP_META[id]` (`regions`/`cells`), baked
  once from the deterministic pipeline (watershed maps also bake `PREVIEW_RLE`; hand maps reuse
  `HAND_LAYOUTS[id].regionRLE`).
- **Sort**: `#mapSort` → `menuSortedIds()` (A–Z/Z–A via `name.localeCompare` — map names now end with
  their emoji so this sorts naturally; newest/oldest via `MAP_ADDED_ORDER`; most/fewest via
  `MAP_META.cells`), reordered in the DOM by `menuApplySort()`, persisted to `MAP_SORT_KEY`.
- **Launch**: `menuPlay(id)` tears down any live session, records `LAST_SOLO_KEY` (solo only), sets
  `pendingAfterGen` (co-op start), then `menuLaunch(id)`. **Continue** (`menuContinue`) resumes
  `LAST_SOLO_KEY`. Online host/join **delegate to the existing `#onlineModal`** so all code-sharing UI
  is reused. Reopened mid-game via the header **🏠 Menu** button.

### Options (`#optionsModal`) — opened from 🏠 menu footer and the toolbar **⚙ Options**
- **Interface colour**: `THEME_PRESETS` swatches + a hue slider both call `applyTheme(hue, persist)`,
  which sets the CSS custom property `--hue`, runs `buildPalette()` (recomputes the canvas `C` palette
  and `TINTS` from `themeHue` via `hsl2rgb`/`themed`), re-runs `assignRegionTints()` on a live board,
  and repaints menu cards. **Only the purple/accent family + accent2 + region tints shift**; gold
  (sudoku), teal (picross) and red (errors) are intentionally fixed. Persisted to `THEME_KEY`.
  ⚠ CSS chrome (`:root`) and the JS palette are two halves of one system — change both together.
- **Music**: `toggleMusic()`/`setMusicVol()` are shared by the header player and the Options controls;
  `setMusicUI()` updates both. **Default difficulty**: `setDefaultDifficulty()` (reweaves if a board is
  live, else just sets `difficulty`). **Controller**: `openPad()` opens the same `#padModal` (the 🎮
  header button moved into Options).

### Play timer (per map, persistent)
- Total = `timerBase` (banked ms, loaded from `timerKey()`) + live delta (`Date.now() - timerStart`,
  `-1` = paused). `timerTotal()` reads it; `updateTimer()` renders in the `loop`.
- **Starts/resumes** on the first stitch (`setCell`). **Pauses + banks** (`timerPause()` → folds delta
  into `timerBase`, persists) on: opening the menu (`showMenu`), switching maps (`loadMap`), tab hidden
  (`visibilitychange`) and page close (`pagehide`). `persistTimer()` no-ops before a board exists and
  for online joiners. So closed/background/menu time is never counted, and returning never resets to 0.
