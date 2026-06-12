/**
 * WeblabAgentConnector — typed HTTP client over the Convex agent API.
 *
 * Every method maps to one `/agent/*` endpoint, attaches the Bearer token, and
 * validates the response against a Zod schema. All failures surface as a typed
 * `AgentApiError` so callers (the MCP tools) get a stable error code.
 *
 * `fetch` is injectable so the connector is fully unit-testable offline.
 */
import type { z } from 'zod';

import { APP_NAME } from '@weblab/constants/editor';

import type { AgentApiConfig } from './config.js';
import type { HealthResult, ProjectMetadata, ProjectStatus, ProjectSummary } from './schemas.js';
import { AgentApiError, errorCodeForStatus } from './errors.js';
import {
    getProjectResponseSchema,
    getProjectStatusResponseSchema,
    healthResponseSchema,
    listProjectsResponseSchema,
} from './schemas.js';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

interface BackendErrorBody {
    code?: string;
    error?: string;
}

async function readErrorMessage(res: Response): Promise<string> {
    try {
        const body = (await res.json()) as BackendErrorBody;
        if (body && typeof body.error === 'string') {
            return body.error;
        }
    } catch {
        // fall through to status text
    }
    return res.statusText || `HTTP ${res.status}`;
}

export class WeblabAgentConnector {
    private readonly config: AgentApiConfig;
    private readonly fetchImpl: FetchLike;

    constructor(config: AgentApiConfig, fetchImpl?: FetchLike) {
        this.config = config;
        // Bind so the default global fetch keeps its `this`.
        this.fetchImpl = fetchImpl ?? ((url, init) => fetch(url, init));
    }

    private async request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
        const url = `${this.config.baseUrl}${path}`;

        let res: Response;
        try {
            res = await this.fetchImpl(url, {
                method: 'GET',
                headers: {
                    authorization: `Bearer ${this.config.token}`,
                    accept: 'application/json',
                },
            });
        } catch (err) {
            throw new AgentApiError(
                'BACKEND_UNAVAILABLE',
                `Cannot reach ${APP_NAME} backend at ${this.config.baseUrl}: ${
                    err instanceof Error ? err.message : 'network error'
                }`,
            );
        }

        if (!res.ok) {
            throw new AgentApiError(
                errorCodeForStatus(res.status),
                await readErrorMessage(res),
                res.status,
            );
        }

        let json: unknown;
        try {
            json = await res.json();
        } catch {
            throw new AgentApiError('BACKEND_UNAVAILABLE', 'Backend returned a non-JSON response');
        }

        const parsed = schema.safeParse(json);
        if (!parsed.success) {
            throw new AgentApiError(
                'BACKEND_UNAVAILABLE',
                `Unexpected response shape from ${path}: ${parsed.error.issues
                    .map((i) => i.path.join('.') || '(root)')
                    .join(', ')}`,
            );
        }
        return parsed.data;
    }

    /** Liveness + auth check. Confirms the backend is reachable, the token is
     *  valid, and whether the dedicated agent account is configured. */
    health(): Promise<HealthResult> {
        return this.request('/agent/health', healthResponseSchema);
    }

    /** Projects owned by the agent account (test data only), newest first. */
    async listProjects(): Promise<ProjectSummary[]> {
        const { projects } = await this.request('/agent/projects', listProjectsResponseSchema);
        return projects;
    }

    /** Metadata for one of the agent's projects. */
    async getProject(projectId: string): Promise<ProjectMetadata> {
        const trimmed = projectId.trim();
        if (!trimmed) {
            throw new AgentApiError('INVALID_INPUT', 'projectId must be a non-empty string');
        }
        const { project } = await this.request(
            `/agent/project?projectId=${encodeURIComponent(trimmed)}`,
            getProjectResponseSchema,
        );
        return project;
    }

    /** Non-destructive status check: provisioning state + latest deployment. */
    async getProjectStatus(projectId: string): Promise<ProjectStatus> {
        const trimmed = projectId.trim();
        if (!trimmed) {
            throw new AgentApiError('INVALID_INPUT', 'projectId must be a non-empty string');
        }
        const { status } = await this.request(
            `/agent/project/status?projectId=${encodeURIComponent(trimmed)}`,
            getProjectStatusResponseSchema,
        );
        return status;
    }
}
