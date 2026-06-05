/**
 * Manual Electron smoke test for the canvas element-selection + live restyle.
 *
 * Drives the REAL editor↔preload penpal RPC — the exact mechanism behind
 * "click an element on the canvas and restyle it":
 *   1. A parent page (stands in for the editor) penpal-connects to a child page
 *      running the production preload bundle (public/weblab-preload-script.js).
 *   2. Parent calls remote.getElementAtLoc(x, y) — what the editor does when you
 *      click on the canvas — and gets back the element under that point.
 *   3. Parent calls remote.updateStyle(domId, …) — the live restyle — and we
 *      read the child's computed style to confirm the element actually changed.
 *
 * Parent + child are same-origin so the parent can read the child's computed
 * style directly (and penpal's origin gate is satisfied). NOT part of `bun test`
 * — needs a real Electron binary + a display. Verified passing 2026-06-06:
 * connected + elementFound + restyled → exit 0.
 *
 *   ./node_modules/.bin/electron apps/desktop/scripts/preload-canvas-smoke.cjs
 */
const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..', '..');
const PRELOAD_JS = fs.readFileSync(
    path.join(REPO, 'apps/web/client/public/weblab-preload-script.js'),
    'utf8',
);
const PENPAL_MJS = fs.readFileSync(path.join(REPO, 'node_modules/penpal/dist/penpal.mjs'), 'utf8');

const PORT = 39120;
const ORIGIN = `http://127.0.0.1:${PORT}`;

const CHILD_HTML = `<!doctype html><html><head><style>
  html,body{margin:0;padding:0}
  .box{width:200px;height:200px;background:rgb(0,128,0)}
</style></head><body>
  <div id="target" class="box" data-oid="test-oid-1" data-odid="test-domid-1">click me</div>
  <script type="module" src="/preload.js"></script>
</body></html>`;

const PARENT_HTML = `<!doctype html><html><body>
<script>console.log('PRELOAD_LOG:parent-boot');window.addEventListener('error',function(e){console.log('PRELOAD_LOG:error '+(e.message||e));});window.addEventListener('unhandledrejection',function(e){console.log('PRELOAD_LOG:reject '+((e.reason&&e.reason.message)||e.reason));});</script>
<iframe id="f" src="/child" style="width:800px;height:600px;border:0"></iframe>
<script type="module">
const log = (m) => console.log('PRELOAD_LOG:' + m);
const out = (r) => console.log('PRELOAD_RESULT:' + JSON.stringify(r));
log('module-start');
const { connect, WindowMessenger } = await import('/penpal.mjs');
log('penpal-imported');
const r = { connected:false, elementFound:false, restyled:false };
const iframe = document.getElementById('f');
const run = async () => {
  log('iframe-loaded');
  try {
    const messenger = new WindowMessenger({ remoteWindow: iframe.contentWindow, allowedOrigins: [location.origin] });
    const connection = connect({ messenger, methods: {
      getBranchId: async () => 'branch', getFrameId: async () => 'frame',
      onContentResized: () => {}, onWindowResized: () => {},
    }});
    const remote = await connection.promise;
    r.connected = !!remote; log('connected ' + r.connected);
    await new Promise((s) => setTimeout(s, 800)); // let the preload process the DOM
    // "Click" at (50,50) → the editor asks the preload which element is there.
    const el = await remote.getElementAtLoc(50, 50, true);
    r.elementFound = !!(el && el.domId); r.domId = el && el.domId; r.tag = el && el.tagName;
    log('element ' + JSON.stringify({ domId: r.domId, tag: r.tag }));
    if (r.elementFound) {
      // The live restyle: turn the element red via the same RPC the editor uses.
      await remote.updateStyle(el.domId, { updated: { 'background-color': { value: 'rgb(255, 0, 0)', type: 'Value' } } }, undefined, 'test-oid-1');
      await new Promise((s) => setTimeout(s, 400));
      // Same-origin → read the child's computed style directly.
      const target = iframe.contentDocument.getElementById('target');
      const bg = iframe.contentWindow.getComputedStyle(target).backgroundColor.replace(/\\s/g, '');
      r.bgAfter = bg; log('bgAfter ' + bg);
      r.restyled = bg === 'rgb(255,0,0)';
    }
    out(r);
  } catch (e) { r.error = String((e && e.message) || e); out(r); }
};
if (iframe.contentWindow && iframe.contentDocument && iframe.contentDocument.readyState === 'complete') run();
else iframe.addEventListener('load', run);
</script></body></html>`;

const server = http.createServer((req, res) => {
    const u = (req.url || '/').split('?')[0];
    if (u === '/preload.js') {
        res.setHeader('content-type', 'application/javascript');
        return res.end(PRELOAD_JS);
    }
    if (u === '/penpal.mjs') {
        res.setHeader('content-type', 'application/javascript');
        return res.end(PENPAL_MJS);
    }
    if (u === '/child') {
        res.setHeader('content-type', 'text/html');
        return res.end(CHILD_HTML);
    }
    res.setHeader('content-type', 'text/html');
    res.end(PARENT_HTML);
});

let done = false;
function finish(code, msg) {
    if (done) return;
    done = true;
    console.log(`PRELOAD_DONE code=${code} ${msg || ''}`);
    try {
        server.close();
    } catch {
        /* ignore */
    }
    app.exit(code);
}

function extractMsg(args) {
    const e0 = args[0] || {};
    if (typeof e0.message === 'string') return e0.message;
    if (typeof args[2] === 'string') return args[2];
    if (args[1] && typeof args[1].message === 'string') return args[1].message;
    if (typeof args[1] === 'string') return args[1];
    return '';
}

app.whenReady().then(() => {
    if (app.dock) app.dock.hide();
    server.listen(PORT, '127.0.0.1', () => {
        const win = new BrowserWindow({ show: false });
        win.webContents.on('console-message', (...args) => {
            const m = extractMsg(args);
            if (m.startsWith('PRELOAD_LOG:')) {
                console.log('LOG', m.slice('PRELOAD_LOG:'.length));
            } else if (m.startsWith('PRELOAD_RESULT:')) {
                let r;
                try {
                    r = JSON.parse(m.slice('PRELOAD_RESULT:'.length));
                } catch {
                    return finish(3, 'parse');
                }
                console.log('RESULT ' + JSON.stringify(r));
                finish(r.connected && r.elementFound && r.restyled ? 0 : 1);
            } else if (m) {
                console.log('CONSOLE:', m.slice(0, 200));
            }
        });
        win.webContents.on('did-finish-load', () => console.log('DIAG did-finish-load'));
        win.webContents.on('did-fail-load', (_e, ec, desc) => console.log('DIAG did-fail-load', ec, desc));
        win.loadURL(`${ORIGIN}/`);
        setTimeout(() => finish(2, 'timeout'), 25000);
    });
});
