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
    constructor(
        private editorEngine: EditorEngine,
        private branchId: string,
        private undoStack: Action[] = [],
        private redoStack: Action[] = [],
        private inTransaction: TransactionState = {
            type: TransactionType.NOT_IN_TRANSACTION,
        },
    ) {
        makeAutoObservable<this, 'persistDebounced'>(this, {
            persistDebounced: false,
        });
    }

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
        try {
            const saved = await loadHistory(this.branchId);
            if (saved) {
                // Post-`await` writes run outside makeAutoObservable's implicit
                // action — wrap so MobX strict-mode accepts them.
                runInAction(() => {
                    this.undoStack = saved.undoStack;
                    this.redoStack = saved.redoStack;
                });
            }
        } catch (err) {
            console.warn('[HistoryManager] Failed to load persisted history:', err);
        }
    };

    private persist = async (): Promise<void> => {
        try {
            await saveHistory(this.branchId, this.undoStack, this.redoStack);
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

    startTransaction = () => {
        this.inTransaction = { type: TransactionType.IN_TRANSACTION, actions: [] };
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
        for (const action of actionsToCommit) {
            await this.push(action);
        }
    };

    push = async (action: Action) => {
        if (this.inTransaction.type === TransactionType.IN_TRANSACTION) {
            this.inTransaction.actions = updateTransactionActions(
                this.inTransaction.actions,
                action,
            );
            return;
        }

        if (this.redoStack.length > 0) {
            this.redoStack = [];
        }

        this.undoStack.push(action);
        const written = await this.editorEngine.code.write(action);

        if (!written) {
            // The code write failed (the error was already surfaced to the
            // user by `code.write`). Remove this action from the undo stack —
            // leaving it would let a later undo emit the inverse of an edit
            // that never landed, corrupting the file. Remove by reference
            // (not a blind pop) so a concurrent push isn't dropped instead.
            // This runs after the `await` above, outside the implicit action —
            // mutate inside runInAction or MobX strict-mode rejects it.
            runInAction(() => {
                const idx = this.undoStack.lastIndexOf(action);
                if (idx !== -1) {
                    this.undoStack.splice(idx, 1);
                }
            });
            return;
        }

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

        this.persistDebounced();
    };

    undo = async (): Promise<{ inverse: Action; redoEntry: Action } | null> => {
        if (this.inTransaction.type === TransactionType.IN_TRANSACTION) {
            await this.commitTransaction();
        }

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
        this.persistDebounced();

        // `redoEntry` is the action moved onto the redo stack; the caller hands
        // it back to `rollbackUndo` if applying `inverse` fails, so the stacks
        // stay in sync with the actual file contents.
        return { inverse, redoEntry: moved };
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
        this.persistDebounced();
    };

    redo = async (): Promise<{ forward: Action; redoEntry: Action } | null> => {
        if (this.inTransaction.type === TransactionType.IN_TRANSACTION) {
            await this.commitTransaction();
        }

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
        this.persistDebounced();

        // `forward` is what was pushed onto the undo stack; `redoEntry` (`top`)
        // is what we popped off the redo stack. The caller hands both back to
        // `rollbackRedo` if applying `forward` fails.
        return { forward, redoEntry: top };
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
        this.persistDebounced();
    };

    clear = () => {
        this.persistDebounced.cancel();
        this.undoStack = [];
        this.redoStack = [];
        void clearHistory(this.branchId).catch((err) => {
            console.warn('[HistoryManager] Failed to clear persisted history:', err);
        });
    };
}
