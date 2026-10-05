import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { makeFunctionReference } from 'convex/server';
import { ReleaseSession } from './session';

const capture = makeFunctionReference<'mutation', Record<string, never>, string>('cloudReleases:capture');
const prepare = makeFunctionReference<'action', { releaseId: string }, string>('cloudReleaseActions:prepare');
const status = makeFunctionReference<'query', Record<string, never>, { actorId: string }>('cloudReleases:status');
const response = (value: unknown) => Response.json({ status: 'success', value, logLines: [] });
function mockFetch(handler: (...args: Parameters<typeof globalThis.fetch>) => ReturnType<typeof globalThis.fetch>) {
    return spyOn(globalThis, 'fetch').mockImplementation(Object.assign(handler, { preconnect: globalThis.fetch.preconnect }));
}
function fixture() {
    let current = true, token = 'a'; const controller = new AbortController();
    const session = new ReleaseSession({ backend: 'https://release-session.convex.cloud', current: () => current,
        signal: controller.signal, getToken: async () => token });
    return { session, controller, leave: () => { current = false; }, refresh: () => { token = 'a-refreshed'; } };
}
afterEach(() => mock.restore());

describe('release operation session', () => {
    it('refuses stale React actor data before any mutation and allows same-session refresh', async () => {
        const seen: string[] = [];
        mockFetch(async (_input, init) => { seen.push(new Headers(init?.headers).get('authorization')!); return response({ actorId: 'b' }); });
        const f = fixture();
        await expect(f.session.verifyActor('a', client => client.query(status, {}))).rejects.toThrow('SESSION_CHANGED');
        f.refresh();
        await f.session.verifyActor('b', client => client.query(status, {}));
        expect(seen).toEqual(['Bearer a', 'Bearer a-refreshed']);
    });
    it('never sends when the account changes while the captured token is loading', async () => {
        const token = Promise.withResolvers<string | null>(); let current = true, calls = 0;
        mockFetch(async () => { calls++; return response('unexpected'); });
        const session = new ReleaseSession({ backend: 'https://release-session.convex.cloud', current: () => current,
            signal: new AbortController().signal, getToken: () => token.promise });
        const result = session.call(client => client.mutation(capture, {})).catch(error => error as Error);
        current = false; token.resolve('old-token');
        expect(await result).toBeInstanceOf(Error); expect(calls).toBe(0);
    });
    it('does not prepare a captured backup after account departure, even if the old response succeeds', async () => {
        const entered = Promise.withResolvers<void>(), finish = Promise.withResolvers<Response>();
        const sent: string[] = []; const f = fixture();
        mockFetch(async (_input, init) => {
            sent.push((JSON.parse(String(init?.body)) as { path: string }).path);
            entered.resolve(); return finish.promise;
        });
        const result = (async () => {
            const releaseId = await f.session.call(client => client.mutation(capture, {}));
            return f.session.call(client => client.action(prepare, { releaseId }));
        })().catch(error => error as Error);
        await entered.promise; f.leave(); finish.resolve(response('backup-one'));
        expect(await result).toBeInstanceOf(Error); expect(sent).toEqual(['cloudReleases:capture']);
    });
    it('cancels an unmounted scope and rechecks ownership at actual HTTP dispatch', async () => {
        const f = fixture(); let sends = 0;
        mockFetch(async () => { sends++; return response('unexpected'); });
        await expect(f.session.call(client => { f.leave(); return client.mutation(capture, {}); })).rejects.toThrow('SESSION_CHANGED');
        expect(sends).toBe(0);
        const other = fixture(); other.controller.abort();
        await expect(other.session.call(client => client.mutation(capture, {}))).rejects.toThrow('SESSION_CHANGED');
        expect(sends).toBe(0);
    });
});
