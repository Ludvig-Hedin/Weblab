import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { can } from './auth';
import { getOptionalUser, getUserByClerkIdSafe, requireCap } from './permissions';

export type CloudProjectScope = { projectId: Id<'projects'>; branchId: Id<'branches'> };
type Context = QueryCtx | MutationCtx;
type CapabilityContext = Awaited<ReturnType<typeof requireCap>>;
type OrdinaryAdmission = Pick<typeof import('./permissions'), 'getOptionalUser' | 'requireCap'>;

/** Server-only dependency seam for exercising the production allowlist without global mocks. */
export function createCloudProjectCapabilityResolver(ordinary: OrdinaryAdmission) {
    return async (ctx: Context, scope: CloudProjectScope): Promise<CapabilityContext> => {
        // Preserve ordinary admission and every ordinary authorization error.
        // A failed capability check must never fall through to scoped admission.
        if (await ordinary.getOptionalUser(ctx)) {
            return ordinary.requireCap(ctx, 'project.view', { projectId: scope.projectId });
        }
        return requireExplicitCloudProjectCapability(ctx, scope);
    };
}

/** Entry is explicit even when Next and Convex have different global allowlists. */
export async function requireExplicitCloudProjectCapability(ctx: Context, scope: CloudProjectScope): Promise<CapabilityContext> {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('UNAUTHORIZED');
    const user = await getUserByClerkIdSafe(ctx, identity.subject);
    if (!user || user.clerkUserId !== identity.subject) throw new Error('UNAUTHORIZED');
    const project = await ctx.db.get(scope.projectId);
    const branch = await ctx.db.get(scope.branchId);
    const state = await ctx.db.query('cloudEditorStates')
        .withIndex('by_branchId', q => q.eq('branchId', scope.branchId)).unique();
    if (!project || !branch || branch.projectId !== project._id || !state || state.version !== 1 ||
        state.projectId !== project._id || state.workspaceId !== project.workspaceId) {
        throw new Error('FORBIDDEN: cloud project admission');
    }
    const workspace = await ctx.db.get(project.workspaceId);
    if (!workspace) throw new Error('FORBIDDEN: cloud project admission');
    const membership = await ctx.db.query('projectMembers')
        .withIndex('by_project_user', q => q.eq('projectId', project._id).eq('userId', user._id)).unique();
    const grant = await ctx.db.query('cloudEditorGrants')
        .withIndex('by_projectId_userId', q => q.eq('projectId', project._id).eq('userId', user._id)).unique();
    // Neither workspace authority nor the enrollment's creator substitutes
    // for either explicit row when the global sign-in gate rejected the user.
    if (!membership || !grant) throw new Error('FORBIDDEN: cloud project admission');
    const workspaceMembership = await ctx.db.query('workspaceMembers')
        .withIndex('by_workspace_user', q => q.eq('workspaceId', workspace._id).eq('userId', user._id)).unique();
    const resource = {
        workspace: { id: workspace._id, createdByUserId: workspace.createdByUserId },
        workspaceRole: workspaceMembership?.role ?? null,
        project: { id: project._id, accessMode: project.accessMode, workspaceId: project.workspaceId },
        projectRole: membership.role,
    };
    if (!can('project.view', resource)) throw new Error('FORBIDDEN: project.view');
    return { user, workspace, workspaceRole: resource.workspaceRole, project, projectRole: membership.role };
}

/** Exact cloud scope only. This is not general website, workspace or API admission. */
export const requireCloudProjectCapability = createCloudProjectCapabilityResolver({ getOptionalUser, requireCap });
