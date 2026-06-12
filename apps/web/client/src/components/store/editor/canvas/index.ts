import type { ConvexHttpClient } from 'convex/browser';
import { api as convexApi } from '@convex/_generated/api';
import { debounce } from 'lodash';
import { makeAutoObservable } from 'mobx';

import type { Canvas, RectPosition } from '@weblab/models';
import { DefaultSettings } from '@weblab/constants';
import { DefaultDesktopFrame } from '@weblab/db';

import type { EditorEngine } from '../engine';
import type { Id } from '@convex/_generated/dataModel';
import { getConvexHttpClient } from '@/components/store/lib/convex-http-client';

export class CanvasManager {
    private _id = '';
    private _scale: number = DefaultSettings.SCALE;
    private _position: RectPosition = DefaultSettings.PAN_POSITION;
    // Per-user canvas chrome toggles. Default: rulers off, guides on. The
    // defaults match how Figma ships — rulers are off until you ask for
    // them (Shift+R), but if you've configured a layout guide on a frame
    // it should render unless you've explicitly hidden them (Shift+G).
    private _showRulers = false;
    private _showLayoutGuides = true;
    private convex: ConvexHttpClient = getConvexHttpClient();

    constructor(private readonly editorEngine: EditorEngine) {
        this._position = this.getDefaultPanPosition();
        makeAutoObservable(this);
    }

    applyCanvas(canvas: Canvas) {
        this.id = canvas.id;
        this.scale = canvas.scale ?? DefaultSettings.SCALE;
        this.position = canvas.position ?? this.getDefaultPanPosition();
        // Toggle bootstrap. Legacy `userCanvases` rows don't carry these
        // columns (they were added with the rulers/layout-guides feature),
        // so we keep the constructor defaults when the field is missing.
        if (canvas.showRulers !== undefined) this._showRulers = canvas.showRulers;
        if (canvas.showLayoutGuides !== undefined) this._showLayoutGuides = canvas.showLayoutGuides;
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

    // ── Per-user canvas chrome toggles ────────────────────────────────────
    // Persisted on the same `userCanvases` row as scale/pan so they roam
    // across devices. The hotkeys in canvas/hotkeys/index.tsx call the
    // toggle helpers; the right-panel controls flip the setters directly.

    get showRulers() {
        return this._showRulers;
    }

    set showRulers(value: boolean) {
        this._showRulers = value;
        this.saveCanvas();
    }

    toggleRulers() {
        this.showRulers = !this._showRulers;
    }

    get showLayoutGuides() {
        return this._showLayoutGuides;
    }

    set showLayoutGuides(value: boolean) {
        this._showLayoutGuides = value;
        this.saveCanvas();
    }

    toggleLayoutGuides() {
        this.showLayoutGuides = !this._showLayoutGuides;
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
                showRulers: this._showRulers,
                showLayoutGuides: this._showLayoutGuides,
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
        // Cancel any pending debounced save BEFORE resetting state — otherwise
        // a save queued up to 5s earlier fires after the resets below and
        // clobbers the user's persisted pan/zoom with the defaults.
        this.saveCanvas.cancel();
        this._id = '';
        this._scale = DefaultSettings.SCALE;
        this._position = DefaultSettings.PAN_POSITION;
        // Reset toggles to construction defaults so a project switch
        // doesn't carry the previous project's UI state forward.
        this._showRulers = false;
        this._showLayoutGuides = true;
    }
}
