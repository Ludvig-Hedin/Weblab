'use node';

import crypto from 'node:crypto';
import { v } from 'convex/values';

import { createInstallationOctokit, generateInstallationUrl } from '@weblab/github';

import type { ActionCtx } from './_generated/server';
import { api } from './_generated/api';
import { action } from './_generated/server';

// Convex port of src/server/api/routers/github.ts.
//
// Octokit + node:crypto require the Node runtime. Auth checks delegated to
// `requireUser` via `ctx.runQuery(api.users.me, {})`. The installation id
// lives on the Convex users row (`users.githubInstallationId`) — read via
// `runQuery(api.users.me)` and persisted via `runMutation(api.users.setGithubInstallationId)`.

const INSTALL_STATE_TTL_MS = 15 * 60 * 1000;

function getInstallStateKey(): Buffer {
    // SECURITY: use a dedicated secret per the original tRPC router's HMAC
    // contract. Avoid SUPABASE_SERVICE_ROLE_KEY reuse (it isn't available
    // under Convex) — operators set GITHUB_INSTALL_STATE_SECRET explicitly.
    const raw = process.env.GITHUB_INSTALL_STATE_SECRET;
    if (!raw || raw.length === 0) {
        throw new Error(
            'GITHUB_INSTALL_STATE_SECRET is required. Run `bunx convex env set GITHUB_INSTALL_STATE_SECRET $(openssl rand -hex 32)`.',
        );
    }
    return crypto.createHash('sha256').update(`${raw}|github-install-state`).digest();
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
    const bad = () => new Error('BAD_REQUEST: Invalid GitHub repository URL');
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
        if (err instanceof Error) throw err;
        throw bad();
    }
};

async function getCurrentUserOrThrow(ctx: ActionCtx) {
    const me = await ctx.runQuery(api.users.me, {});
    if (!me) throw new Error('UNAUTHORIZED');
    return me;
}

async function getUserInstallation(ctx: ActionCtx): Promise<{
    octokit: ReturnType<typeof createInstallationOctokit>;
    installationId: string;
}> {
    const me = await getCurrentUserOrThrow(ctx);
    if (!me.githubInstallationId) {
        throw new Error('PRECONDITION_FAILED: GitHub App installation required');
    }
    return {
        octokit: createInstallationOctokit(me.githubInstallationId),
        installationId: me.githubInstallationId,
    };
}

export const validate = action({
    args: {
        owner: v.string(),
        repo: v.string(),
    },
    handler: async (ctx, input) => {
        const { octokit } = await getUserInstallation(ctx);
        const { data } = await octokit.rest.repos.get({
            owner: input.owner,
            repo: input.repo,
        });
        return { branch: data.default_branch, isPrivateRepo: data.private };
    },
});

export const getRepo = action({
    args: {
        owner: v.string(),
        repo: v.string(),
    },
    handler: async (ctx, input) => {
        const { octokit } = await getUserInstallation(ctx);
        const { data } = await octokit.rest.repos.get({
            owner: input.owner,
            repo: input.repo,
        });
        return data;
    },
});

export const getOrganizations = action({
    args: {},
    handler: async (ctx) => {
        try {
            const { octokit, installationId } = await getUserInstallation(ctx);
            const installation = await octokit.rest.apps.getInstallation({
                installation_id: parseInt(installationId, 10),
            });
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
                                : ((installation.data.account as { name?: string }).name ?? ''),
                        avatar_url: installation.data.account.avatar_url,
                        description: undefined as string | undefined,
                    },
                ];
            }
            return [];
        } catch (error) {
            if (error instanceof Error && error.message.startsWith('PRECONDITION_FAILED')) {
                throw error;
            }
            throw new Error('FORBIDDEN: GitHub App installation is invalid or has been revoked');
        }
    },
});

export const getRepoFiles = action({
    args: {
        owner: v.string(),
        repo: v.string(),
        path: v.optional(v.string()),
        ref: v.optional(v.string()),
    },
    handler: async (ctx, input) => {
        const { octokit } = await getUserInstallation(ctx);
        const { data } = await octokit.rest.repos.getContent({
            owner: input.owner,
            repo: input.repo,
            path: input.path ?? '',
            ...(input.ref ? { ref: input.ref } : {}),
        });
        return data;
    },
});

export const generateInstallationUrlAction = action({
    args: {
        redirectUrl: v.optional(v.string()),
    },
    handler: async (ctx, { redirectUrl }) => {
        const me = await getCurrentUserOrThrow(ctx);
        const signedState = signInstallState(me._id);
        const { url, state } = generateInstallationUrl({
            redirectUrl,
            state: signedState,
        });
        return { url, state };
    },
});

export const checkGitHubAppInstallation = action({
    args: {},
    handler: async (ctx): Promise<string | null> => {
        try {
            const { octokit, installationId } = await getUserInstallation(ctx);
            await octokit.rest.apps.getInstallation({
                installation_id: parseInt(installationId, 10),
            });
            return installationId;
        } catch (error) {
            if (error instanceof Error && error.message.startsWith('PRECONDITION_FAILED')) {
                return null;
            }
            // Not-yet-connected / token-not-yet-exchanged is the steady state
            // for any user who has not run the GitHub App install flow. Treat
            // it as "no installation" instead of surfacing a raw error string
            // to the UI.
            if (
                error instanceof Error &&
                (error.message === 'UNAUTHORIZED' || error.message.startsWith('UNAUTHORIZED'))
            ) {
                return null;
            }
            console.error('Error checking GitHub App installation:', error);
            throw new Error(
                error instanceof Error && error.message
                    ? `FORBIDDEN: ${error.message}`
                    : 'FORBIDDEN: GitHub App installation is invalid or has been revoked',
            );
        }
    },
});

export const getRepositoriesWithApp = action({
    args: {},
    handler: async (ctx) => {
        try {
            const { octokit, installationId } = await getUserInstallation(ctx);
            const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({
                installation_id: parseInt(installationId, 10),
                per_page: 100,
                page: 1,
            });
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
            if (error instanceof Error && error.message.startsWith('PRECONDITION_FAILED')) {
                throw error;
            }
            throw new Error(
                'FORBIDDEN: GitHub App installation is invalid or has been revoked. Please reinstall the GitHub App.',
            );
        }
    },
});

export const handleInstallationCallbackUrl = action({
    args: {
        installationId: v.string(),
        setupAction: v.string(),
        state: v.string(),
    },
    handler: async (ctx, { installationId, state }) => {
        const me = await getCurrentUserOrThrow(ctx);
        if (!state || !verifyInstallState(state, me._id)) {
            throw new Error('BAD_REQUEST: Invalid or expired state parameter');
        }
        try {
            await ctx.runMutation(api.users.setGithubInstallationId, {
                githubInstallationId: installationId,
            });
            console.log(`Updated installation ID for user: ${me._id}`);
            return {
                success: true,
                message: 'GitHub App installation completed successfully',
                installationId,
            };
        } catch (error) {
            console.error('Error updating GitHub installation:', error);
            throw new Error('INTERNAL_SERVER_ERROR: Failed to update GitHub installation');
        }
    },
});

export const createPullRequest = action({
    args: {
        repoUrl: v.string(),
        headBranch: v.string(),
        baseBranch: v.optional(v.string()),
        title: v.string(),
        body: v.optional(v.string()),
    },
    handler: async (ctx, input) => {
        const { octokit } = await getUserInstallation(ctx);
        const { owner, repo } = parseRepoUrl(input.repoUrl);

        const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
        const baseBranch = input.baseBranch?.trim() || repoData.default_branch;
        const headBranch = input.headBranch.trim();
        if (headBranch === baseBranch) {
            throw new Error('BAD_REQUEST: Create a feature branch before opening a pull request');
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
    },
});
