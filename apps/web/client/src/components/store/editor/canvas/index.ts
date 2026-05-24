import type { ConvexHttpClient } from 'convex/browser';
import { debounce } from 'lodash';
import { makeAutoObservable } from 'mobx';

import type { Canvas, RectPosition } from '@weblab/models';
import { DefaultSettings } from '@weblab/constants';
import { DefaultDesktopFrame } from '@weblab/db';

import type { EditorEngine } from '../engine';
import type { Id } from '@convex/_generated/dataModel';
import { api as convexApi } from '@convex/_generated/api';
import { getConvexHttpClient } from '@/components/store/lib/convex-http-client';

export class CanvasManager {
    private _id = '';
    private _scale: number = DefaultSettings.SCALE;
    private _position: RectPosition = DefaultSettings.PAN_POSITION;
    private convex: ConvexHttpClient = getConvexHttpClient();

    constructor(private readonly editorEngine: EditorEngine) {
        this._position = this.getDefaultPanPosition();
        makeAutoObservable(this);
    }

    applyCanvas(canvas: Canvas) {
        this.id = canvas.id;
        this.scale = canvas.scale ?? DefaultSettings.SCALE;
        this.position = canvas.position ?? this.getDefaultPanPosition();
    }

    getDefaultPanPosition(): RectPosition {
        let x = 200;
        let y = 100;
        const center = false;
        if (center) {
            x = window.innerWidth / 2 - (Number(DefaultDesktopFrame.width) * this._scale) / 2;
            y = window.innerHeight / 2 - (Number(DefaultDesktopFrame.height) * this._scale) / 2;
        }

        return { x, y };
    }

    get id() {
        return this._id;
    }

    set id(value: string) {
        this._id = value;
    }

    get scale() {
        return this._scale;
    }

    set scale(value: number) {
        this._scale = value;
        this.saveCanvas();
    }

    get position() {
        return this._position;
    }

    set position(value: RectPosition) {
        this._position = value;
        this.saveCanvas();
    }

    // 5 second debounce. Database is used to save working state per user, so we don't need to save too often.
    saveCanvas = debounce(this.undebouncedSaveCanvas, 5000);

    // Track the last logged error so a sustained failure (e.g., userCanvas row
    // not yet seeded, network blip) doesn't spam the console every 5s.
    private lastSaveErrorMessage: string | null = null;

    private async undebouncedSaveCanvas() {
        // Guard against the unset/transient case — the canvas store is
        // constructed before `applyCanvas` runs, so any debounced save fired
        // before bootstrap (e.g., the initial scale setter) would otherwise
        // throw inside Convex with an empty id.
        if (!this.id) return;
        const canvasId = this.id as Id<'canvases'>;
        const attempt = async () =>
            this.convex.mutation(convexApi.users.upsertCanvasView, {
                canvasId,
                scale: this.scale,
                x: this.position.x,
                y: this.position.y,
            });

        try {
            await attempt();
            this.lastSaveErrorMessage = null;
        } catch {
            try {
                await new Promise((resolve) => setTimeout(resolve, 750));
                await attempt();
                this.lastSaveErrorMessage = null;
            } catch (retryError) {
                const message =
                    retryError instanceof Error ? retryError.message : String(retryError);
                if (message !== this.lastSaveErrorMessage) {
                    console.error('Failed to update canvas', retryError);
                    this.lastSaveErrorMessage = message;
                }
            }
        }
    }

    clear() {
        this._scale = DefaultSettings.SCALE;
        this._position = DefaultSettings.PAN_POSITION;
    }
}
