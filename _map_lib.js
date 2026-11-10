// _map_lib.js — shared helpers for the map-release dev tools (_bake_map.js,
// _bake_boards.js, _check_map_release.js). Not shipped, not loaded by the game.
//
// Two jobs:
//   1. read the per-map tables out of index.html as text, line by line, so a
//      tool can change ONE map's records and leave every other byte alone;
//   2. validate a map's data strictly (fail closed), mirroring what the game
//      does with it at load: applyHandPartition, healRegions, fillPlotCells,
//      clueMatchesSol, and the BAKED_* decoders.
//
// Everything here works on LF text. git normalises line endings on commit
// (core.autocrlf), but a checkout can be CRLF on disk, so callers convert with
// toLF() on read and restore the file's own style with withEol() on write.
'use strict';

// ---------------------------------------------------------------- text ----
const eolOf  = s => (/\r\n/.test(s) ? '\r\n' : '\n');
const toLF   = s => s.replace(/\r\n/g, '\n');
const withEol = (s, eol) => (eol === '\n' ? s : s.replace(/\n/g, eol));

// line range of `const NAME = {` / `const NAME = [` up to its closing line.
// `close` is the closing line index (the `};` / `];` line, or the last entry's
// line when it ends with `};` itself — HAND_LAYOUTS does that).
function findBlock(lines, name){
  const open = new RegExp('^const ' + name + ' = [\\[{]\\s*$');
  const start = lines.findIndex(l => open.test(l));
  if (start < 0) return null;
  for (let i = start + 1; i < lines.length; i++){
    if (/^[\]}];\s*$/.test(lines[i])) return { start, close: i, inlineClose: false };
    if (/\};\s*$/.test(lines[i])) return { start, close: i, inlineClose: true };
  }
  return null;
}

// one-line top-level record `  "id": <value>,` inside a block. Returns the
// line indices of records keyed by `id` (quoted or bare).
function recordLines(lines, block, id){
  const out = [];
  const esc = id.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const re = new RegExp('^\\s*(?:"' + esc + '"|\'' + esc + '\'|' + esc + ')\\s*:');
  for (let i = block.start + 1; i <= block.close; i++) if (re.test(lines[i])) out.push(i);
  return out;
}

// parse the JSON value of a one-line record `  "id": {...},`
function recordJSON(line){
  const m = /^\s*"[^"]+"\s*:\s*(\{.*\})\s*,\s*(?:\};\s*)?$/.exec(line);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (e) { return null; }
}

// --------------------------------------------------------- index.html ----
function constNum(html, name){
  const m = new RegExp('^const ' + name + ' = (\\d+);', 'm').exec(html);
  return m ? +m[1] : null;
}
function constStr(html, name){
  const m = new RegExp('^const ' + name + " = '([^']*)';", 'm').exec(html);
  return m ? m[1] : null;
}
function constStrArray(html, name){
  const m = new RegExp('^const ' + name + ' = \\[([^\\]]*)\\];', 'm').exec(html);
  if (!m) return null;
  return [...m[1].matchAll(/['"]([^'"]*)['"]/g)].map(x => x[1]);
}
function maxN(html){
  const m = /^const MAXN = (\d+)\s*\*\s*(\d+);/m.exec(html);
  return m ? (+m[1]) * (+m[2]) : constNum(html, 'MAXN');
}

// Parse the JS string literal that starts at s[at] (' or "). Returns
// { value, end } (end = index after the closing quote) or null. Handles the
// escapes a source line can carry, so `"a \"<b>\""` decodes to `a "<b>"` —
// a regex that stops at the first quote would hand back `a \` and miss the `<`.
function parseJsString(s, at){
  const q = s[at];
  if (q !== '"' && q !== "'") return null;
  let out = '';
  for (let i = at + 1; i < s.length; i++){
    const c = s[i];
    if (c === q) return { value: out, end: i + 1 };
    if (c === '\n') return null;
    if (c !== '\\'){ out += c; continue; }
    const e = s[++i];
    if (e === undefined) return null;
    const simple = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' };
    if (e in simple && !(e === '0' && /\d/.test(s[i + 1] || ''))) out += simple[e];
    else if (e === 'x'){ const h = s.substr(i + 1, 2); if (!/^[0-9a-fA-F]{2}$/.test(h)) return null; out += String.fromCharCode(parseInt(h, 16)); i += 2; }
    else if (e === 'u'){
      if (s[i + 1] === '{'){ const j = s.indexOf('}', i); const h = s.slice(i + 2, j); if (j < 0 || !/^[0-9a-fA-F]{1,6}$/.test(h)) return null; out += String.fromCodePoint(parseInt(h, 16)); i = j; }
      else { const h = s.substr(i + 1, 4); if (!/^[0-9a-fA-F]{4}$/.test(h)) return null; out += String.fromCharCode(parseInt(h, 16)); i += 4; }
    }
    else if (e === '\r' || e === '\n'){ /* line continuation */ }
    else out += e;
  }
  return null;
}

// the MAPS rows, in order: { id, line, name, src, seed, gw, gh, layout, hand }
function mapsRows(lines){
  const b = findBlock(lines, 'MAPS');
  if (!b) throw new Error('MAPS array not found in index.html');
  const rows = [];
  for (let i = b.start + 1; i < b.close; i++){
    const l = lines[i];
    if (!/^\s*\{/.test(l)) continue;
    const str = k => { const m = new RegExp('\\b' + k + ':\\s*(?=[\'"])').exec(l); if (!m) return undefined; const p = parseJsString(l, m.index + m[0].length); return p ? p.value : null; };
    const num = k => { const m = new RegExp('\\b' + k + ':\\s*(-?\\d+)').exec(l); return m ? +m[1] : undefined; };
    const id = str('id');
    if (!id) throw new Error('MAPS row without an id at line ' + (i + 1));
    const src = /\bsrc:\s*([A-Za-z_$][\w$]*)/.exec(l);
    rows.push({ id, line: i, name: str('name'), src: src && src[1], seed: num('seed'),
                gw: num('gw'), gh: num('gh'), layout: str('layout'), hand: /\bhand:\s*true\b/.test(l) });
  }
  return { block: b, rows };
}

// ----------------------------------------------------------- encoding ----
function b64(s){
  if (typeof s !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.length % 4) return null;
  return Buffer.from(s, 'base64');
}
function unpackBits(b, n){
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (b[i >> 3] >> (i & 7)) & 1;
  return out;
}
function nibble(b, i){ return (i & 1) ? (b[i >> 1] >> 4) & 15 : b[i >> 1] & 15; }

// ------------------------------------------------------------- layout ----
// Decode + validate a partition exactly the way the game consumes it
// (applyHandPartition → healRegions → fillPlotCells). Returns { regionOf,
// errors }. regionOf uses -2 for plot cells, like the RLE.
function checkLayout(L, gw, gh, opts){
  const errors = [];
  const o = opts || {};
  const N = gw * gh;
  const isInt = v => Number.isInteger(v);
  if (!isInt(L.gw) || !isInt(L.gh) || L.gw !== gw || L.gh !== gh) errors.push('layout dims ' + L.gw + 'x' + L.gh + ' != map ' + gw + 'x' + gh);
  if (!isInt(L.regPix) || L.regPix < 1) errors.push('regPix must be a positive integer (got ' + L.regPix + ')');
  const rle = L.regionRLE;
  if (!Array.isArray(rle) || rle.length % 2) { errors.push('regionRLE must be an even-length array of [id, run] pairs'); return { regionOf: null, errors }; }
  const regionOf = new Int16Array(N).fill(-3);
  let i = 0;
  for (let k = 0; k < rle.length; k += 2){
    const id = rle[k], len = rle[k + 1];
    if (!isInt(id) || !(id === -2 || (id >= 0 && id < L.regPix))) { errors.push('regionRLE id ' + id + ' at pair ' + (k / 2) + ' is not -2 or 0..' + (L.regPix - 1)); break; }
    if (!isInt(len) || len < 1) { errors.push('regionRLE run ' + len + ' at pair ' + (k / 2) + ' is not a positive integer'); break; }
    if (i + len > N) { errors.push('regionRLE overruns the board (' + (i + len) + ' > ' + N + ')'); break; }
    regionOf.fill(id, i, i + len); i += len;
  }
  if (!errors.length && i !== N) errors.push('regionRLE covers ' + i + ' cells, board has ' + N);
  if (errors.length) return { regionOf: null, errors };

  // every organic id present, and ONE connected piece — otherwise healRegions()
  // would rewrite the partition at load and the shipped RLE / menu preview /
  // quote keys would no longer describe the board the player sees
  const size = new Int32Array(L.regPix);
  for (let c = 0; c < N; c++) if (regionOf[c] >= 0) size[regionOf[c]]++;
  const empty = []; for (let r = 0; r < L.regPix; r++) if (!size[r]) empty.push(r);
  if (empty.length) errors.push('organic region id(s) with no cells: ' + empty.join(', ') + ' (ids must be contiguous 0..regPix-1)');
  const seen = new Uint8Array(N), split = [];
  const pieces = new Int32Array(L.regPix);
  for (let s = 0; s < N; s++){
    const r = regionOf[s];
    if (r < 0 || seen[s]) continue;
    pieces[r]++; seen[s] = 1; const st = [s];
    while (st.length){
      const c = st.pop(), x = c % gw, y = (c / gw) | 0;
      if (x > 0      && regionOf[c - 1]  === r && !seen[c - 1])  { seen[c - 1] = 1;  st.push(c - 1); }
      if (x < gw - 1 && regionOf[c + 1]  === r && !seen[c + 1])  { seen[c + 1] = 1;  st.push(c + 1); }
      if (y > 0      && regionOf[c - gw] === r && !seen[c - gw]) { seen[c - gw] = 1; st.push(c - gw); }
      if (y < gh - 1 && regionOf[c + gw] === r && !seen[c + gw]) { seen[c + gw] = 1; st.push(c + gw); }
    }
  }
  for (let r = 0; r < L.regPix; r++) if (pieces[r] > 1) split.push('R' + r + ' (' + pieces[r] + ' pieces)');
  if (split.length) errors.push('disconnected region(s): ' + split.join(', ') + ' — healRegions() would rewrite them at load');

  // plots: in-bounds, non-overlapping n×n squares whose union is exactly the
  // -2 cells (fillPlotCells stamps n×n at x,y; applyHandPartition then indexes
  // regionCells[regionOf[c]], which throws on a -2 cell no plot claimed)
  const plotMask = new Uint8Array(N);
  const plots = [].concat((L.zones || []).map((z, k) => ['zone ' + k, z]), (L.picross || []).map((p, k) => ['picross ' + k, p]));
  if (!Array.isArray(L.zones) || !Array.isArray(L.picross)) errors.push('layout needs zones[] and picross[] arrays');
  const roman = o.romanMax || 12;
  if ((L.zones || []).length > roman || (L.picross || []).length > roman) errors.push('more than ' + roman + ' plots of one kind (ROMAN[] names run out)');
  for (const [label, p] of plots){
    if (!isInt(p.x) || !isInt(p.y) || !isInt(p.n) || p.n < 2 || p.x < 0 || p.y < 0 || p.x + p.n > gw || p.y + p.n > gh) { errors.push(label + ' out of bounds or malformed: ' + JSON.stringify(p)); continue; }
    for (let dy = 0; dy < p.n; dy++) for (let dx = 0; dx < p.n; dx++){
      const c = (p.y + dy) * gw + p.x + dx;
      if (plotMask[c]) { errors.push(label + ' overlaps another plot at ' + (p.x + dx) + ',' + (p.y + dy)); dy = p.n; break; }
      plotMask[c] = 1;
    }
  }
  // exact plot shapes — the same fields, types and ranges every shipped map has
  // (share codes reject a sudoku n > 9; SUD_KIT sizes are 4, 6 and 9)
  const sameKeys = (o, ks) => o && typeof o === 'object' && Object.keys(o).sort().join() === ks.slice().sort().join();
  for (const [k, z] of (L.zones || []).entries()){
    if (!sameKeys(z, ['x', 'y', 'n', 'boxW', 'boxH', 'jigsaw', 'givens'])) { errors.push('zone ' + k + ': keys must be exactly x,y,n,boxW,boxH,jigsaw,givens'); continue; }
    if (![4, 6, 9].includes(z.n)) errors.push('zone ' + k + ': n must be 4, 6 or 9 (got ' + z.n + ')');
    if (!isInt(z.boxW) || !isInt(z.boxH) || z.boxW < 1 || z.boxH < 1 || z.boxW * z.boxH !== z.n) errors.push('zone ' + k + ': boxW and boxH must be positive integers with boxW*boxH = n');
    if (typeof z.jigsaw !== 'boolean') errors.push('zone ' + k + ': jigsaw must be true/false');
    if (!isInt(z.givens) || z.givens < 0 || z.givens > z.n * z.n) errors.push('zone ' + k + ': givens must be an integer 0..n²');
  }
  for (const [k, p] of (L.picross || []).entries()){
    if (!sameKeys(p, ['x', 'y', 'n'])) errors.push('picross ' + k + ': keys must be exactly x,y,n');
    else if (!isInt(p.n) || p.n < 2 || p.n > 15) errors.push('picross ' + k + ': n must be an integer 2..15');
  }
  let bad = 0, first = -1;
  for (let c = 0; c < N; c++) if ((regionOf[c] === -2) !== !!plotMask[c]) { bad++; if (first < 0) first = c; }
  if (bad) errors.push(bad + ' cell(s) where the RLE plot mask (-2) and the plot squares disagree, first at ' + (first % gw) + ',' + ((first / gw) | 0));
  return { regionOf: errors.length ? null : regionOf, errors };
}

// region-clipped 3×3 light count — the clue rule (CLAUDE.md §8.2), as
// clueMatchesSol() applies it. Returns the first mismatching cell or -1.
function clueMismatch(regionOf, gw, gh, sol, clueAt){
  const N = gw * gh;
  for (let i = 0; i < N; i++){
    const r = regionOf[i];
    if (r < 0) continue;
    const v = clueAt(i);
    if (v < 0) continue;
    const x = i % gw, y = (i / gw) | 0;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
      const j = yy * gw + xx;
      if (regionOf[j] === r && sol[j]) n++;
    }
    if (n !== v) return i;
  }
  return -1;
}

// ------------------------------------------------------------- strings ----
// names reach the DOM through innerHTML (menu cards, Continue card), and every
// string lands inside the single inline <script> — `</script` or `<!--` there
// would end or derail the script element.
function checkName(name){
  const e = [];
  if (typeof name !== 'string' || !name.trim()) e.push('name is empty');
  else if (/[<>&]/.test(name)) e.push('name contains < > or & (it is rendered with innerHTML): ' + JSON.stringify(name));
  else if (name.length > 64) e.push('name longer than 64 chars');
  return e;
}
function checkQuotes(q, regCount){
  const e = [];
  if (q === undefined) return e;
  if (!q || typeof q !== 'object' || Array.isArray(q)) return ['quotes must be an object of region-id → text'];
  for (const [k, v] of Object.entries(q)){
    if (!/^\d+$/.test(k) || +k >= regCount) e.push('quote key ' + JSON.stringify(k) + ' is not a region id 0..' + (regCount - 1));
    if (typeof v !== 'string' || !v.trim()) e.push('quote ' + k + ' is empty or not a string');
    else if (/<\/script|<!--/i.test(v)) e.push('quote ' + k + ' contains </script or <!-- (would break the inline script)');
  }
  return e;
}
// share codes reject ids over 64 chars; ids also become file names
// (boards/<id>.js, <id>.bake.json), so Windows device names are out too
const ID_RE = /^(?!(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$)[a-z0-9][a-z0-9-]{0,63}$/;
const DATA_URI_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

// ---------------------------------------------------- canonical records ----
// The ONE definition of what each per-map line looks like. _bake_map.js and
// _bake_boards.js write with these, and _check_map_release.js regenerates a
// line from its parsed value and demands the file hold exactly that — so a
// map's own lines are provably pure data (no code riding along after a `,`).
const canon = {
  img:    (v, uri) => 'const ' + v + ' = ' + JSON.stringify(uri) + ';',
  mapsRow: r => '  { id: ' + JSON.stringify(r.id) + ', name: ' + JSON.stringify(r.name) + ', src: ' + r.src + ', seed: ' + r.seed +
                ', gw: ' + r.gw + ', gh: ' + r.gh + ', layout: ' + JSON.stringify(r.id) + ' },',
  record: (id, value) => '  ' + JSON.stringify(id) + ': ' + JSON.stringify(value) + ',',
  hand:   (id, L) => canon.record(id, { gw: L.gw, gh: L.gh, seed: L.seed, regPix: L.regPix, regionRLE: L.regionRLE, zones: L.zones, picross: L.picross }),
  bakedLayout: (id, L) => canon.record(id, { gw: L.gw, gh: L.gh, regPix: L.regPix, zones: L.zones, picross: L.picross, regionRLE: L.regionRLE }),
  sol:    (id, gw, gh, b) => canon.record(id, { gw, gh, b }),
  meta:   (id, regions, gw, gh) => '  ' + JSON.stringify(id) + ': { regions: ' + regions + ', cells: ' + gw * gh + ', gw: ' + gw + ', gh: ' + gh + ' },',
  boardFile: (id, compat, body) =>
    '// Generated by _bake_boards.js from index.html?bake=' + id + ' — do not edit by hand.\n' +
    '// clue[] for every difficulty tier, 4 bits per cell (15 = no clue), base64.\n' +
    '// `n` = how many clues each tier should have, checked on load.\n' +
    '// Loaded on demand by BAKED.load(); a missing or stale file just means the\n' +
    '// game generates this board itself, as it did before baking existed.\n' +
    'BAKED.put(' + JSON.stringify(id) + ', ' + compat + ', ' + JSON.stringify({ gw: body.gw, gh: body.gh, n: body.n, clue: body.clue }) + ');\n',
};

// The bake-time audit, exactly: one entry per tier, every field present and
// passing. A missing or null field is a failure, never a pass.
function auditProblems(audit, tiers){
  if (!Array.isArray(audit)) return ['no bake-time audit in the payload'];
  const p = [];
  if (audit.length !== tiers.length) p.push('audit has ' + audit.length + ' entries for ' + tiers.length + ' tiers');
  for (const t of tiers){
    const a = audit.filter(x => x && x.tier === t);
    if (a.length !== 1) { p.push('audit: ' + (a.length ? 'duplicate' : 'missing') + ' entry for ' + t); continue; }
    const x = a[0];
    if (x.locked !== 0 || x.unsolved !== 0 || x.picrossUnsolved !== 0 || x.roundTrip !== true || x.clueMatchesSol !== true)
      p.push('audit FAILED on ' + t + ': ' + JSON.stringify(x));
  }
  return p;
}

module.exports = {
  eolOf, toLF, withEol, findBlock, recordLines, recordJSON, parseJsString,
  constNum, constStr, constStrArray, maxN, mapsRows,
  b64, unpackBits, nibble, checkLayout, clueMismatch, checkName, checkQuotes, ID_RE, DATA_URI_RE,
  canon, auditProblems,
};
