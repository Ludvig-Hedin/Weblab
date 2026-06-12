import { describe, expect, it } from 'bun:test';

import { APP_NAME } from '@weblab/constants/editor';

import type { FetchLike } from './connector.js';
import type { AgentErrorCode } from './errors.js';
import type { AgentTool } from './tools.js';
import { WeblabAgentConnector } from './connector.js';
import { AgentApiError } from './errors.js';
import { createAgentTools } from './tools.js';

const config = { baseUrl: 'https://dep.convex.site', token: 'wlk_secret' };

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

// Stub fetch that routes by path so the real connector is exercised end to end.
const routedFetch: FetchLike = (url) => {
    if (url.includes('/agent/health')) {
        return Promise.resolve(
            jsonResponse({
                ok: true,
                service: 'weblab-agent-api',
                version: '1',
                authenticated: true,
                agentUserResolved: true,
                time: 1,
            }),
        );
    }
    if (url.includes('/agent/projects')) {
        return Promise.resolve(
            jsonResponse({
                projects: [
                    {
                        id: 'proj_1',
                        name: 'Demo',
                        description: null,
                        tags: [],
                        framework: 'nextjs',
                        accessMode: 'workspace',
                        storageMode: 'cloud',
                        createdAt: 1,
                        updatedAt: 2,
                    },
                ],
            }),
        );
    }
    return Promise.resolve(jsonResponse({ error: 'unexpected' }, 500));
};

function tools(): AgentTool[] {
    return createAgentTools(new WeblabAgentConnector(config, routedFetch));
}

function tool(name: string): AgentTool {
    const found = tools().find((t) => t.name === name);
    if (!found) {
        throw new Error(`tool ${name} not registered`);
    }
    return found;
}

async function expectToolError(p: Promise<unknown>, code: AgentErrorCode): Promise<void> {
    try {
        await p;
    } catch (err) {
        expect(err).toBeInstanceOf(AgentApiError);
        expect((err as AgentApiError).code).toBe(code);
        return;
    }
    throw new Error(`expected AgentApiError(${code}) but the promise resolved`);
}

describe('createAgentTools', () => {
    it('registers the expected v1 tool set', () => {
        const names = tools().map((t) => t.name);
        expect(names).toEqual([
            'weblab_health_check',
            'weblab_list_projects',
            'weblab_get_project',
            'weblab_get_project_status',
            'weblab_create_test_project',
            'weblab_read_logs',
        ]);
    });

    it('every tool has a description', () => {
        for (const t of tools()) {
            expect(t.description.length).toBeGreaterThan(0);
        }
    });
});

describe('read tools (happy path)', () => {
    it('weblab_health_check includes the app name and backend health', async () => {
        const text = await tool('weblab_health_check').run({});
        const parsed = JSON.parse(text) as { app: string; ok: boolean };
        expect(parsed.app).toBe(APP_NAME);
        expect(parsed.ok).toBe(true);
    });

    it('weblab_list_projects returns a count + projects', async () => {
        const text = await tool('weblab_list_projects').run({});
        const parsed = JSON.parse(text) as { count: number };
        expect(parsed.count).toBe(1);
    });
});

describe('input validation', () => {
    it('weblab_get_project rejects a missing projectId', () =>
        expectToolError(tool('weblab_get_project').run({}), 'INVALID_INPUT'));
});

describe('unsupported capabilities are honest stubs', () => {
    it('weblab_create_test_project rejects without the confirm gate', () =>
        expectToolError(tool('weblab_create_test_project').run({}), 'INVALID_INPUT'));

    it('weblab_create_test_project returns UNSUPPORTED even when confirmed', () =>
        expectToolError(tool('weblab_create_test_project').run({ confirm: true }), 'UNSUPPORTED'));

    it('weblab_read_logs returns UNSUPPORTED', () =>
        expectToolError(tool('weblab_read_logs').run({ projectId: 'proj_1' }), 'UNSUPPORTED'));
});
