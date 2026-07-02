// ============================================================
//  REGION EDITOR — draw region borders by hand over the scanned
//  pixel art. Reuses the game's dimsForImage / sampleImage / placePlots /
//  attachPlots / genRegionClues (injected ahead of this as Blocks A/B/C),
//  so the board is byte-identical to the game's. You paint walls on cell
//  edges; connected components of non-plot cells become regions. Each new
//  region opens a quote field. Export → JSON map-def → baked into index.html.
//
//  This file is injected by _build_editor.js AFTER the shared blocks, so all
//  of the game's globals/functions are in scope. Do not redeclare them.
// ============================================================

const ED = {
  img: null, imageDataURI: '', haveImage: false,
  view: { x: 0, y: 0, s: 12 },
  tool: 'draw',              // 'draw' | 'erase'
  showRegions: true,
  vWall: null, hWall: null,  // Uint8Array wall flags (1 = border)
  label: null,               // Int16Array: organic component id per cell (-2 = plot cell)
  edRegPix: 0,
  quotes: {},                // organic region id -> quote text
  prevLabel: null,
  newRegions: [],
  drag: null,                // { mode:'wall'|'pan', ... }
  lastVertex: null,          // [vx, vy] during a wall stroke
  curStroke: null,           // [{type,idx,old}, …] for undo
  hoverEdge: null,
  undo: [],
  spaceHeld: false,
};

const $ = id => document.getElementById(id);
const cv = $('cv'), cx = cv.getContext('2d');
let dpr = 1;

// wall accessors: vW(x,y) = border on the RIGHT of cell (x,y), x in 0..GW-2
//                 hW(x,y) = border BELOW cell (x,y),        y in 0..GH-2
function vW(x, y){ return ED.vWall[y * (GW - 1) + x]; }
function hW(x, y){ return ED.hWall[y * GW + x]; }
function isPlot(i){ return zoneOf[i] >= 0 || picrossOf[i] >= 0; }
// distinct overlay colour per organic region (golden-angle hue)
function regColor(r){ return `hsl(${(r * 137.508) % 360},58%,58%)`; }
function setStatus(t){ $('status').textContent = t; }

// ---------- image load + scan ----------
$('file').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => loadImageSrc(String(rd.result));
  rd.readAsDataURL(f);
});
function loadImageSrc(src){
  const im = new Image();
  im.onload = () => { ED.img = im; ED.imageDataURI = src; onImage(); };
  im.onerror = () => setStatus('Could not load that image.');
  im.src = src;
}
const RES_MIN = 2500;                                  // resolution-slider low end (cell budget)
// aspect-locked board dims from a target cell budget, never exceeding the engine cap
function dimsFromBudget(B){
  const a = ED.aspect || 1;
  let gw = Math.max(40, Math.round(Math.sqrt(B * a)));
  let gh = Math.max(40, Math.round(B / gw));
  while (gw * gh > MAXN) { if (gw >= gh) gw--; else gh--; }   // shrink the longer side until N ≤ MAXN
  return { gw, gh };
}
function resReadout(){
  const { gw, gh } = dimsFromBudget(+$('res').value);
  $('resLabel').textContent = `${gw} × ${gh} · ${(gw * gh).toLocaleString()} cells`;
  return { gw, gh };
}
// (re)scan the image at forced dims ({} = aspect-default), resetting walls/regions
function rescan(forced){
  dimsForImage(ED.img, forced);          // sets GW, GH, N (Block A)
  $('dimW').value = GW; $('dimH').value = GH;
  sampleImage(ED.img);                   // fills cellCol[], edge[], sol[] (Block B)
  ED.vWall = new Uint8Array((GW - 1) * GH);
  ED.hWall = new Uint8Array(GW * (GH - 1));
  ED.undo.length = 0;
  ED.quotes = {}; ED.prevLabel = null;
  placePlotsNow();
  ED.haveImage = true;
  detect();
  resizeCanvas(); fitView(); render();
}
// fresh image: lock to its aspect ratio, default the resolution slider, scan
function onImage(){
  ED.aspect = (ED.img.naturalWidth || 1) / (ED.img.naturalHeight || 1);
  const res = $('res');
  res.min = RES_MIN; res.max = MAXN; res.step = 250;
  res.value = Math.min(MAXN, CELL_TARGET);             // default ≈ the game's standard cell budget
  const { gw, gh } = resReadout();
  rescan({ gw, gh });
  setStatus(`Scanned ${GW}×${GH} (${(GW * GH).toLocaleString()} cells). Set the Resolution slider, then draw borders.`);
}
function placePlotsNow(){
  SEED = parseInt($('seed').value, 10) || 1;
  const pl = placePlots(SEED);           // seeded auto-placement (Block A)
  ZONES = pl.zones; PICROSS = pl.picross;
  fillPlotCells();                       // sets zoneOf/picrossOf + each plot's .cells (Block A)
}

// ---------- region detection (flood-fill, row-major first-encounter) ----------
// Row-major first-encounter id assignment exactly reproduces the game's
// growRegions compaction, so the ids the editor shows == the ids baked into
// index.html == the MAP_QUOTES keys.
function detect(){
  const lab = new Int16Array(N).fill(-1);
  for (let i = 0; i < N; i++) if (isPlot(i)) lab[i] = -2;
  let next = 0;
  const stack = [];
  for (let s = 0; s < N; s++) {
    if (lab[s] !== -1) continue;
    const id = next++;
    lab[s] = id; stack.length = 0; stack.push(s);
    while (stack.length) {
      const c = stack.pop();
      const x = c % GW, y = (c / GW) | 0;
      if (x < GW - 1 && lab[c + 1]  === -1 && !vW(x, y))     { lab[c + 1]  = id; stack.push(c + 1); }
      if (x > 0      && lab[c - 1]  === -1 && !vW(x - 1, y)) { lab[c - 1]  = id; stack.push(c - 1); }
      if (y < GH - 1 && lab[c + GW] === -1 && !hW(x, y))     { lab[c + GW] = id; stack.push(c + GW); }
      if (y > 0      && lab[c - GW] === -1 && !hW(x, y - 1)) { lab[c - GW] = id; stack.push(c - GW); }
    }
  }
  ED.edRegPix = next;

  // write the partition into the game's globals so the shared attachPlots /
  // genRegionClues operate on it (mirrors growRegions' append + bookkeeping)
  REG_PIX = next;
  REG_COUNT = REG_PIX + ZONES.length + PICROSS.length;
  for (let i = 0; i < N; i++) regionOf[i] = lab[i];           // organic id, or -2 for plot cells
  for (const z of ZONES) { z.region = REG_PIX + z.idx; for (const c of z.cells) regionOf[c] = z.region; }
  for (const p of PICROSS) { p.region = REG_PIX + ZONES.length + p.idx; for (const c of p.cells) regionOf[c] = p.region; }
  regionCells = Array.from({ length: REG_COUNT }, () => []);
  for (let i = 0; i < N; i++) regionCells[regionOf[i]].push(i);
  attachPlots();                                             // sets z.attached / p.attached (Block A)

  carryQuotes(lab);
  ED.prevLabel = lab; ED.label = lab;
  // cache each region's label position (centroid-nearest cell) so render() needn't scan all cells
  ED.labelPos = [];
  for (let r = 0; r < REG_PIX; r++) {
    const cells = regionCells[r]; if (!cells || !cells.length) { ED.labelPos[r] = null; continue; }
    let sx = 0, sy = 0; for (const i of cells) { sx += i % GW; sy += (i / GW) | 0; }
    sx /= cells.length; sy /= cells.length;
    let bi = cells[0], bd = 1e9; for (const i of cells) { const dx = i % GW - sx, dy = (i / GW | 0) - sy, d = dx * dx + dy * dy; if (d < bd) { bd = d; bi = i; } }
    ED.labelPos[r] = { x: bi % GW, y: (bi / GW) | 0 };
  }
  rebuildPanel();
}

// carry each quote onto whichever new region most overlaps the old one it was on
function carryQuotes(lab){
  const prev = ED.prevLabel;
  ED.newRegions = [];
  if (!prev) { for (let r = 0; r < ED.edRegPix; r++) ED.newRegions.push(r); return; }
  const ov = Array.from({ length: ED.edRegPix }, () => new Map());
  for (let i = 0; i < N; i++) { const a = lab[i], b = prev[i]; if (a < 0 || b < 0) continue; ov[a].set(b, (ov[a].get(b) || 0) + 1); }
  const pairs = [];
  for (let a = 0; a < ED.edRegPix; a++) for (const [b, c] of ov[a]) pairs.push([c, a, b]);
  pairs.sort((p, q) => q[0] - p[0]);
  const newQuotes = {}, usedNew = new Set(), usedOld = new Set();
  for (const [, a, b] of pairs) {
    if (usedNew.has(a) || usedOld.has(b)) continue;
    usedNew.add(a); usedOld.add(b);
    if (ED.quotes[b] !== undefined && ED.quotes[b] !== '') newQuotes[a] = ED.quotes[b];
  }
  for (let r = 0; r < ED.edRegPix; r++) if (!usedNew.has(r)) ED.newRegions.push(r);
  ED.quotes = newQuotes;
}

// ---------- view / rendering ----------
function resizeCanvas(){
  dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = Math.max(1, w * dpr); cv.height = Math.max(1, h * dpr);
}
function fitView(){
  const w = cv.clientWidth, h = cv.clientHeight;
  const s = Math.min(w / GW, h / GH) * 0.95;
  ED.view.s = s;
  ED.view.x = (w - GW * s) / 2;
  ED.view.y = (h - GH * s) / 2;
}
function strokeEdge(e){
  const { x: ox, y: oy, s } = ED.view;
  if (e.type === 'v') { const px = ox + (e.x + 1) * s; cx.moveTo(px, oy + e.y * s); cx.lineTo(px, oy + (e.y + 1) * s); }
  else { const py = oy + (e.y + 1) * s; cx.moveTo(ox + e.x * s, py); cx.lineTo(ox + (e.x + 1) * s, py); }
}
function drawPlotBox(z, edge, fill, tag){
  const { x: ox, y: oy, s } = ED.view;
  const zx = ox + z.x * s, zy = oy + z.y * s, n = z.n;
  cx.fillStyle = fill; cx.fillRect(zx, zy, n * s, n * s);
  cx.strokeStyle = edge; cx.lineWidth = Math.max(2, s * 0.14); cx.strokeRect(zx, zy, n * s, n * s);
  label(tag + '→R' + z.attached, zx + n * s / 2, zy + n * s / 2, Math.max(9, s * 0.9 | 0), '#06251f');
}
function label(t, x, y, size, fill){
  cx.font = 'bold ' + size + 'px system-ui,sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.lineWidth = 3; cx.strokeStyle = 'rgba(255,255,255,.9)'; cx.strokeText(t, x, y);
  cx.fillStyle = fill; cx.fillText(t, x, y);
}
function render(){
  if (!ED.haveImage) return;
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = cv.clientWidth, H = cv.clientHeight;
  cx.clearRect(0, 0, W, H);
  const { x: ox, y: oy, s } = ED.view;
  // viewport cull — only iterate visible cells/edges (keeps high-res boards smooth)
  const gx0 = Math.max(0, Math.floor(-ox / s)), gy0 = Math.max(0, Math.floor(-oy / s));
  const gx1 = Math.min(GW - 1, Math.ceil((W - ox) / s)), gy1 = Math.min(GH - 1, Math.ceil((H - oy) / s));

  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
    const i = gy * GW + gx; cx.fillStyle = cellCol[i] || '#000'; cx.fillRect(ox + gx * s, oy + gy * s, s + 0.6, s + 0.6);
  }
  if (ED.showRegions) {
    cx.globalAlpha = 0.34;
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      const i = gy * GW + gx, r = regionOf[i]; if (r < 0 || r >= REG_PIX) continue;
      cx.fillStyle = regColor(r); cx.fillRect(ox + gx * s, oy + gy * s, s + 0.6, s + 0.6);
    }
    cx.globalAlpha = 1;
  }

  for (const z of ZONES) drawPlotBox(z, '#e8a04c', 'rgba(240,234,251,.55)', 'S' + z.idx);
  for (const p of PICROSS) drawPlotBox(p, '#2fb39a', 'rgba(47,179,154,.20)', 'P' + p.idx);

  // the drawn walls (culled to the visible edge range)
  cx.strokeStyle = '#15102b'; cx.lineWidth = Math.max(2, s * 0.18); cx.lineCap = 'round';
  cx.beginPath();
  for (let y = gy0; y <= gy1; y++) for (let x = Math.max(0, gx0 - 1); x <= Math.min(GW - 2, gx1); x++) if (vW(x, y)) strokeEdge({ type: 'v', x, y });
  for (let y = Math.max(0, gy0 - 1); y <= Math.min(GH - 2, gy1); y++) for (let x = gx0; x <= gx1; x++) if (hW(x, y)) strokeEdge({ type: 'h', x, y });
  cx.stroke();

  if (ED.hoverEdge) { cx.strokeStyle = ED.tool === 'erase' ? 'rgba(210,60,78,.9)' : 'rgba(240,162,36,.95)'; cx.lineWidth = Math.max(2, s * 0.18); cx.beginPath(); strokeEdge(ED.hoverEdge); cx.stroke(); }

  // region id labels (positions cached in detect())
  const pos = ED.labelPos || [];
  for (let r = 0; r < REG_PIX; r++) {
    const p = pos[r]; if (!p) continue;
    const hasQuote = ED.quotes[r] && ED.quotes[r].trim();
    label((hasQuote ? '“ ' : '') + 'R' + r, ox + (p.x + 0.5) * s, oy + (p.y + 0.5) * s, Math.max(10, s * 1.1 | 0), '#1b1330');
  }
}

// ---------- pointer → edges ----------
function vertexAt(mx, my){
  const fx = (mx - ED.view.x) / ED.view.s, fy = (my - ED.view.y) / ED.view.s;
  return [Math.max(0, Math.min(GW, Math.round(fx))), Math.max(0, Math.min(GH, Math.round(fy)))];
}
function nearestEdge(mx, my){
  const fx = (mx - ED.view.x) / ED.view.s, fy = (my - ED.view.y) / ED.view.s;
  const nvx = Math.round(fx), nhy = Math.round(fy);
  if (Math.abs(fx - nvx) <= Math.abs(fy - nhy)) {
    const x = nvx - 1, y = Math.floor(fy);
    if (x >= 0 && x <= GW - 2 && y >= 0 && y <= GH - 1) return { type: 'v', x, y };
  } else {
    const x = Math.floor(fx), y = nhy - 1;
    if (x >= 0 && x <= GW - 1 && y >= 0 && y <= GH - 2) return { type: 'h', x, y };
  }
  return null;
}
function setWall(type, x, y, val){
  const arr = type === 'v' ? ED.vWall : ED.hWall;
  const idx = type === 'v' ? y * (GW - 1) + x : y * GW + x;
  if (idx < 0 || idx >= arr.length || arr[idx] === val) return;
  if (ED.curStroke) ED.curStroke.push({ type, idx, old: arr[idx] });
  arr[idx] = val;
}
// a unit step between adjacent lattice vertices = one wall segment
function stepH(x, y, val){ if (y > 0 && y < GH && x >= 0 && x < GW) setWall('h', x, y - 1, val); } // vertex (x,y)->(x+1,y)
function stepV(x, y, val){ if (x > 0 && x < GW && y >= 0 && y < GH) setWall('v', x - 1, y, val); } // vertex (x,y)->(x,y+1)
function connectVerts(v0, v1, val){
  let x = v0[0], y = v0[1]; const tx = v1[0], ty = v1[1];
  while (x !== tx) { const s = tx > x ? 1 : -1; stepH(Math.min(x, x + s), y, val); x += s; }
  while (y !== ty) { const s = ty > y ? 1 : -1; stepV(x, Math.min(y, y + s), val); y += s; }
}

// ---------- mouse ----------
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('mousedown', e => {
  if (!ED.haveImage) return;
  if (e.button === 1 || ED.spaceHeld) { ED.drag = { mode: 'pan', mx: e.clientX, my: e.clientY }; return; }
  const val = (e.button === 2 || ED.tool === 'erase') ? 0 : 1;
  ED.drag = { mode: 'wall', val };
  ED.curStroke = [];
  ED.lastVertex = vertexAt(e.clientX, e.clientY);
});
addEventListener('mousemove', e => {
  if (!ED.haveImage) return;
  const r = cv.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  if (!ED.drag) { const ne = nearestEdge(mx, my); if (JSON.stringify(ne) !== JSON.stringify(ED.hoverEdge)) { ED.hoverEdge = ne; render(); } return; }
  if (ED.drag.mode === 'pan') {
    ED.view.x += e.clientX - ED.drag.mx; ED.view.y += e.clientY - ED.drag.my;
    ED.drag.mx = e.clientX; ED.drag.my = e.clientY; render(); return;
  }
  const v = vertexAt(mx, my);
  if (v[0] !== ED.lastVertex[0] || v[1] !== ED.lastVertex[1]) { connectVerts(ED.lastVertex, v, ED.drag.val); ED.lastVertex = v; render(); }
});
addEventListener('mouseup', () => {
  if (!ED.drag) return;
  const wasWall = ED.drag.mode === 'wall';
  ED.drag = null;
  if (wasWall && ED.curStroke && ED.curStroke.length) {
    if ($('cbAutoClose').checked) autoClose();
    ED.undo.push(ED.curStroke);
    ED.curStroke = null;
    detect(); render();
  } else { ED.curStroke = null; }
});
cv.addEventListener('wheel', e => {
  if (!ED.haveImage) return;
  e.preventDefault();
  const r = cv.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const k = e.deltaY < 0 ? 1.13 : 1 / 1.13;
  const ns = Math.max(3, Math.min(60, ED.view.s * k));
  ED.view.x = mx - (mx - ED.view.x) * ns / ED.view.s;
  ED.view.y = my - (my - ED.view.y) * ns / ED.view.s;
  ED.view.s = ns; render();
}, { passive: false });
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'Space') { ED.spaceHeld = true; e.preventDefault(); }
  else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); }
  else if (e.key === 'e' || e.key === 'E') setTool('erase');
  else if (e.key === 'd' || e.key === 'D') setTool('draw');
  else if (e.key === 'f' || e.key === 'F') { fitView(); render(); }
});
addEventListener('keyup', e => { if (e.code === 'Space') ED.spaceHeld = false; });

// if a stroke's endpoints land near each other, close the loop along the lattice
function autoClose(){
  const st = ED.curStroke; if (st.length < 4) return;
  // recover the stroke's start and end vertices from its first/last segment
  const seg2v = s => { const arr = s.type === 'v' ? GW - 1 : GW; const x = s.idx % arr, y = (s.idx / arr) | 0; return s.type === 'v' ? [[x + 1, y], [x + 1, y + 1]] : [[x, y + 1], [x + 1, y + 1]]; };
  const a = seg2v(st[0]), b = seg2v(st[st.length - 1]);
  // choose the closest pair of endpoints between the two ends
  let best = null, bd = 1e9;
  for (const p of a) for (const q of b) { const d = Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]); if (d > 0 && d < bd) { bd = d; best = [p, q]; } }
  if (best && bd <= 4) connectVerts(best[0], best[1], 1);
}

function undo(){
  if (!ED.undo.length) { setStatus('Nothing to undo.'); return; }
  const st = ED.undo.pop();
  for (let i = st.length - 1; i >= 0; i--) { const c = st[i]; const arr = c.type === 'v' ? ED.vWall : ED.hWall; arr[c.idx] = c.old; }
  detect(); render();
}

// ---------- helpers: walls from image edges, solvability check ----------
function rgbOf(i){ const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(cellCol[i] || ''); return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0]; }
function grad(i, j){ const a = rgbOf(i), b = rgbOf(j); return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]); }
function wallsFromEdges(){
  const t = parseInt($('magThresh').value, 10) || 220;
  ED.curStroke = [];
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW - 1; x++) if (grad(y * GW + x, y * GW + x + 1) >= t) setWall('v', x, y, 1);
  for (let y = 0; y < GH - 1; y++) for (let x = 0; x < GW; x++) if (grad(y * GW + x, (y + 1) * GW + x) >= t) setWall('h', x, y, 1);
  if (ED.curStroke.length) { ED.undo.push(ED.curStroke); }
  ED.curStroke = null;
  detect(); render();
  setStatus(`Added walls where image gradient ≥ ${t}. Prune with the eraser, then redraw cleanly.`);
}
function buildNbhd(){
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const i = y * GW + x; const list = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && nx < GW && ny >= 0 && ny < GH && regionOf[ny * GW + nx] === regionOf[i]) list.push(ny * GW + nx); }
    nbhd[i] = list;
  }
}
// run the game's own clue generator per region and report ambiguous tiles —
// spots the raw scan can't solve by pure logic. The shipped game repairs
// these away with texture flips (repairTexture), so each costs a flipped
// stitch pixel in-game, never a pre-filled square.
function checkSolvable(){
  if (!ED.haveImage) return;
  buildNbhd();
  clue.fill(-1); locked.fill(0);
  let total = 0, worst = [];
  for (let r = 0; r < REG_PIX; r++) {
    try { genRegionClues(r); } catch (err) { setStatus('Clue gen error on R' + r + ': ' + err.message); return; }
    let g = 0; for (const c of regionCells[r]) if (locked[c]) g++;
    total += g; worst.push({ r, g, sz: regionCells[r].length });
  }
  worst.sort((a, b) => b.g - a.g);
  const tiny = worst.filter(w => w.sz < 70).length;
  const top = worst.slice(0, 3).map(w => `R${w.r}:${w.g}`).join('  ');
  setStatus(`Solvable ✓ (difficulty: ${difficulty}). ${total} ambiguous tile(s) across ${REG_PIX} regions (repaired in-game, never pre-filled)${tiny ? `, ${tiny} tiny region(s) <70 cells` : ''}. Heaviest: ${top}.`);
  rebuildPanel();
}

// ---------- region/quote panel ----------
function rebuildPanel(){
  const panel = $('panel'); panel.innerHTML = '';
  const att = Array.from({ length: REG_PIX }, () => []);
  ZONES.forEach(z => { if (att[z.attached]) att[z.attached].push('S' + z.idx); });
  PICROSS.forEach(p => { if (att[p.attached]) att[p.attached].push('P' + p.idx); });
  for (let r = 0; r < REG_PIX; r++) {
    const sz = regionCells[r] ? regionCells[r].length : 0;
    const row = document.createElement('div'); row.className = 'rrow' + (ED.newRegions.indexOf(r) >= 0 ? ' fresh' : '');
    const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = regColor(r);
    const lab = document.createElement('span'); lab.className = 'rlab'; lab.textContent = 'R' + r;
    const meta = document.createElement('span'); meta.className = 'rmeta';
    meta.textContent = sz + ' cells' + (att[r].length ? ' · +' + att[r].join(',') : '') + (sz < 70 ? ' · ⚠small' : '');
    const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'quote shown on completion (optional)'; inp.value = ED.quotes[r] || '';
    inp.oninput = () => { ED.quotes[r] = inp.value; };
    row.appendChild(sw); row.appendChild(lab); row.appendChild(meta); row.appendChild(inp);
    panel.appendChild(row);
  }
  $('regCount').textContent = REG_PIX + ' regions';
  // focus the newest region's quote field
  if (ED.newRegions.length && ED.prevLabel) {
    const idx = ED.newRegions[0];
    const rows = panel.querySelectorAll('.rrow input');
    if (rows[idx]) { rows[idx].focus(); rows[idx].scrollIntoView({ block: 'nearest' }); }
  }
}

// ---------- export ----------
function exportMapDef(){
  if (!ED.haveImage) { setStatus('Load an image first.'); return; }
  const rle = []; let i = 0;
  while (i < N) { const v = ED.label[i]; let j = i + 1; while (j < N && ED.label[j] === v) j++; rle.push(v, j - i); i = j; }
  const name = ($('mapName').value || '').trim() || 'New Map';
  const id = (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')) || 'map';
  const quotes = {};
  for (const k in ED.quotes) if (ED.quotes[k] && ED.quotes[k].trim()) quotes[k] = ED.quotes[k].trim();
  // bake a board-resolution PNG so index.html stays lean. The game re-samples
  // any src down to GW×GH (smoothing off) anyway, so at 1:1 this reproduces the
  // exact same colours/edges/solution the editor showed — just ~kilobytes.
  const off = document.createElement('canvas'); off.width = GW; off.height = GH;
  const octx = off.getContext('2d'); octx.imageSmoothingEnabled = false;
  octx.drawImage(ED.img, 0, 0, GW, GH);
  const bakedURI = off.toDataURL('image/png');
  const def = {
    name, id, seed: SEED, gw: GW, gh: GH,
    imageDataURI: bakedURI,
    regPix: ED.edRegPix,
    regionRLE: rle,
    zones: ZONES.map(z => ({ x: z.x, y: z.y, n: z.n, boxW: z.boxW, boxH: z.boxH, jigsaw: z.jigsaw, givens: z.givens })),
    picross: PICROSS.map(p => ({ x: p.x, y: p.y, n: p.n })),
    attach: { zones: ZONES.map(z => z.attached), picross: PICROSS.map(p => p.attached) },
    quotes,
  };
  const json = JSON.stringify(def);
  $('exportArea').value = json;
  $('exportWrap').style.display = 'block';
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = $('dl'); a.href = url; a.download = id + '.npxsmap.json';
  setStatus(`Exported "${name}" — ${ED.edRegPix} regions, ${Object.keys(quotes).length} quotes. Download or copy, then hand it to Claude to bake in.`);
}

// ---------- toolbar wiring ----------
function setTool(t){ ED.tool = t; $('btnDraw').classList.toggle('on', t === 'draw'); $('btnErase').classList.toggle('on', t === 'erase'); }
$('btnDraw').onclick = () => setTool('draw');
$('btnErase').onclick = () => setTool('erase');
$('btnClear').onclick = () => { if (!ED.haveImage) return; ED.undo.push(captureAll()); ED.vWall.fill(0); ED.hWall.fill(0); detect(); render(); };
$('btnUndo').onclick = undo;
$('btnFit').onclick = () => { fitView(); render(); };
$('btnZoomIn').onclick = () => { ED.view.s = Math.min(60, ED.view.s * 1.25); render(); };
$('btnZoomOut').onclick = () => { ED.view.s = Math.max(3, ED.view.s / 1.25); render(); };
$('cbShowRegions').onchange = e => { ED.showRegions = e.target.checked; render(); };
$('btnMagnet').onclick = wallsFromEdges;
$('btnCheck').onclick = checkSolvable;
$('btnExport').onclick = exportMapDef;
$('btnReroll').onclick = () => { if (!ED.haveImage) return; $('seed').value = ((Math.random() * 1e6) | 0) + 1; placePlotsNow(); detect(); render(); };
$('btnRescan').onclick = () => { if (!ED.img) return; const fw = parseInt($('dimW').value, 10), fh = parseInt($('dimH').value, 10); rescan((fw >= 20 && fh >= 20) ? { gw: fw, gh: fh } : {}); setStatus(`Rescanned ${GW}×${GH} (${(GW * GH).toLocaleString()} cells).`); };
// resolution slider (aspect-locked): live readout while dragging; apply (resets walls) on release
$('res').addEventListener('input', () => { if (ED.haveImage) resReadout(); });
$('res').addEventListener('change', () => { if (!ED.haveImage) return; const { gw, gh } = resReadout(); rescan({ gw, gh }); setStatus(`Resolution: ${GW}×${GH} · ${(GW * GH).toLocaleString()} cells. Borders reset — draw away.`); });
$('btnCopy').onclick = () => { $('exportArea').select(); try { document.execCommand('copy'); setStatus('Copied JSON to clipboard.'); } catch (e) { setStatus('Select the text and copy manually.'); } };
function captureAll(){ const st = []; for (let k = 0; k < ED.vWall.length; k++) if (ED.vWall[k]) st.push({ type: 'v', idx: k, old: 1 }); for (let k = 0; k < ED.hWall.length; k++) if (ED.hWall[k]) st.push({ type: 'h', idx: k, old: 1 }); return st; }

addEventListener('resize', () => { if (ED.haveImage) { resizeCanvas(); render(); } });
setTool('draw');
setStatus('Load a pixel-art image to begin.');
