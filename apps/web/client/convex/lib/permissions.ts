import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Capability, PermissionResource } from './auth';
import { can, CAPABILITIES } from './auth';

// Convex-side authorization layer. Same semantics as
// apps/web/client/src/server/api/permissions/requireCap.ts but expressed
// against Convex documents instead of Drizzle rows.

export async function getOptionalUser(ctx: QueryCtx | MutationCtx): Promise<Doc<'users'> | null> {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    // Use `.collect()` then dedupe so a duplicate row (rare, see
    // requireUserJIT) doesn't throw and lock the user out of every read.
    // Queries can't delete; cleanup happens lazily on the next mutation
    // that flows through `requireUserJIT`.
    const matches = await ctx.db
        .query('users')
        .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', identity.subject))
        .collect();
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0]!;
    return [...matches].sort((a, b) => a._creationTime - b._creationTime)[0]!;
}

export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<'users'>> {
    const user = await getOptionalUser(ctx);
    if (!user) throw new Error('UNAUTHORIZED');
    return user;
}

export async function requireUserJIT(ctx: MutationCtx): Promise<Doc<'users'>> {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('UNAUTHORIZED');

    // INVARIANT: at most one users row per clerkUserId. Convex has no native
    // UNIQUE constraint — Convex transactions are serializable per-mutation,
    // so two concurrent first-login mutations cannot both land an insert in
    // the same logical timeline. But the Clerk webhook (`upsertUser`) and
    // this JIT path are independent writers that race on cold starts: the
    // webhook can land between our `.unique()` read and our insert,
    // producing two rows. `.unique()` then throws on every subsequent read
    // and the user is bricked until manual cleanup. Use `.collect()` so we
    // can detect and self-heal that case here instead of letting it bleed
    // into every downstream query.
    const matches = await ctx.db
        .query('users')
        .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', identity.subject))
        .collect();
    if (matches.length === 1) return matches[0]!;
    if (matches.length > 1) {
        // Keep the earliest row (most likely to be the one downstream tables
        // already FK into); delete the rest. Best-effort: errors here are
        // swallowed because the user is signed in and the canonical row is
        // already chosen — we don't want to fail the request over cleanup.
        const sorted = [...matches].sort((a, b) => a._creationTime - b._creationTime);
        const keep = sorted[0]!;
        for (const dup of sorted.slice(1)) {
            try {
                await ctx.db.delete(dup._id);
            } catch (err) {
                console.warn('[requireUserJIT] duplicate cleanup failed', {
                    clerkUserId: identity.subject,
                    duplicateId: dup._id,
                    err,
                });
            }
        }
        return keep;
    }

    const id = await ctx.db.insert('users', {
        clerkUserId: identity.subject,
        email: identity.email ?? undefined,
        firstName: identity.givenName ?? undefined,
        lastName: identity.familyName ?? undefined,
        displayName: identity.name ?? identity.email ?? undefined,
        avatarUrl: identity.pictureUrl ?? undefined,
        updatedAt: Date.now(),
    });
    const created = await ctx.db.get(id);
    if (!created) throw new Error('USER_INSERT_FAILED');
    return created;
}

interface ScopeArgs {
    projectId?: Id<'projects'>;
    workspaceId?: Id<'workspaces'>;
}

interface CapContext {
    user: Doc<'users'>;
    workspace: Doc<'workspaces'>;
    workspaceRole: Doc<'workspaceMembers'>['role'] | null;
    project?: Doc<'projects'>;
    projectRole?: Doc<'projectMembers'>['role'] | null;
}

async function resolveScope(
    ctx: QueryCtx | MutationCtx,
    user: Doc<'users'>,
    scope: ScopeArgs,
): Promise<CapContext> {
    if (!scope.projectId && !scope.workspaceId) {
        throw new Error('requireCap: either projectId or workspaceId is required');
    }

    let project: Doc<'projects'> | undefined;
    let workspaceId: Id<'workspaces'>;

    if (scope.projectId) {
        const p = await ctx.db.get(scope.projectId);
        if (!p) throw new Error('NOT_FOUND: project');
        project = p;
        workspaceId = p.workspaceId;
        if (scope.workspaceId && scope.workspaceId !== workspaceId) {
            throw new Error('FORBIDDEN: project/workspace mismatch');
        }
    } else {
        workspaceId = scope.workspaceId!;
    }

    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) throw new Error('NOT_FOUND: workspace');

    const membership = await ctx.db
        .query('workspaceMembers')
        .withIndex('by_workspace_user', (q) =>
            q.eq('workspaceId', workspaceId).eq('userId', user._id),
        )
        .unique();

    let projectRole: CapContext['projectRole'] = null;
    if (project) {
        const pm = await ctx.db
            .query('projectMembers')
            .withIndex('by_project_user', (q) =>
                q.eq('projectId', project._id).eq('userId', user._id),
            )
            .unique();
        projectRole = pm?.role ?? null;
    }

    return {
        user,
        workspace,
        workspaceRole: membership?.role ?? null,
        project,
        projectRole,
    };
}

export async function requireCap(
    ctx: QueryCtx | MutationCtx,
    cap: Capability,
    scope: ScopeArgs,
): Promise<CapContext> {
    const user = await requireUser(ctx);
    const c = await resolveScope(ctx, user, scope);
    const r: PermissionResource = {
        workspace: {
            id: c.workspace._id,
            createdByUserId: c.workspace.createdByUserId,
        },
        workspaceRole: c.workspaceRole,
        project: c.project
            ? {
                  id: c.project._id,
                  accessMode: c.project.accessMode,
                  workspaceId: c.project.workspaceId,
              }
            : undefined,
        projectRole: c.projectRole ?? null,
    };
    if (!can(cap, r)) {
        throw new Error(`FORBIDDEN: ${cap}`);
    }
    return c;
}

export async function getCapabilities(
    ctx: QueryCtx | MutationCtx,
    scope: ScopeArgs,
): Promise<Capability[]> {
    const user = await getOptionalUser(ctx);
    if (!user) return [];
    let c: CapContext;
    try {
        c = await resolveScope(ctx, user, scope);
    } catch {
        return [];
    }
    const r: PermissionResource = {
        workspace: {
            id: c.workspace._id,
            createdByUserId: c.workspace.createdByUserId,
        },
        workspaceRole: c.workspaceRole,
        project: c.project
            ? {
                  id: c.project._id,
                  accessMode: c.project.accessMode,
                  workspaceId: c.project.workspaceId,
              }
            : undefined,
        projectRole: c.projectRole ?? null,
    };
    return CAPABILITIES.filter((cap) => can(cap, r));
}
