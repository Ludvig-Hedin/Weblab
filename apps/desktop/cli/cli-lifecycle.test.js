import { describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { createChildLifecycle, gatedLaunch, LAUNCH_GATE_SCRIPT, runCapture } from './process.js';
import { parsePosixProcessTable } from './process-identity.js';
import { mcpDisableArgs, startStream } from './codex.js';
import { createTurnRegistry } from './turns.js';
import { buildArgs, claudeIsolationStatus, startStream as startClaude } from './claude.js';

const mcp = (servers) => ({ code: 0, stdout: JSON.stringify(servers) });

describe('Codex mandatory isolation', () => {
    test('failed, malformed and truncated discovery fail closed', async () => {
        for (const result of [{ code: 1, stdout: '' }, { code: 0, stdout: '{}' },
            { code: 0, stdout: 'bad' }, { ...mcp([]), truncated: true },
            mcp([{ name: 'secret', enabled: 'true' }])]) {
            await expect(mcpDisableArgs('codex', {}, '/project', null, async () => result)).rejects.toThrow();
        }
    });
    test('overrides must prove every enabled server is disabled', async () => {
        let calls = 0;
        const capture = async () => mcp([{ name: 'account', enabled: calls++ === 0 }]);
        expect(await mcpDisableArgs('codex', {}, '/project', null, capture))
            .toEqual(['-c', 'mcp_servers.account.enabled=false']);
        await expect(mcpDisableArgs('codex', {}, '/project', null,
            async () => mcp([{ name: 'account', enabled: true }]))).rejects.toThrow();
        calls = 0;
        await expect(mcpDisableArgs('codex', {}, '/project', null,
            async () => calls++ === 0 ? mcp([{ name: 'account', enabled: true }]) : mcp([]))).rejects.toThrow();
    });
    test('cancelled discovery never starts a second probe', async () => {
        const abort = new AbortController();
        let calls = 0;
        await expect(mcpDisableArgs('codex', {}, '/project', abort.signal, async () => {
            calls++;
            abort.abort();
            return mcp([{ name: 'account', enabled: true }]);
        })).rejects.toThrow();
        expect(calls).toBe(1);
    });
    test('a pre-cancelled turn finishes without resolving or spawning a CLI', async () => {
        const abort = new AbortController(); abort.abort();
        const events = [];
        expect(await startStream({ request: { streamId: 'cancelled' },
            signal: abort.signal, emit: (event) => events.push(event) })).toEqual({ touchedPaths: [] });
        expect(events).toEqual([{ streamId: 'cancelled', kind: 'finish' }]);
    });
});

function child(pid = 111) {
    return Object.assign(new EventEmitter(), { pid, stdin: new PassThrough(),
        stdout: new PassThrough(), stderr: new PassThrough() });
}

describe('owned process completion', () => {
    test('BSD signed system UIDs do not invalidate an owned user process snapshot', () => {
        const rows = parsePosixProcessTable('582 1 582 -2 Wed Sep 30 10:00:00 2026\n111 10 111 501 Thu Oct  1 10:00:00 2026\n');
        expect(rows.get(582).uid).toBe(-2);
        expect(rows.get(111).uid).toBe(501);
        expect(() => parsePosixProcessTable('582 1 582 -9007199254740992 Wed Sep 30 10:00:00 2026')).toThrow();
        expect(() => parsePosixProcessTable('582 1 582 -2.5 Wed Sep 30 10:00:00 2026')).toThrow();
    });
    test('a held launch gate tolerates missing initial and fresh snapshots without changing identity', async () => {
        const proc = child(); const uid = 501; let reads = 0; let time = 0; let alive = true;
        const identity = { pid: 111, ppid: process.pid, pgid: 111, uid, start: 'gate-start' };
        const lifecycle = createChildLifecycle(proc, { expectedUid: uid, launchGate: true,
            now: () => time, wait: async (ms) => { time += ms; }, pollMs: 1_000_000,
            readTable: async () => {
                reads++;
                return alive && ![1, 2, 4].includes(reads) ? new Map([[111, identity]]) : new Map();
            },
            signalPid: (pid) => { expect(pid).toBe(111); alive = false; proc.emit('exit', 0); proc.emit('close', 0); },
        });
        expect(await lifecycle.readyForLaunch(uid)).toEqual(identity);
        expect(reads).toBe(5);
        await lifecycle.stop();
    });
    test('a held gate never adopts a different start identity after a missing fresh snapshot', async () => {
        const proc = child(); const signals = []; let reads = 0; let time = 0;
        const identity = { pid: 111, ppid: process.pid, pgid: 111, uid: 501, start: 'gate-start' };
        const lifecycle = createChildLifecycle(proc, { expectedUid: 501, launchGate: true,
            now: () => time, wait: async (ms) => { time += ms; }, pollMs: 1_000_000,
            readTable: async () => ++reads === 2 ? new Map() : new Map([[111,
                reads === 1 ? identity : { ...identity, start: 'different-process' }]]),
            signalPid: (...args) => signals.push(args),
        });
        await expect(lifecycle.readyForLaunch(501)).rejects.toMatchObject({ code: 'cleanup_unconfirmed' });
        await expect(lifecycle.stop()).rejects.toMatchObject({ code: 'cleanup_unconfirmed', unobserved: true });
        expect(signals).toEqual([]);
    });
    test('a never observed held gate stops retrying at a bounded deadline and stays quarantined', async () => {
        const proc = child(); const signals = []; let reads = 0; let time = 0;
        const lifecycle = createChildLifecycle(proc, { expectedUid: 501, launchGate: true, launchWaitMs: 50,
            now: () => time, wait: async (ms) => { time += ms; }, pollMs: 1_000_000,
            readTable: async () => { reads++; return new Map(); }, signalPid: (...args) => signals.push(args),
        });
        await expect(lifecycle.readyForLaunch(501)).rejects.toMatchObject({ code: 'cleanup_unconfirmed' });
        expect(reads).toBe(3);
        await expect(lifecycle.stop()).rejects.toMatchObject({ code: 'cleanup_unconfirmed', unobserved: true });
        expect(signals).toEqual([]);
    });
    test('a held gate that closes while waiting never samples again or grants launch', async () => {
        const proc = child(); const signals = []; let reads = 0;
        const lifecycle = createChildLifecycle(proc, { expectedUid: 501, launchGate: true,
            wait: async () => { proc.emit('exit', 125); proc.emit('close', 125); }, pollMs: 1_000_000,
            readTable: async () => { reads++; return new Map(); }, signalPid: (...args) => signals.push(args),
        });
        await expect(lifecycle.readyForLaunch(501)).rejects.toMatchObject({ code: 'cleanup_unconfirmed' });
        expect(reads).toBe(1);
        await expect(lifecycle.stop()).rejects.toMatchObject({ code: 'cleanup_unconfirmed', unobserved: true });
        expect(signals).toEqual([]);
    });
    test('cancelling a never observed held gate stops further sampling without signaling an unknown PID', async () => {
        const proc = child(); const signals = []; let reads = 0; let stopped;
        const lifecycle = createChildLifecycle(proc, { expectedUid: 501, launchGate: true,
            wait: async () => { stopped = lifecycle.stop(); stopped.catch(() => {}); }, pollMs: 1_000_000,
            readTable: async () => { reads++; return new Map(); }, signalPid: (...args) => signals.push(args),
        });
        await expect(lifecycle.readyForLaunch(501)).rejects.toMatchObject({ code: 'cleanup_unconfirmed' });
        expect(reads).toBe(1);
        await expect(stopped).rejects.toMatchObject({ code: 'cleanup_unconfirmed', unobserved: true });
        expect(signals).toEqual([]);
    });
    test('launch readiness proves UID, ancestry and its own process group', async () => {
        const proc = child(); const uid = 501;
        const table = new Map([[111, { pid: 111, ppid: process.pid, pgid: 111, uid, start: 'gate-start' }]]);
        const lifecycle = createChildLifecycle(proc, { expectedUid: uid,
            readTable: async () => new Map(table), pollMs: 1_000_000,
            signalPid: (pid) => { table.delete(pid); proc.emit('exit', 0); proc.emit('close', 0); },
        });
        expect(await lifecycle.readyForLaunch(uid)).toMatchObject({ pid: 111, uid });
        await lifecycle.stop();
    });
    test.each([
        { uid: 502, ppid: process.pid, pgid: 111 },
        { uid: 501, ppid: 123456, pgid: 111 },
        { uid: 501, ppid: process.pid, pgid: 123456 },
    ])('wrong gate identity never permits exec or signals an unsafe PID: %o', async (identity) => {
        const proc = child(); const signals = [];
        const lifecycle = createChildLifecycle(proc, { expectedUid: 501,
            readTable: async () => new Map([[111, { pid: 111, start: 'gate-start', ...identity }]]),
            signalPid: (...args) => signals.push(args), pollMs: 1_000_000,
        });
        await expect(lifecycle.readyForLaunch(501)).rejects.toMatchObject({ code: 'cleanup_unconfirmed' });
        await expect(lifecycle.stop()).rejects.toMatchObject({ code: 'cleanup_unconfirmed', unobserved: true });
        expect(signals).toEqual([]);
    });
    test('cancellation during identity discovery never grants launch readiness', async () => {
        const proc = child(); const uid = 501; const signals = [];
        const table = new Map([[111, { pid: 111, ppid: process.pid, pgid: 111, uid, start: 'gate-start' }]]);
        let release;
        const first = new Promise((resolve) => { release = resolve; });
        let reads = 0;
        const lifecycle = createChildLifecycle(proc, { expectedUid: uid,
            readTable: async () => { if (reads++ === 0) await first; return new Map(table); },
            pollMs: 1_000_000, signalPid: (pid, signal) => {
                signals.push([pid, signal]); table.delete(pid); proc.emit('exit', 0); proc.emit('close', 0);
            },
        });
        const ready = lifecycle.readyForLaunch(uid);
        const stopped = lifecycle.stop();
        release();
        await expect(ready).rejects.toMatchObject({ code: 'cleanup_unconfirmed' });
        await stopped;
        expect(signals).toEqual([[111, 'SIGTERM']]);
    });
    test('an exited parent that was never observed stays quarantined', async () => {
        const proc = child();
        const signals = [];
        const lifecycle = createChildLifecycle(proc, {
            readTable: async () => new Map(), signalPid: (...args) => signals.push(args),
            pollMs: 1_000_000,
        });
        proc.emit('exit', 0); proc.emit('close', 0);
        await expect(lifecycle.stop()).rejects.toMatchObject({ code: 'cleanup_unconfirmed', unobserved: true });
        expect(signals).toEqual([]);
    });
    test('awaits a resistant captured descendant and escalates only matching identities', async () => {
        const proc = child();
        const table = new Map([
            [111, { pid: 111, ppid: 1, pgid: 111, start: 'parent-start' }],
            [112, { pid: 112, ppid: 111, pgid: 111, start: 'child-start' }],
        ]);
        let time = 0;
        const signals = [];
        const lifecycle = createChildLifecycle(proc, {
            readTable: async () => new Map(table), now: () => time, pollMs: 1_000_000,
            wait: async (ms) => { time += ms; },
            signalPid: (pid, signal) => {
                signals.push([pid, signal]);
                if (pid === 111 || signal === 'SIGKILL') table.delete(pid);
                if (pid === 111) { proc.emit('exit', 0); proc.emit('close', 0); }
            },
        });
        await lifecycle.stop(100);
        expect(signals).toContainEqual([112, 'SIGKILL']);
        expect(table.size).toBe(0);
    });

    test('a changed process identity is never signaled', async () => {
        const proc = child(); let reads = 0; const signals = [];
        const lifecycle = createChildLifecycle(proc, {
            readTable: async () => new Map([[111, { pid: 111, ppid: 1, pgid: 111,
                start: reads++ === 0 ? 'original' : 'reused' }]]),
            signalPid: (...args) => signals.push(args), pollMs: 1_000_000,
        });
        await expect(lifecycle.stop(0)).rejects.toMatchObject({ code: 'cleanup_unconfirmed' });
        expect(signals).toEqual([]);
    });

    test('probe cancellation waits for cleanup rather than reporting an early stop', async () => {
        const proc = child(); const abort = new AbortController();
        let releaseCleanup; let settled = false;
        const cleaned = new Promise((resolve) => { releaseCleanup = resolve; });
        const probe = runCapture('fake', [], { signal: abort.signal,
            spawnChild: () => proc, stopChild: () => cleaned });
        probe.then(() => { settled = true; });
        abort.abort(); await Promise.resolve();
        expect(settled).toBe(false);
        releaseCleanup();
        expect((await probe).aborted).toBe(true);
    });

    test('unknown cleanup retains the folder and makes shutdown fail', async () => {
        const registry = createTurnRegistry();
        registry.acquire('first', '/project'); registry.quarantine('first'); registry.release('first');
        expect(registry.isBusy('/project')).toBe(true);
        expect(registry.acquire('next', '/project')).not.toBeNull();
        await expect(registry.abortAll(1)).rejects.toThrow('cleanup');
    });
});

describe('fixed launch-gate policy', () => {
    test('preserves literal argv and strips startup, function and loader injection', () => {
        const nonce = 'a'.repeat(64);
        const literal = ['$(touch unwanted)', '`command`', '; no shell', '--flag', 'a b'];
        const launch = gatedLaunch('/absolute/tool', literal, {
            HOME: '/home/test', PATH: '/usr/bin:/bin', ANTHROPIC_API_KEY: 'own-provider-key',
            ENV: '/tmp/startup', BASH_ENV: '/tmp/startup', SHELLOPTS: 'xtrace', BASHOPTS: 'xtrace',
            'BASH_FUNC_hook%%': '() { bad; }', LD_PRELOAD: '/tmp/inject', DYLD_INSERT_LIBRARIES: '/tmp/inject',
            NODE_OPTIONS: '--require /tmp/inject', WEBLAB_SECRET: 'app-secret',
        }, nonce);
        expect(launch.args).toEqual(['-p', '-c', LAUNCH_GATE_SCRIPT, 'weblab-cli-gate', nonce, '/absolute/tool', ...literal]);
        expect(launch.env).toEqual({ HOME: '/home/test', PATH: '/usr/bin:/bin', ANTHROPIC_API_KEY: 'own-provider-key' });
        expect(launch.binary).toBe('/bin/sh');
    });
    test('rejects invalid control frames and executable paths', () => {
        for (const nonce of ['', 'a'.repeat(63), 'a'.repeat(65), 'a'.repeat(64) + '\n']) {
            expect(() => gatedLaunch('/bin/true', [], {}, nonce)).toThrow();
        }
        expect(() => gatedLaunch('../tool', [], {}, 'a'.repeat(64))).toThrow();
        expect(() => gatedLaunch('/bin/true', ['unsafe\0argument'], {}, 'a'.repeat(64))).toThrow();
    });
});

// Parent verification owner runs these disposable OS proofs through the
// registered focused-test guard. They never launch a paid provider.
describe.skipIf(process.platform === 'win32')('POSIX launch-gate acceptance', () => {
    test('very fast probes retain proven identity through exec and cleanup', async () => {
        for (let i = 0; i < 5; i++) {
            expect(await runCapture('/usr/bin/true', [], { env: { PATH: '/usr/bin:/bin' }, timeoutMs: 8000 }))
                .toMatchObject({ code: 0, stdout: '', aborted: false, timedOut: false });
        }
        const literal = '$(not-a-command); `not-a-command` spaces';
        expect((await runCapture('/usr/bin/printf', ['%s', literal], { env: { PATH: '/usr/bin:/bin' } })).stdout)
            .toBe(literal);
        expect((await runCapture('/bin/cat', [], { env: { PATH: '/usr/bin:/bin' }, input: 'stdin stays separate\n' })).stdout)
            .toBe('stdin stays separate\n');
    }, 30000);
    test.each(['wrong-nonce\n', null])('wrong nonce or EOF never executes the target: %s', async (control) => {
        const nonce = 'a'.repeat(64);
        const launch = gatedLaunch('/bin/echo', ['target-executed'], { PATH: '/usr/bin:/bin' }, nonce);
        const proc = spawn(launch.binary, launch.args, { env: launch.env,
            stdio: ['pipe', 'pipe', 'pipe', 'pipe'], shell: false, detached: true });
        const lifecycle = createChildLifecycle(proc, { expectedUid: process.getuid(), launchGate: true });
        let output = '';
        proc.stdout.on('data', (bytes) => { output += bytes.toString(); });
        const closed = new Promise((resolve, reject) => { proc.once('close', resolve); proc.once('error', reject); });
        try {
            await lifecycle.readyForLaunch(process.getuid());
            proc.stdio[3].end(control ?? undefined);
            expect(await closed).toBe(125);
            await lifecycle.stop();
            expect(output).toBe('');
        } finally { await lifecycle.stop(); }
    }, 15000);
});

describe('Claude isolation availability', () => {
    test('versions and a signed-in account cannot bypass unverified confinement', async () => {
        expect(claudeIsolationStatus('2.1.247')).toMatchObject({ available: false });
        expect(claudeIsolationStatus('2.1.248')).toMatchObject({ available: false });
        const events = [];
        await startClaude({ request: { streamId: 'blocked', isolationVerified: true },
            emit: (event) => events.push(event) });
        expect(events.at(-1).payload.code).toBe('claude_isolation_unverified');
    });
    test('dormant launch policy excludes settings, command tools, MCP and hooks', () => {
        const args = buildArgs({});
        expect(args).toContain('--restricted');
        expect(args).toContain('--safe-mode');
        expect(args[args.indexOf('--setting-sources') + 1]).toBe('');
        expect(args[args.indexOf('--tools') + 1]).toBe('Read,Glob,Grep,Edit,Write');
        expect(args).toContain('{"disableAllHooks":true}');
        expect(args).toContain('mcp__*');
    });
});
