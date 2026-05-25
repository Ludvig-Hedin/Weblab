'use client';

import { useEffect, useRef } from 'react';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';

import type { ChatMessage, ChatModel } from '@weblab/models';
import { shouldSummarize, SUMMARIZE_THRESHOLD_RATIO } from '@weblab/ai/client';
import { getMaxTokens } from '@weblab/models';

import type { Id } from '@convex/_generated/dataModel';

/**
 * Background summary trigger.
 *
 * Watches the conversation length and current model; when the estimated
 * input tokens exceed 50% of the model's context window AND no fresh
 * summary already covers the older half, POSTs /api/chat/summarize.
 *
 * Designed to run during "natural" idle moments:
 * - while the AI is streaming the current turn (the next turn benefits)
 * - while the user is typing (we won't beat them, but we'll be ready)
 *
 * Side-effect only; no return. Failures are logged and silently retried
 * next time the threshold check passes (de-duped via the in-flight ref).
 */
interface UseConversationSummarizerArgs {
    conversationId: string;
    messages: ChatMessage[];
    /** The model that WILL run the next turn — used for context-window math. */
    model: ChatModel;
}

export function useConversationSummarizer({
    conversationId,
    messages,
    model,
}: UseConversationSummarizerArgs) {
    // Read the latest stored summary so we don't keep summarizing the same
    // stretch repeatedly. Convex's live query handles invalidation.
    const summary = useQuery(api.conversations.getSummary, {
        conversationId: conversationId as Id<'conversations'>,
    });

    // Scope the in-flight flag by conversationId so switching conversations
    // mid-summarize doesn't strand the new conversation. With a single
    // boolean, the old summarize's `finally` runs AFTER the new conversation's
    // effect has already bailed (it saw `true`); since the new effect doesn't
    // re-fire on its own, summarization never runs for the new conversation
    // until the user sends another message.
    const inFlightRef = useRef<string | null>(null);
    const lastTriggeredCountRef = useRef<number>(0);
    // Hold the live messages array in a ref so the effect's deps can key on
    // length (stable across streaming deltas) without losing access to the
    // latest message bodies for the network POST.
    const messagesRef = useRef(messages);
    messagesRef.current = messages;

    const messageCount = messages.length;

    useEffect(() => {
        // Only block if THIS conversation already has an in-flight summarize.
        // Other conversations' in-flights are unrelated to us.
        if (inFlightRef.current === conversationId) return;
        // Skip if we already fired for this exact message count and haven't
        // received a successful response yet — guards against effect storms.
        if (lastTriggeredCountRef.current === messageCount) return;

        let cancelled = false;
        void (async () => {
            try {
                const snapshot = messagesRef.current;
                const verdict = await shouldSummarize({
                    messages: snapshot,
                    targetModel: model as string,
                    existingSummaryUpToMessageId: summary?.upToMessageId,
                });
                if (!verdict.shouldSummarize) return;
                if (cancelled) return;
                inFlightRef.current = conversationId;
                lastTriggeredCountRef.current = messageCount;
                const res = await fetch('/api/chat/summarize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ conversationId, messages: snapshot }),
                });
                if (!res.ok) {
                    // Reset trigger count so the next message change retries.
                    lastTriggeredCountRef.current = 0;
                    console.warn('[summarizer] non-OK response:', res.status);
                }
            } catch (err) {
                lastTriggeredCountRef.current = 0;
                console.warn('[summarizer] failed:', err);
            } finally {
                // Only clear if we're still the in-flight owner. A newer
                // conversation's effect may have overwritten this while we
                // were awaiting; don't blow away its claim.
                if (inFlightRef.current === conversationId) {
                    inFlightRef.current = null;
                }
            }
        })();

        return () => {
            cancelled = true;
            // Also reset the trigger count on unmount/dep-change so the next
            // mount of THIS conversation can retry without waiting for
            // messageCount to bump.
            lastTriggeredCountRef.current = 0;
        };
        // Intentionally key on `messageCount`, NOT `messages`. The full array
        // changes reference on every streaming token; we only care when the
        // count changes (i.e. a turn settled). This avoids re-running the
        // tokenizer on every delta.
    }, [conversationId, messageCount, model, summary?.upToMessageId]);

    // Exposed only as a debug snapshot — useful in dev for "is summary fresh?"
    return {
        summary,
        threshold: SUMMARIZE_THRESHOLD_RATIO * getMaxTokens(model as never),
    };
}
