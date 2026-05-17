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
        await this.editorEngine.history.push(action);
        await this.dispatch(action);
    }

    async undo() {
        const action = await this.editorEngine.history.undo();

        if (action == null) {
            return;
        }
        await this.editorEngine.code.write(action);
        this.editorEngine.posthog.capture('undo');
    }

    async redo() {
        const action = await this.editorEngine.history.redo();
        if (action == null) {
            return;
        }
        await this.editorEngine.code.write(action);
        this.editorEngine.posthog.capture('redo');
    }

    private async dispatch(action: Action) {
        switch (action.type) {
            case 'update-style':
                await this.updateStyle(action);
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

    async updateStyle({ targets }: UpdateStyleAction) {
        const domEls: DomElement[] = [];
        for (const target of targets) {
            const frameData = this.editorEngine.frames.get(target.frameId);
            if (!frameData) {
                console.error('Failed to get frameView');
                return;
            }
            const convertedChange = Object.fromEntries(
                Object.entries(target.change.updated).map(([key, value]) => {
                    const newValue = this.editorEngine.theme.getColorByName(value.value);
                    if (value.type === StyleChangeType.Custom && newValue) {
                        value.value = newValue;
                    }
                    if (value.type === StyleChangeType.Custom && !newValue) {
                        value.value = '';
                    }
                    return [key, value];
                }),
            );
            const change = {
                original: target.change.original,
                updated: convertedChange,
            };

            if (!frameData.view) {
                console.error('No frame view found');
                continue;
            }

            // cloneDeep is used to avoid observable values failing to pass through the webview.
            // We pass `target.oid` so the iframe can resolve its local domId from the source-AST
            // oid when the parent's domId (the one from the frame the user clicked) doesn't exist
            // locally — that's the cross-iframe sibling fan-out path.
            const domEl = await frameData.view.updateStyle(
                target.domId,
                cloneDeep(change),
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

        this.refreshDomElement(domEls);

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
        await this.editorEngine.code.writeResponsiveStyle?.({
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
                console.error('Failed to get frameView');
                return;
            }

            try {
                const result = await frameData.view.insertElement(element, location);
                if (!result) {
                    console.error('Failed to insert element');
                    return;
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
                console.error('Failed to get frameView');
                return;
            }

            const result = await frameData.view.removeElement(location);

            if (!result) {
                console.error('Failed to remove element');
                return;
            }

            await this.editorEngine.overlay.refresh();

            void this.refreshAndClickMutatedElement(result.domEl, frameData, result.newMap);
        }
    }

    private async moveElement({ targets, location }: MoveElementAction) {
        for (const target of targets) {
            const frameData = this.editorEngine.frames.get(target.frameId);
            if (!frameData?.view) {
                console.error('Failed to get frameView');
                return;
            }
            const result = await frameData.view.moveElement(target.domId, location.index);
            if (!result) {
                console.error('Failed to move element');
                return;
            }
            void this.refreshAndClickMutatedElement(result.domEl, frameData, result.newMap);
        }
    }

    private async editText({ targets, newContent }: EditTextAction) {
        for (const target of targets) {
            const frameData = this.editorEngine.frames.get(target.frameId);
            if (!frameData?.view) {
                console.error('Failed to get frameView');
                return;
            }
            const result = await frameData.view.editText(target.domId, newContent);
            if (!result) {
                console.error('Failed to edit text');
                return;
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

    clear() {
        // Cancel any pending source-rebase timers so they don't fire after
        // the manager is torn down (e.g. on engine clear / route change).
        for (const timer of this.rebaseTimers.values()) {
            clearTimeout(timer);
        }
        this.rebaseTimers.clear();
    }
}
