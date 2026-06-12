/**
 * Agent API — token-authenticated, read-first HTTP surface for external AI
 * agents (Claude Code and friends) to inspect Weblab without a browser session.
 *
 * Design (see docs/agent-context/weblab-agent-api-map.md):
 *  - Lives on the Convex HTTP router (`<deployment>.convex.site/agent/*`) so it
 *    bypasses Next.js + Clerk middleware entirely. The browser auth path is
 *    untouched.
 *  - Auth is a single shared secret `WEBLAB_AGENT_API_TOKEN` (Bearer header).
 *    There is NO Clerk JWT here, so `ctx.auth.getUserIdentity()` is always null.
 *  - All data is scoped to ONE dedicated agent account identified by the
 *    `WEBLAB_AGENT_USER_ID` deployment env var (a Clerk user id). The agent can
 *    only ever see projects it created — guaranteeing "test data only" and
 *    never touching production users' data.
 *
 * IMPORTANT: the Convex auth guideline "never accept a userId as an arg for
 * authorization" is respected — the agent identity comes from a server-side
 * deployment env var, never from the HTTP caller.
 *
 * Routes are registered in convex/http.ts.
 */
import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { httpAction, internalQuery } from './_generated/server';

// ─── Response shapes (mirrored by packages/mcp/src/agent/schemas.ts) ──────────

export interface AgentProjectSummary {
    id: Id<'projects'>;
    name: string;
    description: string | null;
    tags: string[];
    framework: string | null;
    accessMode: string;
    storageMode: string;
    createdAt: number;
    updatedAt: number;
}

export interface AgentProjectMetadata extends AgentProjectSummary {
    workspaceId: Id<'workspaces'>;
    defaultBranchName: string | null;
    previewUrl: string | null;
    sandboxId: string | null;
}

export interface AgentDeploymentStatus {
    type: string;
    status: string;
    error: string | null;
    urls: string[];
    updatedAt: number;
}

export interface AgentProjectStatus {
    provisioning: 'ready' | 'pending' | 'failed';
    previewUrl: string | null;
    sandboxId: string | null;
    provisioningError: string | null;
    latestDeployment: AgentDeploymentStatus | null;
}

// Narrow view over the opaque `runtimeMetadata` (`v.any()`) blobs.
interface CloudRuntimeMetadata {
    cloud?: {
        provider?: string;
        sandboxId?: string;
        previewUrl?: string;
        port?: number;
    };
    provisioningError?: string;
}

interface ProjectRuntimeMetadata {
    framework?: string;
}

type ProjectLookup =
    | { kind: 'ok'; project: Doc<'projects'> }
    | { kind: 'not_found' }
    | { kind: 'forbidden' };

// ─── Agent identity resolution ────────────────────────────────────────────────

/**
 * Resolve the dedicated agent user from the `WEBLAB_AGENT_USER_ID` deployment
 * env var. Throws sentinel errors the HTTP layer maps to a 500 so a
 * misconfigured deployment surfaces loudly instead of leaking an empty result.
 */
async function resolveAgentUser(ctx: QueryCtx): Promise<Doc<'users'>> {
    const clerkUserId = process.env.WEBLAB_AGENT_USER_ID;
    if (!clerkUserId) {
        throw new Error('AGENT_USER_UNCONFIGURED');
    }
    const user = await ctx.db
        .query('users')
        .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', clerkUserId))
        .unique();
    if (!user) {
        throw new Error('AGENT_USER_NOT_FOUND');
    }
    return user;
}

function toSummary(project: Doc<'projects'>): AgentProjectSummary {
    const runtime = project.runtimeMetadata as ProjectRuntimeMetadata | undefined;
    return {
        id: project._id,
        name: project.name,
        description: project.description ?? null,
        tags: project.tags,
        framework: runtime?.framework ?? null,
        accessMode: project.accessMode,
        storageMode: project.storageMode,
        createdAt: project._creationTime,
        updatedAt: project.updatedAt,
    };
}

/** Owner-scoped project lookup. Returns a discriminated result, never throws on
 *  a bad/foreign id (so the HTTP layer can map cleanly to 400/403/404). */
async function lookupAgentProject(ctx: QueryCtx, rawId: string): Promise<ProjectLookup> {
    const id = ctx.db.normalizeId('projects', rawId);
    if (!id) {
        return { kind: 'not_found' };
    }
    const user = await resolveAgentUser(ctx);
    const project = await ctx.db.get(id);
    if (!project) {
        return { kind: 'not_found' };
    }
    if (project.createdByUserId !== user._id) {
        // Exists but not the agent's — deny without leaking details.
        return { kind: 'forbidden' };
    }
    return { kind: 'ok', project };
}

// ─── Internal queries (called only from the httpActions below) ─────────────────

export const _agentUserResolved = internalQuery({
    args: {},
    handler: async (ctx): Promise<boolean> => {
        try {
            await resolveAgentUser(ctx);
            return true;
        } catch {
            return false;
        }
    },
});

export const _listAgentProjects = internalQuery({
    args: {},
    handler: async (ctx): Promise<AgentProjectSummary[]> => {
        const user = await resolveAgentUser(ctx);
        const projects = await ctx.db
            .query('projects')
            .withIndex('by_created_by_user', (q) => q.eq('createdByUserId', user._id))
            .order('desc')
            .take(50);
        return projects.map(toSummary);
    },
});

export const _getAgentProject = internalQuery({
    args: { projectId: v.string() },
    handler: async (
        ctx,
        args,
    ): Promise<
        | { kind: 'ok'; project: AgentProjectMetadata }
        | { kind: 'not_found' }
        | { kind: 'forbidden' }
    > => {
        const found = await lookupAgentProject(ctx, args.projectId);
        if (found.kind !== 'ok') {
            return found;
        }
        const { project } = found;

        const branch =
            (await ctx.db
                .query('branches')
                .withIndex('by_project_default', (q) =>
                    q.eq('projectId', project._id).eq('isDefault', true),
                )
                .unique()) ??
            (await ctx.db
                .query('branches')
                .withIndex('by_project', (q) => q.eq('projectId', project._id))
                .first());

        const cloud = (branch?.runtimeMetadata as CloudRuntimeMetadata | undefined)?.cloud;

        return {
            kind: 'ok',
            project: {
                ...toSummary(project),
                workspaceId: project.workspaceId,
                defaultBranchName: branch?.name ?? null,
                previewUrl: cloud?.previewUrl ?? project.sandboxUrl ?? null,
                sandboxId: cloud?.sandboxId ?? branch?.sandboxId ?? project.sandboxId ?? null,
            },
        };
    },
});

export const _getAgentProjectStatus = internalQuery({
    args: { projectId: v.string() },
    handler: async (
        ctx,
        args,
    ): Promise<
        | { kind: 'ok'; status: AgentProjectStatus }
        | { kind: 'not_found' }
        | { kind: 'forbidden' }
    > => {
        const found = await lookupAgentProject(ctx, args.projectId);
        if (found.kind !== 'ok') {
            return found;
        }
        const { project } = found;

        const branch =
            (await ctx.db
                .query('branches')
                .withIndex('by_project_default', (q) =>
                    q.eq('projectId', project._id).eq('isDefault', true),
                )
                .unique()) ??
            (await ctx.db
                .query('branches')
                .withIndex('by_project', (q) => q.eq('projectId', project._id))
                .first());

        const meta = branch?.runtimeMetadata as CloudRuntimeMetadata | undefined;
        const previewUrl = meta?.cloud?.previewUrl ?? null;
        const provisioningError = meta?.provisioningError ?? null;

        const latest = await ctx.db
            .query('deployments')
            .withIndex('by_project', (q) => q.eq('projectId', project._id))
            .order('desc')
            .first();

        const provisioning: AgentProjectStatus['provisioning'] = provisioningError
            ? 'failed'
            : previewUrl
              ? 'ready'
              : 'pending';

        return {
            kind: 'ok',
            status: {
                provisioning,
                previewUrl,
                sandboxId: meta?.cloud?.sandboxId ?? branch?.sandboxId ?? null,
                provisioningError,
                latestDeployment: latest
                    ? {
                          type: latest.type,
                          status: latest.status,
                          error: latest.error ?? null,
                          urls: latest.urls ?? [],
                          updatedAt: latest.updatedAt,
                      }
                    : null,
            },
        };
    },
});

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

function errorResponse(code: string, message: string, status: number): Response {
    return jsonResponse({ error: message, code }, status);
}

/** Constant-time string compare (mirrors the pattern in convex/http.ts). */
function constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
        return false;
    }
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

/**
 * Validate the Bearer token. Returns an error `Response` to short-circuit, or
 * `null` when the request is authorized.
 */
function checkAgentToken(request: Request): Response | null {
    const expected = process.env.WEBLAB_AGENT_API_TOKEN;
    if (!expected) {
        return errorResponse(
            'BACKEND_UNAVAILABLE',
            'agent api not configured: WEBLAB_AGENT_API_TOKEN missing',
            500,
        );
    }
    const header = request.headers.get('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    const provided = match?.[1]?.trim();
    if (!provided || !constantTimeEqual(provided, expected)) {
        return errorResponse('AUTH_FAILED', 'invalid or missing agent token', 401);
    }
    return null;
}

function lookupToHttp(
    result: { kind: 'not_found' } | { kind: 'forbidden' },
): Response {
    return result.kind === 'forbidden'
        ? errorResponse('PERMISSION_DENIED', 'project is not accessible to this agent', 403)
        : errorResponse('NOT_FOUND', 'project not found', 404);
}

/**
 * Map an internalQuery rejection to a 500. Only the two `resolveAgentUser`
 * sentinels mean "agent account misconfigured"; any other error (e.g. a
 * `.unique()` constraint violation, a DB read failure) is reported as a
 * generic backend error so the message isn't misleading.
 */
function backendErrorResponse(err: unknown): Response {
    const message = err instanceof Error ? err.message : 'unknown';
    if (message === 'AGENT_USER_UNCONFIGURED') {
        return errorResponse(
            'BACKEND_UNAVAILABLE',
            'agent account not configured: WEBLAB_AGENT_USER_ID missing',
            500,
        );
    }
    if (message === 'AGENT_USER_NOT_FOUND') {
        return errorResponse(
            'BACKEND_UNAVAILABLE',
            'agent account not configured: no user matches WEBLAB_AGENT_USER_ID',
            500,
        );
    }
    return errorResponse('BACKEND_UNAVAILABLE', `agent api error: ${message}`, 500);
}

function readProjectId(request: Request): string | null {
    const value = new URL(request.url).searchParams.get('projectId');
    return value && value.trim().length > 0 ? value.trim() : null;
}

// ─── HTTP actions (registered in convex/http.ts) ───────────────────────────────

export const agentHealth = httpAction(async (ctx, request) => {
    const denied = checkAgentToken(request);
    if (denied) {
        return denied;
    }
    const agentUserResolved = await ctx.runQuery(internal.agentApi._agentUserResolved, {});
    return jsonResponse({
        ok: true,
        service: 'weblab-agent-api',
        version: '1',
        authenticated: true,
        agentUserResolved,
        time: Date.now(),
    });
});

export const agentListProjects = httpAction(async (ctx, request) => {
    const denied = checkAgentToken(request);
    if (denied) {
        return denied;
    }
    try {
        const projects = await ctx.runQuery(internal.agentApi._listAgentProjects, {});
        return jsonResponse({ projects });
    } catch (err) {
        return backendErrorResponse(err);
    }
});

export const agentGetProject = httpAction(async (ctx, request) => {
    const denied = checkAgentToken(request);
    if (denied) {
        return denied;
    }
    const projectId = readProjectId(request);
    if (!projectId) {
        return errorResponse('INVALID_INPUT', 'missing required query param: projectId', 400);
    }
    try {
        const result = await ctx.runQuery(internal.agentApi._getAgentProject, { projectId });
        if (result.kind !== 'ok') {
            return lookupToHttp(result);
        }
        return jsonResponse({ project: result.project });
    } catch (err) {
        return backendErrorResponse(err);
    }
});

export const agentGetProjectStatus = httpAction(async (ctx, request) => {
    const denied = checkAgentToken(request);
    if (denied) {
        return denied;
    }
    const projectId = readProjectId(request);
    if (!projectId) {
        return errorResponse('INVALID_INPUT', 'missing required query param: projectId', 400);
    }
    try {
        const result = await ctx.runQuery(internal.agentApi._getAgentProjectStatus, { projectId });
        if (result.kind !== 'ok') {
            return lookupToHttp(result);
        }
        return jsonResponse({ status: result.status });
    } catch (err) {
        return backendErrorResponse(err);
    }
});
