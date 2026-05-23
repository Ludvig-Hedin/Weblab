import type { Frame } from '@weblab/models';

/**
 * TEMPORARILY DISABLED — original implementation imported
 * `DEFAULT_BREAKPOINT_PRESETS`, `GROUP_GUTTER`, `toDbFrame` from `@weblab/db`,
 * which no longer exports them after the in-flight Convex migration. The
 * client bundle fails to compile with `Module not found: Can't resolve
 * '@weblab/db'` (server-only package leaking into a client component),
 * which prevents the project editor from loading at all.
 *
 * Original behavior: backfill Tablet/Phone siblings for legacy frames that
 * only had a Desktop breakpoint. After migration the frames table is
 * authoritative and new projects ship with all three breakpoints, so the
 * backfill is only useful for pre-migration projects. Returning the input
 * unchanged is a safe no-op for new projects; legacy projects will simply
 * not auto-synthesize the extra siblings (user can add them manually).
 *
 * TODO(convex-migration): port the breakpoint-preset constants to a
 * client-safe module (e.g. `@weblab/constants` or `@weblab/models`) and
 * rewrite `api.frame.create.mutate(toDbFrame(newFrame))` against the new
 * Convex mutation. Then restore the original synthesis logic.
 */
export async function ensureBreakpointSiblings(frames: Frame[]): Promise<Frame[]> {
    return frames;
}
