import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internal } from './_generated/api';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { audit } from './lib/audit';
import { vProjectAccessMode } from './lib/enums';
import { getOptionalUser, requireCap, requireUser } from './lib/permissions';
import { resolvePersonalWorkspaceId } from './lib/personalWorkspace';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_PROJECTS_LIMIT = 200;

const PROJECT_ROLE_RANK: Record<Doc<'projectMembers'>['role'], number> = {
    manager: 0,
    editor: 1,
    reviewer: 2,
    viewer: 3,
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function isProjectMember(
    ctx: QueryCtx | MutationCtx,
    projectId: Id<'projects'>,
    userId: Id<'users'>,
): Promise<boolean> {
    const pm = await ctx.db
        .query('projectMembers')
        .withIndex('by_project_user', (q) => q.eq('projectId', projectId).eq('userId', userId))
        .unique();
    return !!pm;
}

async function loadProjectListCard(ctx: QueryCtx, project: Doc<'projects'>) {
    const defaultBranch = await ctx.db
        .query('branches')
        .withIndex('by_project_default', (q) =>
            q.eq('projectId', project._id).eq('isDefault', true),
        )
        .first();
    let defaultBranchFrames: Doc<'frames'>[] = [];
    if (defaultBranch) {
        defaultBranchFrames = await ctx.db
            .query('frames')
            .withIndex('by_branch', (q) => q.eq('branchId', defaultBranch._id))
            .collect();
    }
    const previewDomain = await ctx.db
        .query('previewDomains')
        .withIndex('by_project', (q) => q.eq('projectId', project._id))
        .first();
    const publishedDomain = await ctx.db
        .query('projectCustomDomains')
        .withIndex('by_project', (q) => q.eq('projectId', project._id))
        .first();

    const previewDomainStr = previewDomain?.fullDomain ?? null;
    const publishedDomainStr = publishedDomain?.fullDomain ?? null;
    const previewUrl = previewDomainStr ? `https://${previewDomainStr}` : null;
    const publishedUrl = publishedDomainStr ? `https://${publishedDomainStr}` : null;

    // sandboxPreviewUrl: prefer frame URL when present (resolved port);
    // fallback handled by the client because we no longer want to import the
    // framework adapter into Convex.
    const frameUrl = defaultBranchFrames[0]?.url ?? null;
    const sandboxPreviewUrl = defaultBranch?.sandboxId ? (frameUrl ?? null) : null;

    return {
        ...project,
        defaultBranch,
        defaultBranchSandboxId: defaultBranch?.sandboxId ?? null,
        defaultBranchFrameUrl: frameUrl,
        previewUrl,
        publishedUrl,
        siteUrl: publishedUrl ?? previewUrl ?? null,
        sandboxPreviewUrl,
    };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Boolean view-access check — does the caller have any project membership row?
 * Used by the editor route guard. Cheaper than requireCap, which also walks
 * workspace membership.
 */
export const hasAccess = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        const user = await getOptionalUser(ctx);
        if (!user) return false;
        const project = await ctx.db.get(projectId);
        if (!project) return false;
        return isProjectMember(ctx, projectId, user._id);
    },
});

/**
 * Lists projects the caller is a project_member of. Optional filters:
 *   - workspaceId: filter to projects in a specific workspace
 *   - excludeProjectId: omit the currently-open project (used by sidebar)
 */
export const list = query({
    args: {
        limit: v.optional(v.number()),
        excludeProjectId: v.optional(v.id('projects')),
        workspaceId: v.optional(v.id('workspaces')),
    },
    handler: async (ctx, { limit, excludeProjectId, workspaceId }) => {
        const user = await getOptionalUser(ctx);
        if (!user) return [];
        const effectiveLimit = Math.min(limit ?? MAX_PROJECTS_LIMIT, MAX_PROJECTS_LIMIT);

        const memberships = await ctx.db
            .query('projectMembers')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .collect();

        // Fetch all project docs in parallel — serial `ctx.db.get` for users
        // with N memberships costs N sequential round-trips.
        const filteredMemberships = excludeProjectId
            ? memberships.filter((m) => m.projectId !== excludeProjectId)
            : memberships;
        const fetched = await Promise.all(
            filteredMemberships.map((m) => ctx.db.get(m.projectId)),
        );
        const projects: Doc<'projects'>[] = [];
        for (const project of fetched) {
            if (!project) continue;
            if (workspaceId && project.workspaceId !== workspaceId) continue;
            projects.push(project);
            if (projects.length >= effectiveLimit) break;
        }

        const cards = await Promise.all(projects.map((p) => loadProjectListCard(ctx, p)));
        return cards.sort((a, b) => b.updatedAt - a.updatedAt);
    },
});

/**
 * Lists projects the caller is an explicit project_member of where the
 * project's workspace is NOT one the caller is a workspace member of.
 * These are "shared with me" projects.
 */
export const sharedWithMe = query({
    args: {},
    handler: async (ctx) => {
        const user = await requireUser(ctx);
        const memberships = await ctx.db
            .query('projectMembers')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .take(MAX_PROJECTS_LIMIT);

        const myWorkspaceMemberships = await ctx.db
            .query('workspaceMembers')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .collect();
        const myWorkspaceIds = new Set(myWorkspaceMemberships.map((m) => m.workspaceId));

        const projects: Doc<'projects'>[] = [];
        for (const m of memberships) {
            const project = await ctx.db.get(m.projectId);
            if (!project) continue;
            if (myWorkspaceIds.has(project.workspaceId)) continue;
            projects.push(project);
        }

        const cards = await Promise.all(projects.map((p) => loadProjectListCard(ctx, p)));
        return cards.sort((a, b) => b.updatedAt - a.updatedAt);
    },
});

/**
 * Returns one project document; null if not found.
 */
export const get = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        const ctxCap = await requireCap(ctx, 'project.view', { projectId });
        return ctxCap.project!;
    },
});

/**
 * One-shot bootstrap query used by the editor route. Returns project,
 * branches+frames, canvas+userCanvas+frames, recent conversations, and any
 * pending creation request.
 */
export const getEditorBootstrap = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        const { user, project } = await requireCap(ctx, 'project.view', {
            projectId,
        });
        if (!project) return null;

        const [dbBranches, dbCanvas, dbConversations, creationRequest] = await Promise.all([
            ctx.db
                .query('branches')
                .withIndex('by_project', (q) => q.eq('projectId', projectId))
                .collect(),
            ctx.db
                .query('canvases')
                .withIndex('by_project', (q) => q.eq('projectId', projectId))
                .first(),
            ctx.db
                .query('conversations')
                .withIndex('by_project_updated', (q) => q.eq('projectId', projectId))
                .order('desc')
                .take(200),
            ctx.db
                .query('projectCreateRequests')
                .withIndex('by_project', (q) => q.eq('projectId', projectId))
                .filter((q) => q.eq(q.field('status'), 'pending'))
                .first(),
        ]);

        const branchesWithFrames = await Promise.all(
            dbBranches.map(async (branch) => {
                const frames = await ctx.db
                    .query('frames')
                    .withIndex('by_branch', (q) => q.eq('branchId', branch._id))
                    .collect();
                return { ...branch, frames };
            }),
        );

        let canvas: {
            canvas: Doc<'canvases'>;
            userCanvas: Doc<'userCanvases'> | null;
            frames: Doc<'frames'>[];
        } | null = null;
        if (dbCanvas) {
            const [frames, userCanvas] = await Promise.all([
                ctx.db
                    .query('frames')
                    .withIndex('by_canvas', (q) => q.eq('canvasId', dbCanvas._id))
                    .collect(),
                ctx.db
                    .query('userCanvases')
                    .withIndex('by_user_canvas', (q) =>
                        q.eq('userId', user._id).eq('canvasId', dbCanvas._id),
                    )
                    .unique(),
            ]);
            canvas = { canvas: dbCanvas, userCanvas: userCanvas ?? null, frames };
        }

        return {
            project,
            branches: branchesWithFrames,
            canvas,
            conversations: dbConversations,
            creationRequest: creationRequest ?? null,
        };
    },
});

/**
 * Returns the project, its canvas, the caller's userCanvas view, and frames
 * in one query. Used by the canvas tab.
 */
export const getProjectWithCanvas = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        const { user, project } = await requireCap(ctx, 'project.view', {
            projectId,
        });
        if (!project) return null;

        const canvas = await ctx.db
            .query('canvases')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .first();
        if (!canvas) {
            return {
                project,
                userCanvas: null,
                frames: [] as Doc<'frames'>[],
                canvas: null,
            };
        }

        const [frames, userCanvas] = await Promise.all([
            ctx.db
                .query('frames')
                .withIndex('by_canvas', (q) => q.eq('canvasId', canvas._id))
                .collect(),
            ctx.db
                .query('userCanvases')
                .withIndex('by_user_canvas', (q) =>
                    q.eq('userId', user._id).eq('canvasId', canvas._id),
                )
                .unique(),
        ]);

        return { project, canvas, userCanvas: userCanvas ?? null, frames };
    },
});

/**
 * Lightweight project list — used by sidebar "preview" cards. Returns plain
 * project docs only (no joins, no domain lookups).
 */
export const getPreviewProjects = query({
    args: { userId: v.optional(v.id('users')) },
    handler: async (ctx, { userId }) => {
        const user = await requireUser(ctx);
        if (userId && userId !== user._id) {
            throw new Error("FORBIDDEN: cannot access another user's preview projects");
        }
        const memberships = await ctx.db
            .query('projectMembers')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .collect();
        const out: Doc<'projects'>[] = [];
        for (const m of memberships) {
            const project = await ctx.db.get(m.projectId);
            if (project) out.push(project);
        }
        return out;
    },
});

/**
 * Aggregated access list for a project's settings page.
 *   - workspaceInherited: ws owners/admins with recovery access NOT also explicit
 *     project members.
 *   - directMembers: explicit project_members.
 *   - pendingInvites: still-pending invitations.
 */
export const listAccess = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        const { project } = await requireCap(ctx, 'project.view', { projectId });
        if (!project) throw new Error('NOT_FOUND: project');

        const direct = await ctx.db
            .query('projectMembers')
            .withIndex('by_project_user', (q) => q.eq('projectId', projectId))
            .collect();
        const directIds = new Set(direct.map((d) => d.userId));

        const directMembers = (
            await Promise.all(
                direct.map(async (d) => {
                    const u = await ctx.db.get(d.userId);
                    if (!u) return null;
                    return {
                        userId: u._id,
                        displayName: u.displayName ?? u.firstName ?? null,
                        email: u.email ?? null,
                        avatarUrl: u.avatarUrl ?? null,
                        memberRole: d.role,
                    };
                }),
            )
        )
            .filter((d): d is NonNullable<typeof d> => d !== null)
            .sort((a, b) => {
                const rankDiff =
                    (PROJECT_ROLE_RANK[a.memberRole] ?? 99) -
                    (PROJECT_ROLE_RANK[b.memberRole] ?? 99);
                if (rankDiff !== 0) return rankDiff;
                return (a.displayName ?? a.email ?? '').localeCompare(
                    b.displayName ?? b.email ?? '',
                );
            });

        const wsMembers = await ctx.db
            .query('workspaceMembers')
            .withIndex('by_workspace_user', (q) => q.eq('workspaceId', project.workspaceId))
            .collect();
        const wsAdmins = wsMembers.filter((m) => m.role === 'owner' || m.role === 'admin');
        const workspaceInherited = (
            await Promise.all(
                wsAdmins
                    .filter((m) => !directIds.has(m.userId))
                    .map(async (m) => {
                        const u = await ctx.db.get(m.userId);
                        if (!u) return null;
                        return {
                            userId: u._id,
                            displayName: u.displayName ?? u.firstName ?? null,
                            email: u.email ?? null,
                            avatarUrl: u.avatarUrl ?? null,
                            workspaceRole: m.role,
                        };
                    }),
            )
        )
            .filter((m): m is NonNullable<typeof m> => m !== null)
            .sort((a, b) => {
                if (a.workspaceRole === b.workspaceRole) {
                    return (a.displayName ?? a.email ?? '').localeCompare(
                        b.displayName ?? b.email ?? '',
                    );
                }
                return a.workspaceRole === 'owner' ? -1 : 1;
            });

        const now = Date.now();
        const allInvites = await ctx.db
            .query('projectInvitations')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .collect();
        const pendingInvites = allInvites
            .filter((inv) => inv.status === 'pending' && inv.expiresAt > now)
            .map((inv) => ({
                id: inv._id,
                email: inv.inviteeEmail,
                memberRole: inv.memberRole ?? 'viewer',
                invitedAt: inv._creationTime,
                expiresAt: inv.expiresAt,
            }));

        return { workspaceInherited, directMembers, pendingInvites };
    },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Creates a project from an externally-provisioned sandbox. The action layer
 * (projectActions.ts) is responsible for calling the sandbox provider; this
 * mutation only writes the DB graph.
 *
 * TODO(sandbox-trust): `sandboxId` and `sandboxUrl` are accepted from the
 * client. A caller can supply another tenant's sandboxId, causing their new
 * project's branch + frames to iframe-embed (and, via the shared CSB_API_KEY,
 * issue file ops against) that tenant's sandbox. The legitimate flow is
 * /projects/import/* which provisions a new sandbox first, but a hand-crafted
 * client can pass an arbitrary id. Move the mutation behind an internalMutation
 * + an action that derives sandboxId from a freshly provisioned sandbox
 * (matching the branchActions.fork / createBlank pattern). Until then any
 * import path should validate sandbox ownership server-side.
 */
export const create = mutation({
    args: {
        name: v.string(),
        description: v.optional(v.string()),
        tags: v.optional(v.array(v.string())),
        sandboxId: v.string(),
        sandboxUrl: v.string(),
        sandboxRuntime: v.optional(
            v.object({
                provider: v.union(v.literal('code_sandbox'), v.literal('vercel_sandbox')),
                snapshotId: v.optional(v.string()),
                port: v.optional(v.number()),
                devCommand: v.optional(v.string()),
                runtime: v.optional(v.string()),
            }),
        ),
        framework: v.optional(v.string()),
        workspaceId: v.optional(v.id('workspaces')),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        if (args.sandboxId.length === 0) throw new Error('BAD_REQUEST: sandboxId');
        if (args.sandboxUrl.length === 0) throw new Error('BAD_REQUEST: sandboxUrl');

        const workspaceId = args.workspaceId
            ? args.workspaceId
            : await resolvePersonalWorkspaceId(ctx, user);
        if (args.workspaceId) {
            await requireCap(ctx, 'project.create', {
                workspaceId: args.workspaceId,
            });
        }

        const now = Date.now();
        const projectId = await ctx.db.insert('projects', {
            name: args.name,
            description: args.description,
            tags: args.tags ?? [],
            updatedAt: now,
            storageMode: 'cloud',
            runtimeMetadata: { framework: args.framework ?? 'nextjs' },
            workspaceId,
            createdByUserId: user._id,
            accessMode: 'workspace',
            sandboxId: args.sandboxId,
            sandboxUrl: args.sandboxUrl,
        });

        const branchId = await ctx.db.insert('branches', {
            projectId,
            name: 'main',
            description: 'Default branch',
            isDefault: true,
            updatedAt: now,
            sandboxId: args.sandboxId,
            runtimeType: 'cloud',
            runtimeMetadata: {
                cloud: {
                    // Vercel is the only runtime since 2026-05-24. Default
                    // matches the new code path; rows that arrived earlier
                    // still carry 'code_sandbox' and are read by legacy
                    // editor branches until Phase 2 collapse.
                    provider: args.sandboxRuntime?.provider ?? 'vercel_sandbox',
                    sandboxId: args.sandboxId,
                    previewUrl: args.sandboxUrl,
                    snapshotId: args.sandboxRuntime?.snapshotId,
                    port: args.sandboxRuntime?.port,
                    devCommand: args.sandboxRuntime?.devCommand,
                    runtime: args.sandboxRuntime?.runtime,
                },
            },
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

        // Default breakpoint group — 3 frames (Desktop / Tablet / Phone)
        const defaultFrames = [
            { name: 'Desktop', width: 1440, height: 900, order: 0 },
            { name: 'Tablet', width: 768, height: 1024, order: 1 },
            { name: 'Phone', width: 375, height: 812, order: 2 },
        ];
        const groupId = crypto.randomUUID();
        let xOffset = 0;
        for (const f of defaultFrames) {
            await ctx.db.insert('frames', {
                canvasId,
                branchId,
                url: args.sandboxUrl,
                x: xOffset,
                y: 0,
                width: f.width,
                height: f.height,
                groupId,
                breakpointId: f.name.toLowerCase(),
                breakpointName: f.name,
                breakpointOrder: f.order,
            });
            xOffset += f.width + 40;
        }

        await ctx.db.insert('conversations', {
            projectId,
            displayName: 'New conversation',
            updatedAt: now,
        });

        return (await ctx.db.get(projectId))!;
    },
});

/**
 * Create a LOCAL-runtime project whose files live on the user's disk (desktop
 * only). Mirrors `create` but skips ALL sandbox provisioning: the branch carries
 * `runtimeType: 'local'` + `runtimeMetadata.local = { rootPath, devCommand?, port? }`
 * and frames point at the local dev server (`http://localhost:<port>`). The
 * editor's NodeFsProvider — selected by session.ts on `runtime.type === 'local'`
 * — performs every file op and boots the dev server over the desktop IPC bridge.
 *
 * `port` should be inferred client-side from the folder's package.json dev
 * script so the frame URL matches the port the dev server actually binds.
 */
export const createLocal = mutation({
    args: {
        name: v.string(),
        rootPath: v.string(),
        description: v.optional(v.string()),
        tags: v.optional(v.array(v.string())),
        framework: v.optional(v.string()),
        devCommand: v.optional(v.string()),
        port: v.optional(v.number()),
        workspaceId: v.optional(v.id('workspaces')),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        if (args.rootPath.length === 0) throw new Error('BAD_REQUEST: rootPath');

        const workspaceId = args.workspaceId
            ? args.workspaceId
            : await resolvePersonalWorkspaceId(ctx, user);
        if (args.workspaceId) {
            await requireCap(ctx, 'project.create', { workspaceId: args.workspaceId });
        }

        const port =
            typeof args.port === 'number' && args.port > 0 && args.port <= 65535 ? args.port : 3000;
        const previewUrl = `http://localhost:${port}`;
        const now = Date.now();

        const projectId = await ctx.db.insert('projects', {
            name: args.name,
            description: args.description,
            tags: args.tags ?? [],
            updatedAt: now,
            storageMode: 'local',
            runtimeMetadata: { framework: args.framework ?? 'nextjs' },
            workspaceId,
            createdByUserId: user._id,
            accessMode: 'workspace',
        });

        // The branch row requires a `sandboxId` string; local branches never use
        // it (session.ts reads `runtime.local.rootPath`), so carry a synthetic id.
        const branchId = await ctx.db.insert('branches', {
            projectId,
            name: 'main',
            description: 'Default branch',
            isDefault: true,
            updatedAt: now,
            sandboxId: `local:${projectId}`,
            runtimeType: 'local',
            runtimeMetadata: {
                local: {
                    rootPath: args.rootPath,
                    devCommand: args.devCommand,
                    port,
                },
            },
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

        const defaultFrames = [
            { name: 'Desktop', width: 1440, height: 900, order: 0 },
            { name: 'Tablet', width: 768, height: 1024, order: 1 },
            { name: 'Phone', width: 375, height: 812, order: 2 },
        ];
        const groupId = crypto.randomUUID();
        let xOffset = 0;
        for (const f of defaultFrames) {
            await ctx.db.insert('frames', {
                canvasId,
                branchId,
                url: previewUrl,
                x: xOffset,
                y: 0,
                width: f.width,
                height: f.height,
                groupId,
                breakpointId: f.name.toLowerCase(),
                breakpointName: f.name,
                breakpointOrder: f.order,
            });
            xOffset += f.width + 40;
        }

        await ctx.db.insert('conversations', {
            projectId,
            displayName: 'New conversation',
            updatedAt: now,
        });

        return (await ctx.db.get(projectId))!;
    },
});

/**
 * Internal mutation used by createBlank action — same DB graph build, but
 * accepts pre-resolved sandbox metadata from the action and skips the
 * outer requireUser (action passes userId after its own auth check).
 */
export const _insertProjectGraph = internalMutation({
    args: {
        userId: v.id('users'),
        workspaceId: v.id('workspaces'),
        name: v.string(),
        description: v.string(),
        tags: v.array(v.string()),
        framework: v.string(),
        sandboxId: v.string(),
        sandboxUrl: v.string(),
        cloudProvider: v.union(v.literal('code_sandbox'), v.literal('vercel_sandbox')),
        snapshotId: v.optional(v.string()),
        port: v.optional(v.number()),
        devCommand: v.optional(v.string()),
        runtime: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Authorization guard (defense-in-depth): some callers pass a
        // client-supplied workspaceId (e.g. projectActions.createBlank reads it
        // from localStorage), so verify the acting user actually belongs to
        // that workspace before inserting the project graph. Without this a
        // signed-in user could create projects inside any workspace whose id
        // they know (IDOR). The public projects.create path already runs
        // requireCap; this re-check is cheap and idempotent for it.
        const ws = await ctx.db.get(args.workspaceId);
        if (!ws) throw new Error('NOT_FOUND: workspace');
        if (ws.createdByUserId !== args.userId) {
            const membership = await ctx.db
                .query('workspaceMembers')
                .withIndex('by_workspace_user', (q) =>
                    q.eq('workspaceId', args.workspaceId).eq('userId', args.userId),
                )
                .unique();
            if (!membership) throw new Error('FORBIDDEN: workspace');
        }

        const now = Date.now();
        const projectId = await ctx.db.insert('projects', {
            name: args.name,
            description: args.description,
            tags: args.tags,
            updatedAt: now,
            storageMode: 'cloud',
            runtimeMetadata: { framework: args.framework },
            workspaceId: args.workspaceId,
            createdByUserId: args.userId,
            accessMode: 'workspace',
            sandboxId: args.sandboxId,
            sandboxUrl: args.sandboxUrl,
        });

        const branchId = await ctx.db.insert('branches', {
            projectId,
            name: 'main',
            description: 'Default branch',
            isDefault: true,
            updatedAt: now,
            sandboxId: args.sandboxId,
            runtimeType: 'cloud',
            runtimeMetadata: {
                cloud: {
                    provider: args.cloudProvider,
                    sandboxId: args.sandboxId,
                    previewUrl: args.sandboxUrl,
                    snapshotId: args.snapshotId,
                    port: args.port,
                    devCommand: args.devCommand,
                    runtime: args.runtime,
                },
            },
        });

        await ctx.db.insert('projectMembers', {
            projectId,
            userId: args.userId,
            role: 'manager',
            updatedAt: now,
        });

        const canvasId = await ctx.db.insert('canvases', { projectId });
        await ctx.db.insert('userCanvases', {
            userId: args.userId,
            canvasId,
            scale: 0.56,
            x: 120,
            y: 120,
        });

        const defaultFrames = [
            { name: 'Desktop', width: 1440, height: 900, order: 0 },
            { name: 'Tablet', width: 768, height: 1024, order: 1 },
            { name: 'Phone', width: 375, height: 812, order: 2 },
        ];
        const groupId = crypto.randomUUID();
        let xOffset = 0;
        for (const f of defaultFrames) {
            await ctx.db.insert('frames', {
                canvasId,
                branchId,
                url: args.sandboxUrl,
                x: xOffset,
                y: 0,
                width: f.width,
                height: f.height,
                groupId,
                breakpointId: f.name.toLowerCase(),
                breakpointName: f.name,
                breakpointOrder: f.order,
            });
            xOffset += f.width + 40;
        }

        await ctx.db.insert('conversations', {
            projectId,
            displayName: 'New conversation',
            updatedAt: now,
        });

        return projectId;
    },
});

/**
 * Action-side authorization helper: throws FORBIDDEN if the caller cannot
 * create projects in the supplied workspace. Used by
 * `projectActions.createBlank` BEFORE the costly CodeSandbox / Vercel
 * Sandbox provisioning step so a workspace viewer (or non-member) can't
 * burn paid sandbox quota and pollute another tenant's workspace.
 */
export const _requireProjectCreateCap = internalQuery({
    args: { workspaceId: v.id('workspaces') },
    handler: async (ctx, { workspaceId }) => {
        await requireCap(ctx, 'project.create', { workspaceId });
        return null;
    },
});

/**
 * Action-side authorization helper: throws FORBIDDEN if the caller cannot
 * update the supplied project. Used by actions like `captureScreenshot`
 * that perform costly third-party calls (Firecrawl + sharp + Convex
 * storage) before persisting — gating on project.update upfront prevents
 * workspace viewers from burning Firecrawl/storage quota on projects they
 * cannot write to.
 */
export const _requireProjectUpdateCap = internalQuery({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.update', { projectId });
        return null;
    },
});

/**
 * Internal helper for actions to look up the personal workspace for a user.
 */
export const _resolvePersonalWorkspaceForAction = internalMutation({
    args: { userId: v.id('users') },
    handler: async (ctx, { userId }) => {
        const user = await ctx.db.get(userId);
        if (!user) throw new Error('NOT_FOUND: user');
        return resolvePersonalWorkspaceId(ctx, user);
    },
});

/**
 * Internal helper used by createBlank action to count existing same-day
 * projects within a workspace (for unique-name suffixing).
 */
export const _countProjectsByNamePrefix = internalMutation({
    args: { workspaceId: v.id('workspaces'), namePrefix: v.string() },
    handler: async (ctx, { workspaceId, namePrefix }) => {
        const projects = await ctx.db
            .query('projects')
            .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
            .collect();
        return projects.filter((p) => p.name.startsWith(namePrefix)).length;
    },
});

/**
 * Update project metadata. Partial-patch shape — only present fields are
 * applied.
 */
export const update = mutation({
    args: {
        projectId: v.id('projects'),
        name: v.optional(v.string()),
        description: v.optional(v.string()),
        tags: v.optional(v.array(v.string())),
        previewImgUrl: v.optional(v.union(v.string(), v.null())),
        previewImgPath: v.optional(v.union(v.string(), v.null())),
        previewImgBucket: v.optional(v.union(v.string(), v.null())),
        previewImgStorageId: v.optional(v.union(v.id('_storage'), v.null())),
        updatedPreviewImgAt: v.optional(v.union(v.number(), v.null())),
        sandboxUrl: v.optional(v.string()),
        runtimeMetadata: v.optional(v.any()),
    },
    handler: async (ctx, { projectId, ...rest }) => {
        await requireCap(ctx, 'project.update', { projectId });

        if (rest.name !== undefined) {
            const trimmed = rest.name.trim();
            if (trimmed.length === 0) {
                throw new Error('BAD_REQUEST: Project name cannot be empty');
            }
            rest.name = trimmed;
        }

        // `runtimeMetadata` is typed `v.any()` for forward-compat with future
        // sandbox-provider shapes. To prevent a partial patch (e.g. just
        // `{ cloud: { previewUrl } }`) from wiping `framework`, merge against
        // the existing value rather than overwriting it.
        let runtimeMetadataPatch: unknown;
        if (rest.runtimeMetadata !== undefined) {
            const existing = await ctx.db.get(projectId);
            const existingMeta = (existing?.runtimeMetadata ?? {}) as Record<string, unknown>;
            const incoming = (rest.runtimeMetadata ?? {}) as Record<string, unknown>;
            runtimeMetadataPatch = { ...existingMeta, ...incoming };
            delete (rest as Record<string, unknown>).runtimeMetadata;
        }

        const patch: Partial<Doc<'projects'>> = { updatedAt: Date.now() };
        for (const [k, value] of Object.entries(rest)) {
            if (value === undefined) continue;
            (patch as Record<string, unknown>)[k] = value === null ? undefined : value;
        }
        if (runtimeMetadataPatch !== undefined) {
            (patch as Record<string, unknown>).runtimeMetadata = runtimeMetadataPatch;
        }
        await ctx.db.patch(projectId, patch);
        return (await ctx.db.get(projectId))!;
    },
});

export const _replaceBranchSandbox = internalMutation({
    args: {
        projectId: v.id('projects'),
        branchId: v.id('branches'),
        sandboxId: v.string(),
        previewUrl: v.string(),
        snapshotId: v.string(),
        provider: v.union(v.literal('vercel_sandbox')),
        port: v.optional(v.number()),
        devCommand: v.optional(v.string()),
        runtime: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const branch = await ctx.db.get(args.branchId);
        if (!branch || branch.projectId !== args.projectId) {
            throw new Error('NOT_FOUND: branch');
        }
        await requireCap(ctx, 'project.update', { projectId: args.projectId });

        const now = Date.now();
        await ctx.db.patch(args.projectId, {
            updatedAt: now,
            sandboxId: args.sandboxId,
            sandboxUrl: args.previewUrl,
        });
        const runtimeMetadata: Record<string, unknown> =
            branch.runtimeMetadata && typeof branch.runtimeMetadata === 'object'
                ? (branch.runtimeMetadata as Record<string, unknown>)
                : {};

        await ctx.db.patch(args.branchId, {
            updatedAt: now,
            sandboxId: args.sandboxId,
            runtimeMetadata: {
                ...runtimeMetadata,
                cloud: {
                    provider: args.provider,
                    sandboxId: args.sandboxId,
                    previewUrl: args.previewUrl,
                    snapshotId: args.snapshotId,
                    port: args.port,
                    devCommand: args.devCommand,
                    runtime: args.runtime,
                },
            },
        });

        const frames = await ctx.db
            .query('frames')
            .withIndex('by_branch', (q) => q.eq('branchId', args.branchId))
            .collect();
        await Promise.all(frames.map((frame) => ctx.db.patch(frame._id, { url: args.previewUrl })));

        return {
            projectId: args.projectId,
            branchId: args.branchId,
            sandboxId: args.sandboxId,
            previewUrl: args.previewUrl,
        };
    },
});

export const addTag = mutation({
    args: { projectId: v.id('projects'), tag: v.string() },
    handler: async (ctx, { projectId, tag }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const project = await ctx.db.get(projectId);
        if (!project) throw new Error('NOT_FOUND: project');
        const currentTags = project.tags ?? [];
        const newTags = currentTags.includes(tag) ? currentTags : [...currentTags, tag];
        await ctx.db.patch(projectId, { tags: newTags, updatedAt: Date.now() });
        return { success: true, tags: newTags };
    },
});

export const removeTag = mutation({
    args: { projectId: v.id('projects'), tag: v.string() },
    handler: async (ctx, { projectId, tag }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const project = await ctx.db.get(projectId);
        if (!project) throw new Error('NOT_FOUND: project');
        const currentTags = project.tags ?? [];
        const newTags = currentTags.filter((t) => t !== tag);
        await ctx.db.patch(projectId, { tags: newTags, updatedAt: Date.now() });
        return { success: true, tags: newTags };
    },
});

/**
 * Hard-delete a project. Cascades to canvas/frames/branches/settings/
 * invitations/members/pins/access/createRequests/conversations/comments/
 * cms/domains/deployments/skills via internal.cascade.deleteProjectCascade.
 */
export const remove = mutation({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.delete', { projectId });
        await ctx.runMutation(internal.internal.cascade.deleteProjectCascade, {
            projectId,
        });
        return { ok: true } as const;
    },
});

/**
 * Change a project's access mode (workspace vs restricted).
 */
export const setAccessMode = mutation({
    args: {
        projectId: v.id('projects'),
        accessMode: vProjectAccessMode,
    },
    handler: async (ctx, { projectId, accessMode }) => {
        const { user, project } = await requireCap(ctx, 'project.manage_access_mode', {
            projectId,
        });
        if (!project) throw new Error('NOT_FOUND: project');
        await ctx.db.patch(projectId, { accessMode, updatedAt: Date.now() });
        await audit(ctx, {
            event: 'project.access_mode_changed',
            projectId,
            workspaceId: project.workspaceId,
            actorUserId: user._id,
            payload: { accessMode },
        });
        return (await ctx.db.get(projectId))!;
    },
});
