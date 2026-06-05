/**
 * Manual Electron IPC smoke test for local-first mode.
 *
 * Launches a real (hidden) Electron window with the production preload.js +
 * weblab-local.js bridge and drives window.weblabNative.localfs/localdev from
 * the renderer against a throwaway temp project — verifying the full
 * renderer -> ipcMain -> node (fs / dev-server / chokidar) -> renderer round
 * trip that powers "open a local folder and edit it live".
 *
 * NOT part of `bun test` — it needs a real Electron binary, a display, and the
 * ability to bind a localhost port (blocked in restricted CI/sandboxes).
 *
 * Run from the repo root:
 *   NEXT_PUBLIC_SITE_URL=http://127.0.0.1:39000 NODE_ENV=development \
 *     ./node_modules/.bin/electron apps/desktop/scripts/ipc-smoke.cjs
 *
 * Exit code 0 = all checks passed. Verified passing 2026-06-05:
 *   bridge, writeOk, readMatch, listHas, statFile, watchFired, devStartOk.
 *
 * NEXT_PUBLIC_SITE_URL must match the origin the page is served from so the
 * preload's origin gate attaches the bridge (same gate as production).
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DESKTOP = path.join(__dirname, '..');
const { registerLocalIpc, stopDevServer } = require(path.join(DESKTOP, 'weblab-local.js'));

const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:39000';
const ORIGIN_PORT = Number(new URL(ORIGIN).port);
const DEV_PORT = 31988;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-ipc-'));
fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true }); // skip install
// A dependency-free static file server (stands in for the project's real dev
// server) so we can prove an edit written to disk is actually served back —
// i.e. shows up on the canvas. CORS '*' lets the renderer read it cross-origin.
fs.writeFileSync(
    path.join(root, 'server.js'),
    [
        "const http=require('http'),fs=require('fs'),path=require('path');",
        'http.createServer((req,res)=>{',
        "  res.setHeader('Access-Control-Allow-Origin','*');",
        "  const rel=(req.url||'/').split('?')[0];",
        "  const f=path.join(__dirname, rel==='/'?'index.html':rel);",
        "  fs.readFile(f,(e,d)=>{ if(e){res.statusCode=404;res.end('not found');} else {res.end(d);} });",
        `}).listen(${DEV_PORT},'127.0.0.1');`,
    ].join('\n'),
);
fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'wl-ipc', private: true, scripts: { dev: 'node server.js' } }, null, 2),
);

const PAGE = `<html><head><meta charset="utf-8"></head><body><script>
(async () => {
  const out = (r) => console.log('SMOKE_RESULT:' + JSON.stringify(r));
  try {
    const n = window.weblabNative;
    if (n == null || n.localfs == null || n.localdev == null) return out({ bridge: false });
    const lf = n.localfs, dev = n.localdev;
    const root = new URLSearchParams(location.search).get('root');
    const r = { bridge: true };
    await lf.write(root, 'index.html', '<h1 id="t">v1</h1>');
    r.writeOk = (await lf.write(root, 'src/hello.txt', 'hi')).success === true;
    r.readMatch = (await lf.read(root, 'src/hello.txt')).content === 'hi';
    await lf.mkdir(root, 'sub');
    r.listHas = ((await lf.list(root, '.')).files || []).some((f) => f.name === 'src');
    r.statFile = (await lf.stat(root, 'src/hello.txt')).type === 'file';
    let fired = false;
    lf.onWatchEvent((p) => { if (((p.event && p.event.paths) || []).some((x) => x.includes('ext-edit'))) fired = true; });
    await lf.watchStart(root, []);
    await lf.write(root, 'ext-edit.txt', 'x');
    await new Promise((s) => setTimeout(s, 2500));
    r.watchFired = fired;
    const ds = await dev.start(root, 'node server.js', ${DEV_PORT});
    r.devStartOk = ds.error == null && ds.url != null;
    // The editor canvas IS an iframe pointed at the local dev server. Mount one
    // against the running server and confirm it renders (cross-origin onload
    // fires on a successful load; script access stays blocked, which is fine).
    r.iframeLoaded = await new Promise((res) => {
      const f = document.createElement('iframe');
      f.style.display = 'none';
      f.onload = () => res(true);
      f.onerror = () => res(false);
      f.src = 'http://127.0.0.1:${DEV_PORT}/';
      document.body.appendChild(f);
      setTimeout(() => res(false), 5000);
    });
    // "Do some edits and it will be saved": write an edit to the source via the
    // bridge, confirm the running dev server serves it (would show on canvas),
    // and confirm it persisted to disk (survives a reopen — disk is truth).
    await lf.write(root, 'index.html', '<h1 id="t">v2-EDITED</h1>');
    const served = await fetch('http://127.0.0.1:${DEV_PORT}/index.html?' + Date.now()).then((x) => x.text()).catch(() => '');
    r.editServed = served.includes('v2-EDITED');
    r.editPersisted = ((await lf.read(root, 'index.html')).content || '').includes('v2-EDITED');
    out(r);
  } catch (e) { out({ bridge: true, error: String((e && e.message) || e) }); }
})();
</script></body></html>`;

const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(PAGE);
});

let done = false;
const holder = {};
function finish(code, msg) {
    if (done) return;
    done = true;
    console.log(`SMOKE_DONE code=${code} ${msg || ''}`);
    try {
        stopDevServer(root);
    } catch {
        /* ignore */
    }
    try {
        server.close();
    } catch {
        /* ignore */
    }
    app.exit(code);
}

function extractMsg(args) {
    const e0 = args[0] || {};
    if (typeof e0.message === 'string') return e0.message; // Electron 36+ single-event API
    if (typeof args[2] === 'string') return args[2]; // legacy (event, level, message, ...)
    if (args[1] && typeof args[1].message === 'string') return args[1].message;
    if (typeof args[1] === 'string') return args[1];
    return '';
}

ipcMain.on('weblab:get-version', (e) => {
    e.returnValue = '0.0.0-smoke';
});

app.whenReady().then(() => {
    if (app.dock) app.dock.hide();
    server.listen(ORIGIN_PORT, '127.0.0.1', () => {
        registerLocalIpc({
            allowedOrigins: new Set([ORIGIN, `http://localhost:${ORIGIN_PORT}`]),
            getWebContents: () => holder.win && holder.win.webContents,
        });
        const win = new BrowserWindow({
            show: false,
            webPreferences: {
                preload: path.join(DESKTOP, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
            },
        });
        holder.win = win;
        win.webContents.on('console-message', (...args) => {
            const message = extractMsg(args);
            if (!message.startsWith('SMOKE_RESULT:')) return;
            let r;
            try {
                r = JSON.parse(message.slice('SMOKE_RESULT:'.length));
            } catch {
                return finish(3, 'parse-error');
            }
            console.log('RESULT ' + JSON.stringify(r));
            const ok =
                r.bridge &&
                r.writeOk &&
                r.readMatch &&
                r.listHas &&
                r.statFile &&
                r.watchFired &&
                r.devStartOk &&
                r.iframeLoaded &&
                r.editServed &&
                r.editPersisted;
            finish(ok ? 0 : 1);
        });
        win.loadURL(`${ORIGIN}/?root=${encodeURIComponent(root)}`);
        setTimeout(() => finish(2, 'timeout'), 25000);
    });
});
