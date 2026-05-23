import { TRPCError } from '@trpc/server';
import { and, count, eq, ne } from 'drizzle-orm';
import { z } from 'zod';

import { projects, workspaceMembers, workspaces } from '@weblab/db';
import { AuditEventKind, WorkspaceKind, WorkspaceRole } from '@weblab/models';

import { audit } from '../../permissions/audit';
import { requireCap } from '../../permissions/requireCap';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

const slugFromName = (name: string): string => {
    const base = name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
    return base.length > 0 ? base : 'workspace';
};

export const workspaceRouter = createTRPCRouter({
    /**
     * List all workspaces the caller is a member of.
     */
    list: protectedProcedure.query(async ({ ctx }) => {
        const memberships = await ctx.db.query.workspaceMembers.findMany({
            where: eq(workspaceMembers.userId, ctx.user.id),
            with: {
                workspace: true,
            },
        });
        return memberships
            .map((m) => ({
                ...m.workspace,
                viewerRole: m.role,
            }))
            .sort((a, b) => {
                // Personal first, then by name
                if (a.kind === WorkspaceKind.PERSONAL && b.kind !== WorkspaceKind.PERSONAL) {
                    return -1;
                }
                if (b.kind === WorkspaceKind.PERSONAL && a.kind !== WorkspaceKind.PERSONAL) {
                    return 1;
                }
                return a.name.localeCompare(b.name);
            });
    }),

    /**
     * Fetch a workspace by slug. Caller must be a member.
     */
    getBySlug: protectedProcedure
        .input(z.object({ slug: z.string().min(1) }))
        .query(async ({ ctx, input }) => {
            const ws = await ctx.db.query.workspaces.findFirst({
                where: eq(workspaces.slug, input.slug),
            });
            if (!ws) return null;

            const membership = await ctx.db.query.workspaceMembers.findFirst({
                where: and(
                    eq(workspaceMembers.workspaceId, ws.id),
                    eq(workspaceMembers.userId, ctx.user.id),
                ),
            });
            if (!membership) return null;

            return { ...ws, viewerRole: membership.role };
        }),

    /**
     * Fetch a workspace by id. Caller must be a member.
     */
    get: protectedProcedure
        .input(z.object({ workspaceId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            const resource = await requireCap(ctx.db, ctx.user.id, 'workspace.view', {
                workspaceId: input.workspaceId,
            });
            const ws = await ctx.db.query.workspaces.findFirst({
                where: eq(workspaces.id, input.workspaceId),
            });
            if (!ws) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });
            }
            return { ...ws, viewerRole: resource.workspaceRole };
        }),

    /**
     * Recovery / signup-time ensure: returns the caller's personal workspace,
     * creating it if missing. Idempotent. Used by the dashboard fallback when
     * a user has no workspace memberships (rare — backfill creates one).
     */
    ensurePersonal: protectedProcedure.mutation(async ({ ctx }) => {
        const existing = await ctx.db.query.workspaces.findFirst({
            where: and(
                eq(workspaces.createdByUserId, ctx.user.id),
                eq(workspaces.kind, WorkspaceKind.PERSONAL),
            ),
        });
        if (existing) {
            return existing;
        }

        const user = await ctx.db.query.users.findFirst({
            where: (u, { eq }) => eq(u.id, ctx.user.id),
        });
        const displayName =
            user?.displayName?.trim() ||
            user?.firstName?.trim() ||
            (ctx.user.email?.split('@')[0] ?? '') ||
            'Personal';
        const name = `${displayName}'s Workspace`;
        const slug = `personal-${ctx.user.id}`;

        try {
            return await ctx.db.transaction(async (tx) => {
                const [created] = await tx
                    .insert(workspaces)
                    .values({
                        name,
                        slug,
                        kind: WorkspaceKind.PERSONAL,
                        createdByUserId: ctx.user.id,
                    })
                    .returning();
                if (!created) {
                    throw new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Failed to create personal workspace',
                    });
                }
                await tx.insert(workspaceMembers).values({
                    workspaceId: created.id,
                    userId: ctx.user.id,
                    role: WorkspaceRole.OWNER,
                });
                return created;
            });
        } catch (err: unknown) {
            // 23505 = unique violation. Concurrent tabs (or webhook + first
            // login) can race here. Re-query and return the winner row
            // instead of bubbling a 500 — matches `resolvePersonalWorkspaceId`.
            const code =
                typeof err === 'object' && err !== null && 'code' in err
                    ? (err as { code?: string }).code
                    : undefined;
            if (code === '23505') {
                const winner = await ctx.db.query.workspaces.findFirst({
                    where: and(
                        eq(workspaces.createdByUserId, ctx.user.id),
                        eq(workspaces.kind, WorkspaceKind.PERSONAL),
                    ),
                });
                if (winner) return winner;
            }
            throw err;
        }
    }),

    /**
     * Update workspace metadata. Requires `workspace.update`.
     */
    update: protectedProcedure
        .input(
            z.object({
                workspaceId: z.string().uuid(),
                name: z.string().trim().min(1).max(80).optional(),
                slug: z
                    .string()
                    .trim()
                    .regex(/^[a-z0-9-]+$/)
                    .min(2)
                    // 64 covers the backfilled `personal-<uuid>` (50 chars).
                    .max(64)
                    .optional(),
                avatarUrl: z.string().nullable().optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'workspace.update', {
                workspaceId: input.workspaceId,
            });

            if (input.slug) {
                const collision = await ctx.db.query.workspaces.findFirst({
                    where: and(
                        eq(workspaces.slug, input.slug),
                        ne(workspaces.id, input.workspaceId),
                    ),
                });
                if (collision) {
                    throw new TRPCError({
                        code: 'CONFLICT',
                        message: 'Workspace slug already in use',
                    });
                }
            }

            const updateValues: Partial<typeof workspaces.$inferInsert> = {
                updatedAt: new Date(),
            };
            if (input.name !== undefined) updateValues.name = input.name;
            if (input.slug !== undefined) updateValues.slug = input.slug;
            if (input.avatarUrl !== undefined) updateValues.avatarUrl = input.avatarUrl;

            const [updated] = await ctx.db
                .update(workspaces)
                .set(updateValues)
                .where(eq(workspaces.id, input.workspaceId))
                .returning();
            if (!updated) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });
            }
            await audit(ctx.db, {
                event: AuditEventKind.WORKSPACE_RENAMED,
                workspaceId: updated.id,
                actorUserId: ctx.user.id,
                payload: { name: updated.name, slug: updated.slug },
            });
            return updated;
        }),

    /**
     * Delete a workspace. Requires `workspace.delete`. Forbid deleting a
     * personal workspace. Forbid deleting a workspace that still owns projects —
     * the caller must remove or move projects first to avoid orphaning.
     */
    delete: protectedProcedure
        .input(z.object({ workspaceId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'workspace.delete', {
                workspaceId: input.workspaceId,
            });
            // Lock workspace row + project count check + audit + delete all
            // inside one transaction. Without SELECT FOR UPDATE a concurrent
            // project.create can slip in between the count and the DELETE,
            // leaving an audit row that lies + a FK RESTRICT 500. Pg row-level
            // lock blocks the create until this tx commits or rolls back.
            return await ctx.db.transaction(async (tx) => {
                const lockedRows = await tx
                    .select({
                        id: workspaces.id,
                        name: workspaces.name,
                        slug: workspaces.slug,
                        kind: workspaces.kind,
                    })
                    .from(workspaces)
                    .where(eq(workspaces.id, input.workspaceId))
                    .for('update');
                const ws = lockedRows[0];
                if (!ws) {
                    throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });
                }
                if (ws.kind === WorkspaceKind.PERSONAL) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: 'Personal workspaces cannot be deleted',
                    });
                }
                const [{ value: projectCount } = { value: 0 }] = await tx
                    .select({ value: count() })
                    .from(projects)
                    .where(eq(projects.workspaceId, input.workspaceId));
                if (projectCount > 0) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: `Cannot delete: workspace still has ${projectCount} project(s). Move or delete them first.`,
                    });
                }
                // audit_log.workspace_id FK is ON DELETE SET NULL — write the
                // audit row BEFORE the DELETE so the FK still points at the
                // doomed workspace. Inside the same tx, both succeed or both
                // roll back.
                await audit(tx, {
                    event: AuditEventKind.WORKSPACE_DELETED,
                    workspaceId: input.workspaceId,
                    actorUserId: ctx.user.id,
                    payload: { name: ws.name, slug: ws.slug, kind: ws.kind },
                });
                await tx.delete(workspaces).where(eq(workspaces.id, input.workspaceId));
                return { ok: true };
            });
        }),

    /**
     * Leave a workspace. Removes the caller's membership. Blocked if the
     * caller is the only owner of the workspace.
     */
    leave: protectedProcedure
        .input(z.object({ workspaceId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const membership = await ctx.db.query.workspaceMembers.findFirst({
                where: and(
                    eq(workspaceMembers.workspaceId, input.workspaceId),
                    eq(workspaceMembers.userId, ctx.user.id),
                ),
            });
            if (!membership) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'You are not a member of this workspace',
                });
            }
            if (membership.role === WorkspaceRole.OWNER) {
                // Last-owner guard.
                const [{ value: ownerCount } = { value: 0 }] = await ctx.db
                    .select({ value: count() })
                    .from(workspaceMembers)
                    .where(
                        and(
                            eq(workspaceMembers.workspaceId, input.workspaceId),
                            eq(workspaceMembers.role, WorkspaceRole.OWNER),
                        ),
                    );
                if (ownerCount <= 1) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: 'You are the last owner. Transfer ownership before leaving.',
                    });
                }
            }
            await ctx.db
                .delete(workspaceMembers)
                .where(
                    and(
                        eq(workspaceMembers.workspaceId, input.workspaceId),
                        eq(workspaceMembers.userId, ctx.user.id),
                    ),
                );
            await audit(ctx.db, {
                event: AuditEventKind.WORKSPACE_MEMBER_REMOVED,
                workspaceId: input.workspaceId,
                actorUserId: ctx.user.id,
                payload: { selfLeave: true },
            });
            return { ok: true };
        }),

    /**
     * Create a team workspace. Caller becomes owner.
     */
    createTeam: protectedProcedure
        .input(
            z.object({
                name: z.string().trim().min(1).max(80),
                slug: z
                    .string()
                    .trim()
                    .regex(/^[a-z0-9-]+$/)
                    .min(2)
                    // 64 covers the backfilled `personal-<uuid>` (50 chars).
                    .max(64)
                    .optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const slug = input.slug ?? `${slugFromName(input.name)}-${ctx.user.id.slice(0, 6)}`;

            // Reserve the `personal-*` namespace for auto-generated personal
            // workspaces so a malicious actor can't squat on someone else's
            // future personal slug and break ensurePersonal.
            if (slug.startsWith('personal-')) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Workspace slug cannot start with "personal-"',
                });
            }

            // Block slug collision early with a friendly error.
            const collision = await ctx.db.query.workspaces.findFirst({
                where: eq(workspaces.slug, slug),
            });
            if (collision) {
                throw new TRPCError({
                    code: 'CONFLICT',
                    message: 'Workspace slug already in use',
                });
            }

            return await ctx.db
                .transaction(async (tx) => {
                    const [created] = await tx
                        .insert(workspaces)
                        .values({
                            name: input.name,
                            slug,
                            kind: WorkspaceKind.TEAM,
                            createdByUserId: ctx.user.id,
                        })
                        .returning();
                    if (!created) {
                        throw new TRPCError({
                            code: 'INTERNAL_SERVER_ERROR',
                            message: 'Failed to create workspace',
                        });
                    }
                    await tx.insert(workspaceMembers).values({
                        workspaceId: created.id,
                        userId: ctx.user.id,
                        role: WorkspaceRole.OWNER,
                    });
                    return created;
                })
                .then(async (created) => {
                    await audit(ctx.db, {
                        event: AuditEventKind.WORKSPACE_CREATED,
                        workspaceId: created.id,
                        actorUserId: ctx.user.id,
                        payload: { name: created.name, slug: created.slug, kind: created.kind },
                    });
                    return created;
                });
        }),
});
