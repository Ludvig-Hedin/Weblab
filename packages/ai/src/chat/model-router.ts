/**
 * Auto-routing for the chat model picker.
 *
 * Goal: when the user picks "Auto", we resolve a concrete model based on
 * - chat type (UI work vs backend vs question vs planning)
 * - user tier (free vs free-heavy vs pro vs pro-heavy)
 * - estimated input size (small vs medium vs large)
 *
 * Decision is a sync lookup against MODEL_ROUTER_CONFIG. No DB calls,
 * no awaits, no network. Goal is sub-1ms.
 *
 * Edit MODEL_ROUTER_CONFIG to change behaviour — every routing decision
 * goes through this single table.
 */
import type { ChatType, OPENROUTER_MODELS as Models } from '@weblab/models';
import { ChatType as ChatTypeEnum, OPENROUTER_MODELS } from '@weblab/models';

/**
 * User tier classifications. `free-heavy` is a free user who's burned a lot
 * of free messages this period — we degrade them to cheaper models. `pro-heavy`
 * is a paying user who's also burning credits unusually fast (e.g. concurrent
 * sessions); we still serve them well but cap on Opus/GPT-5.5.
 */
export type UserTier = 'free' | 'free-heavy' | 'pro' | 'pro-heavy';

/**
 * Request size buckets. Caller supplies an estimated input-token count.
 * - small  <  20k tokens
 * - medium 20k – 100k
 * - large  > 100k
 */
export type SizeBucket = 'small' | 'medium' | 'large';

/**
 * Special sentinel for the user-facing "Auto" choice. Not part of
 * OPENROUTER_MODELS — the API route detects this and calls resolveAutoModel.
 */
export const AUTO_MODEL_ID = 'auto' as const;
export type AutoModelId = typeof AUTO_MODEL_ID;

export function classifySize(estimatedInputTokens: number): SizeBucket {
    if (estimatedInputTokens < 20_000) return 'small';
    if (estimatedInputTokens < 100_000) return 'medium';
    return 'large';
}

/**
 * Default model per chat type — used when no tier override applies.
 *
 * Rationale:
 * - CREATE / PLAN: UI / design generation favours Gemini 3.1 Pro (strong
 *   visual/UI taste, fast, cheap on cache miss).
 * - EDIT / FIX: code editing favours GPT-5.4-mini for backend changes;
 *   user picks better model manually when needed.
 * - ASK: read-only Q&A → Kimi K2.6 (cheap, fast, strong reasoning).
 */
const DEFAULTS: Record<ChatType, Models> = {
    [ChatTypeEnum.CREATE]: OPENROUTER_MODELS.GEMINI_3_1_PRO_PREVIEW,
    [ChatTypeEnum.PLAN]: OPENROUTER_MODELS.GEMINI_3_1_PRO_PREVIEW,
    [ChatTypeEnum.EDIT]: OPENROUTER_MODELS.OPEN_AI_GPT_5_4_MINI,
    [ChatTypeEnum.FIX]: OPENROUTER_MODELS.OPEN_AI_GPT_5_4_MINI,
    [ChatTypeEnum.ASK]: OPENROUTER_MODELS.KIMI_K2_6,
};

/**
 * Premium-only models. On auto we route TO these only when:
 *   - user is `pro` (NOT `pro-heavy`)
 *   - request is `small` (we don't pay $$$ for a 100k-token Opus call)
 *   - chat type is EDIT or FIX (most expensive cognitive load)
 *
 * Everything else routes around them to keep cost predictable.
 */
const PREMIUM_MODELS = new Set<Models>([
    OPENROUTER_MODELS.CLAUDE_OPUS_4_8,
    OPENROUTER_MODELS.CLAUDE_OPUS_4_7,
    OPENROUTER_MODELS.OPEN_AI_GPT_5_5,
]);

/**
 * Single source of truth. Each function returns a model id given the inputs.
 * Functions, not nested maps, so we can express e.g. "pro + small + EDIT
 * gets Sonnet 4.6, everything else stays on default" cleanly.
 */
export const MODEL_ROUTER_CONFIG = {
    /**
     * Default lookup — used when no tier override applies.
     */
    defaultFor(chatType: ChatType): Models {
        return DEFAULTS[chatType] ?? OPENROUTER_MODELS.KIMI_K2_6;
    },

    /**
     * Free-heavy users get capped at the cheapest fast model regardless of
     * chat type. We still want them productive but not running up cost.
     */
    freeHeavyOverride(): Models {
        return OPENROUTER_MODELS.DEEPSEEK_V4_FLASH;
    },

    /**
     * Free users (not yet heavy) get a slightly better model than free-heavy
     * but still cheap. Kimi K2.6 has the best perf-per-dollar for most chat.
     */
    freeOverride(chatType: ChatType): Models {
        // UI work for free users still goes to Gemini Flash-class — Kimi
        // is competent for UI but Gemini has the edge on visual taste.
        if (chatType === ChatTypeEnum.CREATE || chatType === ChatTypeEnum.PLAN) {
            return OPENROUTER_MODELS.GEMINI_3_1_PRO_PREVIEW;
        }
        return OPENROUTER_MODELS.KIMI_K2_6;
    },

    /**
     * Pro users: small EDIT/FIX requests get Sonnet 4.6 (strong code,
     * cached-input is cheap). UI still goes to Gemini for taste. Big
     * requests stay on default to avoid Opus/GPT-5.5 surprise bills.
     */
    proOverride(chatType: ChatType, size: SizeBucket): Models {
        if (size === 'small' && (chatType === ChatTypeEnum.EDIT || chatType === ChatTypeEnum.FIX)) {
            return OPENROUTER_MODELS.CLAUDE_SONNET_4_6;
        }
        if (chatType === ChatTypeEnum.CREATE || chatType === ChatTypeEnum.PLAN) {
            return OPENROUTER_MODELS.GEMINI_3_1_PRO_PREVIEW;
        }
        // EDIT / FIX / ASK with non-small payload → Kimi K2.6 (1M context,
        // cheap, strong reasoning). Avoids paying Sonnet input rates on huge
        // file contexts when the marginal quality gain is small.
        return OPENROUTER_MODELS.KIMI_K2_6;
    },

    /**
     * Pro-heavy: pro user spending unusually fast. Same as `pro` but never
     * touches PREMIUM_MODELS even on small EDIT/FIX.
     */
    proHeavyOverride(chatType: ChatType): Models {
        if (chatType === ChatTypeEnum.CREATE || chatType === ChatTypeEnum.PLAN) {
            return OPENROUTER_MODELS.GEMINI_3_1_PRO_PREVIEW;
        }
        return OPENROUTER_MODELS.KIMI_K2_6;
    },
} as const;

export interface ResolveAutoModelInput {
    chatType: ChatType;
    tier: UserTier;
    estimatedInputTokens: number;
}

/**
 * Main entry point. Sync, pure, sub-1ms.
 *
 * Returns a concrete OPENROUTER_MODELS id. Never returns 'auto'. Never
 * returns Opus/GPT-5.5 unless the inputs are explicitly (pro, small,
 * EDIT/FIX) — and even then, only when MODEL_ROUTER_CONFIG.proOverride
 * decides to upgrade.
 */
export function resolveAutoModel(input: ResolveAutoModelInput): Models {
    const size = classifySize(input.estimatedInputTokens);
    let resolved: Models;
    switch (input.tier) {
        case 'free-heavy':
            resolved = MODEL_ROUTER_CONFIG.freeHeavyOverride();
            break;
        case 'free':
            resolved = MODEL_ROUTER_CONFIG.freeOverride(input.chatType);
            break;
        case 'pro':
            resolved = MODEL_ROUTER_CONFIG.proOverride(input.chatType, size);
            break;
        case 'pro-heavy':
            resolved = MODEL_ROUTER_CONFIG.proHeavyOverride(input.chatType);
            break;
        default:
            resolved = MODEL_ROUTER_CONFIG.defaultFor(input.chatType);
    }
    // Final safety net: if a config function ever returns a premium model
    // for a non-(pro,small) combination, downgrade. Defence in depth — keeps
    // the "no Opus surprise bills" invariant even if config edits go wrong.
    if (PREMIUM_MODELS.has(resolved) && !(input.tier === 'pro' && size === 'small')) {
        return MODEL_ROUTER_CONFIG.defaultFor(input.chatType);
    }
    return resolved;
}

/**
 * Test helper — true when the resolved model is one of the premium ones.
 * Useful for telemetry: count how often Auto escalates to premium.
 */
export function isPremiumModel(model: Models): boolean {
    return PREMIUM_MODELS.has(model);
}
