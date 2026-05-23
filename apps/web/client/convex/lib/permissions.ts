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
    return ctx.db
        .query('users')
        .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', identity.subject))
        .unique();
}

export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<'users'>> {
    const user = await getOptionalUser(ctx);
    if (!user) throw new Error('UNAUTHORIZED');
    return user;
}

export async function requireUserJIT(ctx: MutationCtx): Promise<Doc<'users'>> {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('UNAUTHORIZED');

    const existing = await ctx.db
        .query('users')
        .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', identity.subject))
        .unique();
    if (existing) return existing;

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
        workspace: { id: c.workspace._id, createdByUserId: c.workspace.createdByUserId },
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
        workspace: { id: c.workspace._id, createdByUserId: c.workspace.createdByUserId },
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
