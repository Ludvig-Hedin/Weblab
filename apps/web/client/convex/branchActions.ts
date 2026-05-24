'use node';

import { v } from 'convex/values';

import { api, internal } from './_generated/api';
import { action } from './_generated/server';

// Node-only actions for branches — wrap Vercel Sandbox SDK calls and persist
// via internal mutations.
//
// Sandbox runtime: Vercel only. CodeSandbox was archived 2026-05-24
// (see docs/notes/2026-05-13-vercel-sandbox-provider.md). Branch fork now
// snapshots the source Vercel sandbox and resumes a new one from the
// snapshot; branch createBlank scaffolds a fresh Next.js project via the
// same VercelSandboxProvider used by project.createBlank.

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
 * Forks a source branch — snapshots the source Vercel sandbox, resumes a new
 * sandbox from the snapshot, then writes the new branch + default frames
 * atomically.
 *
 * On DB write failure the new sandbox is stopped to avoid orphans (Vercel
 * sandboxes auto-expire on timeout, so cleanup is best-effort).
 *
 * The Vercel snapshot fork is not yet implemented — see TODO(sandbox-fork)
 * in docs/notes/2026-05-13-vercel-sandbox-provider.md. Surfacing a clear
 * error keeps the editor from silently provisioning an empty VM.
 */
export const fork = action({
    args: { branchId: v.id('branches') },
    handler: async (ctx, { branchId }): Promise<unknown> => {
        const me: any = await ctx.runQuery(api.users.me, {});
        if (!me) throw new Error('UNAUTHORIZED');

        const branchData: any = await ctx.runQuery(internal.branches._getBranchWithFrames, {
            branchId,
        });
        if (!branchData) throw new Error('NOT_FOUND: Source branch not found');
        const { branch: sourceBranch } = branchData;

        // Authorization: forking writes a new branch + frames into
        // sourceBranch.projectId and provisions a paid Vercel sandbox.
        // Require project.update on the source branch's project before the
        // sandbox call so an unauthorized caller can't burn quota or pollute
        // the project.
        await ctx.runQuery(internal.branches._requireProjectUpdateCap, {
            projectId: sourceBranch.projectId,
        });

        throw new Error(
            'Branch fork is temporarily unavailable. ' +
                'CodeSandbox was archived 2026-05-24; the Vercel Sandbox snapshot-based ' +
                'fork is not yet implemented. Use "Create blank branch" until ' +
                'TODO(sandbox-fork) lands.',
        );
    },
});

// ─── createBlank ──────────────────────────────────────────────────────────────

/**
 * Create a blank branch with its own fresh Vercel sandbox. Scaffolds a new
 * Next.js project via VercelSandboxProvider — same code path as
 * `projectActions.createBlank` — and writes the new branch + default frames
 * atomically.
 *
 * On DB write failure the new sandbox is stopped to avoid leaking paid
 * VM-hours.
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

        // Authorization: createBlank inserts a new branch into args.projectId
        // and provisions a paid Vercel sandbox. Require project.update on the
        // target project before the sandbox call so an unauthorized caller
        // can't burn quota or inject attacker-controlled sandbox iframes into
        // a victim's project.
        await ctx.runQuery(internal.branches._requireProjectUpdateCap, {
            projectId: args.projectId,
        });

        if (!process.env.VERCEL_TOKEN) {
            throw new Error(
                'VERCEL_TOKEN not configured. Vercel Sandbox is the only runtime; ' +
                    'set VERCEL_TEAM_ID, VERCEL_PROJECT_ID, and VERCEL_TOKEN ' +
                    '(see apps/web/client/.env.example).',
            );
        }

        const existingNames: string[] = await ctx.runMutation(
            internal.branches._listBranchNamesForProject,
            { projectId: args.projectId },
        );
        const branchName = args.branchName ?? generateUniqueBranchName('empty', existingNames);

        let provisionedSandboxId: string | null = null;
        try {
            const { VercelSandboxProvider } = await import(
                '@weblab/code-provider/providers/vercel-sandbox'
            );
            // Branches currently default to Next.js. When a per-branch
            // framework lands, plumb it through here the same way
            // projectActions.createBlank does.
            const project = await VercelSandboxProvider.createProject({
                source: 'template',
                id: 'nextjs',
                framework: 'nextjs',
                title: branchName,
                tags: ['blank'],
                privacy: 'private',
            });
            provisionedSandboxId = project.id;
            const previewUrl = project.previewUrl ?? '';

            const result: any = await ctx.runMutation(internal.branches._insertBranchWithFrames, {
                projectId: args.projectId,
                userId: me._id,
                name: branchName,
                sandboxId: project.id,
                previewUrl,
                framePosition: args.framePosition,
            });
            provisionedSandboxId = null;
            return result;
        } catch (error) {
            if (provisionedSandboxId) {
                try {
                    const { Sandbox } = await import('@vercel/sandbox');
                    const credentials = {
                        teamId: process.env.VERCEL_TEAM_ID ?? '',
                        projectId: process.env.VERCEL_PROJECT_ID ?? '',
                        token: process.env.VERCEL_TOKEN ?? '',
                    };
                    if (credentials.teamId && credentials.projectId && credentials.token) {
                        const sandbox = await Sandbox.get({
                            sandboxId: provisionedSandboxId,
                            ...credentials,
                        });
                        await sandbox.stop({ blocking: false }).catch(() => undefined);
                    }
                } catch (cleanupError) {
                    console.error(
                        'Failed to stop orphaned Vercel sandbox after branch-create rollback',
                        { provisionedSandboxId, cleanupError },
                    );
                }
            }
            throw error;
        }
    },
});
