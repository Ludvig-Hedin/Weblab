// Cash guards for AI image generation. Tuned to the "Balanced" tier:
// images draw from the same credit pool as text (credit multiplier) AND are
// bounded by a hard per-user daily cap + a per-minute burst limit, so a runaway
// agent loop or abusive user cannot drain spend.
//
// All values are intentionally in ONE place so they can be tuned without
// touching logic. Mirror any change in docs/feature-catalog.md.

/** Credits deducted per generated image (vs. 1 for a text message). */
export const IMAGE_CREDIT_COST = 5;

/** Hard ceiling on images per UTC day — independent of remaining credits. */
export const IMAGE_DAILY_CAP_FREE = 2;
export const IMAGE_DAILY_CAP_PRO = 50;

/** Burst limiter: max images per rolling window, per user. */
export const IMAGE_BURST_PER_MIN = 3;
export const IMAGE_BURST_WINDOW_MS = 60_000;
