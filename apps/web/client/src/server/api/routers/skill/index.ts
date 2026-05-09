import { TRPCError } from '@trpc/server';
import { and, eq, isNull, or } from 'drizzle-orm';
import { z } from 'zod';

import { invalidateSkillsCache } from '@weblab/ai/server';
import { fromDbSkill, skills } from '@weblab/db';

import { createTRPCRouter, protectedProcedure } from '../../trpc';
import { verifyProjectAccess } from '../project/helper';
import {
    skillContentSchema,
    skillDescriptionSchema,
    skillNameSchema,
    verifySkillAccess,
} from './helper';
import { importSkillFromUrl, parseSkillSource } from './import';

const scopeFilterSchema = z
    .object({
        projectId: z.string().uuid().optional(),
        scope: z.enum(['all', 'global', 'project']).optional().default('all'),
    })
    .optional();

const createInputSchema = z.object({
    projectId: z.string().uuid().nullable().optional(),
    name: skillNameSchema,
    description: skillDescriptionSchema,
    content: skillContentSchema,
    enabled: z.boolean().optional().default(true),
});

const updateInputSchema = z.object({
    skillId: z.string().uuid(),
    name: skillNameSchema.optional(),
    description: skillDescriptionSchema.optional(),
    content: skillContentSchema.optional(),
    enabled: z.boolean().optional(),
});

export const skillsRouter = createTRPCRouter({
    /** List the user's skills. `scope` filters: all (default) | global | project. */
    list: protectedProcedure.input(scopeFilterSchema).query(async ({ ctx, input }) => {
        const userId = ctx.user.id;
        const scope = input?.scope ?? 'all';
        const projectId = input?.projectId ?? null;

        if (scope === 'project' && !projectId) {
            return [];
        }

        const where =
            scope === 'global'
                ? and(eq(skills.userId, userId), isNull(skills.projectId))
                : scope === 'project' && projectId
                  ? and(eq(skills.userId, userId), eq(skills.projectId, projectId))
                  : projectId
                    ? // 'all' inside a project context: include both global + this project's
                      and(
                          eq(skills.userId, userId),
                          or(isNull(skills.projectId), eq(skills.projectId, projectId)),
                      )
                    : eq(skills.userId, userId);

        const rows = await ctx.db.query.skills.findMany({
            where,
            orderBy: (s, { asc }) => [asc(s.name)],
        });
        return rows.map(fromDbSkill);
    }),

    get: protectedProcedure
        .input(z.object({ skillId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            await verifySkillAccess(ctx.db, ctx.user.id, input.skillId);
            const row = await ctx.db.query.skills.findFirst({
                where: eq(skills.id, input.skillId),
            });
            if (!row) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Skill not found' });
            }
            return fromDbSkill(row);
        }),

    create: protectedProcedure.input(createInputSchema).mutation(async ({ ctx, input }) => {
        const userId = ctx.user.id;
        if (input.projectId) {
            await verifyProjectAccess(ctx.db, userId, input.projectId);
        }
        try {
            const [row] = await ctx.db
                .insert(skills)
                .values({
                    userId,
                    projectId: input.projectId ?? null,
                    name: input.name,
                    description: input.description,
                    content: input.content,
                    enabled: input.enabled,
                })
                .returning();
            if (!row) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to create skill',
                });
            }
            // Drop the in-process skills cache so the next chat turn reads
            // the new row instead of waiting up to 60 s for TTL expiry.
            invalidateSkillsCache();
            return fromDbSkill(row);
        } catch (err) {
            if (isUniqueViolation(err)) {
                throw new TRPCError({
                    code: 'CONFLICT',
                    message: `A skill named "${input.name}" already exists in this scope.`,
                });
            }
            throw err;
        }
    }),

    update: protectedProcedure.input(updateInputSchema).mutation(async ({ ctx, input }) => {
        const userId = ctx.user.id;
        await verifySkillAccess(ctx.db, userId, input.skillId);
        const patch: Record<string, unknown> = { updatedAt: new Date() };
        if (input.name !== undefined) patch.name = input.name;
        if (input.description !== undefined) patch.description = input.description;
        if (input.content !== undefined) patch.content = input.content;
        if (input.enabled !== undefined) patch.enabled = input.enabled;

        try {
            const [row] = await ctx.db
                .update(skills)
                .set(patch)
                .where(eq(skills.id, input.skillId))
                .returning();
            if (!row) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Skill not found' });
            }
            invalidateSkillsCache();
            return fromDbSkill(row);
        } catch (err) {
            if (isUniqueViolation(err)) {
                throw new TRPCError({
                    code: 'CONFLICT',
                    message: `A skill with that name already exists in this scope.`,
                });
            }
            throw err;
        }
    }),

    delete: protectedProcedure
        .input(z.object({ skillId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await verifySkillAccess(ctx.db, ctx.user.id, input.skillId);
            await ctx.db.delete(skills).where(eq(skills.id, input.skillId));
            invalidateSkillsCache();
            return true;
        }),

    /**
     * Two-step import:
     *   1. `previewImport` — fetch (or read pasted content), parse the SKILL.md,
     *      and return the full parsed payload for the UI to render.
     *   2. `commitImport` — accept the parsed payload directly (so we don't
     *      re-fetch the URL) and insert.
     *
     * Splitting the two avoids double-fetching the source URL and removes the
     * rate-limit risk against `raw.githubusercontent.com`.
     */
    previewImport: protectedProcedure
        .input(
            z
                .object({
                    url: z.string().url().optional(),
                    rawContent: z
                        .string()
                        .max(2 * 1024 * 1024)
                        .optional(),
                })
                .refine(
                    (v) => Boolean(v.url) !== Boolean(v.rawContent),
                    'Provide exactly one of `url` or `rawContent`.',
                ),
        )
        .mutation(async ({ input }) => {
            const raw = input.url ? await importSkillFromUrl(input.url) : (input.rawContent ?? '');
            const parsed = parseSkillSource(raw);
            return {
                name: parsed.name,
                description: parsed.description,
                content: parsed.content,
                contentPreview: parsed.content.slice(0, 200),
                contentLength: parsed.content.length,
            };
        }),

    commitImport: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid().nullable().optional(),
                name: skillNameSchema,
                description: skillDescriptionSchema,
                content: skillContentSchema,
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.user.id;
            if (input.projectId) {
                await verifyProjectAccess(ctx.db, userId, input.projectId);
            }
            try {
                const [row] = await ctx.db
                    .insert(skills)
                    .values({
                        userId,
                        projectId: input.projectId ?? null,
                        name: input.name,
                        description: input.description,
                        content: input.content,
                        enabled: true,
                    })
                    .returning();
                if (!row) {
                    throw new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Failed to import skill',
                    });
                }
                invalidateSkillsCache();
                return { skill: fromDbSkill(row) } as const;
            } catch (err) {
                if (isUniqueViolation(err)) {
                    throw new TRPCError({
                        code: 'CONFLICT',
                        message: `A skill named "${input.name}" already exists in this scope.`,
                    });
                }
                throw err;
            }
        }),
});

function isUniqueViolation(err: unknown): boolean {
    if (typeof err !== 'object' || err === null) return false;
    const code = (err as { code?: unknown }).code;
    return code === '23505';
}
