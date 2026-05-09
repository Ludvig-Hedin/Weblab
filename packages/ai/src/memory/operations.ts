import type { ChatMessage } from '@weblab/models';

import type { MemorySearchResult } from './types';
import { getMemoryClient } from './client';

const INSTRUCTION_RE = /<instruction>([\s\S]*?)<\/instruction>/;

/**
 * Extracts the clean user instruction from a hydrated message text part.
 * Hydrated user messages wrap the actual intent in <instruction>…</instruction>
 * alongside large XML context blobs (file contents, highlights, errors, etc.).
 * This strips the noise and returns only the human-readable request.
 * Falls back to the raw text when no <instruction> tag is present.
 */
export function extractInstructionText(rawText: string): string {
    return INSTRUCTION_RE.exec(rawText)?.[1]?.trim() || rawText.trim();
}

/**
 * Search Mem0 for memories relevant to the given query.
 * Scoped to the user only (not to a specific project) so preferences learned
 * in any project — e.g. "I prefer minimal UI" — surface everywhere.
 * Memories are still stored with run_id=projectId for provenance, but recall
 * is intentionally user-wide so the AI feels cross-project smart.
 * Returns [] on any error so the chat pipeline is never blocked.
 */
export async function searchMemories(query: string, userId: string): Promise<MemorySearchResult[]> {
    try {
        const client = await getMemoryClient();
        // Use top-level user_id (same as add) — not nested in filters —
        // so Mem0 returns all memories for this user regardless of project.
        const results = await client.search(query, { user_id: userId, limit: 10 });
        return (results as MemorySearchResult[]) ?? [];
    } catch (err) {
        console.warn('[mem0] searchMemories failed:', err);
        return [];
    }
}

/**
 * Store memories from a single exchange (last user + last assistant message).
 * Mem0's intended usage is per-exchange, not per full history — it handles
 * deduplication internally. Sending the entire conversation history on every
 * turn duplicates all prior turns and grows O(n²) with conversation length.
 * Safe for fire-and-forget: never throws.
 */
export async function addMemoriesFromConversation(
    messages: ChatMessage[],
    userId: string,
    projectId: string,
): Promise<void> {
    try {
        const client = await getMemoryClient();
        // `messages` (from onFinish) always ends with the just-completed exchange:
        // [...history, currentUserMessage, freshAssistantResponse].
        // Slice the last 2 so Mem0 only sees the new exchange — not the entire
        // conversation history that it has already processed in prior turns.
        const lastExchange = messages.slice(-2);
        const cleanMessages = extractMemoryMessages(lastExchange);
        if (cleanMessages.length === 0) return;
        // Store with run_id so Mem0 records provenance, but search is user-wide.
        await client.add(cleanMessages, { user_id: userId, run_id: projectId });
    } catch (err) {
        console.warn('[mem0] addMemoriesFromConversation failed:', err);
    }
}

/**
 * Extracts plain {role, content} pairs from ChatMessage[] suitable for Mem0.
 * Exported for unit testing.
 *
 * User messages: extracts only the text inside <instruction>…</instruction> tags
 *   (the clean user intent, without the injected file/context XML). Falls back
 *   to joining all text parts if no <instruction> tag is found.
 *
 * Assistant messages: joins only `type === 'text'` parts; skips tool-call,
 *   tool-result, and other non-prose parts.
 */
export function extractMemoryMessages(
    messages: ChatMessage[],
): { role: 'user' | 'assistant'; content: string }[] {
    const result: { role: 'user' | 'assistant'; content: string }[] = [];

    for (const msg of messages) {
        if (msg.role !== 'user' && msg.role !== 'assistant') continue;

        const parts = (msg.parts ?? []) as Array<{ type: string; text?: string }>;

        if (msg.role === 'user') {
            const rawText = parts
                .filter((p) => p.type === 'text')
                .map((p) => p.text ?? '')
                .join('\n');

            const content = extractInstructionText(rawText);
            if (content) result.push({ role: 'user', content });
        } else {
            // Assistant: text parts only, skip tool-call / tool-result noise
            const content = parts
                .filter((p) => p.type === 'text')
                .map((p) => p.text ?? '')
                .join('\n')
                .trim();
            if (content) result.push({ role: 'assistant', content });
        }
    }

    return result;
}
