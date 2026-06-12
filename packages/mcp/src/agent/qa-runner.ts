#!/usr/bin/env bun
/**
 * Agent API QA runner — an API-first QA harness for the Weblab agent surface.
 *
 * It drives the SAME code the MCP tools use (config → connector → tools) against
 * a live deployment, with NO browser session and NO visual inspection. Every
 * main user flow that the read-first agent API can express is asserted from tool
 * output alone, and every failure is logged with: the call, expected, actual.
 *
 * Reusable by future Claude Code / MCP QA sessions:
 *   1. Seed isolated fixtures:  cd apps/web/client && bunx convex run agentTestSeed:seed
 *   2. Configure the deployment: bunx convex env set WEBLAB_AGENT_API_TOKEN <tok>
 *                                bunx convex env set WEBLAB_AGENT_USER_ID user_agent_qa_fixture
 *   3. Run:  WEBLAB_AGENT_API_URL=https://<dep>.convex.site \
 *            WEBLAB_AGENT_API_TOKEN=<tok> \
 *            bun packages/mcp/src/agent/qa-runner.ts
 *
 * Optional env:
 *   WEBLAB_QA_FOREIGN_PROJECT_ID  a real project id NOT owned by the agent
 *                                 account — enables the PERMISSION_DENIED (IDOR)
 *                                 check. Skipped (not failed) when absent.
 *
 * Exit code: 0 when every check passes, 1 otherwise. Machine-readable JSON
 * summary is printed last when WEBLAB_QA_JSON=1.
 */
import { APP_NAME } from '@weblab/constants/editor';

import type { AgentErrorCode } from './errors.js';
import { loadAgentConfigFromEnv } from './config.js';
import { WeblabAgentConnector } from './connector.js';
import { AgentApiError } from './errors.js';
import { createAgentTools } from './tools.js';

interface CheckResult {
    id: string;
    flow: string;
    name: string;
    status: 'pass' | 'fail' | 'skip';
    expected: string;
    actual: string;
}

const results: CheckResult[] = [];

function record(r: CheckResult): void {
    results.push(r);
    const icon = r.status === 'pass' ? '✓' : r.status === 'skip' ? '−' : '✗';
    console.log(`${icon} [${r.id}] ${r.flow} — ${r.name}`);
    if (r.status !== 'pass') {
        console.log(`    expected: ${r.expected}`);
        console.log(`    actual:   ${r.actual}`);
    }
}

/** Assert a predicate over a value produced without throwing. */
async function check(
    id: string,
    flow: string,
    name: string,
    expected: string,
    fn: () => Promise<{ ok: boolean; actual: string }>,
): Promise<void> {
    try {
        const { ok, actual } = await fn();
        record({ id, flow, name, status: ok ? 'pass' : 'fail', expected, actual });
    } catch (err) {
        const actual =
            err instanceof AgentApiError
                ? `threw [${err.code}] ${err.message}`
                : `threw ${err instanceof Error ? err.message : String(err)}`;
        record({ id, flow, name, status: 'fail', expected, actual });
    }
}

/** Assert that an operation throws an AgentApiError with a specific code. */
async function checkThrows(
    id: string,
    flow: string,
    name: string,
    expectedCode: AgentErrorCode,
    fn: () => Promise<unknown>,
): Promise<void> {
    try {
        const value = await fn();
        record({
            id,
            flow,
            name,
            status: 'fail',
            expected: `throws [${expectedCode}]`,
            actual: `resolved: ${JSON.stringify(value).slice(0, 200)}`,
        });
    } catch (err) {
        if (err instanceof AgentApiError && err.code === expectedCode) {
            record({
                id,
                flow,
                name,
                status: 'pass',
                expected: `throws [${expectedCode}]`,
                actual: `threw [${err.code}]`,
            });
        } else {
            const actual =
                err instanceof AgentApiError
                    ? `threw [${err.code}] ${err.message}`
                    : `threw ${err instanceof Error ? err.message : String(err)}`;
            record({
                id,
                flow,
                name,
                status: 'fail',
                expected: `throws [${expectedCode}]`,
                actual,
            });
        }
    }
}

async function main(): Promise<void> {
    console.log(`\n${APP_NAME} agent API — QA runner\n`);

    const config = loadAgentConfigFromEnv();
    const connector = new WeblabAgentConnector(config);
    const tools = createAgentTools(connector);
    const toolByName = new Map(tools.map((t) => [t.name, t]));
    const foreignProjectId = process.env.WEBLAB_QA_FOREIGN_PROJECT_ID?.trim();

    // ── Flow: config / process startup ──────────────────────────────────────
    await checkThrows(
        'QA-01',
        'startup',
        'missing env → CONFIG_MISSING',
        'CONFIG_MISSING',
        async () => loadAgentConfigFromEnv({}),
    );

    // ── Flow: new-user onboarding (account reachable + provisioned) ──────────
    const health = await connector.health();
    await check(
        'QA-02',
        'onboarding',
        'health_check authenticated + agent account resolved',
        'ok=true, authenticated=true, agentUserResolved=true',
        async () => ({
            ok: health.ok && health.authenticated && health.agentUserResolved,
            actual: JSON.stringify(health),
        }),
    );

    // ── Flow: returning user project access ─────────────────────────────────
    const projects = await connector.listProjects();
    await check(
        'QA-03',
        'returning-user',
        'list_projects returns owned fixtures, newest-first',
        '>=3 projects, all tagged agent-qa, createdAt descending',
        async () => {
            const allTagged = projects.every((p) => p.tags.includes('agent-qa'));
            const sorted = projects.every(
                (p, i) => i === 0 || projects[i - 1]!.createdAt >= p.createdAt,
            );
            return {
                ok: projects.length >= 3 && allTagged && sorted,
                actual: `count=${projects.length} allTagged=${allTagged} sorted=${sorted}`,
            };
        },
    );

    const ready = projects.find((p) => p.tags.includes('ready'));
    const pending = projects.find((p) => p.tags.includes('pending'));
    const failed = projects.find((p) => p.tags.includes('failed'));

    // ── Flow: read project/site state ───────────────────────────────────────
    await check(
        'QA-04',
        'read-state',
        'get_project (ready) exposes preview URL + branch + framework',
        'previewUrl set, sandboxId set, defaultBranchName=main, framework=nextjs',
        async () => {
            if (!ready) return { ok: false, actual: 'no ready fixture in list' };
            const p = await connector.getProject(ready.id);
            return {
                ok:
                    p.previewUrl !== null &&
                    p.sandboxId !== null &&
                    p.defaultBranchName === 'main' &&
                    p.framework === 'nextjs',
                actual: JSON.stringify({
                    previewUrl: p.previewUrl,
                    sandboxId: p.sandboxId,
                    branch: p.defaultBranchName,
                    framework: p.framework,
                }),
            };
        },
    );

    // ── Flow: key project actions / status (ready) ──────────────────────────
    await check(
        'QA-05',
        'project-status',
        'get_project_status (ready) → ready + completed deployment',
        'provisioning=ready, previewUrl set, latestDeployment.status=completed',
        async () => {
            if (!ready) return { ok: false, actual: 'no ready fixture' };
            const s = await connector.getProjectStatus(ready.id);
            return {
                ok:
                    s.provisioning === 'ready' &&
                    s.previewUrl !== null &&
                    s.latestDeployment?.status === 'completed',
                actual: JSON.stringify(s),
            };
        },
    );

    // ── Flow: loading/empty state via API (pending) ─────────────────────────
    await check(
        'QA-06',
        'loading-state',
        'get_project_status (pending) → pending, no preview, no deployment',
        'provisioning=pending, previewUrl=null, latestDeployment=null',
        async () => {
            if (!pending) return { ok: false, actual: 'no pending fixture' };
            const s = await connector.getProjectStatus(pending.id);
            return {
                ok:
                    s.provisioning === 'pending' &&
                    s.previewUrl === null &&
                    s.latestDeployment === null,
                actual: JSON.stringify(s),
            };
        },
    );

    // ── Flow: error state via API (failed) ──────────────────────────────────
    await check(
        'QA-07',
        'error-state',
        'get_project_status (failed) → failed + provisioningError',
        'provisioning=failed, provisioningError non-null',
        async () => {
            if (!failed) return { ok: false, actual: 'no failed fixture' };
            const s = await connector.getProjectStatus(failed.id);
            return {
                ok: s.provisioning === 'failed' && s.provisioningError !== null,
                actual: JSON.stringify(s),
            };
        },
    );

    // ── Flow: permission / not-found failures ───────────────────────────────
    await checkThrows(
        'QA-08',
        'permission',
        'get_project (bogus id) → NOT_FOUND',
        'NOT_FOUND',
        async () => connector.getProject('not_a_real_id_000000000000000'),
    );

    await checkThrows(
        'QA-09',
        'permission',
        'get_project (empty id) → INVALID_INPUT (client-side)',
        'INVALID_INPUT',
        async () => connector.getProject('   '),
    );

    if (foreignProjectId) {
        await checkThrows(
            'QA-10',
            'permission',
            'get_project (foreign project) → PERMISSION_DENIED (IDOR guard)',
            'PERMISSION_DENIED',
            async () => connector.getProject(foreignProjectId),
        );
    } else {
        record({
            id: 'QA-10',
            flow: 'permission',
            name: 'get_project (foreign project) → PERMISSION_DENIED (IDOR guard)',
            status: 'skip',
            expected: 'PERMISSION_DENIED',
            actual: 'skipped: set WEBLAB_QA_FOREIGN_PROJECT_ID to enable',
        });
    }

    // ── Flow: auth failure (wrong token) ────────────────────────────────────
    await checkThrows(
        'QA-11',
        'auth',
        'health with wrong token → AUTH_FAILED',
        'AUTH_FAILED',
        async () =>
            new WeblabAgentConnector({
                baseUrl: config.baseUrl,
                token: 'definitely-the-wrong-token',
            }).health(),
    );

    // ── Flow: backend unreachable ───────────────────────────────────────────
    await checkThrows(
        'QA-12',
        'resilience',
        'connector against bad host → BACKEND_UNAVAILABLE',
        'BACKEND_UNAVAILABLE',
        async () =>
            new WeblabAgentConnector(
                { baseUrl: 'https://invalid.weblab-agent-qa.invalid', token: config.token },
                // Force a fetch rejection without a real network round-trip.
                () => Promise.reject(new Error('getaddrinfo ENOTFOUND')),
            ).health(),
    );

    // ── Flow: honest write/log stubs (no fake capabilities) ─────────────────
    await check(
        'QA-13',
        'write-gate',
        'create_test_project (confirm:true) → UNSUPPORTED via tool',
        'tool returns isError with [UNSUPPORTED]',
        async () => {
            const tool = toolByName.get('weblab_create_test_project');
            if (!tool) return { ok: false, actual: 'tool missing' };
            try {
                const text = await tool.run({ confirm: true });
                return { ok: false, actual: `resolved: ${text}` };
            } catch (err) {
                const ok = err instanceof AgentApiError && err.code === 'UNSUPPORTED';
                return {
                    ok,
                    actual: err instanceof AgentApiError ? `[${err.code}]` : String(err),
                };
            }
        },
    );

    await check(
        'QA-14',
        'write-gate',
        'create_test_project (no confirm) → INVALID_INPUT (schema gate)',
        'rejected without confirm:true',
        async () => {
            const tool = toolByName.get('weblab_create_test_project');
            if (!tool) return { ok: false, actual: 'tool missing' };
            try {
                await tool.run({});
                return { ok: false, actual: 'resolved (gate bypassed!)' };
            } catch (err) {
                const ok = err instanceof AgentApiError && err.code === 'INVALID_INPUT';
                return { ok, actual: err instanceof AgentApiError ? `[${err.code}]` : String(err) };
            }
        },
    );

    await check(
        'QA-15',
        'logs',
        'read_logs → UNSUPPORTED (honest stub)',
        'tool throws [UNSUPPORTED]',
        async () => {
            const tool = toolByName.get('weblab_read_logs');
            if (!tool) return { ok: false, actual: 'tool missing' };
            try {
                await tool.run({ projectId: ready?.id ?? 'x' });
                return { ok: false, actual: 'resolved' };
            } catch (err) {
                const ok = err instanceof AgentApiError && err.code === 'UNSUPPORTED';
                return { ok, actual: err instanceof AgentApiError ? `[${err.code}]` : String(err) };
            }
        },
    );

    // ── Summary ─────────────────────────────────────────────────────────────
    const pass = results.filter((r) => r.status === 'pass').length;
    const fail = results.filter((r) => r.status === 'fail').length;
    const skip = results.filter((r) => r.status === 'skip').length;
    console.log(`\n${pass} passed · ${fail} failed · ${skip} skipped (of ${results.length})\n`);

    if (process.env.WEBLAB_QA_JSON === '1') {
        console.log(JSON.stringify({ pass, fail, skip, results }, null, 2));
    }

    process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error(err instanceof AgentApiError ? `[${err.code}] ${err.message}` : err);
    process.exit(1);
});
