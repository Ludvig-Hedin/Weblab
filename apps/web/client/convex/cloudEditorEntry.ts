import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { isCloudEditorRuntime } from './lib/cloudEditor';
import { getCloudScopedIdentity } from './lib/cloudInvitationIdentity';
import { requireExplicitCloudProjectCapability } from './lib/cloudProjectAdmission';
import { getUserByClerkIdSafe } from './lib/permissions';

const MAX_BRANCHES = 100;
const MAX_FRAMES = 1000;
export type CloudEditorEntry = {
    user: Doc<'users'>;
    bootstrap: {
        project: Doc<'projects'>;
        branches: Array<Doc<'branches'> & { frames: Doc<'frames'>[] }>;
        canvas: {
            canvas: Doc<'canvases'>;
            userCanvas: Doc<'userCanvases'> | null;
            frames: Doc<'frames'>[];
        } | null;
        conversations: [];
        creationRequest: null;
    };
    capabilities: ['project.view'];
};

/** Explicit cloud membership only, regardless of either application's global allowlist. */
export const entry = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }): Promise<CloudEditorEntry | null> => {
        const identity = await getCloudScopedIdentity(ctx);
        if (!identity) return null;
        const user = await getUserByClerkIdSafe(ctx, identity.subject);
        if (!user || user.clerkUserId !== identity.subject) return null;
        const membership = await ctx.db
            .query('projectMembers')
            .withIndex('by_project_user', (q) =>
                q.eq('projectId', projectId).eq('userId', user._id),
            )
            .unique();
        const grant = await ctx.db
            .query('cloudEditorGrants')
            .withIndex('by_projectId_userId', (q) =>
                q.eq('projectId', projectId).eq('userId', user._id),
            )
            .unique();
        if (!membership || !grant) return null;
        const project = await ctx.db.get(projectId);
        if (!project) return null;
        const candidates = await ctx.db
            .query('branches')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .take(MAX_BRANCHES + 1);
        if (candidates.length > MAX_BRANCHES) throw new Error('CLOUD_ENTRY_LIMIT');
        const branches: Doc<'branches'>[] = [];
        for (const branch of candidates) {
            if (!isCloudEditorRuntime(branch.runtimeMetadata)) continue;
            const state = await ctx.db
                .query('cloudEditorStates')
                .withIndex('by_branchId', (q) => q.eq('branchId', branch._id))
                .unique();
            if (
                state?.version !== 1 ||
                state.projectId !== projectId ||
                state.workspaceId !== project.workspaceId
            )
                continue;
            const access = await requireExplicitCloudProjectCapability(ctx, {
                projectId,
                branchId: branch._id,
            });
            if (access.user._id !== user._id) throw new Error('CLOUD_ACTOR_CHANGED');
            branches.push(branch);
        }
        if (!branches.length) return null;
        const admittedIds = new Set<Id<'branches'>>(branches.map((branch) => branch._id));
        const dbCanvas = await ctx.db
            .query('canvases')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .first();
        let canvas: CloudEditorEntry['bootstrap']['canvas'] = null;
        if (dbCanvas) {
            const candidates = await ctx.db
                .query('frames')
                .withIndex('by_canvas', (q) => q.eq('canvasId', dbCanvas._id))
                .take(MAX_FRAMES + 1);
            if (candidates.length > MAX_FRAMES) throw new Error('CLOUD_ENTRY_LIMIT');
            const frames = candidates.filter(
                (frame) => frame.branchId && admittedIds.has(frame.branchId),
            );
            const userCanvas = await ctx.db
                .query('userCanvases')
                .withIndex('by_user_canvas', (q) =>
                    q.eq('userId', user._id).eq('canvasId', dbCanvas._id),
                )
                .unique();
            canvas = { canvas: dbCanvas, userCanvas, frames };
        }
        // No conversation/creation-status query. Both frame projections come
        // from this project's canvas and the same set of admitted branches.
        return {
            user,
            bootstrap: {
                project,
                branches: branches.map((branch) => ({
                    ...branch,
                    frames: canvas?.frames.filter((frame) => frame.branchId === branch._id) ?? [],
                })),
                canvas,
                conversations: [],
                creationRequest: null,
            },
            capabilities: ['project.view'],
        };
    },
});

/** Personal viewport state only; no shared frame, branch or source mutation. */
export const upsertCanvasView = mutation({
    args: {
        projectId: v.id('projects'),
        branchId: v.id('branches'),
        actorId: v.id('users'),
        canvasId: v.id('canvases'),
        scale: v.number(),
        x: v.number(),
        y: v.number(),
        showRulers: v.optional(v.boolean()),
        showLayoutGuides: v.optional(v.boolean()),
    },
    handler: async (ctx, args): Promise<Doc<'userCanvases'>> => {
        if (
            !Number.isFinite(args.scale) ||
            args.scale <= 0 ||
            !Number.isFinite(args.x) ||
            !Number.isFinite(args.y)
        ) {
            throw new Error('CLOUD_INVALID_CANVAS_VIEW');
        }
        const { user } = await requireExplicitCloudProjectCapability(ctx, args);
        // actorId is a stale-client fence, never the source of authorization.
        // The current authenticated actor and exact scope were resolved above.
        if (user._id !== args.actorId) throw new Error('CLOUD_ACTOR_CHANGED');
        const canvas = await ctx.db.get(args.canvasId);
        if (!canvas || canvas.projectId !== args.projectId)
            throw new Error('FORBIDDEN: cloud canvas');
        const existing = await ctx.db
            .query('userCanvases')
            .withIndex('by_user_canvas', (q) => q.eq('userId', user._id).eq('canvasId', canvas._id))
            .unique();
        const position = {
            scale: args.scale,
            x: args.x,
            y: args.y,
            ...(args.showRulers === undefined ? {} : { showRulers: args.showRulers }),
            ...(args.showLayoutGuides === undefined
                ? {}
                : { showLayoutGuides: args.showLayoutGuides }),
        };
        let id: Id<'userCanvases'>;
        if (existing) {
            await ctx.db.patch(existing._id, position);
            id = existing._id;
        } else
            id = await ctx.db.insert('userCanvases', {
                userId: user._id,
                canvasId: canvas._id,
                ...position,
            });
        const result = await ctx.db.get(id);
        if (!result) throw new Error('CLOUD_CANVAS_VIEW_MISSING');
        return result;
    },
});
