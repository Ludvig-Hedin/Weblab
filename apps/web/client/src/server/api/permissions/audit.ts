import type { DrizzleDb } from '@weblab/db';
import type { AuditEventKind } from '@weblab/models';
import { auditLogs } from '@weblab/db';

type DbWithInsert = Pick<DrizzleDb, 'insert'>;

export interface AuditEntry {
    event: AuditEventKind;
    workspaceId?: string | null;
    projectId?: string | null;
    actorUserId?: string | null;
    payload?: Record<string, unknown>;
}

/**
 * Fire-and-forget audit log insert. Errors are swallowed: the audit log is
 * a sidecar, not a transactional dependency. Each mutating router call
 * should `await audit(ctx.db, { ... })` after the primary write succeeds.
 *
 * NEVER call this inside the same transaction as the mutation — it must
 * not be able to roll back the user's action.
 */
export async function audit(db: DbWithInsert, entry: AuditEntry): Promise<void> {
    try {
        await db.insert(auditLogs).values({
            event: entry.event,
            workspaceId: entry.workspaceId ?? null,
            projectId: entry.projectId ?? null,
            actorUserId: entry.actorUserId ?? null,
            payload: entry.payload ?? {},
        });
    } catch (err) {
        console.warn('[audit] failed to write entry', entry.event, err);
    }
}
