import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { Action, UpdateStyleAction } from '@weblab/models/actions';

import { HistoryManager } from './index';
import { CodeManager } from '../code';
import type { EditorEngine } from '../engine';
import { StyleChangeType } from '@weblab/models/style';
import { transformRedoAction, reverseWriteCodeAction } from './helpers';

let saved: { undoStack: Action[]; redoStack: Action[]; sourceVersion?: string } | null = null;
let clears = 0;
let loading: Promise<void> | undefined;

void mock.module('./storage', () => ({
    loadHistory: async () => { await loading; return saved; },
    saveHistory: async (_branchId: string, undoStack: Action[], redoStack: Action[], sourceVersion?: string) => {
        saved = { undoStack, redoStack, sourceVersion };
    },
    clearHistory: async () => { clears += 1; },
}));

const action: Action = {
    type: 'edit-text',
    targets: [{ domId: 'dom-1', oid: 'oid-1', frameId: 'frame-1', branchId: 'branch-1' }],
    originalContent: 'before',
    newContent: 'after',
};

type Engine = ConstructorParameters<typeof HistoryManager>[0];

function manager(write: (action: Action) => Promise<boolean>): HistoryManager {
    return new HistoryManager({
        code: { write, waitForPendingWrites: async () => undefined },
        posthog: { capture: () => undefined },
    } as unknown as Engine, 'local-branch');
}

beforeEach(() => {
    saved = null;
    clears = 0;
    loading = undefined;
});

describe('local undo source version', () => {
    test('a verified preparation mirror handoff remains strictly saveable without clearing history', async () => {
        let version = JSON.stringify([['index.html', 'old']]);
        let revision = 'mirror-1:0';
        const history = manager(async () => true);
        history.setSourceVersion(() => version, () => revision, () => revision);
        await history.hydrate();
        const lease = history.beginDisposalPreparation();
        const before = history.captureEmptySourcePreparation(lease);
        version = JSON.stringify([['index.html', 'prepared']]);
        revision = 'mirror-2:0';
        history.completeEmptySourcePreparation(lease, before, version);
        await history.flushForDisposal(lease);
        history.cancelDisposalPreparation(lease);
        expect(saved?.sourceVersion).toBe(version);
        expect(clears).toBe(0);
    });

    test('preparation refuses history hydration that is still pending', async () => {
        let finish!: () => void;
        loading = new Promise<void>((resolve) => { finish = resolve; });
        const history = manager(async () => true);
        history.setSourceVersion(() => 'snapshot', () => 'mirror-1:0', () => 'mirror-1:0');
        const hydration = history.hydrate();
        const lease = history.beginDisposalPreparation();
        expect(() => history.captureEmptySourcePreparation(lease)).toThrow('settled editor');
        finish();
        await hydration;
        expect(history.captureEmptySourcePreparation(lease).sourceVersion).toBe('snapshot');
        history.cancelDisposalPreparation(lease);
    });

    test('preparation keeps existing recovery actions and rejects stale leases and changed source generations', async () => {
        const history = manager(async () => true);
        history.setSourceVersion(() => 'snapshot', () => 'mirror-1:0', () => 'mirror-1:0');
        await history.hydrate();
        await history.push(action);
        let lease = history.beginDisposalPreparation();
        expect(() => history.captureEmptySourcePreparation(lease)).toThrow('empty history');
        history.cancelDisposalPreparation(lease);
        expect(history.length).toBe(1);
        expect(clears).toBe(0);

        saved = null;
        const empty = manager(async () => true);
        empty.setSourceVersion(() => 'snapshot', () => 'mirror-1:0', () => 'mirror-1:0');
        await empty.hydrate();
        lease = empty.beginDisposalPreparation();
        const before = empty.captureEmptySourcePreparation(lease);
        empty.cancelDisposalPreparation(lease);
        const replacement = empty.beginDisposalPreparation();
        expect(() => empty.completeEmptySourcePreparation(lease, before, 'snapshot')).toThrow('owner changed');
        empty.setSourceVersion(() => 'snapshot', () => 'mirror-2:0', () => 'mirror-2:0');
        expect(() => empty.completeEmptySourcePreparation(replacement, before, 'snapshot')).toThrow('history changed');
        empty.cancelDisposalPreparation(replacement);
    });

    test('hydrates only against the same disk source', async () => {
        saved = { undoStack: [action], redoStack: [], sourceVersion: 'disk-v1' };
        const current = manager(async () => true);
        current.setSourceVersion(() => 'disk-v1', () => 'mirror-1:0', () => 'mirror-1:0');
        await current.hydrate();
        expect(current.canUndo).toBe(true);

        const changed = manager(async () => true);
        changed.setSourceVersion(() => 'disk-v2', () => 'mirror-2:0', () => 'mirror-2:0');
        await changed.hydrate();
        expect(changed.canUndo).toBe(false);
        expect(clears).toBe(1);
    });

    test('external source changes invalidate same-session undo', async () => {
        let sourceVersion = 'disk-v1';
        let externalRevision = 'mirror-1:0';
        let ownRevision = 'mirror-1:0';
        const history = manager(async () => {
            sourceVersion = 'disk-v2';
            ownRevision = 'mirror-1:1';
            return true;
        });
        history.setSourceVersion(() => sourceVersion, () => externalRevision, () => ownRevision);
        await history.push(action);
        expect(history.canUndo).toBe(true);

        sourceVersion = 'external-v3';
        externalRevision = 'mirror-1:1';
        expect(await history.undo()).toBeNull();
        expect(history.canUndo).toBe(false);
        expect(clears).toBe(1);
    });

    test('a delayed Weblab source rebase keeps the action undoable', async () => {
        let sourceVersion = 'disk-v1';
        let ownRevision = 'mirror-1:0';
        const history = manager(async () => {
            sourceVersion = 'disk-v2';
            ownRevision = 'mirror-1:1';
            return true;
        });
        history.setSourceVersion(
            () => sourceVersion,
            () => 'mirror-1:0',
            () => ownRevision,
        );
        await history.push(action);

        sourceVersion = 'disk-v3';
        ownRevision = 'mirror-1:2';
        await history.noteOwnSourceWrite();
        expect(await history.undo()).not.toBeNull();
    });

    test('a code editor save outside history invalidates older undo actions', async () => {
        let ownRevision = 'mirror-1:0';
        const history = manager(async () => {
            ownRevision = 'mirror-1:1';
            return true;
        });
        history.setSourceVersion(() => ownRevision, () => 'mirror-1:0', () => ownRevision);
        await history.push(action);

        ownRevision = 'mirror-1:2';
        expect(await history.undo()).toBeNull();
        expect(history.canUndo).toBe(false);
    });

    test('dispose waits for a pending source write before storing its final version', async () => {
        let finishWrite: (() => void) | undefined;
        let sourceVersion = 'disk-v1';
        let ownRevision = 'mirror-1:0';
        const history = manager(async () => {
            await new Promise<void>((resolve) => { finishWrite = resolve; });
            sourceVersion = 'disk-v2';
            ownRevision = 'mirror-1:1';
            return true;
        });
        history.setSourceVersion(() => sourceVersion, () => 'mirror-1:0', () => ownRevision);
        const pushing = history.push(action);
        for (let i = 0; i < 3 && !finishWrite; i++) await Promise.resolve();
        expect(finishWrite).toBeDefined();
        const disposing = history.dispose();
        finishWrite?.();
        await pushing;
        await disposing;
        expect(saved?.sourceVersion).toBe('disk-v2');
        expect(saved?.undoStack).toHaveLength(1);
    });
});

function sourceFixture() {
    let beforeWrite: ((path: string) => Promise<void>) | undefined;
    const metadata = new Map<string, string>([['element', '<div data-oid="element" className="p-2">Hi</div>']]);
    const filesA = new Map<string, string>([
        ['globals.css', '@theme { --color-brand: blue; }\n'],
        ['page.tsx', 'export default function Page(){return <div data-oid="element" className="p-2">Hi</div>}\n'],
        ['block.css', 'before'],
    ]);
    const filesB = new Map(filesA);
    const filesystem = (files: Map<string, string>) => ({
        readFile: async (path: string) => files.get(path) ?? '',
        writeFile: async (path: string, content: string) => { await beforeWrite?.(path); files.set(path, content); },
        getJsxElementMetadata: async (oid: string) => ({ path: 'page.tsx', code: metadata.get(oid) ?? '' }),
    });
    const fsA = filesystem(filesA);
    const fsB = filesystem(filesB);
    const dataA = { branch: { id: 'a', runtime: { type: 'local' } }, codeEditor: fsA, history: null as HistoryManager | null };
    const dataB = { branch: { id: 'b', runtime: { type: 'local' } }, codeEditor: fsB, history: null as HistoryManager | null };
    let activeId = 'a';
    let scans = 0;
    const engine = {
        framework: 'nextjs',
        branches: {
            get activeBranch() { return activeId === 'a' ? dataA.branch : dataB.branch; },
            getBranchDataById: (id: string) => id === 'a' ? dataA : dataB,
            activeError: { addCodeApplicationError: () => undefined },
        },
        action: { flushPendingRebases: () => undefined },
        tokens: { scan: async () => { scans++; } },
        posthog: { capture: () => undefined },
    } as unknown as EditorEngine;
    const code = new CodeManager(engine);
    Object.defineProperty(engine, 'code', { value: code });
    const history = new HistoryManager(engine, 'a');
    dataA.history = history;
    dataB.history = new HistoryManager(engine, 'b');
    return { code, history, filesA, filesB, metadata, setBeforeWrite: (hook: (path: string) => Promise<void>) => { beforeWrite = hook; }, scans: () => scans, switchBranch: () => { activeId = 'b'; } };
}

describe('exact source history', () => {
    test('reset replay retains source branch, token refresh and typed preview inversion', () => {
        const previewStyle: UpdateStyleAction = { type: 'update-style', targets: [{
            oid: 'element', domId: 'dom', branchId: 'a', frameId: 'frame',
            breakpoint: { id: 'desktop', name: 'Desktop', minWidth: 1200 },
            change: {
                original: { color: { value: 'brand', type: StyleChangeType.Custom } },
                updated: { color: { value: '', type: StyleChangeType.Remove } },
            },
        }] };
        const source = { type: 'write-code' as const, branchId: 'a', refreshTokens: true, previewStyle,
            diffs: [{ path: 'page.tsx', original: 'before', generated: 'after' }] };
        const undo = reverseWriteCodeAction(source);
        expect(undo.previewStyle?.targets[0]?.change.updated.color?.type).toBe(StyleChangeType.Custom);
        const redo = transformRedoAction(source);
        if (redo.type !== 'write-code') throw new Error('Expected source replay');
        expect(redo.branchId).toBe('a');
        expect(redo.refreshTokens).toBe(true);
        expect(redo.previewStyle?.targets[0]?.change.updated.color?.type).toBe(StyleChangeType.Remove);
        expect(redo.diffs).toEqual(source.diffs);
        expect(redo.previewStyle).not.toBe(source.previewStyle);
    });

    test('preflights every selected source before permitting a style change', async () => {
        const fixture = sourceFixture();
        fixture.metadata.set('dynamic', '<div data-oid="dynamic" className={cn("p-2", active && "p-4")} />');
        const action: UpdateStyleAction = { type: 'update-style', targets: ['element', 'dynamic'].map((oid) => ({
            oid, domId: oid, branchId: 'a', frameId: 'frame', change: { original: {}, updated: {} },
        })) };
        const before = fixture.filesA.get('page.tsx');
        await expect(fixture.code.preflightStyleAction(action)).rejects.toThrow('Dynamic classes');
        expect(fixture.filesA.get('page.tsx')).toBe(before);
        expect(fixture.history.length).toBe(0);
        fixture.code.clear();
        await fixture.history.dispose();
    });

    test('Redo retains branch and token refresh metadata and refuses external changes', async () => {
        const fixture = sourceFixture();
        const original = fixture.filesA.get('globals.css')!;
        await fixture.code.saveSourceDiffs('a', [{ path: 'globals.css', original, generated: 'saved' }], true);
        const undo = await fixture.history.undo();
        expect(await fixture.code.write(undo!.inverse)).toBe(true);
        fixture.switchBranch();
        const redo = await fixture.history.redo();
        expect(redo!.forward.type).toBe('write-code');
        if (redo!.forward.type !== 'write-code') throw new Error('Expected source replay');
        expect(redo!.forward.branchId).toBe('a');
        expect(redo!.forward.refreshTokens).toBe(true);
        fixture.filesA.set('globals.css', 'external edit');
        expect(await fixture.code.write(redo!.forward)).toBe(false);
        fixture.history.rollbackRedo(redo!.forward, redo!.redoEntry);
        expect(fixture.history.canRedo).toBe(true);
        expect(fixture.filesA.get('globals.css')).toBe('external edit');
        expect(fixture.filesB.get('globals.css')).toBe(original);
        fixture.code.clear();
        await fixture.history.dispose();
    });

    test('metadata changes undo to the original bytes and preserve older token history', async () => {
        const fixture = sourceFixture();
        const originalCss = fixture.filesA.get('globals.css')!;
        const originalPage = fixture.filesA.get('page.tsx')!;
        await fixture.code.saveSourceDiffs('a', [{ path: 'globals.css', original: originalCss, generated: originalCss.replace('blue', 'red') }], true);
        await fixture.code.updateElementMetadata({ oid: 'element', branchId: 'a', attributes: { className: 'p-4' }, overrideClasses: true });
        expect(fixture.history.length).toBe(2);
        const undoMetadata = await fixture.history.undo();
        expect(undoMetadata).not.toBeNull();
        expect(await fixture.code.write(undoMetadata!.inverse)).toBe(true);
        expect(fixture.filesA.get('page.tsx')).toBe(originalPage);
        const redoMetadata = await fixture.history.redo();
        expect(await fixture.code.write(redoMetadata!.forward)).toBe(true);
        expect(fixture.filesA.get('page.tsx')).toContain('p-4');
        fixture.code.clear();
        await fixture.history.dispose();
    });

    test('initial save and Undo refuse newer contents without touching the token registry', async () => {
        const fixture = sourceFixture();
        const before = fixture.filesA.get('globals.css')!;
        await fixture.code.saveSourceDiffs('a', [{ path: 'globals.css', original: before, generated: 'saved' }], true);
        expect(fixture.scans()).toBe(1);
        fixture.filesA.set('globals.css', 'external edit');
        await expect(fixture.code.saveSourceDiffs('a', [{ path: 'globals.css', original: 'saved', generated: 'stale overwrite' }], true)).rejects.toThrow('could not be saved');
        expect(fixture.history.length).toBe(1);
        expect(fixture.scans()).toBe(1);
        const replay = await fixture.history.undo();
        expect(await fixture.code.write(replay!.inverse)).toBe(false);
        fixture.history.rollbackUndo(replay!.redoEntry);
        expect(fixture.history.canUndo).toBe(true);
        expect(fixture.filesA.get('globals.css')).toBe('external edit');
        expect(fixture.scans()).toBe(1);
        fixture.code.clear();
        await fixture.history.dispose();
    });

    test('a queued save and its replay keep the captured source branch', async () => {
        const fixture = sourceFixture();
        let release!: () => void;
        let started!: () => void;
        const blocked = new Promise<void>((resolve) => { release = resolve; });
        const startedWriting = new Promise<void>((resolve) => { started = resolve; });
        fixture.setBeforeWrite(async (path) => {
            if (path === 'block.css') { started(); await blocked; }
        });
        const first = fixture.code.write({ type: 'write-code', branchId: 'a', diffs: [{ path: 'block.css', original: 'before', generated: 'after' }] });
        await startedWriting;
        const original = fixture.filesA.get('globals.css')!;
        const queued = fixture.code.saveSourceDiffs('a', [{ path: 'globals.css', original, generated: 'branch a edit' }]);
        fixture.switchBranch();
        release();
        await first;
        await queued;
        expect(fixture.filesA.get('globals.css')).toBe('branch a edit');
        expect(fixture.filesB.get('globals.css')).toBe(original);
        const undo = await fixture.history.undo();
        expect(await fixture.code.write(undo!.inverse)).toBe(true);
        expect(fixture.filesA.get('globals.css')).toBe(original);
        expect(fixture.filesB.get('globals.css')).toBe(original);
        fixture.code.clear();
        await fixture.history.dispose();
    });
});
