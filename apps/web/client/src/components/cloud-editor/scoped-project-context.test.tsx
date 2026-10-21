// Run this focused file alone: auth/transport boundaries are mocked, while the
// real React provider, effects and DOM mounting remain in use.
import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { FunctionReturnType } from 'convex/server';
import { act, createElement } from 'react';
import { Window } from 'happy-dom';

import type { ScopedEditorProject } from '@/components/store/editor/engine';
import type { ConvexAuthOwner } from '@/components/store/lib/convex-http-client';
import type { cloudEditorEntryApi } from '@/lib/cloud-editor-entry-api';

type Entry = NonNullable<FunctionReturnType<typeof cloudEditorEntryApi.entry>>;
type Listener = (value: { user: { id: string } | null; session: { id: string } | null }) => void;
const browser = new Window();
const globals = {
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    HTMLElement: browser.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
};
const originalGlobals = new Map(
    Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
);
for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });

let online = true;
let userId = 'clerk-a';
let sessionId = 'session-a';
let reactive: Entry | null = null;
let owner: ConvexAuthOwner;
const listeners = new Set<Listener>();
const requests: Array<{ resolve: (value: Entry | null) => void }> = [];
const clerk = {
    user: { id: userId } as { id: string } | null,
    session: { id: sessionId } as { id: string } | null,
    addListener: (listener: Listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
};
void mock.module('@clerk/nextjs', () => ({
    useClerk: () => clerk,
    useAuth: () => ({
        isLoaded: true,
        isSignedIn: !!clerk.user,
        userId: clerk.user?.id ?? null,
        sessionId: clerk.session?.id ?? null,
    }),
}));
void mock.module('convex/react', () => ({
    useConvexAuth: () => ({ isAuthenticated: !!clerk.user, isLoading: false }),
    useQuery: (_reference: unknown, args: unknown) => (args === 'skip' ? undefined : reactive),
}));
void mock.module('@/lib/cloud-editor/copy', () => ({
    useCloudEditorCopy: () => ({ loading: 'Loading' }),
}));
void mock.module('@/services/offline/online-status', () => ({ useOnlineStatus: () => online }));
void mock.module('./project-sign-in', () => ({
    CloudProjectSignIn: () => createElement('div', null, 'Sign in'),
}));
void mock.module('@/components/store/lib/convex-http-client', () => ({
    captureConvexAuthOwner: () => owner,
    getConvexHttpClientForOwner: () => ({
        query: () => new Promise<Entry | null>((resolve) => requests.push({ resolve })),
    }),
}));
const { createRoot } = await import('react-dom/client');
const { ScopedProjectBoundary } = await import('./scoped-project-context');
let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLDivElement;
let mountedScope: ScopedEditorProject | null = null;

function entry(projectId = 'project-a'): Entry {
    return {
        user: { _id: 'actor-a', clerkUserId: 'clerk-a' },
        capabilities: ['project.view'],
        bootstrap: {
            project: { _id: projectId },
            branches: [{ _id: 'branch-a', frames: [] }],
            canvas: null,
            conversations: [],
            creationRequest: null,
        },
    } as unknown as Entry;
}
function observe(nextUser: string | null, nextSession: string | null) {
    userId = nextUser ?? '';
    sessionId = nextSession ?? '';
    clerk.user = nextUser ? { id: nextUser } : null;
    clerk.session = nextSession ? { id: nextSession } : null;
    const capturedUser = userId,
        capturedSession = sessionId;
    owner = {
        userId,
        sessionId,
        generation: 1,
        signal: new AbortController().signal,
        ready: Promise.resolve(),
        isCurrent: () => clerk.user?.id === capturedUser && clerk.session?.id === capturedSession,
    };
    for (const listener of listeners) listener({ user: clerk.user, session: clerk.session });
}
async function render(projectId = 'project-a') {
    await act(async () =>
        root?.render(
            createElement(ScopedProjectBoundary, {
                projectId,
                actorId: 'actor-a',
                children: (value) => {
                    mountedScope = value.scope;
                    return createElement('div', { 'data-editor': value.projectId }, 'Editor');
                },
            }),
        ),
    );
}
async function resolveRequest(index: number, value: Entry | null) {
    const request = requests[index];
    if (!request) throw new Error('Expected a fresh admission request');
    await act(async () => request.resolve(value));
}
function latestRequest() {
    if (requests.length === 0) throw new Error('Expected fresh admission to start');
    return requests.length - 1;
}
function editor() {
    return container.querySelector('[data-editor]');
}

beforeEach(() => {
    online = true;
    requests.splice(0);
    listeners.clear();
    mountedScope = null;
    observe('clerk-a', 'session-a');
    reactive = entry();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root?.unmount());
    root = null;
    container.remove();
});
afterAll(async () => {
    mock.restore();
    await browser.happyDOM.abort();
    for (const [key, descriptor] of originalGlobals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

describe('mounted scoped project admission', () => {
    it('waits for fresh admission on the same account with a new session and fences the old scope', async () => {
        await render();
        expect(editor()).toBeNull();
        await resolveRequest(latestRequest(), entry());
        expect(editor()).not.toBeNull();
        const firstScope = mountedScope;
        if (!firstScope) throw new Error('Expected an admitted editor scope');
        await act(async () => observe('clerk-a', 'session-b'));
        await render();
        expect(firstScope.isCurrent()).toBe(false);
        expect(editor()).toBeNull();
        await resolveRequest(latestRequest(), entry());
        expect(editor()).not.toBeNull();
        const renewedScope = mountedScope;
        if (!renewedScope) throw new Error('Expected the renewed editor scope');
        await act(async () => observe(null, null));
        await render();
        expect(editor()).toBeNull();
        expect(renewedScope.isCurrent()).toBe(false);
    });

    it('does not reopen former source from a stale admission after switching accounts', async () => {
        await render();
        const previousRequest = latestRequest();
        await act(async () => observe('clerk-b', 'session-b'));
        await render();
        const currentRequest = latestRequest();
        expect(currentRequest).toBeGreaterThan(previousRequest);
        await resolveRequest(previousRequest, entry());
        expect(editor()).toBeNull();
        await resolveRequest(currentRequest, entry());
        expect(editor()).toBeNull();
    });

    it('removes the editor offline and requires a fresh response after reconnect', async () => {
        await render();
        await resolveRequest(latestRequest(), entry());
        expect(editor()).not.toBeNull();
        online = false;
        await render();
        expect(editor()).toBeNull();
        online = true;
        await render();
        expect(editor()).toBeNull();
        await resolveRequest(latestRequest(), entry());
        expect(editor()).not.toBeNull();
        reactive = null;
        await render();
        expect(editor()).toBeNull();
    });

    it('ignores a previous project response and a response arriving after teardown', async () => {
        await render();
        const previousRequest = latestRequest();
        reactive = entry('project-b');
        await render('project-b');
        const currentRequest = latestRequest();
        expect(currentRequest).toBeGreaterThan(previousRequest);
        await resolveRequest(previousRequest, entry());
        expect(editor()).toBeNull();
        await resolveRequest(currentRequest, entry('project-b'));
        expect(editor()?.getAttribute('data-editor')).toBe('project-b');
        online = false;
        await render('project-b');
        online = true;
        await render('project-b');
        const unmountedRequest = latestRequest();
        await act(async () => root?.unmount());
        root = null;
        await resolveRequest(unmountedRequest, entry('project-b'));
        expect(editor()).toBeNull();
    });
});
