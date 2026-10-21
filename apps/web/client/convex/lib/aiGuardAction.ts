import type { Id } from '../_generated/dataModel';
import type { ActionCtx } from '../_generated/server';
import { internal } from '../_generated/api';

// Entry gate for Convex AI actions: kill switch, fleet daily budget, per-user
// spend caps and the per-user `aux` request limiter. Throws a ConvexError with
// friendly copy when blocked. Call it BEFORE any model / paid API call.
export async function assertAiAllowedForAction(
    ctx: ActionCtx,
    opts: { rateLimit?: boolean } = {},
): Promise<void> {
    await ctx.runMutation(internal.aiGuards._gateForAction, { rateLimit: opts.rateLimit });
}

/**
 * Record an action's estimated cost (see lib/aiActionPricing). Best-effort:
 * a failure is logged and never breaks the action's result.
 */
export async function recordActionSpend(ctx: ActionCtx, costUsd: number): Promise<void> {
    if (!(costUsd > 0)) return;
    try {
        await ctx.runMutation(internal.aiGuards._recordActionSpend, { costUsd });
    } catch (err) {
        console.error('[ai-guards] failed to record action spend', err);
    }
}

/** True when a forced screenshot capture is allowed for this project now. */
export async function allowForcedScreenshot(
    ctx: ActionCtx,
    projectId: Id<'projects'>,
): Promise<boolean> {
    return ctx.runMutation(internal.aiGuards._allowScreenshotForce, { projectId });
}
