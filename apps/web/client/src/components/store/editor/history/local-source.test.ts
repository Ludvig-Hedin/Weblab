import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { Action } from '@weblab/models/actions';

import { HistoryManager } from './index';

let saved: { undoStack: Action[]; redoStack: Action[]; sourceVersion?: string } | null = null;
let clears = 0;

void mock.module('./storage', () => ({
    loadHistory: async () => saved,
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
});

describe('local undo source version', () => {
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
