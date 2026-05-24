'use node';

import { v } from 'convex/values';

import { api, internal } from './_generated/api';
import { action } from './_generated/server';

// Node-only actions for the projects domain. These wrap external SDK calls
// (Firecrawl HTTP API, CodeSandbox / Vercel Sandbox SDKs, sharp image
// compression, OpenRouter LLM) and persist results through internal
// mutations.

// ─── captureScreenshot ────────────────────────────────────────────────────────

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
            // Fallback to the CSB convention when the frame URL hasn't been
            // resolved yet. Port 3000 is the Next.js default; non-Next projects
            // should have a frame URL set by the time the dashboard backfills,
            // so this fallback is the worst case.
            const url = frameUrl ?? `https://${defaultBranch.sandboxId}-3000.csb.app`;

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
                    timeout: 10000,
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
            // Dynamic import keeps sharp out of the bundle for non-screenshot
            // paths (it's a heavy native dep).
            const sharp = (await import('sharp')).default;
            const compressed = await sharp(Buffer.from(arrayBuffer))
                .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 80 })
                .toBuffer();

            // Upload to Convex File Storage.
            const blob = new Blob([new Uint8Array(compressed)], {
                type: 'image/jpeg',
            });
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
            console.error('Error capturing project screenshot:', error);
            return {
                success: false as const,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    },
});

// ─── createBlank ──────────────────────────────────────────────────────────────

/**
 * Creates a blank sandbox via the chosen code provider, then writes the
 * project graph via internal mutation. On insert failure, the sandbox is
 * destroyed to avoid leaking paid CodeSandbox / Vercel resources.
 */
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

        const framework = args.framework ?? 'nextjs';
        const cloudProvider =
            framework === 'nextjs' && process.env.WEBLAB_CLOUD_PROVIDER === 'vercel_sandbox'
                ? 'vercel_sandbox'
                : 'code_sandbox';

        // Template + port for the framework. CodeSandbox IDs MUST match the
        // canonical constants in packages/constants/src/csb.ts (this Convex
        // action can't import that package due to Node-only transitive deps,
        // so the literals are mirrored here — keep them in sync):
        //   nextjs      -> SandboxTemplates.BLANK.id        ('pf2nqh')
        //   static-html -> STATIC_HTML_SANDBOX_ID           ('html-qz83hv')
        // A wrong/empty template surfaces "Script not found 'dev'" and a
        // permanent 502 preview iframe. Non-nextjs frameworks always route to
        // code_sandbox (see cloudProvider above), so static-html's id matters.
        const FRAMEWORK_TEMPLATES: Record<string, { codesandboxId: string; port: number }> = {
            nextjs: { codesandboxId: 'pf2nqh', port: 3000 },
            'vite-react': { codesandboxId: 'vite-react-ts', port: 5173 },
            remix: { codesandboxId: 'remix', port: 3000 },
            astro: { codesandboxId: 'astro', port: 4321 },
            'tanstack-start': { codesandboxId: 'tanstack-start', port: 3000 },
            'static-html': { codesandboxId: 'html-qz83hv', port: 8080 },
        };
        const template = FRAMEWORK_TEMPLATES[framework] ?? FRAMEWORK_TEMPLATES.nextjs!;

        let forkedSandboxId: string | null = null;
        try {
            // Provision sandbox via CodeSandbox / Vercel Sandbox SDK.
            let sandboxId: string;
            let previewUrl: string;
            let port = template.port;
            if (cloudProvider === 'code_sandbox') {
                const csbKey = process.env.CSB_API_KEY;
                if (!csbKey) throw new Error('CSB_API_KEY not configured');
                const { CodeSandbox } = await import('@codesandbox/sdk');
                const csb = new CodeSandbox(csbKey);
                const sandbox = await csb.sandboxes.create({
                    source: 'template',
                    id: template.codesandboxId,
                    title: `Blank project - ${me._id}`,
                    tags: ['blank', String(me._id)],
                    privacy: 'private',
                });
                sandboxId = sandbox.id;
                forkedSandboxId = sandboxId;
                previewUrl = `https://${sandboxId}-${port}.csb.app`;
            } else {
                const vercelToken = process.env.VERCEL_TOKEN;
                if (!vercelToken) throw new Error('VERCEL_TOKEN not configured');
                const { Sandbox } = await import('@vercel/sandbox');
                const sandbox = await Sandbox.create({
                    token: vercelToken,
                    runtime: 'node22',
                    timeout: 1000 * 60 * 10,
                    ports: [port],
                });
                sandboxId = sandbox.sandboxId;
                forkedSandboxId = sandboxId;
                previewUrl = sandbox.domain(port);
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

            const projectId: string = await ctx.runMutation(internal.projects._insertProjectGraph, {
                userId: me._id,
                workspaceId,
                name: projectName,
                description: 'Your new blank project',
                tags: ['blank'],
                framework,
                sandboxId,
                sandboxUrl: previewUrl,
                cloudProvider,
                port,
            });

            forkedSandboxId = null;
            return { projectId };
        } catch (error) {
            if (forkedSandboxId) {
                try {
                    // Best-effort cleanup of orphaned sandbox.
                    if (cloudProvider === 'code_sandbox') {
                        const csbKey = process.env.CSB_API_KEY;
                        if (csbKey) {
                            const { CodeSandbox } = await import('@codesandbox/sdk');
                            const csb = new CodeSandbox(csbKey);
                            await csb.sandboxes.shutdown(forkedSandboxId).catch(() => undefined);
                        }
                    }
                    // Vercel sandboxes auto-expire; no explicit destroy needed.
                } catch (cleanupErr) {
                    console.warn('[createBlank] sandbox cleanup failed', cleanupErr);
                }
            }
            throw error;
        }
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
 * Forks a project — provisions a new sandbox per source branch via CSB,
 * then atomically writes the new project graph. Cleans up orphaned sandboxes
 * if the DB write fails.
 *
 * Caller must have project.view on the source project.
 */
export const fork = action({
    args: {
        projectId: v.id('projects'),
        name: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<{ projectId: string }> => {
        const me: any = await ctx.runQuery(api.users.me, {});
        if (!me) throw new Error('UNAUTHORIZED');

        const sourceProject: any = await ctx.runQuery(api.projects.get, {
            projectId: args.projectId,
        });
        if (!sourceProject) throw new Error('NOT_FOUND: source project');

        const sourceBranches: any[] = await ctx.runQuery(api.branches.getByProjectId, {
            projectId: args.projectId,
        });
        if (sourceBranches.length === 0) {
            throw new Error('Source project has no branches');
        }

        const csbKey = process.env.CSB_API_KEY;
        if (!csbKey) throw new Error('CSB_API_KEY not configured');
        const { CodeSandbox } = await import('@codesandbox/sdk');
        const csb = new CodeSandbox(csbKey);

        // Default port: extract from first frame, fall back to 3000.
        const defaultBranch = sourceBranches.find((b: any) => b.isDefault) ?? sourceBranches[0]!;
        const frameUrl: string = defaultBranch.frames[0]?.url ?? '';
        const portMatch = /https:\/\/[^-]+-(\d+)\.csb\.app/.exec(frameUrl);
        const port = portMatch ? parseInt(portMatch[1]!, 10) : 3000;

        // Fork all source sandboxes in parallel.
        const createdSandboxIds: string[] = [];
        let newProjectId: string | null = null;
        try {
            const forkedMappings: Array<{
                sourceBranch: any;
                newSandboxId: string;
                newSandboxUrl: string;
            }> = await Promise.all(
                sourceBranches.map(async (branch: any) => {
                    const newSandbox = await csb.sandboxes.create({
                        source: 'template',
                        id: branch.sandboxId,
                        title: `${sourceProject.name} (Fork) - ${branch.name}`,
                        tags: ['template-fork'],
                        privacy: 'private',
                    });
                    createdSandboxIds.push(newSandbox.id);
                    const url = `https://${newSandbox.id}-${port}.csb.app`;
                    return {
                        sourceBranch: branch,
                        newSandboxId: newSandbox.id,
                        newSandboxUrl: url,
                    };
                }),
            );

            // Resolve workspace via internal personal-workspace helper.
            const workspaceId: any = await ctx.runMutation(
                internal.projects._resolvePersonalWorkspaceForAction,
                { userId: me._id },
            );

            // Write the project + default branch via the existing internal
            // mutation. Additional branches are added afterwards.
            const defaultMapping =
                forkedMappings.find((m) => m.sourceBranch.isDefault) ?? forkedMappings[0]!;
            newProjectId = await ctx.runMutation(internal.projects._insertProjectGraph, {
                userId: me._id,
                workspaceId,
                name: args.name ?? `${sourceProject.name} (Copy)`,
                description: sourceProject.description ?? '',
                tags: (sourceProject.tags ?? []).filter((t: string) => t !== 'template'),
                framework: sourceProject.runtimeMetadata?.framework ?? 'nextjs',
                sandboxId: defaultMapping.newSandboxId,
                sandboxUrl: defaultMapping.newSandboxUrl,
                cloudProvider: 'code_sandbox',
                port,
            });

            // Insert any additional branches (non-default).
            for (const m of forkedMappings) {
                if (m === defaultMapping) continue;
                await ctx.runMutation(api.branches.create, {
                    projectId: newProjectId as any,
                    name: m.sourceBranch.name,
                    description: m.sourceBranch.description ?? undefined,
                    isDefault: false,
                    sandboxId: m.newSandboxId,
                    runtimeType: 'cloud',
                });
            }

            return { projectId: newProjectId as string };
        } catch (error) {
            // Best-effort sandbox cleanup.
            await Promise.allSettled(
                createdSandboxIds.map((id) => csb.sandboxes.shutdown(id).catch(() => undefined)),
            );
            throw error;
        }
    },
});
