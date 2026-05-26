import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { vBranchRuntimeType } from './lib/enums';
import { requireCap } from './lib/permissions';

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Returns all branches for a project, each with its frames. If `onlyDefault`
 * is true, restricts to the default branch only.
 *
 * Throws NOT_FOUND when the project has zero branches (caller is expected to
 * have at least the default branch — created at project insert time).
 */
export const getByProjectId = query({
    args: {
        projectId: v.id('projects'),
        onlyDefault: v.optional(v.boolean()),
    },
    handler: async (ctx, { projectId, onlyDefault }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const branches = onlyDefault
            ? await ctx.db
                  .query('branches')
                  .withIndex('by_project_default', (q) =>
                      q.eq('projectId', projectId).eq('isDefault', true),
                  )
                  .collect()
            : await ctx.db
                  .query('branches')
                  .withIndex('by_project', (q) => q.eq('projectId', projectId))
                  .collect();

        if (branches.length === 0) {
            throw new Error('NOT_FOUND: Branches not found');
        }

        return Promise.all(
            branches.map(async (branch) => {
                const frames = await ctx.db
                    .query('frames')
                    .withIndex('by_branch', (q) => q.eq('branchId', branch._id))
                    .collect();
                return { ...branch, frames };
            }),
        );
    },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Create a branch directly from DB data. Action layer (branchActions.ts)
 * handles the sandbox provisioning + then calls this internally.
 */
export const create = mutation({
    args: {
        projectId: v.id('projects'),
        name: v.string(),
        description: v.optional(v.string()),
        isDefault: v.optional(v.boolean()),
        sandboxId: v.string(),
        runtimeType: v.optional(vBranchRuntimeType),
        runtimeMetadata: v.optional(v.any()),
        gitBranch: v.optional(v.string()),
        gitCommitSha: v.optional(v.string()),
        gitRepoUrl: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await requireCap(ctx, 'project.update', { projectId: args.projectId });

        // Enforce (projectId, name) uniqueness at app level.
        const existingByName = await ctx.db
            .query('branches')
            .withIndex('by_project_name', (q) =>
                q.eq('projectId', args.projectId).eq('name', args.name),
            )
            .unique();
        if (existingByName) throw new Error('CONFLICT: branch name already used');

        const isDefault = args.isDefault ?? false;
        const now = Date.now();

        const branchId = await ctx.db.insert('branches', {
            projectId: args.projectId,
            name: args.name,
            description: args.description,
            isDefault: false, // toggle through setDefaultBranch below
            updatedAt: now,
            sandboxId: args.sandboxId,
            runtimeType: args.runtimeType ?? 'cloud',
            runtimeMetadata: args.runtimeMetadata ?? {},
            gitBranch: args.gitBranch,
            gitCommitSha: args.gitCommitSha,
            gitRepoUrl: args.gitRepoUrl,
        });

        if (isDefault) {
            await ctx.runMutation(internal.internal.cascade.setDefaultBranch, {
                projectId: args.projectId,
                branchId,
            });
        }
        return (await ctx.db.get(branchId))!;
    },
});

/**
 * Partial-patch update for a branch. `projectId` and `sandboxId` are
 * server-immutable. Flipping `isDefault: true` demotes any existing default
 * via the internal cascade helper.
 */
export const update = mutation({
    args: {
        branchId: v.id('branches'),
        name: v.optional(v.string()),
        description: v.optional(v.union(v.string(), v.null())),
        isDefault: v.optional(v.boolean()),
        gitBranch: v.optional(v.union(v.string(), v.null())),
        gitCommitSha: v.optional(v.union(v.string(), v.null())),
        gitRepoUrl: v.optional(v.union(v.string(), v.null())),
        runtimeType: v.optional(vBranchRuntimeType),
        runtimeMetadata: v.optional(v.any()),
    },
    handler: async (ctx, { branchId, ...rest }) => {
        const existing = await ctx.db.get(branchId);
        if (!existing) throw new Error('NOT_FOUND: Branch not found');
        await requireCap(ctx, 'project.update', { projectId: existing.projectId });

        if (rest.name !== undefined) {
            const trimmed = rest.name.trim();
            if (trimmed.length === 0) throw new Error('BAD_REQUEST: name');
            // Uniqueness check — allow same id.
            const dup = await ctx.db
                .query('branches')
                .withIndex('by_project_name', (q) =>
                    q.eq('projectId', existing.projectId).eq('name', trimmed),
                )
                .unique();
            if (dup && dup._id !== branchId) {
                throw new Error('CONFLICT: branch name already used');
            }
            rest.name = trimmed;
        }

        const patch: Partial<Doc<'branches'>> = { updatedAt: Date.now() };
        const promoteToDefault = rest.isDefault === true && !existing.isDefault;
        for (const [k, value] of Object.entries(rest)) {
            if (value === undefined) continue;
            // isDefault handled via cascade helper.
            if (k === 'isDefault') continue;
            (patch as Record<string, unknown>)[k] = value === null ? undefined : value;
        }
        await ctx.db.patch(branchId, patch);

        if (promoteToDefault) {
            await ctx.runMutation(internal.internal.cascade.setDefaultBranch, {
                projectId: existing.projectId,
                branchId,
            });
        }

        return (await ctx.db.get(branchId))!;
    },
});

export const remove = mutation({
    args: { branchId: v.id('branches') },
    handler: async (ctx, { branchId }) => {
        const existing = await ctx.db.get(branchId);
        if (!existing) throw new Error('NOT_FOUND: Branch not found');
        await requireCap(ctx, 'project.update', { projectId: existing.projectId });
        await ctx.runMutation(internal.internal.cascade.deleteBranchCascade, {
            branchId,
        });
        return { ok: true } as const;
    },
});

// ─── Internal helpers for actions ─────────────────────────────────────────────

/**
 * Internal mutation used by branchActions.fork / createBlank to atomically
 * write the branch + its default frames after the action has provisioned a
 * sandbox externally.
 */
export const _insertBranchWithFrames = internalMutation({
    args: {
        projectId: v.id('projects'),
        userId: v.id('users'),
        name: v.string(),
        sandboxId: v.string(),
        previewUrl: v.string(),
        framePosition: v.optional(
            v.object({
                x: v.number(),
                y: v.number(),
                width: v.number(),
                height: v.number(),
            }),
        ),
        // Sandbox runtime metadata returned by the provider. Persisted into
        // `runtimeMetadata.cloud` so `fromConvexBranch` can hydrate the
        // editor's `branch.runtime.cloud` shape — without these fields
        // populated, `SessionManager.connect` reads `cloud.provider ===
        // undefined` and throws `ArchivedRuntimeError` against a freshly
        // provisioned Vercel sandbox.
        sandboxRuntime: v.optional(
            v.object({
                provider: v.union(
                    v.literal('code_sandbox'),
                    v.literal('vercel_sandbox'),
                ),
                snapshotId: v.optional(v.string()),
                port: v.optional(v.number()),
                devCommand: v.optional(v.string()),
                runtime: v.optional(v.string()),
            }),
        ),
    },
    handler: async (ctx, args) => {
        // Defense-in-depth: the action layer (branchActions.fork / createBlank)
        // is expected to gate via _requireProjectCap before reaching here, but
        // re-check at the write site so a missing or skipped action-side check
        // can't silently insert branches/frames into a project the caller
        // doesn't own. Internal mutations still inherit the action's auth
        // context, so requireCap works the same as in a public mutation.
        await requireCap(ctx, 'project.update', { projectId: args.projectId });
        const now = Date.now();
        const branchId = await ctx.db.insert('branches', {
            projectId: args.projectId,
            name: args.name,
            description: undefined,
            isDefault: false,
            updatedAt: now,
            sandboxId: args.sandboxId,
            runtimeType: 'cloud',
            runtimeMetadata: args.sandboxRuntime
                ? {
                      cloud: {
                          provider: args.sandboxRuntime.provider,
                          sandboxId: args.sandboxId,
                          previewUrl: args.previewUrl,
                          snapshotId: args.sandboxRuntime.snapshotId,
                          port: args.sandboxRuntime.port,
                          devCommand: args.sandboxRuntime.devCommand,
                          runtime: args.sandboxRuntime.runtime,
                      },
                  }
                : {},
        });

        const createdFrameIds: Id<'frames'>[] = [];
        const canvas = await ctx.db
            .query('canvases')
            .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
            .first();
        if (canvas) {
            const defaultFrames = [
                { name: 'Desktop', width: 1440, height: 900, order: 0 },
                { name: 'Tablet', width: 768, height: 1024, order: 1 },
                { name: 'Phone', width: 375, height: 812, order: 2 },
            ];
            // `framePosition` is only sent when the client had an active source
            // frame to offset from. When it's absent (e.g. creating a blank
            // branch with no active frame) fall back to the canvas origin —
            // otherwise the branch was created with ZERO frames and rendered as
            // an empty, unusable canvas. When it IS present, behavior is
            // unchanged (offset right of the source group).
            const framePosition = args.framePosition ?? { x: 0, y: 0, width: 0, height: 0 };
            const startX = framePosition.x + framePosition.width + 100;
            const startY = framePosition.y;
            const groupId = crypto.randomUUID();
            let xOffset = 0;
            for (const f of defaultFrames) {
                const id = await ctx.db.insert('frames', {
                    canvasId: canvas._id,
                    branchId,
                    url: args.previewUrl,
                    x: startX + xOffset,
                    y: startY,
                    width: f.width,
                    height: f.height,
                    groupId,
                    breakpointId: f.name.toLowerCase(),
                    breakpointName: f.name,
                    breakpointOrder: f.order,
                });
                createdFrameIds.push(id);
                xOffset += f.width + 40;
            }
        }

        const branch = (await ctx.db.get(branchId))!;
        const frames = await Promise.all(createdFrameIds.map((id) => ctx.db.get(id)));
        return {
            branch,
            frames: frames.filter((f): f is Doc<'frames'> => f !== null),
            sandboxId: args.sandboxId,
            previewUrl: args.previewUrl,
        };
    },
});

/**
 * Internal lookup so actions can read source branch metadata. Reads are
 * gated on the parent project's `project.view` cap so an action layer that
 * forgets to authorize the caller can't leak another tenant's sandbox/frame
 * data — even though source branch IDs are opaque, treat them as guessable.
 *
 * Declared as `internalQuery` because the handler only reads; mutations are
 * serialized per document and pay OCC retry overhead on conflict, which
 * costs `branchActions.fork`/`createBlank` latency for no benefit.
 */
export const _getBranchWithFrames = internalQuery({
    args: { branchId: v.id('branches') },
    handler: async (ctx, { branchId }) => {
        const branch = await ctx.db.get(branchId);
        if (!branch) return null;
        await requireCap(ctx, 'project.view', { projectId: branch.projectId });
        const frames = await ctx.db
            .query('frames')
            .withIndex('by_branch', (q) => q.eq('branchId', branchId))
            .collect();
        return { branch, frames };
    },
});

/**
 * Action-side authorization helper: throws FORBIDDEN if the caller cannot
 * update the project. Used by branchActions.fork / createBlank BEFORE the
 * costly CodeSandbox provisioning step so an unauthorized caller can never
 * burn paid sandbox quota or pollute another tenant's editor.
 */
export const _requireProjectUpdateCap = internalQuery({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.update', { projectId });
        return null;
    },
});

/**
 * Internal lookup for unique-name generation.
 */
export const _listBranchNamesForProject = internalMutation({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        const branches = await ctx.db
            .query('branches')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .collect();
        return branches.map((b) => b.name);
    },
});
