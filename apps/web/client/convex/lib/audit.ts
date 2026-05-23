import type { Infer } from 'convex/values';

import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { vAuditEventKind } from './enums';

export type AuditEventKind = Infer<typeof vAuditEventKind>;

interface AuditArgs {
    event: AuditEventKind;
    workspaceId?: Id<'workspaces'>;
    projectId?: Id<'projects'>;
    actorUserId?: Id<'users'>;
    payload?: unknown;
}

// Fire-and-forget sidecar. Mirrors apps/web/client/src/server/api/permissions/audit.ts.
export async function audit(ctx: MutationCtx, args: AuditArgs): Promise<void> {
    await ctx.db.insert('auditLog', {
        event: args.event,
        workspaceId: args.workspaceId,
        projectId: args.projectId,
        actorUserId: args.actorUserId,
        payload: args.payload ?? {},
    });
}
