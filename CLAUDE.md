# CLAUDE.md — architecture map

Orientation for a new person or AI working on **One More Tile: The Emergent Canvas**. It explains how the
code is laid out, how a board goes from image → puzzle → play, the key state, and the invariants you
must not break. Player-facing docs live in [README.md](README.md); the shipped-change log is
[CHANGELOG.md](CHANGELOG.md).

> Anchors below are **function/global names** (stable) with occasional `~line` hints (drift as the
> file changes — search by name, don't trust the number). Everything is in `index.html` unless noted.

---

## 1. The shape of the project

- **`index.html`** — the entire game: HTML + CSS + one big inline `<script>` (~4,350 lines). No
  modules, no bundler, no dependencies. Open it in a browser and it runs. This is the only shipped
  file (plus its embedded image data URIs).
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
- Syntax check: extract the inline `<script>` and `new vm.Script(src)` it under Node.

---

## 2. Lifecycle: boot → generate → play

`img.onload → startGeneration()` (~1301), **unless** `AUDIT_MODE` (`?audit=`) which skips normal
boot and lets `auditGivens()` drive the pipeline. The pipeline (same for first load, `rebuildForMap`
on map switch, and — minus the `sol` stages — `setDifficulty`):

```
sampleImage(img)      image → sol[] (light/dark) + cellCol[] (art) + edge[]
buildLayout()         plots, regions (watershed or hand layout), nbhd[]
weaveTexture()        cross-stitch texture, THEN repairTexture() → sol[] frozen
beginGen(kind, done)  starts the loading animation (see §5)
regenClues(genClueReady)   spawns the clue Worker; genClueReady fires when it returns
   … the animation plays while the worker thins clues off-thread …
genComplete() → done()     handoff: finishSetup (load) / callbacks (map, diff)
```

`finishSetup()` (~1889): `generated = true`, `loadSave()`, `applyGivens()`, re-check regions, start
the render `loop()`. After this, gameplay is live and `loop()` runs continuously.

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
| `GEN`, `GTL_BASE` | object/const | loading-animation state machine + base timeline (see §5) |
| `players[]`, `dpr`, `needsDraw`, `C`, `TINTS` | — | cameras, DPR, dirty flag, palette, region tints |
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
- **`DIFF`** (~516) fields per tier: `redundancy` (spare clues kept), `passes`, `extremeKeep`,
  `zGivens` (sudoku givens scale), `zSwaps` (jigsaw irregularity), `basicOnly`
  (true for Very Easy/Easy/Medium = counting only), `label`. **`pHelp` was removed** (no picross
  head-starts). Switching tiers re-runs `regenClues` only — `sol` is untouched, so player marks
  survive.
- **Verification**: `auditGivens()` / `?audit=1` (~2063) rebuilds all maps × tiers and asserts
  `locked` count 0, every region solvable from shipped clues, every picross line-solvable.

---

## 5. The loading animation

Replaces the old progress bar; drawn on the game canvas while the clue worker runs (main thread is
otherwise idle). All state is in **`GEN`** (~1924): `{active, t0, clueReadyAt, done, kind, tl,
progress, _pct, _hdr}`.

- **`beginGen(kind, done)`**: `kind` ∈ `'load' | 'map' | 'diff'`. Computes region centroid ranks
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

- **Save** (per map, autosave): `stateKey()` = `proverbs2-<map>-v3`, `zonesKey()` = `…-plots`.
  `scheduleSave()` (~2479, debounced; bails when an online *joiner* or during `GEN.active`) writes
  `state` + zone entries to `localStorage`; `loadSave()` (~2493) restores them and recomputes the
  `wrong` set against the current `sol`. *After the zero-given change, an old save may have a few
  marks that now mismatch a repaired `sol` pixel — they surface as mistakes; "Clear my errors" fixes
  them.*
- **Share**: `exportCode()` / `importCode()` / `applyImported()` (~2558+); `SHARE_VER = 4` (2-byte
  board dims). Exports the whole canvas as a `NPXS…` code or `.npxs` file; import replays progress
  and completed regions.
- **Multiplayer**: `net` transport + `onlineRole` (`'host'|'join'`); `PROTO_V = 1`;
  `netEnvelope`/`netSend`/`netEmit` (~3217). A `hello`/`hello-ack` handshake **requires matching
  `APP_VERSION`** between peers. Host owns the canonical save; `snapshot`/`resync` sync state;
  `saveCoopToLocal()` (~3342) lets a guest keep the shared board as their own solo save. Local
  split-screen co-op uses `players[]`/panes; `coop`/`online` flags distinguish modes.
- **QoL**: `pushUndo`/`undo`/`clearUndo` (whole-stroke snapshots); `giveHint(pl)` (~2830) points at
  a forced move near the cursor; auto-solve via `solving`+`solveQueue` (PIN-gated); mistake handling
  via the `wrong` set + `checkRegion`/`checkWin` + a forgiving modal; a play timer; gamepad support.
- **Quotes**: `MAP_QUOTES[map][regionId]`; `maybeShowQuote()` (~2344) fires when a region *and* its
  attached plots are done; clicking a finished region replays it.

---

## 8. Invariants & gotchas (don't break these)

1. **`sol` is frozen after `weaveTexture()`/`repairTexture()`.** A difficulty switch re-runs
   `regenClues` only and re-derives everything from `sol`, so player marks persist. Never rebuild
   `sol` on a difficulty change.
2. **`nbhd` is region-clipped** — that clipping *is* the clue rule. Changing it changes every clue.
3. **`locked[]` must stay empty.** The zero-given guarantee comes from `repairTexture`; the given
   loops in `genRegionClues`/`setupPicross` are demoted `console.warn` fallbacks — if they ever fire
   in-game it's a regression. `?audit=1` is the guardrail.
4. **The clue Worker must stay self-contained.** `makeClueWorker` serializes `genRegionClues` (and
   any helper it calls) by `.toString()`; a new dependency that isn't serialized breaks *only* the
   worker path (the sync fallback masks it). Keep `genRegionClues` closure-free re: worker.
5. **Hand-layout region ids are used verbatim** (not recompacted) so they align with `MAP_QUOTES`
   keys and saved region-done flags. Don't renumber them.
6. **`APP_VERSION`** (top of the script, echoed bottom-right) gates online co-op and marks the
   deployed version — bump it with any shipped change and keep `CHANGELOG.md` in sync.
7. **The dev tools are generated** from `index.html` via string-marker extraction. `_build_editor.js`
   splits on Block A (`'use strict';` → `// ---------- canvas / view ----------`), Block B
   (`function sampleImage(image){` → `function weaveTexture(){`), Block C
   (`function genRegionClues(r){` → `function applyGivens(){`). If you rename those boundary
   functions, update the builders and rerun them.
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
| Tune the loading animation | `GTL_BASE` (timeline), the `sc` scale in `beginGen`, `drawGen` |
| Change colours | the `C` palette / `TINTS` |
| Change the clue rule | `nbhd` construction in `buildLayout` (⚠ affects everything) |
| Solvability logic | `repairTexture`/`repairRegion`/`repairPicross` and the `genRegionClues` solver |
| Verify a change | `?audit=1` (all maps × tiers); syntax-check the inline script under Node |
| Ship it | bump `APP_VERSION`, add a `CHANGELOG.md` entry, rebuild dev tools if blocks changed, one clean push |
