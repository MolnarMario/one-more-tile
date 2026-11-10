#!/usr/bin/env node
/* ============================================================================
 * _dev_server.js — serve the game over http://127.0.0.1 for the dev hooks.
 *
 * Why it exists: ?bake= POSTs each finished <map>.bake.json to /__bake/ on its
 * own origin, and a browser page cannot write files any other way (a background
 * tab's downloads are blocked). Every release used to hand-roll this server.
 *
 *   node _dev_server.js [--port 8923] [--sink .scratch/bake]
 *   then open http://127.0.0.1:8923/index.html?bake=<map>   (or ?audit= …)
 *
 * _headless.js starts the same server in-process on a free port, so you only
 * need this for driving a tab by hand.
 *
 * Deliberately narrow: binds loopback only, serves files under the repo root
 * (no traversal), accepts POSTs only as /__bake/<map-id>.bake.json, caps the
 * body, and sends no-store so a verify run never reads a stale boards/*.js.
 * ==========================================================================*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { ID_RE } = require('./_map_lib.js');

const ROOT = __dirname;
const MAX_BODY = 32 * 1024 * 1024;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.txt': 'text/plain; charset=utf-8',
};

// start({ port, sink, log }) → Promise<{ port, url, close() }>
function start(opts){
  const o = opts || {};
  const sink = path.resolve(ROOT, o.sink || '.scratch/bake');
  const log = o.log || (() => {});
  let port = 0;
  const server = http.createServer((req, res) => {
    const send = (code, body, type) => {
      res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
    };
    let url;
    try { url = decodeURIComponent(req.url.split('?')[0]); } catch (e) { return send(400, 'bad url'); }
    // Only this server's own origin. The Host check stops a DNS-rebinding page
    // from reading the repo through us; the Origin check stops any other site's
    // page from POSTing a payload the release would then fold (browsers always
    // send Origin on a POST). A local process could forge both — but it could
    // equally write the file itself, so that is not a boundary we can hold.
    const own = ['127.0.0.1:' + port, 'localhost:' + port];
    if (!own.includes(req.headers.host)) return send(403, 'wrong host');

    if (req.method === 'POST'){
      if (!own.map(h => 'http://' + h).includes(req.headers.origin)) return send(403, 'cross-origin POST refused');
      const m = /^\/__bake\/([^/\\]+)\.bake\.json$/.exec(url);
      if (!m || !ID_RE.test(m[1])) return send(404, 'POST only to /__bake/<map-id>.bake.json');
      const chunks = []; let size = 0, dead = false;
      req.on('data', c => {
        if (dead) return;
        size += c.length;
        if (size > MAX_BODY){ dead = true; send(413, 'payload too large'); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (dead) return;
        const body = Buffer.concat(chunks);
        try { JSON.parse(body.toString('utf8')); } catch (e) { return send(400, 'not JSON'); }
        fs.mkdirSync(sink, { recursive: true });
        const file = path.join(sink, m[1] + '.bake.json');
        const tmp = file + '.tmp-' + process.pid;
        fs.writeFileSync(tmp, body);
        fs.renameSync(tmp, file);            // the page is answered only once it is on disk
        log('banked ' + path.relative(ROOT, file) + ' (' + (body.length / 1024).toFixed(0) + ' KB)');
        send(200, 'ok');
      });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'method not allowed');

    const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
    const file = path.resolve(ROOT, rel);
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(403, 'outside the repo');
    if (path.relative(ROOT, file).split(path.sep).some(p => p.startsWith('.') && p !== '.')) return send(404, 'not found');
    fs.readFile(file, (err, data) => {
      if (err) return send(404, 'not found: ' + rel);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(o.port || 0, '127.0.0.1', () => {
      port = server.address().port;
      resolve({ port, url: 'http://127.0.0.1:' + port, sink, close: () => new Promise(r => server.close(() => r())) });
    });
  });
}

module.exports = { start };

if (require.main === module){
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
  start({ port: +(opt('port') || 8923), sink: opt('sink'), log: m => console.log(m) }).then(s => {
    console.log('serving ' + ROOT + ' on ' + s.url + '/index.html');
    console.log('bake sink -> ' + s.sink);
    console.log('e.g. ' + s.url + '/index.html?bake=<map>   (Ctrl+C to stop)');
  }, e => { console.error('! ' + e.message); process.exit(1); });
}
