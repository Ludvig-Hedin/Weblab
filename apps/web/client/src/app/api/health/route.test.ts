import { describe, expect, it } from 'bun:test';

import { GET } from './route';

/**
 * F-470 — `GET /api/health`.
 * The health endpoint is the simplest contract in the API: it must return a
 * 200 with `{ ok: true }` so Railway's liveness probe stays green. A single
 * exit-0 test is sufficient coverage; nothing else about the route can
 * regress without changing this assertion.
 */
describe('GET /api/health', () => {
    it('returns 200 with { ok: true }', async () => {
        const response = GET();
        expect(response.status).toBe(200);
        const body = (await response.json()) as unknown;
        expect(body).toEqual({ ok: true });
    });

    it('sets a JSON content-type', async () => {
        const response = GET();
        const contentType = response.headers.get('content-type') ?? '';
        expect(contentType.toLowerCase()).toContain('application/json');
    });
});
