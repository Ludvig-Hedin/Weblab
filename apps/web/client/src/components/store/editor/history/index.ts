import { debounce } from 'lodash';
import { makeAutoObservable, runInAction } from 'mobx';

import type { Action } from '@weblab/models/actions';
import { jsonClone } from '@weblab/utility';

import type { EditorEngine } from '../engine';
import { transformRedoAction, undoAction, updateTransactionActions } from './helpers';
import { clearHistory, loadHistory, saveHistory } from './storage';

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

export interface HistoryDisposalLease { readonly owner: symbol }
export interface HistoryDisposalCheckpoint {
    readonly generation: number;
    readonly sourceVersion: string | null | undefined;
    readonly externalRevision: string | null | undefined;
    readonly ownRevision: string | null | undefined;
}

export class HistoryManager {
    get isCommitPending(): boolean {
        return this.commitPromise !== null;
    }

    /** Read-only eligibility for discarding one rejected cloud text session by document reload. */
    canNavigateRejectedText(
        target: Extract<Action, { type: 'edit-text' }>['targets'][number],
        lease?: HistoryDisposalLease,
    ): boolean {
        if (this.disposed || this.commitPromise || this.pendingPushes.size || this.pendingWrites.size ||
            this.disposalFlushInProgress || this.editorEngine.code.hasPendingWrites ||
            (lease ? this.disposalLease !== lease : this.disposalLease !== null) ||
            target.branchId !== this.branchId) return false;
        return this.inTransaction.type !== TransactionType.IN_TRANSACTION ||
            this.inTransaction.actions.every((action) => action.type === 'edit-text' &&
                action.targets.length === 1 && action.targets.every((item) =>
                    item.branchId === target.branchId && item.frameId === target.frameId &&
                    item.domId === target.domId && item.oid === target.oid));
    }

    /** Resolves once every committed transaction has landed on the undo stack. */
    waitForCommit = async (): Promise<void> => {
        while (this.commitPromise) {
            await this.commitPromise.catch(() => undefined);
        }
    };

    get isTransactionOpen(): boolean {
        return this.inTransaction.type === TransactionType.IN_TRANSACTION || this.isCommitPending;
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
        makeAutoObservable<this, 'persistDebounced' | 'commitPromise' | 'pendingWrites' | 'pendingPushes' | 'sourceVersion' | 'externalRevision' | 'ownRevision' | 'lastExternalRevision' | 'lastOwnRevision' | 'storageChain' | 'disposalFlushInProgress' | 'disposalLease' | 'disposalFailure' | 'mutationGeneration' | 'disposed' | 'hydrating' | 'hydrationFailed' | 'sourcePreparationFailure'>(this, {
            persistDebounced: false,
            // Async plumbing, not UI state: `commitPromise` is reassigned
            // after `await`s (outside any action) and `pendingWrites` must
            // stay a plain Map, so both are excluded from observability.
            commitPromise: false,
            pendingWrites: false,
            pendingPushes: false,
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
        for (const pending of [...this.pendingPushes, ...this.pendingWrites.values()]) {
            this.observePreparedWrite(pending, lease);
        }
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

    private observePreparedWrite(pending: Promise<boolean>, lease: HistoryDisposalLease): void {
        void pending.then((saved) => {
            if (!saved && this.disposalLease === lease) this.disposalFailure = new Error('An admitted edit could not be saved.');
        }, (error: unknown) => {
            if (this.disposalLease === lease) this.disposalFailure = error instanceof Error ? error : new Error('An admitted edit could not be saved.');
        });
    }

    assertDisposalCheckpoint(lease: HistoryDisposalLease, checkpoint: HistoryDisposalCheckpoint): void {
        this.assertDisposalOwner(lease);
        this.assertSourceCurrentForDisposal();
        if (this.disposalFailure) throw this.disposalFailure;
        if (this.mutationGeneration !== checkpoint.generation || this.commitPromise ||
            this.pendingPushes.size > 0 || this.pendingWrites.size > 0 || this.isInTransaction ||
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
            this.pendingPushes.size || this.pendingWrites.size || this.disposalFlushInProgress ||
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

    /**
     * A7: the in-flight `commitTransaction` push chain. `undo()`, `redo()`,
     * `startTransaction()` and the next commit await this so a gesture right
     * after a slider release can't observe — or interleave with — a commit
     * whose pushes haven't landed on the undo stack yet.
     */
    private commitPromise: Promise<void> | null = null;

    /**
     * B2: the in-flight `code.write` promise for each pushed action. `undo()`
     * peeks at this so it never pops an action whose write hasn't settled —
     * if the write fails, the push path rolls the action back and undo skips
     * it instead of emitting the inverse of an edit that never landed.
     */
    private pendingWrites = new Map<Action, Promise<boolean>>();
    /**
     * Direct pushes that have not landed yet. A push waits for earlier writes
     * before it reaches the undo stack, so undo/redo must wait for it too or
     * they pop the previous action and the late push clears the redo stack.
     */
    private pendingPushes = new Set<Promise<boolean>>();

    private waitForPendingPushes = async (): Promise<void> => {
        while (this.pendingPushes.size > 0) {
            await Promise.allSettled(Array.from(this.pendingPushes));
        }
    };

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
                    this.undoStack = [...saved.undoStack, ...this.undoStack];
                    this.redoStack = [...saved.redoStack, ...this.redoStack];
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
            if (this.pendingWrites.size > 0 || this.editorEngine.code.hasPendingWrites) {
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
        if (!this.isTransactionOpen && this.pendingPushes.size === 0 && this.pendingWrites.size === 0 &&
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
        this.inTransaction = { type: TransactionType.IN_TRANSACTION, actions: [] };
        // A7: if a previous commit is still flushing its pushes, wait for it,
        // so callers that await see a stack where that commit fully landed.
        // (The commit pushes via `pushDirect`, so it can never be captured by
        // the transaction opened above.)
        if (this.commitPromise) {
            await this.commitPromise.catch(() => undefined);
        }
    };

    commitTransaction = async (strict = false, lease?: HistoryDisposalLease) => {
        if (strict) {
            if (!lease) throw new Error('Strict history commit needs its preparation owner.');
            this.assertDisposalOwner(lease);
        } else if (this.refusesAdmission) {
            throw new Error('This editor is saving before it closes.');
        }
        if (this.editorEngine.action?.hasPendingStylePreflights) {
            await this.editorEngine.action.waitForStylePreflights();
        }
        if (
            this.inTransaction.type === TransactionType.NOT_IN_TRANSACTION ||
            this.inTransaction.actions.length === 0
        ) {
            this.inTransaction = { type: TransactionType.NOT_IN_TRANSACTION };
            this.mutationGeneration++;
            return;
        }

        const actionsToCommit = this.inTransaction.actions;
        this.inTransaction = { type: TransactionType.NOT_IN_TRANSACTION };
        this.mutationGeneration++;

        // A7: expose the push chain via `commitPromise` so undo/redo/
        // startTransaction can await it. Chain onto any still-running commit
        // so overlapping commits keep their undo-stack order.
        const previous = this.commitPromise;
        const commit = (async () => {
            let nextAction = 0;
            try {
                if (previous) {
                    await (strict ? previous : previous.catch(() => undefined));
                }
                if (actionsToCommit.some((action) => action.type === 'update-style')) {
                    await this.editorEngine.action.waitForQueuedStyleDispatches();
                    // StyleManager's completion callback records the override map
                    // after the queued iframe dispatch resolves.
                    await Promise.resolve();
                }
                for (const action of actionsToCommit) {
                    // pushDirect, NOT push: a startTransaction() racing this loop
                    // must not re-capture these pending pushes into its NEW
                    // transaction — they'd be silently lost if that gesture never
                    // commits (e.g. image swap: remove persists, insert swallowed).
                    const saved = await this.pushDirect(action);
                    if (strict && !saved) throw new Error('An unfinished edit could not be saved.');
                    nextAction += 1;
                    if (action.type === 'update-style') {
                        await this.editorEngine.action.finishQueuedStyleAction(action, saved);
                    }
                }
            } catch (error) {
                if (strict && nextAction < actionsToCommit.length) {
                    runInAction(() => {
                        this.mutationGeneration++;
                        const remaining = actionsToCommit.slice(nextAction);
                        const newer = this.inTransaction.type === TransactionType.IN_TRANSACTION
                            ? this.inTransaction.actions : [];
                        this.inTransaction = { type: TransactionType.IN_TRANSACTION, actions: [...remaining, ...newer] };
                    });
                }
                throw error;
            }
        })();
        this.commitPromise = commit;
        try {
            await commit;
        } finally {
            if (this.commitPromise === commit) {
                this.commitPromise = null;
            }
        }
    };

    /**
     * Returns `true` when the action landed (or was queued into an open
     * transaction) and `false` when its code write failed — callers like
     * `ActionManager.run` use this to skip the optimistic iframe dispatch of
     * an edit that was never saved.
     */
    push = async (action: Action): Promise<boolean> => {
        if (this.refusesAdmission) return false;
        return this.pushAdmitted(action);
    };

    private pushAdmitted = async (action: Action): Promise<boolean> => {
        if (this.inTransaction.type === TransactionType.IN_TRANSACTION) {
            this.mutationGeneration++;
            this.inTransaction.actions = updateTransactionActions(
                this.inTransaction.actions,
                action,
            );
            return true;
        }

        return this.pushDirect(action);
    };

    /** Final captured text must not erase history on an external source conflict. */
    pushForDisposal = async (action: Action, lease: HistoryDisposalLease): Promise<boolean> => {
        this.assertDisposalOwner(lease);
        const previous = this.disposalFlushInProgress;
        this.disposalFlushInProgress = true;
        try {
            this.assertSourceCurrentForDisposal();
            return await this.pushAdmitted(action);
        } finally {
            this.disposalFlushInProgress = previous;
        }
    };

    /**
     * The non-transaction push path. Split out of `push` (A7) so
     * `commitTransaction` can land its actions on the stacks even when a NEW
     * transaction was opened while the commit's writes were still in flight.
     */
    /** Source/structure edits must finish saving before their preview changes. */
    pushImmediate = async (
        action: Action,
        write?: (action: Action) => Promise<boolean>,
        admit?: (action: Action) => boolean | Promise<boolean>,
    ): Promise<boolean> => {
        if (this.refusesAdmission) return false;
        await this.commitTransaction();
        await this.waitForCommit();
        if (this.refusesAdmission) return false;
        if (admit) {
            await this.waitForPendingPushes();
            const generation = this.mutationGeneration;
            if (!(await admit(action)) || this.refusesAdmission || this.isTransactionOpen ||
                this.pendingPushes.size > 0 || this.pendingWrites.size > 0 || generation !== this.mutationGeneration) return false;
        }
        return this.pushDirect(action, write);
    };

    private pushDirect = (action: Action, write?: (action: Action) => Promise<boolean>): Promise<boolean> => {
        const push = this.pushDirectNow(action, write);
        this.pendingPushes.add(push);
        if (this.disposalLease) this.observePreparedWrite(push, this.disposalLease);
        void push.finally(() => this.pendingPushes.delete(push)).catch(() => undefined);
        return push;
    };

    private pushDirectNow = async (action: Action, write?: (action: Action) => Promise<boolean>): Promise<boolean> => {
        await Promise.allSettled(Array.from(this.pendingWrites.values()));
        this.sourceIsCurrent();
        const expectedExternalRevision = this.externalRevision?.() ?? null;
        const previousRedo = this.disposalFlushInProgress || this.disposalLease || 'cloudAttribute' in action ? [...this.redoStack] : null;
        if (this.redoStack.length > 0) {
            this.redoStack = [];
        }

        this.undoStack.push(action);
        this.mutationGeneration++;
        // MobX deep-observes the stack, so the entry just pushed is an
        // observable PROXY of `action` — every identity operation below
        // (pendingWrites key, failure cleanup via lastIndexOf) must use the
        // stored reference or the lookups silently miss.
        const stored = this.undoStack[this.undoStack.length - 1] ?? action;
        // B2: expose the in-flight write so `undo()` can wait for it to settle
        // before popping this action off the stack.
        const writePromise = write ? write(action) : this.editorEngine.code.write(action);
        this.pendingWrites.set(stored, writePromise);
        let written: boolean;
        try {
            written = await writePromise;
        } catch (error) {
            if (this.disposalFlushInProgress || this.disposalLease) {
                runInAction(() => {
                    this.mutationGeneration++;
                    const index = this.undoStack.lastIndexOf(stored);
                    if (index !== -1) this.undoStack.splice(index, 1);
                    if (previousRedo) this.redoStack = previousRedo;
                });
            }
            throw error;
        } finally {
            this.pendingWrites.delete(stored);
        }

        if (!written) {
            // The code write failed (the error was already surfaced to the
            // user by `code.write`). Remove this action from the undo stack —
            // leaving it would let a later undo emit the inverse of an edit
            // that never landed, corrupting the file. Remove by reference
            // (not a blind pop) so a concurrent push isn't dropped instead.
            // This runs after the `await` above, outside the implicit action —
            // mutate inside runInAction or MobX strict-mode rejects it.
            runInAction(() => {
                this.mutationGeneration++;
                const idx = this.undoStack.lastIndexOf(stored);
                if (idx !== -1) {
                    this.undoStack.splice(idx, 1);
                }
                // B2: an undo issued while the write was in flight may have
                // moved this action onto the redo stack — purge it there too,
                // or a later redo would replay an edit that never landed.
                const redoIdx = this.redoStack.lastIndexOf(stored);
                if (redoIdx !== -1) {
                    this.redoStack.splice(redoIdx, 1);
                }
                if (previousRedo) this.redoStack = previousRedo;
            });
            return false;
        }

        // Source preparation can capture wrapper snapshots or the writer's
        // final formatted contents. MobX cloned the plain input on insertion;
        // record those successful-write details on the stored entry too.
        runInAction(() => { this.mutationGeneration++; Object.assign(stored, jsonClone(action)); });

        if (this.externalRevision && this.externalRevision() !== expectedExternalRevision) {
            // The edit already landed. The strict flush will reject the new
            // source revision without treating this action as an unsaved retry.
            if (!this.disposalFlushInProgress) this.sourceIsCurrent();
            return true;
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
        return true;
    };

    undo = async (admit?: (action: Action) => boolean | Promise<boolean>): Promise<{ inverse: Action; redoEntry: Action; externalRevision: string | null } | null> => {
        if (this.refusesAdmission) return null;
        // A7: an undo right after a slider release must not run while the
        // release's commit is still pushing — it would pop the PREVIOUS action
        // instead of the one the user just committed.
        if (this.commitPromise) {
            await this.commitPromise.catch(() => undefined);
        }
        if (this.inTransaction.type === TransactionType.IN_TRANSACTION) {
            await this.commitTransaction();
        }
        await this.waitForPendingPushes();
        if (this.refusesAdmission) return null;

        // B2: if the top action's code write is still in flight, wait for it
        // to settle before popping. On failure the action was already rolled
        // back by the push path — skip it and inspect the new top. Removal is
        // by reference via lastIndexOf on BOTH sides, so whichever
        // continuation runs first wins and the other is a no-op.
        while (this.undoStack.length > 0) {
            const top = this.undoStack[this.undoStack.length - 1];
            if (!top) {
                break;
            }
            const pendingWrite = this.pendingWrites.get(top);
            if (!pendingWrite) {
                break;
            }
            const written = await pendingWrite.catch(() => false);
            if (written) {
                break;
            }
            runInAction(() => {
                this.mutationGeneration++;
                const idx = this.undoStack.lastIndexOf(top);
                if (idx !== -1) {
                    this.undoStack.splice(idx, 1);
                }
            });
        }

        if (!this.sourceIsCurrent()) return null;

        const candidate = this.undoStack[this.undoStack.length - 1];
        if (!candidate) return null;
        const inverse = undoAction(candidate);
        if (admit) {
            const generation = this.mutationGeneration;
            if (!(await admit(inverse)) || this.refusesAdmission || this.isTransactionOpen ||
                this.pendingPushes.size > 0 || this.pendingWrites.size > 0 ||
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
        // A7: same guard as undo() — don't race an in-flight commit's pushes.
        if (this.commitPromise) {
            await this.commitPromise.catch(() => undefined);
        }
        if (this.inTransaction.type === TransactionType.IN_TRANSACTION) {
            await this.commitTransaction();
        }
        await this.waitForPendingPushes();
        await Promise.allSettled(Array.from(this.pendingWrites.values()));
        if (this.refusesAdmission) return null;
        if (!this.sourceIsCurrent()) return null;

        const candidate = this.redoStack[this.redoStack.length - 1];
        if (!candidate) return null;
        const forwardCandidate = transformRedoAction(candidate);
        if (admit) {
            const generation = this.mutationGeneration;
            if (!(await admit(forwardCandidate)) || this.refusesAdmission || this.isTransactionOpen ||
                this.pendingPushes.size > 0 || this.pendingWrites.size > 0 ||
                generation !== this.mutationGeneration ||
                this.redoStack[this.redoStack.length - 1] !== candidate || !this.sourceIsCurrent()) return null;
        }

        // Same post-`await` concern as undo() — explicit action required.
        const moved = runInAction(() => {
            const top = this.redoStack.pop();
            if (top == null) {
                return null;
            }
            const forward = forwardCandidate;
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
        if (this.commitPromise) await this.commitPromise;
        await this.waitForPendingPushes();
        await Promise.allSettled(Array.from(this.pendingWrites.values()));
        await this.editorEngine.code.waitForPendingWrites();
        this.persistDebounced.cancel();
        this.disposalFlushInProgress = true;
        try {
            this.assertSourceCurrentForDisposal();
            await this.commitTransaction(true, lease);
            await this.waitForPendingPushes();
            await this.editorEngine.code.waitForPendingWrites();
            this.assertSourceCurrentForDisposal();
            if (this.pendingWrites.size > 0 || this.editorEngine.code.hasPendingWrites) {
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
