// Runaway / spike safeguards for AI usage — ONE config module.
//
// Every number here has a default and can be overridden with a Convex
// environment variable, e.g.
//   bunx convex env set AI_DAILY_BUDGET_USD 20
//   bunx convex env set AI_DISABLED true        # kill switch
// Values are read on each call, so an env change takes effect on the next
// request without a code deploy. Invalid / non-positive numbers fall back to
// the default.
//
// SINGLE SOURCE OF TRUTH: the Next.js API routes enforce these limits by
// calling `api.aiGuards.checkAndRecord`, and the Convex AI actions call the
// same check, so every AI path reads these Convex values. The only Next.js-side
// knob is the `AI_DISABLED` env var (src/env.ts), an extra kill switch that
// works even when Convex is unreachable.
//
// Friendly user-facing strings live here too so the Next.js routes and the
// Convex actions show identical copy. TODO(i18n): move to messages/* once the
// API error path is localized (sibling route errors are inline English today).

export type AiRequestBucket = 'llm' | 'tabComplete' | 'aux';

export interface WindowRule {
    windowMs: number;
    max: number;
}

export interface SpendCaps {
    hourUsd: number;
    dayUsd: number;
}

export interface AiGuardConfig {
    /** Kill switch: every AI entry point refuses before calling a model. */
    disabled: boolean;
    /** Fleet-wide real USD spend allowed per UTC day. */
    dailyBudgetUsd: number;
    /** Per-user spend caps (rolling hour + UTC day), from real token cost. */
    userCaps: { free: SpendCaps; pro: SpendCaps };
    /** Per-user request rate limits per bucket. */
    buckets: Record<AiRequestBucket, WindowRule[]>;
    /** Max auto-continuation POSTs allowed for one user turn. */
    maxContinuationsPerTurn: number;
    /** Upper bound on one recorded event's cost (anti-forgery clamp). */
    maxEventCostUsd: number;
    /**
     * Most one user can add to the fleet counter per UTC day, as a multiple of
     * that user's own daily cap (anti-forgery: recorded costs are
     * caller-reported, so one account can only push the fleet total by about
     * its own allowance).
     */
    fleetShareOfUserDayCap: number;
    /** Forced screenshot captures allowed per project per window. */
    screenshotForce: WindowRule;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const AI_GUARD_DEFAULTS = {
    dailyBudgetUsd: 20,
    freeHourUsd: 1,
    freeDayUsd: 2,
    proHourUsd: 10,
    proDayUsd: 40,
    requestsPerMinute: 20,
    requestsPerHour: 400,
    tabCompletePerMinute: 120,
    auxPerMinute: 20,
    auxPerHour: 200,
    maxContinuationsPerTurn: 5,
    maxEventCostUsd: 10,
    screenshotForcePerWindow: 1,
    screenshotForceWindowMs: 5 * MINUTE_MS,
} as const;

type Env = Record<string, string | undefined>;

function positiveNumber(env: Env, key: string, fallback: number): number {
    const raw = env[key];
    if (raw === undefined || raw.trim() === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function isTruthyFlag(raw: string | undefined): boolean {
    if (!raw) return false;
    return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

export function readAiGuardConfig(env: Env = process.env): AiGuardConfig {
    const d = AI_GUARD_DEFAULTS;
    return {
        disabled: isTruthyFlag(env.AI_DISABLED),
        dailyBudgetUsd: positiveNumber(env, 'AI_DAILY_BUDGET_USD', d.dailyBudgetUsd),
        userCaps: {
            free: {
                hourUsd: positiveNumber(env, 'AI_FREE_HOURLY_USD', d.freeHourUsd),
                dayUsd: positiveNumber(env, 'AI_FREE_DAILY_USD', d.freeDayUsd),
            },
            pro: {
                hourUsd: positiveNumber(env, 'AI_PRO_HOURLY_USD', d.proHourUsd),
                dayUsd: positiveNumber(env, 'AI_PRO_DAILY_USD', d.proDayUsd),
            },
        },
        buckets: {
            llm: [
                {
                    windowMs: MINUTE_MS,
                    max: positiveNumber(env, 'AI_REQUESTS_PER_MINUTE', d.requestsPerMinute),
                },
                {
                    windowMs: HOUR_MS,
                    max: positiveNumber(env, 'AI_REQUESTS_PER_HOUR', d.requestsPerHour),
                },
            ],
            tabComplete: [
                {
                    windowMs: MINUTE_MS,
                    max: positiveNumber(env, 'AI_TAB_COMPLETE_PER_MINUTE', d.tabCompletePerMinute),
                },
            ],
            aux: [
                {
                    windowMs: MINUTE_MS,
                    max: positiveNumber(env, 'AI_AUX_PER_MINUTE', d.auxPerMinute),
                },
                { windowMs: HOUR_MS, max: positiveNumber(env, 'AI_AUX_PER_HOUR', d.auxPerHour) },
            ],
        },
        maxContinuationsPerTurn: positiveNumber(
            env,
            'AI_MAX_CONTINUATIONS_PER_TURN',
            d.maxContinuationsPerTurn,
        ),
        maxEventCostUsd: positiveNumber(env, 'AI_MAX_EVENT_COST_USD', d.maxEventCostUsd),
        // Legit users are blocked at their own daily cap; 1.25x still counts
        // a final expensive turn that overshoots it.
        fleetShareOfUserDayCap: 1.25,
        screenshotForce: {
            windowMs: d.screenshotForceWindowMs,
            max: d.screenshotForcePerWindow,
        },
    };
}

// ── Friendly messages (shared by routes + actions) ───────────────────────────

export const AI_PAUSED_MESSAGE = 'AI is paused right now. Please try again later.';
export const AI_BUDGET_MESSAGE =
    'AI is taking a short break because of unusually high demand. Please try again later.';
export const AI_RATE_LIMIT_MESSAGE = "You're sending AI requests very quickly.";
export const AI_USER_SPEND_MESSAGE = "You've hit the AI usage limit for now.";
export const AI_CONTINUATION_MESSAGE =
    'The AI has taken many steps in a row, so it paused. Send a message to keep going.';
export const AI_UNAVAILABLE_MESSAGE =
    "We couldn't start the AI request. Please try again in a moment.";

/** "Try again in 3 minutes." style suffix. */
export function retryHint(retryAfterSeconds: number): string {
    if (retryAfterSeconds <= 0) return 'Please try again shortly.';
    if (retryAfterSeconds < 60) {
        const s = Math.max(1, Math.ceil(retryAfterSeconds));
        return `Try again in ${s} second${s === 1 ? '' : 's'}.`;
    }
    if (retryAfterSeconds < 3600) {
        const m = Math.ceil(retryAfterSeconds / 60);
        return `Try again in ${m} minute${m === 1 ? '' : 's'}.`;
    }
    const h = Math.ceil(retryAfterSeconds / 3600);
    return `Try again in ${h} hour${h === 1 ? '' : 's'}.`;
}

/** Stable log tags so alerts can grep for them. */
export const AI_GUARD_LOG_TAGS = {
    budgetExceeded: '[AI_BUDGET_EXCEEDED]',
    budgetWarning: '[AI_BUDGET_WARNING]',
    killSwitch: '[AI_KILL_SWITCH]',
    userSpendCap: '[AI_USER_SPEND_CAP]',
    rateLimited: '[AI_RATE_LIMITED]',
    continuationCap: '[AI_CONTINUATION_CAP]',
} as const;
