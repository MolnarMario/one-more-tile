// Instrumentation: reproduce the board deterministically (verbatim from
// verify-puzzle.js) then, per pixel-region, measure how much of the solve
// needs cross-clue subtraction (advancedPass) vs plain counting (basicPass).
// Also locate regions in reading order and dump a region's clue grid.
// NOTE: predates the v0.14 no-givens texture repair (castle board only) —
// for current behaviour use index.html?audit=1 / auditGivens().
'use strict';
const fs = require('fs');
const GW = 120, GH = 64, N = GW * GH, SEED = 1337;
const DIFFICULTY = process.argv[2] || 'medium';
const SHOW_REGION = process.argv[3] !== undefined ? Number(process.argv[3]) : -1;
let TRACE = false;

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const DIFF = {
  veryeasy: { redundancy: 0.65, passes: 1, extremeKeep: 1.0, basicOnly: true },
  easy:     { redundancy: 0.40, passes: 1, extremeKeep: 0.6, basicOnly: true },
  medium:   { redundancy: 0.20, passes: 1, extremeKeep: 0.3, basicOnly: true },
  hard:     { redundancy: 0.08, passes: 1, extremeKeep: 0.1 },
  veryhard: { redundancy: 0,    passes: 2, extremeKeep: 0 },
};

const ZONES = [[57,4,4],[18,38,6],[86,44,9],[100,10,4],[4,14,6],[52,50,9],[26,16,6],[28,52,6]];
const PICROSS = [[30,8,8],[70,20,7],[43,41,7],[102,24,8],[40,26,6],[66,42,6],[12,26,7],[108,40,6]];
const blocked = new Uint8Array(N);
for (const [bx,by,bn] of ZONES.concat(PICROSS))
  for (let dy=0;dy<bn;dy++) for (let dx=0;dx<bn;dx++) blocked[(by+dy)*GW+bx+dx]=1;

const regionOf = new Int16Array(N).fill(-1);
let REG_PIX = 0, regionCells = [];
(function(){
  const rng = mulberry32(SEED * 2 + 1);
  for (let i = 0; i < N; i++) if (blocked[i]) regionOf[i] = -2;
  const COLS = 6, ROWS = 3, cw = GW / COLS, ch = GH / ROWS;
  const frontier = []; let K = 0;
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
const sheltered = new Uint8Array(N);
{
  const prng = mulberry32(SEED * 9 + 3);
  const cand = [];
  for (let y = 2; y < GH - 2; y++) for (let x = 2; x < GW - 2; x++) {
    const i = y * GW + x;
    if (regionOf[i] >= REG_PIX || regionOf[i] < 0) continue;
    const v = sol[i]; let ok = true;
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
    const x = i % GW, y = (i / GW) | 0; let far = true;
    for (const p of picked) if (Math.abs(p % GW - x) < 7 && Math.abs(((p / GW) | 0) - y) < 7) { far = false; break; }
    if (!far) continue;
    picked.push(i);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) sheltered[(y + dy) * GW + (x + dx)] = 1;
  }
}
const srng = mulberry32(SEED * 5 + 7);
for (let guard = 0; guard < 30; guard++) {
  let changed = false;
  for (let i = 0; i < N; i++) {
    if (regionOf[i] >= REG_PIX || regionOf[i] < 0) continue;
    const nb = nbhd[i]; if (nb.length < 2) continue;
    let lights = 0; for (const j of nb) lights += sol[j];
    if (lights !== 0 && lights !== nb.length) continue;
    const free = nb.filter(j => !sheltered[j]); if (!free.length) continue;
    sol[free[(srng() * free.length) | 0]] = lights === 0 ? 1 : 0;
    changed = true;
  }
  if (!changed) break;
}

// genRegion — returns the shown clue layout + instrumented solve trace
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
      let L = 0, U = 0; const nb = nbL[a];
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
      const nbA = nbL[a]; let LA = 0, ua = 0;
      for (let k = 0; k < nbA.length; k++) { const s = st[nbA[k]]; if (s === 1) LA++; else if (s === 0) UAbuf[ua++] = nbA[k]; }
      if (!ua) continue;
      const needA = val[a] - LA; const pa = pairs[a];
      for (let pi = 0; pi < pa.length; pi++) {
        const b = pa[pi]; if (!active[b]) continue;
        const nbB = nbL[b]; let LB = 0, ub = 0;
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
    st.fill(0); unknown = len;
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
  for (let pass = 0; pass < cfg.passes; pass++) for (const a of order) {
    if (!active[a]) continue;
    if (cfg.redundancy && rng() < cfg.redundancy) continue;
    active[a] = 0;
    if (!solvesWith(active)) active[a] = 1;
  }
  const flats = [];
  for (let a = 0; a < len; a++) if (val[a] === 0 || val[a] === nbL[a].length) flats.push(a);
  if (flats.length && cfg.extremeKeep > 0) {
    let have = 0; for (const a of flats) if (active[a]) have++;
    const want = Math.round(flats.length * cfg.extremeKeep);
    if (want > have) {
      for (let a = flats.length - 1; a > 0; a--) { const b = (rng() * (a + 1)) | 0; [flats[a], flats[b]] = [flats[b], flats[a]]; }
      for (const a of flats) { if (have >= want) break; if (!active[a]) { active[a] = 1; have++; } }
    }
  }

  // a logging version of one subtraction step: returns details of the FIRST
  // forced cross-clue subtraction available in the current state, or null
  function firstSubtraction(active){
    for (let a = 0; a < len; a++) {
      if (!active[a]) continue;
      const nbA = nbL[a]; let LA = 0; const UA = [];
      for (let k = 0; k < nbA.length; k++) { const s = st[nbA[k]]; if (s === 1) LA++; else if (s === 0) UA.push(nbA[k]); }
      if (!UA.length) continue;
      const needA = val[a] - LA; const pa = pairs[a];
      for (let pi = 0; pi < pa.length; pi++) {
        const b = pa[pi]; if (!active[b]) continue;
        const nbB = nbL[b]; let LB = 0; const UB = [];
        for (let k = 0; k < nbB.length; k++) { const s = st[nbB[k]]; if (s === 1) LB++; else if (s === 0) UB.push(nbB[k]); }
        if (!UB.length) continue;
        const needB = val[b] - LB;
        const Aonly = UA.filter(j => !nbB.includes(j));
        const Bonly = UB.filter(j => !nbA.includes(j));
        if (needA - needB === Aonly.length && (Aonly.length || Bonly.length)) {
          return { a: cells[a], b: cells[b], clueA: val[a], clueB: val[b], LA, LB,
                   needA, needB, Aonly: Aonly.map(li => cells[li]), Bonly: Bonly.map(li => cells[li]) };
        }
      }
    }
    return null;
  }

  // instrumented fresh solve: count "advanced-required junctures" — points
  // where basic counting fully stalls but the region isn't solved, so only a
  // cross-clue subtraction can unblock it (these are the hard-to-spot moves)
  st.fill(0); unknown = len;
  for (let a = 0; a < len; a++) if (given[a]) { st[a] = given[a]; unknown--; }
  let basicSolved = 0, advSolved = 0, junctures = 0;
  const subs = [], phases = [];
  const givenCount = given.reduce((s,v)=>s+(v?1:0),0);
  for (;;) {
    let before = unknown;
    while (basicPass(active)) {}
    const basicResolved = before - unknown;
    basicSolved += basicResolved;
    if (unknown === 0) { phases.push({ basicResolved, sub: null, advResolved: 0 }); break; }
    let s = null;
    if (TRACE && !cfg.basicOnly) { s = firstSubtraction(active); if (s) subs.push(s); }
    const ph = { basicResolved, sub: s, advResolved: 0 };
    phases.push(ph);
    before = unknown;
    if (cfg.basicOnly || !advancedPass(active)) break;   // basicOnly stops here; otherwise truly stuck
    ph.advResolved = before - unknown;
    advSolved += ph.advResolved;
    junctures++;
  }
  return { cells, len, val, active, given, nbL, kept: active.reduce((s,v)=>s+v,0),
           basicSolved, advSolved, junctures, solved: unknown === 0, subs, phases, givenCount };
}

// ---- region geometry table (reading order = compact id order) ----
function bbox(cells){
  let x0=GW,y0=GH,x1=0,y1=0;
  for (const i of cells){ const x=i%GW,y=(i/GW)|0; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
  return {x0,y0,x1,y1};
}
console.log(`difficulty = ${DIFFICULTY}\n`);
console.log('region  x-range    y-range   size  clues  basicCells  advCells  advJunctures');
const summaries = [];
for (let r = 0; r < REG_PIX; r++) {
  const res = genRegion(r, DIFFICULTY);
  summaries.push(res);
  const bb = bbox(res.cells);
  console.log(
    `${String(r).padStart(4)}   ${String(bb.x0).padStart(3)}-${String(bb.x1).padEnd(3)}  ` +
    `${String(bb.y0).padStart(3)}-${String(bb.y1).padEnd(3)} ${String(res.len).padStart(5)} ` +
    `${String(res.kept).padStart(6)} ${String(res.basicSolved).padStart(10)} ${String(res.advSolved).padStart(9)} ` +
    `${String(res.junctures).padStart(13)}`);
}

// ---- optional: dump one region's clue grid ----
if (SHOW_REGION >= 0 && SHOW_REGION < REG_PIX) {
  const res = summaries[SHOW_REGION];
  const bb = bbox(res.cells);
  const local = new Map(); res.cells.forEach((i,a)=>local.set(i,a));
  console.log(`\nclue grid for region ${SHOW_REGION}  (x ${bb.x0}-${bb.x1}, y ${bb.y0}-${bb.y1})`);
  console.log('  digit = shown clue · "·" = region cell, clue hidden · "G" = pre-stitched given · space = other region\n');
  const xs = '    ' + Array.from({length: bb.x1-bb.x0+1}, (_,k)=>(bb.x0+k)%10).join('');
  console.log(xs);
  for (let y = bb.y0; y <= bb.y1; y++) {
    let row = String(y).padStart(3) + ' ';
    for (let x = bb.x0; x <= bb.x1; x++) {
      const i = y*GW+x;
      if (regionOf[i] !== SHOW_REGION) { row += ' '; continue; }
      const a = local.get(i);
      if (res.given[a]) row += 'G';
      else if (res.active[a]) row += String(res.val[a]);
      else row += '·';
    }
    console.log(row);
  }

  // full VALUE grid (every cell's true clue count, regardless of whether shown)
  console.log(`\nfull value grid (true count for EVERY cell) — UPPERCASE-marked light tiles via second grid below`);
  console.log(xs);
  for (let y = bb.y0; y <= bb.y1; y++) {
    let row = String(y).padStart(3) + ' ';
    for (let x = bb.x0; x <= bb.x1; x++) {
      const i = y*GW+x;
      if (regionOf[i] !== SHOW_REGION) { row += ' '; continue; }
      row += String(res.val[local.get(i)]);
    }
    console.log(row);
  }

  // solution grid: # = light, . = dark
  console.log(`\nsolution (the painting)  '#' = light · '.' = dark`);
  console.log(xs);
  for (let y = bb.y0; y <= bb.y1; y++) {
    let row = String(y).padStart(3) + ' ';
    for (let x = bb.x0; x <= bb.x1; x++) {
      const i = y*GW+x;
      if (regionOf[i] !== SHOW_REGION) { row += ' '; continue; }
      row += sol[i] ? '#' : '.';
    }
    console.log(row);
  }

  // re-run with tracing to capture the actual forced cross-clue subtractions
  TRACE = true;
  const traced = genRegion(SHOW_REGION, DIFFICULTY);
  const xy = i => `(${i%GW},${(i/GW)|0})`;

  // full step-by-step path: alternating basic-counting waves and the forced
  // subtraction that unblocks the next wave
  console.log(`\n=== FULL SOLVE PATH for region ${SHOW_REGION}  (${traced.len} tiles, ${traced.givenCount} pre-stitched givens) ===`);
  console.log(`solved = ${traced.solved}; basic counting resolves ${traced.basicSolved}, subtraction unlocks ${traced.advSolved}\n`);
  let cum = traced.givenCount;
  traced.phases.forEach((ph, k) => {
    cum += ph.basicResolved;
    console.log(`Phase ${k}: plain counting fills ${ph.basicResolved} tiles  (running total ${cum}/${traced.len})`);
    if (ph.sub) {
      const s = ph.sub;
      console.log(`   ↳ STALL — only a subtraction continues (this stall resolves ${ph.advResolved} tiles, lead move shown):`);
      console.log(`     clue A=${s.clueA}@${xy(s.a)} vs B=${s.clueB}@${xy(s.b)} | needA ${s.needA} − needB ${s.needB} = ${s.needA-s.needB} = ${s.Aonly.length} A-only tiles`);
      if (s.Aonly.length) console.log(`     → LIGHT: ${s.Aonly.map(xy).join(' ')}`);
      if (s.Bonly.length) console.log(`     → DARK : ${s.Bonly.map(xy).join(' ')}`);
      cum += ph.advResolved;
    } else {
      console.log(`   ↳ ${traced.solved && k===traced.phases.length-1 ? 'DONE — region fully solved' : '(stuck — no move found)'}`);
    }
  });
}
