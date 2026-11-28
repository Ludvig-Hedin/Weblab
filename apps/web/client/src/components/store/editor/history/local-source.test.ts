import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { CodeDiff } from '@weblab/models';
import type { Action, UpdateStyleAction } from '@weblab/models/actions';

import type { FrameData } from '../frames';
import { ActionManager } from '../action';
import { InsertManager } from '../insert';
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
        writeExactStyleDiffs: async (diffs: CodeDiff[]) => {
            for (const diff of diffs) {
                if (files.get(diff.path) !== diff.original) throw new Error('Stale source');
                await beforeWrite?.(diff.path);
                files.set(diff.path, diff.generated);
            }
            return { diffs, needsReload: false };
        },
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
            getStyleWriterForBranch: () => 'tailwind',
            getBranchById: (id: string) => id === 'a' ? dataA.branch : dataB.branch,
            get activeBranch() { return activeId === 'a' ? dataA.branch : dataB.branch; },
            getBranchDataById: (id: string) => id === 'a' ? dataA : dataB,
            activeError: { addCodeApplicationError: () => undefined },
        },
        action: { flushPendingRebases: () => undefined, waitForQueuedStyleDispatches: async () => undefined, finishQueuedStyleAction: async () => undefined },
        tokens: { scan: async () => { scans++; } },
        posthog: { capture: () => undefined },
    } as unknown as EditorEngine;
    const code = new CodeManager(engine);
    Object.defineProperty(engine, 'code', { value: code });
    const history = new HistoryManager(engine, 'a');
    dataA.history = history;
    dataB.history = new HistoryManager(engine, 'b');
    return { engine, code, history, dataA, filesA, filesB, metadata, setBeforeWrite: (hook: (path: string) => Promise<void>) => { beforeWrite = hook; }, scans: () => scans, switchBranch: () => { activeId = 'b'; } };
}

describe('exact source history', () => {
    test('a breakpoint drag writes once and a quick Undo restores the original source bytes', async () => {
        const f = sourceFixture();
        const before = f.filesA.get('page.tsx')!.replace('p-2', 'p-2 p-4 bg-black');
        f.filesA.set('page.tsx', before);
        const writes: string[] = [];
        f.setBeforeWrite(async path => { writes.push(path); });
        await f.history.startTransaction();
        for (const color of ['primary', 'brand']) {
            await f.history.push({ type: 'update-style', targets: [{
                oid: 'element', domId: 'element', branchId: 'a', frameId: 'tablet',
                breakpoint: { id: 'tablet', name: 'Tablet', minWidth: 780 },
                change: {
                    original: { color: { value: 'rgb(0, 0, 0)', type: StyleChangeType.Value } },
                    updated: { color: { value: color, type: StyleChangeType.Custom } },
                },
            }] });
        }
        expect(writes).toEqual([]);
        const commit = f.history.commitTransaction();
        const undo = f.history.undo();
        await commit;
        const edited = f.filesA.get('page.tsx');
        expect(edited).toBe(before.replace('bg-black', 'bg-black [@media(min-width:780px)]:text-brand'));
        expect(writes).toEqual(['page.tsx']);
        expect(await f.code.write((await undo)!.inverse)).toBe(true);
        expect(f.filesA.get('page.tsx')).toBe(before);
        expect(f.history.length).toBe(0);
        expect(await f.code.write((await f.history.redo())!.forward)).toBe(true);
        expect(f.filesA.get('page.tsx')).toBe(edited);
        f.code.clear();
        await f.history.dispose();
    });

    test('a second gesture starting during preflight keeps an independent undo entry', async () => {
        const f = sourceFixture();
        const action = new ActionManager(f.engine);
        Object.assign(f.engine, { action, elements: { selected: [] }, frames: {
            getAll: () => [], get: () => ({ view: { updateStyle: async () => null } }),
        }, theme: { getColorByName: () => '#fff' } });
        let release!: () => void;
        const gate = new Promise<void>(done => { release = done; });
        f.code.preflightStyleAction = async () => gate;
        const change = (value: string): UpdateStyleAction => ({ type: 'update-style', targets: [{
            oid: 'element', frameId: 'frame', domId: 'dom', branchId: 'a',
            change: { original: {}, updated: { color: { value, type: StyleChangeType.Custom } } },
        }] });
        await f.history.startTransaction();
        const early = action.run(change('early'));
        const first = action.run(change('primary'));
        const firstCommit = f.history.commitTransaction();
        void f.history.startTransaction();
        const second = action.run(change('secondary'));
        const secondCommit = f.history.commitTransaction();
        release();
        await Promise.all([early, first, second, firstCommit, secondCommit]);
        expect(f.history.length).toBe(2);
        expect(await f.code.write((await f.history.undo())!.inverse)).toBe(true);
        expect(f.filesA.get('page.tsx')).toContain('text-primary');
        f.code.clear();
        await f.history.dispose();
    });

    test('dropping a replacement image keeps the node and restores both attributes in one Undo', async () => {
        const f = sourceFixture();
        const original = 'export default () => <img data-oid="element" src="/old.png" alt="Old" loading="lazy" />;';
        f.filesA.set('page.tsx', original);
        Object.defineProperty(f.engine, 'canUseDesign', { value: true });
        const frame = { frame: { branchId: 'a' }, view: {
            getInsertLocation: async () => ({}),
            getElementAtLoc: async () => ({ oid: 'element', domId: 'img', tagName: 'img', parent: { domId: 'body' } }),
            getParentElement: async (id: string) => id === 'img'
                ? { domId: 'body', tagName: 'BODY', parent: { domId: null } }
                : { domId: null, tagName: 'HTML', parent: null },
        } } as unknown as FrameData;
        await new InsertManager(f.engine).insertDroppedImage(frame, { x: 0, y: 0 }, {
            originPath: 'public/new.png', fileName: 'New', content: '', mimeType: 'image/png',
        });
        const edited = f.filesA.get('page.tsx');
        expect(edited).toContain('src="/new.png"');
        expect(edited).toContain('alt="New"');
        expect(edited).toContain('loading="lazy"');
        expect(f.history.length).toBe(1);
        expect(await f.code.write((await f.history.undo())!.inverse)).toBe(true);
        expect(f.filesA.get('page.tsx')).toBe(original);
        f.code.clear();
        await f.history.dispose();
    });

    test.each(['literal', 'conditional'])('a %s image passed as Figure children replaces only its call site and undoes exactly', async kind => {
        const f = sourceFixture();
        const second = '<Figure data-oid="two"><img data-oid="other" src="/two.png" alt="Two" /></Figure>';
        const image = '<img data-oid="element" src="/one.png" alt="One" />';
        const first = `<Figure data-oid="one">${kind === 'literal' ? image : `{ready && ${image}}`}</Figure>`;
        const original = `const Figure = ({children}) => <figure>{children}</figure>; export default () => <>${first}${second}</>;`;
        f.filesA.set('page.tsx', original);
        Object.defineProperty(f.engine, 'canUseDesign', { value: true });
        const figure = { domId: 'figure', instanceId: 'one', tagName: 'FIGURE', parent: { domId: 'html' } };
        const frame = { frame: { branchId: 'a' }, view: {
            getInsertLocation: async () => ({}),
            getElementAtLoc: async () => ({ domId: 'img', oid: 'element', tagName: 'IMG', parent: figure }),
            getParentElement: async (id: string) => id === 'img' ? figure : { domId: 'html', tagName: 'HTML', parent: null },
        } } as unknown as FrameData;
        await new InsertManager(f.engine).insertDroppedImage(frame, { x: 0, y: 0 }, {
            originPath: 'public/new.png', fileName: 'New', content: '', mimeType: 'image/png',
        });
        expect(f.filesA.get('page.tsx')).toContain(first.replace('/one.png', '/new.png').replace('alt="One"', 'alt="New"'));
        expect(f.filesA.get('page.tsx')).toContain(second);
        expect(f.history.length).toBe(1);
        expect(await f.code.write((await f.history.undo())!.inverse)).toBe(true);
        expect(f.filesA.get('page.tsx')).toBe(original);
        await f.history.dispose();
    });

    test('an instance image drop leaves the shared root and both call sites intact', async () => {
        const f = sourceFixture();
        const source = 'const Pic = ({src, label}) => <img data-oid="element" src={src} alt={label} />; export default () => <><Pic data-oid="one" src="1" label="One" /><Pic data-oid="two" src="2" label="Two" /></>;';
        f.filesA.set('page.tsx', source);
        Object.defineProperty(f.engine, 'canUseDesign', { value: true });
        const frame = { frame: { branchId: 'a' }, view: {
            getInsertLocation: async () => ({}),
            getElementAtLoc: async () => ({ oid: 'element', instanceId: 'one', tagName: 'img' }),
        } } as unknown as FrameData;
        await new InsertManager(f.engine).insertDroppedImage(frame, { x: 0, y: 0 }, {
            originPath: 'public/new.png', fileName: 'New', content: '', mimeType: 'image/png',
        });
        expect(f.filesA.get('page.tsx')).toBe(source);
        expect(f.history.length).toBe(0);
    });

    for (const ancestry of ['marked parent', 'marked grandparent', 'detached parent'] as const) {
        test(`a literal image drop with a ${ancestry} preserves both Photo instances`, async () => {
            const f = sourceFixture();
            const image = '<img data-oid="element" src="/old.png" alt="Old" />';
            const child = ancestry === 'marked parent' ? image : `<span>${image}</span>`;
            const original = `const Photo = () => <figure data-oid="figure">${child}</figure>; export default () => <><Photo data-oid="one" /><Photo data-oid="two" /></>;`;
            f.filesA.set('page.tsx', original);
            Object.defineProperty(f.engine, 'canUseDesign', { value: true });
            const html = { domId: 'html', tagName: 'HTML', parent: null };
            const figure = { domId: 'figure-one', instanceId: 'one', tagName: 'FIGURE', parent: html };
            const span = { domId: 'span-one', tagName: 'SPAN', parent: figure };
            const frame = { frame: { branchId: 'a' }, view: {
                getInsertLocation: async () => ({}),
                getElementAtLoc: async () => ({
                    domId: 'img-one', oid: 'element', tagName: 'IMG', instanceId: null,
                    parent: ancestry === 'marked parent' ? figure : { domId: 'span-one' },
                }),
                getParentElement: async (id: string) => {
                    if (ancestry === 'detached parent') return null;
                    if (id === figure.domId) return html;
                    if (id === span.domId || ancestry === 'marked parent') return figure;
                    return span;
                },
            } } as unknown as FrameData;
            await new InsertManager(f.engine).insertDroppedImage(frame, { x: 0, y: 0 }, {
                originPath: 'public/new.png', fileName: 'New', content: '', mimeType: 'image/png',
            });
            expect(f.filesA.get('page.tsx')).toBe(original);
            expect(f.history.length).toBe(0);
        });
    }

    test('a missing instance marker cannot turn bound image props into shared literals', async () => {
        const f = sourceFixture();
        const source = 'export const Image = ({src, label}) => <img data-oid="element" src={src} alt={label}/>;';
        f.filesA.set('page.tsx', source);
        Object.defineProperty(f.engine, 'canUseDesign', { value: true });
        const frame = { frame: { branchId: 'a' }, view: {
            getInsertLocation: async () => ({}),
            getElementAtLoc: async () => ({ oid: 'element', domId: 'img', tagName: 'img', parent: { domId: 'body' } }),
            getParentElement: async (id: string) => id === 'img'
                ? { domId: 'body', tagName: 'BODY', parent: { domId: null } }
                : { domId: null, tagName: 'HTML', parent: null },
        } } as unknown as FrameData;
        await expect(new InsertManager(f.engine).insertDroppedImage(frame, { x: 0, y: 0 }, {
            originPath: 'public/new.png', fileName: 'New', content: '', mimeType: 'image/png',
        })).rejects.toThrow('image properties');
        expect(f.filesA.get('page.tsx')).toBe(source);
        expect(f.history.length).toBe(0);
    });

    const padding: UpdateStyleAction = { type: 'update-style', targets: [{
        oid: 'element', frameId: 'frame', domId: 'element', branchId: 'a',
        change: { original: {}, updated: { padding: { value: '13px', type: StyleChangeType.Value } } },
    }] };

    test.each(['retry', 'another save failure', 'another gesture', 'close during retry'])('a direct input after failed close with %s', async recovery => {
        const f = sourceFixture();
        const original = f.filesA.get('page.tsx')!;
        const action = new ActionManager(f.engine);
        const painted: string[] = [];
        Object.assign(f.engine.tokens, { resolveVariableValue: () => undefined });
        Object.assign(f.engine, { action, elements: { selected: [] }, frames: {
            getAll: () => [], get: () => ({ view: { updateStyle: async (_id: string, change: UpdateStyleAction['targets'][number]['change']) => {
                painted.push(change.updated.margin?.value ?? '');
                return null;
            } } }),
        }, theme: { getColorByName: () => null } });
        const margin: UpdateStyleAction = { type: 'update-style', targets: [{ ...padding.targets[0]!,
            change: {
                original: { margin: { value: '0px', type: StyleChangeType.Value } },
                updated: { margin: { value: '27px', type: StyleChangeType.Value } },
            },
        }] };
        let offline = true;
        let attempts = 0;
        f.setBeforeWrite(async () => {
            attempts++;
            if (offline) throw new Error('offline');
        });
        await f.history.startTransaction();
        await f.history.push(padding);
        const release = f.history.commitTransaction();
        const close = f.history.dispose();
        await release;
        await expect(close).rejects.toThrow();
        if (recovery === 'another save failure') {
            expect(await action.run(margin)).toBe(false);
            expect(painted.at(-1)).toBe('0px');
            expect(f.filesA.get('page.tsx')).toBe(original);
            expect(attempts).toBe(2);
        }
        if (recovery === 'another gesture') {
            let finishPreflight!: () => void;
            const gate = new Promise<void>(done => { finishPreflight = done; });
            const preflight = f.code.preflightStyleAction.bind(f.code);
            f.code.preflightStyleAction = async change => { await gate; await preflight(change); };
            const direct = action.run(margin);
            await f.history.startTransaction();
            offline = false;
            finishPreflight();
            expect(await direct).toBe(true);
            expect(f.history.isInTransaction).toBe(true);
        } else if (recovery === 'close during retry') {
            let entered!: () => void;
            let resume!: () => void;
            const started = new Promise<void>(done => { entered = done; });
            const gate = new Promise<void>(done => { resume = done; });
            f.setBeforeWrite(async () => { attempts++; entered(); await gate; });
            const direct = action.run(margin);
            await started;
            const closing = f.history.dispose();
            resume();
            const [result] = await Promise.all([direct, closing]);
            expect(result).toBe(true);
            expect(attempts).toBe(3);
            expect(f.filesA.get('page.tsx')).toContain('m-[27px]');
            expect(saved?.undoStack).toHaveLength(2);
            return;
        } else {
            offline = false;
            expect(await action.run(margin)).toBe(true);
        }
        expect(painted.at(-1)).toBe('27px');
        expect(f.filesA.get('page.tsx')).toContain('m-[27px]');
        expect(attempts).toBe(recovery === 'retry' ? 3 : 4);
        expect(f.history.length).toBe(2);
        expect(await f.code.write((await f.history.undo())!.inverse)).toBe(true);
        expect(f.filesA.get('page.tsx')).toBe(original.replace('p-2', 'p-[13px]'));
        expect(await f.code.write((await f.history.undo())!.inverse)).toBe(true);
        expect(f.filesA.get('page.tsx')).toBe(original);
        await f.history.dispose();
    });

    test.each(['missing class', 'unsupported value', 'existing class'])('a %s does not block the next margin edit or close', async kind => {
        const f = sourceFixture();
        const initial = f.filesA.get('page.tsx')!.replace('p-2', kind === 'existing class' ? 'p-2 hover:p-4' : 'flex  hover:p-4');
        f.filesA.set('page.tsx', initial);
        const manager = new ActionManager(f.engine);
        const previews: string[] = [];
        Object.assign(f.engine, { action: manager, elements: { selected: [] }, frames: {
            getAll: () => [], get: () => ({ view: { updateStyle: async (_id: string, change: UpdateStyleAction['targets'][number]['change']) => {
                previews.push(Object.values(change.updated)[0]!.value);
                return null;
            } } }),
        }, theme: { getColorByName: () => undefined } });
        Object.assign(f.engine.tokens, { resolveVariableValue: () => undefined });
        let writes = 0;
        f.setBeforeWrite(async () => { writes++; });
        const edit = (property: string, value: string): UpdateStyleAction => ({ ...padding, targets: [{
            ...padding.targets[0]!, change: { original: { [property]: { type: StyleChangeType.Value, value: property === 'display' ? 'flex' : '8px' } },
                updated: { [property]: { type: StyleChangeType.Value, value } } },
        }] });
        const unsupported = kind === 'unsupported value';
        expect(await manager.run(unsupported ? edit('display', 'unsupported-display-mode') : edit('padding', ''))).toBe(!unsupported);
        expect(f.history.hasRetainedActions).toBe(false);
        expect(writes).toBe(kind === 'existing class' ? 1 : 0);
        expect(f.history.length).toBe(writes);
        if (unsupported) expect(previews.at(-1)).toBe('flex');
        expect(f.filesA.get('page.tsx')).toBe(kind === 'existing class' ? initial.replace('p-2 ', '') : initial);
        expect(await manager.run(edit('margin', '27px'))).toBe(true);
        expect(f.filesA.get('page.tsx')).toContain('m-[27px]');
        await f.history.dispose();
    });

    // Every schedule starts with a failed close on a released 13px resize.
    // Hold the retry at the writer while admitting one or two later edits:
    // D is a direct input, G a released gesture, N an absent-class reset and U an unsupported input.
    for (const inputs of ['D', 'G', 'DD', 'DG', 'GD', 'GG', 'ND', 'UD', 'DN', 'GU', 'NUD', 'UNG']) {
        // Attempt 1 failed during the initial close. Fault any subsequent
        // source write, or let all of them succeed (failureAt = 0).
        const writes = [...inputs].filter(kind => kind === 'D' || kind === 'G').length;
        for (const failureAt of [0, ...Array.from({ length: writes + 1 }, (_, i) => i + 2)]) {
            for (const closeFirst of [false, true]) {
                test(`recovery order ${inputs}, fault at attempt ${failureAt}, close before retry settles=${closeFirst}`, async () => {
                    const f = sourceFixture();
                    const initial = f.filesA.get('page.tsx')!;
                    const manager = new ActionManager(f.engine);
                    Object.assign(f.engine, { action: manager, elements: { selected: [] },
                        frames: { getAll: () => [], get: () => ({ view: { updateStyle: async () => null } }) },
                        theme: { getColorByName: () => undefined } });
                    Object.assign(f.engine.tokens, { resolveVariableValue: () => undefined });
                    const resize = (px: number): UpdateStyleAction => ({ ...padding, targets: [{
                        ...padding.targets[0]!, change: { original: {}, updated: {
                            padding: { type: StyleChangeType.Value, value: `${px}px` },
                        } },
                    }] });
                    const landed: string[] = [];
                    const write = f.dataA.codeEditor.writeExactStyleDiffs;
                    f.dataA.codeEditor.writeExactStyleDiffs = async diffs => {
                        const result = await write(diffs);
                        landed.push(f.filesA.get('page.tsx')!);
                        return result;
                    };
                    let attempts = 0;
                    let resume!: () => void;
                    const gate = new Promise<void>(resolve => { resume = resolve; });
                    f.setBeforeWrite(async () => {
                        const attempt = ++attempts;
                        if (attempt === 2) await gate;
                        if (attempt === 1 || attempt === failureAt) throw new Error('injected write failure');
                    });
                    await f.history.startTransaction();
                    await f.history.push(resize(13));
                    const released = f.history.commitTransaction();
                    const firstClose = f.history.dispose();
                    expect(await released).toBe(false);
                    await expect(firstClose).rejects.toThrow();
                    const submissions: Promise<void>[] = [];
                    const values = [13];
                    for (const [i, kind] of [...inputs].entries()) {
                        if (kind === 'N' || kind === 'U') {
                            const property = kind === 'N' ? 'margin' : 'display';
                            const candidate = resize(0);
                            candidate.targets[0]!.change = {
                                original: { [property]: { type: StyleChangeType.Value, value: kind === 'N' ? '0px' : 'block' } },
                                updated: { [property]: { type: StyleChangeType.Value, value: kind === 'N' ? '' : 'unsupported-display-mode' } },
                            };
                            submissions.push(manager.run(candidate).then(success => {
                                if (!failureAt || success) expect(success).toBe(kind === 'N');
                            }));
                            await manager.waitForStylePreflights();
                            continue;
                        }
                        const value = 27 + 12 * i;
                        values.push(value);
                        const expected = initial.replace('p-2', `p-[${value}px]`);
                        if (kind === 'G') {
                            void f.history.startTransaction();
                            // A gesture sample acknowledges preview admission; release owns its save.
                            await manager.run(resize(value));
                            submissions.push(f.history.commitTransaction().then(success => {
                                if (success) expect(landed).toContain(expected);
                                if (!failureAt) expect(success).toBe(true);
                            }));
                        } else {
                            submissions.push(manager.run(resize(value)).then(success => {
                                if (success) expect(landed).toContain(expected);
                                if (!failureAt) expect(success).toBe(true);
                            }));
                            await manager.waitForStylePreflights();
                        }
                    }
                    const closing = closeFirst ? f.history.dispose() : undefined;
                    resume();
                    if (closing && failureAt) await expect(closing).rejects.toThrow();
                    else await closing;
                    await Promise.all(submissions);
                    if (!closing || failureAt) await f.history.dispose();
                    const versions = values.map(value => initial.replace('p-2', `p-[${value}px]`));
                    expect(landed).toEqual(versions);
                    expect(f.filesA.get('page.tsx')).toBe(versions.at(-1));
                    const reopened = new HistoryManager(f.engine, 'a');
                    f.dataA.history = reopened;
                    await reopened.hydrate();
                    expect(reopened.length).toBe(values.length);
                    for (const before of [initial, ...versions.slice(0, -1)].reverse()) {
                        expect(await f.code.write((await reopened.undo())!.inverse)).toBe(true);
                        expect(f.filesA.get('page.tsx')).toBe(before);
                    }
                    await reopened.dispose();
                });
            }
        }
    }

    test('a mirror read failure after commit preserves the saved style and its Undo', async () => {
        const f = sourceFixture();
        const original = f.filesA.get('page.tsx');
        const read = f.dataA.codeEditor.readFile;
        let offline = false;
        f.setBeforeWrite(async () => { offline = true; });
        f.dataA.codeEditor.readFile = async path => {
            if (offline) throw new Error('Mirror temporarily unavailable');
            return read(path);
        };
        expect(await f.history.push(padding)).toBe(true);
        expect(f.filesA.get('page.tsx')).toContain('p-[13px]');
        offline = false;
        expect(await f.code.write((await f.history.undo())!.inverse)).toBe(true);
        expect(f.filesA.get('page.tsx')).toBe(original);
    });

    test('cloud style forward, Undo and Redo all commit the exact source bytes', async () => {
        const f = sourceFixture();
        const original = f.filesA.get('page.tsx')!;
        const edited = original.replace('p-2', 'p-[13px]');
        const commits: string[] = [];
        Object.assign(f.dataA.branch.runtime, { type: 'cloud', cloud: { sourceVersion: 1 } });
        Object.assign(f.dataA.codeEditor, {
            writeFiles: async (files: Array<{ path: string; content: string }>) => {
                for (const { path, content } of files) {
                    const formatted = content.replace('(){return', '() { return');
                    commits.push(formatted); f.filesA.set(path, formatted);
                }
            },
            writeExactStyleDiffs: async (diffs: Array<{ path: string; original: string; generated: string }>) => {
                for (const diff of diffs) {
                    expect(f.filesA.get(diff.path)).toBe(diff.original);
                    commits.push(diff.generated); f.filesA.set(diff.path, diff.generated);
                }
                return { diffs, needsReload: false };
            },
        });
        expect(await f.history.push(padding)).toBe(true);
        expect(await f.code.write((await f.history.undo())!.inverse)).toBe(true);
        expect(await f.code.write((await f.history.redo())!.forward)).toBe(true);
        expect(commits).toEqual([edited, original, edited]);
    });

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
