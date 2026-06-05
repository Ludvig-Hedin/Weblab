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
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
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

afterAll(async () => {
    if (root) {
        stopDevServer(root);
        await rm(root, { recursive: true, force: true });
    }
});
