import { makeAutoObservable } from 'mobx';

import type { BreakpointId } from '@weblab/models';

import type { EditorEngine } from '../engine';

/**
 * Tracks which breakpoint context the style panel is currently editing.
 *
 * UI is desktop-first (Desktop is the leftmost canvas), so the default
 * active breakpoint is 'desktop'. Selecting an element in or a frame at a
 * different breakpoint flips this; the active breakpoint is what
 * UpdateStyleAction targets carry, and what override-affordance UI reads.
 */
export class BreakpointsManager {
    private _activeId: BreakpointId = 'desktop';

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    get activeId(): BreakpointId {
        return this._activeId;
    }

    setActive(id: BreakpointId) {
        if (this._activeId !== id) {
            this._activeId = id;
        }
    }

    /**
     * Best-effort lookup of the active breakpoint's preset width by inspecting
     * any frame in the project that uses that id. Falls back to common widths.
     */
    activeWidth(): number {
        const sample = this.editorEngine.frames
            .getAll()
            .find((f) => f.frame.breakpoint.id === this._activeId);
        if (sample) return sample.frame.breakpoint.width;
        if (this._activeId === 'tablet') return 810;
        if (this._activeId === 'phone') return 390;
        return 1200;
    }

    clear() {
        this._activeId = 'desktop';
    }
}
