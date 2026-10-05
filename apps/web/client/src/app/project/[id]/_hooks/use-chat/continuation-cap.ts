// Client-side cap on AI SDK auto-continuation (`sendAutomaticallyWhen`).
//
// Each time a client tool call finishes, the chat re-POSTs /api/chat to let
// the model continue. Without a cap a looping agent re-POSTs forever. The
// server enforces the same limit (Convex `AI_MAX_CONTINUATIONS_PER_TURN`,
// default 5) — keep these in sync. A user-initiated send resets the count.
export const MAX_AUTO_CONTINUATIONS_PER_TURN = 5;

// TODO(i18n): move to messages/* with the rest of the chat copy.
export const CONTINUATION_CAP_MESSAGE =
    'The AI paused after several steps in a row. Send a message to keep going.';

export interface ContinuationDecision {
    /** Whether to auto-continue now. */
    allow: boolean;
    /** Count to store after this decision. */
    nextCount: number;
}

export function decideAutoContinuation(
    count: number,
    max: number = MAX_AUTO_CONTINUATIONS_PER_TURN,
): ContinuationDecision {
    if (count >= max) {
        return { allow: false, nextCount: count };
    }
    return { allow: true, nextCount: count + 1 };
}
