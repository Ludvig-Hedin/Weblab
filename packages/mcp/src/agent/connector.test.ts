import { describe, expect, it } from 'bun:test';

import type { FetchLike } from './connector.js';
import type { AgentErrorCode } from './errors.js';
import { WeblabAgentConnector } from './connector.js';
import { AgentApiError } from './errors.js';

const config = { baseUrl: 'https://dep.convex.site', token: 'wlk_secret' };

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

function connectorReturning(body: unknown, status = 200): WeblabAgentConnector {
    return new WeblabAgentConnector(config, () => Promise.resolve(jsonResponse(body, status)));
}

async function expectAgentError(p: Promise<unknown>, code: AgentErrorCode): Promise<void> {
    try {
        await p;
    } catch (err) {
        expect(err).toBeInstanceOf(AgentApiError);
        expect((err as AgentApiError).code).toBe(code);
        return;
    }
    throw new Error(`expected AgentApiError(${code}) but the promise resolved`);
}

const validHealth = {
    ok: true,
    service: 'weblab-agent-api',
    version: '1',
    authenticated: true,
    agentUserResolved: true,
    time: 1_700_000_000_000,
};

const validSummary = {
    id: 'proj_1',
    name: 'Demo',
    description: null,
    tags: ['test'],
    framework: 'nextjs',
    accessMode: 'workspace',
    storageMode: 'cloud',
    createdAt: 1,
    updatedAt: 2,
};

const validMetadata = {
    ...validSummary,
    workspaceId: 'ws_1',
    defaultBranchName: 'main',
    previewUrl: 'https://x.vercel.run',
    sandboxId: 'sb_1',
};

const validStatus = {
    provisioning: 'ready' as const,
    previewUrl: 'https://x.vercel.run',
    sandboxId: 'sb_1',
    provisioningError: null,
    latestDeployment: null,
};

describe('WeblabAgentConnector happy paths', () => {
    it('health() returns parsed health', async () => {
        const connector = connectorReturning(validHealth);
        const result = await connector.health();
        expect(result.ok).toBe(true);
        expect(result.agentUserResolved).toBe(true);
    });

    it('listProjects() unwraps the projects array', async () => {
        const connector = connectorReturning({ projects: [validSummary] });
        const projects = await connector.listProjects();
        expect(projects).toHaveLength(1);
        expect(projects[0]?.name).toBe('Demo');
    });

    it('getProject() unwraps the project', async () => {
        const connector = connectorReturning({ project: validMetadata });
        const project = await connector.getProject('proj_1');
        expect(project.defaultBranchName).toBe('main');
        expect(project.previewUrl).toBe('https://x.vercel.run');
    });

    it('getProjectStatus() unwraps the status', async () => {
        const connector = connectorReturning({ status: validStatus });
        const status = await connector.getProjectStatus('proj_1');
        expect(status.provisioning).toBe('ready');
    });
});

describe('WeblabAgentConnector auth + request wiring', () => {
    it('attaches the Bearer token and hits the right URL', async () => {
        // Hold captured values on an object so TS control-flow analysis doesn't
        // narrow them to their initial literal across the fetch callback.
        const seen: { url: string; auth: string | null } = { url: '', auth: null };
        const fetchImpl: FetchLike = (url, init) => {
            seen.url = url;
            seen.auth = new Headers(init?.headers).get('authorization');
            return Promise.resolve(jsonResponse(validHealth));
        };
        await new WeblabAgentConnector(config, fetchImpl).health();
        expect(seen.url).toBe('https://dep.convex.site/agent/health');
        expect(seen.auth).toBe('Bearer wlk_secret');
    });

    it('url-encodes the projectId query param', async () => {
        const seen: { url: string } = { url: '' };
        const fetchImpl: FetchLike = (url) => {
            seen.url = url;
            return Promise.resolve(jsonResponse({ project: validMetadata }));
        };
        await new WeblabAgentConnector(config, fetchImpl).getProject('a/b c');
        expect(seen.url).toBe('https://dep.convex.site/agent/project?projectId=a%2Fb%20c');
    });
});

describe('WeblabAgentConnector error mapping', () => {
    it('maps 401 → AUTH_FAILED', () =>
        expectAgentError(connectorReturning({ error: 'nope' }, 401).health(), 'AUTH_FAILED'));

    it('maps 403 → PERMISSION_DENIED', () =>
        expectAgentError(
            connectorReturning({ error: 'forbidden' }, 403).getProject('proj_x'),
            'PERMISSION_DENIED',
        ));

    it('maps 404 → NOT_FOUND', () =>
        expectAgentError(
            connectorReturning({ error: 'missing' }, 404).getProject('proj_x'),
            'NOT_FOUND',
        ));

    it('maps 400 → INVALID_INPUT', () =>
        expectAgentError(
            connectorReturning({ error: 'bad' }, 400).getProject('proj_x'),
            'INVALID_INPUT',
        ));

    it('maps 500 → BACKEND_UNAVAILABLE', () =>
        expectAgentError(
            connectorReturning({ error: 'boom' }, 500).health(),
            'BACKEND_UNAVAILABLE',
        ));

    it('maps a network throw → BACKEND_UNAVAILABLE', () => {
        const connector = new WeblabAgentConnector(config, () =>
            Promise.reject(new Error('ECONNREFUSED')),
        );
        return expectAgentError(connector.health(), 'BACKEND_UNAVAILABLE');
    });

    it('maps a non-JSON 200 body → BACKEND_UNAVAILABLE', () => {
        const connector = new WeblabAgentConnector(config, () =>
            Promise.resolve(new Response('not json', { status: 200 })),
        );
        return expectAgentError(connector.health(), 'BACKEND_UNAVAILABLE');
    });

    it('maps an unexpected response shape → BACKEND_UNAVAILABLE', () =>
        expectAgentError(connectorReturning({ wrong: true }).health(), 'BACKEND_UNAVAILABLE'));

    it('rejects an empty projectId locally without a network call', async () => {
        let called = false;
        const connector = new WeblabAgentConnector(config, () => {
            called = true;
            return Promise.resolve(jsonResponse({ project: validMetadata }));
        });
        await expectAgentError(connector.getProject('   '), 'INVALID_INPUT');
        expect(called).toBe(false);
    });
});
