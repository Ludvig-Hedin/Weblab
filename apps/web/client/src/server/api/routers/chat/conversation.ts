import { TRPCError } from '@trpc/server';
import { generateText } from 'ai';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import { initModel } from '@weblab/ai';
import {
    conversationInsertSchema,
    conversations,
    conversationUpdateSchema,
    fromDbConversation,
} from '@weblab/db';
import { LLMProvider, OPENROUTER_MODELS } from '@weblab/models';

import { requireCap } from '@/server/api/permissions/requireCap';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

const loadConversationProjectId = async (
    db: Parameters<typeof requireCap>[0],
    conversationId: string,
): Promise<string> => {
    const row = await db.query.conversations.findFirst({
        where: eq(conversations.id, conversationId),
        columns: { projectId: true },
    });
    if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
    }
    return row.projectId;
};

export const conversationRouter = createTRPCRouter({
    getAll: protectedProcedure
        .input(z.object({ projectId: z.string() }))
        .query(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.view', { projectId: input.projectId });
            // Defensive cap. Chat history is loaded eagerly on editor boot;
            // an unbounded list would balloon TTFR for long-running projects.
            // Add pagination/"load older" if a real user hits this ceiling.
            const dbConversations = await ctx.db.query.conversations.findMany({
                where: eq(conversations.projectId, input.projectId),
                orderBy: (conversations, { desc }) => [desc(conversations.updatedAt)],
                limit: 200,
            });
            return dbConversations.map((conversation) => fromDbConversation(conversation));
        }),
    get: protectedProcedure
        .input(z.object({ conversationId: z.string() }))
        .query(async ({ ctx, input }) => {
            const conversation = await ctx.db.query.conversations.findFirst({
                where: eq(conversations.id, input.conversationId),
            });
            if (!conversation) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
            }
            await requireCap(ctx.db, ctx.user.id, 'project.view', {
                projectId: conversation.projectId,
            });
            return fromDbConversation(conversation);
        }),
    upsert: protectedProcedure.input(conversationInsertSchema).mutation(async ({ ctx, input }) => {
        await requireCap(ctx.db, ctx.user.id, 'project.use_ai', { projectId: input.projectId });
        const [conversation] = await ctx.db.insert(conversations).values(input).returning();
        if (!conversation) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Conversation not created',
            });
        }
        return fromDbConversation(conversation);
    }),
    update: protectedProcedure.input(conversationUpdateSchema).mutation(async ({ ctx, input }) => {
        if (!input.id) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Missing conversation id' });
        }
        const projectId = await loadConversationProjectId(ctx.db, input.id);
        await requireCap(ctx.db, ctx.user.id, 'project.use_ai', { projectId: projectId });
        const [conversation] = await ctx.db
            .update(conversations)
            .set({ ...input, updatedAt: new Date() })
            .where(eq(conversations.id, input.id))
            .returning();
        if (!conversation) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Conversation not updated',
            });
        }
        return fromDbConversation(conversation);
    }),
    delete: protectedProcedure
        .input(
            z.object({
                conversationId: z.string(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const projectId = await loadConversationProjectId(ctx.db, input.conversationId);
            await requireCap(ctx.db, ctx.user.id, 'project.use_ai', { projectId: projectId });
            await ctx.db.delete(conversations).where(eq(conversations.id, input.conversationId));
        }),
    generateTitle: protectedProcedure
        .input(
            z.object({
                conversationId: z.string(),
                content: z.string(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const projectId = await loadConversationProjectId(ctx.db, input.conversationId);
            await requireCap(ctx.db, ctx.user.id, 'project.use_ai', { projectId: projectId });
            const { model, providerOptions, headers } = initModel({
                provider: LLMProvider.OPENROUTER,
                model: OPENROUTER_MODELS.CLAUDE_3_5_HAIKU,
            });

            const MAX_NAME_LENGTH = 50;
            const result = await generateText({
                model,
                headers,
                prompt: `Generate a concise and meaningful conversation title (2-4 words maximum) that reflects the main purpose or theme of the conversation based on user's creation prompt. Generate only the conversation title, nothing else. Keep it short and descriptive. User's creation prompt: <prompt>${input.content}</prompt>`,
                providerOptions,
                maxOutputTokens: 50,
                experimental_telemetry: {
                    isEnabled: true,
                    metadata: {
                        conversationId: input.conversationId,
                        userId: ctx.user.id,
                        tags: ['conversation-title-generation'],
                        sessionId: input.conversationId,
                        langfuseTraceId: uuidv4(),
                    },
                },
            });

            const generatedName = result.text.trim();
            if (
                generatedName &&
                generatedName.length > 0 &&
                generatedName.length <= MAX_NAME_LENGTH
            ) {
                await ctx.db
                    .update(conversations)
                    .set({
                        displayName: generatedName,
                    })
                    .where(eq(conversations.id, input.conversationId));
                return generatedName;
            }

            console.error('Error generating conversation title', result);
            return null;
        }),
});
