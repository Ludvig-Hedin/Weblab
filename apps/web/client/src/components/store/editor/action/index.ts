import { cloneDeep, debounce } from 'lodash';
import { isCloudEditorRuntime } from '@convex/lib/cloudEditor';
import { EditorAttributes } from '@weblab/constants';
import { parse, t, type T } from '@weblab/parser/src/packages';
import { getContentFromAst } from '@weblab/parser/src/parse';
import { formatContent } from '@weblab/parser/src/prettier';

import type { DomElement, LayerNode } from '@weblab/models';
import { EditorMode } from '@weblab/models';
import {
    type Action,
    type EditTextAction,
    type GroupElementsAction,
    type InsertElementAction,
    type InsertImageAction,
    type MoveElementAction,
    type RemoveElementAction,
    type RemoveImageAction,
    type UngroupElementsAction,
    type UpdateStyleAction,
    type WriteCodeAction,
} from '@weblab/models/actions';
import { StyleChangeType } from '@weblab/models/style';
import { toast } from '@weblab/ui/sonner';
import { assertNever } from '@weblab/utility';

import type { EditorEngine } from '../engine';
import type { BranchDisposalPreparation } from '../branch/manager';
import type { HistoryDisposalLease, HistoryManager } from '../history';
import type { FrameData } from '../frames';
import { hasUnsupportedResponsiveStyleValue } from '../style/local-style-writer';
import type { CloudAttributeApproval, CloudAttributeField, CloudAttributeWrite } from '../sandbox/cloud-source';

export interface ApprovedAttributeEdit {
    branchId: string;
    path: string;
    oid: string;
    field: CloudAttributeField;
    value: string;
    expectedRevision: number;
    expectedGeneration: number;
}
type AttributeHistoryAction = WriteCodeAction & { cloudAttribute: CloudAttributeApproval & { version: 1 } };

function attributeHistory(action: Action): AttributeHistoryAction | null {
    if (action.type !== 'write-code' || !('cloudAttribute' in action)) return null;
    const pin = action.cloudAttribute;
    if (!pin || typeof pin !== 'object' || !('version' in pin) || pin.version !== 1 ||
        !('actorId' in pin) || typeof pin.actorId !== 'string' ||
        !('branchId' in pin) || typeof pin.branchId !== 'string' ||
        !('path' in pin) || typeof pin.path !== 'string' ||
        !('oid' in pin) || typeof pin.oid !== 'string' ||
        !('field' in pin) || !['src', 'alt', 'href', 'className'].includes(String(pin.field)) ||
        !('generation' in pin) || typeof pin.generation !== 'number' || !Number.isSafeInteger(pin.generation) || pin.generation < 1) return null;
    return action as AttributeHistoryAction;
}

function approvedLiteral(source: string, oid: string, field: CloudAttributeField): { ast: T.File; value: T.StringLiteral } {
    const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    const values: T.StringLiteral[] = [];
    t.traverseFast(ast, (node) => {
        if (!t.isJSXOpeningElement(node)) return;
        const ids = node.attributes.filter((attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: EditorAttributes.DATA_WEBLAB_ID }));
        if (ids.length !== 1 || !t.isJSXAttribute(ids[0]) || !t.isStringLiteral(ids[0].value) || ids[0].value.value !== oid) return;
        const attributes = node.attributes.filter((attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: field }));
        if (attributes.length !== 1 || !t.isJSXAttribute(attributes[0])) throw new Error('The approved attribute is unavailable');
        const value = attributes[0].value;
        if (t.isStringLiteral(value)) values.push(value);
        else if (t.isJSXExpressionContainer(value) && t.isStringLiteral(value.expression)) values.push(value.expression);
        else throw new Error('The approved attribute is not a literal');
    });
    if (values.length !== 1) throw new Error('The approved element identity changed');
    return { ast, value: values[0]! };
}

async function attributeCandidate(source: string, path: string, oid: string, field: CloudAttributeField, value: string): Promise<string> {
    const literal = approvedLiteral(source, oid, field);
    literal.value.value = value;
    return formatContent(path, await getContentFromAst(literal.ast, source));
}

type StyleTarget = UpdateStyleAction['targets'][number];
type SourceRebaseAttempt = {
    key: string;
    oid: string;
    property: string;
    branchId?: string;
    applied: boolean;
};

function rebaseKey(branchId: string | undefined, oid: string, property: string): string {
    const canonical = property.startsWith('--') ? property
        : property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    return JSON.stringify([branchId ?? null, oid, canonical]);
}

function styleKey(target: StyleTarget, property: string): string {
    return `${target.frameId}:${target.domId}::${property}`;
}

function styleKeys(action: UpdateStyleAction): string[] {
    return action.targets.flatMap((target) =>
        Object.keys(target.change.updated).map((property) => styleKey(target, property)),
    );
}

function invertStyle(action: UpdateStyleAction): UpdateStyleAction {
    return {
        ...action,
        targets: action.targets.map((target) => ({
            ...target,
            change: { original: target.change.updated, updated: target.change.original },
        })),
    };
}

/** The action without the excluded properties, or null when none remain. */
function withoutKeys(action: UpdateStyleAction, excluded: Set<string>): UpdateStyleAction | null {
    if (excluded.size === 0) return action;
    const targets: StyleTarget[] = [];
    for (const target of action.targets) {
        const keep = (property: string) => !excluded.has(styleKey(target, property));
        const updated = Object.fromEntries(
            Object.entries(target.change.updated).filter(([property]) => keep(property)),
        );
        if (Object.keys(updated).length === 0) continue;
        const original = Object.fromEntries(
            Object.entries(target.change.original).filter(([property]) => keep(property)),
        );
        targets.push({ ...target, change: { original, updated } });
    }
    return targets.length > 0 ? { ...action, targets } : null;
}

export class ActionManager {
    constructor(private editorEngine: EditorEngine) {}

    private queuedStyleDispatches = new Set<Promise<void>>();
    /** Newest optimistic style edit per `${frameId}:${domId}::${property}`. */
    private latestStyleEdit = new Map<string, UpdateStyleAction>();
    private optimisticStyleRuns = new Set<Promise<boolean>>();
    private stylePreflights = new Set<Promise<void>>();

    get hasPendingStylePreflights(): boolean {
        return this.stylePreflights.size > 0;
    }

    async waitForStylePreflights(): Promise<void> {
        while (this.stylePreflights.size > 0) {
            await Promise.allSettled(Array.from(this.stylePreflights));
        }
        // Let validated runs enter their gesture transaction before release
        // closes it, or Undo inspects the preceding action.
        await Promise.resolve();
    }

    async waitForQueuedStyleDispatches(): Promise<void> {
        while (this.queuedStyleDispatches.size > 0) {
            await Promise.allSettled(Array.from(this.queuedStyleDispatches));
        }
    }

    private styleWriteBlocked(action: UpdateStyleAction): boolean {
        if (this.editorEngine.framework === 'static-html') {
            toast.error('Visual style editing is unavailable for static HTML', {
                id: 'static-html-style-unavailable',
                description: 'The current source writer requires Tailwind. Your project files were not changed.',
            });
            return true;
        }
        const branches = this.editorEngine.branches;
        const branchIds = new Set(action.targets.map((target) => target.branchId));
        if (branchIds.size === 0 && branches?.hasActiveBranch) {
            branchIds.add(branches.activeBranch.id);
        }
        if ([...branchIds].some((id) => branches?.getStyleWriterForBranch(id) === 'none')) {
            toast.error('Visual style editing is unavailable for this local project', {
                id: 'local-style-unavailable',
                description: 'A wired Tailwind v4 App Router stylesheet is required. Text and code editing remain available.',
            });
            return true;
        }
        if (hasUnsupportedResponsiveStyleValue(action.targets, this.editorEngine.frames?.getAll() ?? [])) {
            toast.error('This responsive value cannot be saved safely', {
                id: 'responsive-style-unavailable',
                description: 'Change the font on the smallest frame. Breakpoint font stacks are not supported yet.',
            });
            return true;
        }
        return false;
    }

    async run(action: Action, onApplied?: () => void): Promise<boolean> {
        if (this.editorEngine.canUseDesign === false && action.type !== 'edit-text') return false;
        if (action.type === 'update-style' && this.styleWriteBlocked(action)) return false;
        // Pin history before preflight RPCs can yield to a frame/branch switch.
        const sourceHistory = action.type === 'update-style' && this.editorEngine.branches?.getBranchDataById
            ? this.editorEngine.branches.getBranchDataById(action.targets[0]?.branchId ?? '')?.history
            : this.editorEngine.history;
        if (!sourceHistory) return false;
        if (action.type === 'update-style' && this.editorEngine.code?.preflightStyleAction) {
            const preflight = this.editorEngine.code.preflightStyleAction(action);
            this.stylePreflights.add(preflight);
            try {
                await preflight;
            } catch (error) {
                toast.error('This style must be edited in code', {
                    description: error instanceof Error ? error.message : 'The source could not be checked safely.',
                });
                return false;
            } finally {
                this.stylePreflights.delete(preflight);
            }
        }
        if (action.type === 'update-style' && this.editorEngine.code?.prepareStyleAction) {
            action = this.editorEngine.code.prepareStyleAction(action);
        }
        // A released slider or drag may still be committing. A new transaction
        // queues into its own commit; a direct edit waits so undo order and
        // source writes stay in sequence instead of being dropped.
        if (
            action.type === 'update-style' &&
            !sourceHistory.isInTransaction &&
            sourceHistory.isCommitPending
        ) {
            await sourceHistory.waitForCommit();
        }
        const queuedStyle = action.type === 'update-style' && sourceHistory.isInTransaction;
        let finishQueued: (() => void) | undefined;
        const queuedCompletion = queuedStyle ? new Promise<void>((resolve) => {
            finishQueued = () => resolve(undefined);
        }) : null;
        if (queuedCompletion) this.queuedStyleDispatches.add(queuedCompletion);
        if (action.type === 'update-style' && !queuedStyle) {
            return this.runStyleOptimistically(action, sourceHistory, onApplied);
        }
        try {
            const structural = action.type === 'group-elements' || action.type === 'ungroup-elements';
            const actionHistory = action.type === 'group-elements' || action.type === 'ungroup-elements'
                ? this.editorEngine.branches.getBranchDataById(action.parent.branchId)?.history
                : sourceHistory;
            if (!actionHistory) return false;
            const pushed = structural
                ? await actionHistory.pushImmediate(action)
                : await actionHistory.push(action);
            if (!pushed) {
                // The code write failed (push already dropped the action from
                // undo history). No preview edit should be dispatched.
                return false;
            }
            await this.dispatch(action, { scheduleRebase: !queuedStyle, skipWriteGuard: true });
            onApplied?.();
            return true;
        } finally {
            finishQueued?.();
            if (queuedCompletion) this.queuedStyleDispatches.delete(queuedCompletion);
        }
    }

    /**
     * A direct style edit paints the frames at once and saves in the
     * background, like a slider transaction does. Waiting for the source
     * write first made every edit lag behind the whole write queue.
     * `onApplied` (override map + panel mirror) still runs only after the
     * save lands, so a source rebase never writes a value that failed to
     * save. If the save fails, the frames get the original values back.
     */
    private runStyleOptimistically(
        action: UpdateStyleAction,
        history: EditorEngine['history'],
        onApplied?: () => void,
    ): Promise<boolean> {
        const run = this.saveStyleInBackground(action, history, onApplied);
        this.optimisticStyleRuns.add(run);
        void run.finally(() => this.optimisticStyleRuns.delete(run)).catch(() => undefined);
        return run;
    }

    private async saveStyleInBackground(
        action: UpdateStyleAction,
        history: EditorEngine['history'],
        onApplied?: () => void,
    ): Promise<boolean> {
        const keys = styleKeys(action);
        for (const key of keys) this.latestStyleEdit.set(key, action);
        const pushed = history.push(action);
        const preview = this.dispatch(action, { scheduleRebase: false, skipWriteGuard: true });
        const [saved] = await Promise.all([pushed, preview.catch((error: unknown) => {
            console.error('Style preview failed', error);
        })]);
        // Only the newest edit of a property may revert it. An older failed
        // save must not wipe a newer preview that is still saving.
        const newest = keys.filter((key) => this.latestStyleEdit.get(key) === action);
        for (const key of newest) this.latestStyleEdit.delete(key);
        if (!saved) {
            const stale = withoutKeys(action, new Set(keys.filter((key) => !newest.includes(key))));
            if (stale) {
                // Preview-only revert. The override map never saw this edit.
                await this.dispatch(invertStyle(stale), { scheduleRebase: false, skipWriteGuard: true });
            }
            return false;
        }
        onApplied?.();
        // Same debounced responsive rebase the old write-then-dispatch path
        // scheduled once the write had landed.
        if (!history.isInTransaction) {
            this.scheduleRebasesForTargets(action.targets);
        }
        return true;
    }

    /** Undo and redo must see every in-flight optimistic edit settle first. */
    private async waitForOptimisticStyleRuns(): Promise<void> {
        while (this.optimisticStyleRuns.size > 0) {
            await Promise.allSettled(Array.from(this.optimisticStyleRuns));
        }
    }

    async uploadApprovedImage(edit: Omit<ApprovedAttributeEdit, 'field' | 'value'>, file: File): Promise<boolean> {
        const branch = this.editorEngine.branches.getBranchDataById(edit.branchId);
        const source = branch?.sandbox.cloudSource;
        const actorId = source?.state.contracts?.actorId;
        if (!branch || !source || !actorId || this.editorEngine.isClosing || file.size > 4_000_000 || !file.size) return false;
        const pin: CloudAttributeApproval = { actorId, branchId: edit.branchId, path: edit.path, oid: edit.oid,
            field: 'src', generation: edit.expectedGeneration };
        const active = () => !this.editorEngine.isClosing && this.editorEngine.activeSandbox.cloudSource === source &&
            this.editorEngine.branches.hasActiveBranch && this.editorEngine.branches.activeBranchData === branch && source.state.contracts?.actorId === actorId;
        return source.withImageUpload(pin, edit.expectedRevision, async lease => {
            let preparedAttempt: import('../sandbox/cloud-source').CloudImagePrepared['attemptId'] | null = null;
            let commitStarted = false;
            try {
                if (!active() || !lease.current()) return false;
                const metadata = await branch.codeEditor.getJsxElementMetadata(edit.oid);
                if (metadata?.path.replace(/^\/+/, '') !== edit.path || !active() || !lease.current()) return false;
                const original = await branch.codeEditor.readFile(edit.path);
                if (typeof original !== 'string' || !active() || !lease.current()) return false;
                const response = await fetch('/api/cloud-editor/images', { method: 'POST', credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/octet-stream', 'x-weblab-image-target': JSON.stringify({
                        ...source.scope, actorId, path: edit.path, oid: edit.oid, expectedRevision: edit.expectedRevision,
                        generation: edit.expectedGeneration, operationId: crypto.randomUUID(),
                    }) }, body: file });
                if (!response.ok) return false;
                const image: unknown = await response.json();
                if (image && typeof image === 'object' && 'attemptId' in image && typeof image.attemptId === 'string')
                    preparedAttempt = image.attemptId as import('../sandbox/cloud-source').CloudImagePrepared['attemptId'];
                if (!image || typeof image !== 'object' || !('attemptId' in image) || typeof image.attemptId !== 'string' ||
                    !('assetPath' in image) || typeof image.assetPath !== 'string' || !('hash' in image) || typeof image.hash !== 'string' ||
                    !('bytes' in image) || typeof image.bytes !== 'string' || image.bytes.length > 810_000 || !active() || !lease.current()) return false;
                const bytes = Uint8Array.from(atob(image.bytes), char => char.charCodeAt(0));
                const assetPath = image.assetPath, hash = image.hash;
                const generated = await attributeCandidate(original, edit.path, edit.oid, 'src', assetPath.slice('public'.length));
                if (!active() || !lease.current() || await branch.codeEditor.readFile(edit.path) !== original) return false;
                if (generated === original) return true;
                const action: AttributeHistoryAction = { type: 'write-code', branchId: edit.branchId,
                    diffs: [{ path: edit.path, original, generated }], cloudAttribute: { ...pin, version: 1 } };
                return await branch.history.pushImmediate(action, async () => {
                    if (!active() || !lease.current()) return false;
                    commitStarted = true;
                    return lease.commit({ attemptId: image.attemptId as import('../sandbox/cloud-source').CloudImagePrepared['attemptId'],
                        assetPath, hash, bytes }, generated);
                }, () => active() && lease.current());
            } catch { return false; }
            finally {
                // Never cancel a possibly sent commit. Its durable journal owns recovery.
                if (preparedAttempt && !commitStarted)
                    try { await source.cancelImagePreparation(preparedAttempt); } catch { /* Owned expiry will collect it. */ }
            }
        });
    }

    async editApprovedAttribute(edit: ApprovedAttributeEdit): Promise<boolean> {
        const branch = this.editorEngine.branches.getBranchDataById(edit.branchId);
        const source = branch?.sandbox.cloudSource;
        if (!branch || !source?.isContentMode || this.editorEngine.isClosing || source.hasLocalWork ||
            source.state.savedRevision !== edit.expectedRevision || !source.canEditAttribute(edit.path, edit.oid, edit.field, edit.value)) return false;
        const actorId = source.state.contracts?.actorId;
        if (!actorId || !source.approvedAttributeBindings.some((binding) => binding.path === edit.path &&
            binding.oid === edit.oid && binding.generation === edit.expectedGeneration)) return false;
        try {
            const metadata = await branch.codeEditor.getJsxElementMetadata(edit.oid);
            if (metadata?.path.replace(/^\/+/, '') !== edit.path) return false;
            const original = await branch.codeEditor.readFile(edit.path);
            if (typeof original !== 'string') return false;
            const generated = await attributeCandidate(original, edit.path, edit.oid, edit.field, edit.value);
            if (source.state.savedRevision !== edit.expectedRevision) return false;
            if (generated === original) return true;
            const action: AttributeHistoryAction = {
                type: 'write-code', branchId: edit.branchId, diffs: [{ path: edit.path, original, generated }],
                cloudAttribute: { version: 1, actorId, branchId: edit.branchId, path: edit.path,
                    oid: edit.oid, field: edit.field, generation: edit.expectedGeneration },
            };
            return await branch.history.pushImmediate(action,
                (entry) => source.state.savedRevision === edit.expectedRevision ? this.writeAttributeHistory(entry, branch.history) : Promise.resolve(false),
                async (entry) => source.state.savedRevision === edit.expectedRevision &&
                    (await this.prepareAttributeHistory(entry, branch.history)) !== null && source.state.savedRevision === edit.expectedRevision);
        } catch { return false; }
    }

    private async prepareAttributeHistory(action: Action, history: HistoryManager) {
        const entry = attributeHistory(action);
        if (!entry || entry.diffs.length !== 1 || entry.previewStyle || entry.refreshTokens) return null;
        const pin = entry.cloudAttribute;
        const branches = this.editorEngine.branches;
        const branch = branches.getBranchDataById(pin.branchId);
        const source = branch?.sandbox.cloudSource;
        if (!branch || !source || !isCloudEditorRuntime(branch.branch.runtime) || branch.history !== history ||
            !branches.hasActiveBranch || branches.activeBranchData !== branch || entry.branchId !== pin.branchId ||
            source.state.contracts?.actorId !== pin.actorId || !source.canWrite) return null;
        const diff = entry.diffs[0]!;
        if (diff.path !== pin.path || !source.approvedAttributeBindings.some((binding) =>
            binding.path === pin.path && binding.oid === pin.oid && binding.generation === pin.generation)) return null;
        const revision = source.state.savedRevision;
        try {
            const metadata = await branch.codeEditor.getJsxElementMetadata(pin.oid);
            if (metadata?.path.replace(/^\/+/, '') !== pin.path || await branch.codeEditor.readFile(pin.path) !== diff.original) return null;
            const value = approvedLiteral(diff.generated, pin.oid, pin.field).value.value;
            if (!source.canEditAttribute(pin.path, pin.oid, pin.field, value) ||
                await attributeCandidate(diff.original, pin.path, pin.oid, pin.field, value) !== diff.generated) return null;
            if (!branches.hasActiveBranch || branches.activeBranchData !== branch || branch.sandbox.cloudSource !== source ||
                !source.canWrite || source.state.savedRevision !== revision || source.state.contracts?.actorId !== pin.actorId ||
                !source.approvedAttributeBindings.some((binding) => binding.path === pin.path && binding.oid === pin.oid && binding.generation === pin.generation)) return null;
            const write: CloudAttributeWrite = { ...pin, revision, value, candidate: diff.generated };
            return { branch, source, write };
        } catch { return null; }
    }

    private async writeAttributeHistory(action: Action, history: HistoryManager): Promise<boolean> {
        const prepared = await this.prepareAttributeHistory(action, history);
        if (!prepared) return false;
        return prepared.source.withApprovedAttributeWrite(prepared.write, () =>
            this.editorEngine.code.write(action, { branchId: prepared.branch.branch.id, codeEditor: prepared.branch.codeEditor }));
    }

    private writeHistoryReplay(action: Action, history: HistoryManager): Promise<boolean> {
        return 'cloudAttribute' in action ? this.writeAttributeHistory(action, history) : this.editorEngine.code.write(action);
    }

    /** Build history must still refer to currently approved source identities. */
    private async admitHistoryReplay(action: Action, history: HistoryManager): Promise<boolean> {
        if ('cloudAttribute' in action) return (await this.prepareAttributeHistory(action, history)) !== null;
        const branches = this.editorEngine.branches;
        const branch = branches?.hasActiveBranch ? branches.activeBranchData : null;
        if (!branch || !isCloudEditorRuntime(branch.branch.runtime)) return true;
        const source = branch.sandbox.cloudSource;
        if (!source?.canWrite || branch.history !== history) return false;
        if (source.canDesign && !source.isContentMode) return true;
        if (action.type !== 'edit-text' || action.targets.length === 0 ||
            action.targets.some((target) => target.branchId !== branch.branch.id)) return false;

        const version = source.getSourceVersion();
        const bindings = source.approvedTextBindings;
        const oids = new Set([
            ...action.targets.map((target) => target.oid),
            ...(action.textSlots?.map((slot) => slot.oid) ?? []),
        ]);
        try {
            const approved = await Promise.all([...oids].map(async (oid) => {
                if (!oid) return null;
                const metadata = await branch.codeEditor.getJsxElementMetadata(oid);
                const path = metadata?.path.replace(/^\/+/, '');
                const binding = bindings.find((entry) => entry.oid === oid && entry.path === path);
                return binding ?? null;
            }));
            return branches.hasActiveBranch && branches.activeBranchData === branch &&
                branch.sandbox.cloudSource === source && source.canWrite &&
                source.getSourceVersion() === version && approved.every((binding) => binding !== null &&
                    source.canEditText(binding.path, binding.oid) && source.approvedTextBindings.some((current) =>
                        current.oid === binding.oid && current.path === binding.path && current.generation === binding.generation));
        } catch {
            return false;
        }
    }

    async undo() {
        const history = this.editorEngine.history;
        await this.waitForStylePreflights();
        await this.waitForOptimisticStyleRuns();
        this.cancelPendingRebases();
        await Promise.allSettled(Array.from(this.inFlightRebases));
        const result = await history.undo((action) => this.admitHistoryReplay(action, history));

        if (result == null) {
            return;
        }
        const written = await this.writeHistoryReplay(result.inverse, history);
        if (!written) {
            // The inverse write failed (error already surfaced by code.write),
            // so the undo never actually reverted the files. Roll the history
            // stack move back so undo/redo state stays in sync with the file
            // contents and the user can retry.
            history.rollbackUndo(result.redoEntry);
            return;
        }
        await history.confirmSourceReplay(result.externalRevision);
        // Also apply the inverse to the live frames: the preload's injected
        // stylesheet and the style panel mirror don't watch the file system,
        // so without this the undone value keeps winning the cascade in the
        // preview (and the panel) until a full iframe reload.
        await this.dispatchHistoryAction(result.inverse);
        this.editorEngine.posthog.capture('undo');
    }

    async redo() {
        const history = this.editorEngine.history;
        await this.waitForStylePreflights();
        await this.waitForOptimisticStyleRuns();
        this.cancelPendingRebases();
        await Promise.allSettled(Array.from(this.inFlightRebases));
        const result = await history.redo((action) => this.admitHistoryReplay(action, history));
        if (result == null) {
            return;
        }
        const written = await this.writeHistoryReplay(result.forward, history);
        if (!written) {
            // The forward write failed — roll the redo stack move back so the
            // action returns to the redo stack and state stays consistent.
            history.rollbackRedo(result.forward, result.redoEntry);
            return;
        }
        await history.confirmSourceReplay(result.externalRevision);
        // Mirror of the undo path: re-apply the forward action to the frames.
        await this.dispatchHistoryAction(result.forward);
        this.editorEngine.posthog.capture('redo');
    }

    /**
     * Apply a history-replayed action (the inverse on undo, the forward on
     * redo) to the live frames. `code.write` already persisted the change to
     * source before this runs, so the dispatch must be preview-only:
     * `scheduleRebase: false` suppresses updateStyle's debounced
     * source-rebase tail, which (a) would be a second source write and
     * (b) reads the override map — still holding the pre-replay value at
     * this point — and would re-apply the just-undone style to source
     * ~600ms later.
     */
    private async dispatchHistoryAction(action: Action) {
        if (action.type === 'write-code' && action.previewStyle) {
            await this.dispatchHistoryAction(action.previewStyle);
            return;
        }
        if (action.type === 'update-style') {
            // Sync the override map to the replayed values FIRST, so any
            // later rebase for the same (oid, property) flushes the restored
            // value instead of the stale pre-undo one.
            const activeBp = this.editorEngine.breakpoints?.activeId ?? 'desktop';
            for (const target of action.targets) {
                if (!target.oid) continue;
                this.editorEngine.style.recordOverrideForOid(
                    target.oid,
                    target.breakpoint?.id ?? activeBp,
                    target.change.updated,
                );
            }
        }
        await this.dispatch(action, { scheduleRebase: false, skipWriteGuard: true });
    }

    async applySourcePreview(action: UpdateStyleAction): Promise<void> {
        await this.dispatchHistoryAction(action);
    }

    async resetResponsiveStyle(action: UpdateStyleAction): Promise<boolean> {
        await this.waitForStylePreflights();
        await this.waitForOptimisticStyleRuns();
        this.cancelPendingRebases();
        await Promise.allSettled(Array.from(this.inFlightRebases));
        try {
            await this.editorEngine.code.resetResponsiveStyle(action);
            return true;
        } catch (error) {
            toast.error("Couldn't reset this breakpoint", {
                description: error instanceof Error ? error.message : 'The source could not be saved.',
            });
            return false;
        }
    }

    async finishQueuedStyleAction(action: UpdateStyleAction, saved: boolean): Promise<void> {
        if (saved) {
            this.scheduleRebasesForTargets(action.targets);
            return;
        }
        for (const target of action.targets) {
            if (!target.oid) continue;
            for (const property of Object.keys(target.change.updated)) {
                const key = rebaseKey(target.branchId, target.oid, property);
                const timer = this.rebaseTimers.get(key);
                if (timer) clearTimeout(timer);
                this.rebaseTimers.delete(key);
                this.scheduledRebases.delete(key);
            }
        }
        await Promise.allSettled(Array.from(this.inFlightRebases));
        const inverse: UpdateStyleAction = {
            type: 'update-style',
            targets: action.targets.map((target) => ({
                ...target,
                change: {
                    original: target.change.updated,
                    updated: target.change.original,
                },
            })),
        };
        await this.dispatchHistoryAction(inverse);
    }

    private async dispatch(action: Action, options?: { scheduleRebase?: boolean; skipWriteGuard?: boolean }) {
        switch (action.type) {
            case 'update-style':
                await this.updateStyle(action, options);
                break;
            case 'insert-element':
                // Disabling real-time insert since this is buggy. Will still work but not as fast.
                // await this.insertElement(action);
                break;
            case 'remove-element':
                await this.removeElement(action);
                break;
            case 'move-element':
                await this.moveElement(action);
                break;
            case 'edit-text':
                await this.editText(action);
                break;
            case 'group-elements':
                await this.groupElements(action);
                break;
            case 'ungroup-elements':
                await this.ungroupElements(action);
                break;
            case 'write-code':
                break;
            case 'insert-image':
                this.insertImage(action);
                break;
            case 'remove-image':
                this.removeImage(action);
                break;
            case 'add-interaction':
            case 'update-interaction':
            case 'remove-interaction':
                // InteractionsManager performs the in-memory MobX update and
                // live-iframe push directly; ActionManager.dispatch only sees
                // these on history replay (undo/redo) — replay reapplies via
                // CodeManager.write, which is wired in Phase D.
                break;
            default:
                assertNever(action);
        }
    }

    async updateStyle({ targets }: UpdateStyleAction, options?: { scheduleRebase?: boolean; skipWriteGuard?: boolean }) {
        if (this.editorEngine.canUseDesign === false) return;
        if (!options?.skipWriteGuard && this.styleWriteBlocked({ type: 'update-style', targets })) return;
        // Snapshot the selection BEFORE applying the edit. The action fans each
        // selected element out to its sibling responsive frames so the style
        // lands everywhere, but those sibling frames reuse the same
        // source-derived domId — so without restricting re-selection below, the
        // returned sibling domEls would be re-selected too, ballooning the
        // selection (1→3→9→27…) on every keystroke and thrashing RAM. We only
        // re-select the nodes that were already selected.
        const originallySelected = new Set(
            this.editorEngine.elements.selected.map((el) => `${el.frameId}:${el.domId}`),
        );

        const domEls: DomElement[] = [];
        for (const target of targets) {
            const frameData = this.editorEngine.frames.get(target.frameId);
            if (!frameData) {
                // Skip this target — NOT `return`. A multi-target action fans
                // out across sibling/responsive frames; if one frame isn't
                // booted (or was removed), `return` would abort the whole
                // action: remaining targets get no style AND the source-rebase
                // loop below never runs, so the edit isn't persisted to source
                // at all. Matches the `!frameData.view` handling just below.
                console.error('Failed to get frameView');
                continue;
            }
            // cloneDeep BEFORE the Custom-color conversion below: the
            // StyleChange objects in `target.change` are the same references
            // stored in the undo stack, so mutating them in place would
            // corrupt the recorded action. Cloning here (instead of at the
            // updateStyle call) also still keeps observable values from
            // failing to pass through the webview.
            const change = cloneDeep({
                original: target.change.original,
                updated: target.change.updated,
            });
            for (const value of Object.values(change.updated)) {
                const newValue = this.editorEngine.theme.getColorByName(value.value) ??
                    this.editorEngine.tokens?.resolveVariableValue(`color-${value.value}`);
                if (value.type === StyleChangeType.Custom && newValue) {
                    value.value = newValue;
                }
                if (value.type === StyleChangeType.Custom && !newValue) {
                    value.value = '';
                }
            }

            if (!frameData.view) {
                console.error('No frame view found');
                continue;
            }

            // `change` was already deep-cloned above (so the conversion never
            // touched the stored action and no observables cross the webview).
            // We pass `target.oid` so the iframe can resolve its local domId from the source-AST
            // oid when the parent's domId (the one from the frame the user clicked) doesn't exist
            // locally — that's the cross-iframe sibling fan-out path.
            const domEl = await frameData.view.updateStyle(
                target.domId,
                change,
                target.breakpoint,
                target.oid ?? null,
            );
            if (!domEl) {
                // Sibling fan-out into a frame that hasn't booted yet, or oid not present here.
                // Don't log — that gets noisy with 3+ frames and is not actionable.
                continue;
            }

            domEls.push(domEl);
        }

        // Refresh only the originally-selected nodes — not the sibling-frame
        // copies produced by the responsive fan-out. See the snapshot above.
        // If none of the originally-selected nodes refreshed (e.g. their frame
        // isn't booted), leave the selection untouched rather than re-selecting
        // siblings (which resumes the blow-up) or clearing it via click([]).
        const refreshed = domEls.filter((el) =>
            originallySelected.has(`${el.frameId}:${el.domId}`),
        );
        if (refreshed.length > 0) {
            this.refreshDomElement(refreshed);
        }

        // History replay (undo/redo): the source was already written by
        // `code.write` and the override map was synced by
        // `dispatchHistoryAction`. Scheduling a rebase here would issue a
        // SECOND source write — and one derived from the override map, which
        // on the ordinary edit path lags the replay. Preview-only; stop.
        if (options?.scheduleRebase === false) {
            return;
        }

        // After all iframe injections settle, schedule a debounced source-write
        // for each unique (oid, property) the action touched. Source-write is
        // the durable path; the iframe injection is the optimistic preview.
        if (this.editorEngine.history.isInTransaction) return;
        this.scheduleRebasesForTargets(targets);
    }

    private scheduleRebasesForTargets(targets: UpdateStyleAction['targets']) {
        const seen = new Set<string>();
        for (const target of targets) {
            if (!target.oid) continue;
            for (const property of Object.keys(target.change.updated)) {
                const key = rebaseKey(target.branchId, target.oid, property);
                if (seen.has(key)) continue;
                seen.add(key);
                this.scheduleSourceRebase(target.oid, property, target.branchId);
            }
        }
    }

    private rebaseTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private scheduledRebases = new Map<string, SourceRebaseAttempt>();
    private latestRebaseAttempts = new Map<string, SourceRebaseAttempt>();
    private rebaseFailures = new Map<string, Error>();
    private inFlightRebases = new Set<Promise<void>>();
    private rebasePreparation: BranchDisposalPreparation | null = null;
    private localHistoryPreparations = new Map<string, HistoryDisposalLease>();

    get hasPendingRebases(): boolean {
        return this.rebaseTimers.size > 0 || this.inFlightRebases.size > 0 || this.rebaseFailures.size > 0;
    }

    beginDisposalPreparation(preparation: BranchDisposalPreparation): void {
        if (this.localHistoryPreparations.size > 0 || (this.rebasePreparation && this.rebasePreparation !== preparation)) {
            throw new Error('Responsive source saving is already closing.');
        }
        this.rebasePreparation = preparation;
    }

    cancelDisposalPreparation(preparation: BranchDisposalPreparation): void {
        if (this.rebasePreparation !== preparation) throw new Error('Responsive preparation owner changed.');
        this.rebasePreparation = null;
    }

    beginHistoryDisposalPreparation(branchId: string, lease: HistoryDisposalLease): void {
        if (this.rebasePreparation || this.localHistoryPreparations.has(branchId)) {
            throw new Error('This responsive source history is already closing.');
        }
        this.localHistoryPreparations.set(branchId, lease);
    }

    cancelHistoryDisposalPreparation(branchId: string, lease: HistoryDisposalLease): void {
        if (this.localHistoryPreparations.get(branchId) !== lease) throw new Error('Responsive history preparation owner changed.');
        this.localHistoryPreparations.delete(branchId);
    }

    private getHistoryLease(branchId: string): HistoryDisposalLease | undefined {
        return this.rebasePreparation?.getHistoryLease(branchId) ?? this.localHistoryPreparations.get(branchId);
    }

    private cancelPendingRebases() {
        for (const timer of this.rebaseTimers.values()) clearTimeout(timer);
        this.rebaseTimers.clear();
        this.scheduledRebases.clear();
    }

    requestSourceRebase(oid: string, property: string): void {
        const branches = this.editorEngine.branches;
        const branchId = branches?.hasActiveBranch ? branches.activeBranch.id : undefined;
        if (this.rebasePreparation || (branchId && this.localHistoryPreparations.has(branchId))) {
            throw new Error('Keep this editor open until responsive changes finish saving.');
        }
        this.scheduleSourceRebase(oid, property, branchId);
    }

    private startSourceRebase(attempt: SourceRebaseAttempt): void {
        // Track bookkeeping too, so the strict drain cannot miss a rejection.
        const task = this.runSourceRebase(attempt).then((outcome) => {
            if (outcome === 'applied' && this.latestRebaseAttempts.get(attempt.key) === attempt) {
                attempt.applied = true;
                this.rebaseFailures.delete(attempt.key);
            }
        }, (error: unknown) => {
            // An older failure remains unresolved until the newest intent lands.
            // An older result cannot undo a newer successful confirmation.
            if (!this.latestRebaseAttempts.get(attempt.key)?.applied) {
                this.rebaseFailures.set(attempt.key, error instanceof Error ? error : new Error('Responsive source saving failed.'));
            }
            console.error('Source rebase failed', { oid: attempt.oid, property: attempt.property, error });
        });
        this.inFlightRebases.add(task);
        void task.finally(() => this.inFlightRebases.delete(task));
    }

    private scheduleSourceRebase(oid: string, property: string, branchId?: string) {
        const key = rebaseKey(branchId, oid, property);
        const attempt: SourceRebaseAttempt = { key, oid, property, branchId, applied: false };
        // Supersede at scheduling time, before the debounce can start.
        this.latestRebaseAttempts.set(key, attempt);
        const existing = this.rebaseTimers.get(key);
        if (existing) clearTimeout(existing);
        this.scheduledRebases.set(key, attempt);
        const timer = setTimeout(() => {
            this.rebaseTimers.delete(key);
            this.scheduledRebases.delete(key);
            this.startSourceRebase(attempt);
        }, 600);
        this.rebaseTimers.set(key, timer);
    }

    private async runSourceRebase({ oid, property, branchId }: SourceRebaseAttempt): Promise<'applied' | 'no-source'> {
        const map = this.editorEngine.style.breakpointMapFor(oid, property);
        const removed = this.editorEngine.style.removedBreakpointMapFor(oid, property);
        if (Object.keys(map).length === 0 && Object.keys(removed).length === 0) return 'no-source';
        return this.editorEngine.code.writeResponsiveStyleNow({
            branchId,
            oid,
            property,
            valuesByBreakpoint: map,
            removedByBreakpoint: removed,
            getHistoryLease: () => branchId ? this.getHistoryLease(branchId) : undefined,
        });
    }

    debouncedRefreshDomElement(domEls: DomElement[]) {
        this.editorEngine.elements.click(domEls);
    }

    refreshDomElement = debounce(
        (domEls: DomElement[]) => this.debouncedRefreshDomElement(domEls),
        100,
        { leading: true },
    );

    private async insertElement({
        targets,
        element,
        editText: _editText,
        location,
    }: InsertElementAction) {
        for (const elementMetadata of targets) {
            const frameData = this.editorEngine.frames.get(elementMetadata.frameId);
            if (!frameData?.view) {
                // Skip an unbooted frame (can't receive the optimistic insert
                // anyway) and keep applying to the rest — matches updateStyle.
                console.error('Failed to get frameView');
                continue;
            }

            try {
                const result = await frameData.view.insertElement(element, location);
                if (!result) {
                    // Source is already persisted (history.push→code.write before
                    // dispatch); HMR reconciles this frame. Don't abort the other
                    // frames' optimistic inserts.
                    console.error('Failed to insert element');
                    continue;
                }

                void this.refreshAndClickMutatedElement(result.domEl, frameData, result.newMap);
            } catch (err) {
                console.error('Error inserting element:', err);
            }
        }
    }

    private async removeElement({ targets, location }: RemoveElementAction) {
        for (const target of targets) {
            const frameData = this.editorEngine.frames.get(target.frameId);
            if (!frameData?.view) {
                // Skip an unbooted frame and keep applying to the rest.
                console.error('Failed to get frameView');
                continue;
            }

            const result = await frameData.view.removeElement(location);

            if (!result) {
                // Source persisted before dispatch; HMR reconciles. Keep going.
                console.error('Failed to remove element');
                continue;
            }

            await this.editorEngine.overlay.refresh();

            void this.refreshAndClickMutatedElement(result.domEl, frameData, result.newMap);
        }
    }

    private async moveElement({ targets, location }: MoveElementAction) {
        for (const target of targets) {
            const frameData = this.editorEngine.frames.get(target.frameId);
            if (!frameData?.view) {
                // Skip an unbooted frame and keep applying to the rest.
                console.error('Failed to get frameView');
                continue;
            }
            const result = await frameData.view.moveElement(target.domId, location.index);
            if (!result) {
                // Source persisted before dispatch; HMR reconciles. Keep going.
                console.error('Failed to move element');
                continue;
            }
            void this.refreshAndClickMutatedElement(result.domEl, frameData, result.newMap);
        }
    }

    private async editText({ targets, newContent, textSlots }: EditTextAction) {
        for (const target of targets) {
            const frameData = this.editorEngine.frames.get(target.frameId);
            if (!frameData?.view) {
                // Skip an unbooted frame and keep applying to the rest.
                console.error('Failed to get frameView');
                continue;
            }
            const result = await frameData.view.editText(target.domId, newContent, textSlots);
            if (!result) {
                // Source persisted before dispatch; HMR reconciles. Keep going.
                console.error('Failed to edit text');
                continue;
            }

            void this.refreshAndClickMutatedElement(result.domEl, frameData, result.newMap);
        }
    }

    private async groupElements({ parent, container, children }: GroupElementsAction) {
        const frameData = this.editorEngine.frames.get(parent.frameId);
        if (!frameData?.view) {
            console.error('Failed to get frameView');
            return;
        }

        const result = await frameData.view.groupElements(parent, container, children);

        if (!result) {
            console.error('Failed to group elements');
            return;
        }

        void this.refreshAndClickMutatedElement(result.domEl, frameData, result.newMap);
    }

    private async ungroupElements({ parent, container }: UngroupElementsAction) {
        const frameData = this.editorEngine.frames.get(parent.frameId);
        if (!frameData?.view) {
            console.error('Failed to get frameView');
            return;
        }

        const result = await frameData.view.ungroupElements(parent, container);

        if (!result) {
            console.error('Failed to ungroup elements');
            return;
        }

        void this.refreshAndClickMutatedElement(result.domEl, frameData, result.newMap);
    }

    private insertImage({ targets, image: _image }: InsertImageAction) {
        targets.forEach((target) => {
            const frameView = this.editorEngine.frames.get(target.frameId);
            if (!frameView) {
                console.error('Failed to get frameView');
                return;
            }
            // sendToWebview(frameView, WebviewChannels.INSERT_IMAGE, {
            //     domId: target.domId,
            //     image,
            // });
        });
    }

    private removeImage({ targets }: RemoveImageAction) {
        targets.forEach((target) => {
            const frameData = this.editorEngine.frames.get(target.frameId);
            if (!frameData) {
                console.error('Failed to get frameView');
                return;
            }
            // sendToWebview(frameView, WebviewChannels.REMOVE_IMAGE, {
            //     domId: target.domId,
            // });
        });
    }

    async refreshAndClickMutatedElement(
        domEl: DomElement,
        frameData: FrameData,
        newMap: Map<string, LayerNode> | null,
    ) {
        this.editorEngine.state.setEditorMode(EditorMode.DESIGN);
        this.editorEngine.elements.click([domEl]);

        if (newMap) {
            this.editorEngine.ast.updateMap(frameData.frame.id, newMap, domEl.domId);
        }
    }

    /**
     * Fire every debounced source-rebase immediately. Called from the
     * beforeunload guard in CodeManager: a reload inside the 600ms debounce
     * window would otherwise silently drop the responsive source write
     * ("my edit didn't save after reload"). The writes are fire-and-forget —
     * unload won't await them — but enqueueing before navigation is what
     * gives them a chance to land.
     */
    flushPendingRebases() {
        for (const [key, timer] of this.rebaseTimers) {
            clearTimeout(timer);
            const attempt = this.scheduledRebases.get(key);
            if (attempt) this.startSourceRebase(attempt);
        }
        this.rebaseTimers.clear();
        this.scheduledRebases.clear();
    }

    async flushAndWaitForPendingRebases(preparation?: BranchDisposalPreparation): Promise<void> {
        if (preparation && this.rebasePreparation !== preparation) {
            throw new Error('Responsive preparation owner changed.');
        }
        await this.waitForStylePreflights();
        await this.waitForOptimisticStyleRuns();
        this.flushPendingRebases();
        while (this.inFlightRebases.size > 0) {
            await Promise.allSettled(Array.from(this.inFlightRebases));
            this.flushPendingRebases();
        }
        if (this.rebaseFailures.size > 0) {
            throw new Error('Responsive changes could not finish saving. Keep this editor open to retry them.');
        }
    }

    clear() {
        // Engine teardown flushes and waits for source rebases first.
        this.cancelPendingRebases();
        this.latestRebaseAttempts.clear();
        this.rebaseFailures.clear();
        this.rebasePreparation = null;
        this.localHistoryPreparations.clear();
        this.latestStyleEdit.clear();
        // Drop the trailing re-click: without this, the 100ms trailing edge
        // fires after teardown and re-selects elements on a cleared engine.
        this.refreshDomElement.cancel();
    }
}
