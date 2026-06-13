// Verification harness for proverbs.html — mirrors the generation pipeline
// exactly. Run with: node verify-puzzle.js  (regenerates _pixels.txt itself
// is NOT done here; run the PowerShell dump first if the image changed).
// Checks: all maps solvable per tier, 0/9 gradient across tiers, givens.
'use strict';
const fs = require('fs');
const GW = 120, GH = 64, N = GW * GH, SEED = 1337;

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const DIFF = {
  veryeasy: { redundancy: 0.65, passes: 1, extremeKeep: 1.0, zGivens: 1.5,  zSwaps: 0.25, pHelp: 0.20, basicOnly: true },
  easy:     { redundancy: 0.40, passes: 1, extremeKeep: 0.6, zGivens: 1.25, zSwaps: 0.5,  pHelp: 0.10, basicOnly: true },
  medium:   { redundancy: 0.20, passes: 1, extremeKeep: 0.3, zGivens: 1.0,  zSwaps: 1.0,  pHelp: 0.05, basicOnly: true },
  hard:     { redundancy: 0.08, passes: 1, extremeKeep: 0.1, zGivens: 0.85, zSwaps: 1.5,  pHelp: 0 },
  veryhard: { redundancy: 0,    passes: 2, extremeKeep: 0,   zGivens: 0.7,  zSwaps: 2.0,  pHelp: 0 },
};

const ZONES = [[57,4,4],[18,38,6],[86,44,9],[100,10,4],[4,14,6],[52,50,9],[26,16,6],[28,52,6]];
const PICROSS = [[30,8,8],[70,20,7],[43,41,7],[102,24,8],[40,26,6],[66,42,6],[12,26,7],[108,40,6]];
const blocked = new Uint8Array(N);
for (const [bx,by,bn] of ZONES.concat(PICROSS)) {
  if (bx < 0 || by < 0 || bx + bn > GW || by + bn > GH) throw new Error(`plot at ${bx},${by} off canvas`);
  for (let dy=0;dy<bn;dy++) for (let dx=0;dx<bn;dx++) {
    const i = (by+dy)*GW+bx+dx;
    if (blocked[i]) throw new Error(`plot at ${bx},${by} overlaps another`);
    blocked[i]=1;
  }
}
for (const [bx,by,bn] of PICROSS)
  if (bx - Math.ceil(bn/2) < 0 || by - Math.ceil(bn/2) < 0) throw new Error(`picross at ${bx},${by}: clue strips off canvas`);
console.log(`Placement OK: ${ZONES.length} sudoku + ${PICROSS.length} picross, no overlaps, strips fit`);

const regionOf = new Int16Array(N).fill(-1);
let REG_PIX = 0;
let regionCells = [];
(function(){
  const rng = mulberry32(SEED * 2 + 1);
  for (let i = 0; i < N; i++) if (blocked[i]) regionOf[i] = -2;
  const COLS = 6, ROWS = 3, cw = GW / COLS, ch = GH / ROWS;
  const frontier = [];
  let K = 0;
  for (let sy = 0; sy < ROWS; sy++) for (let sx = 0; sx < COLS; sx++) {
    let i = Math.min(GH - 1, (sy * ch + rng() * ch) | 0) * GW + Math.min(GW - 1, (sx * cw + rng() * cw) | 0);
    let guard = 0;
    while (regionOf[i] !== -1 && guard++ < 800) i = (rng() * N) | 0;
    if (regionOf[i] !== -1) continue;
    regionOf[i] = K; frontier.push(i); K++;
  }
  while (frontier.length) {
    const idx = (rng() * frontier.length) | 0;
    const i = frontier[idx];
    frontier[idx] = frontier[frontier.length - 1]; frontier.pop();
    const x = i % GW, y = (i / GW) | 0, r = regionOf[i];
    if (x > 0      && regionOf[i - 1]  === -1) { regionOf[i - 1]  = r; frontier.push(i - 1); }
    if (x < GW - 1 && regionOf[i + 1]  === -1) { regionOf[i + 1]  = r; frontier.push(i + 1); }
    if (y > 0      && regionOf[i - GW] === -1) { regionOf[i - GW] = r; frontier.push(i - GW); }
    if (y < GH - 1 && regionOf[i + GW] === -1) { regionOf[i + GW] = r; frontier.push(i + GW); }
  }
  let stray = true;
  while (stray) {
    stray = false;
    for (let i = 0; i < N; i++) {
      if (regionOf[i] !== -1) continue;
      const x = i % GW, y = (i / GW) | 0;
      const nb = [x > 0 ? regionOf[i-1] : -1, x < GW-1 ? regionOf[i+1] : -1,
                  y > 0 ? regionOf[i-GW] : -1, y < GH-1 ? regionOf[i+GW] : -1].filter(v => v >= 0);
      if (nb.length) regionOf[i] = nb[0]; else stray = true;
    }
  }
  const MIN = 60;
  for (;;) {
    const sizes = new Array(K).fill(0);
    for (let i = 0; i < N; i++) if (regionOf[i] >= 0) sizes[regionOf[i]]++;
    let small = -1;
    for (let r = 0; r < K; r++) if (sizes[r] > 0 && sizes[r] < MIN) { small = r; break; }
    if (small < 0) break;
    const border = new Map();
    for (let i = 0; i < N; i++) {
      if (regionOf[i] !== small) continue;
      const x = i % GW, y = (i / GW) | 0;
      for (const j of [x > 0 ? i-1 : -1, x < GW-1 ? i+1 : -1, y > 0 ? i-GW : -1, y < GH-1 ? i+GW : -1]) {
        if (j < 0) continue;
        const o = regionOf[j];
        if (o >= 0 && o !== small) border.set(o, (border.get(o) || 0) + 1);
      }
    }
    let bestR = -1, bestC = -1;
    for (const [o, c] of border) if (c > bestC) { bestC = c; bestR = o; }
    if (bestR < 0) break;
    for (let i = 0; i < N; i++) if (regionOf[i] === small) regionOf[i] = bestR;
  }
  const remap = new Map();
  for (let i = 0; i < N; i++) {
    const r = regionOf[i];
    if (r < 0) continue;
    if (!remap.has(r)) remap.set(r, remap.size);
    regionOf[i] = remap.get(r);
  }
  REG_PIX = remap.size;
  regionCells = Array.from({ length: REG_PIX }, () => []);
  for (let i = 0; i < N; i++) if (regionOf[i] >= 0) regionCells[regionOf[i]].push(i);
})();

const nbhd = new Array(N);
for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
  const i = y * GW + x;
  if (regionOf[i] < 0) { nbhd[i] = []; continue; }
  const list = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < GW && ny >= 0 && ny < GH && regionOf[ny * GW + nx] === regionOf[i]) list.push(ny * GW + nx);
  }
  nbhd[i] = list;
}

const px = fs.readFileSync(__dirname + '/_pixels.txt', 'ascii').split(';').filter(Boolean).map(s => s.split(',').map(Number));
const lum = new Float32Array(N), hist = new Uint32Array(256);
for (let i = 0; i < N; i++) { const [r,g,b] = px[i]; const L = 0.299*r+0.587*g+0.114*b; lum[i]=L; hist[L|0]++; }
let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
let sumB = 0, wB = 0, best = 0, otsu = 127;
for (let t = 0; t < 256; t++) {
  wB += hist[t]; if (!wB) continue;
  const wF = N - wB; if (!wF) break;
  sumB += t * hist[t];
  const mB = sumB / wB, mF = (sum - sumB) / wF;
  const v = wB * wF * (mB - mF) * (mB - mF);
  if (v > best) { best = v; otsu = t; }
}
const sol = new Uint8Array(N);
const RR = 5, MIX = 0.75;
for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
  let s = 0, c = 0;
  for (let dy = -RR; dy <= RR; dy++) for (let dx = -RR; dx <= RR; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < GW && ny >= 0 && ny < GH) { s += lum[ny * GW + nx]; c++; }
  }
  sol[y*GW+x] = lum[y*GW+x] > otsu * (1 - MIX) + (s / c) * MIX ? 1 : 0;
}

// flat-pocket sanctuaries (verbatim from proverbs.html)
const sheltered = new Uint8Array(N);
{
  const prng = mulberry32(SEED * 9 + 3);
  const cand = [];
  for (let y = 2; y < GH - 2; y++) for (let x = 2; x < GW - 2; x++) {
    const i = y * GW + x;
    if (regionOf[i] >= REG_PIX || regionOf[i] < 0) continue;
    const v = sol[i];
    let ok = true;
    for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) {
      const j = (y + dy) * GW + (x + dx);
      if (regionOf[j] >= REG_PIX || regionOf[j] < 0 || sol[j] !== v) { ok = false; break; }
    }
    if (ok) cand.push(i);
  }
  for (let a = cand.length - 1; a > 0; a--) { const b = (prng() * (a + 1)) | 0; [cand[a], cand[b]] = [cand[b], cand[a]]; }
  const picked = [];
  for (const i of cand) {
    if (picked.length >= 26) break;
    const x = i % GW, y = (i / GW) | 0;
    let far = true;
    for (const p of picked) {
      if (Math.abs(p % GW - x) < 7 && Math.abs(((p / GW) | 0) - y) < 7) { far = false; break; }
    }
    if (!far) continue;
    picked.push(i);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
      sheltered[(y + dy) * GW + (x + dx)] = 1;
  }
  console.log(`Sanctuaries: ${picked.length} flat pockets sheltered from the weave`);
}

// weave (verbatim)
const srng = mulberry32(SEED * 5 + 7);
for (let guard = 0; guard < 30; guard++) {
  let changed = false;
  for (let i = 0; i < N; i++) {
    if (regionOf[i] >= REG_PIX || regionOf[i] < 0) continue;
    const nb = nbhd[i];
    if (nb.length < 2) continue;
    let lights = 0;
    for (const j of nb) lights += sol[j];
    if (lights !== 0 && lights !== nb.length) continue;
    const free = nb.filter(j => !sheltered[j]);
    if (!free.length) continue;
    sol[free[(srng() * free.length) | 0]] = lights === 0 ? 1 : 0;
    changed = true;
  }
  if (!changed) break;
}
let flatCells = 0;
for (let i = 0; i < N; i++) {
  if (regionOf[i] >= REG_PIX || regionOf[i] < 0) continue;
  const nb = nbhd[i];
  if (nb.length < 2) continue;
  let lights = 0;
  for (const j of nb) lights += sol[j];
  if (lights === 0 || lights === nb.length) flatCells++;
}
console.log(`Flat (0/9-capable) clue cells after weave: ${flatCells}`);

function genRegion(r, difficulty){
  const cfg = DIFF[difficulty];
  const rng = mulberry32(SEED + r * 7919);
  const cells = regionCells[r];
  const len = cells.length;
  const local = new Map();
  for (let a = 0; a < len; a++) local.set(cells[a], a);
  const nbL = new Array(len), val = new Uint8Array(len);
  for (let a = 0; a < len; a++) {
    nbL[a] = nbhd[cells[a]].map(g => local.get(g));
    let c = 0; for (const g of nbhd[cells[a]]) c += sol[g];
    val[a] = c;
  }
  const pairs = new Array(len);
  for (let a = 0; a < len; a++) {
    const ax = cells[a] % GW, ay = (cells[a] / GW) | 0;
    const list = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (!dx && !dy) continue;
      const b = local.get((ay + dy) * GW + (ax + dx));
      if (b !== undefined) list.push(b);
    }
    pairs[a] = list;
  }
  const st = new Uint8Array(len);
  const given = new Uint8Array(len);
  let unknown = 0;
  function basicPass(active){
    let changed = false;
    for (let a = 0; a < len; a++) {
      if (!active[a]) continue;
      let L = 0, U = 0;
      const nb = nbL[a];
      for (let j = 0; j < nb.length; j++) { const s = st[nb[j]]; if (s === 1) L++; else if (s === 0) U++; }
      if (U === 0) continue;
      const need = val[a] - L;
      if (need === 0)      { for (let j = 0; j < nb.length; j++) if (st[nb[j]] === 0) { st[nb[j]] = 2; unknown--; } changed = true; }
      else if (need === U) { for (let j = 0; j < nb.length; j++) if (st[nb[j]] === 0) { st[nb[j]] = 1; unknown--; } changed = true; }
    }
    return changed;
  }
  const UAbuf = new Int32Array(9), UBbuf = new Int32Array(9);
  function nbHas(list, x){ for (let k = 0; k < list.length; k++) if (list[k] === x) return true; return false; }
  function advancedPass(active){
    let changed = false;
    for (let a = 0; a < len; a++) {
      if (!active[a]) continue;
      const nbA = nbL[a];
      let LA = 0, ua = 0;
      for (let k = 0; k < nbA.length; k++) { const s = st[nbA[k]]; if (s === 1) LA++; else if (s === 0) UAbuf[ua++] = nbA[k]; }
      if (!ua) continue;
      const needA = val[a] - LA;
      const pa = pairs[a];
      for (let pi = 0; pi < pa.length; pi++) {
        const b = pa[pi];
        if (!active[b]) continue;
        const nbB = nbL[b];
        let LB = 0, ub = 0;
        for (let k = 0; k < nbB.length; k++) { const s = st[nbB[k]]; if (s === 1) LB++; else if (s === 0) UBbuf[ub++] = nbB[k]; }
        if (!ub) continue;
        const needB = val[b] - LB;
        let xCount = 0;
        for (let k = 0; k < ua; k++) if (!nbHas(nbB, UAbuf[k])) xCount++;
        if (needA - needB !== xCount) continue;
        let applied = false;
        for (let k = 0; k < ua; k++) { const j = UAbuf[k]; if (!nbHas(nbB, j) && st[j] === 0) { st[j] = 1; unknown--; applied = true; } }
        for (let k = 0; k < ub; k++) { const j = UBbuf[k]; if (!nbHas(nbA, j) && st[j] === 0) { st[j] = 2; unknown--; applied = true; } }
        if (applied) { changed = true; break; }
      }
    }
    return changed;
  }
  function solvesWith(active){
    st.fill(0);
    unknown = len;
    for (let a = 0; a < len; a++) if (given[a]) { st[a] = given[a]; unknown--; }
    let changed = true;
    while (changed && unknown > 0) {
      changed = basicPass(active);
      if (!changed && !cfg.basicOnly) changed = advancedPass(active);
    }
    return unknown === 0;
  }
  const active = new Uint8Array(len).fill(1);
  while (!solvesWith(active)) {
    let pick = -1;
    for (let a = 0; a < len; a++) if (st[a] === 0) { pick = a; break; }
    if (pick < 0) break;
    given[pick] = sol[cells[pick]] ? 1 : 2;
  }
  const order = Array.from({ length: len }, (_, a) => a);
  for (let a = order.length - 1; a > 0; a--) { const b = (rng() * (a + 1)) | 0; [order[a], order[b]] = [order[b], order[a]]; }
  for (let pass = 0; pass < cfg.passes; pass++) {
    for (const a of order) {
      if (!active[a]) continue;
      if (cfg.redundancy && rng() < cfg.redundancy) continue;
      active[a] = 0;
      if (!solvesWith(active)) active[a] = 1;
    }
  }
  const flats = [];
  for (let a = 0; a < len; a++) if (val[a] === 0 || val[a] === nbL[a].length) flats.push(a);
  if (flats.length && cfg.extremeKeep > 0) {
    let have = 0;
    for (const a of flats) if (active[a]) have++;
    const want = Math.round(flats.length * cfg.extremeKeep);
    if (want > have) {
      for (let a = flats.length - 1; a > 0; a--) { const b = (rng() * (a + 1)) | 0; [flats[a], flats[b]] = [flats[b], flats[a]]; }
      for (const a of flats) {
        if (have >= want) break;
        if (!active[a]) { active[a] = 1; have++; }
      }
    }
  }
  if (!solvesWith(active)) throw new Error(`${difficulty} map ${r}: unsolvable`);
  for (let a = 0; a < len; a++) {
    const want = sol[cells[a]] ? 1 : 2;
    if (st[a] !== want) throw new Error(`${difficulty} map ${r}: solver disagrees with painting`);
  }
  let kept = 0, zeros = 0, nines = 0, givens = 0;
  for (let a = 0; a < len; a++) {
    if (given[a]) givens++;
    if (!active[a]) continue;
    kept++;
    if (val[a] === 0) zeros++;
    if (val[a] === nbL[a].length) nines++;
  }
  return { kept, zeros, nines, givens, total: len };
}

for (const d of Object.keys(DIFF)) {
  const t0 = Date.now();
  let kept = 0, zeros = 0, nines = 0, givens = 0, total = 0;
  for (let r = 0; r < REG_PIX; r++) {
    const res = genRegion(r, d);
    kept += res.kept; zeros += res.zeros; nines += res.nines; givens += res.givens; total += res.total;
  }
  console.log(`${d.padEnd(8)}: ${kept}/${total} clues (${(kept/total*100).toFixed(1)}%), zeros ${zeros}, full-blocks ${nines}, free-move total ${zeros+nines}, pre-stitched ${givens}, ${Date.now()-t0}ms — all maps solvable`);
}
// ---- picross patches: pattern quality + line-solvability ----
function runsOfLine(vals){
  const runs = [];
  let len = 0;
  for (const v of vals) { if (v) len++; else if (len) { runs.push(len); len = 0; } }
  if (len) runs.push(len);
  return runs;
}
function solveLine(states, runs){
  const L = states.length;
  let inter = null;
  const cur = new Uint8Array(L);
  const minLen = new Array(runs.length);
  let need = 0;
  for (let i = runs.length - 1; i >= 0; i--) { need += runs[i] + (i < runs.length - 1 ? 1 : 0); minLen[i] = need; }
  (function rec(ri, pos){
    if (ri === runs.length) {
      for (let k = pos; k < L; k++) { if (states[k] === 1) return; cur[k] = 2; }
      if (!inter) inter = cur.slice();
      else for (let k = 0; k < L; k++) if (inter[k] !== cur[k]) inter[k] = 255;
      return;
    }
    const len = runs[ri], maxStart = L - minLen[ri];
    for (let s0 = pos; s0 <= maxStart; s0++) {
      if (s0 > pos && states[s0 - 1] === 1) break;
      let ok = true;
      for (let k = s0; k < s0 + len; k++) if (states[k] === 2) { ok = false; break; }
      const next = s0 + len;
      if (ok && ri < runs.length - 1 && states[next] === 1) ok = false;
      if (ok) {
        for (let k = pos; k < s0; k++) cur[k] = 2;
        for (let k = s0; k < s0 + len; k++) cur[k] = 1;
        if (ri < runs.length - 1) { cur[next] = 2; rec(ri + 1, next + 1); }
        else rec(ri + 1, next);
      }
    }
  })(0, 0);
  return inter;
}
for (const [pxx, pyy, n] of PICROSS) {
  const rowRuns = [], colRuns = [];
  let lights = 0;
  for (let r = 0; r < n; r++) {
    const vals = [];
    for (let c = 0; c < n; c++) { const v = sol[(pyy+r)*GW+pxx+c]; vals.push(v); lights += v; }
    rowRuns.push(runsOfLine(vals));
  }
  for (let c = 0; c < n; c++) {
    const vals = [];
    for (let r = 0; r < n; r++) vals.push(sol[(pyy+r)*GW+pxx+c]);
    colRuns.push(runsOfLine(vals));
  }
  const st = new Uint8Array(n * n);
  let givens = 0;
  for (;;) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = 0; r < n; r++) {
        const line = []; for (let c = 0; c < n; c++) line.push(st[r*n+c]);
        const inter = solveLine(line, rowRuns[r]);
        for (let c = 0; c < n; c++) if (st[r*n+c]===0 && (inter[c]===1||inter[c]===2)) { st[r*n+c]=inter[c]; changed=true; }
      }
      for (let c = 0; c < n; c++) {
        const line = []; for (let r = 0; r < n; r++) line.push(st[r*n+c]);
        const inter = solveLine(line, colRuns[c]);
        for (let r = 0; r < n; r++) if (st[r*n+c]===0 && (inter[r]===1||inter[r]===2)) { st[r*n+c]=inter[r]; changed=true; }
      }
    }
    let stuck = -1;
    for (let p = 0; p < n*n; p++) if (st[p]===0) { stuck = p; break; }
    if (stuck < 0) break;
    st[stuck] = sol[(pyy+((stuck/n)|0))*GW+pxx+(stuck%n)] ? 1 : 2;
    givens++;
  }
  for (let p = 0; p < n*n; p++) {
    const want = sol[(pyy+((p/n)|0))*GW+pxx+(p%n)] ? 1 : 2;
    if (st[p] !== want) throw new Error(`picross ${pxx},${pyy}: line solution differs from painting`);
  }
  console.log(`picross ${String(pxx).padStart(3)},${String(pyy).padStart(2)} ${n}x${n}: ${lights}/${n*n} light (${(lights/(n*n)*100).toFixed(0)}%), line-solvable with ${givens} givens`);
}

// ---- sudoku plots: validity + uniqueness per tier ----
const SZONES = [
  { x: 57, y: 4,  n: 4, boxW: 2, boxH: 2, jigsaw: false, givens: 7 },
  { x: 18, y: 38, n: 6, boxW: 2, boxH: 3, jigsaw: true,  givens: 15 },
  { x: 86, y: 44, n: 9, boxW: 3, boxH: 3, jigsaw: true,  givens: 38 },
  { x: 100, y: 10, n: 4, boxW: 2, boxH: 2, jigsaw: false, givens: 7 },
  { x: 4,  y: 14, n: 6, boxW: 2, boxH: 3, jigsaw: false, givens: 15 },
  { x: 52, y: 50, n: 9, boxW: 3, boxH: 3, jigsaw: false, givens: 36 },
  { x: 26, y: 16, n: 6, boxW: 2, boxH: 3, jigsaw: true,  givens: 15 },
  { x: 28, y: 52, n: 6, boxW: 2, boxH: 3, jigsaw: false, givens: 15 },
];
function genSudoku(zone, rng, cfg){
  const n = zone.n, NN = n * n;
  const givensTarget = Math.min(NN - 1, Math.max(4, Math.round(zone.givens * (cfg.zGivens || 1))));
  const swapsTarget = Math.round(n * 8 * (cfg.zSwaps || 1));
  const boxId = new Uint8Array(NN);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
    boxId[r * n + c] = ((r / zone.boxH) | 0) * (n / zone.boxW) + ((c / zone.boxW) | 0);
  function buildPeers(){
    const peers = new Array(NN);
    for (let p = 0; p < NN; p++) {
      const set = new Set();
      const r = (p / n) | 0, c = p % n;
      for (let k = 0; k < n; k++) { set.add(r * n + k); set.add(k * n + c); }
      for (let q = 0; q < NN; q++) if (boxId[q] === boxId[p]) set.add(q);
      set.delete(p);
      peers[p] = [...set];
    }
    return peers;
  }
  function popcount(m){ let c = 0; while (m) { m &= m - 1; c++; } return c; }
  let peers = buildPeers();
  const g = new Uint8Array(NN);
  function candMask(p){
    let mask = (1 << n) - 1;
    for (const q of peers[p]) if (g[q]) mask &= ~(1 << (g[q] - 1));
    return mask;
  }
  function fill(){
    let bp = -1, bm = 0, bc = n + 1;
    for (let p = 0; p < NN; p++) {
      if (g[p]) continue;
      const m = candMask(p), cnt = popcount(m);
      if (cnt === 0) return false;
      if (cnt < bc) { bc = cnt; bp = p; bm = m; if (cnt === 1) break; }
    }
    if (bp < 0) return true;
    const vals = [];
    for (let v = 1; v <= n; v++) if (bm & (1 << (v - 1))) vals.push(v);
    for (let a = vals.length - 1; a > 0; a--) { const b = (rng() * (a + 1)) | 0; [vals[a], vals[b]] = [vals[b], vals[a]]; }
    for (const v of vals) { g[bp] = v; if (fill()) return true; }
    g[bp] = 0;
    return false;
  }
  fill();
  const solution = g.slice();
  if (zone.jigsaw) {
    function contiguous(b){
      let first = -1, total = 0;
      for (let p = 0; p < NN; p++) if (boxId[p] === b) { if (first < 0) first = p; total++; }
      const seen = new Set([first]); const stack = [first];
      while (stack.length) {
        const p = stack.pop(); const r = (p / n) | 0, c = p % n;
        for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
          const q = nr * n + nc;
          if (boxId[q] === b && !seen.has(q)) { seen.add(q); stack.push(q); }
        }
      }
      return seen.size === total;
    }
    let done = 0, tries = 0;
    while (done < swapsTarget && tries < swapsTarget * 80) {
      tries++;
      const a = (rng() * NN) | 0, A = boxId[a];
      const r = (a / n) | 0, c = a % n;
      const neighB = [];
      for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
        const o = boxId[nr * n + nc];
        if (o !== A) neighB.push(o);
      }
      if (!neighB.length) continue;
      const B = neighB[(rng() * neighB.length) | 0];
      let b2 = -1;
      for (let p = 0; p < NN; p++) if (boxId[p] === B && solution[p] === solution[a]) { b2 = p; break; }
      if (b2 < 0 || b2 === a) continue;
      boxId[a] = B; boxId[b2] = A;
      if (contiguous(A) && contiguous(B)) done++;
      else { boxId[a] = A; boxId[b2] = B; }
    }
    peers = buildPeers();
  }
  const budget = { nodes: 0 };
  function countSolutions(limit){
    if (++budget.nodes > 30000) return limit;
    let bp = -1, bm = 0, bc = n + 1;
    for (let p = 0; p < NN; p++) {
      if (g[p]) continue;
      const m = candMask(p), cnt = popcount(m);
      if (cnt === 0) return 0;
      if (cnt < bc) { bc = cnt; bp = p; bm = m; if (cnt === 1) break; }
    }
    if (bp < 0) return 1;
    let total = 0;
    for (let v = 1; v <= n; v++) {
      if (!(bm & (1 << (v - 1)))) continue;
      g[bp] = v;
      total += countSolutions(limit - total);
      g[bp] = 0;
      if (total >= limit) break;
    }
    return total;
  }
  const order = Array.from({ length: NN }, (_, p) => p);
  for (let a = NN - 1; a > 0; a--) { const b = (rng() * (a + 1)) | 0; [order[a], order[b]] = [order[b], order[a]]; }
  let givens = NN;
  for (const p of order) {
    if (givens <= givensTarget) break;
    const keep = g[p]; g[p] = 0;
    budget.nodes = 0;
    if (countSolutions(2) !== 1) g[p] = keep; else givens--;
  }
  return { boxId, puzzle: g.slice(), solution, givens, givensTarget };
}
for (const d of Object.keys(DIFF)) {
  const parts = [];
  let firstSolution = null;
  for (const z of SZONES) {
    const res = genSudoku(z, mulberry32(SEED + z.x * 131 + z.y * 977), DIFF[d]);
    const n = z.n;
    const expect = Array.from({length: n}, (_, v) => v + 1).join(',');
    for (let r = 0; r < n; r++) {
      const row = [], col = [];
      for (let c = 0; c < n; c++) { row.push(res.solution[r*n+c]); col.push(res.solution[c*n+r]); }
      if (row.sort((a,b)=>a-b).join(',') !== expect) throw new Error(`${d} sudoku ${z.x},${z.y}: bad row`);
      if (col.sort((a,b)=>a-b).join(',') !== expect) throw new Error(`${d} sudoku ${z.x},${z.y}: bad col`);
    }
    const boxSizes = new Array(n).fill(0);
    for (let p = 0; p < n*n; p++) boxSizes[res.boxId[p]]++;
    if (boxSizes.some(b => b !== n)) throw new Error(`${d} sudoku ${z.x},${z.y}: bad box sizes`);
    for (let b = 0; b < n; b++) {
      const box = [];
      for (let p = 0; p < n*n; p++) if (res.boxId[p] === b) box.push(res.solution[p]);
      if (box.sort((a,b)=>a-b).join(',') !== expect) throw new Error(`${d} sudoku ${z.x},${z.y}: bad box`);
    }
    for (let p = 0; p < n*n; p++)
      if (res.puzzle[p] !== 0 && res.puzzle[p] !== res.solution[p]) throw new Error(`${d} sudoku ${z.x},${z.y}: given mismatch`);
    parts.push(`${res.givens}/${n*n}`);
  }
  console.log(`sudoku ${d.padEnd(8)}: givens ${parts.join(' ')} — all valid + unique`);
}
console.log('ALL TIERS PASS');
