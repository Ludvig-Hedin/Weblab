import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

const PERSONAL = 'personal' as const;
const OWNER = 'owner' as const;

/**
 * Returns the id of the given user's personal workspace, creating it (and the
 * owner membership row) if missing. Idempotent. Mirrors
 * apps/web/client/src/server/api/routers/workspace/personal.ts.
 *
 * Must be called from a mutation. Project create paths use this as the
 * default workspace assignment when no explicit workspaceId is supplied.
 */
export async function resolvePersonalWorkspaceId(
    ctx: MutationCtx,
    user: Doc<'users'>,
): Promise<Id<'workspaces'>> {
    const existing = await ctx.db
        .query('workspaces')
        .withIndex('by_created_by_user', (q) => q.eq('createdByUserId', user._id))
        .filter((q) => q.eq(q.field('kind'), PERSONAL))
        .first();
    if (existing) return existing._id;

    const displayName =
        user.displayName?.trim() ||
        user.firstName?.trim() ||
        (user.email?.split('@')[0] ?? '') ||
        'Personal';
    const slug = `personal-${user._id}`;
    const now = Date.now();

    // Guard against a race where another mutation just created the personal
    // workspace by checking the slug-unique index before insert.
    const collision = await ctx.db
        .query('workspaces')
        .withIndex('by_slug', (q) => q.eq('slug', slug))
        .unique();
    if (collision) {
        const membership = await ctx.db
            .query('workspaceMembers')
            .withIndex('by_workspace_user', (q) =>
                q.eq('workspaceId', collision._id).eq('userId', user._id),
            )
            .unique();
        if (!membership) {
            await ctx.db.insert('workspaceMembers', {
                workspaceId: collision._id,
                userId: user._id,
                role: OWNER,
                updatedAt: now,
            });
        }
        return collision._id;
    }

    const workspaceId = await ctx.db.insert('workspaces', {
        name: `${displayName}'s Workspace`,
        slug,
        kind: PERSONAL,
        createdByUserId: user._id,
        updatedAt: now,
    });
    await ctx.db.insert('workspaceMembers', {
        workspaceId,
        userId: user._id,
        role: OWNER,
        updatedAt: now,
    });
    return workspaceId;
}

/**
 * Query-side resolution — returns null if not yet created (callers shouldn't
 * try to create a workspace from a query). Used by read paths that need the
 * personal workspace id.
 */
export async function getPersonalWorkspaceId(
    ctx: QueryCtx | MutationCtx,
    userId: Id<'users'>,
): Promise<Id<'workspaces'> | null> {
    const ws = await ctx.db
        .query('workspaces')
        .withIndex('by_created_by_user', (q) => q.eq('createdByUserId', userId))
        .filter((q) => q.eq(q.field('kind'), PERSONAL))
        .first();
    return ws?._id ?? null;
}
