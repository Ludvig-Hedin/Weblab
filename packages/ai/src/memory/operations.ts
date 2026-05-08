import type { ChatMessage } from '@weblab/models';

import type { MemorySearchResult } from './types';
import { getMemoryClient } from './client';

/**
 * Search Mem0 for memories relevant to the given query.
 * Scoped by both user_id (cross-project preferences) and run_id (project-specific context).
 * Returns [] on any error so the chat pipeline is never blocked.
 */
export async function searchMemories(
    query: string,
    userId: string,
    projectId: string,
): Promise<MemorySearchResult[]> {
    try {
        const client = getMemoryClient();
        const results = await client.search(query, {
            filters: { user_id: userId, run_id: projectId },
            limit: 10,
        });
        // mem0ai returns { results: MemorySearchResult[] }
        const items = Array.isArray(results)
            ? results
            : ((results as { results: MemorySearchResult[] }).results ?? []);
        return items as MemorySearchResult[];
    } catch (err) {
        console.warn('[mem0] searchMemories failed:', err);
        return [];
    }
}

/**
 * Store memories from a completed conversation.
 * Safe for fire-and-forget: never throws.
 * Strips XML context blobs and tool parts before sending to Mem0 so only
 * clean, human-readable exchanges are stored.
 */
export async function addMemoriesFromConversation(
    messages: ChatMessage[],
    userId: string,
    projectId: string,
): Promise<void> {
    try {
        const client = getMemoryClient();
        const cleanMessages = extractMemoryMessages(messages);
        if (cleanMessages.length === 0) return;
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

            // Extract only the user's actual instruction, stripping injected XML context
            const instructionMatch = /<instruction>([\s\S]*?)<\/instruction>/.exec(rawText);
            const content = instructionMatch?.[1]?.trim() || rawText.trim();
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
