import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { requireCap, requireUser } from './lib/permissions';
import {
    skillContentSchema,
    skillDescriptionSchema,
    skillNameSchema,
    verifySkillAccess,
} from './lib/skillHelpers';

// Convex port of apps/web/client/src/server/api/routers/skill/index.ts.
//
// Drizzle uses two partial UNIQUE indexes split on projectId IS NULL.
// Convex has no partial indexes; mutations enforce the same invariant by
// reading via `by_user_project_name` with the projectId equality check
// before each insert/update.

const validateName = (name: string): string => {
    const parsed = skillNameSchema.safeParse(name);
    if (!parsed.success) {
        throw new Error(`BAD_REQUEST: ${parsed.error.issues[0]?.message ?? 'invalid skill name'}`);
    }
    return parsed.data;
};

const validateDescription = (description: string | undefined): string => {
    const parsed = skillDescriptionSchema.safeParse(description ?? '');
    if (!parsed.success) {
        throw new Error(
            `BAD_REQUEST: ${parsed.error.issues[0]?.message ?? 'invalid skill description'}`,
        );
    }
    return parsed.data;
};

const validateContent = (content: string | undefined): string => {
    const parsed = skillContentSchema.safeParse(content ?? '');
    if (!parsed.success) {
        throw new Error(
            `BAD_REQUEST: ${parsed.error.issues[0]?.message ?? 'invalid skill content'}`,
        );
    }
    return parsed.data;
};

/**
 * Look up a name conflict with the same scope rules Drizzle's partial
 * UNIQUE indexes enforce:
 *   - user-global (projectId undefined): collision is another global skill
 *     with the same (userId, name)
 *   - per-project (projectId set): collision is another skill with the same
 *     (userId, projectId, name)
 *
 * The `by_user_project_name` index keys both rows, but projectId-undefined
 * vs projectId-set rows live in different namespaces and never collide.
 */
async function findNameConflict(
    ctx: QueryCtx | MutationCtx,
    userId: Id<'users'>,
    projectId: Id<'projects'> | undefined,
    name: string,
): Promise<Doc<'skills'> | null> {
    return ctx.db
        .query('skills')
        .withIndex('by_user_project_name', (q) =>
            q.eq('userId', userId).eq('projectId', projectId).eq('name', name),
        )
        .unique();
}

export const list = query({
    args: {
        projectId: v.optional(v.id('projects')),
        scope: v.optional(v.union(v.literal('all'), v.literal('global'), v.literal('project'))),
    },
    handler: async (ctx, { projectId, scope = 'all' }) => {
        const user = await requireUser(ctx);
        if (scope === 'project' && !projectId) return [];
        const rows = await ctx.db
            .query('skills')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .collect();
        let filtered: Doc<'skills'>[];
        if (scope === 'global') {
            filtered = rows.filter((r) => r.projectId === undefined);
        } else if (scope === 'project' && projectId) {
            filtered = rows.filter((r) => r.projectId === projectId);
        } else if (projectId) {
            // 'all' inside a project context: include global + this project's.
            filtered = rows.filter((r) => r.projectId === undefined || r.projectId === projectId);
        } else {
            filtered = rows;
        }
        return filtered.sort((a, b) => a.name.localeCompare(b.name));
    },
});

export const get = query({
    args: { skillId: v.id('skills') },
    handler: async (ctx, { skillId }) => verifySkillAccess(ctx, skillId),
});

export const create = mutation({
    args: {
        projectId: v.optional(v.id('projects')),
        name: v.string(),
        description: v.optional(v.string()),
        content: v.optional(v.string()),
        enabled: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        if (args.projectId) {
            await requireCap(ctx, 'project.use_ai', { projectId: args.projectId });
        }
        const name = validateName(args.name);
        const description = validateDescription(args.description);
        const content = validateContent(args.content);
        const conflict = await findNameConflict(ctx, user._id, args.projectId, name);
        if (conflict) {
            throw new Error(`CONFLICT: a skill named "${name}" already exists in this scope.`);
        }
        const now = Date.now();
        const id = await ctx.db.insert('skills', {
            userId: user._id,
            projectId: args.projectId,
            name,
            description,
            content,
            enabled: args.enabled ?? true,
            updatedAt: now,
        });
        return (await ctx.db.get(id))!;
    },
});

export const update = mutation({
    args: {
        skillId: v.id('skills'),
        name: v.optional(v.string()),
        description: v.optional(v.string()),
        content: v.optional(v.string()),
        enabled: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const existing = await verifySkillAccess(ctx, args.skillId);
        // Project-scoped writes additionally require the AI cap on the project.
        if (existing.projectId) {
            await requireCap(ctx, 'project.use_ai', {
                projectId: existing.projectId,
            });
        }
        const patch: Partial<Doc<'skills'>> = { updatedAt: Date.now() };
        if (args.name !== undefined) {
            const nextName = validateName(args.name);
            if (nextName !== existing.name) {
                const conflict = await findNameConflict(
                    ctx,
                    existing.userId,
                    existing.projectId,
                    nextName,
                );
                if (conflict && conflict._id !== existing._id) {
                    throw new Error(
                        `CONFLICT: a skill named "${nextName}" already exists in this scope.`,
                    );
                }
            }
            patch.name = nextName;
        }
        if (args.description !== undefined) {
            patch.description = validateDescription(args.description);
        }
        if (args.content !== undefined) {
            patch.content = validateContent(args.content);
        }
        if (args.enabled !== undefined) patch.enabled = args.enabled;
        await ctx.db.patch(args.skillId, patch);
        return (await ctx.db.get(args.skillId))!;
    },
});

export const remove = mutation({
    args: { skillId: v.id('skills') },
    handler: async (ctx, { skillId }) => {
        const existing = await verifySkillAccess(ctx, skillId);
        if (existing.projectId) {
            await requireCap(ctx, 'project.use_ai', {
                projectId: existing.projectId,
            });
        }
        await ctx.db.delete(skillId);
        return { ok: true } as const;
    },
});

/**
 * Commit a parsed SKILL.md import as a new skill row. The preview/parse
 * step lives in `skillActions.previewImport` so we don't re-fetch the URL.
 */
export const commitImport = mutation({
    args: {
        projectId: v.optional(v.id('projects')),
        name: v.string(),
        description: v.optional(v.string()),
        content: v.string(),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        if (args.projectId) {
            await requireCap(ctx, 'project.use_ai', { projectId: args.projectId });
        }
        const name = validateName(args.name);
        const description = validateDescription(args.description);
        const content = validateContent(args.content);
        const conflict = await findNameConflict(ctx, user._id, args.projectId, name);
        if (conflict) {
            throw new Error(`CONFLICT: a skill named "${name}" already exists in this scope.`);
        }
        const id = await ctx.db.insert('skills', {
            userId: user._id,
            projectId: args.projectId,
            name,
            description,
            content,
            enabled: true,
            updatedAt: Date.now(),
        });
        return { skill: (await ctx.db.get(id))! } as const;
    },
});
