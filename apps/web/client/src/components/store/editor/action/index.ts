import { cloneDeep, debounce } from 'lodash';

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
} from '@weblab/models/actions';
import { StyleChangeType } from '@weblab/models/style';
import { assertNever } from '@weblab/utility';

import type { EditorEngine } from '../engine';
import type { FrameData } from '../frames';

export class ActionManager {
    constructor(private editorEngine: EditorEngine) {}

    async run(action: Action) {
        const pushed = await this.editorEngine.history.push(action);
        if (!pushed) {
            // The code write failed (push already dropped the action from the
            // undo stack and surfaced the error). Skip dispatch so the iframe
            // doesn't show a ghost edit that was never saved.
            return;
        }
        await this.dispatch(action);
    }

    async undo() {
        const result = await this.editorEngine.history.undo();

        if (result == null) {
            return;
        }
        const written = await this.editorEngine.code.write(result.inverse);
        if (!written) {
            // The inverse write failed (error already surfaced by code.write),
            // so the undo never actually reverted the files. Roll the history
            // stack move back so undo/redo state stays in sync with the file
            // contents and the user can retry.
            this.editorEngine.history.rollbackUndo(result.redoEntry);
            return;
        }
        // Also apply the inverse to the live frames: the preload's injected
        // stylesheet and the style panel mirror don't watch the file system,
        // so without this the undone value keeps winning the cascade in the
        // preview (and the panel) until a full iframe reload.
        await this.dispatchHistoryAction(result.inverse);
        this.editorEngine.posthog.capture('undo');
    }

    async redo() {
        const result = await this.editorEngine.history.redo();
        if (result == null) {
            return;
        }
        const written = await this.editorEngine.code.write(result.forward);
        if (!written) {
            // The forward write failed — roll the redo stack move back so the
            // action returns to the redo stack and state stays consistent.
            this.editorEngine.history.rollbackRedo(result.forward, result.redoEntry);
            return;
        }
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
        if (action.type === 'update-style') {
            // Sync the override map to the replayed values FIRST, so any
            // later rebase for the same (oid, property) flushes the restored
            // value instead of the stale pre-undo one.
            const activeBp = this.editorEngine.breakpoints?.activeId ?? 'desktop';
            for (const target of action.targets) {
                if (!target.oid) continue;
                const styles: Record<string, string> = {};
                for (const [property, change] of Object.entries(target.change.updated)) {
                    styles[property] = change.value;
                }
                this.editorEngine.style.recordOverrideForOid(
                    target.oid,
                    target.breakpoint?.id ?? activeBp,
                    styles,
                );
            }
        }
        await this.dispatch(action, { scheduleRebase: false });
    }

    private async dispatch(action: Action, options?: { scheduleRebase?: boolean }) {
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

    async updateStyle({ targets }: UpdateStyleAction, options?: { scheduleRebase?: boolean }) {
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
                const newValue = this.editorEngine.theme.getColorByName(value.value);
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
        const seen = new Set<string>();
        for (const target of targets) {
            if (!target.oid) continue;
            for (const property of Object.keys(target.change.updated)) {
                const key = `${target.oid}::${property}`;
                if (seen.has(key)) continue;
                seen.add(key);
                this.scheduleSourceRebase(target.oid, property);
            }
        }
    }

    private rebaseTimers = new Map<string, ReturnType<typeof setTimeout>>();

    private scheduleSourceRebase(oid: string, property: string) {
        const key = `${oid}::${property}`;
        const existing = this.rebaseTimers.get(key);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
            this.rebaseTimers.delete(key);
            void this.runSourceRebase(oid, property).catch((error: unknown) => {
                console.error('Source rebase failed', { oid, property, error });
            });
        }, 600);
        this.rebaseTimers.set(key, timer);
    }

    private async runSourceRebase(oid: string, property: string) {
        const map = this.editorEngine.style.breakpointMapFor(oid, property);
        if (!map || Object.keys(map).length === 0) return;
        // Immediate variant: this call is already debounced per key by
        // scheduleSourceRebase, and flushPendingRebases needs the write to
        // enqueue NOW (routing through the debounced `writeResponsiveStyle`
        // re-armed a 600ms timer that never fired on unload).
        await this.editorEngine.code.writeResponsiveStyleNow({
            oid,
            property,
            valuesByBreakpoint: map,
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

    private async editText({ targets, newContent }: EditTextAction) {
        for (const target of targets) {
            const frameData = this.editorEngine.frames.get(target.frameId);
            if (!frameData?.view) {
                // Skip an unbooted frame and keep applying to the rest.
                console.error('Failed to get frameView');
                continue;
            }
            const result = await frameData.view.editText(target.domId, newContent);
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
            const [oid, property] = key.split('::');
            if (!oid || !property) continue;
            void this.runSourceRebase(oid, property).catch((error: unknown) => {
                console.error('Source rebase failed', { oid, property, error });
            });
        }
        this.rebaseTimers.clear();
    }

    clear() {
        // Cancel any pending source-rebase timers so they don't fire after
        // the manager is torn down (e.g. on engine clear / route change).
        for (const timer of this.rebaseTimers.values()) {
            clearTimeout(timer);
        }
        this.rebaseTimers.clear();
        // Drop the trailing re-click: without this, the 100ms trailing edge
        // fires after teardown and re-selects elements on a cleared engine.
        this.refreshDomElement.cancel();
    }
}
