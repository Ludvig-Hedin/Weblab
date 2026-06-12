import { makeAutoObservable } from 'mobx';

import type { CoreElementType, DomElement, DynamicType } from '@weblab/models';
import type { RemoveElementAction } from '@weblab/models/actions';
import { toast } from '@weblab/ui/sonner';

import type { EditorEngine } from '../engine';
import type { FrameData } from '../frames';
import { adaptRectToCanvas } from '../overlay/utils';

export class ElementsManager {
    private _hovered: DomElement | undefined;
    private _selected: DomElement[] = [];

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    get hovered() {
        return this._hovered;
    }

    get selected() {
        return this._selected;
    }

    set selected(elements: DomElement[]) {
        this._selected = elements;
    }

    mouseover(domEl: DomElement) {
        const frameData = this.editorEngine.frames.get(domEl.frameId);
        if (!frameData?.view) {
            console.error('No frame view found');
            return;
        }
        if (this._hovered?.domId && this._hovered.domId === domEl.domId) {
            return;
        }

        const frameEl: DomElement = {
            ...domEl,
            frameId: frameData.frame.id,
        };
        const { view } = frameData;
        const adjustedRect = adaptRectToCanvas(frameEl.rect, view);
        const isComponent = !!domEl.instanceId;
        this.editorEngine.overlay.state.updateHoverRect(adjustedRect, isComponent);
        this.setHoveredElement(frameEl);
    }

    shiftClick(domEl: DomElement) {
        const selectedEls = this.selected;
        const isAlreadySelected = selectedEls.some((el) => el.domId === domEl.domId);
        let newSelectedEls: DomElement[] = [];
        if (isAlreadySelected) {
            newSelectedEls = selectedEls.filter((el) => el.domId !== domEl.domId);
        } else {
            newSelectedEls = [...selectedEls, domEl];
        }
        this.click(newSelectedEls);
    }

    click(domEls: DomElement[]) {
        this.editorEngine.overlay.state.removeClickRects();
        this.clearSelectedElements();

        // De-duplicate by (frameId, domId). Responsive sibling frames reuse the
        // same source-derived domId, so a naive selection list can accumulate
        // the identical node many times — that produces duplicate React keys in
        // the panels/overlay and, because every edit re-fans the selection out
        // to sibling frames, an exponential blow-up of selected elements
        // (1→3→9→27…) on each keystroke. Guarding here caps the set to unique
        // nodes regardless of how callers build `domEls`.
        const seen = new Set<string>();
        for (const domEl of domEls) {
            const key = `${domEl.frameId}:${domEl.domId}`;
            if (seen.has(key)) {
                continue;
            }
            const frameData = this.editorEngine.frames.get(domEl.frameId);
            if (!frameData) {
                console.error('Frame data not found');
                continue;
            }
            const { view } = frameData;
            if (!view) {
                console.error('No frame view found');
                continue;
            }
            seen.add(key);
            const adjustedRect = adaptRectToCanvas(domEl.rect, view);
            const isComponent = !!domEl.instanceId;
            this.editorEngine.overlay.state.addClickRect(
                adjustedRect,
                domEl.styles,
                isComponent,
                domEl.domId,
            );
            this._selected.push(domEl);
        }
    }

    setHoveredElement(element: DomElement) {
        this._hovered = element;
    }

    clearHoveredElement() {
        this._hovered = undefined;
    }

    emitError(error: string) {
        console.error(error);
        toast.error('Cannot delete element', { description: error });
    }

    async delete() {
        const selected = this.selected;
        if (selected.length === 0) {
            return;
        }

        // Per-element guards use `continue` (not `return`) so that one
        // un-deletable element in a multi-select doesn't silently abort
        // deletion of the remaining selected elements.
        for (const selectedEl of selected) {
            const frameId = selectedEl.frameId;
            const frameData = this.editorEngine.frames.get(frameId);
            if (!frameData?.view) {
                console.error('No frame view found');
                continue;
            }
            const { shouldDelete, error } = await this.shouldDelete(selectedEl, frameData);

            if (!shouldDelete) {
                this.emitError(error ?? 'Unknown error');
                continue;
            }

            const removeAction: RemoveElementAction | null = await frameData.view.getRemoveAction(
                selectedEl.domId,
                frameId,
            );

            if (!removeAction) {
                this.emitError('Remove action not found. Try refreshing the page.');
                continue;
            }
            const oid = selectedEl.instanceId ?? selectedEl.oid;
            if (!oid) {
                this.emitError('OID not found. Try refreshing the page.');
                continue;
            }

            const branchData = this.editorEngine.branches.getBranchDataById(selectedEl.branchId);
            if (!branchData) {
                this.emitError(
                    `Branch data not found for branchId: ${selectedEl.branchId}. Try refreshing the page.`,
                );
                continue;
            }

            const metadata = await branchData.codeEditor.getJsxElementMetadata(oid);

            if (!metadata?.code) {
                this.emitError('Code block not found. Try refreshing the page.');
                continue;
            }

            removeAction.codeBlock = metadata.code;

            await this.editorEngine.action.run(removeAction).catch((err) => {
                console.error('Error deleting element', err);
            });
        }
    }

    private async shouldDelete(
        selectedEl: DomElement,
        frameData: FrameData,
    ): Promise<{
        shouldDelete: boolean;
        error?: string;
    }> {
        const instanceId = selectedEl.instanceId;

        if (!instanceId) {
            if (!frameData.view) {
                console.error('No frame view found');
                return {
                    shouldDelete: false,
                    error: 'No frame view found',
                };
            }

            const result = await frameData.view.getElementType(selectedEl.domId);
            const { dynamicType, coreType } = result;

            if (coreType) {
                const CORE_ELEMENTS_MAP: Record<CoreElementType, string> = {
                    'component-root': 'Component Root',
                    'body-tag': 'Body Tag',
                };

                return {
                    shouldDelete: false,
                    error: `This is a ${CORE_ELEMENTS_MAP[coreType]} and cannot be deleted`,
                };
            }

            if (dynamicType) {
                const DYNAMIC_TYPES_MAP: Record<DynamicType, string> = {
                    array: 'Array',
                    conditional: 'Conditional',
                    unknown: 'Unknown',
                };

                return {
                    shouldDelete: false,
                    error: `This element is a(n) ${DYNAMIC_TYPES_MAP[dynamicType]} and cannot be deleted`,
                };
            }
        }

        return {
            shouldDelete: true,
        };
    }

    clear() {
        this.clearHoveredElement();
        this.clearSelectedElements();
    }

    private clearSelectedElements() {
        this.selected = [];
    }
}
