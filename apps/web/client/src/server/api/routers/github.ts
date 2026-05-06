import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { DrizzleDb } from '@weblab/db';
import { users } from '@weblab/db';
import { createInstallationOctokit, generateInstallationUrl } from '@weblab/github';

import { createTRPCRouter, protectedProcedure } from '../trpc';

const parseRepoUrl = (repoUrl: string): { owner: string; repo: string } => {
    const bad = () =>
        new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid GitHub repository URL' });
    try {
        const url = new URL(repoUrl.trim());
        const hostname = url.hostname.toLowerCase();
        if (hostname !== 'github.com' && hostname !== 'www.github.com') throw bad();
        const parts = url.pathname.replace(/^\//, '').split('/');
        const owner = parts[0];
        const repo = parts[1]?.replace(/\.git$/, '');
        if (!owner || !repo) throw bad();
        return { owner, repo };
    } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw bad();
    }
};

const getUserGitHubInstallation = async (db: DrizzleDb, userId: string) => {
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { githubInstallationId: true },
    });

    if (!user?.githubInstallationId) {
        throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'GitHub App installation required',
        });
    }
    return {
        octokit: createInstallationOctokit(user.githubInstallationId),
        installationId: user.githubInstallationId,
    };
};

export const githubRouter = createTRPCRouter({
    validate: protectedProcedure
        .input(
            z.object({
                owner: z.string(),
                repo: z.string(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const { octokit } = await getUserGitHubInstallation(ctx.db, ctx.user.id);
            const { data } = await octokit.rest.repos.get({ owner: input.owner, repo: input.repo });
            return {
                branch: data.default_branch,
                isPrivateRepo: data.private,
            };
        }),
    getRepo: protectedProcedure
        .input(
            z.object({
                owner: z.string(),
                repo: z.string(),
            }),
        )
        .query(async ({ input, ctx }) => {
            const { octokit } = await getUserGitHubInstallation(ctx.db, ctx.user.id);
            const { data } = await octokit.rest.repos.get({
                owner: input.owner,
                repo: input.repo,
            });
            return data;
        }),

    getOrganizations: protectedProcedure.query(async ({ ctx }) => {
        try {
            const { octokit, installationId } = await getUserGitHubInstallation(
                ctx.db,
                ctx.user.id,
            );

            // Get installation details to determine account type
            const installation = await octokit.rest.apps.getInstallation({
                installation_id: parseInt(installationId, 10),
            });

            // If installed on an organization, return that organization
            if (
                installation.data.account &&
                'type' in installation.data.account &&
                installation.data.account.type === 'Organization'
            ) {
                return [
                    {
                        id: installation.data.account.id,
                        login:
                            'login' in installation.data.account
                                ? installation.data.account.login
                                : (installation.data.account as any).name || '',
                        avatar_url: installation.data.account.avatar_url,
                        description: undefined, // Organizations don't have descriptions in this context
                    },
                ];
            }

            // If installed on a user account, return empty (no organizations)
            return [];
        } catch (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: 'FORBIDDEN',
                message: 'GitHub App installation is invalid or has been revoked',
                cause: error,
            });
        }
    }),
    getRepoFiles: protectedProcedure
        .input(
            z.object({
                owner: z.string(),
                repo: z.string(),
                path: z.string().default(''),
                ref: z.string().optional(), // branch, tag, or commit SHA
            }),
        )
        .query(async ({ input, ctx }) => {
            const { octokit } = await getUserGitHubInstallation(ctx.db, ctx.user.id);
            const { data } = await octokit.rest.repos.getContent({
                owner: input.owner,
                repo: input.repo,
                path: input.path,
                ...(input.ref && { ref: input.ref }),
            });
            return data;
        }),
    generateInstallationUrl: protectedProcedure
        .input(
            z
                .object({
                    redirectUrl: z.string().optional(),
                })
                .optional(),
        )
        .mutation(async ({ input, ctx }) => {
            const { url, state } = generateInstallationUrl({
                redirectUrl: input?.redirectUrl,
                state: ctx.user.id, // Use user ID as state for CSRF protection
            });

            return { url, state };
        }),

    checkGitHubAppInstallation: protectedProcedure.query(
        async ({ ctx }): Promise<string | null> => {
            try {
                const { octokit, installationId } = await getUserGitHubInstallation(
                    ctx.db,
                    ctx.user.id,
                );
                await octokit.rest.apps.getInstallation({
                    installation_id: parseInt(installationId, 10),
                });
                return installationId;
            } catch (error) {
                console.error('Error checking GitHub App installation:', error);
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message:
                        error instanceof Error
                            ? error.message
                            : 'GitHub App installation is invalid or has been revoked',
                    cause: error,
                });
            }
        },
    ),

    // Repository fetching using GitHub App installation (required)
    getRepositoriesWithApp: protectedProcedure
        .query(async ({ ctx }) => {
            try {
                const { octokit, installationId } = await getUserGitHubInstallation(
                    ctx.db,
                    ctx.user.id,
                );

                const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({
                    installation_id: parseInt(installationId, 10),
                    per_page: 100,
                    page: 1,
                });

                // Transform to match reference implementation pattern
                return data.repositories.map((repo) => ({
                    id: repo.id,
                    name: repo.name,
                    full_name: repo.full_name,
                    description: repo.description,
                    private: repo.private,
                    default_branch: repo.default_branch,
                    clone_url: repo.clone_url,
                    html_url: repo.html_url,
                    updated_at: repo.updated_at,
                    owner: {
                        login: repo.owner.login,
                        avatar_url: repo.owner.avatar_url,
                    },
                }));
            } catch (error) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message:
                        'GitHub App installation is invalid or has been revoked. Please reinstall the GitHub App.',
                    cause: error,
                });
            }
        }),
    handleInstallationCallbackUrl: protectedProcedure
        .input(
            z.object({
                installationId: z.string(),
                setupAction: z.string(),
                state: z.string(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            // Validate state parameter matches current user ID for CSRF protection
            if (input.state && input.state !== ctx.user.id) {
                console.error('State mismatch:', { expected: ctx.user.id, received: input.state });
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Invalid state parameter',
                });
            }

            // Update user's GitHub installation ID
            try {
                await ctx.db
                    .update(users)
                    .set({ githubInstallationId: input.installationId })
                    .where(eq(users.id, ctx.user.id));

                console.log(`Updated installation ID for user: ${ctx.user.id}`);

                return {
                    success: true,
                    message: 'GitHub App installation completed successfully',
                    installationId: input.installationId,
                };
            } catch (error) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to update GitHub installation',
                    cause: error,
                });
            }
        }),
    createPullRequest: protectedProcedure
        .input(
            z.object({
                repoUrl: z.string().min(1),
                headBranch: z.string().min(1),
                baseBranch: z.string().min(1).optional(),
                title: z.string().min(1),
                body: z.string().optional(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const { octokit } = await getUserGitHubInstallation(ctx.db, ctx.user.id);
            const { owner, repo } = parseRepoUrl(input.repoUrl);

            const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
            const baseBranch = input.baseBranch?.trim() || repoData.default_branch;
            const headBranch = input.headBranch.trim();

            if (headBranch === baseBranch) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Create a feature branch before opening a pull request',
                });
            }

            const { data: existingPulls } = await octokit.rest.pulls.list({
                owner,
                repo,
                state: 'open',
                head: `${owner}:${headBranch}`,
                base: baseBranch,
                per_page: 1,
            });

            if (existingPulls[0]) {
                return {
                    url: existingPulls[0].html_url,
                    number: existingPulls[0].number,
                    existing: true,
                };
            }

            const { data: pullRequest } = await octokit.rest.pulls.create({
                owner,
                repo,
                head: headBranch,
                base: baseBranch,
                title: input.title.trim(),
                body: input.body?.trim() || undefined,
            });

            return {
                url: pullRequest.html_url,
                number: pullRequest.number,
                existing: false,
            };
        }),
});
