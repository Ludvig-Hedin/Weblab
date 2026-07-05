'use client';

import { debounce } from 'lodash';
import { makeAutoObservable, reaction, runInAction } from 'mobx';

import type { Frame, LayerNode } from '@weblab/models';

import type { EditorEngine } from '../engine';

export class FrameEventManager {
    isCanvasOutOfView = false;
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

    private isFrameInViewport(frame: Frame): boolean {
        const canvasPos = this.editorEngine.canvas.position;
        const canvasScale = this.editorEngine.canvas.scale;

        const screenX = canvasPos.x + frame.position.x * canvasScale;
        const screenY = canvasPos.y + frame.position.y * canvasScale;
        const screenWidth = frame.dimension.width * canvasScale;
        const screenHeight = frame.dimension.height * canvasScale;

        return !(
            screenX + screenWidth < 0 ||
            screenX > window.innerWidth ||
            screenY + screenHeight < 0 ||
            screenY > window.innerHeight
        );
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
        const frames = this.editorEngine.frames.getAll();
        const firstFrame = frames[0]?.frame;

        if (firstFrame) {
            const canvasScale = this.editorEngine.canvas.scale;

            const frameCenterX = firstFrame.position.x + firstFrame.dimension.width / 2;
            const frameCenterY = firstFrame.position.y + firstFrame.dimension.height / 2;

            // Center the frame's midpoint in the viewport. With the canvas
            // transform screenX = canvasPos.x + worldX * scale, centering needs
            // canvasPos.x = innerWidth/2 - frameCenterX*scale. The previous code
            // subtracted the default pan offset (200,100) here, landing the
            // frame 200px left / 100px above true center.
            const viewportCenterX = window.innerWidth / 2;
            const viewportCenterY = window.innerHeight / 2;

            runInAction(() => {
                this.editorEngine.canvas.position = {
                    x: viewportCenterX - frameCenterX * canvasScale,
                    y: viewportCenterY - frameCenterY * canvasScale,
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
