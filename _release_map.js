#!/usr/bin/env node
/* ============================================================================
 * _release_map.js — add a map, end to end, touching nothing else.
 *
 *   node _release_map.js <map.npxsmap.json> [--name "Name 🎨"] [--id slug]
 *                        [--rebake] [--skip-smoke] [--base origin/master] [--chrome exe]
 *
 *   1. insert  _bake_map.js           — validated, appended; skipped if the map
 *                                        is already in index.html and matches
 *   2. bake    _headless.js bake <id> — ONE generation pass, audited on the
 *                                        bytes it ships (replaces ?audit= +
 *                                        ?bake= + ?verifybake= for a new map)
 *   3. fold    _bake_boards.js        — upserts this map's records only
 *   4. check   _check_map_release.js  — byte-isolation vs the live release +
 *                                        the map's own data + payload match
 *   5. smoke   _headless.js smoke     — real boot: menu grid builds, every map
 *                                        launches from its shipped payload
 *
 * Re-runnable: each step picks up where the last run stopped. The bake is
 * reused only while the map's layout, image and seed are unchanged (a stamp
 * next to the payload); --rebake forces a fresh one.
 *
 * After it says READY: bump APP_VERSION, add the CHANGELOG entry, run
 *   node _check_map_release.js <id> --payload .scratch/bake --ship
 * and open the PR. Only index.html, boards/<id>.js, docs and (optionally) the
 * source .npxsmap.json should be in it — the check enforces exactly that.
 * ==========================================================================*/
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const lib = require('./_map_lib.js');
const headless = require('./_headless.js');

const ROOT = __dirname;
const SINK = path.join(ROOT, '.scratch', 'bake');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
const flag = k => args.includes('--' + k);
const file = args.find((a, i) => !a.startsWith('--') && !(i > 0 && /^--(name|id|base|chrome)$/.test(args[i - 1])));
if (!file){ console.error('usage: node _release_map.js <map.npxsmap.json> [--name "…"] [--id slug] [--rebake] [--skip-smoke] [--base ref]'); process.exit(2); }

const def = JSON.parse(fs.readFileSync(file, 'utf8'));
const id = opt('id') || def.id;
if (typeof id !== 'string' || !lib.ID_RE.test(id)){ console.error('! bad map id ' + JSON.stringify(id) + ' (need ' + lib.ID_RE + '; pass --id)'); process.exit(2); }
const base = opt('base') || 'origin/master';
const node = (script, a) => execFileSync(process.execPath, [path.join(ROOT, script)].concat(a), { cwd: ROOT, stdio: 'inherit' });
const readHtml = () => lib.toLF(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
const t0 = Date.now(), times = [];
const step = (name, t) => { times.push(name + ' ' + ((Date.now() - t) / 1000).toFixed(0) + 's'); };
const banner = s => console.log('\n━━ ' + s + ' ' + '━'.repeat(Math.max(0, 66 - s.length)));
const stop = m => { console.error('\n✗ ' + m); process.exit(1); };

// what the map's puzzle depends on — a payload baked from anything else is stale
function stampOf(html){
  const L = html.split('\n');
  const row = lib.mapsRows(L).rows.find(r => r.id === id);
  const hb = lib.findBlock(L, 'HAND_LAYOUTS');
  const hl = hb && lib.recordLines(L, hb, id)[0];
  const img = row && new RegExp('^const ' + row.src + ' = "([^"]*)";', 'm').exec(html);
  return crypto.createHash('sha256').update(JSON.stringify([lib.constNum(html, 'GEN_COMPAT'), row && row.seed, row && row.gw, row && row.gh,
    hl === undefined ? null : L[hl], img && img[1]])).digest('hex');
}

(async () => {
  // ---- 1. insert ---------------------------------------------------------------
  banner('1/5 insert "' + id + '"');
  let t = Date.now();
  {
    const html = readHtml(), L = html.split('\n');
    const row = lib.mapsRows(L).rows.find(r => r.id === id);
    if (!row) node('_bake_map.js', [file].concat(opt('name') ? ['--name', opt('name')] : [], opt('id') ? ['--id', opt('id')] : []));
    else {
      // resuming: every record must be exactly what _bake_map.js would write
      // from THIS file (and these --name/--id), not an older edit of it
      const name = opt('name') || def.name;
      const line = t => { const b = lib.findBlock(L, t); const i = b ? lib.recordLines(L, b, id)[0] : undefined; return i === undefined ? null : L[i]; };
      const regCount = def.regPix + def.zones.length + def.picross.length;
      const hasQ = def.quotes && Object.keys(def.quotes).length;
      const diffs = [];
      if (L.find(l => l.startsWith('const ' + row.src + ' = ')) !== lib.canon.img(row.src, def.imageDataURI)) diffs.push('image');
      if (L[row.line] !== lib.canon.mapsRow({ id, name, src: row.src, seed: def.seed, gw: def.gw, gh: def.gh })) diffs.push('MAPS row (name / seed / dims)');
      if (line('HAND_LAYOUTS') !== lib.canon.hand(id, def)) diffs.push('layout');
      if (line('MAP_META') !== lib.canon.meta(id, regCount, def.gw, def.gh)) diffs.push('MAP_META');
      if (line('MAP_QUOTES') !== (hasQ ? lib.canon.record(id, def.quotes) : null)) diffs.push('quotes');
      if (diffs.length)
        stop('"' + id + '" is already in index.html but differs from ' + file + ' (' + diffs.join(', ') + ').\n' +
             '  Revert index.html (git checkout -- index.html) and run again, or use another --id.');
      console.log('already in index.html and identical to ' + path.basename(file) + ' — skipping');
    }
  }
  step('insert', t);

  // ---- 2. bake ------------------------------------------------------------------
  banner('2/5 bake + audit (one generation pass, headless)');
  t = Date.now();
  const payload = path.join(SINK, id + '.bake.json'), stampFile = path.join(SINK, id + '.stamp');
  const stamp = stampOf(readHtml());
  let reuse = false;
  if (!flag('rebake') && fs.existsSync(payload)){
    try { reuse = fs.readFileSync(stampFile, 'utf8').trim() === stamp && Array.isArray(JSON.parse(fs.readFileSync(payload, 'utf8')).audit); } catch (e) {}
    console.log(reuse ? 'reusing ' + path.relative(ROOT, payload) + ' (same layout, image, seed and GEN_COMPAT; --rebake to redo)'
                      : 'existing payload is stale or unaudited — re-baking');
  }
  if (!reuse){
    try { fs.unlinkSync(stampFile); } catch (e) {}
    const r = await headless.main('bake', [id], { chrome: opt('chrome') });
    if (!r.ok) stop('bake failed — see above. Nothing was folded; index.html holds only the inserted map records.');
    fs.writeFileSync(stampFile, stamp + '\n');
  }
  step('bake', t);

  // ---- 3. fold --------------------------------------------------------------------
  banner('3/5 fold (upsert "' + id + '" only)');
  t = Date.now();
  try { node('_bake_boards.js', [SINK, '--maps', id]); } catch (e) { stop('fold refused — see above.'); }
  step('fold', t);

  // ---- 4. check ---------------------------------------------------------------------
  banner('4/5 isolation + data check vs ' + base);
  t = Date.now();
  try { node('_check_map_release.js', [id, '--payload', SINK, '--base', base]); } catch (e) { stop('the release check failed — see above.'); }
  step('check', t);

  // ---- 5. smoke ---------------------------------------------------------------------
  if (flag('skip-smoke')) console.log('\n(smoke skipped)');
  else {
    banner('5/5 smoke (normal boot, every map from its payload)');
    t = Date.now();
    const r = await headless.main('smoke', null, { chrome: opt('chrome') });
    if (!r.ok) stop('smoke failed — see above.');
    step('smoke', t);
  }

  console.log('\nREADY in ' + ((Date.now() - t0) / 60000).toFixed(1) + ' min (' + times.join(', ') + ').');
  console.log('Next:');
  console.log('  1. bump APP_VERSION in index.html and add a CHANGELOG.md entry (+ README/RELEASE-NOTES if they list maps)');
  console.log('  2. node _check_map_release.js ' + id + ' --payload .scratch/bake --ship');
  console.log('  3. commit index.html, boards/' + id + '.js and the docs on a branch; PR; merge; one push deploys Pages');
})().catch(e => stop(e && e.stack || String(e)));
