import { TRPCError } from '@trpc/server';
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import type { DrizzleDb } from '@weblab/db';
import {
    conversations,
    fromDbMessage,
    messageInsertSchema,
    messages,
    messageUpdateSchema,
} from '@weblab/db';
import { MessageCheckpointType } from '@weblab/models';

import { requireCap } from '@/server/api/permissions/requireCap';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

type DbOrTx = Pick<DrizzleDb, 'query'>;

const projectIdForConversation = async (db: DbOrTx, conversationId: string): Promise<string> => {
    const row = await db.query.conversations.findFirst({
        where: eq(conversations.id, conversationId),
        columns: { projectId: true },
    });
    if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
    }
    return row.projectId;
};

const projectIdForMessage = async (db: DbOrTx, messageId: string): Promise<string> => {
    const row = await db.query.messages.findFirst({
        where: eq(messages.id, messageId),
        columns: { conversationId: true },
    });
    if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Message not found' });
    }
    return projectIdForConversation(db, row.conversationId);
};

export const messageRouter = createTRPCRouter({
    getAll: protectedProcedure
        .input(
            z.object({
                conversationId: z.string(),
            }),
        )
        .query(async ({ ctx, input }) => {
            const projectId = await projectIdForConversation(ctx.db, input.conversationId);
            await requireCap(ctx.db, ctx.user.id, 'project.view', { projectId: projectId });
            const result = await ctx.db.query.messages.findMany({
                where: eq(messages.conversationId, input.conversationId),
                orderBy: [asc(messages.createdAt)],
            });
            return result.map((message) => fromDbMessage(message));
        }),
    upsert: protectedProcedure
        .input(
            z.object({
                message: messageInsertSchema,
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const conversationId = input.message.conversationId;
            if (!conversationId) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Missing conversationId',
                });
            }
            const projectId = await projectIdForConversation(ctx.db, conversationId);
            await requireCap(ctx.db, ctx.user.id, 'project.use_ai', { projectId: projectId });
            const normalizedMessage = normalizeMessage(input.message);
            return await ctx.db
                .insert(messages)
                .values(normalizedMessage)
                .onConflictDoUpdate({
                    target: [messages.id],
                    set: {
                        ...normalizedMessage,
                    },
                });
        }),
    upsertMany: protectedProcedure
        .input(
            z.object({
                messages: messageInsertSchema.array(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const conversationIds = Array.from(
                new Set(
                    input.messages.map((m) => m.conversationId).filter((id): id is string => !!id),
                ),
            );
            if (conversationIds.length === 0) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Missing conversationId on messages',
                });
            }
            // Verify access for every distinct conversation referenced.
            const projectIds = await Promise.all(
                conversationIds.map((id) => projectIdForConversation(ctx.db, id)),
            );
            await Promise.all(
                Array.from(new Set(projectIds)).map((projectId) =>
                    requireCap(ctx.db, ctx.user.id, 'project.use_ai', { projectId }),
                ),
            );
            const normalizedMessages = input.messages.map(normalizeMessage);
            await ctx.db.insert(messages).values(normalizedMessages).onConflictDoNothing();
        }),
    update: protectedProcedure
        .input(
            z.object({
                messageId: z.string(),
                message: messageUpdateSchema,
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const projectId = await projectIdForMessage(ctx.db, input.messageId);
            await requireCap(ctx.db, ctx.user.id, 'project.use_ai', { projectId: projectId });
            await ctx.db
                .update(messages)
                .set({
                    ...input.message,
                })
                .where(eq(messages.id, input.messageId));
        }),
    updateCheckpoints: protectedProcedure
        .input(
            z.object({
                messageId: z.string(),
                checkpoints: z.array(
                    z.object({
                        type: z.enum(MessageCheckpointType),
                        oid: z.string(),
                        branchId: z.string(),
                        createdAt: z.date(),
                    }),
                ),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const projectId = await projectIdForMessage(ctx.db, input.messageId);
            await requireCap(ctx.db, ctx.user.id, 'project.use_ai', { projectId: projectId });
            await ctx.db
                .update(messages)
                .set({
                    checkpoints: input.checkpoints,
                })
                .where(eq(messages.id, input.messageId));
        }),
    delete: protectedProcedure
        .input(
            z.object({
                messageIds: z.array(z.string()).min(1),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            // Resolve every targeted message to its project and verify access
            // for each distinct project the caller is touching.
            const rows = await ctx.db.query.messages.findMany({
                where: inArray(messages.id, input.messageIds),
                columns: { id: true, conversationId: true },
            });
            if (rows.length !== input.messageIds.length) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'One or more messages not found',
                });
            }
            const conversationIds = Array.from(new Set(rows.map((r) => r.conversationId)));
            const projectIds = await Promise.all(
                conversationIds.map((id) => projectIdForConversation(ctx.db, id)),
            );
            await Promise.all(
                Array.from(new Set(projectIds)).map((projectId) =>
                    requireCap(ctx.db, ctx.user.id, 'project.use_ai', { projectId }),
                ),
            );
            await ctx.db.delete(messages).where(inArray(messages.id, input.messageIds));
        }),

    // TODO: We're just doing a full replacement here which is inefficient.
    // To improve this, there's basically two use-cases we need to support:
    // 1) Add new messages (doesn't need to delete + reinsert messages)
    // 2) Edit a previous message (requires deleting all messages following the edited message and inserting new ones)
    // Tool calls are supported in both cases by the fact that they result in new messages being added.
    replaceConversationMessages: protectedProcedure
        .input(
            z.object({
                conversationId: z.string(),
                messages: messageInsertSchema.array(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const projectId = await projectIdForConversation(ctx.db, input.conversationId);
            await requireCap(ctx.db, ctx.user.id, 'project.use_ai', { projectId: projectId });
            await ctx.db.transaction(async (tx) => {
                await tx.delete(messages).where(eq(messages.conversationId, input.conversationId));

                if (input.messages.length > 0) {
                    const normalizedMessages = input.messages.map(normalizeMessage);
                    await tx.insert(messages).values(normalizedMessages);
                }

                await tx
                    .update(conversations)
                    .set({
                        updatedAt: new Date(),
                    })
                    .where(eq(conversations.id, input.conversationId));
            });
        }),
});

const normalizeMessage = (message: z.infer<typeof messageInsertSchema>) => {
    return {
        ...message,
        createdAt:
            typeof message.createdAt === 'string' ? new Date(message.createdAt) : message.createdAt,
    };
};
