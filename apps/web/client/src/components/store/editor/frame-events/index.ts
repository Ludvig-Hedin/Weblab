'use client';

import { debounce } from 'lodash';
import { makeAutoObservable, reaction, runInAction } from 'mobx';

import type { Frame, LayerNode } from '@weblab/models';
import { EditorMode } from '@weblab/models';

import type { EditorEngine } from '../engine';

/** Screen-y where the visible canvas starts — under the 56px top bar. */
const VISIBLE_TOP = 56;
/** A frame needs at least this many px showing on both axes to count as in view. */
const MIN_VISIBLE_PX = 48;
/** Gap above a tall frame when it is brought back into view. */
const RECENTER_TOP_PADDING = 40;

export class FrameEventManager {
    isCanvasOutOfView = false;
    /**
     * Screen-x bounds of the canvas area between the side panels, measured in
     * main.tsx. A frame hidden behind a panel is not "in view" for the user.
     */
    visibleBounds = { left: 0, right: 0 };
    private viewportReactionDisposer?: () => void;

    constructor(private editorEngine: EditorEngine) {
        // Exclude the debounced function fields: makeAutoObservable wraps
        // function-valued fields as actions, which strips lodash's
        // `.cancel`/`.flush` (the saveCanvas/writeResponsiveStyle trap) and
        // would make clear()'s teardown-cancel below a silent no-op.
        makeAutoObservable(this, { handleWindowMutated: false, handleViewportCheck: false });
    }

    init() {
        this.viewportReactionDisposer = reaction(
            () => ({
                position: this.editorEngine.canvas.position,
                scale: this.editorEngine.canvas.scale,
                frames: this.editorEngine.frames.getAll(),
                bounds: this.visibleBounds,
            }),
            () => this.handleViewportCheck(),
            {
                fireImmediately: true,
            },
        );
    }

    private async undebouncedHandleWindowMutated() {
        try {
            await this.editorEngine.refreshLayers();
            await this.editorEngine.overlay.refresh();
            await this.validateAndCleanSelections();
        } catch (error) {
            console.error('Error handling window mutation:', error);
        }
    }

    handleWindowMutated = debounce(this.undebouncedHandleWindowMutated, 1000, {
        leading: true,
        trailing: true,
    });

    setVisibleBounds(left: number, right: number) {
        if (this.visibleBounds.left === left && this.visibleBounds.right === right) return;
        this.visibleBounds = { left, right };
    }

    /** True when the user can reach the canvas: not locked, not in code/CMS/preview. */
    get canShowRecenter(): boolean {
        const mode = this.editorEngine.state.editorMode;
        return (
            !this.editorEngine.state.canvasLocked &&
            mode !== EditorMode.CODE &&
            mode !== EditorMode.CMS &&
            mode !== EditorMode.PREVIEW
        );
    }

    /** Screen rect of the canvas area the user can see (between panels, under top bar). */
    private getVisibleArea() {
        const left = this.visibleBounds.left;
        const right = Math.max(left, window.innerWidth - this.visibleBounds.right);
        return { left, right, top: VISIBLE_TOP, bottom: window.innerHeight };
    }

    private isFrameInViewport(frame: Frame): boolean {
        const canvasPos = this.editorEngine.canvas.position;
        const canvasScale = this.editorEngine.canvas.scale;
        const area = this.getVisibleArea();

        const screenX = canvasPos.x + frame.position.x * canvasScale;
        const screenY = canvasPos.y + frame.position.y * canvasScale;
        const screenWidth = frame.dimension.width * canvasScale;
        const screenHeight = frame.dimension.height * canvasScale;

        const visibleWidth =
            Math.min(screenX + screenWidth, area.right) - Math.max(screenX, area.left);
        const visibleHeight =
            Math.min(screenY + screenHeight, area.bottom) - Math.max(screenY, area.top);
        // A frame shrunk below the threshold still counts when it's fully inside.
        const minWidth = Math.min(MIN_VISIBLE_PX, screenWidth);
        const minHeight = Math.min(MIN_VISIBLE_PX, screenHeight);
        return visibleWidth >= minWidth && visibleHeight >= minHeight;
    }

    private undebouncedViewportCheck() {
        if (typeof window === 'undefined') {
            runInAction(() => {
                this.isCanvasOutOfView = false;
            });
            return;
        }

        const frames = this.editorEngine.frames.getAll();
        if (frames.length === 0) {
            runInAction(() => {
                this.isCanvasOutOfView = false;
            });
            return;
        }

        const isAnyFrameInView = frames.some((frame) => this.isFrameInViewport(frame.frame));
        runInAction(() => {
            this.isCanvasOutOfView = !isAnyFrameInView;
        });
    }

    handleViewportCheck = debounce(this.undebouncedViewportCheck, 500, {
        leading: true,
        trailing: true,
    });

    recenterCanvas() {
        const frames = this.editorEngine.frames;
        const target = (frames.selected[0] ?? frames.getAll()[0])?.frame;

        if (target) {
            const canvasScale = this.editorEngine.canvas.scale;
            const area = this.getVisibleArea();

            // With the canvas transform screenX = canvasPos.x + worldX * scale,
            // center the frame horizontally between the panels. A frame taller
            // than the visible area gets its top pinned near the top bar, so the
            // user lands on the start of the page instead of its middle.
            const frameWidth = target.dimension.width * canvasScale;
            const frameHeight = target.dimension.height * canvasScale;
            const areaHeight = area.bottom - area.top;
            const screenX = area.left + (area.right - area.left - frameWidth) / 2;
            const screenY =
                frameHeight > areaHeight - RECENTER_TOP_PADDING * 2
                    ? area.top + RECENTER_TOP_PADDING
                    : area.top + (areaHeight - frameHeight) / 2;

            runInAction(() => {
                this.editorEngine.canvas.position = {
                    x: screenX - target.position.x * canvasScale,
                    y: screenY - target.position.y * canvasScale,
                };
            });
        } else {
            runInAction(() => {
                this.editorEngine.canvas.position =
                    this.editorEngine.canvas.getDefaultPanPosition();
            });
        }
    }

    async handleWindowResized(): Promise<void> {
        try {
            await this.editorEngine.overlay.refresh();
        } catch (error) {
            console.error('Error handling window resize:', error);
        }
    }

    async handleDomProcessed(
        frameId: string,
        data: { layerMap: Record<string, LayerNode>; rootNode: LayerNode },
    ): Promise<void> {
        try {
            const layerMapConverted = new Map(Object.entries(data.layerMap));

            const frameData = this.editorEngine.frames.get(frameId);
            if (!frameData) {
                console.warn('Frame not found for DOM processing');
                return;
            }

            this.editorEngine.ast.setMapRoot(frameId, data.rootNode, layerMapConverted);
            await this.editorEngine.overlay.refresh();
        } catch (error) {
            console.error('Error handling DOM processed:', error);
        }
    }

    private async validateAndCleanSelections(): Promise<void> {
        const selectedElements = this.editorEngine.elements.selected;
        const stillValidElements = await Promise.all(
            selectedElements.map(async (el) => {
                const frameData = this.editorEngine.frames.get(el.frameId);
                if (!frameData?.view) {
                    console.error('No frame view found');
                    return null;
                }
                try {
                    // Fetch WITH styles and return the FRESH element, not the
                    // stale click-time snapshot. re-clicking with the old object
                    // (element/index.ts draws overlay rects from `el.rect`) would
                    // repaint selection rects at pre-mutation positions/sizes,
                    // undoing the overlay.refresh that just ran.
                    const domEl = await frameData.view.getElementByDomId(el.domId, true);
                    return domEl ? { ...el, ...domEl } : null;
                } catch {
                    return null;
                }
            }),
        );

        const validElements = stillValidElements.filter(
            (el): el is (typeof selectedElements)[0] => el !== null,
        );
        if (validElements.length !== selectedElements.length) {
            this.editorEngine.elements.click(validElements);
        }
    }

    clear() {
        this.viewportReactionDisposer?.();
        this.viewportReactionDisposer = undefined;
        // Drop pending trailing edges so a mutation that landed just before
        // teardown can't run refreshLayers/overlay refresh on a cleared engine
        // (console noise + wasted penpal round-trips against dead frames).
        this.handleWindowMutated.cancel();
        this.handleViewportCheck.cancel();
    }
}
