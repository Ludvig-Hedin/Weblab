import { describe, expect, test } from 'bun:test';
import type { EditorEngine } from '../engine';
import type { BranchDisposalPreparation } from '../branch/manager';
import type { UpdateStyleAction } from '@weblab/models/actions';
import { StyleChangeType } from '@weblab/models/style';
import { ActionManager } from './index';

type Outcome = 'applied' | 'no-source';
function deferred() {
    let resolve!: (value: Outcome) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<Outcome>((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
}

function fixture() {
    let branchId = 'a';
    let empty = false;
    const writes: Array<{ branchId?: string; getHistoryLease?: () => unknown; job: ReturnType<typeof deferred> }> = [];
    const engine = {
        branches: { hasActiveBranch: true, get activeBranch() { return { id: branchId }; } },
        style: {
            breakpointMapFor: () => empty ? {} : { mobile: 'red' },
            removedBreakpointMapFor: () => ({}),
        },
        code: { writeResponsiveStyleNow: (args: { branchId?: string; getHistoryLease?: () => unknown }) => {
            const job = deferred();
            writes.push({ ...args, job });
            return job.promise;
        } },
    } as unknown as EditorEngine;
    const manager = new ActionManager(engine);
    return { manager, writes, setBranch: (next: string) => { branchId = next; },
        emptyMaps: () => { empty = true; } };
}

async function start(f: ReturnType<typeof fixture>, property = 'color') {
    f.manager.requestSourceRebase('same-oid', property);
    f.manager.flushPendingRebases();
    await Promise.resolve();
    return f.writes.at(-1)!.job;
}

describe('responsive source recovery', () => {
    test('a rejected write refuses strict disposal after bookkeeping, and a confirmed retry clears it', async () => {
        const f = fixture();
        (await start(f)).reject(new Error('disk refused'));
        await expect(f.manager.flushAndWaitForPendingRebases()).rejects.toThrow('could not finish saving');
        expect(f.manager.hasPendingRebases).toBe(true);
        (await start(f)).resolve('applied');
        await f.manager.flushAndWaitForPendingRebases();
        expect(f.manager.hasPendingRebases).toBe(false);
    });

    test('an older success cannot clear a newer failure', async () => {
        const f = fixture();
        const old = await start(f);
        const newer = await start(f);
        newer.reject(new Error('new edit refused'));
        old.resolve('applied');
        await expect(f.manager.flushAndWaitForPendingRebases()).rejects.toThrow('could not finish saving');
    });

    test('a later scheduled intent supersedes an old success before its timer starts', async () => {
        const f = fixture();
        const old = await start(f);
        f.manager.requestSourceRebase('same-oid', 'color');
        old.resolve('applied');
        const draining = f.manager.flushAndWaitForPendingRebases();
        while (f.writes.length < 2) await Promise.resolve();
        f.writes[1]!.job.reject(new Error('scheduled edit refused'));
        await expect(draining).rejects.toThrow('could not finish saving');
    });

    test('an older late failure cannot invalidate a confirmed newest write', async () => {
        const f = fixture();
        const old = await start(f);
        const newer = await start(f);
        newer.resolve('applied');
        await Promise.resolve();
        old.reject(new Error('old acknowledgement refused'));
        await f.manager.flushAndWaitForPendingRebases();
        expect(f.manager.hasPendingRebases).toBe(false);
    });

    test('empty maps and fulfilled no-source outcomes cannot erase a refused write', async () => {
        const f = fixture();
        (await start(f)).reject(new Error('refused'));
        await expect(f.manager.flushAndWaitForPendingRebases()).rejects.toThrow();
        (await start(f)).resolve('no-source');
        await expect(f.manager.flushAndWaitForPendingRebases()).rejects.toThrow();
        f.emptyMaps();
        f.manager.requestSourceRebase('same-oid', 'color');
        await expect(f.manager.flushAndWaitForPendingRebases()).rejects.toThrow();
        expect(f.writes).toHaveLength(2);
    });

    test('two branches with the same element and canonical property keep separate timers and failures', async () => {
        const f = fixture();
        f.manager.requestSourceRebase('same-oid', 'backgroundColor');
        f.manager.requestSourceRebase('same-oid', 'background-color');
        f.setBranch('b');
        f.manager.requestSourceRebase('same-oid', 'background-color');
        f.manager.flushPendingRebases();
        expect(f.writes.map((entry) => entry.branchId)).toEqual(['a', 'b']);
        f.writes[0]!.job.reject(new Error('a refused'));
        f.writes[1]!.job.resolve('applied');
        await expect(f.manager.flushAndWaitForPendingRebases()).rejects.toThrow();
    });

    test('strict drain waits for every other write before reporting a refusal', async () => {
        const f = fixture();
        const first = await start(f);
        f.setBranch('b');
        const second = await start(f);
        let finished = false;
        const draining = f.manager.flushAndWaitForPendingRebases().catch(() => { finished = true; });
        first.reject(new Error('a refused'));
        await Promise.resolve();
        await Promise.resolve();
        expect(finished).toBe(false);
        second.resolve('applied');
        await draining;
        expect(finished).toBe(true);
    });

    test('preparation owner supplies the lease to an already running job and blocks new public requests', async () => {
        const f = fixture();
        const running = await start(f);
        const lease = { owner: Symbol('lease') };
        const preparation = { getHistoryLease: (branch: string) => branch === 'a' ? lease : undefined } as BranchDisposalPreparation;
        f.manager.beginDisposalPreparation(preparation);
        expect(f.writes[0]!.getHistoryLease?.()).toBe(lease);
        expect(() => f.manager.requestSourceRebase('late', 'color')).toThrow();
        running.resolve('applied');
        await f.manager.flushAndWaitForPendingRebases(preparation);
        f.manager.cancelDisposalPreparation(preparation);
        expect(f.manager.hasPendingRebases).toBe(false);
    });

    test('Undo of a later breakpoint edit cannot clear an aggregate responsive refusal', async () => {
        const f = fixture();
        (await start(f)).reject(new Error('refused'));
        await expect(f.manager.flushAndWaitForPendingRebases()).rejects.toThrow();
        const inverse: UpdateStyleAction = { type: 'update-style', targets: [{
            oid: 'same-oid', branchId: 'a', domId: 'dom', frameId: 'frame',
            breakpoint: { id: 'another-breakpoint', name: 'Desktop', minWidth: 1024 },
            change: { original: { color: { value: 'red', type: StyleChangeType.Value } },
                updated: { color: { value: 'blue', type: StyleChangeType.Value } } },
        }] };
        const engine = (f.manager as unknown as { editorEngine: EditorEngine }).editorEngine;
        Object.assign(engine, { history: { undo: async () => ({ inverse, redoEntry: inverse, externalRevision: null }),
            confirmSourceReplay: async () => undefined }, posthog: { capture: () => undefined } });
        Object.assign(engine.code, { write: async () => true });
        // A normal Undo receipt cannot prove the complete failed property map landed.
        Object.assign(f.manager, { dispatchHistoryAction: async () => undefined });
        await f.manager.undo();
        await expect(f.manager.flushAndWaitForPendingRebases()).rejects.toThrow('could not finish saving');
        expect(f.manager.hasPendingRebases).toBe(true);
    });
});
