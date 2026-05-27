import type { ConvexHttpClient } from 'convex/browser';
import { api as convexApi } from '@convex/_generated/api';
import { makeAutoObservable } from 'mobx';
import { v4 as uuid } from 'uuid';

import { DEFAULT_BREAKPOINT_PRESETS, GROUP_GUTTER } from '@weblab/db';
import { type Frame, type FrameBreakpoint, type LayoutGuideConfig } from '@weblab/models';
import { calculateNonOverlappingPosition } from '@weblab/utility';

import type { EditorEngine } from '../engine';
import type { IFrameView } from '@/app/project/[id]/_components/canvas/frame/view';
import type { Id } from '@convex/_generated/dataModel';
import { getConvexHttpClient } from '@/components/store/lib/convex-http-client';
import { roundDimensions } from './dimension';
import { FrameNavigationManager } from './navigation';

// Convex `frames` rows are flat (x/y/width/height/breakpointId/...) while the
// editor model nests `position`, `dimension`, `breakpoint`. Inline the mapping
// here — the @weblab/db `toDbFrame` / `toDbPartialFrame` helpers are now
// pass-through stubs (Drizzle is gone) so we can't lean on them anymore.
function toConvexFrame(frame: Frame): {
    canvasId: Id<'canvases'>;
    branchId?: Id<'branches'>;
    url: string;
    x: number;
    y: number;
    width: number;
    height: number;
    groupId?: string;
    breakpointId?: string;
    breakpointName?: string;
    breakpointOrder?: number;
} {
    return {
        canvasId: frame.canvasId as Id<'canvases'>,
        branchId: frame.branchId as Id<'branches'>,
        url: frame.url,
        x: frame.position.x,
        y: frame.position.y,
        width: frame.dimension.width,
        height: frame.dimension.height,
        groupId: frame.groupId,
        breakpointId: frame.breakpoint.id,
        breakpointName: frame.breakpoint.name,
        breakpointOrder: frame.breakpoint.order,
    };
}

function toConvexPartialFrame(partial: Partial<Frame>): {
    url?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    groupId?: string;
    breakpointId?: string;
    breakpointName?: string;
    breakpointOrder?: number;
    branchId?: Id<'branches'>;
    layoutGuides?: LayoutGuideConfig[] | null;
} {
    const out: ReturnType<typeof toConvexPartialFrame> = {};
    if (partial.url !== undefined) out.url = partial.url;
    if (partial.position) {
        out.x = partial.position.x;
        out.y = partial.position.y;
    }
    if (partial.dimension) {
        out.width = partial.dimension.width;
        out.height = partial.dimension.height;
    }
    if (partial.groupId !== undefined) out.groupId = partial.groupId;
    if (partial.breakpoint) {
        out.breakpointId = partial.breakpoint.id;
        out.breakpointName = partial.breakpoint.name;
        out.breakpointOrder = partial.breakpoint.order;
    }
    if (partial.branchId !== undefined) out.branchId = partial.branchId as Id<'branches'>;
    // Pass-through: empty array (clear all) vs absent (no change). Treat
    // both `[]` and a populated array as a write; `undefined` skips.
    if (partial.layoutGuides !== undefined) out.layoutGuides = partial.layoutGuides;
    return out;
}

export interface FrameData {
    frame: Frame;
    view: IFrameView | null;
    selected: boolean;
    /** Live page content height reported from the iframe (drives auto-height). */
    contentHeight: number | null;
}

export class FramesManager {
    private _frameIdToData = new Map<string, FrameData>();
    // Frames created locally whose row hasn't yet shown up in a reactive poll.
    // applyFrames must NOT prune these (they'd otherwise be dropped as
    // "removed server-side" in the window between the create mutation
    // committing and the `by_canvas` query reflecting it). An id leaves this set
    // the first time it appears in an incoming poll (confirmed), after which
    // normal prune semantics apply. Deterministic — no timing window.
    private _pendingCreateIds = new Set<string>();
    private _navigation = new FrameNavigationManager();
    private _disposers: Array<() => void> = [];
    private convex: ConvexHttpClient = getConvexHttpClient();

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    private updateFrameSelection(id: string, selected: boolean): void {
        const data = this._frameIdToData.get(id);
        if (data) {
            data.selected = selected;
            this._frameIdToData.set(id, data);
        }
    }

    /**
     * Apply a server snapshot of frames to the local store.
     *
     * Idempotent across re-applies (CR-050 collaboration polling):
     *   - existing entries keep their attached `view` and `selected` flag so
     *     polling doesn't clobber the user's iframe binding or selection
     *   - frames that no longer exist server-side AND have no local view are
     *     pruned (collaborator-deleted). Frames with a live view are kept to
     *     avoid killing an in-flight create.
     *   - on the very first apply (no prior entries) the first frame is
     *     selected as the default landing target.
     */
    applyFrames(frames: Frame[]) {
        const isInitialApply = this._frameIdToData.size === 0;
        const incomingIds = new Set(frames.map((f) => f.id));

        // A locally-created frame is "confirmed" the first time it appears in a
        // poll — clear it from the pending set so normal prune resumes.
        for (const id of this._pendingCreateIds) {
            if (incomingIds.has(id)) this._pendingCreateIds.delete(id);
        }

        // Prune frames removed server-side (skip those still bound to a view,
        // and skip just-created frames the poll hasn't caught up to yet).
        for (const [id, data] of this._frameIdToData) {
            if (!incomingIds.has(id) && data.view === null && !this._pendingCreateIds.has(id)) {
                this._frameIdToData.delete(id);
            }
        }

        frames.forEach((frame, index) => {
            const existing = this._frameIdToData.get(frame.id);
            this._frameIdToData.set(frame.id, {
                frame,
                view: existing?.view ?? null,
                selected: existing?.selected ?? (isInitialApply && index === 0),
                contentHeight: existing?.contentHeight ?? null,
            });
        });
    }

    get selected(): FrameData[] {
        return Array.from(this._frameIdToData.values()).filter((w) => w.selected);
    }

    get navigation(): FrameNavigationManager {
        return this._navigation;
    }

    getAll(): FrameData[] {
        return Array.from(this._frameIdToData.values());
    }

    getByBranchId(branchId: string): FrameData[] {
        return Array.from(this._frameIdToData.values()).filter(
            (w) => w.frame.branchId === branchId,
        );
    }

    getByGroupId(groupId: string): FrameData[] {
        return Array.from(this._frameIdToData.values())
            .filter((w) => w.frame.groupId === groupId)
            .sort((a, b) => a.frame.breakpoint.order - b.frame.breakpoint.order);
    }

    getSiblingsOf(frameId: string): FrameData[] {
        const data = this.get(frameId);
        if (!data) return [];
        return this.getByGroupId(data.frame.groupId);
    }

    get(id: string): FrameData | null {
        return this._frameIdToData.get(id) ?? null;
    }

    setContentHeight(frameId: string, height: number) {
        const data = this._frameIdToData.get(frameId);
        if (data && data.contentHeight !== height) {
            this._frameIdToData.set(frameId, { ...data, contentHeight: height });
        }
    }

    registerView(frame: Frame, view: IFrameView) {
        const isSelected = this.isSelected(frame.id);
        const existing = this._frameIdToData.get(frame.id);
        this._frameIdToData.set(frame.id, {
            frame,
            view,
            selected: isSelected,
            contentHeight: existing?.contentHeight ?? null,
        });
        // `view.src` may be empty (offline `srcdoc` mode) or otherwise unparseable
        // — fall back to '/' so the navigation manager still gets a valid entry
        // and we don't crash the iframe registration.
        let framePathname = '/';
        try {
            if (view.src) framePathname = new URL(view.src).pathname;
        } catch (err) {
            console.warn('Invalid frame URL on register', view.src, err);
        }
        this._navigation.registerFrame(frame.id, framePathname);
    }

    deregister(frame: Frame) {
        this._frameIdToData.delete(frame.id);
    }

    /**
     * Clear the live `view` reference for a frame without dropping the entry.
     * Used by FrameComponent's unmount/sandbox-restart cleanup so the frame
     * stays in the canvas while ensuring no caller can keep calling penpal
     * methods on a destroyed channel. The next `registerView` call (when the
     * iframe re-mounts) repopulates the view and preserves contentHeight.
     */
    deregisterView(frameId: string) {
        const data = this._frameIdToData.get(frameId);
        if (data && data.view !== null) {
            this._frameIdToData.set(frameId, { ...data, view: null });
        }
    }

    deregisterAll() {
        this._frameIdToData.clear();
    }

    isSelected(id: string) {
        return this._frameIdToData.get(id)?.selected ?? false;
    }

    select(frames: Frame[], multiselect = false) {
        if (!multiselect) {
            this.deselectAll();
            for (const frame of frames) {
                this.updateFrameSelection(frame.id, true);
            }
        } else {
            for (const frame of frames) {
                this.updateFrameSelection(frame.id, !this.isSelected(frame.id));
            }
        }
        if (frames.length > 0) {
            const last = frames[frames.length - 1]!;
            this.editorEngine.breakpoints?.setActive(last.breakpoint.id);
        }
        this.notify();
    }

    deselect(frame: Frame) {
        this.updateFrameSelection(frame.id, false);
        this.notify();
    }

    deselectAll() {
        for (const [id] of this._frameIdToData) {
            this.updateFrameSelection(id, false);
        }
        this.notify();
    }

    private notify() {
        this._frameIdToData = new Map(this._frameIdToData);
    }

    clear() {
        this.deregisterAll();
        this._disposers.forEach((dispose) => dispose());
        this._disposers = [];
        this._navigation.clearAllHistory();
    }

    disposeFrame(frameId: string) {
        this._frameIdToData.delete(frameId);
        this._pendingCreateIds.delete(frameId);
        this.editorEngine?.ast?.mappings?.remove(frameId);
        this._navigation.removeFrame(frameId);
    }

    reloadAllViews() {
        for (const frameData of this.getAll()) {
            frameData.view?.reload();
        }
    }

    reloadView(id: string) {
        const frameData = this.get(id);
        if (!frameData?.view) {
            console.error('Frame view not found for reload', id);
            return;
        }
        frameData.view.reload();
    }

    /**
     * Reloads every frame in the same breakpoint group as `id`. Useful when an
     * action affects all responsive views at once (e.g. source-write).
     */
    reloadGroup(id: string) {
        const siblings = this.getSiblingsOf(id);
        for (const sib of siblings) {
            sib.view?.reload();
        }
    }

    // Navigation history methods
    async goBack(frameId: string): Promise<void> {
        const previousPath = this._navigation.goBack(frameId);
        if (previousPath) {
            await this.navigateToPath(frameId, previousPath, false);
        }
    }

    async goForward(frameId: string): Promise<void> {
        const nextPath = this._navigation.goForward(frameId);
        if (nextPath) {
            await this.navigateToPath(frameId, nextPath, false);
        }
    }

    async navigateToPath(frameId: string, path: string, addToHistory = true): Promise<void> {
        const frameData = this.get(frameId);
        if (!frameData?.view) {
            console.warn('No frame view available for navigation');
            return;
        }

        try {
            const currentUrl = frameData.view.src;
            const baseUrl = currentUrl ? new URL(currentUrl).origin : null;

            if (!baseUrl) {
                console.warn('No base URL found');
                return;
            }

            // Group siblings should follow the navigation so all breakpoints stay in sync.
            const siblings = this.getSiblingsOf(frameId);
            for (const sib of siblings) {
                await this.updateAndSaveToStorage(sib.frame.id, {
                    url: `${baseUrl}${path}`,
                });
            }

            this.editorEngine.pages.setActivePath(frameId, path);

            this.editorEngine.posthog.capture('page_navigate', {
                path,
            });

            if (addToHistory) {
                this._navigation.addToHistory(frameId, path);
            }
        } catch (error) {
            console.error('Navigation failed:', error);
        }
    }

    async delete(id: string) {
        const frameData = this.get(id);
        // Guard on existence, NOT on `.view`. Frames belonging to a non-active
        // branch are never mounted (`view` stays null), so a `!frameData.view`
        // guard made bulk deletes (e.g. removeBranch) silently skip the Convex
        // `frames.remove` mutation — orphaning those rows in the DB so they
        // reappeared on the next bootstrap. The delete path (Convex mutation +
        // disposeFrame + repackGroup) is view-independent, so deleting an
        // unmounted frame is safe.
        if (!frameData) {
            console.error('Frame not found for delete', id);
            return;
        }

        try {
            await this.convex.mutation(convexApi.frames.remove, {
                frameId: frameData.frame.id as Id<'frames'>,
            });
            this.disposeFrame(frameData.frame.id);
            this.repackGroup(frameData.frame.groupId);
        } catch (error) {
            console.error('Failed to delete frame', error);
        }
    }

    async create(frame: Frame) {
        try {
            await this.convex.mutation(
                convexApi.frames.create,
                toConvexFrame(roundDimensions(frame)),
            );
            this._frameIdToData.set(frame.id, {
                frame,
                view: null,
                selected: false,
                contentHeight: null,
            });
            // Protect this frame from applyFrames pruning until a poll confirms it.
            this._pendingCreateIds.add(frame.id);
        } catch (error) {
            console.error('Failed to create frame', error);
        }
    }

    async duplicate(id: string) {
        const frameData = this.get(id);
        if (!frameData?.view) {
            console.error('Frame view not found for duplicate', id);
            return;
        }

        const frame = frameData.frame;
        const allFrames = this.getAll().map((f) => f.frame);

        // Duplicating a frame creates a new standalone group anchored at its own coords.
        const proposedFrame: Frame = {
            ...frame,
            id: uuid(),
            groupId: uuid(),
            position: {
                x: frame.position.x + frame.dimension.width + 100,
                y: frame.position.y,
            },
        };

        const newPosition = calculateNonOverlappingPosition(proposedFrame, allFrames);
        const newFrame: Frame = {
            ...proposedFrame,
            position: newPosition,
        };

        await this.create(newFrame);
    }

    /**
     * Add a new breakpoint frame to an existing group, sized to the given preset
     * or custom width. Position is computed by repacking; URL & branch are inherited
     * from the group's first frame.
     */
    async addBreakpoint(
        groupId: string,
        breakpoint: { id: string; name: string; width: number; height?: number },
    ) {
        const siblings = this.getByGroupId(groupId);
        const first = siblings[0];
        if (!first) {
            console.error('Cannot add breakpoint to empty group', groupId);
            return;
        }
        const order = siblings.reduce((m, s) => Math.max(m, s.frame.breakpoint.order), -1) + 1;
        const newBreakpoint: FrameBreakpoint = {
            id: breakpoint.id,
            name: breakpoint.name,
            width: breakpoint.width,
            order,
        };
        const seedHeight = breakpoint.height ?? first.frame.dimension.height;
        const newFrame: Frame = {
            id: uuid(),
            branchId: first.frame.branchId,
            canvasId: first.frame.canvasId,
            url: first.frame.url,
            groupId,
            breakpoint: newBreakpoint,
            position: { x: 0, y: first.frame.position.y },
            dimension: { width: breakpoint.width, height: seedHeight },
        };
        await this.create(newFrame);
        this.repackGroup(groupId);
    }

    /**
     * Recompute sibling positions in a group: pack left-to-right with `GROUP_GUTTER`,
     * preserving the leftmost frame's `position`. Persists to storage.
     */
    repackGroup(groupId: string) {
        const siblings = this.getByGroupId(groupId);
        if (siblings.length === 0) return;
        const anchor = siblings[0]!.frame.position;
        let cursorX = anchor.x;
        for (const sib of siblings) {
            const width = sib.frame.breakpoint.width || sib.frame.dimension.width;
            if (sib.frame.position.x !== cursorX || sib.frame.position.y !== anchor.y) {
                void this.updateAndSaveToStorage(sib.frame.id, {
                    position: { x: cursorX, y: anchor.y },
                });
            }
            cursorX += width + GROUP_GUTTER;
        }
    }

    async updateAndSaveToStorage(frameId: string, frame: Partial<Frame>) {
        const existingFrame = this.get(frameId);
        if (existingFrame) {
            const newFrame = { ...existingFrame.frame, ...frame };
            this._frameIdToData.set(frameId, {
                ...existingFrame,
                frame: newFrame,
                selected: existingFrame.selected,
            });
        }
        await this.saveToStorage(frameId, frame);
    }

    /**
     * Replace the layout-guides array on a frame and persist it. Thin wrapper
     * over `updateAndSaveToStorage` — exists as a named helper so consumers
     * (right-panel popover, layout-guide-styles apply) don't have to know
     * about the whole-array-replace semantics. Pass `[]` to clear all guides.
     */
    async updateLayoutGuides(frameId: string, layoutGuides: LayoutGuideConfig[]) {
        await this.updateAndSaveToStorage(frameId, { layoutGuides });
    }

    // Per-frame debounced persist. A single shared debounce would collapse
    // rapid successive calls into ONE trailing call carrying only the LAST
    // frame's args, so multi-frame writes (repackGroup / navigateToPath /
    // addBreakpoint loops) would lose all but the last frame's position/url.
    // Each frameId gets its own 1s timer, and partial updates to the same frame
    // within the window are merged. The pending map lives in this closure (not
    // an observable field) so it stays out of the MobX graph.
    saveToStorage = (() => {
        const pending = new Map<
            string,
            { frame: Partial<Frame>; timer: ReturnType<typeof setTimeout> }
        >();
        return (frameId: string, frame: Partial<Frame>): void => {
            const existing = pending.get(frameId);
            if (existing) clearTimeout(existing.timer);
            const mergedFrame: Partial<Frame> = { ...(existing?.frame ?? {}), ...frame };
            const timer = setTimeout(() => {
                pending.delete(frameId);
                void this.undebouncedSaveToStorage(frameId, mergedFrame);
            }, 1000);
            pending.set(frameId, { frame: mergedFrame, timer });
        };
    })();

    async undebouncedSaveToStorage(frameId: string, frame: Partial<Frame>) {
        try {
            // Cast through `unknown` at the boundary: the model's
            // `LayoutGuideConfig.styleId` is `string | null` while the
            // Convex mutation arg uses the branded `Id<'layoutGuideStyles'>`.
            // The wire shape is identical (Convex `Id` is a compile-time
            // brand only), so the runtime payload is safe.
            const args = {
                frameId: frameId as Id<'frames'>,
                ...toConvexPartialFrame(frame),
            } as unknown as Parameters<typeof this.convex.mutation>[1];
            await this.convex.mutation(convexApi.frames.update, args);
        } catch (error) {
            console.error('Failed to update frame', error);
        }
    }

    canDelete() {
        const selectedFrames = this.selected;

        if (selectedFrames.length > 0) {
            for (const selectedFrame of selectedFrames) {
                const branchId = selectedFrame.frame.branchId;
                const framesInBranch = this.getAll().filter(
                    (frameData) => frameData.frame.branchId === branchId,
                );
                if (framesInBranch.length <= 1) {
                    return false;
                }
                const groupId = selectedFrame.frame.groupId;
                const groupSize = this.getByGroupId(groupId).length;
                if (groupSize <= 1) {
                    return false;
                }
            }
            return true;
        }

        return this.getAll().length > 1;
    }

    canDuplicate() {
        return this.selected.length > 0;
    }

    calculateNonOverlappingPosition(proposedFrame: Frame): {
        x: number;
        y: number;
    } {
        const allFrames = this.getAll().map((frameData) => frameData.frame);
        return calculateNonOverlappingPosition(proposedFrame, allFrames);
    }

    async duplicateSelected() {
        for (const frame of this.selected) {
            await this.duplicate(frame.frame.id);
        }
    }

    async deleteSelected() {
        if (!this.canDelete()) {
            console.error('Cannot delete the last frame');
            return;
        }

        for (const frame of this.selected) {
            await this.delete(frame.frame.id);
        }
    }

    /**
     * Default-breakpoint helpers exposed for migration / UI.
     */
    static get defaultPresets() {
        return DEFAULT_BREAKPOINT_PRESETS;
    }
}
