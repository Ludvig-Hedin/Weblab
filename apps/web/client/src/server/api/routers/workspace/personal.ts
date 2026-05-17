import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';

import type { DrizzleDb } from '@weblab/db';
import { users, workspaceMembers, workspaces } from '@weblab/db';
import { WorkspaceKind, WorkspaceRole } from '@weblab/models';

/**
 * Returns the id of the caller's personal workspace, creating it (and the
 * owner membership row) if missing. Idempotent.
 *
 * Project create paths use this as the default workspace assignment when no
 * explicit workspaceId is supplied — matches the legacy "everything goes to
 * me" model while the dashboard transition completes.
 */
export async function resolvePersonalWorkspaceId(
    db: DrizzleDb,
    userId: string,
    userEmail: string | null,
): Promise<string> {
    const existing = await db.query.workspaces.findFirst({
        where: and(
            eq(workspaces.createdByUserId, userId),
            eq(workspaces.kind, WorkspaceKind.PERSONAL),
        ),
    });
    if (existing) {
        return existing.id;
    }

    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    });
    const displayName =
        user?.displayName?.trim() ||
        user?.firstName?.trim() ||
        (userEmail?.split('@')[0] ?? '') ||
        'Personal';

    return await db.transaction(async (tx) => {
        const [created] = await tx
            .insert(workspaces)
            .values({
                name: `${displayName}'s Workspace`,
                slug: `personal-${userId}`,
                kind: WorkspaceKind.PERSONAL,
                createdByUserId: userId,
            })
            .returning();
        if (!created) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to ensure personal workspace',
            });
        }
        await tx
            .insert(workspaceMembers)
            .values({
                workspaceId: created.id,
                userId,
                role: WorkspaceRole.OWNER,
            })
            .onConflictDoNothing();
        return created.id;
    });
}
