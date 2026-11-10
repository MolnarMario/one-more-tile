#!/usr/bin/env node
/* ============================================================================
 * _check_map_release.js — the gate for a map-only release. <1s, no browser.
 *
 *   node _check_map_release.js <map-id> --payload <dir> [--base <ref>] [--ship]
 *
 * A new map is pure data. If every byte of the release outside that map's own
 * records is identical to a release that already passed ?audit= and
 * ?verifybake=, then every OTHER map still runs the same code on the same
 * data, and those passes still hold — no need to re-run hour-long browser
 * passes on maps you didn't touch. This script checks exactly that, and that
 * the new map's own data is sound.
 *
 * 1. ISOLATION — the working tree vs --base (default: origin/master, i.e. the
 *    live release; it must be a release that passed its checks):
 *    - index.html: delete the map's own records (its IMG_SRC const, its MAPS
 *      row, its one-line records in MAP_META / HAND_LAYOUTS / MAP_QUOTES /
 *      BAKED_LAYOUT / BAKED_SOL), drop it from MAP_ADDED_ORDER, put the old
 *      APP_VERSION value back → must be BYTE-IDENTICAL to base. So: no shared
 *      code changed, no other map's record changed, GEN_COMPAT / BOARD_COMPAT
 *      / BAKED_COMPAT did not move, existing MAPS rows kept their order.
 *    - each of those own lines (and boards/<id>.js) must be EXACTLY what
 *      _map_lib.js's `canon` regenerates from its parsed value — pure data,
 *      so nothing can ride along after a record and escape the comparison.
 *    - a new map must be APPENDED to MAPS and to MAP_ADDED_ORDER.
 *    - files: only index.html, boards/<id>.js, *.npxsmap.json and the docs
 *      may differ from base — tracked or untracked. Every other boards/*.js
 *      is therefore byte-identical too.
 * 2. THE MAP'S DATA — strictly (fail closed): id/name/quotes, dims vs MAXN,
 *    the partition exactly as the game will consume it (no healRegions
 *    rewrite, plot mask exact), MAP_META arithmetic, the inline sol, every
 *    tier of boards/<id>.js (stamp, size, `n`, no clue on a plot cell, every
 *    clue obeys the clue rule against sol).
 * 3. PAYLOAD — the folded bytes equal <dir>/<id>.bake.json byte for byte, and
 *    that payload carries a passing bake-time audit (locked / unsolved /
 *    picross 0 on every tier). That audit is what replaces a separate ?audit=
 *    run; the byte match is what replaces ?verifybake= for a new map.
 * 4. SHIP (TODOs, fatal with --ship): APP_VERSION bumped, CHANGELOG entry.
 *
 * What it can NOT prove: that the base was sound (use a release that passed),
 * or behaviour that only exists at runtime — shared loops over MAPS see one
 * more map. `node _headless.js smoke` covers that half. It also cannot tell an
 * older client in a co-op session that the map exists (see CLAUDE.md §9).
 * ==========================================================================*/
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const lib = require('./_map_lib.js');

const ROOT = __dirname;
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
const flag = k => args.includes('--' + k);
const id = args.find((a, i) => !a.startsWith('--') && !(i > 0 && /^--(payload|base)$/.test(args[i - 1])));
if (!id){ console.error('usage: node _check_map_release.js <map-id> --payload <dir> [--base <ref>] [--ship]'); process.exit(2); }
if (!lib.ID_RE.test(id)){ console.error('! "' + id + '" is not a valid map id (' + lib.ID_RE + ')'); process.exit(2); }

const fails = [], todos = [], oks = [];
const fail = m => fails.push(m), ok = m => oks.push(m), todo = m => todos.push(m);
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });

// ---- inputs -------------------------------------------------------------------
const baseRef = opt('base') || 'origin/master';
let baseSha;
try { baseSha = git('rev-parse', '--verify', baseRef + '^{commit}').trim(); }
catch (e) { console.error('! base ' + baseRef + ' not found (git fetch first, or pass --base <ref>)'); process.exit(2); }
const cur = lib.toLF(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
const base = lib.toLF(git('show', baseSha + ':index.html'));
const curL = cur.split('\n'), baseL = base.split('\n');
const TABLES = ['MAP_META', 'HAND_LAYOUTS', 'MAP_QUOTES', 'BAKED_LAYOUT', 'BAKED_SOL'];

const curRows = lib.mapsRows(curL).rows, baseRows = lib.mapsRows(baseL).rows;
const row = curRows.find(r => r.id === id);
const isNew = !baseRows.some(r => r.id === id);
if (!row){ console.error('! "' + id + '" is not in MAPS'); process.exit(2); }

// ---- 1. isolation: index.html ------------------------------------------------------
// the lines that belong to `id` alone, in a given copy of index.html
function ownLines(L, rows){
  const own = new Map();                      // line index → what it is
  const r = rows.find(x => x.id === id);
  if (!r) return own;
  own.set(r.line, 'MAPS row');
  if (r.src){
    const refs = L.filter(l => new RegExp('\\b' + r.src + '\\b').test(l));
    const defs = L.map((l, i) => [l, i]).filter(([l]) => l.startsWith('const ' + r.src + ' = '));
    if (defs.length !== 1) fail('image const ' + r.src + ' must be defined exactly once (found ' + defs.length + ')');
    else if (refs.length !== 2) fail('image const ' + r.src + ' is referenced ' + (refs.length - 1) + ' times — it must belong to this map alone');
    else own.set(defs[0][1], r.src);
  }
  for (const t of TABLES){
    const b = lib.findBlock(L, t);
    if (!b) { fail(t + ' block not found'); continue; }
    const hits = lib.recordLines(L, b, id);
    if (hits.length > 1) fail(t + ' has ' + hits.length + ' records for "' + id + '"');
    for (const i of hits){
      if (!lib.recordJSON(L[i]) && t !== 'MAP_META') fail(t + ' record for "' + id + '" is not a one-line JSON record');
      if (b.inlineClose && i === b.close) fail(t + ' record for "' + id + '" carries the table\'s closing `};` — insert it elsewhere');
      own.set(i, t);
    }
  }
  return own;
}
function strip(L, own, rows){
  const out = L.filter((_, i) => !own.has(i));
  // MAP_ADDED_ORDER: the id comes out; everything else must stay as it was
  const k = out.findIndex(l => l.startsWith('const MAP_ADDED_ORDER = ['));
  if (k >= 0) out[k] = out[k].replace(new RegExp(",\\s*'" + id + "'(?=\\s*[,\\]])|'" + id + "',\\s*"), '');
  return out;
}
const curOwn = ownLines(curL, curRows), baseOwn = ownLines(baseL, baseRows);

// Stripping a line is only safe if that line is pure data: a record could
// otherwise smuggle code after its value (`"x": {...}, BAKED_SOL.castle.b = …,`)
// that the byte comparison would never see. So every own line that is new or
// changed must be EXACTLY what lib.canon regenerates from its parsed value.
// (Lines identical to the base's own lines for this map are the trusted base.)
{
  const baseTexts = new Set([...baseOwn.keys()].map(i => baseL[i]));
  const keysAre = (o, ks) => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).join() === ks.join();
  for (const [i, what] of curOwn){
    const line = curL[i];
    if (baseTexts.has(line)) continue;
    let want = null;
    if (what === 'MAPS row'){
      if (row.layout === id && [row.seed, row.gw, row.gh].every(Number.isInteger) && typeof row.name === 'string') want = lib.canon.mapsRow(row);
    } else if (what === 'MAP_META'){
      const m = /^ {2}"[^"]+": \{ regions: (\d+), cells: (\d+), gw: (\d+), gh: (\d+) \},$/.exec(line);
      if (m && +m[2] === m[3] * m[4]) want = lib.canon.meta(id, +m[1], +m[3], +m[4]);
    } else if (TABLES.includes(what)){
      const v = lib.recordJSON(line);
      if (what === 'HAND_LAYOUTS' && keysAre(v, ['gw', 'gh', 'seed', 'regPix', 'regionRLE', 'zones', 'picross'])) want = lib.canon.hand(id, v);
      if (what === 'BAKED_LAYOUT' && keysAre(v, ['gw', 'gh', 'regPix', 'zones', 'picross', 'regionRLE'])) want = lib.canon.bakedLayout(id, v);
      if (what === 'BAKED_SOL' && keysAre(v, ['gw', 'gh', 'b'])) want = lib.canon.sol(id, v.gw, v.gh, v.b);
      if (what === 'MAP_QUOTES' && v && Object.values(v).every(s => typeof s === 'string')) want = lib.canon.record(id, v);
    } else {                                   // the image const
      const m = /^const [A-Za-z_$][\w$]* = ("[^"\\]*");$/.exec(line);
      const uri = m && JSON.parse(m[1]);
      if (uri && lib.DATA_URI_RE.test(uri)) want = lib.canon.img(what, uri);
    }
    if (want !== line) fail(what + ' line for "' + id + '" is not in the canonical form _bake_map.js / _bake_boards.js write (line ' + (i + 1) + ') — only a pure data record may follow the key');
  }
}

const a = strip(curL, curOwn, curRows), b = strip(baseL, baseOwn, baseRows);
// APP_VERSION: only its value may differ
const va = a.findIndex(l => /^const APP_VERSION = '/.test(l)), vb = b.findIndex(l => /^const APP_VERSION = '/.test(l));
const curVer = lib.constStr(cur, 'APP_VERSION'), baseVer = lib.constStr(base, 'APP_VERSION');
if (va >= 0 && vb >= 0 && a[va].replace(curVer, baseVer) === b[vb]) a[va] = b[vb];
if (a.join('\n') === b.join('\n')){
  ok('index.html: every byte outside "' + id + '"\'s ' + curOwn.size + ' own lines is identical to ' + baseRef + ' (' + baseSha.slice(0, 7) + ')' +
     (curVer !== baseVer ? ', except APP_VERSION ' + baseVer + ' → ' + curVer : ''));
} else {
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0; while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  const clip = s => s.length > 140 ? s.slice(0, 140) + '…' : s;
  const del = b.slice(i, b.length - j), add = a.slice(i, a.length - j);
  fail('index.html changed OUTSIDE "' + id + '"\'s own records — this is not a map-only release (around line ' + (i + 1) + '):\n' +
       del.slice(0, 6).map(l => '      - ' + clip(l)).join('\n') + (del.length > 6 ? '\n      - … ' + (del.length - 6) + ' more' : '') + (del.length ? '\n' : '') +
       add.slice(0, 6).map(l => '      + ' + clip(l)).join('\n') + (add.length > 6 ? '\n      + … ' + (add.length - 6) + ' more' : ''));
}
if (isNew){
  if (curRows[curRows.length - 1].id !== id) fail('a new map must be APPENDED to MAPS (it is row ' + (curRows.indexOf(row) + 1) + ' of ' + curRows.length + ') — MAPS[0] is mapDef()\'s fallback');
  const curOrder = lib.constStrArray(cur, 'MAP_ADDED_ORDER') || [], baseOrder = lib.constStrArray(base, 'MAP_ADDED_ORDER') || [];
  if (JSON.stringify(curOrder) !== JSON.stringify(baseOrder.concat(id))) fail('MAP_ADDED_ORDER must be the base list + "' + id + '" appended');
  const reserved = new Set((lib.constStrArray(base, 'LEGACY_MAP_IDS') || []).concat(baseOrder));
  if (reserved.has(id)) fail('"' + id + '" was used before (LEGACY_MAP_IDS / MAP_ADDED_ORDER) — ids are never reused');
} else {
  ok('"' + id + '" exists in base — checked as an UPDATE of that map (its old records may differ, nothing else may)');
}

// ---- 1. isolation: other files ------------------------------------------------------
const changed = git('diff', '--name-only', baseSha, '--').split('\n').filter(Boolean);
const untracked = git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean);
const DOCS = new Set(['CHANGELOG.md', 'README.md', 'RELEASE-NOTES.md', 'CLAUDE.md']);
const allowed = f => f === 'index.html' || f === 'boards/' + id + '.js' || DOCS.has(f) || /^[^/]+\.npxsmap\.json$/.test(f);
const stray = changed.concat(untracked).filter(f => !allowed(f));
if (stray.length) fail('files outside a map-only release differ from base (tracked or untracked):\n' + stray.map(f => '      ' + f).join('\n') +
                       '\n    (commit tooling changes separately; remove or ignore the rest)');
else ok('files: only ' + [...new Set(changed.concat(untracked))].join(', ') + ' differ from base — every other boards/*.js is byte-identical');

// ---- 2. the map's own data -------------------------------------------------------
const rec = t => { const b = lib.findBlock(curL, t); const i = b ? lib.recordLines(curL, b, id)[0] : undefined; return i === undefined ? null : curL[i]; };
if (curRows.filter(r => r.id === id).length !== 1) fail('"' + id + '" appears in MAPS more than once');
for (const e of lib.checkName(row.name)) fail('name: ' + e);
const MAXN = lib.maxN(cur), GEN_COMPAT = lib.constNum(cur, 'GEN_COMPAT'), BAKED_COMPAT = lib.constNum(cur, 'BAKED_COMPAT');
const DIFF_ORDER = lib.constStrArray(cur, 'DIFF_ORDER');
if (BAKED_COMPAT !== GEN_COMPAT) fail('BAKED_COMPAT ' + BAKED_COMPAT + ' != GEN_COMPAT ' + GEN_COMPAT + ' — the inline bake is being ignored');
if (!Number.isInteger(row.seed) || row.seed < 0 || row.seed > 0xFFFFFFFF) fail('MAPS seed must be an integer 0..2^32-1');

const handLine = row.layout ? rec('HAND_LAYOUTS') : null, bakedLayLine = rec('BAKED_LAYOUT');
let L = null;
if (row.layout){
  if (!handLine) fail('MAPS says layout: "' + row.layout + '" but there is no HAND_LAYOUTS record');
  else if (row.layout !== id) fail('layout key "' + row.layout + '" != id');
  else { L = lib.recordJSON(handLine); if (L && L.seed !== row.seed) fail('HAND_LAYOUTS seed ' + L.seed + ' != MAPS seed ' + row.seed); }
  if (bakedLayLine) fail('an authored map must not also have a BAKED_LAYOUT record');
} else if (bakedLayLine) L = lib.recordJSON(bakedLayLine);
else fail('no layout: neither HAND_LAYOUTS (layout:) nor BAKED_LAYOUT has a record — the partition would be grown at runtime, per browser');
const gw = row.gw != null ? row.gw : L && L.gw, gh = row.gh != null ? row.gh : L && L.gh;
const N = gw * gh;
let regionOf = null;
if (!Number.isInteger(gw) || !Number.isInteger(gh) || gw < 1 || gh < 1) fail('dims missing or invalid');
else if (N > MAXN) fail(gw + '×' + gh + ' = ' + N + ' cells > MAXN ' + MAXN);
else if (L){
  const lay = lib.checkLayout(L, gw, gh);
  for (const e of lay.errors) fail('layout: ' + e);
  regionOf = lay.regionOf;
  if (regionOf) ok('layout: ' + gw + '×' + gh + ', ' + L.regPix + ' regions, ' + L.zones.length + ' sudoku + ' + L.picross.length + ' picross; connected, plot mask exact');
}
const regCount = L ? L.regPix + (L.zones || []).length + (L.picross || []).length : 0;

const metaLine = rec('MAP_META');
if (!metaLine) fail('no MAP_META record — the menu grid throws without it');
else {
  const n = k => { const m = new RegExp('\\b' + k + ':\\s*(\\d+)').exec(metaLine); return m ? +m[1] : null; };
  if (n('regions') !== regCount) fail('MAP_META regions ' + n('regions') + ' != regPix + plots = ' + regCount);
  if (n('cells') !== N || n('gw') !== gw || n('gh') !== gh) fail('MAP_META cells/gw/gh (' + n('cells') + ', ' + n('gw') + '×' + n('gh') + ') != ' + N + ', ' + gw + '×' + gh);
}
if (!(lib.constStrArray(cur, 'MAP_ADDED_ORDER') || []).includes(id)) fail('not in MAP_ADDED_ORDER');
const qLine = rec('MAP_QUOTES');
if (qLine){ const q = lib.recordJSON(qLine); if (!q) fail('MAP_QUOTES record is not one-line JSON'); else for (const e of lib.checkQuotes(q, regCount)) fail('quotes: ' + e); }
if (row.src){
  const m = new RegExp('^const ' + row.src + ' = "([^"]*)";', 'm').exec(cur);
  if (!m || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(m[1])) fail(row.src + ' is not a base64 data:image URI');
  else if (m[1].length > 256 * 1024) todo(row.src + ' is ' + (m[1].length / 1024).toFixed(0) + ' KB (every player downloads it) — consider shrinking it');
}

// inline sol
let sol = null, solStr = null;
const solLine = rec('BAKED_SOL');
if (!solLine) fail('no BAKED_SOL record — the map would weave its solution in every browser');
else {
  const s = lib.recordJSON(solLine);
  const bytes = s && lib.b64(s.b);
  if (!s || s.gw !== gw || s.gh !== gh) fail('BAKED_SOL dims != ' + gw + '×' + gh);
  else if (!bytes || bytes.length !== ((N + 7) >> 3)) fail('BAKED_SOL is not ' + ((N + 7) >> 3) + ' bytes');
  else if (N & 7 && bytes[bytes.length - 1] >> (N & 7)) fail('BAKED_SOL has stray bits past cell N');
  else { sol = lib.unpackBits(bytes, N); solStr = s.b; }
}

// boards/<id>.js
let board = null;
try {
  const txt = lib.toLF(fs.readFileSync(path.join(ROOT, 'boards', id + '.js'), 'utf8'));
  const calls = txt.match(/BAKED\.put\(/g) || [];
  const m = /^BAKED\.put\(("[^"]+"), (\d+), (\{.*\})\);$/m.exec(txt);
  if (calls.length !== 1 || !m) fail('boards/' + id + '.js must hold exactly one BAKED.put(...) call');
  else if (JSON.parse(m[1]) !== id) fail('boards/' + id + '.js puts map ' + m[1]);
  else if (+m[2] !== GEN_COMPAT) fail('boards/' + id + '.js stamped ' + m[2] + ', GEN_COMPAT is ' + GEN_COMPAT + ' — BAKED.put would ignore it');
  else {
    board = JSON.parse(m[3]);
    // the whole file must be exactly what _bake_boards.js writes: it runs as a
    // script on the player's page, so nothing else may ride along in it
    const keys = Object.keys(board).join(), tiers = DIFF_ORDER.join();
    if (keys !== 'gw,gh,n,clue' || Object.keys(board.n || {}).join() !== tiers || Object.keys(board.clue || {}).join() !== tiers ||
        txt !== lib.canon.boardFile(id, GEN_COMPAT, board))
      { fail('boards/' + id + '.js is not exactly the file _bake_boards.js generates (extra code, keys or edits) — re-fold it'); board = null; }
  }
} catch (e) { fail('boards/' + id + '.js: ' + e.message); }
if (board && regionOf && sol){
  if (board.gw !== gw || board.gh !== gh) fail('boards/' + id + '.js dims != ' + gw + '×' + gh);
  const tiers = Object.keys(board.clue || {});
  if (tiers.length !== DIFF_ORDER.length || DIFF_ORDER.some(t => !tiers.includes(t))) fail('boards/' + id + '.js tiers [' + tiers + '] != DIFF_ORDER');
  const counts = [];
  for (const t of DIFF_ORDER){
    const by = lib.b64(board.clue && board.clue[t]);
    if (!by || by.length !== ((N + 1) >> 1)) { fail('clue/' + t + ' is not ' + ((N + 1) >> 1) + ' bytes'); continue; }
    let n = 0, bad = '';
    for (let i = 0; i < N && !bad; i++){
      const v = lib.nibble(by, i);
      if (v === 15) continue;
      if (v > 9) bad = 'value ' + v + ' at cell ' + i;
      else if (regionOf[i] < 0) bad = 'a clue on plot cell ' + i;
      n++;
    }
    if (bad){ fail('clue/' + t + ': ' + bad); continue; }
    if (!n) fail('clue/' + t + ' is empty');
    if (!board.n || board.n[t] !== n) fail('clue/' + t + ' holds ' + n + ' clues but n says ' + (board.n && board.n[t]) + ' — the game would reject it');
    const mis = lib.clueMismatch(regionOf, gw, gh, sol, i => { const v = lib.nibble(by, i); return v === 15 ? -1 : v; });
    if (mis >= 0) fail('clue/' + t + ' breaks the clue rule against BAKED_SOL at ' + (mis % gw) + ',' + ((mis / gw) | 0));
    counts.push(t + ' ' + n);
  }
  if (counts.length === DIFF_ORDER.length) ok('boards/' + id + '.js: ' + counts.join(', ') + ' clues; all decode, all obey the clue rule against BAKED_SOL');
}

// ---- 3. payload ---------------------------------------------------------------------
if (flag('no-payload')) todo('--no-payload: shipped bytes NOT compared against an audited bake (run ?verifybake= + ?audit= for this map instead)');
else if (!opt('payload')) fail('--payload <dir> is required: the gate compares the shipped bytes with the audited bake (.scratch/bake from _headless.js)');
else {
  const f = path.resolve(ROOT, opt('payload'), id + '.bake.json');
  let p = null;
  try { p = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { fail('payload ' + f + ': ' + e.message); }
  if (p){
    const m = [];
    if (p.id !== id) m.push('id');
    if (p.compat !== GEN_COMPAT) m.push('compat ' + p.compat);
    if (p.seed !== row.seed) m.push('seed');
    if (p.gw !== gw || p.gh !== gh) m.push('dims');
    if (p.sol !== solStr) m.push('sol');
    for (const t of DIFF_ORDER) if (!board || !p.clue || p.clue[t] !== board.clue[t]) m.push('clue/' + t);
    if (bakedLayLine){
      const bl = lib.recordJSON(bakedLayLine);
      if (!bl || JSON.stringify(bl.regionRLE) !== JSON.stringify(p.regionRLE) || bl.regPix !== p.regPix ||
          JSON.stringify(bl.zones) !== JSON.stringify(p.zones) || JSON.stringify(bl.picross) !== JSON.stringify(p.picross)) m.push('layout');
    }
    if (m.length) fail('shipped bytes differ from ' + path.relative(ROOT, f) + ': ' + m.join(', ') + ' (re-run _bake_boards.js on it)');
    else ok('shipped sol + ' + DIFF_ORDER.length + ' clue tiers are byte-identical to ' + path.relative(ROOT, f));
    const ap = lib.auditProblems(p.audit, DIFF_ORDER);
    if (ap.length) fail('bake-time audit: ' + ap.join('; ') + ' — bake it with the current index.html (node _headless.js bake ' + id + ')');
    else ok('bake-time audit: ' + DIFF_ORDER.join(', ') + ' — locked 0, unsolved 0, picross 0, clue rule + round-trip ok');
  }
}

// ---- 4. ship hygiene -----------------------------------------------------------------
if (curVer === baseVer) todo('bump APP_VERSION (still ' + curVer + ')');
else {
  let cl = ''; try { cl = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'); } catch (e) {}
  if (!cl.includes('[' + curVer + ']')) todo('add a CHANGELOG.md entry for [' + curVer + ']');
}

// ---- report ---------------------------------------------------------------------------
console.log((isNew ? 'new map' : 'map update') + ' "' + id + '" vs ' + baseRef + ' (' + baseSha.slice(0, 7) + ')\n');
for (const m of oks) console.log('  ✓ ' + m);
for (const m of todos) console.log('  … TODO ' + m);
for (const m of fails) console.log('  ✗ ' + m);
console.log('');
if (fails.length){ console.log('FAIL — ' + fails.length + ' problem(s). Do not ship.'); process.exit(1); }
if (todos.length && flag('ship')){ console.log('NOT READY — ' + todos.length + ' TODO(s) left (--ship).'); process.exit(1); }
console.log(todos.length ? 'ISOLATION OK — ' + todos.length + ' TODO(s) before shipping; re-run with --ship before you commit.'
                         : 'READY TO SHIP — only "' + id + '" changed, and its data is sound.');
