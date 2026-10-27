import { describe, expect, it, mock } from 'bun:test';
import type { EditorEngine } from '../engine';
import type { CloudPropertyApproval, WriteCodeAction } from '@weblab/models/actions';
import { CodeManager } from '../code';
import { HistoryManager } from '../history';
import { propertyFixture, propertyPin, propertyAction, propertyOriginal } from '../sandbox/cloud-property-approval.test';
import { ActionManager } from './index';

mock.module('../history/storage', () => ({ loadHistory: async () => null, saveHistory: async () => undefined, clearHistory: async () => undefined }));

async function fixture() {
    const f = await propertyFixture();
    const branch = { branch: { id: propertyPin.branchId, runtime: { type: 'cloud', cloud: { sourceVersion: 1 } } },
        sandbox: { cloudSource: f.source }, codeEditor: f.fs, history: null as HistoryManager | null };
    class PropertyEngine {
        branches = { hasActiveBranch: true, activeBranchData: branch,
            getBranchDataById: (id: string) => id === propertyPin.branchId ? branch : null,
            activeError: { addCodeApplicationError: () => undefined } };
        code: CodeManager | null = null;
        history: HistoryManager | null = null;
        posthog = { capture: () => undefined };
        isClosing = false;
    }
    const engine = new PropertyEngine();
    const code = new CodeManager(engine as unknown as EditorEngine); engine.code = code;
    f.watchLocalWork(() => code.hasPendingWrites);
    const history = new HistoryManager(engine as unknown as EditorEngine, propertyPin.branchId); branch.history = history; engine.history = history;
    const manager = new ActionManager(engine as unknown as EditorEngine);
    return { ...f, branch, engine, code, history, manager, close: async () => { await history.dispose(); await f.source.stop(); } };
}
const choose = (f: Awaited<ReturnType<typeof fixture>>) => f.manager.editApprovedProperty({ pin: propertyPin,
    previousValue: '/about', choiceId: 'contact', expectedRevision: 1, current: () => true });
function frozen(pin: CloudPropertyApproval) {
    expect(Object.isFrozen(pin)).toBe(true); expect(Object.isFrozen(pin.binding)).toBe(true);
    expect(Object.isFrozen(pin.binding.target)).toBe(true); expect(Object.isFrozen(pin.binding.options)).toBe(true);
    for (const option of pin.binding.options) expect(Object.isFrozen(option)).toBe(true);
}

describe('approved property action, writer and history', () => {
    it('keeps approval immutable and rebuilds Undo and Redo around later text', async () => {
        const f = await fixture();
        try {
            expect(await choose(f)).toBe(true); expect(f.history.canUndo).toBe(true);
            frozen(((Reflect.get(f.history, 'undoStack') as WriteCodeAction[]).at(-1)!).cloudProperty!.pin);
            f.setContent(f.content().replace('Later text stays', 'Later authored text'));
            await f.manager.undo(); expect(f.history.canRedo).toBe(true);
            expect(f.content()).toBe(propertyOriginal.replace('Later text stays', 'Later authored text'));
            await f.manager.redo(); expect(f.history.canUndo).toBe(true);
            expect(f.content()).toBe(propertyAction.diffs[0]!.generated.replace('Later text stays', 'Later authored text'));
            frozen(((Reflect.get(f.history, 'undoStack') as WriteCodeAction[]).at(-1)!).cloudProperty!.pin);
            expect(f.sent).toHaveLength(3); expect(new Set(f.sent.map(operation => operation.operationId)).size).toBe(3);
        } finally { await f.close(); }
    });
    it.each(['source', 'editor', 'history', 'close'] as const)('refuses initiating %s drift before property admission', async kind => {
        const f = await fixture(), originalSource = f.branch.sandbox.cloudSource, originalEditor = f.branch.codeEditor;
        f.onRead(async () => {
            if (kind === 'source') f.branch.sandbox.cloudSource = { ...originalSource } as typeof originalSource;
            if (kind === 'editor') f.branch.codeEditor = { ...originalEditor } as typeof originalEditor;
            if (kind === 'history') f.branch.history = {} as HistoryManager;
            if (kind === 'close') f.engine.isClosing = true;
        });
        try { expect(await choose(f)).toBe(false); expect(f.sent).toHaveLength(0); expect(f.history.canUndo).toBe(false); }
        finally { f.branch.sandbox.cloudSource = originalSource; f.branch.codeEditor = originalEditor; f.branch.history = f.history;
            f.engine.isClosing = false; await f.close(); }
    });
    it('refuses mixed CSS authority and unapproved semantic values without writing', async () => {
        const f = await fixture();
        try {
            const mixed = structuredClone(propertyAction); mixed.cssModuleStyle = {} as NonNullable<WriteCodeAction['cssModuleStyle']>;
            expect(await f.code.write(mixed)).toBe(false);
            const unapproved = structuredClone(propertyAction); unapproved.cloudProperty = { ...unapproved.cloudProperty!, value: 'javascript:bad' };
            expect(await f.code.write(unapproved)).toBe(false); expect(f.sent).toHaveLength(0); expect(f.content()).toBe(propertyOriginal);
        } finally { await f.close(); }
    });
    it('keeps Undo on its original source owner across the history handoff', async () => {
        const f = await fixture();
        const originalSource = f.branch.sandbox.cloudSource;
        try {
            expect(await choose(f)).toBe(true);
            const undo = f.history.undo;
            f.history.undo = async admit => {
                const result = await undo(admit);
                f.branch.sandbox.cloudSource = { ...originalSource } as typeof originalSource;
                return result;
            };
            await f.manager.undo(); expect(f.sent).toHaveLength(1); expect(f.history.canUndo).toBe(true);
            expect(f.content()).toBe(propertyAction.diffs[0]!.generated);
        } finally { f.branch.sandbox.cloudSource = originalSource; await f.close(); }
    });
});
