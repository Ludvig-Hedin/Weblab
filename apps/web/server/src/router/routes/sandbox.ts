import { z } from 'zod';

import * as sandbox from '../../sandbox';
import { requireUserId } from '../context';
import { publicProcedure, router } from '../trpc';

// Editor → Fastify sandbox proxy. The browser `VercelBrowserProvider` calls
// these over the authed tRPC WS client (sandbox-server-client.ts). Each file/
// command procedure requires a verified Clerk user (requireUserId) so an
// unauthenticated caller can never reach the Vercel Sandbox SDK.
//
// TODO(security): add per-sandbox OWNERSHIP — resolve sandboxId → project and
// assert the caller has `project.edit`. Currently any signed-in user who knows
// a (random, unguessable) sandboxId could reach it. Acceptable only because
// sandboxIds are non-enumerable and there are no real users yet; MUST land
// before broad use. Needs a Convex client in this server.
export const sandboxRouter = router({
    // ── Legacy lifecycle stubs (kept; not used by the editor) ──────────────
    create: publicProcedure.input(z.string()).mutation(({ input }) => {
        return `hi ${input}`;
    }),
    start: publicProcedure.input(z.string()).mutation(({ input }) => {
        return `hi ${input}`;
    }),
    stop: publicProcedure.input(z.string()).mutation(({ input }) => {
        return {
            success: true,
            message: `Sandbox ${input} stopped`,
            timestamp: new Date().toISOString(),
        };
    }),
    status: publicProcedure.input(z.string()).query(({ input }) => {
        return {
            id: input,
            status: 'running',
            details: { cpu: '5%', memory: '120MB' },
            uptime: 1200,
        };
    }),

    // ── File ops (authed) ──────────────────────────────────────────────────
    fileList: publicProcedure
        .input(z.object({ sandboxId: z.string(), path: z.string() }))
        .query(async ({ input, ctx }) => {
            requireUserId(ctx);
            return sandbox.fileList(input.sandboxId, input.path);
        }),

    fileRead: publicProcedure
        .input(z.object({ sandboxId: z.string(), path: z.string() }))
        .query(async ({ input, ctx }) => {
            requireUserId(ctx);
            return sandbox.fileRead(input.sandboxId, input.path);
        }),

    fileStat: publicProcedure
        .input(z.object({ sandboxId: z.string(), path: z.string() }))
        .query(async ({ input, ctx }) => {
            requireUserId(ctx);
            return sandbox.fileStat(input.sandboxId, input.path);
        }),

    fileWrite: publicProcedure
        .input(
            z.object({
                sandboxId: z.string(),
                path: z.string(),
                content: z.string(),
                overwrite: z.boolean().optional(),
                // 'base64' for binary import assets; defaults to utf8 text.
                encoding: z.enum(['utf8', 'base64']).optional(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            requireUserId(ctx);
            return sandbox.fileWrite(input.sandboxId, input.path, input.content, input.encoding);
        }),

    fileDelete: publicProcedure
        .input(
            z.object({
                sandboxId: z.string(),
                path: z.string(),
                recursive: z.boolean().optional(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            requireUserId(ctx);
            await sandbox.fileDelete(input.sandboxId, input.path, input.recursive);
            return { success: true };
        }),

    fileMkdir: publicProcedure
        .input(z.object({ sandboxId: z.string(), path: z.string() }))
        .mutation(async ({ input, ctx }) => {
            requireUserId(ctx);
            await sandbox.fileMkdir(input.sandboxId, input.path);
            return { success: true };
        }),

    // ── Command + lifecycle (authed) ────────────────────────────────────────
    commandRun: publicProcedure
        .input(z.object({ sandboxId: z.string(), command: z.string() }))
        .mutation(async ({ input, ctx }) => {
            requireUserId(ctx);
            const { output, exitCode } = await sandbox.commandRun(input.sandboxId, input.command);
            return { output, exitCode };
        }),

    setup: publicProcedure
        .input(z.object({ sandboxId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            requireUserId(ctx);
            await sandbox.setup(input.sandboxId);
            return { success: true };
        }),
});
