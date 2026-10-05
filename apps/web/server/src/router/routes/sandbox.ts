import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import type * as sandbox from '../../sandbox';
import { requireUserId } from '../context';
import { publicProcedure, router } from '../trpc';

// Cloud sandbox access needs project-scoped authorization. The local desktop
// release does not use these procedures. Preserve the public contracts so
// old clients fail before a remote sandbox is read, changed, or charged.
function cloudSandboxUnavailable<T>(): T {
    throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Cloud sandbox access is unavailable until project authorization is implemented.',
    });
}

export const sandboxRouter = router({
    create: publicProcedure.input(z.string()).mutation(() => cloudSandboxUnavailable<string>()),
    start: publicProcedure.input(z.string()).mutation(() => cloudSandboxUnavailable<string>()),
    stop: publicProcedure.input(z.string()).mutation(() => cloudSandboxUnavailable<{
        success: boolean; message: string; timestamp: string;
    }>()),
    status: publicProcedure.input(z.string()).query(() => cloudSandboxUnavailable<{
        id: string; status: string; details: { cpu: string; memory: string }; uptime: number;
    }>()),

    fileList: publicProcedure
        .input(z.object({ sandboxId: z.string(), path: z.string() }))
        .query(({ ctx }) => {
            requireUserId(ctx);
            return cloudSandboxUnavailable<Awaited<ReturnType<typeof sandbox.fileList>>>();
        }),
    fileRead: publicProcedure
        .input(z.object({ sandboxId: z.string(), path: z.string() }))
        .query(({ ctx }) => {
            requireUserId(ctx);
            return cloudSandboxUnavailable<Awaited<ReturnType<typeof sandbox.fileRead>>>();
        }),
    fileStat: publicProcedure
        .input(z.object({ sandboxId: z.string(), path: z.string() }))
        .query(({ ctx }) => {
            requireUserId(ctx);
            return cloudSandboxUnavailable<Awaited<ReturnType<typeof sandbox.fileStat>>>();
        }),
    fileWrite: publicProcedure
        .input(z.object({
            sandboxId: z.string(),
            path: z.string(),
            content: z.string(),
            overwrite: z.boolean().optional(),
            encoding: z.enum(['utf8', 'base64']).optional(),
        }))
        .mutation(({ ctx }) => {
            requireUserId(ctx);
            return cloudSandboxUnavailable<Awaited<ReturnType<typeof sandbox.fileWrite>>>();
        }),
    fileDelete: publicProcedure
        .input(z.object({ sandboxId: z.string(), path: z.string(), recursive: z.boolean().optional() }))
        .mutation(({ ctx }) => {
            requireUserId(ctx);
            return cloudSandboxUnavailable<{ success: boolean }>();
        }),
    fileMkdir: publicProcedure
        .input(z.object({ sandboxId: z.string(), path: z.string() }))
        .mutation(({ ctx }) => {
            requireUserId(ctx);
            return cloudSandboxUnavailable<{ success: boolean }>();
        }),
    commandRun: publicProcedure
        .input(z.object({ sandboxId: z.string(), command: z.string() }))
        .mutation(({ ctx }) => {
            requireUserId(ctx);
            return cloudSandboxUnavailable<{ output: string; exitCode: number }>();
        }),
    setup: publicProcedure
        .input(z.object({
            sandboxId: z.string(),
            port: z.number().int().positive().max(65_535).optional(),
            devCommand: z.string().trim().min(1).optional(),
        }))
        .mutation(({ ctx }) => {
            requireUserId(ctx);
            return cloudSandboxUnavailable<{ success: boolean }>();
        }),
});
