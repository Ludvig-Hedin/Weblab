/**
 * Bridge between the renderer (Weblab web app inside the BrowserWindow) and the
 * user's LOCAL machine for local-first project editing. Backs the
 * `NodeFsProvider` in @weblab/code-provider, which runs in the renderer and
 * cannot touch Node APIs directly — every filesystem / dev-server / watch
 * operation is delegated here over IPC.
 *
 * Responsibilities:
 *   1. `weblab:localfs:*`   — pick a folder + real fs CRUD, confined to a root.
 *   2. `weblab:localdev:*`  — spawn / stop / probe the project's dev server.
 *   3. file watching        — chokidar on the root; streams change events back
 *                              to the renderer so external edits (VS Code,
 *                              Claude Code) reflect live on the canvas.
 *
 * Origin gate: every handler verifies the senderFrame's origin against
 * `allowedOrigins` (defense in depth — mirrors weblab-cli.js). All fs paths are
 * confined to the per-call project root; `..` / absolute escapes are rejected.
 */

let ipcMain;
let dialog;
try {
    ({ ipcMain, dialog } = require('electron'));
} catch {
    // Non-Electron context (e.g. a headless node integration test). The core
    // fs / dev-server / watch functions need no electron; registerLocalIpc()
    // (the only consumer of ipcMain/dialog) simply won't be called there.
}
const { spawn, execFileSync } = require('child_process');
const fsp = require('fs/promises');
const path = require('path');
const http = require('http');
const net = require('net');

// chokidar is an optional dep until `bun install` runs in apps/desktop. Load it
// lazily so the desktop app still boots (with watch disabled) if it's missing.
let chokidar = null;
try {
    chokidar = require('chokidar');
} catch {
    chokidar = null;
}

function isFromAllowedOrigin(event, allowedOrigins) {
    try {
        const senderUrl =
            (event.senderFrame && event.senderFrame.url) ||
            (event.sender && event.sender.getURL && event.sender.getURL());
        if (!senderUrl) return false;
        return allowedOrigins.has(new URL(senderUrl).origin);
    } catch {
        return false;
    }
}

/**
 * Resolve `relPath` inside `root`, rejecting absolute paths and `..` traversal
 * that would escape the project root. Returns the absolute on-disk path.
 */
function resolveWithin(root, relPath) {
    if (typeof root !== 'string' || root.length === 0) {
        throw new Error('invalid_root');
    }
    const normRoot = path.resolve(root);
    const abs = path.resolve(normRoot, relPath == null || relPath === '' ? '.' : relPath);
    if (abs !== normRoot && !abs.startsWith(normRoot + path.sep)) {
        throw new Error('path_escape');
    }
    return abs;
}

// --- Shell environment (PATH) -------------------------------------------------
// GUI-launched apps on macOS/Linux inherit a minimal PATH that often lacks
// node/npm. Pull the login shell's PATH once so spawned dev servers can find
// the toolchain. Best-effort + timeout-guarded; falls back to process PATH.
let cachedEnv = null;
function syncedEnv() {
    if (cachedEnv) return cachedEnv;
    let envPath = process.env.PATH || '';
    if (process.platform !== 'win32') {
        try {
            // execFileSync (no shell string interpolation): the shell binary is
            // an argv[0], the script is a fixed literal run BY that login shell
            // to capture its PATH. Avoids the command-injection surface of exec.
            const shell = process.env.SHELL || '/bin/zsh';
            const out = execFileSync(shell, ['-lic', 'echo -n "$PATH"'], {
                timeout: 4000,
                stdio: ['ignore', 'pipe', 'ignore'],
            })
                .toString()
                .trim();
            if (out) envPath = out;
        } catch {
            // keep process PATH
        }
    }
    cachedEnv = { ...process.env, PATH: envPath };
    return cachedEnv;
}

// --- Dev server ---------------------------------------------------------------
// Mirrors the port inference in apps/web/server/src/sandbox/index.ts so local
// and cloud agree on how a dev script's port is read.
function inferPortFromDevScript(devScript) {
    if (typeof devScript !== 'string') return null;
    const explicit =
        /(?:--port|-p|--listen|-l)\s+(?:tcp:\/\/[^:]+:)?(\d{2,5})\b/.exec(devScript)?.[1];
    const localhost = /(?:localhost|0\.0\.0\.0|127\.0\.0\.1):(\d{2,5})\b/.exec(devScript)?.[1];
    const raw = explicit ?? localhost;
    if (!raw) return null;
    const port = Number.parseInt(raw, 10);
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

// --- Free-port selection ------------------------------------------------------
// Local projects must never collide with the Weblab editor's own dev server
// (:3000) or each other. We pick an uncommon, high, registered-range port and
// scan upward for a free one. Keep WEBLAB_LOCAL_BASE_PORT in sync with
// WEBLAB_LOCAL_DEFAULT_PORT in packages/constants/src/editor.ts.
const WEBLAB_LOCAL_BASE_PORT = 31847;
const PORT_SCAN_LIMIT = 256;
// Never hand out a well-known dev port even if momentarily free — they're the
// ports other tools (and the editor itself) expect to grab, so squatting on
// one invites a later collision.
const AVOID_PORTS = new Set([
    3000, 3001, 3002, 4000, 4173, 4200, 5000, 5173, 5174, 8000, 8080, 8081, 8888, 9000, 9229,
]);

// True if something is already listening on `host:port`. We use a CONNECT probe
// rather than a bind probe on purpose: Node sets SO_REUSEADDR on listeners, so
// two binds to the same port can BOTH succeed and falsely report "free". A
// successful TCP connect unambiguously means the port is taken.
function isPortInUseOn(port, host) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let settled = false;
        const done = (inUse) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(inUse);
        };
        socket.setTimeout(700);
        socket.once('connect', () => done(true)); // someone is listening
        socket.once('timeout', () => done(false));
        socket.once('error', () => done(false)); // ECONNREFUSED → nothing there
        try {
            socket.connect(port, host);
        } catch {
            done(false);
        }
    });
}

// A port is free only if nothing is listening on either loopback family. Dev
// servers vary — `next dev` binds `::` dualstack (the "address already in use
// :::3000" case), `serve`/Vite bind 0.0.0.0 — and a dualstack listener answers
// on 127.0.0.1 too, so checking both 127.0.0.1 and ::1 catches every case.
async function canBindPort(port) {
    if (await isPortInUseOn(port, '127.0.0.1')) return false;
    return !(await isPortInUseOn(port, '::1'));
}

// Pick a free port. Honors `preferred` FIRST when it's bindable — even if it's
// a "common" port — because the editor's frame URL was built from it and some
// frameworks (Vite, static `serve`) bind their own port regardless of the PORT
// env, so second-guessing a free requested port would only cause a mismatch.
// Only when `preferred` is occupied do we scan upward from the uncommon base
// (skipping well-known ports), giving the "use the next one if occupied"
// behavior instead of crashing on EADDRINUSE.
async function findFreePort(preferred) {
    const pref =
        Number.isInteger(preferred) && preferred > 0 && preferred <= 65535 ? preferred : null;
    if (pref && (await canBindPort(pref))) return pref;
    for (let i = 0; i < PORT_SCAN_LIMIT; i++) {
        const p = WEBLAB_LOCAL_BASE_PORT + i;
        if (p > 65535) break;
        if (p === pref || AVOID_PORTS.has(p)) continue;
        // eslint-disable-next-line no-await-in-loop
        if (await canBindPort(p)) return p;
    }
    // Exhausted the uncommon range (absurd in practice). Fall back to the
    // preferred/base port; if it's occupied the dev server surfaces a clear
    // EADDRINUSE rather than us silently picking a wrong port.
    return pref ?? WEBLAB_LOCAL_BASE_PORT;
}

async function readDevScript(root) {
    try {
        const raw = await fsp.readFile(path.join(root, 'package.json'), 'utf8');
        const pkg = JSON.parse(raw);
        return (pkg.scripts && typeof pkg.scripts.dev === 'string' && pkg.scripts.dev) || '';
    } catch {
        return '';
    }
}

function probePort(port) {
    return new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${port}`, (res) => {
            res.destroy();
            resolve(true);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(1000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

const devServers = new Map(); // root -> { child, port, url, output: string[] }

// Install deps if node_modules is absent. Package-manager-aware (the user's own
// lockfile decides). Runs WITH lifecycle scripts — unlike the cloud importer
// (which uses --ignore-scripts for untrusted repos), this is the user's own
// machine + project, so postinstall codegen (e.g. prisma generate) must run.
async function ensureInstalled(root, getWebContents) {
    try {
        await fsp.stat(path.join(root, 'node_modules'));
        return; // already installed
    } catch {
        // node_modules missing → install below
    }
    const installCmd = [
        'if [ -f pnpm-lock.yaml ]; then corepack enable >/dev/null 2>&1 || true; pnpm install;',
        'elif [ -f yarn.lock ]; then corepack enable >/dev/null 2>&1 || true; yarn install;',
        'elif [ -f bun.lockb ] || [ -f bun.lock ]; then bun install;',
        'else npm install; fi',
    ].join(' ');
    await new Promise((resolve) => {
        let child;
        try {
            child = spawn(installCmd, {
                cwd: root,
                env: syncedEnv(),
                shell: true,
                stdio: ['ignore', 'pipe', 'pipe'],
            });
        } catch {
            return resolve();
        }
        const onData = (b) => {
            const wc = getWebContents();
            if (wc) {
                try {
                    wc.send('weblab:localdev:output', { root, data: b.toString() });
                } catch {
                    // window closed
                }
            }
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('exit', () => resolve());
        child.on('error', () => resolve());
    });
}

async function startDevServer(root, command, requestedPort, getWebContents) {
    const existing = devServers.get(root);
    if (existing && existing.child && existing.child.exitCode === null) {
        return { port: existing.port, url: existing.url };
    }
    // Deps must exist before the dev server can boot. The editor never calls
    // provider.setup(); the dev task's open()/run() is the only trigger, so
    // install-if-needed lives here to guarantee a fresh folder is usable.
    await ensureInstalled(root, getWebContents);
    const devScript = await readDevScript(root);
    const requested =
        Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65535
            ? requestedPort
            : null;
    // Pick a FREE port — preferring the one the editor's frame URL was built
    // from, then the dev script's explicit port, then an uncommon base — and
    // scan to the next free one instead of crashing on EADDRINUSE. PORT is
    // passed below so PORT-honoring frameworks (Next.js) bind exactly this.
    // TODO(local-port-propagation): a script with a hardcoded port (static
    //   `serve -l 8080`) ignores PORT, so an occupied explicit port still
    //   collides; and if we increment away from `requested` at runtime the
    //   editor's frame.url won't follow until reload. See BACKLOG.
    const port = await findFreePort(requested ?? inferPortFromDevScript(devScript));
    const cmd = command && String(command).trim().length > 0 ? String(command) : 'npm run dev';
    let child;
    try {
        child = spawn(cmd, {
            cwd: root,
            // Pass PORT so frameworks that honor it (Next.js) bind the port the
            // editor's frame URL was built from. Scripts with an explicit flag
            // (the static-HTML scaffold's `serve -l <port>`) override it. Keeps
            // localhost:<port> on the canvas matching the actual dev server.
            env: { ...syncedEnv(), PORT: String(port) },
            shell: true, // user's own project script — runs through the shell
            // New process group (POSIX) so stopDevServer can kill the shell AND
            // the dev server it spawns. Without this, shell:true leaves the real
            // dev server orphaned on close/switch, leaking processes + the port.
            detached: process.platform !== 'win32',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    } catch (err) {
        return { error: (err && err.message) || 'spawn_failed' };
    }
    const rec = { child, port, url: `http://localhost:${port}`, output: [] };
    devServers.set(root, rec);
    const onData = (b) => {
        const s = b.toString();
        rec.output.push(s);
        if (rec.output.length > 500) rec.output.shift();
        const wc = getWebContents();
        if (wc) {
            try {
                wc.send('weblab:localdev:output', { root, data: s });
            } catch {
                // window may have closed
            }
        }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', () => devServers.delete(root));
    child.on('error', () => devServers.delete(root));

    // Wait until the dev server actually binds the port (cold compile 30-90s).
    const deadline = Date.now() + 90000;
    let listening = false;
    while (Date.now() < deadline) {
        if (devServers.get(root) !== rec) break; // crashed
        if (await probePort(port)) {
            listening = true;
            break;
        }
        await new Promise((r) => setTimeout(r, 1000));
    }
    if (!listening && devServers.get(root) !== rec) {
        return { error: `Dev server exited before binding port ${port}.` };
    }
    return { port, url: rec.url };
}

function stopDevServer(root) {
    const rec = devServers.get(root);
    if (rec && rec.child && rec.child.pid) {
        try {
            if (process.platform === 'win32') {
                rec.child.kill();
            } else {
                // Negative pid → kill the whole process group (shell + the dev
                // server it spawned), so nothing is orphaned holding the port.
                process.kill(-rec.child.pid, 'SIGTERM');
            }
        } catch {
            try {
                rec.child.kill();
            } catch {
                // already gone
            }
        }
    }
    devServers.delete(root);
}

async function runCommand(root, command) {
    return new Promise((resolve) => {
        let child;
        try {
            child = spawn(String(command), {
                cwd: root,
                env: syncedEnv(),
                shell: true,
                stdio: ['ignore', 'pipe', 'pipe'],
            });
        } catch (err) {
            return resolve({ output: '', exitCode: -1, error: (err && err.message) || 'spawn_failed' });
        }
        let out = '';
        child.stdout.on('data', (b) => (out += b.toString()));
        child.stderr.on('data', (b) => (out += b.toString()));
        child.on('error', (err) => resolve({ output: out, exitCode: -1, error: err.message }));
        child.on('exit', (code) => resolve({ output: out, exitCode: code ?? -1 }));
    });
}

// --- Watch --------------------------------------------------------------------
const watchers = new Map(); // watchId -> watcher
let watchSeq = 0;

async function startWatch(root, excludes, getWebContents) {
    if (!chokidar) return { error: 'chokidar_unavailable' };
    const id = `w${++watchSeq}`;
    const ignored = [
        /(^|[/\\])\../, // dotfiles/dirs
        '**/node_modules/**',
        '**/.git/**',
        '**/.next/**',
        '**/dist/**',
        ...(Array.isArray(excludes) ? excludes : []),
    ];
    let watcher;
    try {
        watcher = chokidar.watch(root, { ignored, ignoreInitial: true, persistent: true });
    } catch (err) {
        return { error: (err && err.message) || 'watch_failed' };
    }
    const emit = (type, absPath) => {
        const wc = getWebContents();
        if (!wc) return;
        try {
            wc.send('weblab:localfs:watch-event', {
                watchId: id,
                event: { type, paths: [path.relative(root, absPath)] },
            });
        } catch {
            // window closed
        }
    };
    watcher.on('add', (p) => emit('add', p));
    watcher.on('change', (p) => emit('change', p));
    watcher.on('unlink', (p) => emit('remove', p));
    watchers.set(id, watcher);
    // Wait for chokidar's initial scan to finish before resolving, so edits
    // made right after watchStart aren't dropped during startup. Fallback after
    // 3s so a watcher that never emits 'ready' can't hang the caller.
    await new Promise((resolve) => {
        let settled = false;
        const done = () => {
            if (settled) return;
            settled = true;
            resolve();
        };
        watcher.once('ready', done);
        setTimeout(done, 3000);
    });
    return { watchId: id };
}

function stopWatch(watchId) {
    const w = watchers.get(watchId);
    if (w) {
        try {
            w.close();
        } catch {
            // ignore
        }
        watchers.delete(watchId);
    }
}

// --- Registration -------------------------------------------------------------
function registerLocalIpc({ allowedOrigins, getWebContents }) {
    const guard = (event) => isFromAllowedOrigin(event, allowedOrigins);

    ipcMain.handle('weblab:localfs:pickFolder', async (event) => {
        if (!guard(event)) return null;
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory', 'createDirectory'],
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        return { rootPath: result.filePaths[0] };
    });

    ipcMain.handle('weblab:localfs:read', async (event, { root, path: rel } = {}) => {
        if (!guard(event)) return { error: 'origin_mismatch' };
        try {
            const abs = resolveWithin(root, rel);
            const content = await fsp.readFile(abs, 'utf8');
            return { content };
        } catch (err) {
            return { error: err.code === 'ENOENT' ? 'not_found' : err.message, notFound: err.code === 'ENOENT' };
        }
    });

    ipcMain.handle('weblab:localfs:write', async (event, { root, path: rel, content } = {}) => {
        if (!guard(event)) return { error: 'origin_mismatch' };
        try {
            const abs = resolveWithin(root, rel);
            await fsp.mkdir(path.dirname(abs), { recursive: true });
            const data = content instanceof Uint8Array ? Buffer.from(content) : String(content ?? '');
            await fsp.writeFile(abs, data);
            return { success: true };
        } catch (err) {
            return { error: err.message };
        }
    });

    ipcMain.handle('weblab:localfs:list', async (event, { root, path: rel } = {}) => {
        if (!guard(event)) return { error: 'origin_mismatch' };
        try {
            const abs = resolveWithin(root, rel);
            const entries = await fsp.readdir(abs, { withFileTypes: true });
            return {
                files: entries.map((e) => ({
                    name: e.name,
                    type: e.isDirectory() ? 'directory' : 'file',
                    isSymlink: e.isSymbolicLink(),
                })),
            };
        } catch (err) {
            return { error: err.message, files: [] };
        }
    });

    ipcMain.handle('weblab:localfs:stat', async (event, { root, path: rel } = {}) => {
        if (!guard(event)) return { error: 'origin_mismatch' };
        try {
            const abs = resolveWithin(root, rel);
            const st = await fsp.lstat(abs);
            return {
                type: st.isDirectory() ? 'directory' : 'file',
                isSymlink: st.isSymbolicLink(),
                size: st.size,
                mtime: st.mtimeMs,
                ctime: st.ctimeMs,
            };
        } catch (err) {
            return { error: err.code === 'ENOENT' ? 'not_found' : err.message, notFound: err.code === 'ENOENT' };
        }
    });

    ipcMain.handle('weblab:localfs:mkdir', async (event, { root, path: rel } = {}) => {
        if (!guard(event)) return { error: 'origin_mismatch' };
        try {
            await fsp.mkdir(resolveWithin(root, rel), { recursive: true });
            return { success: true };
        } catch (err) {
            return { error: err.message };
        }
    });

    ipcMain.handle('weblab:localfs:remove', async (event, { root, path: rel, recursive } = {}) => {
        if (!guard(event)) return { error: 'origin_mismatch' };
        try {
            await fsp.rm(resolveWithin(root, rel), { recursive: recursive !== false, force: true });
            return { success: true };
        } catch (err) {
            return { error: err.message };
        }
    });

    ipcMain.handle('weblab:localfs:rename', async (event, { root, oldPath, newPath } = {}) => {
        if (!guard(event)) return { error: 'origin_mismatch' };
        try {
            const from = resolveWithin(root, oldPath);
            const to = resolveWithin(root, newPath);
            await fsp.mkdir(path.dirname(to), { recursive: true });
            await fsp.rename(from, to);
            return { success: true };
        } catch (err) {
            return { error: err.message };
        }
    });

    ipcMain.handle('weblab:localfs:copy', async (event, { root, sourcePath, targetPath, recursive } = {}) => {
        if (!guard(event)) return { error: 'origin_mismatch' };
        try {
            const from = resolveWithin(root, sourcePath);
            const to = resolveWithin(root, targetPath);
            await fsp.cp(from, to, { recursive: recursive !== false });
            return { success: true };
        } catch (err) {
            return { error: err.message };
        }
    });

    ipcMain.handle('weblab:localfs:watchStart', async (event, { root, excludes } = {}) => {
        if (!guard(event)) return { error: 'origin_mismatch' };
        try {
            resolveWithin(root, '.'); // validate root
            return startWatch(root, excludes, getWebContents);
        } catch (err) {
            return { error: err.message };
        }
    });

    ipcMain.handle('weblab:localfs:watchStop', async (event, { watchId } = {}) => {
        if (!guard(event)) return { error: 'origin_mismatch' };
        stopWatch(watchId);
        return { success: true };
    });

    ipcMain.handle('weblab:localdev:start', async (event, { root, command, port } = {}) => {
        if (!guard(event)) return { error: 'origin_mismatch' };
        try {
            resolveWithin(root, '.');
            return await startDevServer(root, command, port, getWebContents);
        } catch (err) {
            return { error: err.message };
        }
    });

    ipcMain.handle('weblab:localdev:pickPort', async (event, { preferredPort } = {}) => {
        if (!guard(event)) return { error: 'origin_mismatch' };
        try {
            return { port: await findFreePort(preferredPort) };
        } catch (err) {
            return { error: (err && err.message) || 'pick_port_failed' };
        }
    });

    ipcMain.handle('weblab:localdev:stop', async (event, { root } = {}) => {
        if (!guard(event)) return { error: 'origin_mismatch' };
        stopDevServer(root);
        return { success: true };
    });

    ipcMain.handle('weblab:localdev:status', async (event, { root } = {}) => {
        if (!guard(event)) return { error: 'origin_mismatch' };
        const rec = devServers.get(root);
        const running = !!(rec && rec.child && rec.child.exitCode === null);
        return { running, port: rec ? rec.port : undefined, url: rec ? rec.url : undefined };
    });

    ipcMain.handle('weblab:localdev:run', async (event, { root, command } = {}) => {
        if (!guard(event)) return { error: 'origin_mismatch' };
        try {
            resolveWithin(root, '.');
            return await runCommand(root, command);
        } catch (err) {
            return { error: err.message, output: '', exitCode: -1 };
        }
    });
}

// Kill any spawned dev servers + watchers on app shutdown.
function disposeLocal() {
    for (const root of [...devServers.keys()]) stopDevServer(root);
    for (const id of [...watchers.keys()]) stopWatch(id);
}

module.exports = {
    registerLocalIpc,
    disposeLocal,
    resolveWithin,
    inferPortFromDevScript,
    findFreePort,
    canBindPort,
    // Exported for the headless integration test (real dev-server + watch).
    ensureInstalled,
    startDevServer,
    stopDevServer,
    runCommand,
    startWatch,
    stopWatch,
};
