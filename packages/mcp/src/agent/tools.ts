/**
 * Agent MCP tool definitions. Each tool validates its input, calls the typed
 * connector, and returns a text payload. Errors throw `AgentApiError` and are
 * formatted by the server wrapper.
 *
 * Read-first by default. Write/destructive capabilities that cannot be safely
 * supported by current APIs are registered as explicit UNSUPPORTED stubs with a
 * concrete reason (per task constraint: do not invent fake capabilities).
 */
import type { z } from 'zod';

// Brand name is the source of truth in @weblab/constants (never hardcode it).
// Import via the `/editor` subpath: the package barrel transitively pulls
// @weblab/models → @weblab/ai (editor/JSX graph), which a standalone MCP
// process cannot — and need not — typecheck. The subpath resolves only the
// pure editor constants.
import { APP_NAME } from '@weblab/constants/editor';

import type { WeblabAgentConnector } from './connector.js';
import { AgentApiError } from './errors.js';
import {
    createTestProjectInputSchema,
    getProjectInputSchema,
    getProjectStatusInputSchema,
    healthInputSchema,
    listProjectsInputSchema,
    readLogsInputSchema,
} from './schemas.js';

export interface AgentTool {
    name: string;
    description: string;
    inputSchema: z.ZodObject<z.ZodRawShape>;
    run: (rawArgs: unknown) => Promise<string>;
}

function parseInput<T>(schema: z.ZodType<T>, rawArgs: unknown): T {
    const parsed = schema.safeParse(rawArgs ?? {});
    if (!parsed.success) {
        const detail = parsed.error.issues
            .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
            .join('; ');
        throw new AgentApiError('INVALID_INPUT', `Invalid arguments — ${detail}`);
    }
    return parsed.data;
}

function asText(value: unknown): string {
    return JSON.stringify(value, null, 2);
}

export function createAgentTools(connector: WeblabAgentConnector): AgentTool[] {
    return [
        {
            name: 'weblab_health_check',
            description: `Check that the ${APP_NAME} backend is reachable, the agent token is valid, and whether the dedicated agent account is configured. Read-only.`,
            inputSchema: healthInputSchema,
            run: async (rawArgs) => {
                parseInput(healthInputSchema, rawArgs);
                const health = await connector.health();
                return asText({ app: APP_NAME, ...health });
            },
        },
        {
            name: 'weblab_list_projects',
            description: `List ${APP_NAME} projects owned by the agent account (test data only), newest first. Read-only.`,
            inputSchema: listProjectsInputSchema,
            run: async (rawArgs) => {
                parseInput(listProjectsInputSchema, rawArgs);
                const projects = await connector.listProjects();
                return asText({ count: projects.length, projects });
            },
        },
        {
            name: 'weblab_get_project',
            description:
                'Read metadata for one agent-owned project (name, tags, framework, workspace, default branch, preview URL, sandbox id). Read-only.',
            inputSchema: getProjectInputSchema,
            run: async (rawArgs) => {
                const { projectId } = parseInput(getProjectInputSchema, rawArgs);
                const project = await connector.getProject(projectId);
                return asText({ project });
            },
        },
        {
            name: 'weblab_get_project_status',
            description:
                'Non-destructive status check for an agent-owned project: provisioning state, preview URL, sandbox id, provisioning error, and the latest deployment status. Read-only.',
            inputSchema: getProjectStatusInputSchema,
            run: async (rawArgs) => {
                const { projectId } = parseInput(getProjectStatusInputSchema, rawArgs);
                const status = await connector.getProjectStatus(projectId);
                return asText({ status });
            },
        },
        {
            // Write capability — gated behind explicit `confirm: true`. Not safely
            // supportable yet: real project creation requires the authenticated
            // sandbox-provisioning action (Vercel Sandbox) which the service-token
            // path cannot invoke. Registered as an honest UNSUPPORTED stub.
            name: 'weblab_create_test_project',
            description:
                'Create a blank test project. UNSUPPORTED in this version (requires the authenticated sandbox-provisioning path). Requires confirm:true when enabled.',
            inputSchema: createTestProjectInputSchema,
            run: async (rawArgs) => {
                parseInput(createTestProjectInputSchema, rawArgs);
                throw new AgentApiError(
                    'UNSUPPORTED',
                    'create_test_project is not available in v1. Real project creation requires the authenticated sandbox-provisioning action (projectActions.createBlank), which the agent service token cannot invoke. Track: enable an agent-scoped provisioning path. Use the dashboard "Start blank" CTA to create test projects for now.',
                );
            },
        },
        {
            // Logs/errors: the structured error overlay is browser-only MobX state,
            // and the sandbox dev-log tail needs a per-session sandbox token the
            // service token does not hold. Honest UNSUPPORTED stub; status is the
            // safe alternative.
            name: 'weblab_read_logs',
            description:
                'Read build/runtime logs for a project. UNSUPPORTED in this version (logs require a sandbox session token). Use weblab_get_project_status for provisioning + deployment status instead.',
            inputSchema: readLogsInputSchema,
            run: async (rawArgs) => {
                parseInput(readLogsInputSchema, rawArgs);
                throw new AgentApiError(
                    'UNSUPPORTED',
                    'read_logs is not available in v1. Structured runtime errors live in browser-only editor state, and the sandbox dev-server log tail requires a per-session sandbox token the agent service token does not hold. Use weblab_get_project_status for provisioning and deployment status.',
                );
            },
        },
    ];
}
