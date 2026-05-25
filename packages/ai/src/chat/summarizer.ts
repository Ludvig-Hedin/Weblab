/**
 * Server-only portion of the summarizer. Calls Claude Haiku via the AI SDK
 * to compress older chat history into a short summary. Re-exports the
 * client-safe utilities for convenient single-import usage on the server.
 *
 * Not safe for client bundles — depends on `initModel` (provider env
 * lookups) and `generateText` from the AI SDK.
 */
import { generateText } from 'ai';

import type { ChatMessage } from '@weblab/models';
import { DEFAULT_REPAIR_MODEL, LLMProvider } from '@weblab/models';

import { initModel } from './providers';
import { KEEP_RECENT_TURNS } from './summarizer-utils';

export * from './summarizer-utils';

const SUMMARY_PROMPT = [
    'You are summarizing an earlier portion of an AI coding assistant conversation so the next turn can keep context without burning tokens.',
    '',
    'Write a concise summary that preserves:',
    '- The user’s goals and the project state established so far',
    '- Decisions made (what we picked, what we rejected, and why)',
    '- Files and components that were created, renamed, or significantly edited',
    '- Outstanding TODOs, blockers, and open questions',
    '- Any constraints the user has stated (style, libraries, anti-patterns to avoid)',
    '',
    'Discard:',
    '- Tool-call boilerplate, intermediate file contents, full diffs',
    '- Chit-chat and small acknowledgements',
    '',
    'Format: a bulleted brief under 600 words. Start with the active goal. End with the most recent open question (if any).',
].join('\n');

export interface SummarizeConversationInput {
    messages: ChatMessage[];
    /** Optional override for which fast model to use. Defaults to repair model. */
    summarizerModel?: string;
    abortSignal?: AbortSignal;
}

export interface SummarizeConversationResult {
    summaryText: string;
    summarizedUpToMessageId: string;
    summarizedMessageCount: number;
}

export async function summarizeConversation(
    input: SummarizeConversationInput,
): Promise<SummarizeConversationResult | null> {
    const summarizable = input.messages.slice(0, -KEEP_RECENT_TURNS);
    if (summarizable.length === 0) return null;
    const lastId = summarizable[summarizable.length - 1]?.id;
    if (!lastId) return null;

    const flatTranscript = summarizable
        .map((m) => {
            const text = m.parts
                .map((p) => {
                    if (p.type === 'text') return p.text;
                    if (p.type.startsWith('tool-')) {
                        const toolName = p.type.replace(/^tool-/, '');
                        return `[tool:${toolName}]`;
                    }
                    return '';
                })
                .join('')
                .trim();
            return `${m.role.toUpperCase()}: ${text}`;
        })
        .filter((line) => line.length > 5)
        .join('\n\n');

    if (!flatTranscript) return null;

    const summarizerModel = (input.summarizerModel as never) ?? DEFAULT_REPAIR_MODEL;
    const { model, providerOptions, maxOutputTokens } = initModel({
        provider: LLMProvider.OPENROUTER,
        model: summarizerModel,
    });

    const { text } = await generateText({
        model,
        providerOptions,
        maxOutputTokens: Math.min(1500, maxOutputTokens),
        abortSignal: input.abortSignal,
        system: SUMMARY_PROMPT,
        prompt: flatTranscript,
    });

    return {
        summaryText: text.trim(),
        summarizedUpToMessageId: lastId,
        summarizedMessageCount: summarizable.length,
    };
}
