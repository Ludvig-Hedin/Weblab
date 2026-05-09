import { v4 as uuidv4 } from 'uuid';

import type { Frame, FrameBreakpoint } from '@weblab/models';
import { DEFAULT_BREAKPOINT_PRESETS, GROUP_GUTTER, toDbFrame } from '@weblab/db';

import { api } from '@/trpc/client';

/**
 * Frames inserted before the breakpoint-group migration only have a single
 * Desktop entry per branch. On first canvas load we ensure each branch has a
 * complete Desktop+Tablet+Phone group so users see the new layout immediately.
 *
 * - Frames already grouped (matching `groupId`) are left alone.
 * - For each lone-frame group missing 'tablet' or 'phone', synthesize the
 *   missing siblings and persist them via `frame.create`.
 * - Returns the (possibly extended) list of frames so the caller can apply
 *   them in one pass without waiting for the next refetch.
 *
 * Idempotent: re-running on a fully-grouped canvas is a no-op.
 */
export async function ensureBreakpointSiblings(frames: Frame[]): Promise<Frame[]> {
    const byGroup = new Map<string, Frame[]>();
    for (const f of frames) {
        const key = f.groupId || f.id;
        const arr = byGroup.get(key) ?? [];
        arr.push(f);
        byGroup.set(key, arr);
    }

    // Pair each pending frame with its create promise so we only return
    // frames whose persist call succeeded — failures shouldn't materialize
    // in the canvas where they'd disappear on the next refetch.
    const pending: { frame: Frame; promise: Promise<unknown> }[] = [];

    for (const [, siblings] of byGroup) {
        if (siblings.length === 0) continue;
        const presentIds = new Set(siblings.map((s) => s.breakpoint.id));
        const anchor = [...siblings].sort((a, b) => a.breakpoint.order - b.breakpoint.order)[0]!;

        // Pack any newly-synthesized siblings to the right of the rightmost existing frame.
        let cursorX = Math.max(
            ...siblings.map(
                (s) => s.position.x + (s.breakpoint.width || s.dimension.width) + GROUP_GUTTER,
            ),
        );
        let nextOrder = Math.max(...siblings.map((s) => s.breakpoint.order)) + 1;

        for (const preset of DEFAULT_BREAKPOINT_PRESETS) {
            if (presentIds.has(preset.id)) continue;
            const breakpoint: FrameBreakpoint = {
                id: preset.id,
                name: preset.name,
                width: preset.width,
                order: nextOrder++,
            };
            const newFrame: Frame = {
                id: uuidv4(),
                branchId: anchor.branchId,
                canvasId: anchor.canvasId,
                url: anchor.url,
                groupId: anchor.groupId || anchor.id,
                breakpoint,
                position: { x: cursorX, y: anchor.position.y },
                dimension: { width: preset.width, height: preset.height },
            };
            cursorX += preset.width + GROUP_GUTTER;
            const promise = api.frame.create.mutate(toDbFrame(newFrame));
            pending.push({ frame: newFrame, promise });
        }
    }

    if (pending.length === 0) {
        return frames;
    }

    const results = await Promise.allSettled(pending.map((p) => p.promise));
    const persisted: Frame[] = [];
    for (let i = 0; i < pending.length; i++) {
        const result = results[i]!;
        if (result.status === 'fulfilled') {
            persisted.push(pending[i]!.frame);
        } else {
            console.error('Failed to synthesize breakpoint sibling', result.reason);
        }
    }
    return [...frames, ...persisted];
}
