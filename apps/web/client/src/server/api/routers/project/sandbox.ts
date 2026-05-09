import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { DrizzleDb } from '@weblab/db';
import {
    CodeProvider,
    createCodeProviderClient,
    getStaticCodeProvider,
} from '@weblab/code-provider';
import { APP_NAME, DEFAULT_NEW_PROJECT_TEMPLATE, getSandboxPreviewUrl } from '@weblab/constants';
import { branches } from '@weblab/db';
import { shortenUuid } from '@weblab/utility/src/id';

import { createTRPCRouter, protectedProcedure } from '../../trpc';
import { verifyProjectAccess } from './helper';

async function verifySandboxAccess(db: DrizzleDb, userId: string, sandboxId: string) {
    const branch = await db.query.branches.findFirst({
        where: eq(branches.sandboxId, sandboxId),
    });
    if (!branch) {
        throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sandbox not found',
        });
    }
    await verifyProjectAccess(db, userId, branch.projectId);
}

const SANDBOX_PRIVACY = 'private' as const;

function getProvider({
    sandboxId,
    userId,
    provider = CodeProvider.CodeSandbox,
}: {
    sandboxId: string;
    provider?: CodeProvider;
    userId?: undefined | string;
}) {
    if (provider === CodeProvider.CodeSandbox) {
        return createCodeProviderClient(CodeProvider.CodeSandbox, {
            providerOptions: {
                codesandbox: {
                    sandboxId,
                    userId,
                },
            },
        });
    } else {
        return createCodeProviderClient(CodeProvider.NodeFs, {
            providerOptions: {
                nodefs: {},
            },
        });
    }
}

export const sandboxRouter = createTRPCRouter({
    create: protectedProcedure
        .input(
            z.object({
                title: z.string().optional(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            // Create a new sandbox using the static provider
            const CodesandboxProvider = await getStaticCodeProvider(CodeProvider.CodeSandbox);

            const newSandbox = await CodesandboxProvider.createProject({
                source: 'template',
                id: DEFAULT_NEW_PROJECT_TEMPLATE.id,
                title: input.title || `${APP_NAME} Test Sandbox`,
                description: `Test sandbox for ${APP_NAME} sync engine`,
                tags: ['weblab-test'],
                privacy: SANDBOX_PRIVACY,
            });

            return {
                sandboxId: newSandbox.id,
                previewUrl: getSandboxPreviewUrl(
                    newSandbox.id,
                    DEFAULT_NEW_PROJECT_TEMPLATE.port,
                    newSandbox.previewToken,
                ),
            };
        }),

    start: protectedProcedure
        .input(
            z.object({
                sandboxId: z.string(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const userId = ctx.user.id;
            await verifySandboxAccess(ctx.db, userId, input.sandboxId);
            const provider = await getProvider({
                sandboxId: input.sandboxId,
                userId,
            });
            const session = await provider.createSession({
                args: {
                    id: shortenUuid(userId, 20),
                },
            });
            await provider.destroy();
            return session;
        }),
    hibernate: protectedProcedure
        .input(
            z.object({
                sandboxId: z.string(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            await verifySandboxAccess(ctx.db, ctx.user.id, input.sandboxId);
            const provider = await getProvider({ sandboxId: input.sandboxId });
            try {
                await provider.pauseProject({});
            } finally {
                await provider.destroy().catch(() => {});
            }
        }),
    list: protectedProcedure.input(z.object({ sandboxId: z.string() })).query(async ({ input }) => {
        const provider = await getProvider({ sandboxId: input.sandboxId });
        const res = await provider.listProjects({});
        // TODO future iteration of code provider abstraction will need this code to be refactored
        if ('projects' in res) {
            return res.projects;
        }
        return [];
    }),
    fork: protectedProcedure
        .input(
            z.object({
                sandbox: z.object({
                    id: z.string(),
                    port: z.number(),
                }),
                config: z
                    .object({
                        title: z.string().optional(),
                        tags: z.array(z.string()).optional(),
                    })
                    .optional(),
            }),
        )
        .mutation(async ({ input }) => {
            const MAX_RETRY_ATTEMPTS = 3;
            let lastError: Error | null = null;

            for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
                try {
                    const CodesandboxProvider = await getStaticCodeProvider(
                        CodeProvider.CodeSandbox,
                    );
                    const sandbox = await CodesandboxProvider.createProject({
                        source: 'template',
                        id: input.sandbox.id,

                        // Metadata
                        title: input.config?.title,
                        tags: input.config?.tags,
                        privacy: SANDBOX_PRIVACY,
                    });

                    const previewUrl = getSandboxPreviewUrl(
                        sandbox.id,
                        input.sandbox.port,
                        sandbox.previewToken,
                    );

                    return {
                        sandboxId: sandbox.id,
                        previewUrl,
                    };
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));

                    if (attempt < MAX_RETRY_ATTEMPTS) {
                        await new Promise((resolve) =>
                            setTimeout(resolve, Math.pow(2, attempt) * 1000),
                        );
                    }
                }
            }

            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to create sandbox after ${MAX_RETRY_ATTEMPTS} attempts: ${lastError?.message}`,
                cause: lastError,
            });
        }),
    delete: protectedProcedure
        .input(
            z.object({
                sandboxId: z.string(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            await verifySandboxAccess(ctx.db, ctx.user.id, input.sandboxId);
            const provider = await getProvider({ sandboxId: input.sandboxId });
            try {
                await provider.stopProject({});
            } finally {
                await provider.destroy().catch(() => {});
            }
        }),
    /**
     * Best-effort cleanup for sandboxes that were forked but never attached to
     * a project (e.g. project.create failed, walkFiles threw, user closed the
     * tab mid-import). The regular `delete` endpoint requires an owning branch
     * row, which orphans by definition do not have, so it would always reject.
     *
     * Safety: we still refuse if ANY branch row references the sandbox — that
     * would be a real, owned project and must go through `delete` with proper
     * ownership checks.
     */
    deleteOrphan: protectedProcedure
        .input(
            z.object({
                sandboxId: z.string(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const branch = await ctx.db.query.branches.findFirst({
                where: eq(branches.sandboxId, input.sandboxId),
            });
            if (branch) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message:
                        'Sandbox is attached to a project; use sandbox.delete with project ownership.',
                });
            }
            const provider = await getProvider({ sandboxId: input.sandboxId });
            try {
                await provider.stopProject({}).catch(() => {});
            } finally {
                await provider.destroy().catch(() => {});
            }
        }),
    createFromGitHub: protectedProcedure
        .input(
            z.object({
                repoUrl: z.string(),
                branch: z.string(),
                subpath: z.string().optional(),
            }),
        )
        .mutation(async ({ input }) => {
            const MAX_RETRY_ATTEMPTS = 3;
            const DEFAULT_PORT = 3000;
            let lastError: Error | null = null;

            for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
                try {
                    const CodesandboxProvider = await getStaticCodeProvider(
                        CodeProvider.CodeSandbox,
                    );
                    const sandbox = await CodesandboxProvider.createProjectFromGit({
                        repoUrl: input.repoUrl,
                        branch: input.branch,
                        subpath: input.subpath,
                        privacy: SANDBOX_PRIVACY,
                    });

                    const previewUrl = getSandboxPreviewUrl(
                        sandbox.id,
                        DEFAULT_PORT,
                        sandbox.previewToken,
                    );

                    return {
                        sandboxId: sandbox.id,
                        previewUrl,
                    };
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));

                    if (attempt < MAX_RETRY_ATTEMPTS) {
                        await new Promise((resolve) =>
                            setTimeout(resolve, Math.pow(2, attempt) * 1000),
                        );
                    }
                }
            }

            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to create GitHub sandbox after ${MAX_RETRY_ATTEMPTS} attempts: ${lastError?.message}`,
                cause: lastError,
            });
        }),
});
