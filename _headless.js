#!/usr/bin/env node
/* ============================================================================
 * _headless.js — run the in-browser dev hooks unattended, in headless Chrome.
 *
 *   node _headless.js bake       <maps|all> [--jobs N] [--sink dir]
 *   node _headless.js audit      <maps|all> [--jobs N]
 *   node _headless.js verifybake <maps|all> [--jobs N]
 *   node _headless.js smoke      [maps|all]
 *       options: --chrome <exe> (or CHROME_PATH)  --timeout <minutes, default 90>
 *
 * Replaces "open one tab per map and keep reading its title": each map runs in
 * its OWN headless Chrome (separate process, so they really run in parallel —
 * same-site tabs in one browser can share a renderer main thread), and the
 * page's verdict and progress are read over the DevTools protocol. No npm
 * dependencies: Node's own fetch + WebSocket talk to Chrome directly.
 *
 * The pages are served by _dev_server.js (started in-process on a free
 * loopback port), so ?bake= payloads land in --sink (default .scratch/bake/,
 * which is gitignored). A bake only counts as done when the title is exactly
 * "BAKE DONE" — the page answers that only after every POST was written — AND
 * the payload on disk parses and carries a passing bake-time audit.
 *
 * smoke = the cheap runtime check for "did this change break anything else",
 * in ONE Chrome, sequentially (~5s a map): a normal boot (bake ON, like a
 * player), the Single Player grid must build exactly one card per map with no
 * exception, then each listed map is launched from
 * the menu and must come up from the shipped payload (baked clues in use, clue
 * count == the payload's `n`, zero locked cells).
 *
 * Exit code 0 only if every map passed.
 * ==========================================================================*/
'use strict';
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const lib = require('./_map_lib.js');
const devServer = require('./_dev_server.js');

const ROOT = __dirname;
const wait = ms => new Promise(r => setTimeout(r, ms));

function findChrome(explicit){
  const c = [explicit, process.env.CHROME_PATH].filter(Boolean);
  const pf = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  for (const base of pf) c.push(path.join(base, 'Google/Chrome/Application/chrome.exe'), path.join(base, 'Microsoft/Edge/Application/msedge.exe'));
  c.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
  for (const p of c) if (p && fs.existsSync(p)) return p;
  throw new Error('no Chrome/Edge found — pass --chrome <path/to/chrome.exe> or set CHROME_PATH');
}

// Launch one headless browser with a throwaway profile, open `url`, and poll
// `check(evaluate)` every second until it returns a non-null result.
// Resolves { result, exceptions, consoleErrors, ms }. Always kills ONLY the
// process tree it launched and removes its profile.
async function runPage(o){
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'omt-headless-'));
  const win = process.platform === 'win32';
  const ch = spawn(o.chrome, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + prof,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--mute-audio', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true, detached: !win });   // own process group off Windows
  ch.stderr.on('data', () => {});          // drain, or a chatty Chrome can block on a full pipe
  const exited = new Promise(r => ch.once('exit', r));
  const t0 = Date.now(), deadline = t0 + o.timeoutMs;
  const left = () => Math.max(0, deadline - Date.now());
  const exceptions = [], consoleErrors = [];
  let ws, pend = new Map();
  // Kill exactly the tree we launched (taskkill /T on Windows, the process
  // group elsewhere), wait for it to go, then remove the throwaway profile.
  const kill = async () => {
    try { if (ws) ws.close(); } catch (e) {}
    for (const p of pend.values()) p.rej(new Error('browser closed'));
    if (ch.exitCode === null && ch.signalCode === null){
      if (win){ try { execFileSync('taskkill', ['/pid', String(ch.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {} }
      else { try { process.kill(-ch.pid, 'SIGKILL'); } catch (e) { try { ch.kill('SIGKILL'); } catch (e2) {} } }
      await Promise.race([exited, wait(10000)]);
    }
    for (let k = 0; ; k++){
      try { fs.rmSync(prof, { recursive: true, force: true }); return; }
      catch (e) { if (k >= 20){ (o.log || console.warn)('warning: could not remove the temp Chrome profile ' + prof + ' (' + e.code + ')'); return; } await wait(250); }
    }
  };
  try {
    let port;
    while (!port){
      if (ch.exitCode !== null) throw new Error('Chrome exited early (code ' + ch.exitCode + ')');
      if (Date.now() - t0 > 30000) throw new Error('Chrome never opened its DevTools port (30s)');
      try { port = fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); } catch (e) { await wait(100); }
    }
    const list = await (await fetch('http://127.0.0.1:' + port + '/json/list', { signal: AbortSignal.timeout(10000) })).json();
    const page = list.find(t => t.type === 'page');
    if (!page) throw new Error('Chrome has no page target');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 0;
    // Every DevTools call is bounded by the run's overall deadline. Not by a
    // short per-call one: a bake runs a map's tiers synchronously, so an
    // evaluate can legitimately wait many minutes for the page to yield.
    const send = (method, params) => new Promise((res, rej) => {
      const i = ++id;
      const timer = setTimeout(() => { pend.delete(i); rej(new Error('timed out after ' + Math.round(o.timeoutMs / 60000) + ' min (' + method + ')')); }, left());
      pend.set(i, { res: v => { clearTimeout(timer); res(v); }, rej: e => { clearTimeout(timer); rej(e); } });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pend.has(m.id)){ const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
      if (m.method === 'Runtime.consoleAPICalled'){
        const text = m.params.args.map(a => a.value !== undefined ? String(a.value) : (a.description || '')).join(' ');
        if (m.params.type === 'error') consoleErrors.push(text.slice(0, 300));
        if (o.onConsole) o.onConsole(m.params.type, text);
      }
      if (m.method === 'Runtime.exceptionThrown'){
        const d = m.params.exceptionDetails;
        exceptions.push(((d.exception && d.exception.description) || d.text || 'exception').split('\n')[0].slice(0, 300));
      }
    };
    await new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('DevTools socket did not open (30s)')), 30000);
      ws.onopen = () => { clearTimeout(timer); res(); };
      ws.onerror = () => { clearTimeout(timer); rej(new Error('DevTools socket failed')); };
    });
    ws.onclose = () => { for (const p of pend.values()) p.rej(new Error('DevTools socket closed')); };
    await send('Runtime.enable');
    await send('Page.navigate', { url: o.url });
    const evaluate = async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('evaluate failed: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
      return r.result.value;
    };
    for (;;){
      await wait(1000);
      if (ch.exitCode !== null) throw new Error('Chrome exited mid-run (code ' + ch.exitCode + ')');
      let result = null;
      try { result = await o.check(evaluate); } catch (e) { if (!/Execution context|Cannot find context|navigat/i.test(e.message)) throw e; }
      if (result !== null && result !== undefined) return { result, exceptions, consoleErrors, ms: Date.now() - t0 };
      if (!left()) throw new Error('timed out after ' + Math.round(o.timeoutMs / 60000) + ' min');
    }
  } finally {
    await kill();
  }
}

// ---- the dev-hook modes -------------------------------------------------------
const VERDICT = {   // title prefix → pass?
  audit:      t => /^AUDIT (PASS|FAIL|ERROR)/.test(t) ? t === 'AUDIT PASS' : null,
  bake:       t => /^BAKE (DONE|ERROR)/.test(t) ? t === 'BAKE DONE' : null,
  verifybake: t => /^BAKE VERIFY (PASS|FAIL|ERROR)/.test(t) ? t === 'BAKE VERIFY PASS' : null,
};

async function runHook(mode, id, ctx){
  const url = ctx.server.url + '/index.html?' + mode + '=' + encodeURIComponent(id);
  const tag = ('[' + id + ']').padEnd(18);
  const f = path.join(ctx.server.sink, id + '.bake.json');
  if (mode === 'bake') try { fs.unlinkSync(f); } catch (e) {}   // only THIS run's payload may count
  const r = await runPage({ chrome: ctx.chrome, url, timeoutMs: ctx.timeoutMs, log: ctx.log,
    onConsole: (type, text) => { if (/^\[(audit|bake|verifybake)\]/.test(text) && !/verdict/.test(text)) ctx.log(tag + text.replace(/^\[\w+\] /, '')); },
    check: async ev => {
      const t = await ev('document.title');
      const pass = VERDICT[mode](t || '');
      if (pass === null) return null;
      return { title: t, pass, body: await ev("(document.getElementById('auditOut')||{}).textContent||''") };
    } });
  let pass = r.result.pass && !r.exceptions.length;
  const notes = [];
  if (r.exceptions.length) notes.push('exceptions: ' + r.exceptions.join(' | '));
  if (mode === 'bake' && pass){
    // the title promises the POST landed; prove the file is there and sound
    try {
      const rec = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (rec.id !== id || !rec.sol || !rec.clue) throw new Error('payload incomplete');
      const ap = lib.auditProblems(rec.audit, ctx.tiers);
      if (ap.length) throw new Error(ap.join('; '));
      notes.push('payload ' + path.relative(ROOT, f));
    } catch (e) { pass = false; notes.push(e.message); }
  }
  if (!r.result.pass) notes.push(r.result.title + (r.result.body ? '\n' + r.result.body.split('\n').slice(2).join('\n') : ''));
  return { id, pass, ms: r.ms, notes };
}

async function runSmoke(ids, ctx){
  const tag = '[smoke]'.padEnd(18);
  const steps = [];
  const r = await runPage({ chrome: ctx.chrome, url: ctx.server.url + '/index.html', timeoutMs: ctx.timeoutMs, log: ctx.log,
    check: async ev => {
      // a single long-lived check: drive the menu, one map at a time
      const st = ctx._smoke = ctx._smoke || { phase: 'boot', k: 0, t: 0 };
      if (st.phase === 'boot'){
        const ready = await ev("typeof menuOpenGrid === 'function' && !!document.getElementById('menuScreen')");
        if (!ready) return null;
        // exactly one card per map, no more, no fewer (a duplicate must not mask a missing one)
        const g = await ev("(() => { menuOpenGrid('solo'); return { cards: [...document.querySelectorAll('.mapCard')].map(c => c.dataset.id), ids: MAPS.map(m => m.id) }; })()");
        const same = g.cards.length === g.ids.length && g.cards.slice().sort().join() === g.ids.slice().sort().join();
        const note = g.cards.length + ' cards for ' + g.ids.length + ' maps' + (same ? ', one per map' : ' — cards [' + g.cards.slice().sort() + '] vs maps [' + g.ids.slice().sort() + ']');
        steps.push({ id: 'menu grid', pass: same, note });
        ctx.log(tag + 'menu grid: ' + note);
        st.list = ids || g.ids; st.phase = 'launch';
      }
      if (st.phase === 'launch'){
        if (st.k >= st.list.length) return true;
        const id = st.list[st.k];
        // pendingAfterGen is the one-shot every board-completion path drains
        // (finishSetup / loadMap's rebuild / setDifficulty), so it is an exact
        // "this board is ready" signal — no guessing from GEN timing
        await ev('(() => { window.__smokeReady = null; menuPlay(' + JSON.stringify(id) + '); pendingAfterGen = () => { window.__smokeReady = ' + JSON.stringify(id) + '; }; })()');
        st.t = Date.now(); st.phase = 'wait';
        return null;
      }
      if (st.phase === 'wait'){
        const id = st.list[st.k];
        const s = await ev('(() => { if (!(window.__smokeReady === ' + JSON.stringify(id) + ' && !GEN.active && currentMap === ' + JSON.stringify(id) + ')) return null;' +
          ' let lk = 0, nc = 0; for (let i = 0; i < N; i++){ if (locked[i]) lk++; if (regionOf[i] >= 0 && regionOf[i] < REG_PIX && clue[i] >= 0) nc++; }' +
          ' const rec = BAKED.clue[currentMap]; return { baked: !!bakedClueStr(), sol: !!BAKED_SOL[currentMap], want: rec && rec.n ? rec.n[difficulty] : -1, nc, lk, diff: difficulty }; })()');
        if (!s){
          if (Date.now() - st.t > 120000){ steps.push({ id, pass: false, note: 'did not finish loading within 2 min' }); st.k++; st.phase = 'launch'; }
          return null;
        }
        const pass = s.baked && s.sol && s.nc === s.want && s.lk === 0;
        const note = (s.baked ? 'baked clues' : 'NOT from the bake') + ', ' + s.nc + '/' + s.want + ' clues @' + s.diff + ', locked ' + s.lk + ', ' + ((Date.now() - st.t) / 1000).toFixed(1) + 's';
        steps.push({ id, pass, note });
        ctx.log(tag + id + ': ' + (pass ? 'ok' : 'FAIL') + ' — ' + note);
        await ev('showMenu()');
        st.k++; st.phase = 'launch';
        return null;
      }
      return null;
    } });
  const rows = steps.slice();
  if (r.exceptions.length) rows.push({ id: 'exceptions', pass: false, note: r.exceptions.join(' | ') });
  if (r.consoleErrors.length) ctx.log(tag + 'console.error (not fatal): ' + r.consoleErrors.join(' | '));
  return rows.map(x => ({ id: x.id, pass: x.pass, ms: 0, notes: [x.note] }));
}

async function main(mode, ids, opts){
  const o = opts || {};
  const log = o.log || (m => console.log(m));
  // ids become sink file names — validate here, not only in the CLI, so a
  // module caller (_release_map.js) can never steer a path out of the sink
  if (!['bake', 'audit', 'verifybake', 'smoke'].includes(mode)) throw new Error('unknown mode ' + mode);
  if (ids !== null){
    const all = mapIds();
    if (!Array.isArray(ids) || !ids.length) throw new Error('no maps given');
    const bad = ids.filter(id => typeof id !== 'string' || !lib.ID_RE.test(id) || !all.includes(id));
    if (bad.length) throw new Error('not valid MAPS ids: ' + bad.map(x => JSON.stringify(x)).join(', '));
  } else if (mode !== 'smoke') throw new Error(mode + ' needs a map list');
  const chrome = findChrome(o.chrome);
  const server = await devServer.start({ sink: o.sink, log: m => log('[server]'.padEnd(18) + m) });
  const tiers = lib.constStrArray(lib.toLF(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')), 'DIFF_ORDER');
  const ctx = { chrome, server, log, tiers, timeoutMs: (o.timeoutMin || 90) * 60000 };
  log('chrome: ' + chrome);
  log('serving: ' + server.url + '   sink: ' + path.relative(ROOT, server.sink));
  const t0 = Date.now();
  let results;
  try {
    if (mode === 'smoke') results = await runSmoke(ids, ctx);
    else {
      const jobs = Math.max(1, Math.min(ids.length, o.jobs || Math.max(1, Math.floor(os.cpus().length / 2))));
      log(mode + ' ' + ids.join(', ') + '  (' + jobs + ' at a time, one Chrome each)');
      results = [];
      let next = 0;
      await Promise.all(Array.from({ length: jobs }, async () => {
        while (next < ids.length){
          const id = ids[next++];
          try { results.push(await runHook(mode, id, ctx)); }
          catch (e) { results.push({ id, pass: false, ms: 0, notes: [e.message] }); }
          const r = results[results.length - 1];
          log(('[' + id + ']').padEnd(18) + (r.pass ? 'PASS' : 'FAIL') + (r.ms ? ' in ' + (r.ms / 60000).toFixed(1) + ' min' : '') + (r.pass ? '' : '  ' + r.notes.join(' · ')));
        }
      }));
    }
  } finally { await server.close(); }
  const ok = results.length > 0 && results.every(r => r.pass);
  log('');
  log(mode.toUpperCase() + ' ' + (ok ? 'PASS' : 'FAIL') + ' — ' + results.filter(r => r.pass).length + '/' + results.length + ' in ' + ((Date.now() - t0) / 60000).toFixed(1) + ' min');
  return { ok, results };
}

function mapIds(){
  const html = lib.toLF(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  const ids = lib.mapsRows(html.split('\n')).rows.map(r => r.id);
  for (const id of ids) if (!lib.ID_RE.test(id)) throw new Error('MAPS id ' + JSON.stringify(id) + ' is not a valid map id');
  return ids;
}

module.exports = { main, findChrome, runPage, mapIds };

if (require.main === module){
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
  const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && ['jobs', 'sink', 'chrome', 'timeout'].includes(args[i - 1].slice(2))));
  const mode = pos[0];
  if (!['bake', 'audit', 'verifybake', 'smoke'].includes(mode)){
    console.error('usage: node _headless.js <bake|audit|verifybake|smoke> <maps|all> [--jobs N] [--sink dir] [--chrome exe] [--timeout min]');
    process.exit(2);
  }
  const all = mapIds();
  let ids = !pos[1] || pos[1] === 'all' || pos[1] === '1' ? (mode === 'smoke' ? null : all) : pos[1].split(',').map(s => s.trim()).filter(Boolean);
  const unknown = (ids || []).filter(id => !all.includes(id));
  if (unknown.length){ console.error('! not in MAPS: ' + unknown.join(', ')); process.exit(2); }
  main(mode, ids, { jobs: +opt('jobs') || 0, sink: opt('sink'), chrome: opt('chrome'), timeoutMin: +opt('timeout') || 0 })
    .then(r => process.exit(r.ok ? 0 : 1), e => { console.error('! ' + (e && e.stack || e)); process.exit(1); });
}
