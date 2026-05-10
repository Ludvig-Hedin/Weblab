import crypto from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { DrizzleDb } from '@weblab/db';
import { users } from '@weblab/db';
import { createInstallationOctokit, generateInstallationUrl } from '@weblab/github';

import { env } from '@/env';
import { createTRPCRouter, protectedProcedure } from '../trpc';

// 15 minutes — install flow generally completes in under a minute.
const INSTALL_STATE_TTL_MS = 15 * 60 * 1000;

function getInstallStateKey(): Buffer {
    // Derive a per-deployment HMAC key from the Supabase service-role key.
    // This avoids a new env var while keeping the HMAC scoped to a domain
    // string so the same key isn't reused across signing surfaces.
    return crypto
        .createHash('sha256')
        .update(`${env.SUPABASE_SERVICE_ROLE_KEY}|github-install-state`)
        .digest();
}

function signInstallState(userId: string): string {
    const nonce = crypto.randomBytes(16).toString('base64url');
    const ts = Date.now().toString();
    const payload = `${userId}.${nonce}.${ts}`;
    const sig = crypto
        .createHmac('sha256', getInstallStateKey())
        .update(payload)
        .digest('base64url');
    return Buffer.from(`${payload}.${sig}`, 'utf8').toString('base64url');
}

function verifyInstallState(state: string, expectedUserId: string): boolean {
    let decoded: string;
    try {
        decoded = Buffer.from(state, 'base64url').toString('utf8');
    } catch {
        return false;
    }
    const parts = decoded.split('.');
    if (parts.length !== 4) return false;
    const [userId, nonce, ts, sig] = parts;
    if (!userId || !nonce || !ts || !sig) return false;
    if (userId !== expectedUserId) return false;
    const tsNum = Number.parseInt(ts, 10);
    if (!Number.isFinite(tsNum) || Date.now() - tsNum > INSTALL_STATE_TTL_MS) return false;
    const expected = crypto
        .createHmac('sha256', getInstallStateKey())
        .update(`${userId}.${nonce}.${ts}`)
        .digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
}

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
            // SECURITY: do not use ctx.user.id as the CSRF state — user UUIDs
            // are not secret with respect to other users (they leak via
            // member listings, comments, etc.) and let an attacker forge a
            // callback that overwrites the victim's GitHub installation.
            // Use an HMAC-signed, time-limited state instead.
            const signedState = signInstallState(ctx.user.id);
            const { url, state } = generateInstallationUrl({
                redirectUrl: input?.redirectUrl,
                state: signedState,
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
                // No installation stored yet — normal for a new user, not an error.
                if (error instanceof TRPCError && error.code === 'PRECONDITION_FAILED') {
                    return null;
                }
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
    getRepositoriesWithApp: protectedProcedure.query(async ({ ctx }) => {
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
            // Validate HMAC-signed state — see signInstallState above.
            if (!input.state || !verifyInstallState(input.state, ctx.user.id)) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Invalid or expired state parameter',
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
