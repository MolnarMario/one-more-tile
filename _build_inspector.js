// Build region-map.html: a standalone inspector that reuses index.html's EXACT
// generation code (so region ids match the game), then draws each map's art
// with region borders + id labels. Dev tool — run: node _build_inspector.js
'use strict';
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

function between(startMarker, endMarker, inclusiveStart) {
  const a = html.indexOf(startMarker);
  if (a < 0) throw new Error('marker not found: ' + startMarker);
  const from = inclusiveStart ? a : a + startMarker.length;
  const b = html.indexOf(endMarker, from);
  if (b < 0) throw new Error('end marker not found: ' + endMarker);
  return html.slice(from, b);
}

// Block A: everything from after 'use strict' up to the canvas/DOM section —
// images, dims, MAPS, mulberry32, plots, growRegions, buildLayout, data arrays.
// (No DOM refs and no side effects before this point.)
const blockA = between("'use strict';", '// ---------- canvas / view ----------', false);
// Block B: the self-contained sampleImage() (art colours + edge map + sol)
const blockB = between('function sampleImage(image){', 'function weaveTexture(){', true);

const render = `
// ---- inspector ----
const CELL = 12;
function lbl(cx, t, x, y, size, fill){ cx.font='bold '+size+'px system-ui,sans-serif'; cx.textAlign='center'; cx.textBaseline='middle'; cx.lineWidth=4; cx.strokeStyle='rgba(0,0,0,.95)'; cx.strokeText(t,x,y); cx.fillStyle=fill; cx.fillText(t,x,y); }
function renderMap(map){
  return new Promise(res => {
    const im = new Image();
    im.onload = () => {
      currentMap = map.id; SEED = map.seed;
      dimsForImage(im, map); sampleImage(im); buildLayout();
      const cv = document.createElement('canvas'); cv.width = GW*CELL; cv.height = GH*CELL;
      const cx = cv.getContext('2d');
      for (let i=0;i<N;i++){ const x=i%GW, y=(i/GW)|0; cx.fillStyle = cellCol[i] || '#000'; cx.fillRect(x*CELL, y*CELL, CELL+0.6, CELL+0.6); }
      cx.strokeStyle = 'rgba(255,255,255,.92)'; cx.lineWidth = 2; cx.beginPath();
      for (let y=0;y<GH;y++) for (let x=0;x<GW;x++){ const i=y*GW+x;
        if (x<GW-1 && regionOf[i]!==regionOf[i+1]) { cx.moveTo((x+1)*CELL, y*CELL); cx.lineTo((x+1)*CELL, (y+1)*CELL); }
        if (y<GH-1 && regionOf[i]!==regionOf[i+GW]) { cx.moveTo(x*CELL, (y+1)*CELL); cx.lineTo((x+1)*CELL, (y+1)*CELL); }
      }
      cx.stroke();
      // region label position = cell nearest each region's centroid
      const pos = [];
      for (let r=0;r<REG_PIX;r++){ const cells=regionCells[r]; if(!cells||!cells.length){ pos[r]=null; continue; }
        let sx=0, sy=0; for (const i of cells){ sx+=i%GW; sy+=(i/GW)|0; } sx/=cells.length; sy/=cells.length;
        let bi=cells[0], bd=1e9; for (const i of cells){ const dx=i%GW-sx, dy=(i/GW|0)-sy, d=dx*dx+dy*dy; if(d<bd){bd=d;bi=i;} }
        pos[r]={ x:(bi%GW+0.5)*CELL, y:((bi/GW|0)+0.5)*CELL };
      }
      const plots = [];
      ZONES.forEach(z => plots.push({ z, tag:'S'+z.idx })); PICROSS.forEach(p => plots.push({ z:p, tag:'P'+p.idx }));
      // connectors: each plot → its home region
      cx.strokeStyle='rgba(255,226,122,.9)'; cx.lineWidth=2;
      for (const {z} of plots){ const home=pos[z.attached]; if(!home) continue;
        cx.beginPath(); cx.moveTo((z.x+z.n/2)*CELL, (z.y+z.n/2)*CELL); cx.lineTo(home.x, home.y); cx.stroke(); }
      // labels: regions big (gold), plots small (blue) tagged with their home
      for (let r=0;r<REG_PIX;r++){ if(pos[r]) lbl(cx, 'R'+r, pos[r].x, pos[r].y, CELL*1.35|0, '#ffe27a'); }
      for (const {z,tag} of plots){ lbl(cx, tag+'\\u2192R'+z.attached, (z.x+z.n/2)*CELL, (z.y+z.n/2)*CELL, CELL*0.9|0, '#bfe9ff'); }
      // per-region attachment summary
      const att = Array.from({length:REG_PIX}, () => []);
      ZONES.forEach(z => att[z.attached].push('S'+z.idx)); PICROSS.forEach(p => att[p.attached].push('P'+p.idx));
      let summ='';
      for (let r=0;r<REG_PIX;r++){ summ += '<span class="rg">R'+r+'</span>' + (att[r].length ? ' +'+att[r].join(',') : '') + '   '; }
      const sec=document.createElement('div');
      const h=document.createElement('h2'); h.textContent = map.name + '  —  ' + GW + '×' + GH + ', ' + REG_PIX + ' regions (' + ZONES.length + ' sudoku + ' + PICROSS.length + ' picross attached)';
      const wrap=document.createElement('div'); wrap.className='wrap'; wrap.appendChild(cv);
      const s=document.createElement('div'); s.className='summary'; s.innerHTML = summ;
      sec.appendChild(h); sec.appendChild(wrap); sec.appendChild(s); document.getElementById('out').appendChild(sec);
      res();
    };
    im.src = map.src;
  });
}
(async () => { for (const m of MAPS) await renderMap(m); })();
`;

const out = `<!doctype html><html><head><meta charset="utf-8"><title>Region inspector</title>
<style>
 body{background:#1b1330;color:#ece4f7;font-family:system-ui,Segoe UI,sans-serif;margin:18px}
 h1{font-size:20px;margin:0 0 4px} h2{font-size:15px;margin:22px 0 6px;color:#cdbff0}
 .note{font-size:13px;color:#b7a9d6;max-width:900px;line-height:1.5}
 .wrap{overflow:auto;border:1px solid #4a3a72;border-radius:6px;display:inline-block;max-width:100%}
 canvas{display:block}
 .summary{font-size:13px;color:#cdbff0;margin:8px 0 4px;line-height:1.9}
 .summary .rg{color:#ffe27a;font-weight:700}
</style></head><body>
<h1>Region inspector — which region reveals which part of each map</h1>
<p class="note"><b>R</b>n = organic region (gold). Each sudoku <b>S</b>n / picross <b>P</b>n is now <b>attached</b> to a home region (blue label "→Rn", with a gold connector line). A region completes — and fires its quote — once its own tiles <b>and</b> its attached plots are all solved. Tell me, per map, which <b>R</b>n should pop which quote.</p>
<div id="out"></div>
<script>
'use strict';
${blockA}
${blockB}
${render}
</script></body></html>`;

fs.writeFileSync('region-map.html', out);
console.log('wrote region-map.html  (' + out.length + ' bytes; blockA ' + blockA.length + ', blockB ' + blockB.length + ')');
