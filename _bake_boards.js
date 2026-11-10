#!/usr/bin/env node
/* ============================================================================
 * _bake_boards.js — fold baked board payloads into the shipped game.
 *
 * The payloads themselves are produced IN THE BROWSER by index.html?bake=<map>
 * (see bakeBoards()), because the pipeline's first stage is a canvas draw —
 * reimplementing it here would defeat the entire point of baking, which is that
 * the shipped bytes are whatever the shipped code actually produces. Each run
 * banks one <map>.bake.json per map; this script consumes them.
 *
 *   node _headless.js bake <map>            # or open index.html?bake=<map> by hand
 *   node _bake_boards.js <srcDir>           # folds the payloads in
 *
 * Two modes, picked for you:
 *
 *   UPSERT (the normal case — a new map, or one map re-baked). The inline
 *     BAKED_SOL / BAKED_LAYOUT tables are edited record by record: the maps
 *     you hand it are added or replaced, every other map's line is kept
 *     byte-for-byte. Folding one map can never touch another.
 *
 *   FULL (GEN_COMPAT moved since the last bake — inline BAKED_COMPAT differs).
 *     Every inline record is stale at that point, and BAKED_COMPAT is ONE stamp
 *     for all of them, so re-stamping it after folding only some maps would
 *     pass the others' stale bytes off as current. A full fold therefore needs
 *     a payload for EVERY map in MAPS and refuses otherwise. `--full` forces
 *     this mode (same requirement).
 *
 * Every payload is validated before anything is written (dims, seed, tier set,
 * bit lengths, the partition, the clue rule against sol, and the bake-time
 * audit when the payload carries one); the first problem aborts the whole fold
 * with nothing written.
 *
 * It writes:
 *   boards/<map>.js — the clue sets for all five tiers (lazily loaded at play
 *                     time by BAKED.load, one map at a time)
 *   index.html      — BAKED_LAYOUT / BAKED_SOL records (+ BAKED_COMPAT in FULL)
 *
 * Usage: node _bake_boards.js [srcDir] [--maps a,b] [--full]
 *        srcDir default: ../  ;  --maps folds only those (each must be present)
 * ==========================================================================*/
'use strict';
const fs = require('fs');
const path = require('path');
const lib = require('./_map_lib.js');

const ROOT = __dirname;
const args = process.argv.slice(2);
const flag = k => args.includes('--' + k);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--maps'));
const SRC = path.resolve(ROOT, positional[0] || '..');
const INDEX = path.join(ROOT, 'index.html');
const BOARDS = path.join(ROOT, 'boards');
const die = msg => { console.error('! ' + msg); console.error('  nothing was written.'); process.exit(1); };

const raw = fs.readFileSync(INDEX, 'utf8');
const EOL = lib.eolOf(raw);
const html0 = lib.toLF(raw);
const lines = html0.split('\n');

// GEN_COMPAT — NOT BOARD_COMPAT — is the staleness stamp: it changes when
// generation output changes, while BOARD_COMPAT tracks the share/net protocol.
const GEN_COMPAT = lib.constNum(html0, 'GEN_COMPAT');
const BAKED_COMPAT = lib.constNum(html0, 'BAKED_COMPAT');
const DIFF_ORDER = lib.constStrArray(html0, 'DIFF_ORDER');
const MAXN = lib.maxN(html0);
if (GEN_COMPAT == null || BAKED_COMPAT == null) die('could not find GEN_COMPAT / BAKED_COMPAT in index.html');
if (!DIFF_ORDER || !DIFF_ORDER.length) die('could not find DIFF_ORDER in index.html');
const { rows } = lib.mapsRows(lines);
const MAP_IDS = rows.map(r => r.id);
// ids become file names below (<id>.bake.json, boards/<id>.js): refuse anything
// that could step outside those folders
for (const id of MAP_IDS) if (!lib.ID_RE.test(id)) die('MAPS id ' + JSON.stringify(id) + ' is not a valid map id (' + lib.ID_RE + ')');
const handBlock = lib.findBlock(lines, 'HAND_LAYOUTS');

// ---- the inline tables, read record by record ------------------------------
// Between its markers each table is either `const NAME = {};` or
// `const NAME = {` + one `  "id": {...},` line per map + `};`. Anything else
// means someone hand-edited it; refuse rather than guess.
function readTable(name){
  const b = lines.indexOf('/* ' + name + ':BEGIN */');
  const e = lines.indexOf('/* ' + name + ':END */');
  if (b < 0 || e < b) die('marker ' + name + ' not found in index.html');
  const body = lines.slice(b + 1, e);
  const entries = [];
  if (body.length === 1 && body[0] === 'const ' + name + ' = {};') return { b, e, entries };
  if (body[0] !== 'const ' + name + ' = {' || body[body.length - 1] !== '};') die(name + ' table has an unexpected shape between its markers');
  for (const l of body.slice(1, -1)){
    const m = /^ {2}"([^"]+)": \{.*\},$/.exec(l);
    if (!m) die(name + ' table: unexpected line ' + JSON.stringify(l.slice(0, 80)));
    if (entries.some(x => x.id === m[1])) die(name + ' table: duplicate key "' + m[1] + '"');
    entries.push({ id: m[1], line: l });
  }
  return { b, e, entries };
}
const T = { BAKED_LAYOUT: readTable('BAKED_LAYOUT'), BAKED_SOL: readTable('BAKED_SOL') };

// ---- mode -------------------------------------------------------------------
const FULL = flag('full') || BAKED_COMPAT !== GEN_COMPAT;
const wanted = opt('maps') ? opt('maps').split(',').map(s => s.trim()).filter(Boolean) : null;
if (wanted) for (const id of wanted) if (!MAP_IDS.includes(id)) die('--maps names "' + id + '", which is not in MAPS');

// ---- collect + validate payloads --------------------------------------------
const found = [];
for (const id of MAP_IDS){
  if (wanted && !wanted.includes(id)) continue;
  const f = path.join(SRC, id + '.bake.json');
  if (!fs.existsSync(f)) { if (wanted) die(id + ': no ' + id + '.bake.json in ' + SRC); continue; }
  let rec;
  try { rec = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { die(id + ': unreadable payload (' + e.message + ')'); }
  found.push(validate(id, rec, f));
}
if (!found.length) {
  die('no <map>.bake.json found in ' + SRC + '\n  run `node _headless.js bake <map>` (or index.html?bake=<map> in a tab) first');
}
if (FULL){
  const missing = MAP_IDS.filter(id => !found.some(r => r.id === id));
  if (missing.length){
    die((flag('full') ? '--full' : 'GEN_COMPAT is ' + GEN_COMPAT + ' but the inline tables were baked at ' + BAKED_COMPAT) +
        ' — that is a FULL re-bake, and every map needs a fresh payload.\n  missing: ' + missing.join(', ') +
        '\n  (folding only some would re-stamp the others\' stale records as current)');
  }
}

function validate(id, rec, file){
  const row = rows.find(r => r.id === id);
  const fail = m => die(id + ': ' + m + '  (' + file + ')');
  if (rec.id !== id) fail('payload claims id "' + rec.id + '"');
  if (rec.compat !== GEN_COMPAT) fail('baked at GEN_COMPAT ' + rec.compat + ', index.html is at ' + GEN_COMPAT + ' — re-bake it');
  if (rec.seed !== row.seed) fail('baked at seed ' + rec.seed + ', MAPS says ' + row.seed + ' (only the canonical seed is shipped)');
  const N = rec.gw * rec.gh;
  if (!Number.isInteger(rec.gw) || !Number.isInteger(rec.gh) || rec.cells !== N || N < 1 || N > MAXN) fail('bad dims ' + rec.gw + 'x' + rec.gh + ' cells=' + rec.cells);
  if (row.gw != null && (row.gw !== rec.gw || row.gh !== rec.gh)) fail('dims ' + rec.gw + 'x' + rec.gh + ' != MAPS ' + row.gw + 'x' + row.gh);
  if (!rec.sol || !rec.clue) fail('payload missing sol/clue');
  const tiers = Object.keys(rec.clue);
  if (tiers.length !== DIFF_ORDER.length || DIFF_ORDER.some(t => !tiers.includes(t))) fail('tiers [' + tiers + '] != DIFF_ORDER [' + DIFF_ORDER + ']');
  const solB = lib.b64(rec.sol);
  if (!solB || solB.length !== ((N + 7) >> 3)) fail('sol is not ' + ((N + 7) >> 3) + ' bytes of base64');
  const sol = lib.unpackBits(solB, N);

  // the partition the clues were thinned against: HAND_LAYOUTS for an authored
  // map, the payload's own for a derived one (castle/crew/fighters) — exactly
  // the `derived` split bakeBoards() makes
  const handLine = row.layout && handBlock ? lib.recordLines(lines, handBlock, row.layout)[0] : undefined;
  const derived = handLine === undefined;
  let L;
  if (derived){
    if (!rec.regionRLE) fail('a derived-layout map must carry regionRLE/zones/picross');
    L = { gw: rec.gw, gh: rec.gh, regPix: rec.regPix, regionRLE: rec.regionRLE, zones: rec.zones, picross: rec.picross };
  } else {
    if (rec.regionRLE) fail('payload carries a layout, but the map has a HAND_LAYOUTS entry');
    L = lib.recordJSON(lines[handLine]);
    if (!L) fail('could not parse its HAND_LAYOUTS record');
  }
  const lay = lib.checkLayout(L, rec.gw, rec.gh);
  if (lay.errors.length) fail('layout: ' + lay.errors.join('; '));

  rec.n = {};
  for (const t of DIFF_ORDER){
    const b = lib.b64(rec.clue[t]);
    if (!b || b.length !== ((N + 1) >> 1)) fail('clue/' + t + ' is not ' + ((N + 1) >> 1) + ' bytes of base64');
    let n = 0;
    for (let i = 0; i < N; i++){
      const v = lib.nibble(b, i);
      if (v === 15) continue;
      if (v > 9) fail('clue/' + t + ': value ' + v + ' at cell ' + i);
      if (lay.regionOf[i] < 0) fail('clue/' + t + ': clue on a plot cell ' + i);
      n++;
    }
    if (!n) fail('clue/' + t + ' is empty');
    const bad = lib.clueMismatch(lay.regionOf, rec.gw, rec.gh, sol, i => { const v = lib.nibble(b, i); return v === 15 ? -1 : v; });
    if (bad >= 0) fail('clue/' + t + ' disagrees with sol at cell ' + bad + ' (' + (bad % rec.gw) + ',' + ((bad / rec.gw) | 0) + ')');
    rec.n[t] = n;
  }
  // the bake-time audit is what lets a bake stand in for ?audit= — no audit,
  // or any field not exactly passing, and the payload is not shipped
  const ap = lib.auditProblems(rec.audit, DIFF_ORDER);
  if (ap.length) fail(ap.join('; ') + ' — re-bake with the current index.html (node _headless.js bake ' + id + ')');
  rec.derived = derived;
  return rec;
}

// ---- stage boards/<map>.js ---------------------------------------------------
const writes = [];   // [file, text]
let clueBytes = 0;
for (const rec of found){
  const clue = {}; for (const t of DIFF_ORDER) clue[t] = rec.clue[t];   // DIFF_ORDER key order, always
  const js = lib.canon.boardFile(rec.id, GEN_COMPAT, { gw: rec.gw, gh: rec.gh, n: rec.n, clue });
  const out = path.join(BOARDS, rec.id + '.js');
  if (path.dirname(out) !== BOARDS) die('refusing to write outside boards/: ' + out);
  let prevRaw = null; try { prevRaw = fs.readFileSync(out, 'utf8'); } catch (e) {}
  const prev = prevRaw === null ? null : lib.toLF(prevRaw);
  writes.push([out, prevRaw === null ? js : lib.withEol(js, lib.eolOf(prevRaw))]);   // keep the checkout's own line endings
  clueBytes += js.length;
  console.log('  boards/' + rec.id + '.js  ' + (js.length / 1024).toFixed(0) + ' KB' + (prev === js ? '  (unchanged)' : prev === null ? '  (new)' : '  (replaced)'));
}

// ---- stage the inline tables -------------------------------------------------
const layoutLine = rec => lib.canon.bakedLayout(rec.id, rec);
const solLine = rec => lib.canon.sol(rec.id, rec.gw, rec.gh, rec.sol);
const report = {};
function upsert(name, rec, line){
  const t = T[name], r = report[name] = report[name] || { added: [], replaced: [], unchanged: [], removed: [] };
  const k = t.entries.findIndex(x => x.id === rec.id);
  if (line === null){ if (k >= 0){ t.entries.splice(k, 1); r.removed.push(rec.id); } return; }
  if (k < 0){ t.entries.push({ id: rec.id, line }); r.added.push(rec.id); }
  else if (t.entries[k].line === line) r.unchanged.push(rec.id);
  else { t.entries[k].line = line; r.replaced.push(rec.id); }
}
if (FULL){
  // every record is stale: rebuild both tables from the fresh set, MAPS order
  T.BAKED_LAYOUT.entries = []; T.BAKED_SOL.entries = [];
}
for (const rec of found){
  upsert('BAKED_LAYOUT', rec, rec.derived ? layoutLine(rec) : null);
  upsert('BAKED_SOL', rec, solLine(rec));
}
function tableText(name){
  const es = T[name].entries;
  return es.length ? ['const ' + name + ' = {'].concat(es.map(x => x.line), ['};']) : ['const ' + name + ' = {};'];
}
// splice the later table first so the earlier one's indices stay valid
const order = ['BAKED_LAYOUT', 'BAKED_SOL'].sort((a, b) => T[b].b - T[a].b);
let out = lines.slice();
for (const name of order) out.splice(T[name].b + 1, T[name].e - T[name].b - 1, ...tableText(name));
let html = out.join('\n');
if (FULL) html = html.replace(/^const BAKED_COMPAT = \d+;/m, 'const BAKED_COMPAT = ' + GEN_COMPAT + ';');
writes.push([INDEX, lib.withEol(html, EOL)]);

// ---- write (each file via a temp + rename, after everything validated) -------
fs.mkdirSync(BOARDS, { recursive: true });
for (const [file, text] of writes){
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

// ---- report ------------------------------------------------------------------
console.log('');
console.log((FULL ? 'FULL fold' : 'upsert') + ': ' + found.length + '/' + MAP_IDS.length + ' maps at GEN_COMPAT ' + GEN_COMPAT +
            (FULL ? '  (BAKED_COMPAT ' + BAKED_COMPAT + ' -> ' + GEN_COMPAT + ')' : ''));
for (const name of ['BAKED_LAYOUT', 'BAKED_SOL']){
  const r = report[name] || { added: [], replaced: [], unchanged: [], removed: [] };
  const kept = T[name].entries.length - r.added.length - r.replaced.length - r.unchanged.length;
  console.log('  ' + name.padEnd(13) + ' added [' + r.added + ']  replaced [' + r.replaced + ']  unchanged [' + r.unchanged + ']' +
              (r.removed.length ? '  removed [' + r.removed + ']' : '') + '  other maps kept byte-identical: ' + kept);
}
console.log('  boards/       ' + (clueBytes / 1024).toFixed(0) + ' KB across ' + found.length + ' file(s)');
for (const rec of found) console.log('  audit ' + rec.id + ': ' + DIFF_ORDER.join(', ') + ' — locked 0, unsolved 0, picross 0');
console.log('');
console.log(FULL ? 'next: node _headless.js verifybake all   then   node _headless.js audit all'
                 : 'next: node _check_map_release.js <map> --payload ' + path.relative(ROOT, SRC) + '   (new map)  ·  or  node _headless.js verifybake <map>');
