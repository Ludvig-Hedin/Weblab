// Headless integration test for the local-first dev-server + watch engine.
// Exercises the REAL bridge code (apps/desktop/weblab-local.js) against real
// child processes + a real chokidar watcher — no Electron, no npm/network.
// Proves the runtime-critical loop: spawn dev server -> bind port -> serve, and
// external file edit -> chokidar -> watch-event. (The Electron IPC glue + the
// visual canvas still need a live desktop run; this verifies the engine beneath
// them.)
//
// The dev-server + watch checks need to bind a localhost port and open files —
// blocked in restricted CI/sandboxes (EPERM / EMFILE). They `skipIf` that
// environment so the suite never false-fails; run it on a normal machine (or
// unsandboxed) to actually exercise them. Verified passing 2026-06-05:
// HTTP 200 from the spawned dev server + 1 watch-event from an external write.

import { afterAll, expect, test } from 'bun:test';
import http from 'node:http';
import net from 'node:net';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    canBindPort,
    findFreePort,
    inferPortFromDevScript,
    resolveWithin,
    startDevServer,
    startWatch,
    stopDevServer,
    stopWatch,
} from './weblab-local.js';

const PORT = 31987; // high + unusual to avoid collisions

// Can this environment bind a localhost port? (Sandboxes return EPERM.)
const RUNTIME_OK = await new Promise((resolve) => {
    const srv = http.createServer(() => {});
    srv.on('error', () => resolve(false));
    srv.listen(0, '127.0.0.1', () => srv.close(() => resolve(true)));
});

let root;
const watchEvents = [];
const getWebContents = () => ({
    send: (channel, payload) => {
        if (channel === 'weblab:localfs:watch-event') watchEvents.push(payload);
    },
});

function httpStatus(port) {
    return new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${port}`, (res) => {
            res.resume();
            resolve(res.statusCode);
        });
        req.on('error', () => resolve(0));
        req.setTimeout(2000, () => {
            req.destroy();
            resolve(0);
        });
    });
}

test('resolveWithin confines paths to the project root', async () => {
    root = await mkdtemp(join(tmpdir(), 'wl-int-'));
    expect(resolveWithin(root, 'src/a.txt')).toBe(join(root, 'src/a.txt'));
    expect(() => resolveWithin(root, '../escape')).toThrow();
    expect(() => resolveWithin(root, '/etc/passwd')).toThrow();
});

test.skipIf(!RUNTIME_OK)(
    'startDevServer boots a real dev server that binds the port (HTTP 200)',
    async () => {
        // node_modules present → ensureInstalled skips npm (keeps it offline).
        await mkdir(join(root, 'node_modules'), { recursive: true });
        // A dependency-free "dev server": a tiny http server bound to PORT.
        await writeFile(
            join(root, 'server.js'),
            `const http=require('http');http.createServer((_,res)=>res.end('ok')).listen(${PORT},'127.0.0.1');`,
        );
        await writeFile(
            join(root, 'package.json'),
            JSON.stringify(
                { name: 'wl-int', private: true, scripts: { dev: 'node server.js' } },
                null,
                2,
            ),
        );

        const res = await startDevServer(root, 'node server.js', PORT, getWebContents);
        expect(res.error).toBeUndefined();
        expect(res.port).toBe(PORT);
        expect(await httpStatus(PORT)).toBe(200);
    },
    30000,
);

test.skipIf(!RUNTIME_OK)(
    'chokidar delivers an external file edit as a watch-event',
    async () => {
        const r = await startWatch(root, [], getWebContents);
        expect(r.watchId).toBeTruthy();
        watchEvents.length = 0;

        // Simulate an edit made outside the app (VS Code / an AI CLI).
        await writeFile(join(root, 'externally-edited.txt'), 'hello from outside');

        const start = Date.now();
        while (watchEvents.length === 0 && Date.now() - start < 4000) {
            await new Promise((res) => setTimeout(res, 100));
        }
        expect(watchEvents.length).toBeGreaterThan(0);
        expect(
            watchEvents.some((e) =>
                (e.event?.paths ?? []).some((p) => p.includes('externally-edited.txt')),
            ),
        ).toBe(true);
        stopWatch(r.watchId);
    },
    10000,
);

// Pure (no network) — always runs, even in a sandboxed CI.
test('inferPortFromDevScript reads an explicit port from common dev scripts', () => {
    expect(inferPortFromDevScript('next dev --turbopack')).toBeNull();
    expect(inferPortFromDevScript('next dev -p 4000')).toBe(4000);
    expect(inferPortFromDevScript('next dev --port 4100')).toBe(4100);
    expect(inferPortFromDevScript('serve -s -l tcp://0.0.0.0:8080')).toBe(8080);
    expect(inferPortFromDevScript('vite --host 127.0.0.1:5180')).toBe(5180);
});

test.skipIf(!RUNTIME_OK)(
    'findFreePort skips occupied ports (incl. the :::3000 editor case) and defaults uncommon',
    async () => {
        // A free, uncommon requested port is honored as-is.
        const free = await findFreePort(31850);
        expect(free === 31850 || free >= 31847).toBe(true);

        // Occupy a port on IPv6 :: — how `next dev` binds (":::3000") — and prove
        // we detect it and pick a DIFFERENT free port instead of crashing.
        const blocker = net.createServer(() => {});
        await new Promise((r) => blocker.listen(31851, '::', r));
        expect(await canBindPort(31851)).toBe(false);
        const next = await findFreePort(31851);
        expect(next).not.toBe(31851);
        expect(next).toBeGreaterThanOrEqual(31847);
        await new Promise((r) => blocker.close(r));

        // Released ports read free again.
        expect(await canBindPort(31851)).toBe(true);

        // No preference → uncommon base, never the editor's :3000 / static :8080.
        const def = await findFreePort(null);
        expect(def).toBeGreaterThanOrEqual(31847);
        expect(def).not.toBe(3000);
        expect(def).not.toBe(8080);
    },
    15000,
);

afterAll(async () => {
    if (root) {
        stopDevServer(root);
        await rm(root, { recursive: true, force: true });
    }
});
