import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireJournalLease, recoverDeadJournalLock, parseIgnoredPaths, gitIgnoredPaths,
    withCliTurnMarker, checkCliCleanup } from './weblab-local.js';

const nonce = '11111111-1111-4111-8111-111111111111';
const ownTable = async () => new Map([[process.pid, { pid: process.pid, start: 'current-start' }]]);
const owner = { version: 1, pid: 123456, processStart: 'old-start', nonce };

async function withDirectory(run) {
    const dir = await mkdtemp(join(tmpdir(), 'weblab-journal-policy-'));
    try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

describe('journal lease ownership', () => {
    test('publishes complete metadata, blocks a live owner and releases its own lock', async () => {
        await withDirectory(async (dir) => {
            const release = await acquireJournalLease(dir, ownTable);
            expect(JSON.parse(await readFile(join(dir, 'write-journal.lock'), 'utf8')))
                .toMatchObject({ pid: process.pid, processStart: 'current-start', version: 1 });
            await expect(acquireJournalLease(dir, ownTable)).rejects.toThrow('progress');
            await release();
            await expect(readFile(join(dir, 'write-journal.lock'))).rejects.toMatchObject({ code: 'ENOENT' });
        });
    });
    test('recovers dead owners including a reused PID with a different start', async () => {
        await withDirectory(async (dir) => {
            const lock = join(dir, 'write-journal.lock');
            await writeFile(lock, JSON.stringify(owner), { mode: 0o600 });
            await recoverDeadJournalLock(lock, async () => new Map([[owner.pid, { pid: owner.pid, start: 'new-start' }]]));
            await expect(readFile(lock)).rejects.toMatchObject({ code: 'ENOENT' });
        });
    });
    test('legacy empty, malformed and symlink locks stay untouched', async () => {
        await withDirectory(async (dir) => {
            const lock = join(dir, 'write-journal.lock');
            for (const bytes of ['', '{}', 'not-json']) {
                await writeFile(lock, bytes, { mode: 0o600 });
                await expect(recoverDeadJournalLock(lock, ownTable)).rejects.toThrow();
                expect(await readFile(lock, 'utf8')).toBe(bytes);
            }
            await rm(lock); const outside = join(dir, 'outside');
            await writeFile(outside, JSON.stringify(owner), { mode: 0o600 }); await symlink(outside, lock);
            await expect(recoverDeadJournalLock(lock, ownTable)).rejects.toThrow();
            expect(await readFile(outside, 'utf8')).toBe(JSON.stringify(owner));
        });
    });
    test('a lock replaced during owner inspection is never removed', async () => {
        await withDirectory(async (dir) => {
            const lock = join(dir, 'write-journal.lock');
            await writeFile(lock, JSON.stringify(owner), { mode: 0o600 });
            await expect(recoverDeadJournalLock(lock, async () => {
                await rm(lock); await writeFile(lock, JSON.stringify({ ...owner, nonce: '22222222-2222-4222-8222-222222222222' }), { mode: 0o600 });
                return new Map();
            })).rejects.toThrow('changed');
            expect(JSON.parse(await readFile(lock, 'utf8')).nonce).not.toBe(nonce);
        });
    });
});

describe('ignore discovery', () => {
    const paths = ['app/page.tsx', '.env.new'];
    test('accepts Git exit 1 with no ignored paths and exact NUL-delimited ignored paths', () => {
        expect(parseIgnoredPaths({ code: 1, stdout: '' }, paths)).toEqual(new Set());
        expect(parseIgnoredPaths({ code: 0, stdout: '.env.new\0' }, paths)).toEqual(new Set(['.env.new']));
    });
    test('unknown, malformed, truncated and unsubmitted output cannot authorize journaling', () => {
        for (const result of [{ code: 128, stdout: '' }, { code: 0, stdout: '.env.new' },
            { code: 0, stdout: 'other\0' }, { code: 0, stdout: '.env.new\0.env.new\0' },
            { code: 1, stdout: '.env.new\0' }, { code: 0, stdout: '.env.new\0', timedOut: true },
            { code: 0, stdout: '.env.new\0', truncated: true }]) {
            expect(parseIgnoredPaths(result, paths)).toBeNull();
        }
    });
    test('the probe is bounded and cancellation/input reach the process helper', async () => {
        const abort = new AbortController(); let options;
        const ignored = await gitIgnoredPaths('/private', paths, { signal: abort.signal,
            capture: async (_binary, _args, opts) => { options = opts; return { code: 1, stdout: '' }; } });
        expect(ignored.size).toBe(0);
        expect(options.signal).toBe(abort.signal);
        expect(options.timeoutMs).toBe(8000);
        expect(options.input).toBe('app/page.tsx\0.env.new\0');
    });
});

describe('durable AI turn ownership', () => {
    test('captured identities recover only after every matching process is proven dead', async () => {
        await withDirectory(async (dir) => {
            const file = join(dir, 'cli-cleanup.json');
            const root = join(dir, 'project');
            const record = { version: 1, copyId: dir.split('/').at(-1), unobserved: false,
                identities: [{ pid: 123456, start: 'owned-start' }] };
            await writeFile(file, JSON.stringify(record), { mode: 0o600 });
            await expect(checkCliCleanup(root, dir, { readTable: async () =>
                new Map([[123456, { pid: 123456, start: 'owned-start' }]]) })).rejects.toThrow('still running');
            await checkCliCleanup(root, dir, { readTable: async () =>
                new Map([[123456, { pid: 123456, start: 'reused-pid-start' }]]) });
            await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' });
        });
    });
    test('publishes before work, survives a mid-turn failure and blocks restart despite owner death', async () => {
        await withDirectory(async (dir) => {
            const root = join(dir, 'project');
            await expect(withCliTurnMarker(root, dir, dir.split('/').at(-1), async () => {
                const marker = JSON.parse(await readFile(join(dir, 'cli-cleanup.json'), 'utf8'));
                expect(marker).toMatchObject({ status: 'active', unobserved: true });
                expect(marker.owner).toMatchObject({ pid: process.pid, start: 'current-start' });
                // No AsyncLocalStorage ownership in a later app session.
                throw new Error('simulated crash');
            }, { readTable: ownTable })).rejects.toMatchObject({ code: 'cleanup_unconfirmed' });
            const file = join(dir, 'cli-cleanup.json');
            const marker = JSON.parse(await readFile(file, 'utf8'));
            marker.owner = { pid: 123456, start: 'dead-app-start' };
            await writeFile(file, JSON.stringify(marker), { mode: 0o600 });
            await expect(checkCliCleanup(root, dir)).rejects.toThrow('manual recovery');
            expect(JSON.parse(await readFile(join(dir, 'cli-cleanup.json'), 'utf8')).status).toBe('active');
        });
    });
    test('only the active turn context can use its paused copy while journaling', async () => {
        await withDirectory(async (dir) => {
            const root = join(dir, 'project');
            await withCliTurnMarker(root, dir, dir.split('/').at(-1), async () => {
                await checkCliCleanup(root, dir);
                // The journal path runs within the same AsyncLocalStorage owner.
            }, { readTable: ownTable });
        });
    });
    test('failed persistence launches nothing and remains blocked in app memory', async () => {
        await withDirectory(async (dir) => {
            let ran = false; const root = join(dir, 'project');
            await expect(withCliTurnMarker(root, dir, dir.split('/').at(-1), async () => { ran = true; }, {
                readTable: ownTable, persist: async () => { throw new Error('disk full'); },
            })).rejects.toThrow('disk full');
            expect(ran).toBe(false);
            await expect(checkCliCleanup(root, dir)).rejects.toThrow('recovery');
        });
    });
    test('malformed ownership cannot be removed after an otherwise completed turn', async () => {
        await withDirectory(async (dir) => {
            const root = join(dir, 'project');
            await expect(withCliTurnMarker(root, dir, dir.split('/').at(-1), async () => {
                await writeFile(join(dir, 'cli-cleanup.json'), 'malformed', { mode: 0o600 });
            }, { readTable: ownTable })).rejects.toMatchObject({ code: 'cleanup_unconfirmed' });
            expect(await readFile(join(dir, 'cli-cleanup.json'), 'utf8')).toBe('malformed');
            await expect(checkCliCleanup(root, dir)).rejects.toThrow();
        });
    });
    test('ownership remains until journaling completes, then is removed', async () => {
        await withDirectory(async (dir) => {
            await withCliTurnMarker(join(dir, 'project'), dir, dir.split('/').at(-1), async () => {
                expect(JSON.parse(await readFile(join(dir, 'cli-cleanup.json'), 'utf8')).status).toBe('active');
                await Promise.resolve(); // represents the awaited journal commit
            }, { readTable: ownTable });
            await expect(readFile(join(dir, 'cli-cleanup.json'))).rejects.toMatchObject({ code: 'ENOENT' });
        });
    });
});
