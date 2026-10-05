// Rough price table for AI / paid-API calls made from Convex actions, so their
// cost counts toward the per-user spend caps and the fleet daily budget
// (aiGuards.recordAiSpend). Convex can't import @weblab/ai's MODEL_PRICING in
// the default runtime, so the handful of models used here are mirrored.
// USD per 1M tokens. Keep conservative (round up) — this is a safety cap, not
// billing.

const MODEL_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
    'anthropic/claude-3.5-haiku': { input: 0.8, output: 4 },
    'openai/gpt-5': { input: 1.25, output: 10 },
};

/** Fallback for an unlisted model: priced like a premium model. */
const UNKNOWN_MODEL_USD_PER_MTOK = { input: 5, output: 25 };

/** Fixed per-call estimates where the API reports no token usage. */
export const FIXED_CALL_COST_USD = {
    applyDiff: 0.01,
    firecrawlScrape: 0.005,
    exaSearch: 0.01,
    image: 0.1,
} as const;

export function estimateModelCostUsd(
    model: string,
    usage: { inputTokens?: number; outputTokens?: number } | undefined,
    fallbackUsd = 0.01,
): number {
    const input = usage?.inputTokens ?? 0;
    const output = usage?.outputTokens ?? 0;
    if (!(input > 0) && !(output > 0)) return fallbackUsd;
    const price = MODEL_USD_PER_MTOK[model] ?? UNKNOWN_MODEL_USD_PER_MTOK;
    return (input * price.input + output * price.output) / 1_000_000;
}
