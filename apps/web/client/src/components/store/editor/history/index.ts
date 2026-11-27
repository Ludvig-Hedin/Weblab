import { freezeCloudPropertyApproval } from '../sandbox/cloud-property-approval';
import { freezeCloudImageApproval } from '../sandbox/cloud-image-approval';
import { freezeCloudTextApproval } from '../sandbox/cloud-source';
import { debounce, isEqual } from 'lodash';
import { makeAutoObservable, observable, runInAction } from 'mobx';

import type { Action, UpdateStyleAction } from '@weblab/models/actions';
import { jsonClone } from '@weblab/utility';

import type { EditorEngine } from '../engine';
import { transformRedoAction, undoAction, updateTransactionActions } from './helpers';
import { clearHistory, loadHistory, saveHistory } from './storage';

/** Keep a copied authority pin immutable while the stack remains observable. */
function retainCloudTextHistoryPin(action: Action): Action {
    if (action.type === 'write-code' && action.cloudProperty) return { ...action, cloudProperty: observable.object({
        previousValue: action.cloudProperty.previousValue, value: action.cloudProperty.value, pin: freezeCloudPropertyApproval(action.cloudProperty.pin) }, { pin: observable.ref }) };
    if (action.type === 'write-code' && action.cloudImage) return { ...action, cloudImage: observable.object({
        field: action.cloudImage.field, pin: freezeCloudImageApproval(action.cloudImage.pin) }, { pin: observable.ref }) };
    return action.type === 'edit-text' && action.cloudText
        ? { ...action, cloudText: freezeCloudTextApproval(action.cloudText) }
        : action;
}

enum TransactionType {
    IN_TRANSACTION = 'in-transaction',
    NOT_IN_TRANSACTION = 'not-in-transaction',
}

interface InTransaction {
    type: TransactionType.IN_TRANSACTION;
    actions: Action[];
}

interface NotInTransaction {
    type: TransactionType.NOT_IN_TRANSACTION;
}

type TransactionState = InTransaction | NotInTransaction;

interface SourceWrite {
    actions: Action[];
    gesture?: InTransaction;
    prepare?: () => Promise<void>;
    write?: (action: Action) => Promise<boolean>;
    retryAdmission?: (action: Action) => boolean | Promise<boolean>;
    waiters: Array<(saved: boolean) => void>;
}

export interface HistoryDisposalLease { readonly owner: symbol }
export interface HistoryDisposalCheckpoint {
    readonly generation: number;
    readonly sourceVersion: string | null | undefined;
    readonly externalRevision: string | null | undefined;
    readonly ownRevision: string | null | undefined;
}

export class HistoryManager {
    // Entries stay in admission order, including the in-flight head. A failed
    // close pauses this same queue; retry never reconstructs a second queue.
    private writeQueue: SourceWrite[] = [];
    private paused = false;

    get isCommitPending(): boolean {
        return this.writeQueue.length > 0 && !this.paused;
    }

    /** Read-only eligibility for discarding one rejected cloud text session by document reload. */
    canNavigateRejectedText(
        target: Extract<Action, { type: 'edit-text' }>['targets'][number],
        lease?: HistoryDisposalLease,
    ): boolean {
        if (this.disposed || this.drainPromise ||
            this.disposalFlushInProgress || this.editorEngine.code.hasPendingWrites ||
            (lease ? this.disposalLease !== lease : this.disposalLease !== null) ||
            target.branchId !== this.branchId) return false;
        const open = this.inTransaction.type === TransactionType.IN_TRANSACTION ? this.inTransaction.actions : [];
        if (this.writeQueue.some(job => job.prepare)) return false;
        return [...this.writeQueue.flatMap(job => job.gesture?.actions ?? job.actions), ...open].every((action) => action.type === 'edit-text' &&
                action.targets.length === 1 && action.targets.every((item) =>
                    item.branchId === target.branchId && item.frameId === target.frameId &&
                    item.domId === target.domId && item.oid === target.oid));
    }

    /** Resolves once every committed transaction has landed on the undo stack. */
    waitForCommit = async (): Promise<void> => {
        while (this.drainPromise) {
            await this.drainPromise.catch(() => undefined);
        }
    };

    get isTransactionOpen(): boolean {
        return this.isInTransaction || this.hasRetainedActions || this.writeQueue.some(job => job.gesture);
    }

    constructor(
        private editorEngine: EditorEngine,
        private branchId: string,
        private undoStack: Action[] = [],
        private redoStack: Action[] = [],
        private inTransaction: TransactionState = {
            type: TransactionType.NOT_IN_TRANSACTION,
        },
    ) {
        this.undoStack = this.undoStack.map(retainCloudTextHistoryPin);
        this.redoStack = this.redoStack.map(retainCloudTextHistoryPin);
        makeAutoObservable<this, 'persistDebounced' | 'drainPromise' | 'writeQueue' | 'sourceVersion' | 'externalRevision' | 'ownRevision' | 'lastExternalRevision' | 'lastOwnRevision' | 'storageChain' | 'disposalFlushInProgress' | 'disposalLease' | 'disposalFailure' | 'mutationGeneration' | 'disposed' | 'hydrating' | 'hydrationFailed' | 'sourcePreparationFailure'>(this, {
            persistDebounced: false,
            drainPromise: false,
            writeQueue: observable.shallow,
            sourceVersion: false,
            externalRevision: false,
            ownRevision: false,
            lastExternalRevision: false,
            lastOwnRevision: false,
            storageChain: false,
            disposalFlushInProgress: false,
            disposalLease: false,
            disposalFailure: false,
            mutationGeneration: false,
            disposed: false,
            hydrating: false,
            hydrationFailed: false,
            sourcePreparationFailure: false,
        });
    }

    private sourceVersion: (() => string | null) | null = null;
    private externalRevision: (() => string | null) | null = null;
    private ownRevision: (() => string | null) | null = null;
    private lastExternalRevision: string | null = null;
    private lastOwnRevision: string | null = null;
    private storageChain: Promise<void> = Promise.resolve();
    private disposalFlushInProgress = false;
    private disposalLease: HistoryDisposalLease | null = null;
    private disposalFailure: Error | null = null;
    private mutationGeneration = 0;
    private disposed = false;
    private hydrating = false;
    private hydrationFailed = false;
    private sourcePreparationFailure: Error | null = null;

    private get refusesAdmission(): boolean {
        return this.disposed || this.disposalLease !== null || this.editorEngine.isClosing === true;
    }

    get isPreparingForDisposal(): boolean { return this.disposalLease !== null || this.disposed; }

    beginDisposalPreparation(): HistoryDisposalLease {
        if (this.disposed || this.disposalLease) throw new Error('This history is already closing.');
        const lease = { owner: Symbol('history-disposal') };
        this.disposalLease = lease;
        this.disposalFailure = null;
        return lease;
    }

    cancelDisposalPreparation(lease: HistoryDisposalLease): void {
        this.assertDisposalOwner(lease);
        if (this.disposed) throw new Error('Released history cannot be reopened.');
        this.disposalLease = null;
        this.disposalFailure = null;
    }

    private assertDisposalOwner(lease: HistoryDisposalLease): void {
        if (this.disposalLease !== lease || this.disposed) throw new Error('The history preparation owner changed.');
    }

    assertDisposalCheckpoint(lease: HistoryDisposalLease, checkpoint: HistoryDisposalCheckpoint): void {
        this.assertDisposalOwner(lease);
        this.assertSourceCurrentForDisposal();
        if (this.disposalFailure) throw this.disposalFailure;
        if (this.mutationGeneration !== checkpoint.generation ||
            this.writeQueue.length > 0 || this.isTransactionOpen ||
            this.editorEngine.code.hasPendingWrites || this.sourceVersion?.() !== checkpoint.sourceVersion ||
            this.externalRevision?.() !== checkpoint.externalRevision || this.ownRevision?.() !== checkpoint.ownRevision) {
            throw new Error('The editor changed while saving. Keep it open and retry.');
        }
    }

    acknowledgeDisposalSourceWrite(lease: HistoryDisposalLease, expectedExternalRevision: string | null | undefined): void {
        this.assertDisposalOwner(lease);
        if (this.externalRevision?.() !== expectedExternalRevision) throw new Error('The source changed while saving final text.');
        this.lastOwnRevision = this.ownRevision?.() ?? null;
        this.mutationGeneration++;
    }

    getExternalRevisionForDisposal(lease: HistoryDisposalLease): string | null | undefined {
        this.assertDisposalOwner(lease);
        return this.externalRevision?.();
    }

    private assertEmptySourcePreparation(lease: HistoryDisposalLease): void {
        this.assertDisposalOwner(lease);
        if (!this.hasHydrated || this.hydrating || this.hydrationFailed || this.disposalFailure || this.editorEngine.isClosing ||
            this.undoStack.length || this.redoStack.length || this.isTransactionOpen ||
            this.writeQueue.length || this.disposalFlushInProgress ||
            this.editorEngine.code.hasPendingWrites || this.editorEngine.text?.hasPendingWork ||
            this.editorEngine.action?.hasPendingStylePreflights || this.editorEngine.action?.hasPendingRebases) {
            throw new Error('Local preparation requires a settled editor with empty history.');
        }
    }

    /** Pin an empty, hydrated history before reviewed source preparation changes its mirror. */
    captureEmptySourcePreparation(lease: HistoryDisposalLease): HistoryDisposalCheckpoint {
        this.assertEmptySourcePreparation(lease);
        this.assertSourceCurrentForDisposal();
        if (!this.sourceVersion || !this.externalRevision || !this.ownRevision) {
            throw new Error('Local history has not attached its source.');
        }
        return { generation: this.mutationGeneration, sourceVersion: this.sourceVersion(),
            externalRevision: this.externalRevision(), ownRevision: this.ownRevision() };
    }

    /** Accept only a proven mirrored-text snapshot, without clearing any recovery history. */
    completeEmptySourcePreparation(lease: HistoryDisposalLease, before: HistoryDisposalCheckpoint, expectedMirroredVersion: string): void {
        this.assertEmptySourcePreparationOwner(lease, before);
        if (this.sourceVersion?.() !== expectedMirroredVersion ||
            this.externalRevision?.() == null || this.ownRevision?.() == null) {
            throw new Error('The mirrored source changed during preparation.');
        }
        this.lastExternalRevision = this.externalRevision?.() ?? null;
        this.lastOwnRevision = this.ownRevision?.() ?? null;
        this.mutationGeneration++;
    }

    assertEmptySourcePreparationOwner(lease: HistoryDisposalLease, before: HistoryDisposalCheckpoint): void {
        this.assertEmptySourcePreparation(lease);
        if (this.mutationGeneration !== before.generation ||
            this.lastExternalRevision !== before.externalRevision || this.lastOwnRevision !== before.ownRevision) {
            throw new Error('The local history changed during preparation.');
        }
    }

    rejectChangedPreparationSource(lease: HistoryDisposalLease, before: HistoryDisposalCheckpoint): void {
        this.assertEmptySourcePreparationOwner(lease, before);
        this.sourcePreparationFailure = new Error('The mirrored local source changed before preparation. Reopen the site before saving.');
        this.mutationGeneration++;
    }

    private assertSourceCurrentForDisposal(): void {
        if (this.sourcePreparationFailure) throw this.sourcePreparationFailure;
        if (this.sourceVersion && this.sourceVersion() === null) {
            throw new Error('The source version could not be verified before saving history.');
        }
        if (!this.externalRevision || !this.ownRevision) return;
        if (this.externalRevision() === null || this.ownRevision() === null ||
            this.externalRevision() !== this.lastExternalRevision ||
            this.ownRevision() !== this.lastOwnRevision) {
            throw new Error('The source changed before history could be saved. Keep this editor open to recover its edits.');
        }
    }

    private enqueueStorage(task: () => Promise<void>): Promise<void> {
        const run = this.storageChain.then(task);
        this.storageChain = run.catch(() => undefined);
        return run;
    }

    /** Persistent local history is checked against disk; live history tracks external edits. */
    setSourceVersion(
        readVersion: () => string | null,
        readExternalRevision: () => string | null,
        readOwnRevision: () => string | null,
    ): void {
        if (this.disposed) throw new Error('Released history cannot attach a new source.');
        this.mutationGeneration++;
        this.sourceVersion = readVersion;
        this.externalRevision = readExternalRevision;
        this.ownRevision = readOwnRevision;
        this.lastExternalRevision = readExternalRevision();
        this.lastOwnRevision = readOwnRevision();
    }

    private sourceIsCurrent(): boolean {
        if (this.disposalFlushInProgress || this.disposalLease) {
            this.assertSourceCurrentForDisposal();
            return true;
        }
        if (!this.externalRevision || !this.ownRevision) return true;
        const current = this.externalRevision();
        const own = this.ownRevision();
        if (current !== null && own !== null &&
            current === this.lastExternalRevision && own === this.lastOwnRevision) return true;
        this.persistDebounced.cancel();
        runInAction(() => {
            this.mutationGeneration++;
            this.undoStack = [];
            this.redoStack = [];
        });
        this.lastExternalRevision = current;
        this.lastOwnRevision = own;
        void this.enqueueStorage(() => clearHistory(this.branchId)).catch((err) => {
            console.warn('[HistoryManager] Failed to clear stale local history:', err);
        });
        return false;
    }

    /** Called after an undo or redo has actually reached local source. */
    async confirmSourceReplay(expectedExternalRevision: string | null): Promise<boolean> {
        if (this.disposed) return false;
        if (!this.sourceVersion || !this.externalRevision || !this.ownRevision) return false;
        const sourceVersion = this.sourceVersion();
        const ownRevision = this.ownRevision();
        if (sourceVersion === null || ownRevision === null || expectedExternalRevision === null ||
            this.externalRevision() !== expectedExternalRevision) {
            if (!this.disposalLease) this.sourceIsCurrent();
            return false;
        }
        this.lastOwnRevision = ownRevision;
        this.mutationGeneration++;
        this.persistDebounced.cancel();
        const undo = [...this.undoStack];
        const redo = [...this.redoStack];
        await this.enqueueStorage(() => saveHistory(this.branchId, undo, redo, sourceVersion));
        return this.sourceVersion() === sourceVersion && this.ownRevision() === ownRevision &&
            this.externalRevision() === expectedExternalRevision;
    }

    /** A source rebase can finish after the action write; save its final disk version. */
    async noteOwnSourceWrite(lease?: HistoryDisposalLease): Promise<void> {
        if (this.disposalLease || this.disposed) {
            if (!lease) throw new Error('A closing source write needs its preparation owner.');
            this.assertDisposalOwner(lease);
        } else if (lease) {
            throw new Error('The source write preparation owner changed.');
        }
        if (!this.sourceVersion) { this.mutationGeneration++; return; }
        if (this.externalRevision?.() !== this.lastExternalRevision) {
            this.sourceIsCurrent();
            return;
        }
        this.lastOwnRevision = this.ownRevision?.() ?? null;
        this.mutationGeneration++;
        this.persistDebounced.cancel();
        await this.persist();
    }

    private drainPromise: Promise<void> | null = null;
    private writingSource = false;

    /** B13: set once so a repeated hydrate can't re-prepend persisted entries. */
    private hasHydrated = false;

    get canUndo() {
        return this.undoStack.length > 0;
    }

    get canRedo() {
        return this.redoStack.length > 0;
    }

    get isInTransaction() {
        return this.inTransaction.type === TransactionType.IN_TRANSACTION;
    }

    get hasRetainedActions() {
        return this.paused;
    }

    get length() {
        return this.undoStack.length;
    }

    hydrate = async (): Promise<void> => {
        if (this.disposed) return;
        // B13: hydrate at most once — a second call (or one racing the first)
        // must not re-prepend persisted entries. Set before the `await` so a
        // concurrent double-invoke is also a no-op.
        if (this.hasHydrated) {
            return;
        }
        this.hasHydrated = true;
        this.hydrating = true;
        try {
            const saved = await loadHistory(this.branchId);
            if (this.disposed) return;
            if (saved) {
                const currentVersion = this.sourceVersion?.();
                if (this.sourceVersion && (
                    currentVersion === null ||
                    saved.sourceVersion !== currentVersion
                )) {
                    await this.enqueueStorage(() => clearHistory(this.branchId));
                    return;
                }
                // Post-`await` writes run outside makeAutoObservable's implicit
                // action — wrap so MobX strict-mode accepts them.
                runInAction(() => {
                    this.mutationGeneration++;
                    // B13: MERGE, don't replace — actions pushed while
                    // IndexedDB was resolving must survive. Persisted entries
                    // are older, so they go below anything already in memory.
                    this.undoStack = [...saved.undoStack.map(retainCloudTextHistoryPin), ...this.undoStack];
                    this.redoStack = [...saved.redoStack.map(retainCloudTextHistoryPin), ...this.redoStack];
                });
            }
        } catch (err) {
            this.hydrationFailed = true;
            console.warn('[HistoryManager] Failed to load persisted history:', err);
        } finally {
            this.hydrating = false;
        }
    };

    private persist = async (): Promise<void> => {
        try {
            if (this.writingSource || this.editorEngine.code.hasPendingWrites) {
                this.persistDebounced();
                return;
            }
            if (!this.sourceIsCurrent()) return;
            const undoStack = [...this.undoStack];
            const redoStack = [...this.redoStack];
            const sourceVersion = this.sourceVersion?.() ?? undefined;
            await this.enqueueStorage(() => saveHistory(
                this.branchId,
                undoStack,
                redoStack,
                sourceVersion,
            ));
        } catch (err) {
            console.warn(
                '[HistoryManager] Failed to persist history:',
                err instanceof Error ? err.message : err,
            );
        }
    };

    private persistDebounced = debounce(() => {
        void this.persist();
    }, 400);

    startTransaction = async (): Promise<void> => {
        if (this.refusesAdmission) throw new Error('This editor is saving before it closes.');
        // Startup assets and manual code saves can finish between gestures.
        // Adopt only completed own writes before opening a fresh transaction;
        // a remote change or retained failed edit must keep its old baseline.
        if (!this.isTransactionOpen && this.writeQueue.length === 0 &&
            !this.editorEngine.code.hasPendingWrites && !this.editorEngine.action?.hasPendingRebases &&
            !this.editorEngine.action?.hasPendingStylePreflights && !this.editorEngine.text?.isFinalizing &&
            this.sourceVersion && this.sourceVersion() !== null && this.externalRevision && this.ownRevision &&
            this.externalRevision() !== null && this.externalRevision() === this.lastExternalRevision &&
            this.ownRevision() !== null) {
            this.sourceIsCurrent();
        }
        this.mutationGeneration++;
        // Open the transaction synchronously so pushes from this gesture merge
        // immediately — callers fire-and-forget from pointer handlers, and a
        // gap here would leak per-push code writes.
        // After a failed close, release retained actions before opening the
        // next gesture. Its samples must stay attached to their own transaction.
        const previous = this.hasRetainedActions
            ? this.commitTransaction() : this.drainPromise;
        this.inTransaction = { type: TransactionType.IN_TRANSACTION, actions: [] };
        // Opening a new gesture cannot capture writes already in the queue.
        if (previous) {
            await previous.catch(() => undefined);
        }
    };

    private gestureRuns = new WeakMap<InTransaction, Set<Promise<boolean>>>();

    /** Bind each input sample to its gesture before source validation yields. */
    runStyleInGesture(run: (queue: (action: UpdateStyleAction) => boolean) => Promise<boolean>): Promise<boolean> {
        const gesture = this.inTransaction;
        if (this.refusesAdmission || gesture.type !== TransactionType.IN_TRANSACTION) return Promise.resolve(false);
        const runs = this.gestureRuns.get(gesture) ?? new Set<Promise<boolean>>();
        this.gestureRuns.set(gesture, runs);
        const result = run(action => {
            // Admission already happened above. A close lease must drain this
            // sample, while new gestures remain excluded by refusesAdmission.
            if (this.disposed) return false;
            if (this.disposalLease) this.assertSourceCurrentForDisposal();
            runInAction(() => {
                this.mutationGeneration++;
                gesture.actions = updateTransactionActions(gesture.actions, action);
            });
            return true;
        });
        runs.add(result);
        void result.finally(() => runs.delete(result)).catch(() => undefined);
        return result;
    }

    commitTransaction = async (strict = false, lease?: HistoryDisposalLease) => {
        if (strict) {
            if (!lease) throw new Error('Strict history commit needs its preparation owner.');
            this.assertDisposalOwner(lease);
        } else if (this.refusesAdmission) {
            throw new Error('This editor is saving before it closes.');
        }
        if (!this.isInTransaction && !this.hasRetainedActions) {
            await this.waitForCommit();
            return !this.hasRetainedActions;
        }
        const gesture = this.inTransaction.type === TransactionType.IN_TRANSACTION ? this.inTransaction : undefined;
        this.inTransaction = { type: TransactionType.NOT_IN_TRANSACTION };
        this.mutationGeneration++;
        const runs = gesture ? [...(this.gestureRuns.get(gesture) ?? [])] : [];
        let saved: boolean;
        if (gesture && (gesture.actions.length || runs.length)) {
            saved = await this.enqueueWrite({
                gesture, actions: [], waiters: [],
                prepare: async () => {
                    const results = await Promise.allSettled(runs);
                    if (this.disposalLease && results.some(result => result.status === 'rejected' || !result.value)) {
                        throw new Error('An admitted edit could not be saved.');
                    }
                    if (gesture.actions.some(action => action.type === 'update-style')) {
                        await this.editorEngine.action.waitForQueuedStyleDispatches();
                    }
                },
            });
        } else {
            await this.drainWrites();
            saved = !this.hasRetainedActions;
        }
        if (strict && this.disposalFailure) throw this.disposalFailure;
        return saved;
    };

    private enqueueWrite(job: SourceWrite): Promise<boolean> {
        // A refused optimistic input can be resubmitted verbatim. If it is
        // already last in the paused queue, join that exact write on retry.
        const last = this.writeQueue.at(-1);
        if (this.paused && last && !last.gesture && !job.gesture && !last.write && !job.write &&
            job.actions[0]?.type === 'update-style' && isEqual(last.actions, job.actions)) {
            job = last;
        } else {
            this.writeQueue.push(job);
        }
        const completion = new Promise<boolean>(resolve => job.waiters.push(resolve));
        void this.drainWrites();
        return completion;
    }

    private drainWrites(): Promise<void> {
        if (this.drainPromise) return this.drainPromise;
        if (!this.writeQueue.length || this.disposalFailure) return Promise.resolve();
        const recovering = this.paused;
        this.paused = false;
        this.drainPromise = Promise.resolve().then(async () => {
            try {
                while (this.writeQueue.length) {
                    const job = this.writeQueue[0]!;
                    try {
                        await this.writeEntry(job, recovering);
                    } catch (error) {
                        if (this.disposalLease) this.disposalFailure = error instanceof Error ? error : new Error('An admitted edit could not be saved.');
                        if (this.disposalLease || recovering || (!job.write && (job.gesture?.actions ?? job.actions)[0]?.type === 'update-style')) {
                            runInAction(() => { this.paused = true; });
                            for (const pending of this.writeQueue) {
                                for (const resolve of pending.waiters.splice(0)) resolve(false);
                            }
                            return;
                        }
                        // A refused ordinary command has reported its failure to the
                        // caller. Continue processing separately admitted commands.
                        this.finishEntry(job, false);
                        continue;
                    }
                    this.finishEntry(job, true);
                }
            } finally {
                this.drainPromise = null;
            }
        });
        return this.drainPromise;
    }

    private finishEntry(job: SourceWrite, saved: boolean): void {
        this.writeQueue.shift();
        for (const resolve of job.waiters.splice(0)) resolve(saved);
    }

    private async writeEntry(job: SourceWrite, recovering: boolean): Promise<void> {
        if (job.prepare) {
            const prepare = job.prepare;
            job.prepare = undefined;
            await prepare();
        }
        const actions = job.gesture?.actions ?? job.actions;
        while (actions.length) {
            const action = actions[0]!;
            if (recovering && job.retryAdmission && !(await job.retryAdmission(action))) {
                throw new Error('The source edit could not be revalidated.');
            }
            const saved = await this.writeAndRecord(action, job.write, recovering);
            if (!saved) {
                if (job.gesture && action.type === 'update-style' && !recovering && !this.disposalLease) {
                    await this.editorEngine.action.finishQueuedStyleAction(action, false);
                }
                throw new Error(job.gesture ? 'An unfinished edit could not be saved.' : 'An admitted edit could not be saved.');
            }
            // Advance before running preview callbacks: a committed write
            // must never replay because a later callback failed.
            runInAction(() => { actions.shift(); });
            if (job.gesture && action.type === 'update-style') {
                await this.editorEngine.action.finishQueuedStyleAction(action, true);
            }
        }
    }

    push = async (action: Action, options?: { direct: boolean }): Promise<boolean> => {
        if (this.refusesAdmission) return false;
        return this.pushAdmitted(action, options?.direct);
    };

    private pushAdmitted = async (action: Action, direct = false): Promise<boolean> => {
        if (!direct && this.inTransaction.type === TransactionType.IN_TRANSACTION) {
            this.mutationGeneration++;
            this.inTransaction.actions = updateTransactionActions(this.inTransaction.actions, action);
            return true;
        }
        return this.enqueueWrite({ actions: [action], waiters: [] });
    };

    /** Final captured text must not erase history on an external source conflict. */
    pushForDisposal = async (action: Action, lease: HistoryDisposalLease): Promise<boolean> => {
        this.assertDisposalOwner(lease);
        if (this.disposalFailure) throw this.disposalFailure;
        const previous = this.disposalFlushInProgress;
        this.disposalFlushInProgress = true;
        try {
            this.assertSourceCurrentForDisposal();
            return await this.pushAdmitted(action);
        } finally {
            this.disposalFlushInProgress = previous;
        }
    };

    /** Source/structure edits must finish saving before their preview changes. */
    pushImmediate = async (
        action: Action,
        write?: (action: Action) => Promise<boolean>,
        admit?: (action: Action) => boolean | Promise<boolean>,
    ): Promise<boolean> => {
        if (this.refusesAdmission) return false;
        if (this.isInTransaction) void this.commitTransaction();
        if (admit) {
            if (this.hasRetainedActions) await this.drainWrites();
            await this.waitForCommit();
            if (this.refusesAdmission || this.hasRetainedActions) return false;
            const generation = this.mutationGeneration;
            if (!(await admit(action)) || this.refusesAdmission || this.isTransactionOpen ||
                this.writeQueue.length > 0 || generation !== this.mutationGeneration) return false;
        }
        return this.enqueueWrite({ actions: [action], write, retryAdmission: admit, waiters: [] });
    };

    private writeAndRecord = async (action: Action, write?: (action: Action) => Promise<boolean>, retrying = false): Promise<boolean> => {
        if (retrying) this.assertSourceCurrentForDisposal();
        else this.sourceIsCurrent();
        const expectedExternalRevision = this.externalRevision?.() ?? null;
        action = retainCloudTextHistoryPin(action);
        let historyEntry = action;
        this.writingSource = true;
        try {
            const written = write ? await write(action) : await this.editorEngine.code.write(action, undefined, entry => {
                historyEntry = entry;
            });
            if (!written) return false;
        } finally {
            this.writingSource = false;
        }

        // Publish the exact diff returned by the writer after its save lands.
        runInAction(() => {
            this.undoStack.push(retainCloudTextHistoryPin(jsonClone(historyEntry)));
            this.redoStack = [];
            this.mutationGeneration++;
        });

        try {
            await this.afterSourceWrite(action, expectedExternalRevision);
        } catch (error) {
            // Source and Undo have landed. A later tracking failure can block
            // close, but replaying this queue entry would duplicate the write.
            if (this.disposalLease) this.disposalFailure = error instanceof Error ? error : new Error('Could not confirm the saved history.');
            console.warn('[HistoryManager] Could not confirm the saved history', error);
        }
        return true;
    };

    private async afterSourceWrite(action: Action, expectedExternalRevision: string | null | undefined): Promise<void> {
        if (this.externalRevision && this.externalRevision() !== expectedExternalRevision) {
            // The edit already landed. The strict flush will reject the new
            // source revision without treating this action as an unsaved retry.
            if (!this.disposalFlushInProgress) this.sourceIsCurrent();
            return;
        }
        if (this.ownRevision) this.lastOwnRevision = this.ownRevision();

        switch (action.type) {
            case 'update-style':
                this.editorEngine.posthog.capture('style_action', {
                    style: jsonClone(
                        action.targets.length > 0 ? action.targets[0]?.change.updated : {},
                    ),
                });
                break;
            case 'insert-element':
                this.editorEngine.posthog.capture('insert_action');
                break;
            case 'move-element':
                this.editorEngine.posthog.capture('move_action');
                break;
            case 'remove-element':
                this.editorEngine.posthog.capture('remove_action');
                break;
            case 'edit-text':
                this.editorEngine.posthog.capture('edit_text_action');
        }

        if (this.sourceVersion) {
            this.persistDebounced.cancel();
            await this.persist();
        } else {
            this.persistDebounced();
        }
    }

    undo = async (admit?: (action: Action) => boolean | Promise<boolean>): Promise<{ inverse: Action; redoEntry: Action; externalRevision: string | null } | null> => {
        if (this.refusesAdmission) return null;
        await this.waitForCommit();
        if (this.isInTransaction || this.hasRetainedActions) {
            await this.commitTransaction();
        }
        await this.waitForCommit();
        if (this.refusesAdmission || this.hasRetainedActions) return null;

        if (!this.sourceIsCurrent()) return null;

        const candidate = this.undoStack[this.undoStack.length - 1];
        if (!candidate) return null;
        const inverse = undoAction(candidate);
        if (admit) {
            const generation = this.mutationGeneration;
            if (!(await admit(inverse)) || this.refusesAdmission || this.isTransactionOpen ||
                this.writeQueue.length > 0 ||
                generation !== this.mutationGeneration ||
                this.undoStack[this.undoStack.length - 1] !== candidate || !this.sourceIsCurrent()) return null;
        }

        // May run after the `await commitTransaction()` above — mutate the
        // stacks inside an explicit action for MobX strict-mode.
        const moved = runInAction(() => {
            const top = this.undoStack.pop();
            if (top == null) {
                return null;
            }
            this.redoStack.push(top);
            this.mutationGeneration++;
            return top;
        });
        if (moved == null) {
            return null;
        }
        if (!this.sourceVersion) this.persistDebounced();

        // `redoEntry` is the action moved onto the redo stack; the caller hands
        // it back to `rollbackUndo` if applying `inverse` fails, so the stacks
        // stay in sync with the actual file contents.
        return { inverse, redoEntry: moved, externalRevision: this.externalRevision?.() ?? null };
    };

    /**
     * Reverse the most recent `undo()` stack move. Called when the caller's
     * apply of the inverse action failed (the file was never reverted), so the
     * undone action must go back onto the undo stack. Removes by reference so an
     * interleaved undo/redo can't cause the wrong entry to be restored.
     */
    rollbackUndo = (redoEntry: Action) => {
        if (this.disposed) return;
        const idx = this.redoStack.lastIndexOf(redoEntry);
        if (idx === -1) {
            return;
        }
        this.redoStack.splice(idx, 1);
        this.undoStack.push(redoEntry);
        this.mutationGeneration++;
        if (!this.sourceVersion) this.persistDebounced();
    };

    redo = async (admit?: (action: Action) => boolean | Promise<boolean>): Promise<{ forward: Action; redoEntry: Action; externalRevision: string | null } | null> => {
        if (this.refusesAdmission) return null;
        await this.waitForCommit();
        if (this.isInTransaction || this.hasRetainedActions) {
            await this.commitTransaction();
        }
        await this.waitForCommit();
        if (this.refusesAdmission || this.hasRetainedActions) return null;
        if (!this.sourceIsCurrent()) return null;

        const candidate = this.redoStack[this.redoStack.length - 1];
        if (!candidate) return null;
        const forwardCandidate = transformRedoAction(candidate);
        if (admit) {
            const generation = this.mutationGeneration;
            if (!(await admit(forwardCandidate)) || this.refusesAdmission || this.isTransactionOpen ||
                this.writeQueue.length > 0 ||
                generation !== this.mutationGeneration ||
                this.redoStack[this.redoStack.length - 1] !== candidate || !this.sourceIsCurrent()) return null;
        }

        // Same post-`await` concern as undo() — explicit action required.
        const moved = runInAction(() => {
            const top = this.redoStack.pop();
            if (top == null) {
                return null;
            }
            const forward = forwardCandidate.type === 'write-code' && (forwardCandidate.cloudImage || forwardCandidate.cloudProperty)
                ? retainCloudTextHistoryPin(forwardCandidate) : forwardCandidate;
            this.undoStack.push(forward);
            this.mutationGeneration++;
            // MobX wraps a plain replay action on insertion. Return the actual
            // stored reference so a refused source write can roll back Redo.
            return { forward: this.undoStack[this.undoStack.length - 1]!, top };
        });
        if (moved == null) {
            return null;
        }
        const { forward, top } = moved;
        if (!this.sourceVersion) this.persistDebounced();

        // `forward` is what was pushed onto the undo stack; `redoEntry` (`top`)
        // is what we popped off the redo stack. The caller hands both back to
        // `rollbackRedo` if applying `forward` fails.
        return { forward, redoEntry: top, externalRevision: this.externalRevision?.() ?? null };
    };

    /**
     * Reverse the most recent `redo()` stack move. Called when the caller's
     * apply of the forward action failed. Removes the forward action from the
     * undo stack (by reference) and restores the original onto the redo stack.
     */
    rollbackRedo = (forward: Action, redoEntry: Action) => {
        if (this.disposed) return;
        const idx = this.undoStack.lastIndexOf(forward);
        if (idx === -1) {
            return;
        }
        this.undoStack.splice(idx, 1);
        this.redoStack.push(redoEntry);
        this.mutationGeneration++;
        if (!this.sourceVersion) this.persistDebounced();
    };

    /** Commit pending intentions without dropping their recoverable history. */
    commitForDisposal = async (lease: HistoryDisposalLease): Promise<void> => {
        this.assertDisposalOwner(lease);
        await this.waitForCommit();
        if (this.disposalFailure) throw this.disposalFailure;
        await this.editorEngine.code.waitForPendingWrites();
        this.persistDebounced.cancel();
        this.disposalFlushInProgress = true;
        try {
            this.assertSourceCurrentForDisposal();
            await this.commitTransaction(true, lease);
            await this.waitForCommit();
            await this.editorEngine.code.waitForPendingWrites();
            this.assertSourceCurrentForDisposal();
            if (this.writingSource || this.editorEngine.code.hasPendingWrites) {
                throw new Error('Source writes are still pending. Keep this editor open.');
            }
            if (this.disposalFailure) throw this.disposalFailure;
        } finally {
            this.disposalFlushInProgress = false;
            this.persistDebounced.cancel();
        }
    };

    /** Require an actual successful storage write before any branch is released. */
    flushForDisposal = async (owner?: HistoryDisposalLease): Promise<HistoryDisposalCheckpoint> => {
        const lease = owner ?? this.beginDisposalPreparation();
        try {
            await this.commitForDisposal(lease);
            this.disposalFlushInProgress = true;
            this.assertSourceCurrentForDisposal();
            const checkpoint: HistoryDisposalCheckpoint = { generation: this.mutationGeneration,
                sourceVersion: this.sourceVersion?.(), externalRevision: this.externalRevision?.(), ownRevision: this.ownRevision?.() };
            const undo = [...this.undoStack];
            const redo = [...this.redoStack];
            await this.enqueueStorage(() => saveHistory(this.branchId, undo, redo, checkpoint.sourceVersion ?? undefined));
            this.assertDisposalCheckpoint(lease, checkpoint);
            return checkpoint;
        } finally {
            this.disposalFlushInProgress = false;
            this.persistDebounced.cancel();
            if (!owner) this.cancelDisposalPreparation(lease);
        }
    };

    /** Called only after every branch has passed its non-destructive flush. */
    releaseAfterDisposalFlush = (lease: HistoryDisposalLease, checkpoint: HistoryDisposalCheckpoint): void => {
        this.assertDisposalCheckpoint(lease, checkpoint);
        this.persistDebounced.cancel();
        runInAction(() => {
            this.disposed = true;
            this.mutationGeneration++;
            this.undoStack = [];
            this.redoStack = [];
        });
    };

    /** Keeps persisted undo history so reopening the branch can hydrate it. */
    dispose = async (): Promise<void> => {
        const lease = this.beginDisposalPreparation();
        try {
            const checkpoint = await this.flushForDisposal(lease);
            this.releaseAfterDisposalFlush(lease, checkpoint);
        } catch (error) {
            if (!this.disposed) this.cancelDisposalPreparation(lease);
            throw error;
        }
    };

    /**
     * Destructive reset: drops in-memory stacks AND deletes persisted history.
     * Use only when the branch itself is going away (branch delete) — for
     * engine teardown use `dispose()`.
     */
    clear = () => {
        if (this.refusesAdmission) throw new Error('Closing history cannot be reset.');
        this.mutationGeneration++;
        this.persistDebounced.cancel();
        this.undoStack = [];
        this.redoStack = [];
        void this.enqueueStorage(() => clearHistory(this.branchId)).catch((err) => {
            console.warn('[HistoryManager] Failed to clear persisted history:', err);
        });
    };
}
