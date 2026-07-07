import { debounce } from 'lodash';
import { makeAutoObservable, reaction } from 'mobx';

import type { DomElement, DomElementStyles, RectDimensions } from '@weblab/models';

import type { EditorEngine } from '../engine';
import { OverlayState } from './state';
import { adaptRectToCanvas } from './utils';

export class OverlayManager {
    state: OverlayState = new OverlayState();
    private canvasReactionDisposer?: () => void;
    // Monotonic refresh generation. Each undebouncedRefresh captures the value
    // at entry; if a newer refresh starts (or the selection changes) during its
    // sequential awaits, the stale run bails before mutating overlay state —
    // otherwise a late removeClickRects()+re-add repaints the OLD selection.
    private refreshEpoch = 0;

    constructor(private editorEngine: EditorEngine) {
        // Exclude `refresh`: makeAutoObservable wraps function-valued fields
        // as actions, stripping lodash's `.cancel` — clear()'s teardown-cancel
        // would silently no-op and the trailing refresh would run against a
        // cleared engine. `refreshEpoch` is bookkeeping mutated after awaits;
        // keep it out of the MobX graph. (Private fields aren't in
        // `keyof this`, hence the explicit AdditionalKeys.)
        makeAutoObservable<OverlayManager, 'refreshEpoch'>(this, {
            refresh: false,
            refreshEpoch: false,
        });
    }

    init() {
        this.canvasReactionDisposer = reaction(
            () => ({
                position: this.editorEngine.canvas?.position,
                scale: this.editorEngine.canvas?.scale,
                shouldHideOverlay: this.editorEngine.state?.shouldHideOverlay,
            }),
            () => {
                this.refresh();
            },
        );
    }

    undebouncedRefresh = async () => {
        const epoch = ++this.refreshEpoch;
        // Selection is re-assigned wholesale on every click/shift-click, so a
        // reference compare detects "selection changed during our awaits".
        const selectionAtStart = this.editorEngine.elements.selected;
        this.state.removeHoverRect();

        // Refresh click rects
        const newClickRects: {
            rect: RectDimensions;
            styles: DomElementStyles | null;
            isComponent: boolean;
            domId: string;
        }[] = [];
        for (const selectedElement of selectionAtStart) {
            const frameData = this.editorEngine.frames.get(selectedElement.frameId);
            if (!frameData) {
                console.error('Frame data not found');
                continue;
            }
            const { view } = frameData;
            if (!view) {
                console.error('No frame view found');
                continue;
            }
            // Per-element guard: one penpal rejection (frame reloading /
            // channel destroyed) must not abort the whole refresh — that left
            // every OTHER rect stale at pre-pan positions and skipped the
            // scope-rect + text-editor refresh below.
            let el: DomElement | null = null;
            try {
                el = await view.getElementByDomId(selectedElement.domId, true);
            } catch (error) {
                console.warn(
                    'Failed to refresh overlay rect for element',
                    selectedElement.domId,
                    error,
                );
                continue;
            }
            if (!el) {
                console.error('Element not found');
                continue;
            }
            const adaptedRect = adaptRectToCanvas(el.rect, view);
            newClickRects.push({
                rect: adaptedRect,
                styles: el.styles,
                // Preserve the component flag and stable id across refreshes —
                // dropping them downgraded instance outlines to the element
                // color (and churned React keys) after every pan/zoom.
                isComponent: !!el.instanceId,
                domId: el.domId,
            });
        }

        // Bail before mutating overlay state if a newer refresh started or the
        // selection changed while we awaited — repainting now would restore
        // rects for a stale selection.
        if (
            epoch !== this.refreshEpoch ||
            this.editorEngine.elements.selected !== selectionAtStart
        ) {
            return;
        }

        this.state.removeClickRects();
        for (const clickRect of newClickRects) {
            this.state.addClickRect(
                clickRect.rect,
                clickRect.styles,
                clickRect.isComponent,
                clickRect.domId,
            );
        }

        // Keep the master-edit scope rect (dim cutout) in sync with pan/zoom
        // and post-edit DOM updates.
        await this.editorEngine.components.refreshScopeRect();

        // Re-check after the scope-rect await — a newer refresh owns the
        // text-editor update from here on.
        if (epoch !== this.refreshEpoch) {
            return;
        }

        // Refresh text editor position if it's active
        if (this.editorEngine.text.isEditing && this.editorEngine.text.targetElement) {
            const targetElement = this.editorEngine.text.targetElement;
            const frameData = this.editorEngine.frames.get(targetElement.frameId);
            if (frameData?.view) {
                try {
                    const el: DomElement = await frameData.view.getElementByDomId(
                        targetElement.domId,
                        true,
                    );
                    if (el) {
                        const adaptedRect = adaptRectToCanvas(el.rect, frameData.view);
                        this.state.updateTextEditor(adaptedRect, {
                            styles: el.styles?.computed,
                        });
                    }
                } catch (error) {
                    console.error('Error refreshing text editor position:', error);
                }
            }
        }
    };

    refresh = debounce(this.undebouncedRefresh, 100, { leading: true });

    showMeasurement() {
        this.editorEngine.overlay.removeMeasurement();
        if (!this.editorEngine.elements.selected.length || !this.editorEngine.elements.hovered) {
            return;
        }

        const selectedEl = this.editorEngine.elements.selected[0];
        if (!selectedEl) {
            return;
        }

        const hoverEl = this.editorEngine.elements.hovered;
        const frameId = selectedEl.frameId;
        const frameData = this.editorEngine.frames.get(frameId);
        if (!frameData) {
            return;
        }

        const { view } = frameData;

        if (!view) {
            console.error('No frame view found');
            return;
        }

        const selectedRect = adaptRectToCanvas(selectedEl.rect, view);
        const hoverRect = adaptRectToCanvas(hoverEl.rect, view);

        this.editorEngine.overlay.updateMeasurement(selectedRect, hoverRect);
    }

    updateMeasurement = (fromRect: RectDimensions, toRect: RectDimensions) => {
        this.state.updateMeasurement(fromRect, toRect);
    };

    removeMeasurement = () => {
        this.state.removeMeasurement();
    };

    clearUI = () => {
        this.removeMeasurement();
        this.state.clear();
    };

    clear = () => {
        this.canvasReactionDisposer?.();
        this.canvasReactionDisposer = undefined;
        // Cancel the trailing debounced refresh so it can't fire post-teardown.
        this.refresh.cancel();
    };
}
