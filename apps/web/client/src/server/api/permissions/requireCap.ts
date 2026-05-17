import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';

import type { Capability, PermissionResource } from '@weblab/auth';
import type { DrizzleDb } from '@weblab/db';
import type { ProjectAccessMode, ProjectMemberRole, WorkspaceRole } from '@weblab/models';
import { can } from '@weblab/auth';
import { projects, userProjects, workspaceMembers, workspaces } from '@weblab/db';

type DbOrTx = Pick<DrizzleDb, 'query'>;

export type RequireCapOpts =
    | { projectId: string; workspaceId?: string }
    | { projectId?: string; workspaceId: string };

/**
 * Central authorization check for tRPC procedures.
 *
 * Resolves the caller's workspace + project membership for the given
 * resource, runs the capability check via `@weblab/auth/can`, and either
 * returns the resolved `PermissionResource` or throws `FORBIDDEN`.
 *
 * Either `projectId` or `workspaceId` must be supplied. When `projectId` is
 * supplied, the workspace is resolved from the project row.
 */
export async function requireCap(
    db: DbOrTx,
    userId: string,
    cap: Capability,
    opts: RequireCapOpts,
): Promise<PermissionResource> {
    const resource = await loadResource(db, userId, opts);

    if (!can(cap, resource)) {
        throw new TRPCError({
            code: 'FORBIDDEN',
            message: `You do not have permission to ${cap}`,
        });
    }

    return resource;
}

async function loadResource(
    db: DbOrTx,
    userId: string,
    opts: RequireCapOpts,
): Promise<PermissionResource> {
    let projectRow:
        | {
              id: string;
              workspaceId: string;
              accessMode: ProjectAccessMode;
          }
        | undefined;
    let workspaceId: string | undefined;

    if (opts.projectId) {
        const found = await db.query.projects.findFirst({
            where: eq(projects.id, opts.projectId),
            columns: {
                id: true,
                workspaceId: true,
                accessMode: true,
            },
        });
        if (!found) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
        }
        // Projects are nullable-workspace during the phase 2 → phase 9 transition;
        // after 0036 they are NOT NULL. If we ever encounter a null in prod, it
        // means a write path skipped workspace assignment — treat as a hard error.
        const projectWorkspaceId = found.workspaceId;
        if (!projectWorkspaceId) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Project is not assigned to a workspace',
            });
        }
        projectRow = {
            id: found.id,
            workspaceId: projectWorkspaceId,
            accessMode: found.accessMode,
        };
        workspaceId = projectWorkspaceId;
    }

    if (opts.workspaceId) {
        // SECURITY: when projectId is also supplied, the workspace is derived
        // from the project row. Trusting a client-supplied workspaceId here
        // would let a caller spoof workspace caps by passing
        // { projectId: victim, workspaceId: ownedByCaller } — any
        // workspace-level cap would resolve against the attacker's workspace
        // while the project belongs to the victim's workspace. Refuse the
        // mismatch instead of silently widening.
        if (projectRow && workspaceId && opts.workspaceId !== workspaceId) {
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'workspaceId does not match the project’s workspace',
            });
        }
        if (!workspaceId) {
            workspaceId = opts.workspaceId;
        }
    }

    if (!workspaceId) {
        throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'requireCap requires projectId or workspaceId',
        });
    }

    const workspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.id, workspaceId),
        columns: { id: true, createdByUserId: true },
    });
    if (!workspace) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });
    }

    const wsMembership = await db.query.workspaceMembers.findFirst({
        where: and(
            eq(workspaceMembers.workspaceId, workspace.id),
            eq(workspaceMembers.userId, userId),
        ),
        columns: { role: true },
    });

    let projectRole: ProjectMemberRole | null = null;
    if (projectRow) {
        const membership = await db.query.userProjects.findFirst({
            where: and(eq(userProjects.projectId, projectRow.id), eq(userProjects.userId, userId)),
            columns: { memberRole: true },
        });
        projectRole = membership?.memberRole ?? null;
    }

    return {
        workspace: { id: workspace.id, createdByUserId: workspace.createdByUserId },
        workspaceRole: (wsMembership?.role as WorkspaceRole | undefined) ?? null,
        project: projectRow
            ? {
                  id: projectRow.id,
                  accessMode: projectRow.accessMode,
                  workspaceId: projectRow.workspaceId,
              }
            : undefined,
        projectRole,
    };
}
