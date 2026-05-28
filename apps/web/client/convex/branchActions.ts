'use node';

import { Sandbox } from '@vercel/sandbox';
import { v } from 'convex/values';

import { VercelSandboxProvider } from '@weblab/code-provider';

import { api, internal } from './_generated/api';
import { action } from './_generated/server';
import { mapSandboxProvisionError } from './lib/sandboxErrors';

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
    handler: async (_ctx, _args): Promise<unknown> => {
        // Fail fast before any RPC — the action is a stub until
        // TODO(sandbox-fork) lands. Running the user / branch / auth
        // queries first would burn three Convex round-trips on every
        // doomed call. Auth re-gate happens for free when the real
        // implementation ships (it'll need the same auth check upfront).
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

        // Validate the full Vercel credential triple here — provider's
        // getCredentials() throws the same way mid-flight, but failing fast
        // with a single friendly message beats a vague SDK error after the
        // auth gate + name dedupe queries already ran.
        if (
            !process.env.VERCEL_TOKEN ||
            !process.env.VERCEL_TEAM_ID ||
            !process.env.VERCEL_PROJECT_ID
        ) {
            throw new Error(
                'Vercel Sandbox credentials missing. Set VERCEL_TEAM_ID, ' +
                    'VERCEL_PROJECT_ID, and VERCEL_TOKEN (see ' +
                    'apps/web/client/.env.example).',
            );
        }

        // Derive the branch framework from the parent project. Without this
        // a new branch in a static-html project would silently scaffold Next
        // and surface a permanent preview 502 — see review finding F1.
        const project: any = await ctx.runQuery(api.projects.get, {
            projectId: args.projectId,
        });
        if (!project) throw new Error('NOT_FOUND: project');
        const projectFramework: string = project.runtimeMetadata?.framework ?? 'nextjs';
        if (projectFramework !== 'nextjs' && projectFramework !== 'static-html') {
            throw new Error(
                `Framework "${projectFramework}" is not yet supported on Vercel Sandbox. ` +
                    `Branches can only be created for Next.js or static-HTML projects.`,
            );
        }
        const branchFramework: 'nextjs' | 'static-html' = projectFramework;

        const existingNames: string[] = await ctx.runMutation(
            internal.branches._listBranchNamesForProject,
            { projectId: args.projectId },
        );
        const branchName = args.branchName ?? generateUniqueBranchName('empty', existingNames);

        let provisionedSandboxId: string | null = null;
        try {
            const sandboxProject = await VercelSandboxProvider.createProject({
                source: 'template',
                id: branchFramework,
                framework: branchFramework,
                title: branchName,
                tags: ['blank'],
                privacy: 'private',
            });
            provisionedSandboxId = sandboxProject.id;
            const previewUrl = sandboxProject.previewUrl ?? '';

            const result: any = await ctx.runMutation(internal.branches._insertBranchWithFrames, {
                projectId: args.projectId,
                userId: me._id,
                name: branchName,
                sandboxId: sandboxProject.id,
                previewUrl,
                framePosition: args.framePosition,
                // Persist the full sandbox runtime so the editor session can
                // dispatch to `VercelBrowserProvider`. Without this the branch
                // row ends up with `runtimeMetadata.cloud === undefined` and
                // `SessionManager.connect` throws `ArchivedRuntimeError` on
                // the first open of a brand-new branch.
                sandboxRuntime: {
                    provider: 'vercel_sandbox',
                    snapshotId: sandboxProject.snapshotId,
                    port: sandboxProject.port,
                    devCommand: sandboxProject.devCommand,
                    runtime: sandboxProject.runtime,
                },
            });
            provisionedSandboxId = null;
            return result;
        } catch (error) {
            if (provisionedSandboxId) {
                try {
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
            // Re-wrap recognized Vercel provisioning failures (402 billing,
            // 401/403 auth, 429 rate-limit, 5xx upstream) as ConvexErrors so
            // the real reason survives prod redaction.
            throw mapSandboxProvisionError(error);
        }
    },
});
