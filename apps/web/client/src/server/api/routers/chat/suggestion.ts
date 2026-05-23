import { TRPCError } from '@trpc/server';
import { convertToModelMessages, generateObject } from 'ai';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { ChatSuggestion } from '@weblab/models';
import { initModel, SUGGESTION_SYSTEM_PROMPT } from '@weblab/ai';
import { conversations } from '@weblab/db';
import { LLMProvider, OPENROUTER_MODELS } from '@weblab/models';
import { ChatSuggestionsSchema } from '@weblab/models/chat';

import { requireCap } from '../../permissions/requireCap';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

export const suggestionsRouter = createTRPCRouter({
    generate: protectedProcedure
        .input(
            z.object({
                conversationId: z.string(),
                messages: z.array(
                    z.object({
                        role: z.enum(['user', 'assistant', 'system']),
                        content: z.string(),
                    }),
                ),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            // Gate on project membership. The conversation belongs to a
            // project; require `project.use_ai` before generating suggestions
            // AND before writing them back. Without this, any authed user
            // could overwrite `conversations.suggestions` for any project ID
            // (RLS catches it today via auth.uid(); post-Convex it must be
            // enforced at the application layer).
            const conversation = await ctx.db.query.conversations.findFirst({
                where: eq(conversations.id, input.conversationId),
                columns: { id: true, projectId: true },
            });
            if (!conversation) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
            }
            await requireCap(ctx.db, ctx.user.id, 'project.use_ai', {
                projectId: conversation.projectId,
            });

            const { model, headers } = initModel({
                provider: LLMProvider.OPENROUTER,
                model: OPENROUTER_MODELS.OPEN_AI_GPT_5_5,
            });
            const { object } = await generateObject({
                model,
                headers,
                schema: ChatSuggestionsSchema,
                messages: [
                    {
                        role: 'system',
                        content: SUGGESTION_SYSTEM_PROMPT,
                    },
                    ...convertToModelMessages(
                        input.messages.map((m) => ({
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
            const suggestions = object.suggestions satisfies ChatSuggestion[];
            try {
                await ctx.db
                    .update(conversations)
                    .set({
                        suggestions,
                    })
                    .where(eq(conversations.id, input.conversationId));
            } catch (error) {
                console.error('Error updating conversation suggestions:', error);
            }
            return suggestions;
        }),
});
