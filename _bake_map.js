// Bake a hand-authored map-def (exported by region-editor.html) into index.html
// as a permanent built-in map: adds IMG_SRC_n, a HAND_LAYOUTS entry, a MAPS
// entry (layout:<id>) and a MAP_QUOTES entry. Dev tool.
//   node _bake_map.js <mapfile.json> [--name "🎨 Name"] [--id slug]
'use strict';
const fs = require('fs');

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
if (!file) { console.error('usage: node _bake_map.js <mapfile.json> [--name "..."] [--id slug]'); process.exit(1); }
const opt = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };

const def = JSON.parse(fs.readFileSync(file, 'utf8'));
let html = fs.readFileSync('index.html', 'utf8');

const id = opt('id') || def.id;
const name = opt('name') || def.name;
if (!/^[a-z0-9-]+$/.test(id)) { console.error('bad id (need [a-z0-9-]): ' + id); process.exit(1); }

// guard against double-baking
if (html.includes(`layout: '${id}'`) || html.includes(`layout: "${id}"`) || html.includes(`'${id}':`)) {
  console.error(`map id "${id}" already appears in index.html — aborting to avoid a duplicate.`); process.exit(1);
}

// validate the partition once more (sum == N)
const N = def.gw * def.gh;
let sum = 0; for (let k = 1; k < def.regionRLE.length; k += 2) sum += def.regionRLE[k];
if (sum !== N) { console.error(`regionRLE sums to ${sum} but gw*gh=${N} — refusing to bake a malformed partition.`); process.exit(1); }
// connectivity check: each organic region should be ONE connected piece. The game
// also self-heals at load (healRegions), but flag it here so a transcription slip
// is caught at bake time rather than silently relying on the runtime repair.
{
  const GW = def.gw, GH = def.gh, ro = new Int16Array(N);
  let i = 0; for (let k = 0; k < def.regionRLE.length && i < N; k += 2) { const id = def.regionRLE[k] | 0, len = def.regionRLE[k + 1] | 0; for (let n = 0; n < len && i < N; n++) ro[i++] = id; }
  const seen = new Uint8Array(N), disc = [];
  for (let r = 0; r < def.regPix; r++) {
    let pieces = 0;
    for (let s = 0; s < N; s++) {
      if (ro[s] !== r || seen[s]) continue;
      pieces++; const st = [s]; seen[s] = 1;
      while (st.length) { const c = st.pop(), x = c % GW, y = (c / GW) | 0;
        for (const j of [x > 0 ? c-1 : -1, x < GW-1 ? c+1 : -1, y > 0 ? c-GW : -1, y < GH-1 ? c+GW : -1]) if (j >= 0 && ro[j] === r && !seen[j]) { seen[j] = 1; st.push(j); } }
    }
    if (pieces > 1) disc.push('R' + r + ' (' + pieces + ' pieces)');
  }
  if (disc.length) console.warn('⚠ WARNING: disconnected region(s): ' + disc.join(', ') + ' — the game auto-heals these at load, but this usually means a corrupted/hand-transcribed partition. Prefer baking from the editor’s downloaded file.');
}

// next IMG_SRC index
let max = 0;
for (const m of html.matchAll(/const\s+IMG_SRC(?:_(\d+))?\s*=/g)) max = Math.max(max, m[1] ? +m[1] : 1);
const imgVar = 'IMG_SRC_' + (max + 1);

function insertAfter(marker, text) {
  const i = html.indexOf(marker);
  if (i < 0) throw new Error('marker not found: ' + marker);
  const at = i + marker.length;
  html = html.slice(0, at) + text + html.slice(at);
}
function insertBefore(marker, text) {
  const i = html.indexOf(marker);
  if (i < 0) throw new Error('marker not found: ' + marker);
  html = html.slice(0, i) + text + html.slice(i);
}

// 1. image constant (board-res PNG), placed just before the MAPS array
insertBefore('const MAPS = [', `const ${imgVar} = ${JSON.stringify(def.imageDataURI)};\n`);

// 2. HAND_LAYOUTS entry
const layout = { gw: def.gw, gh: def.gh, seed: def.seed, regPix: def.regPix, regionRLE: def.regionRLE, zones: def.zones, picross: def.picross };
insertAfter('const HAND_LAYOUTS = {', `\n  ${JSON.stringify(id)}: ${JSON.stringify(layout)},`);

// 3. MAPS entry (src is an identifier, so it's written literally, not stringified)
const mapsEntry = `  { id: ${JSON.stringify(id)}, name: ${JSON.stringify(name)}, src: ${imgVar}, seed: ${def.seed}, gw: ${def.gw}, gh: ${def.gh}, layout: ${JSON.stringify(id)} },`;
insertAfter('const MAPS = [', '\n' + mapsEntry);

// 4. MAP_QUOTES entry (skip if empty)
if (def.quotes && Object.keys(def.quotes).length) {
  insertAfter('const MAP_QUOTES = {', `\n  ${JSON.stringify(id)}: ${JSON.stringify(def.quotes)},`);
}

fs.writeFileSync('index.html', html);
console.log(`baked "${name}" (id=${id}) into index.html`);
console.log(`  ${imgVar}: ${(def.imageDataURI.length / 1024).toFixed(1)} KB · ${def.gw}×${def.gh} · ${def.regPix} regions · ${def.zones.length} sudoku · ${def.picross.length} picross · ${Object.keys(def.quotes || {}).length} quotes`);
