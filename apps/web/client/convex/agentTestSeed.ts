/**
 * Agent QA test fixtures — internal-only, idempotent seed/reset for the
 * dedicated agent account used by the read-first agent API (convex/agentApi.ts).
 *
 * Purpose: give future Claude Code / MCP QA sessions a STABLE, isolated dataset
 * to exercise `/agent/*` against, without a real Clerk login, a browser session,
 * or any sandbox provisioning (no VERCEL_TOKEN, no cost). The fixture user is a
 * synthetic, non-Clerk identity — its id can never collide with a real signed-in
 * user, so the agent API only ever sees this test data.
 *
 * These functions are INTERNAL (not exposed to clients). Run them from the
 * Convex CLI in a trusted admin context:
 *   bunx convex run agentTestSeed:seed
 *   bunx convex run agentTestSeed:info
 *   bunx convex run agentTestSeed:reset
 *
 * After `seed`, set `WEBLAB_AGENT_USER_ID` to the returned `clerkUserId`:
 *   bunx convex env set WEBLAB_AGENT_USER_ID user_agent_qa_fixture
 *
 * The three seeded projects intentionally cover the agent API's provisioning
 * states so the QA flow can verify ready / pending(loading) / failed(error)
 * without a live sandbox:
 *   - "Agent QA · Ready Site"        → provisioning: ready  (+ completed deploy)
 *   - "Agent QA · Provisioning Site" → provisioning: pending
 *   - "Agent QA · Failed Site"       → provisioning: failed (provisioningError)
 */
import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { internalMutation, internalQuery } from './_generated/server';
import { resolvePersonalWorkspaceId } from './lib/personalWorkspace';

/**
 * Synthetic Clerk-style id for the agent account. Not a real Clerk user — the
 * agent API resolves the account purely by string match on `users.clerkUserId`,
 * and no real signed-in user can own this id. Deliberately brand-free.
 */
export const AGENT_FIXTURE_CLERK_USER_ID = 'user_agent_qa_fixture';

interface SeedProjectSpec {
    name: string;
    description: string;
    tags: string[];
    framework: 'nextjs' | 'static-html';
    /** Drives the agent API's derived provisioning state. */
    state: 'ready' | 'pending' | 'failed';
}

const SEED_PROJECTS: SeedProjectSpec[] = [
    {
        name: 'Agent QA · Ready Site',
        description: 'Provisioned fixture — preview URL present.',
        tags: ['agent-qa', 'ready'],
        framework: 'nextjs',
        state: 'ready',
    },
    {
        name: 'Agent QA · Provisioning Site',
        description: 'Pending fixture — sandbox still booting (no preview yet).',
        tags: ['agent-qa', 'pending'],
        framework: 'nextjs',
        state: 'pending',
    },
    {
        name: 'Agent QA · Failed Site',
        description: 'Failed fixture — provisioning error recorded.',
        tags: ['agent-qa', 'failed'],
        framework: 'static-html',
        state: 'failed',
    },
];

/** All tables the seed writes into a project graph, in delete-safe order. */
async function deleteProjectGraph(ctx: MutationCtx, projectId: Id<'projects'>): Promise<void> {
    const branches = await ctx.db
        .query('branches')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect();
    const branchIds = new Set(branches.map((b) => b._id));

    // Frames are keyed by canvas; canvases by project.
    const canvases = await ctx.db
        .query('canvases')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect();
    for (const canvas of canvases) {
        const frames = await ctx.db
            .query('frames')
            .withIndex('by_canvas', (q) => q.eq('canvasId', canvas._id))
            .collect();
        for (const frame of frames) {
            await ctx.db.delete(frame._id);
        }
        const userCanvases = await ctx.db
            .query('userCanvases')
            .withIndex('by_canvas', (q) => q.eq('canvasId', canvas._id))
            .collect();
        for (const uc of userCanvases) {
            await ctx.db.delete(uc._id);
        }
        await ctx.db.delete(canvas._id);
    }

    const deployments = await ctx.db
        .query('deployments')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect();
    for (const d of deployments) {
        await ctx.db.delete(d._id);
    }

    const members = await ctx.db
        .query('projectMembers')
        .withIndex('by_project_user', (q) => q.eq('projectId', projectId))
        .collect();
    for (const m of members) {
        await ctx.db.delete(m._id);
    }

    const conversations = await ctx.db
        .query('conversations')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect();
    for (const c of conversations) {
        // Delete messages first so none are left orphaned referencing a
        // deleted conversation (fixtures seed conversations without messages,
        // but reset also clears any pre-existing fixture-user data).
        const messages = await ctx.db
            .query('messages')
            .withIndex('by_conversation', (q) => q.eq('conversationId', c._id))
            .collect();
        for (const m of messages) {
            await ctx.db.delete(m._id);
        }
        await ctx.db.delete(c._id);
    }

    for (const branchId of branchIds) {
        await ctx.db.delete(branchId);
    }

    await ctx.db.delete(projectId);
}

async function getFixtureUser(ctx: MutationCtx): Promise<Doc<'users'> | null> {
    return ctx.db
        .query('users')
        .withIndex('by_clerk_user_id', (q) =>
            q.eq('clerkUserId', AGENT_FIXTURE_CLERK_USER_ID),
        )
        .unique();
}

/**
 * Idempotent. Creates (or reuses) the fixture user + personal workspace, clears
 * any prior fixture projects, then inserts the three state-covering projects.
 */
export const seed = internalMutation({
    args: {},
    handler: async (
        ctx,
    ): Promise<{
        clerkUserId: string;
        userId: Id<'users'>;
        workspaceId: Id<'workspaces'>;
        projects: { id: Id<'projects'>; name: string; state: string }[];
    }> => {
        const now = Date.now();

        let user = await getFixtureUser(ctx);
        if (!user) {
            const userId = await ctx.db.insert('users', {
                clerkUserId: AGENT_FIXTURE_CLERK_USER_ID,
                email: 'agent-qa@fixture.local',
                displayName: 'Agent QA Fixture',
                updatedAt: now,
            });
            const inserted = await ctx.db.get(userId);
            if (!inserted) throw new Error('seed: failed to read back fixture user');
            user = inserted;
        }

        const workspaceId = await resolvePersonalWorkspaceId(ctx, user);

        // Clear prior fixture projects so re-seeding is deterministic.
        const existing = await ctx.db
            .query('projects')
            .withIndex('by_created_by_user', (q) => q.eq('createdByUserId', user._id))
            .collect();
        for (const p of existing) {
            await deleteProjectGraph(ctx, p._id);
        }

        const projects: { id: Id<'projects'>; name: string; state: string }[] = [];

        for (const spec of SEED_PROJECTS) {
            const projectId = await ctx.db.insert('projects', {
                name: spec.name,
                description: spec.description,
                tags: spec.tags,
                updatedAt: now,
                storageMode: 'cloud',
                runtimeMetadata: { framework: spec.framework },
                workspaceId,
                createdByUserId: user._id,
                accessMode: 'workspace',
                ...(spec.state === 'ready'
                    ? { sandboxId: 'sbx_agentqa_ready', sandboxUrl: 'https://agent-qa-ready.example.com' }
                    : {}),
            });

            const cloud: Record<string, unknown> = { provider: 'vercel_sandbox' };
            const runtimeMetadata: Record<string, unknown> = { cloud };
            if (spec.state === 'ready') {
                cloud.sandboxId = 'sbx_agentqa_ready';
                cloud.previewUrl = 'https://agent-qa-ready.example.com';
                cloud.port = 3000;
            } else if (spec.state === 'failed') {
                runtimeMetadata.provisioningError =
                    'scaffold failed: simulated provisioning error (fixture)';
            }

            const branchId = await ctx.db.insert('branches', {
                projectId,
                name: 'main',
                description: 'Default branch',
                isDefault: true,
                updatedAt: now,
                ...(spec.state === 'ready' ? { sandboxId: 'sbx_agentqa_ready' } : {}),
                runtimeType: 'cloud',
                runtimeMetadata,
            });

            await ctx.db.insert('projectMembers', {
                projectId,
                userId: user._id,
                role: 'manager',
                updatedAt: now,
            });

            const canvasId = await ctx.db.insert('canvases', { projectId });
            await ctx.db.insert('userCanvases', {
                userId: user._id,
                canvasId,
                scale: 0.56,
                x: 120,
                y: 120,
            });

            await ctx.db.insert('conversations', {
                projectId,
                displayName: 'New conversation',
                updatedAt: now,
            });

            if (spec.state === 'ready') {
                await ctx.db.insert('deployments', {
                    requestedBy: user._id,
                    projectId,
                    sandboxId: 'sbx_agentqa_ready',
                    urls: ['https://agent-qa-ready.example.com'],
                    type: 'preview',
                    status: 'completed',
                    provider: 'vercel',
                    message: 'Fixture deployment',
                    updatedAt: now,
                });
            }

            // Reference branchId so it is clearly part of the graph (frames omitted
            // — the agent API never reads frames, so seeding them adds no coverage).
            void branchId;

            projects.push({ id: projectId, name: spec.name, state: spec.state });
        }

        return {
            clerkUserId: AGENT_FIXTURE_CLERK_USER_ID,
            userId: user._id,
            workspaceId,
            projects,
        };
    },
});

/** Read-only: report the fixture user + its project ids/states (no writes). */
export const info = internalQuery({
    args: {},
    handler: async (
        ctx,
    ): Promise<{
        clerkUserId: string;
        exists: boolean;
        userId: Id<'users'> | null;
        projectCount: number;
        projects: { id: Id<'projects'>; name: string; tags: string[] }[];
    }> => {
        const user = await ctx.db
            .query('users')
            .withIndex('by_clerk_user_id', (q) =>
                q.eq('clerkUserId', AGENT_FIXTURE_CLERK_USER_ID),
            )
            .unique();
        if (!user) {
            return {
                clerkUserId: AGENT_FIXTURE_CLERK_USER_ID,
                exists: false,
                userId: null,
                projectCount: 0,
                projects: [],
            };
        }
        const projects = await ctx.db
            .query('projects')
            .withIndex('by_created_by_user', (q) => q.eq('createdByUserId', user._id))
            .order('desc')
            .collect();
        return {
            clerkUserId: AGENT_FIXTURE_CLERK_USER_ID,
            exists: true,
            userId: user._id,
            projectCount: projects.length,
            projects: projects.map((p) => ({ id: p._id, name: p.name, tags: p.tags })),
        };
    },
});

/**
 * Read-only helper for the QA runner's IDOR check: returns the id of one project
 * NOT owned by the fixture user (or null if the deployment has only fixture
 * data). Used to exercise the agent API's PERMISSION_DENIED path without
 * hardcoding a foreign id. Dev-only convenience; never exposed to clients.
 */
export const foreignProjectIdForQa = internalQuery({
    args: {},
    handler: async (ctx): Promise<{ projectId: Id<'projects'> | null }> => {
        const fixture = await ctx.db
            .query('users')
            .withIndex('by_clerk_user_id', (q) =>
                q.eq('clerkUserId', AGENT_FIXTURE_CLERK_USER_ID),
            )
            .unique();
        const fixtureUserId = fixture?._id ?? null;

        for await (const project of ctx.db.query('projects')) {
            if (project.createdByUserId !== fixtureUserId) {
                return { projectId: project._id };
            }
        }
        return { projectId: null };
    },
});

/** Delete every fixture project graph (keeps the user + workspace). */
export const reset = internalMutation({
    args: { deleteUser: v.optional(v.boolean()) },
    handler: async (ctx, args): Promise<{ deletedProjects: number; deletedUser: boolean }> => {
        const user = await getFixtureUser(ctx);
        if (!user) return { deletedProjects: 0, deletedUser: false };

        const projects = await ctx.db
            .query('projects')
            .withIndex('by_created_by_user', (q) => q.eq('createdByUserId', user._id))
            .collect();
        for (const p of projects) {
            await deleteProjectGraph(ctx, p._id);
        }

        let deletedUser = false;
        if (args.deleteUser) {
            await ctx.db.delete(user._id);
            deletedUser = true;
        }
        return { deletedProjects: projects.length, deletedUser };
    },
});
