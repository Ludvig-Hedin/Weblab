import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { Capability } from '@weblab/auth';
import type { DrizzleDb } from '@weblab/db';
import {
    CodeProvider,
    createCodeProviderClient,
    getStaticCodeProvider,
} from '@weblab/code-provider';
import {
    APP_NAME,
    DEFAULT_NEW_PROJECT_TEMPLATE,
    getSandboxPreviewUrl,
    PUBLIC_TEMPLATE_SANDBOX_IDS,
} from '@weblab/constants';
import { branches } from '@weblab/db';
import { shortenUuid } from '@weblab/utility/src/id';

import { env } from '@/env';
import { requireCap } from '../../permissions/requireCap';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

/**
 * SECURITY: defaults to `project.update` because every sandbox path that
 * isn't a pure read can run user-supplied commands or write files — RCE
 * surface. Read-only callers (the `list` query) must pass `'project.view'`
 * explicitly. Do NOT add a new caller without picking a cap.
 */
async function verifySandboxAccess(
    db: DrizzleDb,
    userId: string,
    sandboxId: string,
    cap: Capability = 'project.update',
) {
    const branch = await db.query.branches.findFirst({
        where: eq(branches.sandboxId, sandboxId),
    });
    if (!branch) {
        throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Sandbox not found',
        });
    }
    await requireCap(db, userId, cap, { projectId: branch.projectId });
    return branch;
}

const SANDBOX_PRIVACY = 'private' as const;
const DEFAULT_PORT = 3000;

type CloudProvider = 'code_sandbox' | 'vercel_sandbox';
const cloudProviderSchema = z.enum(['code_sandbox', 'vercel_sandbox']);
const vercelProvider = CodeProvider.VercelSandbox;

function toCodeProvider(provider: CloudProvider): CodeProvider {
    return provider === 'vercel_sandbox' ? CodeProvider.VercelSandbox : CodeProvider.CodeSandbox;
}

function getConfiguredCloudProvider(): CodeProvider {
    return toCodeProvider(env.WEBLAB_CLOUD_PROVIDER);
}

function getRequestedCloudProvider(provider?: CloudProvider): CodeProvider {
    return provider ? toCodeProvider(provider) : getConfiguredCloudProvider();
}

function getBranchCloudProvider(branch: { runtimeMetadata: unknown }): CodeProvider {
    const metadata = branch.runtimeMetadata as
        | { cloud?: { provider?: CloudProvider | null } }
        | null
        | undefined;
    return metadata?.cloud?.provider === 'vercel_sandbox'
        ? CodeProvider.VercelSandbox
        : CodeProvider.CodeSandbox;
}

function getBranchCloudRuntime(branch: { runtimeMetadata: unknown }) {
    const metadata = branch.runtimeMetadata as
        | {
              cloud?: {
                  provider?: CloudProvider | null;
                  sandboxId?: string | null;
                  previewUrl?: string | null;
                  snapshotId?: string | null;
                  port?: number | null;
                  devCommand?: string | null;
                  runtime?: string | null;
              };
          }
        | null
        | undefined;
    return metadata?.cloud;
}

function getPreviewUrl({
    provider,
    sandboxId,
    port,
    previewToken,
    previewUrl,
}: {
    provider: CodeProvider;
    sandboxId: string;
    port: number;
    previewToken?: string;
    previewUrl?: string;
}) {
    return provider === CodeProvider.VercelSandbox && previewUrl
        ? previewUrl
        : getSandboxPreviewUrl(sandboxId, port, previewToken);
}

function getSandboxRuntime({
    provider,
    sandbox,
    port,
}: {
    provider: CodeProvider;
    sandbox: {
        id: string;
        snapshotId?: string;
        previewUrl?: string;
        port?: number;
        devCommand?: string;
        runtime?: string;
    };
    port: number;
}): {
    provider: CloudProvider;
    sandboxId: string;
    previewUrl?: string;
    snapshotId?: string;
    port: number;
    devCommand?: string;
    runtime?: string;
} {
    return {
        provider: provider === CodeProvider.VercelSandbox ? 'vercel_sandbox' : 'code_sandbox',
        sandboxId: sandbox.id,
        previewUrl: sandbox.previewUrl,
        snapshotId: sandbox.snapshotId,
        port: sandbox.port ?? port,
        devCommand: sandbox.devCommand,
        runtime: sandbox.runtime,
    };
}

function getProvider({
    sandboxId,
    userId,
    provider = CodeProvider.CodeSandbox,
    snapshotId,
    port,
    devCommand,
    runtime,
}: {
    sandboxId: string;
    provider?: CodeProvider;
    userId?: undefined | string;
    snapshotId?: string | null;
    port?: number | null;
    devCommand?: string | null;
    runtime?: string | null;
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
    }

    if (provider === CodeProvider.VercelSandbox) {
        return createCodeProviderClient(CodeProvider.VercelSandbox, {
            providerOptions: {
                vercelSandbox: {
                    sandboxId,
                    snapshotId,
                    userId,
                    port: port ?? DEFAULT_PORT,
                    devCommand,
                    runtime,
                },
            },
        });
    }

    return createCodeProviderClient(CodeProvider.NodeFs, {
        providerOptions: {
            nodefs: {},
        },
    });
}

async function getOwnedVercelProvider({
    db,
    userId,
    sandboxId,
}: {
    db: DrizzleDb;
    userId: string;
    sandboxId: string;
}) {
    const branch = await verifySandboxAccess(db, userId, sandboxId);
    if (getBranchCloudProvider(branch) !== vercelProvider) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'This sandbox is not backed by Vercel Sandbox.',
        });
    }
    const cloud = getBranchCloudRuntime(branch);
    return getProvider({
        sandboxId: cloud?.sandboxId ?? sandboxId,
        provider: vercelProvider,
        snapshotId: cloud?.snapshotId,
        port: cloud?.port,
        devCommand: cloud?.devCommand,
        runtime: cloud?.runtime,
    });
}

const sandboxIdInput = z.object({
    sandboxId: z.string(),
});

export const sandboxRouter = createTRPCRouter({
    create: protectedProcedure
        .input(
            z.object({
                title: z.string().optional(),
                provider: cloudProviderSchema.optional(),
            }),
        )
        .mutation(async ({ input }) => {
            // Create a new sandbox using the static provider
            const cloudProvider = getRequestedCloudProvider(input.provider);
            const StaticProvider = await getStaticCodeProvider(cloudProvider);

            const newSandbox = await StaticProvider.createProject({
                source: 'template',
                id: DEFAULT_NEW_PROJECT_TEMPLATE.id,
                title: input.title ?? `${APP_NAME} Test Sandbox`,
                description: `Test sandbox for ${APP_NAME} sync engine`,
                tags: ['weblab-test'],
                privacy: SANDBOX_PRIVACY,
                port: DEFAULT_NEW_PROJECT_TEMPLATE.port,
            });

            return {
                sandboxId: newSandbox.id,
                previewUrl: getPreviewUrl({
                    provider: cloudProvider,
                    sandboxId: newSandbox.id,
                    port: DEFAULT_NEW_PROJECT_TEMPLATE.port,
                    previewToken: newSandbox.previewToken,
                    previewUrl: newSandbox.previewUrl,
                }),
                sandboxRuntime: getSandboxRuntime({
                    provider: cloudProvider,
                    sandbox: newSandbox,
                    port: DEFAULT_NEW_PROJECT_TEMPLATE.port,
                }),
            };
        }),

    start: protectedProcedure
        .input(
            z.object({
                sandboxId: z.string(),
                provider: cloudProviderSchema.optional(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const userId = ctx.user.id;
            const branch = await verifySandboxAccess(ctx.db, userId, input.sandboxId);
            const branchCloudRuntime = getBranchCloudRuntime(branch);
            const provider = await getProvider({
                sandboxId: input.sandboxId,
                userId,
                provider: getBranchCloudProvider(branch),
                snapshotId: branchCloudRuntime?.snapshotId,
                port: branchCloudRuntime?.port,
                devCommand: branchCloudRuntime?.devCommand,
                runtime: branchCloudRuntime?.runtime,
            });
            try {
                const session = await provider.createSession({
                    args: {
                        id: shortenUuid(userId, 20),
                    },
                });
                if (
                    getBranchCloudProvider(branch) === vercelProvider &&
                    session.sandboxId &&
                    session.sandboxId !== input.sandboxId
                ) {
                    const nextRuntimeMetadata = {
                        ...(branch.runtimeMetadata as object | null | undefined),
                        cloud: {
                            ...branchCloudRuntime,
                            provider: 'vercel_sandbox' as const,
                            sandboxId: session.sandboxId,
                            previewUrl: session.previewUrl ?? branchCloudRuntime?.previewUrl,
                        },
                    };
                    await ctx.db
                        .update(branches)
                        .set({
                            sandboxId: session.sandboxId,
                            runtimeMetadata: nextRuntimeMetadata,
                            updatedAt: new Date(),
                        })
                        .where(eq(branches.id, branch.id));
                }
                return {
                    ...session,
                    sandboxId: session.sandboxId ?? input.sandboxId,
                };
            } finally {
                await provider.destroy().catch(() => undefined);
            }
        }),
    hibernate: protectedProcedure
        .input(
            z.object({
                sandboxId: z.string(),
                provider: cloudProviderSchema.optional(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const branch = await verifySandboxAccess(ctx.db, ctx.user.id, input.sandboxId);
            const provider = await getProvider({
                sandboxId: input.sandboxId,
                provider: getBranchCloudProvider(branch),
            });
            try {
                await provider.pauseProject({});
            } finally {
                await provider.destroy().catch(() => undefined);
            }
        }),
    list: protectedProcedure
        .input(z.object({ sandboxId: z.string() }))
        .query(async ({ input, ctx }) => {
            // CR-118: verify caller owns the sandbox before listing its projects.
            const branch = await verifySandboxAccess(
                ctx.db,
                ctx.user.id,
                input.sandboxId,
                'project.view',
            );
            const provider = await getProvider({
                sandboxId: input.sandboxId,
                provider: getBranchCloudProvider(branch),
            });
            try {
                const res = await provider.listProjects({});
                // TODO future iteration of code provider abstraction will need this code to be refactored
                if ('projects' in res) {
                    return res.projects;
                }
                return [];
            } finally {
                await provider.destroy().catch(() => undefined);
            }
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
                provider: cloudProviderSchema.optional(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            // CR-118: verify caller owns the source sandbox before forking it.
            // Exception: canonical public templates (the BLANK seed + pre-seeded
            // external templates) are intentionally fork-anyone — they have no
            // `branches` row, so the ownership lookup would always reject them
            // and break new-project creation.
            if (!PUBLIC_TEMPLATE_SANDBOX_IDS.has(input.sandbox.id)) {
                await verifySandboxAccess(ctx.db, ctx.user.id, input.sandbox.id);
            }
            const MAX_RETRY_ATTEMPTS = 3;
            let lastError: Error | null = null;

            for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
                try {
                    const cloudProvider = getRequestedCloudProvider(input.provider);
                    const StaticProvider = await getStaticCodeProvider(cloudProvider);
                    const sandbox = await StaticProvider.createProject({
                        source: 'template',
                        id: input.sandbox.id,

                        // Metadata
                        title: input.config?.title,
                        tags: input.config?.tags,
                        privacy: SANDBOX_PRIVACY,
                        port: input.sandbox.port,
                    });

                    const previewUrl = getPreviewUrl({
                        provider: cloudProvider,
                        sandboxId: sandbox.id,
                        port: input.sandbox.port,
                        previewToken: sandbox.previewToken,
                        previewUrl: sandbox.previewUrl,
                    });

                    return {
                        sandboxId: sandbox.id,
                        previewUrl,
                        sandboxRuntime: getSandboxRuntime({
                            provider: cloudProvider,
                            sandbox,
                            port: input.sandbox.port,
                        }),
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
                provider: cloudProviderSchema.optional(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const branch = await verifySandboxAccess(ctx.db, ctx.user.id, input.sandboxId);
            const provider = await getProvider({
                sandboxId: input.sandboxId,
                provider: getBranchCloudProvider(branch),
            });
            try {
                await provider.stopProject({});
            } finally {
                await provider.destroy().catch(() => undefined);
            }
        }),
    /**
     * Open a session against a sandbox that was just forked but is not yet
     * attached to a project. Required by the local-folder import flow, which
     * needs to upload files into the sandbox BEFORE calling `project.create`
     * (so the project row references a sandbox that already has the user's
     * code). The regular `start` endpoint runs `verifySandboxAccess`, which
     * rejects anything without a `branches` row — orphans by definition.
     *
     * Safety: refuse if ANY branch row references the sandbox. That would be
     * a real, owned project and must go through `start` with proper ownership
     * checks. Sandbox IDs are high-entropy CodeSandbox UUIDs, so guessing an
     * unattached sandbox to hijack is impractical; this mirrors the
     * `deleteOrphan` trust model.
     */
    startOrphan: protectedProcedure
        .input(
            z.object({
                sandboxId: z.string(),
                provider: cloudProviderSchema.optional(),
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
                        'Sandbox is attached to a project; use sandbox.start with project ownership.',
                });
            }
            const userId = ctx.user.id;
            const provider = await getProvider({
                sandboxId: input.sandboxId,
                userId,
                provider: getRequestedCloudProvider(input.provider),
            });
            try {
                const session = await provider.createSession({
                    args: {
                        id: shortenUuid(userId, 20),
                    },
                });
                return session;
            } finally {
                await provider.destroy().catch(() => undefined);
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
                provider: cloudProviderSchema.optional(),
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
            const provider = await getProvider({
                sandboxId: input.sandboxId,
                provider: getRequestedCloudProvider(input.provider),
            });
            try {
                await provider.stopProject({}).catch(() => undefined);
            } finally {
                await provider.destroy().catch(() => undefined);
            }
        }),
    /**
     * Server-side bulk file upload for orphan sandboxes backed by server-side
     * providers (Vercel Sandbox). The browser CodeSandbox SDK uses its own
     * WebSocket path; this endpoint exists because the Vercel Sandbox SDK is
     * server-only and cannot run in the browser.
     *
     * Trust model mirrors `startOrphan` / `deleteOrphan`: refuses if ANY
     * branch row references the sandbox.
     */
    orphanBulkUpload: protectedProcedure
        .input(
            z.object({
                sandboxId: z.string(),
                files: z.array(
                    z.object({
                        path: z.string(),
                        content: z.union([z.string(), z.array(z.number())]),
                    }),
                ),
                runSetup: z.boolean().optional(),
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
                        'Sandbox is attached to a project; use sandbox.fileWrite with project ownership.',
                });
            }
            const provider = await getProvider({
                sandboxId: input.sandboxId,
                userId: ctx.user.id,
                provider: CodeProvider.VercelSandbox,
            });
            try {
                for (const file of input.files) {
                    const content =
                        typeof file.content === 'string'
                            ? file.content
                            : Uint8Array.from(file.content);
                    await provider.writeFile({
                        args: { path: file.path, content, overwrite: true },
                    });
                }
                if (input.runSetup) {
                    await provider.setup({});
                }
            } finally {
                await provider.destroy().catch(() => undefined);
            }
        }),
    createFromGitHub: protectedProcedure
        .input(
            z.object({
                repoUrl: z.string(),
                branch: z.string(),
                subpath: z.string().optional(),
                provider: cloudProviderSchema.optional(),
            }),
        )
        .mutation(async ({ input }) => {
            const MAX_RETRY_ATTEMPTS = 3;
            const DEFAULT_PORT = 3000;
            let lastError: Error | null = null;

            for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
                try {
                    const cloudProvider = getRequestedCloudProvider(input.provider);
                    const StaticProvider = await getStaticCodeProvider(cloudProvider);
                    const sandbox = await StaticProvider.createProjectFromGit({
                        repoUrl: input.repoUrl,
                        branch: input.branch,
                        subpath: input.subpath,
                        privacy: SANDBOX_PRIVACY,
                        port: DEFAULT_PORT,
                    });

                    const previewUrl = getPreviewUrl({
                        provider: cloudProvider,
                        sandboxId: sandbox.id,
                        port: DEFAULT_PORT,
                        previewToken: sandbox.previewToken,
                        previewUrl: sandbox.previewUrl,
                    });

                    return {
                        sandboxId: sandbox.id,
                        previewUrl,
                        sandboxRuntime: getSandboxRuntime({
                            provider: cloudProvider,
                            sandbox,
                            port: DEFAULT_PORT,
                        }),
                    };
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));

                    // A timeout means the clone didn't finish within the
                    // provider's 5-minute ceiling — retrying spawns another
                    // 5-minute clone (and another orphan sandbox), turning a
                    // single failure into 15 minutes of UI hang. Surface the
                    // timeout immediately so the caller can show a real error
                    // and the user can either retry from the UI or pick a
                    // pre-seeded template.
                    const isTimeout = lastError.message.includes('Repository access timeout');

                    if (isTimeout || attempt >= MAX_RETRY_ATTEMPTS) {
                        break;
                    }

                    await new Promise((resolve) =>
                        setTimeout(resolve, Math.pow(2, attempt) * 1000),
                    );
                }
            }

            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to create GitHub sandbox: ${lastError?.message}`,
                cause: lastError,
            });
        }),
    fileRead: protectedProcedure
        .input(sandboxIdInput.extend({ path: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const provider = await getOwnedVercelProvider({
                db: ctx.db,
                userId: ctx.user.id,
                sandboxId: input.sandboxId,
            });
            try {
                const { file } = await provider.readFile({ args: { path: input.path } });
                const content = file.content ?? '';
                return {
                    path: file.path,
                    content: typeof content === 'string' ? content : Array.from(content),
                    type: file.type,
                    binary: typeof content !== 'string',
                };
            } finally {
                await provider.destroy().catch(() => undefined);
            }
        }),
    fileWrite: protectedProcedure
        .input(
            sandboxIdInput.extend({
                path: z.string(),
                content: z.union([z.string(), z.array(z.number())]),
                overwrite: z.boolean().optional(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const provider = await getOwnedVercelProvider({
                db: ctx.db,
                userId: ctx.user.id,
                sandboxId: input.sandboxId,
            });
            try {
                return await provider.writeFile({
                    args: {
                        path: input.path,
                        content:
                            typeof input.content === 'string'
                                ? input.content
                                : Uint8Array.from(input.content),
                        overwrite: input.overwrite,
                    },
                });
            } finally {
                await provider.destroy().catch(() => undefined);
            }
        }),
    fileList: protectedProcedure
        .input(sandboxIdInput.extend({ path: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const provider = await getOwnedVercelProvider({
                db: ctx.db,
                userId: ctx.user.id,
                sandboxId: input.sandboxId,
            });
            try {
                return await provider.listFiles({ args: { path: input.path } });
            } finally {
                await provider.destroy().catch(() => undefined);
            }
        }),
    fileStat: protectedProcedure
        .input(sandboxIdInput.extend({ path: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const provider = await getOwnedVercelProvider({
                db: ctx.db,
                userId: ctx.user.id,
                sandboxId: input.sandboxId,
            });
            try {
                return await provider.statFile({ args: { path: input.path } });
            } finally {
                await provider.destroy().catch(() => undefined);
            }
        }),
    fileDelete: protectedProcedure
        .input(sandboxIdInput.extend({ path: z.string(), recursive: z.boolean().optional() }))
        .mutation(async ({ input, ctx }) => {
            const provider = await getOwnedVercelProvider({
                db: ctx.db,
                userId: ctx.user.id,
                sandboxId: input.sandboxId,
            });
            try {
                return await provider.deleteFiles({
                    args: { path: input.path, recursive: input.recursive },
                });
            } finally {
                await provider.destroy().catch(() => undefined);
            }
        }),
    fileRename: protectedProcedure
        .input(sandboxIdInput.extend({ oldPath: z.string(), newPath: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const provider = await getOwnedVercelProvider({
                db: ctx.db,
                userId: ctx.user.id,
                sandboxId: input.sandboxId,
            });
            try {
                return await provider.renameFile({
                    args: { oldPath: input.oldPath, newPath: input.newPath },
                });
            } finally {
                await provider.destroy().catch(() => undefined);
            }
        }),
    fileCopy: protectedProcedure
        .input(
            sandboxIdInput.extend({
                sourcePath: z.string(),
                targetPath: z.string(),
                recursive: z.boolean().optional(),
                overwrite: z.boolean().optional(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const provider = await getOwnedVercelProvider({
                db: ctx.db,
                userId: ctx.user.id,
                sandboxId: input.sandboxId,
            });
            try {
                return await provider.copyFiles({
                    args: {
                        sourcePath: input.sourcePath,
                        targetPath: input.targetPath,
                        recursive: input.recursive,
                        overwrite: input.overwrite,
                    },
                });
            } finally {
                await provider.destroy().catch(() => undefined);
            }
        }),
    fileMkdir: protectedProcedure
        .input(sandboxIdInput.extend({ path: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const provider = await getOwnedVercelProvider({
                db: ctx.db,
                userId: ctx.user.id,
                sandboxId: input.sandboxId,
            });
            try {
                return await provider.createDirectory({ args: { path: input.path } });
            } finally {
                await provider.destroy().catch(() => undefined);
            }
        }),
    fileDownload: protectedProcedure
        .input(sandboxIdInput.extend({ path: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const provider = await getOwnedVercelProvider({
                db: ctx.db,
                userId: ctx.user.id,
                sandboxId: input.sandboxId,
            });
            try {
                return await provider.downloadFiles({ args: { path: input.path } });
            } finally {
                await provider.destroy().catch(() => undefined);
            }
        }),
    commandRun: protectedProcedure
        .input(sandboxIdInput.extend({ command: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const provider = await getOwnedVercelProvider({
                db: ctx.db,
                userId: ctx.user.id,
                sandboxId: input.sandboxId,
            });
            try {
                return await provider.runCommand({ args: { command: input.command } });
            } finally {
                await provider.destroy().catch(() => undefined);
            }
        }),
    commandRunBackground: protectedProcedure
        .input(sandboxIdInput.extend({ command: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const provider = await getOwnedVercelProvider({
                db: ctx.db,
                userId: ctx.user.id,
                sandboxId: input.sandboxId,
            });
            try {
                const { command } = await provider.runBackgroundCommand({
                    args: { command: input.command },
                });
                return {
                    name: command.name,
                    command: command.command,
                    output: await command.open(),
                };
            } finally {
                await provider.destroy().catch(() => undefined);
            }
        }),
    taskOpen: protectedProcedure
        .input(sandboxIdInput.extend({ taskId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const provider = await getOwnedVercelProvider({
                db: ctx.db,
                userId: ctx.user.id,
                sandboxId: input.sandboxId,
            });
            try {
                const { task } = await provider.getTask({ args: { id: input.taskId } });
                return {
                    id: task.id,
                    name: task.name,
                    command: task.command,
                    output: await task.open(),
                };
            } finally {
                await provider.destroy().catch(() => undefined);
            }
        }),
    taskRestart: protectedProcedure
        .input(sandboxIdInput.extend({ taskId: z.string() }))
        .mutation(async ({ input, ctx }) => {
            const provider = await getOwnedVercelProvider({
                db: ctx.db,
                userId: ctx.user.id,
                sandboxId: input.sandboxId,
            });
            try {
                const { task } = await provider.getTask({ args: { id: input.taskId } });
                await task.restart();
                return {
                    id: task.id,
                    name: task.name,
                    command: task.command,
                    output: await task.open(),
                };
            } finally {
                await provider.destroy().catch(() => undefined);
            }
        }),
    gitStatus: protectedProcedure.input(sandboxIdInput).mutation(async ({ input, ctx }) => {
        const provider = await getOwnedVercelProvider({
            db: ctx.db,
            userId: ctx.user.id,
            sandboxId: input.sandboxId,
        });
        try {
            return await provider.gitStatus({});
        } finally {
            await provider.destroy().catch(() => undefined);
        }
    }),
});
