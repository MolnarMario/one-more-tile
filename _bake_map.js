// Bake a hand-authored map-def (exported by region-editor.html) into index.html
// as a permanent built-in map: adds IMG_SRC_n, a HAND_LAYOUTS entry, a MAPS
// entry (layout:<id>), a MAP_META entry + MAP_ADDED_ORDER slot (both required by
// the home-menu grid) and a MAP_QUOTES entry. Dev tool.
//   node _bake_map.js <mapfile.json> [--name "Name 🎨"] [--id slug]
//
// Usually run for you by `node _release_map.js <mapfile.json>`, which then
// bakes, folds and checks the map (see CLAUDE.md §9 "Add a map").
//
// It validates first and writes nothing on any problem (fail closed): a map
// is pure data, but it is data every player downloads and shared code paths
// iterate (the menu grid dereferences MAP_META for every map), so a malformed
// one can break more than itself.
//
// Every new map is APPENDED to MAPS, so MAPS[0] — mapDef()'s fallback for an
// unknown id — never changes when a map is added. The keyed tables (MAP_META,
// HAND_LAYOUTS, MAP_QUOTES) get the new record at the top, as before; their
// order means nothing.
'use strict';
const fs = require('fs');
const path = require('path');
const lib = require('./_map_lib.js');

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
const file = args.find((a, i) => !a.startsWith('--') && !(i > 0 && /^--(name|id)$/.test(args[i - 1])));
if (!file) { console.error('usage: node _bake_map.js <mapfile.json> [--name "..."] [--id slug]'); process.exit(1); }

const INDEX = path.join(__dirname, 'index.html');
const def = JSON.parse(fs.readFileSync(file, 'utf8'));
const raw = fs.readFileSync(INDEX, 'utf8');
const EOL = lib.eolOf(raw);
let html = lib.toLF(raw);
const lines = html.split('\n');

const id = opt('id') || def.id;
const name = opt('name') || def.name;
const errors = [], warnings = [];

// ---- identity ----------------------------------------------------------------
// The id keys every save (proverbs2-<id>-…), the share code (≤64 chars, and a
// client that doesn't know it rejects the code) and the bake. It must be new
// and never reused: an old save or share code would attach to the wrong art.
if (typeof id !== 'string' || !lib.ID_RE.test(id)) errors.push('bad id ' + JSON.stringify(id) + ' (need [a-z0-9-], 1–64 chars, starting with a letter or digit)');
const { rows } = lib.mapsRows(lines);
const known = new Set(rows.map(r => r.id).concat(lib.constStrArray(html, 'MAP_ADDED_ORDER') || [], lib.constStrArray(html, 'LEGACY_MAP_IDS') || []));
if (known.has(id)) errors.push('map id "' + id + '" is already used (MAPS / MAP_ADDED_ORDER / LEGACY_MAP_IDS) — ids are never reused');
for (const t of ['MAP_META', 'HAND_LAYOUTS', 'MAP_QUOTES']){
  const b = lib.findBlock(lines, t);
  if (!b) errors.push(t + ' block not found in index.html');
  else if (lib.recordLines(lines, b, id).length) errors.push('"' + id + '" already has a ' + t + ' record');
}
errors.push(...lib.checkName(name));

// ---- geometry ------------------------------------------------------------------
const MAXN = lib.maxN(html);
const gw = def.gw, gh = def.gh, N = gw * gh;
if (!Number.isInteger(gw) || !Number.isInteger(gh) || gw < 1 || gh < 1) errors.push('gw/gh must be positive integers');
else if (N > MAXN) errors.push('board is ' + gw + '×' + gh + ' = ' + N + ' cells, over MAXN ' + MAXN + ' (every grid array is allocated at MAXN)');
// the share code stores the seed as 4 big-endian bytes (SHARE_VER 7)
if (!Number.isInteger(def.seed) || def.seed < 0 || def.seed > 0xFFFFFFFF) errors.push('seed must be an integer 0..2^32-1');
const layout = { gw, gh, seed: def.seed, regPix: def.regPix, regionRLE: def.regionRLE, zones: def.zones, picross: def.picross };
if (!errors.length){
  // fail closed on anything the game would silently repair (healRegions) or
  // trip over (a -2 cell no plot claims → regionCells[-2] at load)
  const lay = lib.checkLayout(layout, gw, gh);
  errors.push(...lay.errors);
}
const regCount = (def.regPix | 0) + (def.zones || []).length + (def.picross || []).length;
errors.push(...lib.checkQuotes(def.quotes, regCount));

// ---- artwork -------------------------------------------------------------------
// every player downloads every map's image with the page, so keep an eye on it
if (typeof def.imageDataURI !== 'string' || !lib.DATA_URI_RE.test(def.imageDataURI))
  errors.push('imageDataURI must be a base64 data:image/png|jpeg|webp URI');
else if (def.imageDataURI.length > 256 * 1024)
  warnings.push('image is ' + (def.imageDataURI.length / 1024).toFixed(0) + ' KB — the largest shipped one is ~216 KB, and every player downloads it with the page');

if (errors.length){
  console.error('refusing to bake "' + id + '" — nothing was written:');
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}

// ---- insert ----------------------------------------------------------------------
let max = 0;
for (const m of html.matchAll(/^const\s+IMG_SRC(?:_(\d+))?\s*=/gm)) max = Math.max(max, m[1] ? +m[1] : 1);
const imgVar = 'IMG_SRC_' + (max + 1);

function insertAfter(marker, text) {
  const i = html.indexOf(marker);
  if (i < 0 || html.indexOf(marker, i + 1) >= 0) throw new Error('marker not found exactly once: ' + marker);
  const at = i + marker.length;
  html = html.slice(0, at) + text + html.slice(at);
}
function insertBefore(marker, text) {
  const i = html.indexOf(marker);
  if (i < 0 || html.indexOf(marker, i + 1) >= 0) throw new Error('marker not found exactly once: ' + marker);
  html = html.slice(0, i) + text + html.slice(i);
}

// every line below comes from lib.canon — the exact form _check_map_release.js
// regenerates and compares against, so the gate can prove each is pure data

// 1. image constant (board-res PNG), placed just before the MAPS array
insertBefore('\nconst MAPS = [\n', '\n' + lib.canon.img(imgVar, def.imageDataURI));

// 2. HAND_LAYOUTS entry
insertAfter('\nconst HAND_LAYOUTS = {', '\n' + lib.canon.hand(id, layout));

// 3. MAPS entry, APPENDED (src is an identifier, so it's written literally)
{
  const ls = html.split('\n');
  const b = lib.findBlock(ls, 'MAPS');
  if (!b || b.inlineClose) throw new Error('MAPS array not found (expected `const MAPS = [` … `];`)');
  ls.splice(b.close, 0, lib.canon.mapsRow({ id, name, src: imgVar, seed: def.seed, gw, gh }));
  html = ls.join('\n');
}

// 4. MAP_QUOTES entry (skip if empty)
if (def.quotes && Object.keys(def.quotes).length) {
  insertAfter('\nconst MAP_QUOTES = {', '\n' + lib.canon.record(id, def.quotes));
}

// 5. MAP_META entry — the home-menu grid reads region/cell counts + dims from
//    here (menuRenderCard/menuBuildGrid throw without it). `regions` counts the
//    organic regions PLUS every plot (sudoku + picross), matching REG_COUNT.
insertAfter('\nconst MAP_META = {', '\n' + lib.canon.meta(id, regCount, gw, gh));

// 6. MAP_ADDED_ORDER — the "newest / oldest added" menu sort. Append as newest.
if (!/^const MAP_ADDED_ORDER = \[[^\]]*\];/m.test(html)) throw new Error('MAP_ADDED_ORDER not found');
html = html.replace(/^(const MAP_ADDED_ORDER = \[[^\]]*)\];/m, (m, body) => body + ", '" + id + "'];");

fs.writeFileSync(INDEX, lib.withEol(html, EOL));
console.log('baked "' + name + '" (id=' + id + ') into index.html');
console.log('  ' + imgVar + ': ' + (def.imageDataURI.length / 1024).toFixed(1) + ' KB · ' + gw + '×' + gh + ' · ' + def.regPix + ' regions · ' +
            def.zones.length + ' sudoku · ' + def.picross.length + ' picross · ' + Object.keys(def.quotes || {}).length + ' quotes');
for (const w of warnings) console.log('  ⚠ ' + w);
console.log('next: node _headless.js bake ' + id + '   (or let _release_map.js run the rest)');
