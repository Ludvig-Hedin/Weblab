import { clerkClient } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { Capability } from '@weblab/auth';
import type { User } from '@weblab/db';
import type { ProjectAccessMode, ProjectMemberRole, WorkspaceRole } from '@weblab/models';
import { can, CAPABILITIES } from '@weblab/auth';
import {
    authUsers,
    fromDbUser,
    projects,
    userInsertSchema,
    userProjects,
    users,
    workspaceMembers,
    workspaces,
} from '@weblab/db';
import { extractNames } from '@weblab/utility';

import type { User as SupabaseUser } from '@supabase/supabase-js';
import { env } from '@/env';
import { getClerkUserId } from '@/server/api/auth-bridge';
import { trackEvent } from '@/utils/analytics/server';
import { callUserWebhook } from '@/utils/n8n/webhook';
import { createAdminClient } from '@/utils/supabase/admin';
import { createTRPCRouter, protectedProcedure } from '../../trpc';
import { userSettingsRouter } from './user-settings';

export const userRouter = createTRPCRouter({
    get: protectedProcedure.query(async ({ ctx }) => {
        const authUser = ctx.user;
        const user = await ctx.db.query.users.findFirst({
            where: eq(users.id, authUser.id),
        });

        const { displayName, firstName, lastName } = getUserName(authUser);
        const userData = user
            ? fromDbUser({
                  ...user,
                  firstName: user.firstName ?? firstName,
                  lastName: user.lastName ?? lastName,
                  displayName: user.displayName ?? displayName,
                  email: user.email ?? authUser.email ?? null,
                  avatarUrl:
                      user.avatarUrl ??
                      (authUser.user_metadata.avatar_url as string | undefined) ??
                      null,
              })
            : null;
        return userData;
    }),
    getById: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
        if (input !== ctx.user.id) {
            throw new Error('Unauthorized');
        }
        const user = await ctx.db.query.users.findFirst({
            where: eq(users.id, ctx.user.id),
            with: {
                userProjects: {
                    with: {
                        project: true,
                    },
                },
            },
        });
        return user;
    }),
    upsert: protectedProcedure
        .input(
            userInsertSchema.omit({
                id: true,
                githubInstallationId: true,
                createdAt: true,
                updatedAt: true,
            }),
        )
        .mutation(async ({ ctx, input }): Promise<User | null> => {
            const authUser = ctx.user;

            const existingUser = await ctx.db.query.users.findFirst({
                where: eq(users.id, authUser.id),
            });

            const { firstName, lastName, displayName } = getUserName(authUser);

            const userData = {
                id: authUser.id,
                firstName: input.firstName ?? firstName,
                lastName: input.lastName ?? lastName,
                displayName: input.displayName ?? displayName,
                email: input.email ?? authUser.email,
                avatarUrl:
                    input.avatarUrl ??
                    (authUser.user_metadata.avatar_url as string | undefined) ??
                    null,
            };

            const [user] = await ctx.db
                .insert(users)
                .values(userData)
                .onConflictDoUpdate({
                    target: [users.id],
                    set: {
                        ...userData,
                        updatedAt: new Date(),
                    },
                })
                .returning();

            if (!existingUser) {
                trackEvent({
                    distinctId: authUser.id,
                    event: 'user_first_signup',
                    properties: {
                        email: userData.email,
                        firstName: userData.firstName,
                        lastName: userData.lastName,
                        displayName: userData.displayName,
                        source: 'web beta',
                    },
                });

                await callUserWebhook({
                    email: userData.email,
                    firstName: userData.firstName,
                    lastName: userData.lastName,
                    source: 'web beta',
                    subscribed: false,
                });
            }

            return user ?? null;
        }),
    updateProfile: protectedProcedure
        .input(
            z.object({
                firstName: z.string().optional(),
                lastName: z.string().optional(),
                displayName: z.string().optional(),
                avatarUrl: z.string().optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const [user] = await ctx.db
                .update(users)
                .set({ ...input, updatedAt: new Date() })
                .where(eq(users.id, ctx.user.id))
                .returning();
            return user ?? null;
        }),
    disconnectGitHub: protectedProcedure.mutation(async ({ ctx }) => {
        await ctx.db
            .update(users)
            .set({ githubInstallationId: null, updatedAt: new Date() })
            .where(eq(users.id, ctx.user.id));
    }),
    settings: userSettingsRouter,
    delete: protectedProcedure.mutation(async ({ ctx }) => {
        // Order matters. Clerk owns the live session — delete it FIRST so a
        // partial failure does NOT leave the Clerk identity intact while
        // app data is gone (which would let the user re-sign-in and silently
        // get a fresh empty account, contradicting the UI promise that the
        // email can't recreate the account).
        //
        // If Clerk delete fails: abort. The user sees a real error and can
        // retry; nothing is half-deleted.
        //
        // If Clerk succeeded but Drizzle delete fails: the user is already
        // signed out of every Weblab surface. We log loudly so the
        // orphaned app data can be cleaned manually; downstream behavior
        // is correct (the user effectively no longer exists).
        if (env.WEBLAB_AUTH_PROVIDER === 'clerk') {
            const clerkUserId = await getClerkUserId();
            if (!clerkUserId) {
                console.error(
                    '[user.delete] Clerk mode but no clerkUserId; cannot delete Clerk identity',
                    { userId: ctx.user.id },
                );
                throw new Error('Missing Clerk user id — account deletion aborted');
            }
            const client = await clerkClient();
            // Surface any Clerk failure as a real error so the UI can
            // show "delete failed, please retry" instead of an
            // inconsistent half-delete.
            await client.users.deleteUser(clerkUserId);
        }

        // Drop the auth identity. In supabase mode we MUST go through
        // GoTrue's admin endpoint so all related rows (auth.identities,
        // auth.sessions, auth.mfa_factors, auth.refresh_tokens) get cleaned
        // up. A raw `DELETE FROM auth.users` leaves those orphaned and
        // breaks re-signup with the same email. Cascade to `public.users`
        // is still triggered by the underlying auth.users row removal.
        //
        // In clerk mode the Clerk delete above already removed the upstream
        // identity, so we just drop the Drizzle-side `auth.users` row to
        // cascade cleanup of owned app data.
        try {
            if (env.WEBLAB_AUTH_PROVIDER === 'clerk') {
                await ctx.db.delete(authUsers).where(eq(authUsers.id, ctx.user.id));
            } else {
                const admin = createAdminClient();
                const { error } = await admin.auth.admin.deleteUser(ctx.user.id);
                if (error) throw error;
            }
        } catch (err) {
            console.error('[user.delete] identity delete failed; user.id=' + ctx.user.id, err);
            throw err;
        }
    }),
    /**
     * Returns the caller's capability set for the requested resource.
     * Used by the dashboard / editor to gate write affordances. The server
     * remains the trust boundary — UI gating is a hint only.
     */
    capabilities: protectedProcedure
        .input(
            z
                .object({
                    workspaceId: z.string().uuid().optional(),
                    projectId: z.string().uuid().optional(),
                })
                .refine((v) => v.workspaceId || v.projectId, {
                    message: 'capabilities requires workspaceId or projectId',
                }),
        )
        .query(async ({ ctx, input }): Promise<Capability[]> => {
            const userId = ctx.user.id;

            let workspaceId = input.workspaceId;
            let project:
                | { id: string; accessMode: ProjectAccessMode; workspaceId: string }
                | undefined;

            if (input.projectId) {
                const row = await ctx.db.query.projects.findFirst({
                    where: eq(projects.id, input.projectId),
                    columns: { id: true, workspaceId: true, accessMode: true },
                });
                if (!row?.workspaceId) return [];
                project = {
                    id: row.id,
                    accessMode: row.accessMode,
                    workspaceId: row.workspaceId,
                };
                workspaceId = row.workspaceId;
            }

            if (!workspaceId) return [];

            const ws = await ctx.db.query.workspaces.findFirst({
                where: eq(workspaces.id, workspaceId),
                columns: { id: true, createdByUserId: true },
            });
            if (!ws) return [];

            const wsMembership = await ctx.db.query.workspaceMembers.findFirst({
                where: and(
                    eq(workspaceMembers.workspaceId, ws.id),
                    eq(workspaceMembers.userId, userId),
                ),
                columns: { role: true },
            });

            let projectRole: ProjectMemberRole | null = null;
            if (project) {
                const pm = await ctx.db.query.userProjects.findFirst({
                    where: and(
                        eq(userProjects.projectId, project.id),
                        eq(userProjects.userId, userId),
                    ),
                    columns: { memberRole: true },
                });
                projectRole = pm?.memberRole ?? null;
            }

            const resource = {
                workspace: { id: ws.id, createdByUserId: ws.createdByUserId },
                workspaceRole: (wsMembership?.role as WorkspaceRole | undefined) ?? null,
                project,
                projectRole,
            };

            return CAPABILITIES.filter((cap) => can(cap, resource));
        }),
});

function getUserName(authUser: SupabaseUser) {
    const meta = authUser.user_metadata as Record<string, string | undefined>;
    const displayName: string | undefined =
        meta.name ??
        meta.display_name ??
        meta.full_name ??
        meta.first_name ??
        meta.last_name ??
        meta.given_name ??
        meta.family_name;
    const { firstName, lastName } = extractNames(displayName ?? '');
    return {
        displayName: displayName ?? '',
        firstName,
        lastName,
    };
}
