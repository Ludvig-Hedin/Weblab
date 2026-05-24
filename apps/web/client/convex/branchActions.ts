'use node';

import { v } from 'convex/values';

import { api, internal } from './_generated/api';
import { action } from './_generated/server';

// Node-only actions for branches — wrap CodeSandbox SDK calls and persist
// via internal mutations.

/**
 * Generate a unique branch name within a project by appending a suffix
 * when the desired name collides.
 */
function generateUniqueBranchName(base: string, existing: string[]): string {
    if (!existing.includes(base)) return base;
    for (let i = 2; i < 1000; i++) {
        const candidate = `${base}-${i}`;
        if (!existing.includes(candidate)) return candidate;
    }
    // Hard fallback — append a short random suffix.
    return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── fork ─────────────────────────────────────────────────────────────────────

/**
 * Forks a source branch — provisions a new CSB sandbox from the source
 * sandbox, then writes the new branch + default frames atomically.
 *
 * On DB write failure the new sandbox is shut down to avoid orphans.
 */
export const fork = action({
    args: { branchId: v.id('branches') },
    handler: async (ctx, { branchId }): Promise<unknown> => {
        const me: any = await ctx.runQuery(api.users.me, {});
        if (!me) throw new Error('UNAUTHORIZED');

        const branchData: any = await ctx.runMutation(internal.branches._getBranchWithFrames, {
            branchId,
        });
        if (!branchData) throw new Error('NOT_FOUND: Source branch not found');
        const { branch: sourceBranch, frames: sourceFrames } = branchData;

        const existingNames: string[] = await ctx.runMutation(
            internal.branches._listBranchNamesForProject,
            { projectId: sourceBranch.projectId },
        );
        const branchName = generateUniqueBranchName(sourceBranch.name, existingNames);

        const csbKey = process.env.CSB_API_KEY;
        if (!csbKey) throw new Error('CSB_API_KEY not configured');
        const { CodeSandbox } = await import('@codesandbox/sdk');
        const csb = new CodeSandbox(csbKey);

        let createdSandboxId: string | null = null;
        try {
            const newSandbox = await csb.sandboxes.create({
                source: 'template',
                id: sourceBranch.sandboxId,
                title: branchName,
                tags: ['fork'],
                privacy: 'private',
            });
            createdSandboxId = newSandbox.id;

            const sourceFrame = sourceFrames[0];
            const portMatch = sourceFrame
                ? /https:\/\/[^-]+-(\d+)\.csb\.app/.exec(sourceFrame.url)
                : null;
            const port = portMatch ? parseInt(portMatch[1]!, 10) : 3000;
            const previewUrl = `https://${newSandbox.id}-${port}.csb.app`;

            // Frame position from source first frame as anchor.
            const framePosition = sourceFrame
                ? {
                      x: sourceFrame.x,
                      y: sourceFrame.y,
                      width: sourceFrame.width,
                      height: sourceFrame.height,
                  }
                : undefined;

            const result: any = await ctx.runMutation(internal.branches._insertBranchWithFrames, {
                projectId: sourceBranch.projectId,
                userId: me._id,
                name: branchName,
                sandboxId: newSandbox.id,
                previewUrl,
                framePosition,
            });
            createdSandboxId = null;
            return result;
        } catch (error) {
            if (createdSandboxId) {
                await csb.sandboxes.shutdown(createdSandboxId).catch(() => undefined);
            }
            throw error;
        }
    },
});

// ─── createBlank ──────────────────────────────────────────────────────────────

/**
 * Create a blank branch with its own fresh sandbox. Same pattern as fork,
 * but the source is the default new-project template instead of a source
 * branch.
 */
export const createBlank = action({
    args: {
        projectId: v.id('projects'),
        branchName: v.optional(v.string()),
        framePosition: v.optional(
            v.object({
                x: v.number(),
                y: v.number(),
                width: v.number(),
                height: v.number(),
            }),
        ),
    },
    handler: async (ctx, args): Promise<unknown> => {
        const me: any = await ctx.runQuery(api.users.me, {});
        if (!me) throw new Error('UNAUTHORIZED');

        const existingNames: string[] = await ctx.runMutation(
            internal.branches._listBranchNamesForProject,
            { projectId: args.projectId },
        );
        const branchName = args.branchName ?? generateUniqueBranchName('empty', existingNames);

        const csbKey = process.env.CSB_API_KEY;
        if (!csbKey) throw new Error('CSB_API_KEY not configured');
        const { CodeSandbox } = await import('@codesandbox/sdk');
        const csb = new CodeSandbox(csbKey);

        // Default template id matches packages/constants DEFAULT_NEW_PROJECT_TEMPLATE
        // (SandboxTemplates.BLANK.id). A wrong id yields "Script not found 'dev'"
        // + a permanent 502 preview iframe, so keep this in sync with csb.ts.
        const DEFAULT_TEMPLATE_ID = 'pf2nqh';
        let createdSandboxId: string | null = null;
        try {
            const blankSandbox = await csb.sandboxes.create({
                source: 'template',
                id: DEFAULT_TEMPLATE_ID,
                title: branchName,
                tags: ['blank'],
                privacy: 'private',
            });
            createdSandboxId = blankSandbox.id;
            const previewUrl = `https://${blankSandbox.id}-3000.csb.app`;

            const result: any = await ctx.runMutation(internal.branches._insertBranchWithFrames, {
                projectId: args.projectId,
                userId: me._id,
                name: branchName,
                sandboxId: blankSandbox.id,
                previewUrl,
                framePosition: args.framePosition,
            });
            createdSandboxId = null;
            return result;
        } catch (error) {
            if (createdSandboxId) {
                await csb.sandboxes.shutdown(createdSandboxId).catch(() => undefined);
            }
            throw error;
        }
    },
});
