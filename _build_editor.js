// Build region-editor.html: an interactive region-authoring tool that reuses
// index.html's EXACT generation code (so the board + region ids match the game),
// then lets you draw region borders by hand and export a map-def to bake in.
// Dev tool — run: node _build_editor.js
'use strict';
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const editorJs = fs.readFileSync('_editor.src.js', 'utf8');

function between(startMarker, endMarker, inclusiveStart) {
  const a = html.indexOf(startMarker);
  if (a < 0) throw new Error('marker not found: ' + startMarker);
  const from = inclusiveStart ? a : a + startMarker.length;
  const b = html.indexOf(endMarker, from);
  if (b < 0) throw new Error('end marker not found: ' + endMarker);
  return html.slice(from, b);
}

// Block A: dims, MAPS, mulberry32, plots, growRegions/applyHandPartition,
//   buildLayout, the puzzle-data arrays — everything before the DOM section.
const blockA = between("'use strict';", '// ---------- canvas / view ----------', false);
// Block B: sampleImage() (art colours + edge map + sol)
const blockB = between('function sampleImage(image){', 'function weaveTexture(){', true);
// Block C: genRegionClues() alone (DOM-free) — for the live solvability check
const blockC = between('function genRegionClues(r){', 'function applyGivens(){', true);

const out = `<!doctype html><html><head><meta charset="utf-8"><title>Region editor</title>
<style>
 :root{--bg:#1b1330;--panel:#241a3f;--ink:#ece4f7;--muted:#b7a9d6;--line:#4a3a72;--accent:#8a5cf5}
 *{box-sizing:border-box}
 body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,Segoe UI,sans-serif;height:100vh;display:flex;flex-direction:column;overflow:hidden}
 #bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 12px;background:var(--panel);border-bottom:1px solid var(--line)}
 #bar .grp{display:flex;align-items:center;gap:6px;padding-right:10px;margin-right:4px;border-right:1px solid var(--line)}
 #bar .grp:last-child{border-right:none}
 button,select,input[type=number],input[type=text]{background:#2f2452;color:var(--ink);border:1px solid var(--line);border-radius:7px;padding:6px 10px;font-size:13px;font-family:inherit;cursor:pointer}
 button.on{background:linear-gradient(135deg,#c75fb0,#8a5cf5);border-color:transparent;color:#fff;font-weight:600}
 button.go{background:linear-gradient(135deg,#c75fb0,#8a5cf5);border-color:transparent;color:#fff;font-weight:600}
 button:hover{filter:brightness(1.12)}
 input[type=number]{width:58px}
 label.cb{display:flex;align-items:center;gap:5px;font-size:13px;color:var(--muted);cursor:pointer}
 #main{flex:1;display:flex;min-height:0}
 #stage{flex:1;min-width:0;position:relative;background:#0d0a18}
 #cv{width:100%;height:100%;display:block;cursor:crosshair}
 #side{width:340px;flex:none;border-left:1px solid var(--line);background:var(--panel);display:flex;flex-direction:column;min-height:0}
 #side h3{margin:0;padding:10px 12px;font-size:13px;color:var(--muted);border-bottom:1px solid var(--line);display:flex;justify-content:space-between}
 #panel{flex:1;overflow:auto;padding:6px}
 .rrow{display:flex;align-items:center;gap:6px;padding:5px 6px;border-radius:7px}
 .rrow.fresh{background:rgba(138,92,245,.18);box-shadow:inset 0 0 0 1px var(--accent)}
 .rrow .sw{width:14px;height:14px;border-radius:3px;flex:none;border:1px solid rgba(0,0,0,.3)}
 .rrow .rlab{font-weight:700;color:#ffe27a;min-width:30px;font-size:13px}
 .rrow .rmeta{font-size:11px;color:var(--muted);min-width:96px}
 .rrow input{flex:1;min-width:0;padding:4px 7px;font-size:12px}
 #exportWrap{display:none;border-top:1px solid var(--line);padding:8px}
 #exportArea{width:100%;height:80px;resize:none;font-family:ui-monospace,Consolas,monospace;font-size:10px;word-break:break-all}
 #status{padding:6px 12px;background:#15102b;border-top:1px solid var(--line);font-size:12px;color:var(--muted);min-height:28px}
 .hint{font-size:11px;color:var(--muted);max-width:560px}
 a.dl{display:inline-block;text-decoration:none}
</style></head><body>
<div id="bar">
  <div class="grp">
    <label class="cb" style="font-weight:600;color:var(--ink)">🖼 Image <input type="file" id="file" accept="image/*" style="display:none"></label>
    <button onclick="document.getElementById('file').click()">Choose…</button>
  </div>
  <div class="grp">
    <input type="text" id="mapName" placeholder="Map name" value="New Map" style="width:120px">
    seed <input type="number" id="seed" value="424242">
    <button id="btnReroll" title="New random plot placement">⟳ plots</button>
  </div>
  <div class="grp">
    <span style="font-size:12px;color:var(--muted)">Resolution</span>
    <input type="range" id="res" min="2500" max="57600" value="7680" step="250" style="width:140px;vertical-align:middle" title="Pixel-art resolution (aspect locked). Higher = longer game + more detail.">
    <span id="resLabel" style="font-size:12px;color:var(--ink);min-width:118px;display:inline-block">— × — · —</span>
  </div>
  <div class="grp">
    <span style="font-size:11px;color:var(--muted)" title="Manual override (can break aspect)">exact</span>
    <input type="number" id="dimW" placeholder="auto"> × <input type="number" id="dimH" placeholder="auto">
    <button id="btnRescan" title="Re-scan with these exact dimensions">rescan</button>
  </div>
  <div class="grp">
    <button id="btnDraw" class="on">✎ Draw</button>
    <button id="btnErase">⌫ Erase</button>
    <button id="btnClear">clear</button>
    <button id="btnUndo">↶ undo</button>
  </div>
  <div class="grp">
    <label class="cb"><input type="checkbox" id="cbAutoClose"> auto-close</label>
    <label class="cb"><input type="checkbox" id="cbShowRegions" checked> show regions</label>
    <button id="btnMagnet" title="Add walls along strong image edges">⌁ edges</button>
    <input type="number" id="magThresh" value="220" title="edge gradient threshold">
  </div>
  <div class="grp">
    <button id="btnZoomOut">−</button><button id="btnZoomIn">+</button><button id="btnFit">⛶ fit</button>
  </div>
  <div class="grp">
    <button id="btnCheck">✓ check</button>
    <button id="btnExport" class="go">⇪ Export</button>
  </div>
</div>
<div id="main">
  <div id="stage"><canvas id="cv"></canvas></div>
  <div id="side">
    <h3><span>Regions &amp; quotes</span><span id="regCount">0 regions</span></h3>
    <div id="panel"></div>
    <div id="exportWrap">
      <textarea id="exportArea" readonly></textarea>
      <div style="display:flex;gap:6px;margin-top:6px">
        <a class="dl" id="dl"><button>💾 Download</button></a>
        <button id="btnCopy">📋 Copy</button>
      </div>
    </div>
  </div>
</div>
<div id="status"></div>
<script>
'use strict';
${blockA}
${blockB}
${blockC}
${editorJs}
</script></body></html>`;

fs.writeFileSync('region-editor.html', out);
console.log('wrote region-editor.html  (' + out.length + ' bytes; A ' + blockA.length + ', B ' + blockB.length + ', C ' + blockC.length + ', editor ' + editorJs.length + ')');
