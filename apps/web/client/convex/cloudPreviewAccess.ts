import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { requireCloudAccess } from './cloudEditorAccess';
import { can } from './lib/auth';
import { cloudError, cloudScope } from './lib/cloudEditor';
import { getUserByClerkIdSafe } from './lib/permissions';

type Scope = { projectId: Id<'projects'>; branchId: Id<'branches'> };
type Context = QueryCtx | MutationCtx;
const MAX_BRANCH_TICKETS = 101; // Bounded cloud membership plus implicit creator.
const hex = (buffer: ArrayBuffer): string => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
const validSecret = (value: string): boolean => /^[a-f0-9]{64}$/.test(value);
async function digest(value: string): Promise<string> {
    return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}
async function mac(key: string, value: string): Promise<string> {
    const imported = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return hex(await crypto.subtle.sign('HMAC', imported, new TextEncoder().encode(value)));
}
function equalSecret(left: string, right: string): boolean {
    if (!validSecret(left) || !validSecret(right)) return false;
    let difference = 0;
    for (let index = 0; index < 64; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    return difference === 0;
}
function live(state: { status: string; sandboxId?: string; expiresAt?: number; previewToken?: string; previewGatewayVersion?: number }): state is typeof state & { sandboxId: string; expiresAt: number; previewToken: string } {
    return process.env.WEBLAB_CLOUD_EDITOR_ENABLED === 'true' &&
        state.previewGatewayVersion === 2 &&
        (state.status === 'ready' || state.status === 'starting') && !!state.sandboxId &&
        Number.isSafeInteger(state.expiresAt) && state.expiresAt! > Date.now() && validSecret(state.previewToken ?? '');
}
async function deriveTicket(key: string, row: Scope & { userId: Id<'users'>; sandboxId: string; expiresAt: number; nonce: string }): Promise<string> {
    return mac(key, JSON.stringify(['weblab-preview-ticket-v1', row.projectId, row.branchId, row.userId, row.sandboxId, row.expiresAt, row.nonce]));
}

/** Status may expose only this actor-bound capability, never state.previewToken. */
export async function getCloudPreviewTicket(ctx: Context, scope: Scope): Promise<string | null> {
    const access = await requireCloudAccess(ctx, scope);
    if (!access.role || !live(access.state)) return null;
    const row = await ctx.db.query('cloudPreviewTickets')
        .withIndex('by_branchId_and_userId', q => q.eq('branchId', scope.branchId).eq('userId', access.user._id)).unique();
    if (!row || row.projectId !== scope.projectId || row.sandboxId !== access.state.sandboxId || row.expiresAt !== access.state.expiresAt) return null;
    const token = await deriveTicket(access.state.previewToken, row);
    return equalSecret(row.ticketHash, await digest(token)) ? token : null;
}

/** No VM is started here. Reuses one ticket row per current actor and branch. */
export const issue = mutation({
    args: cloudScope,
    handler: async (ctx, scope) => {
        const { state, user, role } = await requireCloudAccess(ctx, scope);
        if (!role) return cloudError('CLOUD_ROLE_REQUIRED');
        if (!live(state)) return cloudError('CLOUD_PREVIEW_UNAVAILABLE');
        const prior = await ctx.db.query('cloudPreviewTickets')
            .withIndex('by_branchId_and_userId', q => q.eq('branchId', scope.branchId).eq('userId', user._id)).unique();
        if (prior && prior.projectId !== scope.projectId) return cloudError('CLOUD_NOT_ENROLLED');
        if (!prior) {
            const rows = await ctx.db.query('cloudPreviewTickets')
                .withIndex('by_branchId_and_userId', q => q.eq('branchId', scope.branchId)).take(MAX_BRANCH_TICKETS);
            let retained = rows.length;
            for (const row of rows) {
                if (row.projectId !== scope.projectId) return cloudError('CLOUD_NOT_ENROLLED');
                if (row.expiresAt <= Date.now() || row.sandboxId !== state.sandboxId) {
                    await ctx.db.delete(row._id);
                    retained--;
                }
            }
            if (retained >= MAX_BRANCH_TICKETS) return cloudError('CLOUD_PREVIEW_TICKET_LIMIT');
        }
        const row = { ...scope, userId: user._id, sandboxId: state.sandboxId, expiresAt: state.expiresAt,
            nonce: prior?.sandboxId === state.sandboxId && prior.expiresAt === state.expiresAt ? prior.nonce : crypto.randomUUID() };
        const previewToken = await deriveTicket(state.previewToken, row);
        const ticketHash = await digest(previewToken);
        if (!prior || prior.ticketHash !== ticketHash) {
            const value = { ...row, ticketHash, updatedAt: Date.now() };
            if (prior) await ctx.db.replace(prior._id, value);
            else await ctx.db.insert('cloudPreviewTickets', value);
        }
        return { previewToken, expiresAt: state.expiresAt, sandboxId: state.sandboxId };
    },
});

/**
 * The runtime verifier proves the caller is the isolated gateway. The ticket
 * hash resolves the user server-side; no caller-supplied user identity is trusted.
 * This query deliberately uses the same current permission matrix as requireCap,
 * without impersonating a Clerk session or forwarding Clerk credentials to a VM.
 */
export const authorize = query({
    args: { ...cloudScope, sandboxId: v.string(), verifier: v.string(), ticket: v.string() },
    handler: async (ctx, args): Promise<{ allowed: boolean; expiresAt: number | null }> => {
        const denied = { allowed: false, expiresAt: null };
        if (!validSecret(args.verifier) || !validSecret(args.ticket)) return denied;
        const state = await ctx.db.query('cloudEditorStates').withIndex('by_branchId', q => q.eq('branchId', args.branchId)).unique();
        if (!state || state.projectId !== args.projectId || state.version !== 1 || !live(state) || state.sandboxId !== args.sandboxId) return denied;
        if (!equalSecret(args.verifier, await mac(state.previewToken, 'weblab-preview-verifier-v1'))) return denied;
        const ticketHash = await digest(args.ticket);
        const ticket = await ctx.db.query('cloudPreviewTickets').withIndex('by_ticketHash', q => q.eq('ticketHash', ticketHash)).unique();
        if (!ticket || ticket.projectId !== args.projectId || ticket.branchId !== args.branchId || ticket.sandboxId !== args.sandboxId || ticket.expiresAt !== state.expiresAt) return denied;
        const [user, project, branch, workspace] = await Promise.all([
            ctx.db.get(ticket.userId), ctx.db.get(args.projectId), ctx.db.get(args.branchId), ctx.db.get(state.workspaceId),
        ]);
        if (!user || !project || !branch || !workspace || branch.projectId !== project._id || project.workspaceId !== workspace._id) return denied;
        if (!user.clerkUserId || (await getUserByClerkIdSafe(ctx, user.clerkUserId))?._id !== user._id) return denied;
        const [workspaceMember, projectMember, grant] = await Promise.all([
            ctx.db.query('workspaceMembers').withIndex('by_workspace_user', q => q.eq('workspaceId', workspace._id).eq('userId', user._id)).unique(),
            ctx.db.query('projectMembers').withIndex('by_project_user', q => q.eq('projectId', project._id).eq('userId', user._id)).unique(),
            ctx.db.query('cloudEditorGrants').withIndex('by_projectId_userId', q => q.eq('projectId', project._id).eq('userId', user._id)).unique(),
        ]);
        if (!grant && state.createdByUserId !== user._id) return denied;
        if (!can('project.view', {
            workspace: { id: workspace._id, createdByUserId: workspace.createdByUserId }, workspaceRole: workspaceMember?.role ?? null,
            project: { id: project._id, accessMode: project.accessMode, workspaceId: workspace._id }, projectRole: projectMember?.role ?? null,
        })) return denied;
        return { allowed: true, expiresAt: state.expiresAt };
    },
});
