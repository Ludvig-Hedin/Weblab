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

export class HistoryManager {
    get isCommitPending(): boolean {
        return this.commitPromise !== null;
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
        makeAutoObservable<this, 'persistDebounced' | 'commitPromise' | 'pendingWrites' | 'pendingPushes' | 'sourceVersion' | 'externalRevision' | 'ownRevision' | 'lastExternalRevision' | 'lastOwnRevision' | 'storageChain'>(this, {
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
        });
    }

    private sourceVersion: (() => string | null) | null = null;
    private externalRevision: (() => string | null) | null = null;
    private ownRevision: (() => string | null) | null = null;
    private lastExternalRevision: string | null = null;
    private lastOwnRevision: string | null = null;
    private storageChain: Promise<void> = Promise.resolve();

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
        this.sourceVersion = readVersion;
        this.externalRevision = readExternalRevision;
        this.ownRevision = readOwnRevision;
        this.lastExternalRevision = readExternalRevision();
        this.lastOwnRevision = readOwnRevision();
    }

    private sourceIsCurrent(): boolean {
        if (!this.externalRevision || !this.ownRevision) return true;
        const current = this.externalRevision();
        const own = this.ownRevision();
        if (current !== null && own !== null &&
            current === this.lastExternalRevision && own === this.lastOwnRevision) return true;
        this.persistDebounced.cancel();
        runInAction(() => {
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
    async confirmSourceReplay(expectedExternalRevision: string | null): Promise<void> {
        if (!this.externalRevision) return;
        if (this.externalRevision() !== expectedExternalRevision) {
            this.sourceIsCurrent();
            return;
        }
        this.lastOwnRevision = this.ownRevision?.() ?? null;
        this.persistDebounced.cancel();
        await this.persist();
    }

    /** A source rebase can finish after the action write; save its final disk version. */
    async noteOwnSourceWrite(): Promise<void> {
        if (!this.sourceVersion) return;
        if (this.externalRevision?.() !== this.lastExternalRevision) {
            this.sourceIsCurrent();
            return;
        }
        this.lastOwnRevision = this.ownRevision?.() ?? null;
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
        // B13: hydrate at most once — a second call (or one racing the first)
        // must not re-prepend persisted entries. Set before the `await` so a
        // concurrent double-invoke is also a no-op.
        if (this.hasHydrated) {
            return;
        }
        this.hasHydrated = true;
        try {
            const saved = await loadHistory(this.branchId);
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
                    // B13: MERGE, don't replace — actions pushed while
                    // IndexedDB was resolving must survive. Persisted entries
                    // are older, so they go below anything already in memory.
                    this.undoStack = [...saved.undoStack, ...this.undoStack];
                    this.redoStack = [...saved.redoStack, ...this.redoStack];
                });
            }
        } catch (err) {
            console.warn('[HistoryManager] Failed to load persisted history:', err);
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

    commitTransaction = async () => {
        if (
            this.inTransaction.type === TransactionType.NOT_IN_TRANSACTION ||
            this.inTransaction.actions.length === 0
        ) {
            this.inTransaction = { type: TransactionType.NOT_IN_TRANSACTION };
            return;
        }

        const actionsToCommit = this.inTransaction.actions;
        this.inTransaction = { type: TransactionType.NOT_IN_TRANSACTION };

        // A7: expose the push chain via `commitPromise` so undo/redo/
        // startTransaction can await it. Chain onto any still-running commit
        // so overlapping commits keep their undo-stack order.
        const previous = this.commitPromise;
        const commit = (async () => {
            if (previous) {
                await previous.catch(() => undefined);
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
                if (action.type === 'update-style') {
                    await this.editorEngine.action.finishQueuedStyleAction(action, saved);
                }
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
        if (this.inTransaction.type === TransactionType.IN_TRANSACTION) {
            this.inTransaction.actions = updateTransactionActions(
                this.inTransaction.actions,
                action,
            );
            return true;
        }

        return this.pushDirect(action);
    };

    /**
     * The non-transaction push path. Split out of `push` (A7) so
     * `commitTransaction` can land its actions on the stacks even when a NEW
     * transaction was opened while the commit's writes were still in flight.
     */
    private pushDirect = (action: Action): Promise<boolean> => {
        const push = this.pushDirectNow(action);
        this.pendingPushes.add(push);
        void push.finally(() => this.pendingPushes.delete(push)).catch(() => undefined);
        return push;
    };

    private pushDirectNow = async (action: Action): Promise<boolean> => {
        await Promise.allSettled(Array.from(this.pendingWrites.values()));
        this.sourceIsCurrent();
        const expectedExternalRevision = this.externalRevision?.() ?? null;
        if (this.redoStack.length > 0) {
            this.redoStack = [];
        }

        this.undoStack.push(action);
        // MobX deep-observes the stack, so the entry just pushed is an
        // observable PROXY of `action` — every identity operation below
        // (pendingWrites key, failure cleanup via lastIndexOf) must use the
        // stored reference or the lookups silently miss.
        const stored = this.undoStack[this.undoStack.length - 1] ?? action;
        // B2: expose the in-flight write so `undo()` can wait for it to settle
        // before popping this action off the stack.
        const writePromise = this.editorEngine.code.write(action);
        this.pendingWrites.set(stored, writePromise);
        let written: boolean;
        try {
            written = await writePromise;
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
            });
            return false;
        }

        if (this.externalRevision && this.externalRevision() !== expectedExternalRevision) {
            this.sourceIsCurrent();
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

    undo = async (): Promise<{ inverse: Action; redoEntry: Action; externalRevision: string | null } | null> => {
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
                const idx = this.undoStack.lastIndexOf(top);
                if (idx !== -1) {
                    this.undoStack.splice(idx, 1);
                }
            });
        }

        if (!this.sourceIsCurrent()) return null;

        // May run after the `await commitTransaction()` above — mutate the
        // stacks inside an explicit action for MobX strict-mode.
        const moved = runInAction(() => {
            const top = this.undoStack.pop();
            if (top == null) {
                return null;
            }
            this.redoStack.push(top);
            return top;
        });
        if (moved == null) {
            return null;
        }
        const inverse = undoAction(moved);
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
        const idx = this.redoStack.lastIndexOf(redoEntry);
        if (idx === -1) {
            return;
        }
        this.redoStack.splice(idx, 1);
        this.undoStack.push(redoEntry);
        if (!this.sourceVersion) this.persistDebounced();
    };

    redo = async (): Promise<{ forward: Action; redoEntry: Action; externalRevision: string | null } | null> => {
        // A7: same guard as undo() — don't race an in-flight commit's pushes.
        if (this.commitPromise) {
            await this.commitPromise.catch(() => undefined);
        }
        if (this.inTransaction.type === TransactionType.IN_TRANSACTION) {
            await this.commitTransaction();
        }
        await this.waitForPendingPushes();
        await Promise.allSettled(Array.from(this.pendingWrites.values()));
        if (!this.sourceIsCurrent()) return null;

        // Same post-`await` concern as undo() — explicit action required.
        const moved = runInAction(() => {
            const top = this.redoStack.pop();
            if (top == null) {
                return null;
            }
            const forward = transformRedoAction(top);
            this.undoStack.push(forward);
            return { forward, top };
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
        const idx = this.undoStack.lastIndexOf(forward);
        if (idx === -1) {
            return;
        }
        this.undoStack.splice(idx, 1);
        this.redoStack.push(redoEntry);
        if (!this.sourceVersion) this.persistDebounced();
    };

    /**
     * Teardown for engine disposal (route change, project switch, re-init).
     * Finishes source writes and persists the last state before the branch
     * releases its local mirror, then drops the in-memory stacks. Does NOT
     * delete persisted history: `hydrate()` on the next open restores it.
     */
    dispose = async (): Promise<void> => {
        if (this.commitPromise) await this.commitPromise.catch(() => undefined);
        await this.waitForPendingPushes();
        await Promise.allSettled(Array.from(this.pendingWrites.values()));
        await this.editorEngine.code.waitForPendingWrites();
        this.persistDebounced.cancel();
        await this.persist();
        // persist() re-arms the debounce when writes are still pending. Nothing
        // may persist after teardown, so cancel again before dropping stacks.
        this.persistDebounced.cancel();
        await this.storageChain;
        runInAction(() => {
            this.undoStack = [];
            this.redoStack = [];
        });
    };

    /**
     * Destructive reset: drops in-memory stacks AND deletes persisted history.
     * Use only when the branch itself is going away (branch delete) — for
     * engine teardown use `dispose()`.
     */
    clear = () => {
        this.persistDebounced.cancel();
        this.undoStack = [];
        this.redoStack = [];
        void this.enqueueStorage(() => clearHistory(this.branchId)).catch((err) => {
            console.warn('[HistoryManager] Failed to clear persisted history:', err);
        });
    };
}
