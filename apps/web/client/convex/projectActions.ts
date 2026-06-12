'use node';

import { Sandbox } from '@vercel/sandbox';
import { ConvexError, v } from 'convex/values';

import { VercelSandboxProvider } from '@weblab/code-provider';

import type { Doc, Id } from './_generated/dataModel';
import { api, internal } from './_generated/api';
import { action, internalAction } from './_generated/server';
import { deriveRepoName } from './lib/repoName';
import { mapSandboxProvisionError } from './lib/sandboxErrors';

// Node-only actions for the projects domain. These wrap external SDK calls
// (Firecrawl HTTP API, Vercel Sandbox SDK, sharp image compression,
// OpenRouter LLM) and persist results through internal mutations.
//
// Sandbox runtime: Vercel only. CodeSandbox was removed 2026-05-24
// (see docs/notes/2026-05-13-vercel-sandbox-provider.md). Existing
// `cloud_provider: 'code_sandbox'` rows in `projects.runtimeMetadata`
// are still readable but never written by new code.

// ─── captureScreenshot ────────────────────────────────────────────────────────

type VercelCredentials = {
    teamId: string;
    projectId: string;
    token: string;
};

type BranchCloudRuntime = {
    provider?: string;
    sandboxId?: string;
    previewUrl?: string;
    snapshotId?: string;
    port?: number;
    devCommand?: string;
    runtime?: string;
};

type BranchWithFrames = {
    branch: Doc<'branches'>;
    frames: Array<Pick<Doc<'frames'>, 'url'>>;
};

function asBranchWithFrames(value: unknown): BranchWithFrames | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as {
        branch?: Doc<'branches'>;
        frames?: Array<Pick<Doc<'frames'>, 'url'>>;
    };
    if (!candidate.branch) return null;
    return {
        branch: candidate.branch,
        frames: Array.isArray(candidate.frames) ? candidate.frames : [],
    };
}

function getBranchCloudRuntime(branch: Doc<'branches'>): BranchCloudRuntime | null {
    const metadata = branch.runtimeMetadata as { cloud?: BranchCloudRuntime } | null | undefined;
    return metadata?.cloud ?? null;
}

function getVercelCredentials(): VercelCredentials {
    const teamId = process.env.VERCEL_TEAM_ID;
    const projectId = process.env.VERCEL_PROJECT_ID;
    const token = process.env.VERCEL_TOKEN;
    if (!teamId || !projectId || !token) {
        throw new Error(
            'VERCEL_TOKEN not configured. Vercel Sandbox is the only runtime; ' +
                'set VERCEL_TEAM_ID, VERCEL_PROJECT_ID, and VERCEL_TOKEN ' +
                '(see apps/web/client/.env.example).',
        );
    }
    return { teamId, projectId, token };
}

function resolveSandboxPort(input: unknown): number {
    return typeof input === 'number' && Number.isInteger(input) && input > 0 && input <= 65_535
        ? input
        : 3000;
}

function assertVercelPreviewUrl(url: string): URL {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
        throw new Error('BAD_REQUEST: preview URL must be https');
    }
    if (!parsed.hostname.endsWith('.vercel.run')) {
        throw new Error('BAD_REQUEST: preview URL is not a Vercel sandbox URL');
    }
    return parsed;
}

function toLivenessState(status: number): 'alive' | 'gone' | 'notFound' | 'error' {
    if (status === 410) return 'gone';
    if (status === 404) return 'notFound';
    if (status >= 200 && status < 500) return 'alive';
    return 'error';
}

/**
 * Captures a screenshot of the project's preview URL via Firecrawl,
 * compresses via sharp, uploads to Convex File Storage, and persists the
 * storage id on the project.
 *
 * Soft-fails (returns `{success:false, skipped}`) when:
 *   - FIRECRAWL_API_KEY is not configured
 *   - the project was captured in the last 30 minutes (use `force: true` to
 *     bypass the dedupe)
 */
export const captureScreenshot = action({
    args: {
        projectId: v.id('projects'),
        force: v.optional(v.boolean()),
    },
    handler: async (ctx, args): Promise<unknown> => {
        try {
            const apiKey = process.env.FIRECRAWL_API_KEY;
            if (!apiKey) {
                return {
                    success: false as const,
                    error: 'FIRECRAWL_API_KEY is not configured',
                    skipped: 'no-api-key' as const,
                };
            }

            // Authorization: require `project.update` upfront. The final
            // `api.projects.update` call already enforces this, but without
            // an upfront gate a workspace VIEWER (project.view only) would
            // run all of Firecrawl + sharp + Convex storage before failing
            // at the write — burning paid quota on a write they can't keep.
            await ctx.runQuery(internal.projects._requireProjectUpdateCap, {
                projectId: args.projectId,
            });

            // Server-side dedupe — load project to inspect updatedPreviewImgAt.
            const project: any = await ctx.runQuery(api.projects.get, {
                projectId: args.projectId,
            });
            if (!project) {
                throw new Error('NOT_FOUND: project');
            }
            if (!args.force && project.updatedPreviewImgAt) {
                const ageMs = Date.now() - project.updatedPreviewImgAt;
                if (ageMs < 30 * 60 * 1000) {
                    return { success: true as const, skipped: 'recent' as const };
                }
            }

            // Find the default branch + its frames to resolve the dev-server URL.
            const branches: any[] = await ctx.runQuery(api.branches.getByProjectId, {
                projectId: args.projectId,
                onlyDefault: true,
            });
            const defaultBranch = branches[0];
            if (!defaultBranch) throw new Error('NOT_FOUND: default branch');
            if (!defaultBranch.sandboxId) {
                throw new Error('No sandbox found for branch');
            }

            const frameUrl = defaultBranch.frames[0]?.url ?? null;
            // CodeSandbox was archived 2026-05-24; the previous `csb.app`
            // fallback now resolves to a 404 every time the frame URL
            // isn't populated. Without a real preview URL we cannot
            // generate a screenshot — skip cleanly instead of scraping a
            // 404 page and persisting a broken image.
            if (!frameUrl) {
                return { success: true as const, skipped: 'no_preview_url' as const };
            }
            const url = frameUrl;

            // Firecrawl REST API — direct fetch, no SDK dependency.
            const fcRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    url,
                    formats: ['screenshot'],
                    onlyMainContent: true,
                    // 30s: a cold-resumed sandbox dev server can be slow to
                    // first paint; 10s 408'd before the preview was ready.
                    timeout: 30000,
                }),
            });
            if (!fcRes.ok) {
                throw new Error(
                    `Firecrawl HTTP ${fcRes.status}: ${await fcRes.text().catch(() => '')}`,
                );
            }
            const fcJson = (await fcRes.json()) as {
                success: boolean;
                error?: string;
                data?: { screenshot?: string };
            };
            if (!fcJson.success) {
                throw new Error(`Failed to scrape URL: ${fcJson.error ?? 'Unknown error'}`);
            }
            const screenshotUrl = fcJson.data?.screenshot;
            if (!screenshotUrl) throw new Error('Invalid screenshot URL');

            // Fetch + compress with sharp.
            const response = await fetch(screenshotUrl, {
                signal: AbortSignal.timeout(10000),
            });
            if (!response.ok) {
                throw new Error(
                    `Failed to fetch screenshot: ${response.status} ${response.statusText}`,
                );
            }
            const arrayBuffer = await response.arrayBuffer();
            // Compress with sharp when available (dynamic import keeps the heavy
            // native dep out of non-screenshot paths). sharp's platform binary
            // is NOT present on the Convex linux-arm64 action runtime ("Could
            // not load the sharp module using the linux-arm64 runtime"), so fall
            // back to storing the raw screenshot rather than failing the whole
            // capture — preview thumbnails are a nice-to-have, not worth
            // erroring + spamming logs on every project refresh.
            let blob: Blob;
            try {
                const sharp = (await import('sharp')).default;
                const compressed = await sharp(Buffer.from(arrayBuffer))
                    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 80 })
                    .toBuffer();
                blob = new Blob([new Uint8Array(compressed)], { type: 'image/jpeg' });
            } catch (sharpErr) {
                console.warn(
                    '[captureScreenshot] sharp unavailable on this runtime; storing raw screenshot',
                    sharpErr instanceof Error ? sharpErr.message : sharpErr,
                );
                blob = new Blob([arrayBuffer], {
                    type: response.headers.get('content-type') ?? 'image/png',
                });
            }

            // Upload to Convex File Storage.
            const storageId = await ctx.storage.store(blob);

            // Persist the storage id on the project.
            await ctx.runMutation(api.projects.update, {
                projectId: args.projectId,
                previewImgStorageId: storageId,
                previewImgUrl: null,
                previewImgPath: null,
                previewImgBucket: null,
                updatedPreviewImgAt: Date.now(),
            });

            return { success: true as const, storageId };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // The project (or its branch) being deleted between the debounced
            // client-side capture trigger and this action running is an
            // expected race, not a failure — skip quietly instead of logging
            // an error on every deleted/just-removed project.
            if (/NOT_FOUND/i.test(message)) {
                return { success: false as const, skipped: 'not-found' as const };
            }
            console.error('Error capturing project screenshot:', error);
            return {
                success: false as const,
                error: message,
            };
        }
    },
});

// ─── createBlank ──────────────────────────────────────────────────────────────

/**
 * Creates a blank Vercel sandbox via the per-framework scaffolder, then
 * writes the project graph via internal mutation. On insert failure, the
 * sandbox is stopped to avoid leaking paid Vercel resources.
 *
 * Supported frameworks (Vercel scaffolders implemented in
 * `@weblab/code-provider/providers/vercel-sandbox`):
 *   - `nextjs`      → Next 15 + Tailwind v4 + Turbopack
 *   - `static-html` → single index.html + `serve`
 *
 * Vite/Remix/Astro/TanStack Start are gated upstream in
 * `@weblab/framework`'s registry until their scaffolders land in the
 * Vercel provider — passing them here throws a friendly error rather
 * than provisioning an empty VM.
 */
/**
 * Background sandbox provisioner — scheduled by `createBlank` after the
 * project graph is optimistically inserted. Provisions a Vercel sandbox,
 * then patches the project/branch/frames via `_applySandboxToProject` so
 * the editor's live Convex query picks up the real URL and reloads.
 */
export const _provisionSandbox = internalAction({
    args: {
        projectId: v.id('projects'),
        branchId: v.id('branches'),
        framework: v.union(v.literal('nextjs'), v.literal('static-html')),
    },
    handler: async (ctx, args) => {
        // Every failure path MUST write a marker back to the branch — a
        // silent return would leave a zombie project whose frames spin on
        // "Setting up your workspace" forever.
        const markFailed = async (message: string) => {
            try {
                await ctx.runMutation(internal.projects._markProvisioningFailed, {
                    projectId: args.projectId,
                    branchId: args.branchId,
                    error: message,
                });
            } catch (markErr) {
                console.error(
                    '[_provisionSandbox] Failed to record provisioning failure:',
                    markErr,
                );
            }
        };

        if (!process.env.VERCEL_TOKEN) {
            console.error('[_provisionSandbox] VERCEL_TOKEN not configured — cannot provision sandbox');
            await markFailed(
                'Sandbox provisioning is not configured on this deployment (missing Vercel credentials).',
            );
            return;
        }

        const framework = args.framework;
        let provisionedSandboxId: string | null = null;

        try {
            const result = await VercelSandboxProvider.createProject({
                source: 'template',
                id: framework,
                framework,
                title: `Project ${args.projectId}`,
                tags: ['blank', args.projectId],
                privacy: 'private',
                snapshotId: framework === 'nextjs' ? process.env.VERCEL_BLANK_SNAPSHOT_ID : undefined,
            });

            provisionedSandboxId = result.id;
            const previewUrl = result.previewUrl ?? '';
            const port = result.port ?? (framework === 'static-html' ? 8080 : 3000);

            if (!previewUrl) {
                // A sandbox without a preview URL is unusable by the editor —
                // the frame reload that waits on a non-empty URL would never
                // fire. Treat as failure (sandbox cleanup runs in the catch).
                throw new Error('Sandbox was created but returned no preview URL.');
            }

            await ctx.runMutation(internal.projects._applySandboxToProject, {
                projectId: args.projectId,
                branchId: args.branchId,
                sandboxId: result.id,
                previewUrl,
                snapshotId: result.snapshotId,
                provider: 'vercel_sandbox',
                port,
                devCommand: result.devCommand,
                runtime: result.runtime,
            });

            provisionedSandboxId = null;
        } catch (error) {
            console.error('[_provisionSandbox] Failed to provision sandbox:', error);
            // Re-use the user-facing mapping (402 billing / 401 auth / 429
            // rate-limit / 5xx upstream) so the marker is actionable.
            const mapped = mapSandboxProvisionError(error);
            const mappedMessage =
                mapped instanceof ConvexError
                    ? (mapped.data as { message?: string }).message
                    : undefined;
            await markFailed(
                mappedMessage ??
                    (error instanceof Error ? error.message : 'Unknown provisioning error'),
            );
            if (provisionedSandboxId) {
                try {
                    const credentials: VercelCredentials = {
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
                } catch (cleanupErr) {
                    console.warn('[_provisionSandbox] Sandbox cleanup failed:', cleanupErr);
                }
            }
        }
    },
});

export const createBlank = action({
    args: {
        framework: v.optional(
            v.union(
                v.literal('nextjs'),
                v.literal('vite-react'),
                v.literal('remix'),
                v.literal('astro'),
                v.literal('tanstack-start'),
                v.literal('static-html'),
            ),
        ),
        workspaceId: v.optional(v.id('workspaces')),
    },
    handler: async (ctx, args): Promise<{ projectId: string }> => {
        const me: any = await ctx.runQuery(api.users.me, {});
        if (!me) throw new Error('UNAUTHORIZED');

        // Authorization: when caller supplies an explicit workspaceId,
        // require `project.create` on it BEFORE creating the project.
        // Personal-workspace fallback is unconditionally allowed (own data).
        if (args.workspaceId) {
            await ctx.runQuery(internal.projects._requireProjectCreateCap, {
                workspaceId: args.workspaceId,
            });
        }

        const framework = args.framework ?? 'nextjs';

        if (framework !== 'nextjs' && framework !== 'static-html') {
            throw new Error(
                `Framework "${framework}" is not yet supported on Vercel Sandbox. ` +
                    `Pick Next.js or static HTML, or wait for the scaffolder to land in ` +
                    `@weblab/code-provider/providers/vercel-sandbox.`,
            );
        }

        if (!process.env.VERCEL_TOKEN) {
            throw new Error(
                'VERCEL_TOKEN not configured. Vercel Sandbox is the only runtime; ' +
                    'set VERCEL_TEAM_ID, VERCEL_PROJECT_ID, and VERCEL_TOKEN ' +
                    '(see apps/web/client/.env.example).',
            );
        }

        // Generate a unique-ish blank project name.
        const now = new Date();
        const baseName = `New Project · ${now.toLocaleString(undefined, {
            month: 'short',
        })} ${now.getDate()}`;

        const workspaceId: any =
            args.workspaceId ??
            (await ctx.runMutation(internal.projects._resolvePersonalWorkspaceForAction, {
                userId: me._id,
            }));

        const existingCount: number = await ctx.runMutation(
            internal.projects._countProjectsByNamePrefix,
            { workspaceId, namePrefix: baseName },
        );
        const projectName =
            existingCount === 0 ? baseName : `${baseName} (${existingCount + 1})`;

        // Create the project graph optimistically (empty sandbox refs) so the
        // editor can open immediately while provisioning runs in the background.
        const { projectId, branchId } = (await ctx.runMutation(
            internal.projects._insertProjectGraphOptimistic,
            {
                userId: me._id,
                workspaceId,
                name: projectName,
                description: 'Your new blank project',
                tags: ['blank'],
                framework,
            },
        )) as { projectId: string; branchId: string };

        // Schedule sandbox provisioning. Runs asynchronously — the editor
        // opens with "Provisioning workspace…" frames and reloads once the
        // sandbox URL is written back by _provisionSandbox → _applySandboxToProject.
        await ctx.scheduler.runAfter(0, internal.projectActions._provisionSandbox, {
            projectId: projectId as Id<'projects'>,
            branchId: branchId as Id<'branches'>,
            framework,
        });

        return { projectId };
    },
});

// ─── createFromGit (site clone / GitHub import) ────────────────────────────────

/**
 * Provisions a Vercel sandbox by `git clone`-ing a public repo, then persists
 * the project graph — the clone analogue of {@link createBlank}. Wraps
 * `VercelSandboxProvider.createProjectFromGit` (clone → `npm install` →
 * snapshot → resume) and reuses `_insertProjectGraph`, so the editor boots the
 * same way a blank project does.
 */
export const createFromGit = action({
    args: {
        repoUrl: v.string(),
        branch: v.optional(v.string()),
        subpath: v.optional(v.string()),
        name: v.optional(v.string()),
        description: v.optional(v.string()),
        framework: v.optional(
            v.union(
                v.literal('nextjs'),
                v.literal('vite-react'),
                v.literal('remix'),
                v.literal('astro'),
                v.literal('tanstack-start'),
                v.literal('static-html'),
            ),
        ),
        workspaceId: v.optional(v.id('workspaces')),
    },
    handler: async (ctx, args): Promise<{ projectId: string }> => {
        const me: any = await ctx.runQuery(api.users.me, {});
        if (!me) throw new Error('UNAUTHORIZED');

        // Same create-cap gate as createBlank — never burn paid sandbox quota
        // for a workspace VIEWER, and never inject a sandbox iframe into a
        // shared workspace the caller can only view.
        if (args.workspaceId) {
            await ctx.runQuery(internal.projects._requireProjectCreateCap, {
                workspaceId: args.workspaceId,
            });
        }

        if (!process.env.VERCEL_TOKEN) {
            throw new Error(
                'VERCEL_TOKEN not configured. Vercel Sandbox is the only runtime; ' +
                    'set VERCEL_TEAM_ID, VERCEL_PROJECT_ID, and VERCEL_TOKEN ' +
                    '(see apps/web/client/.env.example).',
            );
        }

        const framework = args.framework ?? 'nextjs';

        let provisionedSandboxId: string | null = null;
        try {
            const result = await VercelSandboxProvider.createProjectFromGit({
                repoUrl: args.repoUrl,
                branch: args.branch ?? 'main',
                subpath: args.subpath,
                privacy: 'private',
                framework: framework === 'static-html' ? 'static-html' : 'nextjs',
            });

            const sandboxId = result.id;
            provisionedSandboxId = sandboxId;
            const previewUrl = result.previewUrl ?? '';
            const port = result.port ?? (framework === 'static-html' ? 8080 : 3000);

            const workspaceId: any =
                args.workspaceId ??
                (await ctx.runMutation(internal.projects._resolvePersonalWorkspaceForAction, {
                    userId: me._id,
                }));

            // Readable fallback name from the repo URL when the caller didn't
            // supply one. `deriveRepoName` (unit-tested in convex/lib) strips
            // `.git` + any query/fragment so a `?tab=…` URL doesn't leak into
            // the project name.
            const projectName = args.name?.trim() || `Imported · ${deriveRepoName(args.repoUrl)}`;

            const projectId: string = await ctx.runMutation(internal.projects._insertProjectGraph, {
                userId: me._id,
                workspaceId,
                name: projectName,
                description: args.description?.trim() || `Imported from ${args.repoUrl}`,
                tags: ['imported'],
                framework,
                sandboxId,
                sandboxUrl: previewUrl,
                cloudProvider: 'vercel_sandbox',
                port,
                snapshotId: result.snapshotId,
                devCommand: result.devCommand,
                runtime: result.runtime,
            });

            provisionedSandboxId = null;
            return { projectId };
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
                } catch (cleanupErr) {
                    console.warn('[createFromGit] Vercel sandbox cleanup failed', cleanupErr);
                }
            }
            throw mapSandboxProvisionError(error);
        }
    },
});

// ─── createFromPrompt (AI prompt create) ───────────────────────────────────────

/**
 * Provisions a blank Vercel sandbox (same as {@link createBlank}) and seeds a
 * pending `projectCreateRequests` row so the editor replays the user's prompt
 * (and any images) into the AI chat on first open. The consumer side
 * (`getPendingRequest` + `use-start-project`) already existed; this is the
 * writer that was missing.
 */
export const createFromPrompt = action({
    args: {
        prompt: v.string(),
        images: v.optional(
            v.array(v.object({ content: v.string(), mimeType: v.string() })),
        ),
        framework: v.optional(
            v.union(
                v.literal('nextjs'),
                v.literal('vite-react'),
                v.literal('remix'),
                v.literal('astro'),
                v.literal('tanstack-start'),
                v.literal('static-html'),
            ),
        ),
        workspaceId: v.optional(v.id('workspaces')),
    },
    handler: async (ctx, args): Promise<{ projectId: string }> => {
        const me: any = await ctx.runQuery(api.users.me, {});
        if (!me) throw new Error('UNAUTHORIZED');

        if (args.workspaceId) {
            await ctx.runQuery(internal.projects._requireProjectCreateCap, {
                workspaceId: args.workspaceId,
            });
        }

        if (!process.env.VERCEL_TOKEN) {
            throw new Error(
                'VERCEL_TOKEN not configured. Vercel Sandbox is the only runtime; ' +
                    'set VERCEL_TEAM_ID, VERCEL_PROJECT_ID, and VERCEL_TOKEN ' +
                    '(see apps/web/client/.env.example).',
            );
        }

        // AI generation targets Next.js (the only framework the chat pipeline
        // scaffolds against today); honor an explicit override for parity.
        const framework =
            args.framework === 'static-html' ? 'static-html' : 'nextjs';

        let provisionedSandboxId: string | null = null;
        try {
            const result = await VercelSandboxProvider.createProject({
                source: 'template',
                id: framework,
                framework,
                title: `AI project - ${me._id}`,
                tags: ['prompt', String(me._id)],
                privacy: 'private',
                // Resume the pre-baked Next.js snapshot (~13s) vs scaffold +
                // install (~60-90s); provider ignores it for non-nextjs and
                // falls back gracefully if expired/unset.
                snapshotId:
                    framework === 'nextjs'
                        ? process.env.VERCEL_BLANK_SNAPSHOT_ID
                        : undefined,
            });

            const sandboxId = result.id;
            provisionedSandboxId = sandboxId;
            const previewUrl = result.previewUrl ?? '';
            const port = result.port ?? (framework === 'static-html' ? 8080 : 3000);

            const workspaceId: any =
                args.workspaceId ??
                (await ctx.runMutation(internal.projects._resolvePersonalWorkspaceForAction, {
                    userId: me._id,
                }));

            // Readable name from the prompt's first line; the user can rename.
            const firstLine = args.prompt.trim().split('\n')[0] ?? '';
            const projectName = firstLine.slice(0, 60) || 'New Project';

            const projectId: string = await ctx.runMutation(internal.projects._insertProjectGraph, {
                userId: me._id,
                workspaceId,
                name: projectName,
                description: 'Created from a prompt',
                tags: ['prompt'],
                framework,
                sandboxId,
                sandboxUrl: previewUrl,
                cloudProvider: 'vercel_sandbox',
                port,
                snapshotId: result.snapshotId,
                devCommand: result.devCommand,
                runtime: result.runtime,
            });

            // Project + sandbox are now committed; the sandbox belongs to this
            // project, so a later failure must NOT stop it. Clear the cleanup
            // latch before the best-effort prompt seed below.
            provisionedSandboxId = null;

            // Seed the prompt (+ images) for the editor to replay into the AI
            // chat. Discriminated CreateRequestContext[] — see
            // packages/models/src/project/create.ts. Best-effort: a failed seed
            // must not orphan the already-created project (worst case the editor
            // opens without auto-replaying the prompt; the user can retype it).
            const context: Array<Record<string, unknown>> = [
                { type: 'prompt', content: args.prompt },
            ];
            for (const img of args.images ?? []) {
                context.push({ type: 'image', content: img.content, mimeType: img.mimeType });
            }
            try {
                await ctx.runMutation(internal.projectCreateRequests._insertCreateRequest, {
                    projectId: projectId as any,
                    context,
                });
            } catch (seedErr) {
                // Most likely the base64 images pushed the doc past Convex's
                // ~1MB limit. Retry prompt-only so the AI replay still fires —
                // losing image context is better than losing the prompt.
                console.error(
                    '[createFromPrompt] full seed failed; retrying prompt-only',
                    seedErr,
                );
                try {
                    await ctx.runMutation(internal.projectCreateRequests._insertCreateRequest, {
                        projectId: projectId as any,
                        context: [{ type: 'prompt', content: args.prompt }],
                    });
                } catch (retryErr) {
                    console.error('[createFromPrompt] prompt-only seed also failed', retryErr);
                }
            }

            return { projectId };
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
                } catch (cleanupErr) {
                    console.warn('[createFromPrompt] Vercel sandbox cleanup failed', cleanupErr);
                }
            }
            throw mapSandboxProvisionError(error);
        }
    },
});

// ─── createFromWebsiteClone ─────────────────────────────────────────────────────

/**
 * Website-clone flow. Provisions a sandbox (like createFromPrompt) and seeds
 * the purpose-built clone context types so the editor's `use-start-project`
 * `resumeCreate` consumer can assemble a framework-specific clone prompt via
 * `getCloneSystemPrompt`:
 *   - WEBSITE_URL  → source url + chosen output framework
 *   - WEBSITE_SCRAPE → Firecrawl markdown + brand-identity blob (optional)
 *   - IMAGE → screenshot of the source page (optional, visual reference)
 *   - PROMPT → the user's optional extra notes
 *
 * The caller scrapes first (so a bad URL fails before we burn a sandbox) and
 * passes the scrape result + screenshot in. For screenshot-only clones, `url`
 * is omitted and there is no scrapeContent — the WEBSITE_URL context is still
 * seeded (empty url) so the editor takes the clone-guidance branch instead of
 * treating it as a bare prompt.
 */
export const createFromWebsiteClone = action({
    args: {
        url: v.optional(v.string()),
        notes: v.optional(v.string()),
        scrapeContent: v.optional(v.string()),
        screenshot: v.optional(v.object({ content: v.string(), mimeType: v.string() })),
        framework: v.optional(v.union(v.literal('nextjs'), v.literal('static-html'))),
        workspaceId: v.optional(v.id('workspaces')),
    },
    handler: async (ctx, args): Promise<{ projectId: string }> => {
        const me: any = await ctx.runQuery(api.users.me, {});
        if (!me) throw new Error('UNAUTHORIZED');

        if (args.workspaceId) {
            await ctx.runQuery(internal.projects._requireProjectCreateCap, {
                workspaceId: args.workspaceId,
            });
        }

        if (!process.env.VERCEL_TOKEN) {
            throw new Error(
                'VERCEL_TOKEN not configured. Vercel Sandbox is the only runtime; ' +
                    'set VERCEL_TEAM_ID, VERCEL_PROJECT_ID, and VERCEL_TOKEN ' +
                    '(see apps/web/client/.env.example).',
            );
        }

        const framework: 'nextjs' | 'static-html' =
            args.framework === 'static-html' ? 'static-html' : 'nextjs';

        let provisionedSandboxId: string | null = null;
        try {
            const result = await VercelSandboxProvider.createProject({
                source: 'template',
                id: framework,
                framework,
                title: `Cloned site - ${me._id}`,
                tags: ['clone', String(me._id)],
                privacy: 'private',
                // Resume the pre-baked Next.js snapshot (~13s) vs scaffold +
                // install (~60-90s); provider ignores it for non-nextjs and
                // falls back gracefully if expired/unset.
                snapshotId:
                    framework === 'nextjs'
                        ? process.env.VERCEL_BLANK_SNAPSHOT_ID
                        : undefined,
            });

            const sandboxId = result.id;
            provisionedSandboxId = sandboxId;
            const previewUrl = result.previewUrl ?? '';
            const port = result.port ?? (framework === 'static-html' ? 8080 : 3000);

            const workspaceId: any =
                args.workspaceId ??
                (await ctx.runMutation(internal.projects._resolvePersonalWorkspaceForAction, {
                    userId: me._id,
                }));

            // Readable name from the source host; the user can rename.
            let projectName = 'Cloned site';
            if (args.url) {
                try {
                    projectName = `Clone of ${new URL(args.url).hostname}`.slice(0, 60);
                } catch {
                    projectName = 'Cloned site';
                }
            }

            const projectId: string = await ctx.runMutation(internal.projects._insertProjectGraph, {
                userId: me._id,
                workspaceId,
                name: projectName,
                description: 'Created by cloning a website',
                tags: ['clone'],
                framework,
                sandboxId,
                sandboxUrl: previewUrl,
                cloudProvider: 'vercel_sandbox',
                port,
                snapshotId: result.snapshotId,
                devCommand: result.devCommand,
                runtime: result.runtime,
            });

            // Project + sandbox are committed; clear the cleanup latch before
            // the best-effort context seed (a failed seed must not orphan the
            // project — worst case the editor opens without the clone prompt).
            provisionedSandboxId = null;

            // Build the clone context. Order matters for the size-fallback
            // below: the screenshot is the largest payload, so it goes last
            // and is the first thing dropped if the doc exceeds Convex's ~1MB
            // limit.
            const baseContext: Array<Record<string, unknown>> = [
                { type: 'website_url', content: args.url ?? '', framework },
            ];
            if (args.scrapeContent && args.scrapeContent.trim()) {
                baseContext.push({ type: 'website_scrape', content: args.scrapeContent });
            }
            if (args.notes && args.notes.trim()) {
                baseContext.push({ type: 'prompt', content: args.notes.trim() });
            }
            const fullContext = args.screenshot
                ? [
                      ...baseContext,
                      {
                          type: 'image',
                          content: args.screenshot.content,
                          mimeType: args.screenshot.mimeType,
                      },
                  ]
                : baseContext;

            try {
                await ctx.runMutation(internal.projectCreateRequests._insertCreateRequest, {
                    projectId: projectId as any,
                    context: fullContext,
                });
            } catch (seedErr) {
                // Most likely the base64 screenshot pushed the doc past Convex's
                // ~1MB limit. Retry without the image so the clone guidance +
                // scrape still replay — losing the screenshot beats losing the
                // whole clone context.
                console.error(
                    '[createFromWebsiteClone] full seed failed; retrying without screenshot',
                    seedErr,
                );
                try {
                    await ctx.runMutation(internal.projectCreateRequests._insertCreateRequest, {
                        projectId: projectId as any,
                        context: baseContext,
                    });
                } catch (retryErr) {
                    console.error(
                        '[createFromWebsiteClone] image-free seed also failed',
                        retryErr,
                    );
                }
            }

            return { projectId };
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
                } catch (cleanupErr) {
                    console.warn(
                        '[createFromWebsiteClone] Vercel sandbox cleanup failed',
                        cleanupErr,
                    );
                }
            }
            throw mapSandboxProvisionError(error);
        }
    },
});

// ─── createEmptySandbox (local folder import) ──────────────────────────────────

/**
 * Provisions a bare Vercel sandbox (no scaffold) for the local-folder import
 * flow. The browser then uploads the user's files into it via the authed
 * sandbox proxy and calls `setup` (install + dev). Kept separate from
 * createBlank, whose Next.js scaffold the imported files would collide with.
 * Persisting the project is the caller's job (`projects.create`).
 */
export const createEmptySandbox = action({
    args: {
        workspaceId: v.optional(v.id('workspaces')),
        // The imported project's dev-server port (from its package.json). The
        // sandbox only exposes the ports it's created with, so a non-3000
        // project (static-HTML serve on 8080, Vite on 5173, …) would 502 if we
        // hardcoded 3000.
        port: v.optional(v.number()),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{ sandboxId: string; previewUrl: string; port: number; runtime: string }> => {
        const me: any = await ctx.runQuery(api.users.me, {});
        if (!me) throw new Error('UNAUTHORIZED');

        if (args.workspaceId) {
            await ctx.runQuery(internal.projects._requireProjectCreateCap, {
                workspaceId: args.workspaceId,
            });
        }

        const teamId = process.env.VERCEL_TEAM_ID;
        const projectId = process.env.VERCEL_PROJECT_ID;
        const token = process.env.VERCEL_TOKEN;
        if (!teamId || !projectId || !token) {
            throw new Error(
                'VERCEL_TOKEN not configured. Vercel Sandbox is the only runtime; ' +
                    'set VERCEL_TEAM_ID, VERCEL_PROJECT_ID, and VERCEL_TOKEN ' +
                    '(see apps/web/client/.env.example).',
            );
        }

        // Clamp to a valid TCP port; fall back to 3000 (Next.js default).
        const port =
            args.port && args.port > 0 && args.port <= 65535 ? args.port : 3000;
        const runtime = 'node24';
        try {
            const sandbox = await Sandbox.create({
                ports: [port],
                runtime,
                // Generous: must outlive the browser file upload + npm install.
                timeout: 1_800_000,
                resources: { vcpus: 2 },
                teamId,
                projectId,
                token,
            });
            return {
                sandboxId: sandbox.sandboxId,
                previewUrl: sandbox.domain(port),
                port,
                runtime,
            };
        } catch (error) {
            throw mapSandboxProvisionError(error);
        }
    },
});

export const checkSandboxLiveness = action({
    args: {
        branchId: v.id('branches'),
        previewUrl: v.string(),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{ state: 'alive' | 'gone' | 'notFound' | 'error'; status?: number }> => {
        const branchWithFrames = asBranchWithFrames(
            await ctx.runQuery(internal.branches._getBranchWithFrames, {
                branchId: args.branchId,
            }),
        );
        if (!branchWithFrames) {
            throw new Error('NOT_FOUND: branch');
        }
        const frameUrls = new Set<string>(branchWithFrames.frames.map((frame) => frame.url));
        const branchPreviewUrl = getBranchCloudRuntime(branchWithFrames.branch)?.previewUrl;
        if (!frameUrls.has(args.previewUrl) && branchPreviewUrl !== args.previewUrl) {
            throw new Error('FORBIDDEN: preview URL does not belong to branch');
        }

        const url = assertVercelPreviewUrl(args.previewUrl);
        try {
            const response = await fetch(url, {
                method: 'HEAD',
                redirect: 'manual',
                signal: AbortSignal.timeout(8_000),
            });
            return { state: toLivenessState(response.status), status: response.status };
        } catch {
            return { state: 'error' };
        }
    },
});

export const restoreSandbox = action({
    args: {
        projectId: v.id('projects'),
        branchId: v.id('branches'),
    },
    handler: async (
        ctx,
        args,
    ): Promise<{ sandboxId: string; previewUrl: string; snapshotId: string; port: number }> => {
        await ctx.runQuery(internal.projects._requireProjectUpdateCap, {
            projectId: args.projectId,
        });

        const branchWithFrames = asBranchWithFrames(
            await ctx.runQuery(internal.branches._getBranchWithFrames, {
                branchId: args.branchId,
            }),
        );
        const branch = branchWithFrames?.branch;
        if (!branch || branch.projectId !== args.projectId) {
            throw new Error('NOT_FOUND: branch');
        }
        if (branch.runtimeType !== 'cloud') {
            throw new Error('BAD_REQUEST: local branches do not use Vercel Sandbox');
        }

        const cloud = getBranchCloudRuntime(branch);
        if (cloud?.provider !== 'vercel_sandbox') {
            throw new Error('BAD_REQUEST: branch is not backed by Vercel Sandbox');
        }
        const snapshotId = cloud.snapshotId;
        if (typeof snapshotId !== 'string' || snapshotId.length === 0) {
            throw new Error(
                "This project can't be restored yet because it has no saved sandbox snapshot.",
            );
        }

        const port = resolveSandboxPort(cloud.port);
        const credentials = getVercelCredentials();
        const sandbox = await Sandbox.create({
            source: { type: 'snapshot', snapshotId },
            ports: [port],
            timeout: 1_800_000,
            resources: { vcpus: 2 },
            ...credentials,
        });
        const previewUrl = sandbox.domain(port);

        try {
            await ctx.runMutation(internal.projects._replaceBranchSandbox, {
                projectId: args.projectId,
                branchId: args.branchId,
                sandboxId: sandbox.sandboxId,
                previewUrl,
                snapshotId,
                provider: 'vercel_sandbox',
                port,
                devCommand: cloud.devCommand,
                runtime: cloud.runtime,
            });
        } catch (error) {
            await sandbox.stop({ blocking: false }).catch(() => undefined);
            throw error;
        }

        return { sandboxId: sandbox.sandboxId, previewUrl, snapshotId, port };
    },
});

// ─── generateName ─────────────────────────────────────────────────────────────

/**
 * Generates a concise project name from a user prompt via OpenRouter.
 * Falls back to "New Project" on error or empty model response.
 */
export const generateName = action({
    args: { prompt: v.string() },
    handler: async (ctx, { prompt }): Promise<string> => {
        try {
            const me: any = await ctx.runQuery(api.users.me, {});
            if (!me) throw new Error('UNAUTHORIZED');

            const apiKey = process.env.OPENROUTER_API_KEY;
            if (!apiKey) return 'New Project';

            const MAX_NAME_LENGTH = 50;
            const body = {
                model: 'openai/gpt-5',
                messages: [
                    {
                        role: 'user',
                        content: `Generate a concise and meaningful project name (2-4 words maximum) that reflects the main purpose or theme of the project based on user's creation prompt. Generate only the project name, nothing else. Keep it short and descriptive. User's creation prompt: <prompt>${prompt}</prompt>`,
                    },
                ],
                max_tokens: 50,
            };
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
            });
            if (!res.ok) return 'New Project';
            const json = (await res.json()) as {
                choices?: { message?: { content?: string } }[];
            };
            const text = json.choices?.[0]?.message?.content?.trim() ?? '';
            if (text.length > 0 && text.length <= MAX_NAME_LENGTH) {
                return text;
            }
            return 'New Project';
        } catch (error) {
            console.error('Error generating project name:', error);
            return 'New Project';
        }
    },
});

// ─── fork ─────────────────────────────────────────────────────────────────────

/**
 * Forks a project. Historically duplicated each source branch's CodeSandbox
 * via `csb.sandboxes.create({source:'template', id})`; that path was removed
 * 2026-05-24 along with the rest of the CodeSandbox runtime.
 *
 * Native Vercel Sandbox fork: resume a fresh sandbox from the source project's
 * persisted snapshot, then insert a new project graph pointing at it (the same
 * graph `createBlank` builds). Powers "Clone project" and marketplace
 * "Use template" — for a template the snapshot IS the curated content, so the
 * clone is an exact copy of its current saved state.
 *
 * Caller must have project.view on the source project; create is gated on the
 * TARGET workspace (clone into the caller's workspace, not the source's — a
 * public template lives in another team's workspace).
 *
 * Limitations (clear errors, never a silent empty clone):
 *   - Next.js only — the provider's snapshot-resume fast path is nextjs-only;
 *     static-HTML would scaffold blank and lose content.
 *   - Requires a saved snapshot on the source's default branch.
 *   - Expired/invalid snapshot → the provider falls back to a blank scaffold
 *     (returns a different snapshotId); we detect that, clean up, and fail.
 */
export const fork = action({
    args: {
        projectId: v.id('projects'),
        name: v.optional(v.string()),
        workspaceId: v.optional(v.id('workspaces')),
    },
    handler: async (ctx, args): Promise<{ projectId: string }> => {
        const me: any = await ctx.runQuery(api.users.me, {});
        if (!me) throw new Error('UNAUTHORIZED');

        if (!process.env.VERCEL_TOKEN) {
            throw new Error(
                'VERCEL_TOKEN not configured. Vercel Sandbox is the only runtime; ' +
                    'set VERCEL_TEAM_ID, VERCEL_PROJECT_ID, and VERCEL_TOKEN ' +
                    '(see apps/web/client/.env.example).',
            );
        }

        // Load + read-gate the source (api.projects.get enforces view access).
        const source: any = await ctx.runQuery(api.projects.get, { projectId: args.projectId });
        if (!source) throw new Error('NOT_FOUND: project');

        const framework: string = source.runtimeMetadata?.framework ?? 'nextjs';
        if (framework !== 'nextjs') {
            throw new Error(
                `Cloning is only supported for Next.js projects right now (this one is "${framework}").`,
            );
        }

        // Source snapshot lives on the default branch's cloud runtime metadata.
        const branches: any[] = await ctx.runQuery(api.branches.getByProjectId, {
            projectId: args.projectId,
            onlyDefault: true,
        });
        const sourceSnapshotId: string | undefined =
            branches?.[0]?.runtimeMetadata?.cloud?.snapshotId;
        if (!sourceSnapshotId) {
            throw new Error(
                "This project can't be cloned yet — it has no saved sandbox snapshot. " +
                    'Open it once so it provisions, then try cloning again.',
            );
        }

        // Clone into the caller's workspace (NOT the source's), gated on create.
        const workspaceId: any =
            args.workspaceId ??
            (await ctx.runMutation(internal.projects._resolvePersonalWorkspaceForAction, {
                userId: me._id,
            }));
        await ctx.runQuery(internal.projects._requireProjectCreateCap, { workspaceId });

        const forkName = args.name ?? `${source.name ?? 'Project'} (copy)`;

        const stopSandbox = async (sandboxId: string) => {
            try {
                const credentials = {
                    teamId: process.env.VERCEL_TEAM_ID ?? '',
                    projectId: process.env.VERCEL_PROJECT_ID ?? '',
                    token: process.env.VERCEL_TOKEN ?? '',
                };
                if (credentials.teamId && credentials.projectId && credentials.token) {
                    const sandbox = await Sandbox.get({ sandboxId, ...credentials });
                    await sandbox.stop({ blocking: false }).catch(() => undefined);
                }
            } catch (cleanupErr) {
                console.warn('[fork] Vercel sandbox cleanup failed', cleanupErr);
            }
        };

        let provisionedSandboxId: string | null = null;
        try {
            const result = await VercelSandboxProvider.createProject({
                source: 'template',
                id: framework,
                framework,
                snapshotId: sourceSnapshotId,
                title: forkName,
                tags: ['fork', String(me._id)],
                privacy: 'private',
            });
            provisionedSandboxId = result.id;

            // Success returns the SAME snapshotId; a different one means resume
            // failed and the provider scaffolded a blank project. Fail rather
            // than hand back an empty clone (silent content loss).
            if (result.snapshotId !== sourceSnapshotId) {
                throw new Error(
                    "Couldn't clone this project: its saved snapshot has expired. " +
                        'Open the original once to refresh it, then try cloning again.',
                );
            }

            const projectId: string = await ctx.runMutation(internal.projects._insertProjectGraph, {
                userId: me._id,
                workspaceId,
                name: forkName,
                description: source.description ?? 'Cloned project',
                tags: ['fork'],
                framework,
                sandboxId: result.id,
                sandboxUrl: result.previewUrl ?? '',
                cloudProvider: 'vercel_sandbox',
                snapshotId: result.snapshotId,
                port: result.port ?? 3000,
                devCommand: result.devCommand,
                runtime: result.runtime,
            });

            provisionedSandboxId = null;
            return { projectId };
        } catch (error) {
            if (provisionedSandboxId) {
                await stopSandbox(provisionedSandboxId);
            }
            throw mapSandboxProvisionError(error);
        }
    },
});
