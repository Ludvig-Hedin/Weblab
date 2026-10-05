// Pure helpers for the AI runaway / spike safeguards on the Next.js side.
// No server imports, so they unit-test without Clerk/Convex mocks. The
// Convex-backed enforcement lives in ./ai-guards.ts.

import { AI_PAUSED_MESSAGE, isTruthyFlag } from '@convex/lib/aiGuardConfig';

import type { AiGuardBlockReason } from '@convex/lib/aiGuards';

export { AI_PAUSED_MESSAGE };

/** 503 for fleet-level pauses (kill switch, budget); 429 for per-user limits. */
export function guardStatusFor(reason: AiGuardBlockReason): 503 | 429 | 403 {
    if (reason === 'disabled' || reason === 'budget') return 503;
    if (reason === 'pro_model_required') return 403;
    return 429;
}

export function isAiDisabledFlag(raw: string | undefined): boolean {
    return isTruthyFlag(raw);
}

/**
 * JSON error response in the shape the chat error UI already renders
 * (`{ error, code }` → shows `error`). `retryAfterSeconds` rides along for
 * clients that back off (tab complete).
 */
export function aiGuardErrorResponse(
    status: number,
    message: string,
    extra: { reason?: string; retryAfterSeconds?: number } = {},
): Response {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (extra.retryAfterSeconds && extra.retryAfterSeconds > 0) {
        headers['Retry-After'] = String(Math.ceil(extra.retryAfterSeconds));
    }
    return new Response(
        JSON.stringify({
            error: message,
            code: status,
            ...(extra.reason ? { reason: extra.reason } : {}),
            ...(extra.retryAfterSeconds ? { retryAfterSeconds: extra.retryAfterSeconds } : {}),
        }),
        { status, headers },
    );
}

interface TurnMessage {
    id?: string;
    role?: string;
}

/**
 * Identify the chat turn for the server-side auto-continuation cap.
 *
 * A fresh turn ends with the user's message. A continuation POST (sent by
 * the client after tool results land) ends with the assistant's tool-call
 * message. Both share the id of the last user message, so
 * `${conversationId}:${lastUserMessageId}` names the turn.
 */
export function buildTurnGuard(
    conversationId: string,
    messages: readonly TurnMessage[],
): { key: string; scope: string; isContinuation: boolean } {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const isContinuation = messages[messages.length - 1]?.role !== 'user';
    return {
        key: `${conversationId}:${lastUser?.id ?? 'none'}`.slice(0, 256),
        scope: conversationId.slice(0, 128),
        isContinuation,
    };
}

/**
 * The gate mutation isn't deployed yet (Next.js shipped before `convex
 * deploy`). Fail open for this one case only, loudly, so a deploy-order slip
 * doesn't take all AI down; every other gate error fails closed.
 */
export function isGateNotDeployedError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.includes('Could not find public function') && msg.includes('aiGuards');
}
