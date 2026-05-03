import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
    CodeProvider,
    createCodeProviderClient,
    getStaticCodeProvider,
} from '@weblab/code-provider';
import { APP_NAME, DEFAULT_NEW_PROJECT_TEMPLATE, getSandboxPreviewUrl } from '@weblab/constants';
import { shortenUuid } from '@weblab/utility/src/id';

import { createTRPCRouter, protectedProcedure } from '../../trpc';

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
        .mutation(async ({ input }) => {
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
        .mutation(async ({ input }) => {
            const provider = await getProvider({ sandboxId: input.sandboxId });
            try {
                await provider.stopProject({});
            } finally {
                await provider.destroy().catch(() => {});
            }
        }),
    createFromGitHub: protectedProcedure
        .input(
            z.object({
                repoUrl: z.string(),
                branch: z.string(),
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
