// Database-backed helpers for the AI runaway / spike safeguards.
//
// Used by the public `api.aiGuards.*` functions (called from the Next.js AI
// routes), by `aiUsageEvents.insert` (records chat spend), and by the Convex
// AI actions (via `internal.aiGuards._gateForAction`). Limit math lives in
// ./aiGuardMath (pure, unit-tested); numbers + copy live in ./aiGuardConfig.

import { isProOnlyModel } from '@weblab/models/llm';

import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { AiGuardConfig, AiRequestBucket } from './aiGuardConfig';
import { loadActiveSubscriptionWithProduct } from '../usage';
import {
    AI_BUDGET_MESSAGE,
    AI_CONTINUATION_MESSAGE,
    AI_GUARD_LOG_TAGS,
    AI_PAUSED_MESSAGE,
    AI_RATE_LIMIT_MESSAGE,
    AI_USER_SPEND_MESSAGE,
    readAiGuardConfig,
    retryHint,
} from './aiGuardConfig';
import {
    addUserSpend,
    clampEventCost,
    evaluateSlidingWindows,
    evaluateTurnContinuation,
    evaluateUserSpend,
    FLEET_SPEND_SHARDS,
    fleetBudgetCrossing,
    fleetContribution,
    isFleetBudgetExceeded,
    pickFleetShard,
    sumFleetShards,
    utcDayStart,
    withoutRecordedTimestamp,
} from './aiGuardMath';

export type AiGuardBlockReason =
    | 'disabled'
    | 'budget'
    | 'user_spend'
    | 'pro_model_required'
    | 'rate_limited'
    | 'continuation_cap';

/**
 * `recordedAt` identifies what the gate wrote, so a request refused LATER
 * (e.g. 402 out of credits) can be un-recorded via `releaseAiRequest`.
 */
export type AiGuardResult =
    | {
          allowed: true;
          isPro: boolean;
          recordedAt?: number;
          continuationCounted?: boolean;
      }
    | {
          allowed: false;
          isPro: boolean;
          reason: AiGuardBlockReason;
          message: string;
          retryAfterSeconds: number;
      };

export interface AiGuardRequest {
    /** Rate-limit bucket, or 'none' to skip the request limiter (transcribe). */
    bucket: AiRequestBucket | 'none';
    /**
     * Chat turn identity, for the auto-continuation cap (llm bucket only).
     * `scope` (the conversation id) keys the counter, so interleaving
     * conversations can't reset each other's count.
     */
    turn?: { key: string; scope: string; isContinuation: boolean };
    /** Requested model; Pro-only models are refused for non-Pro users. */
    model?: string;
}

/** Message for the Pro-only model refusal (matches the chat route copy). */
export const PRO_MODEL_REQUIRED_MESSAGE = 'This model is available on Pro.';

/** Day total across all shards (bounded read: at most a few rows). */
async function loadFleetDayUsd(ctx: MutationCtx, dayStart: number): Promise<number> {
    const rows = await ctx.db
        .query('aiFleetSpend')
        .withIndex('by_day', (q) => q.eq('dayStart', dayStart))
        .take(FLEET_SPEND_SHARDS * 2);
    return sumFleetShards(rows);
}

function turnRowKey(userId: Id<'users'>, scope: string): string {
    return `${userId}:turn:${scope.slice(0, 128)}`;
}

async function loadUserSpend(ctx: MutationCtx, userId: Id<'users'>) {
    return ctx.db
        .query('aiUserSpend')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .unique();
}

async function loadRateRow(ctx: MutationCtx, key: string) {
    return ctx.db
        .query('aiRateLimits')
        .withIndex('by_key', (q) => q.eq('key', key))
        .unique();
}

function blocked(
    reason: AiGuardBlockReason,
    message: string,
    retryAfterSeconds: number,
    isPro: boolean,
): AiGuardResult {
    return { allowed: false, reason, message, retryAfterSeconds, isPro };
}

/**
 * Run every pre-request safeguard for one AI call and, when allowed, record
 * the request against the caller's rate-limit bucket. Order: kill switch →
 * fleet budget → per-user spend → request rate → continuation cap. Only the
 * last two write (the rate-limit row); the others are single-doc reads.
 */
export async function checkAiGuards(
    ctx: MutationCtx,
    userId: Id<'users'>,
    request: AiGuardRequest,
    config: AiGuardConfig = readAiGuardConfig(),
    now: number = Date.now(),
): Promise<AiGuardResult> {
    if (config.disabled) {
        console.warn(`${AI_GUARD_LOG_TAGS.killSwitch} AI request refused (AI_DISABLED)`, {
            userId,
            bucket: request.bucket,
        });
        return blocked('disabled', AI_PAUSED_MESSAGE, 0, false);
    }

    const fleetUsd = await loadFleetDayUsd(ctx, utcDayStart(now));
    if (isFleetBudgetExceeded(fleetUsd, config.dailyBudgetUsd)) {
        console.error(
            `${AI_GUARD_LOG_TAGS.budgetExceeded} fleet AI budget exhausted; refusing request`,
            { dayUsd: fleetUsd, budgetUsd: config.dailyBudgetUsd, userId },
        );
        return blocked('budget', AI_BUDGET_MESSAGE, 0, false);
    }
    if (fleetUsd >= config.dailyBudgetUsd * 0.8) {
        console.warn(`${AI_GUARD_LOG_TAGS.budgetWarning} fleet AI spend above 80% of budget`, {
            dayUsd: fleetUsd,
            budgetUsd: config.dailyBudgetUsd,
        });
    }

    const active = await loadActiveSubscriptionWithProduct(ctx, userId);
    const isPro = !!active?.isPro;
    const caps = isPro ? config.userCaps.pro : config.userCaps.free;
    const spendRow = await loadUserSpend(ctx, userId);
    const spend = evaluateUserSpend(spendRow, now, caps);
    if (!spend.allowed) {
        console.warn(`${AI_GUARD_LOG_TAGS.userSpendCap} per-user AI spend cap hit`, {
            userId,
            reason: spend.reason,
            hourUsd: spend.hourUsd,
            dayUsd: spend.dayUsd,
        });
        return blocked(
            'user_spend',
            `${AI_USER_SPEND_MESSAGE} ${retryHint(spend.retryAfterSeconds)}`,
            spend.retryAfterSeconds,
            isPro,
        );
    }

    // Pro-only model check BEFORE anything is recorded, so a refused request
    // never consumes rate-limit or continuation budget.
    if (request.model && !isPro && isProOnlyModel(request.model)) {
        return blocked('pro_model_required', PRO_MODEL_REQUIRED_MESSAGE, 0, isPro);
    }

    if (request.bucket === 'none') return { allowed: true, isPro };

    const key = `${userId}:${request.bucket}`;
    const row = await loadRateRow(ctx, key);
    const rate = evaluateSlidingWindows(
        row?.timestamps ?? [],
        now,
        config.buckets[request.bucket],
    );
    if (!rate.allowed) {
        console.warn(`${AI_GUARD_LOG_TAGS.rateLimited} AI request rate limit hit`, {
            userId,
            bucket: request.bucket,
        });
        return blocked(
            'rate_limited',
            `${AI_RATE_LIMIT_MESSAGE} ${retryHint(rate.retryAfterSeconds)}`,
            rate.retryAfterSeconds,
            isPro,
        );
    }

    // Continuation counter: its own row per user + conversation, so turns in
    // other conversations can't reset it. Evaluated before any write.
    let continuationCounted = false;
    if (request.turn && request.bucket === 'llm') {
        const tKey = turnRowKey(userId, request.turn.scope);
        const turnRow = await loadRateRow(ctx, tKey);
        const turn = evaluateTurnContinuation(
            turnRow ? { turnKey: turnRow.turnKey, continuations: turnRow.turnContinuations ?? 0 } : null,
            request.turn,
            config.maxContinuationsPerTurn,
        );
        if (!turn.allowed) {
            console.warn(`${AI_GUARD_LOG_TAGS.continuationCap} auto-continuation cap hit`, {
                userId,
                max: config.maxContinuationsPerTurn,
            });
            return blocked('continuation_cap', AI_CONTINUATION_MESSAGE, 0, isPro);
        }
        const turnPatch = {
            turnKey: turn.next.turnKey,
            turnContinuations: turn.next.continuations,
            updatedAt: now,
        };
        if (turnRow) {
            await ctx.db.patch(turnRow._id, turnPatch);
        } else {
            await ctx.db.insert('aiRateLimits', { key: tKey, timestamps: [], ...turnPatch });
        }
        continuationCounted = request.turn.isContinuation;
    }

    if (row) {
        await ctx.db.patch(row._id, { timestamps: rate.timestamps, updatedAt: now });
    } else {
        await ctx.db.insert('aiRateLimits', { key, timestamps: rate.timestamps, updatedAt: now });
    }
    return { allowed: true, isPro, recordedAt: now, continuationCounted };
}

/**
 * Undo what `checkAiGuards` recorded for a request that was refused after the
 * gate (e.g. 402 out of credits), so refused requests don't eat the user's
 * rate-limit or continuation budget.
 */
export async function releaseAiRequest(
    ctx: MutationCtx,
    userId: Id<'users'>,
    release: {
        bucket: AiRequestBucket;
        recordedAt: number;
        turnScope?: string;
        continuationCounted?: boolean;
    },
): Promise<void> {
    const row = await loadRateRow(ctx, `${userId}:${release.bucket}`);
    if (row) {
        await ctx.db.patch(row._id, {
            timestamps: withoutRecordedTimestamp(row.timestamps, release.recordedAt),
        });
    }
    if (release.turnScope && release.continuationCounted) {
        const turnRow = await loadRateRow(ctx, turnRowKey(userId, release.turnScope));
        if (turnRow && (turnRow.turnContinuations ?? 0) > 0) {
            await ctx.db.patch(turnRow._id, {
                turnContinuations: (turnRow.turnContinuations ?? 0) - 1,
            });
        }
    }
}

/**
 * Add one priced AI call's real cost to the caller's spend counters and the
 * fleet day total. The cost is caller-reported (these mutations are public so
 * the Next.js routes can call them with the user's token), so it is clamped
 * per event and each user's share of the fleet total is capped at ~their own
 * daily allowance — a forged call can at worst block that user and move the
 * fleet counter by one user's allowance.
 */
export async function recordAiSpend(
    ctx: MutationCtx,
    userId: Id<'users'>,
    costUsd: number,
    config: AiGuardConfig = readAiGuardConfig(),
    now: number = Date.now(),
): Promise<void> {
    const cost = clampEventCost(costUsd, config.maxEventCostUsd);
    if (cost <= 0) return;
    const active = await loadActiveSubscriptionWithProduct(ctx, userId);
    const userDayCap = (active?.isPro ? config.userCaps.pro : config.userCaps.free).dayUsd;

    const spendRow = await loadUserSpend(ctx, userId);
    const dayStart = utcDayStart(now);
    const userDayBefore = spendRow && spendRow.dayStart === dayStart ? spendRow.dayUsd : 0;
    const next = addUserSpend(spendRow, now, cost);
    if (spendRow) {
        await ctx.db.patch(spendRow._id, { ...next, updatedAt: now });
    } else {
        await ctx.db.insert('aiUserSpend', { userId, ...next, updatedAt: now });
    }

    const contribution = fleetContribution(
        cost,
        userDayBefore,
        userDayCap * config.fleetShareOfUserDayCap,
    );
    if (contribution <= 0) return;

    // Write ONE random shard (reads/writes only that doc, so concurrent spend
    // writes rarely conflict). The day total is summed by the gate.
    const shard = pickFleetShard();
    const shardRow = await ctx.db
        .query('aiFleetSpend')
        .withIndex('by_day_shard', (q) => q.eq('dayStart', dayStart).eq('shard', shard))
        .unique();
    const shardBefore = shardRow?.usd ?? 0;
    const shardAfter = shardBefore + contribution;
    if (shardRow) {
        await ctx.db.patch(shardRow._id, {
            usd: shardAfter,
            events: shardRow.events + 1,
            updatedAt: now,
        });
    } else {
        await ctx.db.insert('aiFleetSpend', {
            dayStart,
            shard,
            usd: shardAfter,
            events: 1,
            updatedAt: now,
        });
    }

    // Per-shard crossing is a cheap early signal (one shard alone reaching
    // 1/N of the budget). The authoritative budget log + block is in the gate,
    // which sums all shards.
    const shardBudget = config.dailyBudgetUsd / FLEET_SPEND_SHARDS;
    if (fleetBudgetCrossing(shardBefore, shardAfter, shardBudget) === 'exceeded') {
        console.error(
            `${AI_GUARD_LOG_TAGS.budgetWarning} one fleet spend shard reached its share of the daily budget`,
            { shard, shardUsd: shardAfter, budgetUsd: config.dailyBudgetUsd },
        );
    }
}

/** Forced screenshot capture limiter, keyed per project. */
export async function checkScreenshotForce(
    ctx: MutationCtx,
    projectId: Id<'projects'>,
    config: AiGuardConfig = readAiGuardConfig(),
    now: number = Date.now(),
): Promise<boolean> {
    const key = `project:${projectId}:screenshotForce`;
    const row = await loadRateRow(ctx, key);
    const decision = evaluateSlidingWindows(row?.timestamps ?? [], now, [config.screenshotForce]);
    if (!decision.allowed) return false;
    if (row) {
        await ctx.db.patch(row._id, { timestamps: decision.timestamps, updatedAt: now });
    } else {
        await ctx.db.insert('aiRateLimits', {
            key,
            timestamps: decision.timestamps,
            updatedAt: now,
        });
    }
    return true;
}

/**
 * Spend writes come from our Next.js server, not browsers. The server passes
 * `AI_GUARD_SECRET`; without the match a signed-in user could call the public
 * mutation directly and inflate spend to trip the fleet budget for everyone.
 * While the secret is not configured in Convex we accept writes (and log), so
 * the counters keep working during rollout.
 */
export function isTrustedSpendWriter(serverSecret: string | undefined): boolean {
    const expected = process.env.AI_GUARD_SECRET;
    if (!expected) {
        console.warn('[AI_GUARD_SECRET_MISSING] spend write accepted without a server secret');
        return true;
    }
    return serverSecret === expected;
}
