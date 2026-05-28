import type { LanguageModel } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { convertToModelMessages, generateObject, generateText } from 'ai';
import { v } from 'convex/values';
import { z } from 'zod';

import { internal } from './_generated/api';
import { action } from './_generated/server';
import { vMessageRole } from './lib/enums';

// Convex port of the AI bits from chat/conversation.ts (generateTitle) and
// chat/suggestion.ts (generate). Actions live outside the deterministic
// query/mutation transaction model, so they can fetch and call external
// services, then write back via `ctx.runMutation`.

const TITLE_MAX_LENGTH = 50;
const TITLE_PROMPT_PREFIX =
    'Generate a concise and meaningful conversation title (2-4 words maximum) that reflects the main purpose or theme of the conversation based on the user creation prompt. Generate only the conversation title, nothing else. Keep it short and descriptive. User prompt:';

// Bounds on client-supplied LLM inputs. Without these, a member-tier caller
// could drive OpenRouter spend by passing megabytes of fake message context
// (every byte hits a billed token bucket). The conversation already gates
// on `project.use_ai`, so the caps protect the shared OpenRouter account,
// not unauthorized access.
const TITLE_CONTENT_MAX_BYTES = 4 * 1024;
const SUGGESTIONS_MAX_MESSAGES = 50;
const SUGGESTIONS_MESSAGE_MAX_BYTES = 4 * 1024;
const SUGGESTIONS_TOTAL_MAX_BYTES = 100 * 1024;

const SUGGESTION_SYSTEM_PROMPT =
    "You are an expert front-end product designer suggesting the next thing to build for a page. The user is iterating on a webpage with an AI coding assistant. Produce 3 high-leverage, concrete, realistic next steps the user should take. Each suggestion is a short title (max 60 chars) and a longer detailed prompt the user could paste into the AI to execute it. Don't repeat what the assistant has already produced. Don't suggest broad rewrites. Suggest the smallest, most impactful next move. Avoid vague advice ('improve the UI'); be specific ('add a sticky CTA above the fold with copy …').";

const ChatSuggestionsSchema = z.object({
    suggestions: z
        .array(
            z.object({
                title: z
                    .string()
                    .describe(
                        'The display title of the suggestion. Shown to the user; keep it concise.',
                    ),
                prompt: z
                    .string()
                    .describe(
                        'The detailed prompt used to generate the suggestion. Be specific and actionable.',
                    ),
            }),
        )
        .length(3),
});

const requireOpenRouter = () => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error(
            'OPENROUTER_API_KEY is not set on the Convex deployment. Run ' +
                '`bunx convex env set OPENROUTER_API_KEY <key>`.',
        );
    }
    return createOpenRouter({ apiKey });
};

export const generateTitle = action({
    args: {
        conversationId: v.id('conversations'),
        content: v.string(),
    },
    handler: async (ctx, { conversationId, content }): Promise<string | null> => {
        // Permission gate: load conversation, derive project, require AI cap.
        // Done via an internal mutation so we hit the same code path as
        // production reads (no public read endpoint required).
        const conversation = await ctx.runQuery(internal.conversations._getForAction, {
            conversationId,
        });
        if (!conversation) throw new Error('NOT_FOUND: conversation');

        if (content.length > TITLE_CONTENT_MAX_BYTES) {
            throw new Error(`BAD_REQUEST: content exceeds ${TITLE_CONTENT_MAX_BYTES} bytes`);
        }

        const openrouter = requireOpenRouter();
        const result = await generateText({
            // `@openrouter/ai-sdk-provider` returns a model built against an
            // older `@ai-sdk/provider`; `ai`'s `generateText` now expects the
            // newer `LanguageModelV2` type from `@ai-sdk/gateway`'s nested
            // provider. Both implement the same runtime contract — cast
            // through `unknown` to bridge the two type trees until the
            // upstream openrouter package bumps its provider peer.
            model: openrouter('anthropic/claude-3.5-haiku') as unknown as LanguageModel,
            prompt: `${TITLE_PROMPT_PREFIX} <prompt>${content}</prompt>`,
            maxOutputTokens: 50,
        });
        const generatedName = result.text.trim();
        if (generatedName.length === 0 || generatedName.length > TITLE_MAX_LENGTH) {
            console.error('Generated title outside size bounds', {
                length: generatedName.length,
            });
            return null;
        }
        await ctx.runMutation(internal.conversations._setDisplayName, {
            conversationId,
            displayName: generatedName,
        });
        return generatedName;
    },
});

export const generateSuggestions = action({
    args: {
        conversationId: v.id('conversations'),
        messages: v.array(
            v.object({
                role: vMessageRole,
                content: v.string(),
            }),
        ),
    },
    handler: async (
        ctx,
        { conversationId, messages },
    ): Promise<Array<{ title: string; prompt: string }>> => {
        // Gate on project membership. The conversation belongs to a project;
        // require it exists before generating suggestions AND before writing
        // them back. _getForAction is an internal helper that re-uses Convex's
        // ctx.db access from a mutation surface.
        const conversation = await ctx.runQuery(internal.conversations._getForAction, {
            conversationId,
        });
        if (!conversation) throw new Error('NOT_FOUND: conversation');

        if (messages.length > SUGGESTIONS_MAX_MESSAGES) {
            throw new Error(`BAD_REQUEST: too many messages (max ${SUGGESTIONS_MAX_MESSAGES})`);
        }
        let totalBytes = 0;
        for (const m of messages) {
            if (m.content.length > SUGGESTIONS_MESSAGE_MAX_BYTES) {
                throw new Error(
                    `BAD_REQUEST: message content exceeds ${SUGGESTIONS_MESSAGE_MAX_BYTES} bytes`,
                );
            }
            totalBytes += m.content.length;
            if (totalBytes > SUGGESTIONS_TOTAL_MAX_BYTES) {
                throw new Error(
                    `BAD_REQUEST: total content exceeds ${SUGGESTIONS_TOTAL_MAX_BYTES} bytes`,
                );
            }
        }

        const openrouter = requireOpenRouter();
        const { object } = await generateObject({
            // Same cross-provider type bridge as `generateTitle` above; see
            // that comment for rationale.
            model: openrouter('openai/gpt-5') as unknown as LanguageModel,
            schema: ChatSuggestionsSchema,
            messages: [
                { role: 'system', content: SUGGESTION_SYSTEM_PROMPT },
                ...convertToModelMessages(
                    messages.map((m) => ({
                        role: m.role,
                        parts: [{ type: 'text', text: m.content }],
                    })),
                ),
                {
                    role: 'user',
                    content:
                        'Based on our conversation, what should I work on next to improve this page? Provide 3 specific, actionable suggestions. These should be realistic and achievable. Return the suggestions as a JSON object. DO NOT include any other text.',
                },
            ],
            maxOutputTokens: 10000,
        });
        const suggestions = object.suggestions;
        try {
            await ctx.runMutation(internal.conversations._setSuggestions, {
                conversationId,
                suggestions,
            });
        } catch (error) {
            console.error('Error writing conversation suggestions:', error);
        }
        return suggestions;
    },
});
