'use node';

import { Sandbox } from '@vercel/sandbox';
import { ConvexError, v } from 'convex/values';

import {
    getNextJsScaffoldFiles,
    VercelSandboxProvider,
    WEBLAB_NEXTJS_GLOBALS_CSS,
} from '@weblab/code-provider';
import {
    asStyleGuideTokens,
    buildEmitFiles,
    mergeEmitDeps,
    styleGuideToGlobalsAppend,
    type EmitPage,
} from '@weblab/wireframe-blocks';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { action } from './_generated/server';
import { mapSandboxProvisionError } from './lib/sandboxErrors';

// =============================================================================
// Code emit — turn a wireframe doc into a REAL Next.js project on Vercel Sandbox.
// Mirrors the proven projectActions.createFromFigma path: create a blank Next.js
// project from the template, overlay the generated pages + self-contained block
// sources + style-guide globals, then insert the project graph. The client
// navigates into the standard editor at /project/<newId>.
// =============================================================================

export const emitToCloud = action({
    args: { docId: v.id('wireframeDocs') },
    handler: async (ctx, { docId }): Promise<{ projectId: string }> => {
        const me = await ctx.runQuery(api.users.me, {});
        if (!me) throw new Error('UNAUTHORIZED');

        const data = await ctx.runQuery(internal.wireframes._getWireframeForEmit, { docId });
        if (data.wireframePages.length === 0) {
            throw new ConvexError({
                code: 'BAD_REQUEST',
                message: 'Generate wireframes before creating code.',
            });
        }

        const teamId = process.env.VERCEL_TEAM_ID;
        const vercelProjectId = process.env.VERCEL_PROJECT_ID;
        const token = process.env.VERCEL_TOKEN;
        if (!teamId || !vercelProjectId || !token) {
            throw new Error(
                'VERCEL_TOKEN not configured. Set VERCEL_TEAM_ID, VERCEL_PROJECT_ID, and VERCEL_TOKEN.',
            );
        }

        // Build the overlay file set from the wireframe pages + active style guide.
        const sortedPages = [...data.wireframePages].sort((a, b) => a.order - b.order);
        const emitPages: EmitPage[] = sortedPages.map((page) => ({
            slug: page.slug,
            title: page.title,
            sections: data.wireframeSections
                .filter((s) => s.wireframePageId === page._id)
                .sort((a, b) => a.order - b.order)
                .map((s) => ({ blockId: s.blockId, content: s.content })),
        }));
        const globalsCss =
            WEBLAB_NEXTJS_GLOBALS_CSS + styleGuideToGlobalsAppend(asStyleGuideTokens(data.activeTokens));
        const files = buildEmitFiles(emitPages, { globalsCss });

        // Add the shadcn primitive deps (radix/lucide/cva/clsx/tailwind-merge) to
        // the scaffold's package.json so `bun install` can resolve the emitted
        // real shadcn components.
        const basePkg =
            getNextJsScaffoldFiles().find((f) => f.path === 'package.json')?.content ?? '{}';
        files.push({ path: 'package.json', content: mergeEmitDeps(basePkg) });

        const projectName = data.brief.companyName?.trim() || 'Wireframe site';

        let provisionedSandboxId: string | null = null;
        try {
            const result = await VercelSandboxProvider.createProject({
                source: 'template',
                id: 'nextjs',
                framework: 'nextjs',
                title: `${projectName} - ${me._id}`,
                tags: ['wireframe', String(me._id)],
                privacy: 'private',
                snapshotId: process.env.VERCEL_BLANK_SNAPSHOT_ID,
            });

            const sandboxId = result.id;
            provisionedSandboxId = sandboxId;
            const previewUrl = result.previewUrl ?? '';
            const port = result.port ?? 3000;
            if (!previewUrl) {
                throw new Error('Sandbox was created but returned no preview URL.');
            }

            const sandbox = await Sandbox.get({ sandboxId, teamId, projectId: vercelProjectId, token });
            await sandbox.writeFiles(files.map((f) => ({ path: f.path, content: f.content })));

            // Install the newly added shadcn/radix deps so the dev server resolves
            // the emitted real components. (The base deps are pre-installed in the
            // snapshot; this only fetches the additions.)
            const install = await sandbox.runCommand({
                cmd: 'bash',
                args: ['-lc', 'bun install'],
                cwd: '/vercel/sandbox',
            });
            if (install.exitCode !== 0) {
                const out = await install.output('both');
                throw new Error(
                    `[wireframeEmit] dependency install failed (exit ${install.exitCode}): ${out.slice(0, 800)}`,
                );
            }

            const workspaceId: Id<'workspaces'> = await ctx.runMutation(
                internal.projects._resolvePersonalWorkspaceForAction,
                { userId: me._id },
            );

            const projectId: string = await ctx.runMutation(internal.projects._insertProjectGraph, {
                userId: me._id,
                workspaceId,
                name: projectName,
                description: 'Created from AI wireframes',
                tags: ['wireframe'],
                framework: 'nextjs',
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
                    const sandbox = await Sandbox.get({
                        sandboxId: provisionedSandboxId,
                        teamId,
                        projectId: vercelProjectId,
                        token,
                    });
                    await sandbox.stop({ blocking: false }).catch(() => undefined);
                } catch (cleanupErr) {
                    console.warn('[wireframeEmit] Vercel sandbox cleanup failed', cleanupErr);
                }
            }
            throw mapSandboxProvisionError(error);
        }
    },
});
