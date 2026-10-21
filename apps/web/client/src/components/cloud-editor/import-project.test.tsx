// Run alone: Clerk, navigation and network boundaries are mocked. The real
// mounted form, folder review and CloudImportSession controller stay in use.
import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cloneElement, createElement, forwardRef, type ComponentProps, type ReactElement } from 'react';
import { getFunctionName } from 'convex/server';
import type { FunctionArgs } from 'convex/server';
import { Window } from 'happy-dom';
import type { Id } from '@convex/_generated/dataModel';
import type { cloudImportApi, ImportStatus } from '@/lib/cloud-imports/api';
import copy from '../../../messages/cloud-imports/en.json';

type Begin = FunctionArgs<typeof cloudImportApi.begin>;
type Finalize = FunctionArgs<typeof cloudImportApi.finalize>;
type Session = { id: string; user: { id: string }; getToken: (options?: { template: string }) => Promise<string> };
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}
const browser = new Window({ url: 'https://weblab.test' });
const globals = { window: browser, document: browser.document, navigator: browser.navigator,
    HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
Object.defineProperty(browser.HTMLInputElement.prototype, 'webkitdirectory', { configurable: true, writable: true, value: false });
const originalFetch = globalThis.fetch;
let session: Session | null;
let row: ImportStatus | null;
let rowOperationKey: string | null;
let attemptCount = 0;
let beginRepliesLostBeforeCommit = 0, beginRepliesLostAfterCommit = 0;
let finalizeRepliesLostBeforeCommit = 0, finalizeRepliesLostAfterCommit = 0;
let beginGate: ReturnType<typeof deferred<void>> | null;
let finalizeGate: ReturnType<typeof deferred<void>> | null;
let tokenGate: ReturnType<typeof deferred<string>> | null;
const begins: Begin[] = [], finalizes: Finalize[] = [], uploads: Array<{ index: number; token: string | null }> = [];
const calls: Array<{ name: string; token: string }> = [];
const navigations: string[] = [];
const clerk: { session: Session | null; user: { id: string } | null } = { session: null, user: null };
const router = { push: (path: string) => { navigations.push(path); } };
function login(id = 'session-a') {
    session = { id, user: { id: 'clerk-a' }, getToken: options => options?.template === 'convex'
        ? tokenGate?.promise ?? Promise.resolve(`convex:${id}`) : Promise.resolve(`upload:${id}`) };
    clerk.session = session; clerk.user = session.user;
}
void mock.module('@clerk/nextjs', () => ({ useSession: () => ({ isLoaded: true, session }), useClerk: () => clerk }));
void mock.module('next/navigation', () => ({ useRouter: () => router }));
void mock.module('next/link', () => ({ default: (props: ComponentProps<'a'>) => createElement('a', props) }));
void mock.module('@/env', () => ({ env: { NEXT_PUBLIC_CONVEX_URL: 'https://fixture.convex.cloud' } }));
void mock.module('@/lib/cloud-imports/copy', () => ({ useCloudImportCopy: () => copy }));
// Leaf visual controls only; preserve actual native input/ref and button events.
void mock.module('@weblab/ui/button', () => ({ Button: ({ asChild, loading: _loading, variant: _variant, size: _size, ...props }:
    ComponentProps<'button'> & { asChild?: boolean; loading?: boolean; variant?: string; size?: string }) => asChild
        ? cloneElement(props.children as ReactElement) : createElement('button', props) }));
void mock.module('@weblab/ui/input', () => ({ Input: forwardRef<HTMLInputElement, ComponentProps<'input'>>((props, ref) => createElement('input', { ...props, ref })) }));
void mock.module('@weblab/ui/label', () => ({ Label: (props: ComponentProps<'label'>) => createElement('label', props) }));
function nameOf(reference: unknown) { return getFunctionName(reference as Parameters<typeof getFunctionName>[0]).split(':')[1]; }
void mock.module('convex/browser', () => ({ ConvexHttpClient: class {
    token = '';
    setAuth(token: string) { this.token = token; }
    async query(reference: unknown) {
        const name = nameOf(reference); calls.push({ name: name ?? '', token: this.token });
        if (name === 'access') return { actorId: 'actor-a', enabled: true, limits: { files: 400, bytes: 64 * 1024 * 1024, assetBytes: 32 * 1024 * 1024, textBytes: 750_000, inlineBytes: 700_000 } };
        if (name === 'status' || name === 'findAttempt') return row ? structuredClone(row) : null;
        throw new Error(`Unexpected query ${name}`);
    }
    async mutation(reference: unknown, args: Begin | Finalize) {
        const name = nameOf(reference); calls.push({ name: name ?? '', token: this.token });
        if (name === 'begin') {
            const request = args as Begin; begins.push(structuredClone(request));
            if (beginRepliesLostBeforeCommit-- > 0) throw new Error('Lost begin before commit');
            if (!row || rowOperationKey !== request.operationKey) {
                rowOperationKey = request.operationKey;
                row = { attemptId: `attempt-${String.fromCharCode(97 + attemptCount++)}` as Id<'cloudEditorImports'>, manifestHash: await manifestHash(request), name: request.name,
                bytes: request.files.reduce((total, file) => total + file.bytes, 0), expiresAt: Date.now() + 60_000,
                state: 'open', projectId: null, branchId: null,
                files: request.files.map(({ path, kind, bytes, hash }, index) => ({ index, path, kind, bytes, hash,
                    state: kind === 'text' ? 'received' : 'pending', valid: kind === 'text', canUpload: kind === 'binary' })) };
            }
            if (beginGate) await beginGate.promise;
            if (beginRepliesLostAfterCommit-- > 0) throw new Error('Lost begin after commit');
            return { attemptId: row.attemptId, manifestHash: row.manifestHash };
        }
        if (name === 'finalize') {
            finalizes.push(structuredClone(args as Finalize));
            if (finalizeGate) await finalizeGate.promise;
            if (finalizeRepliesLostBeforeCommit-- > 0) throw new Error('Lost finalize before commit');
            if (!row) throw new Error('No attempt');
            const suffix = row.attemptId.slice(-1);
            row.state = 'finalized'; row.projectId = `project-${suffix}` as Id<'projects'>; row.branchId = `branch-${suffix}` as Id<'branches'>;
            if (finalizeRepliesLostAfterCommit-- > 0) throw new Error('Lost finalize after commit');
            return { projectId: row.projectId, branchId: row.branchId };
        }
        if (name === 'cancel') { if (!row) throw new Error('No attempt'); row.state = 'expired'; return structuredClone(row); }
        throw new Error(`Unexpected mutation ${name}`);
    }
} }));
async function manifestHash(request: Begin) {
    const bytes = new TextEncoder().encode(JSON.stringify(request.files.map(file => [file.path, file.kind, file.bytes, file.hash])));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
const { createRoot } = await import('react-dom/client');
const { CloudImportProject } = await import('./import-project');
let root: ReturnType<typeof createRoot> | null, container: HTMLDivElement;
function folder(rootName = 'site', pageSource = 'page source') {
    return [['site/package.json', '{"dependencies":{"next":"16"}}'], ['site/src/app/layout.tsx', 'layout source'],
        ['site/src/app/page.tsx', pageSource], ['site/public/photo.png', 'image bytes'], ['site/.env.local', 'private secret']].map(([path, content]) => {
        const relativePath = path!.replace(/^site\//, `${rootName}/`);
        const file = new File([content!], relativePath.split('/').at(-1)!);
        Object.defineProperty(file, 'webkitRelativePath', { value: relativePath }); return file;
    });
}
async function render() { await act(async () => { root?.render(createElement(CloudImportProject, { workspaceId: 'workspace-a' as Id<'workspaces'>, workspaceSlug: 'agency' })); }); }
function button(label: string) { return Array.from(container.querySelectorAll('button')).find(element => element.textContent === label); }
async function until(predicate: () => boolean) {
    for (let count = 0; count < 100; count++) {
        if (predicate()) return;
        await act(async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); });
    }
    throw new Error(`Mounted import did not settle: ${container.textContent}`);
}
async function click(label: string) {
    const target = button(label); if (!target || target.disabled) throw new Error(`Expected enabled ${label}`);
    await act(async () => { target.click(); });
}
async function selectFolder(files = folder()) {
    await until(() => !!button(copy.choose) && !button(copy.choose)!.disabled || !!button(copy.chooseSame) && !button(copy.chooseSame)!.disabled);
    const input = container.querySelector<HTMLInputElement>('input[type=file]'); if (!input) throw new Error('Expected actual folder input');
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    await act(async () => { input.dispatchEvent(new window.Event('change', { bubbles: true })); });
    await until(() => container.querySelector('h2')?.textContent === copy.review && !container.textContent?.includes(copy.analyzing));
}
function recovery() {
    const key = browser.sessionStorage.key(0); if (!key) throw new Error('Expected persisted attempt');
    return JSON.parse(browser.sessionStorage.getItem(key)!) as { operationKey: string; manifestHash: string; cancelRequested: boolean; files: Array<{ path: string }> };
}
beforeEach(() => {
    row = null; rowOperationKey = null; attemptCount = 0; beginRepliesLostBeforeCommit = beginRepliesLostAfterCommit = finalizeRepliesLostBeforeCommit = finalizeRepliesLostAfterCommit = 0;
    beginGate = finalizeGate = null; tokenGate = null; begins.length = finalizes.length = uploads.length = calls.length = navigations.length = 0;
    browser.history.replaceState(null, '', '/w/agency/cloud-pilot/import');
    browser.sessionStorage.clear(); login();
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const match = /^\/api\/cloud-imports\/(attempt-[a-z])\/(\d+)$/.exec(String(input));
        if (!match || !row || match[1] !== row.attemptId) throw new Error('Unexpected upload');
        const index = Number(match[2]); uploads.push({ index, token: new Headers(init?.headers).get('authorization') });
        const file = row.files[index]; if (!file) throw new Error('Missing upload index');
        file.state = 'received'; file.valid = true; file.canUpload = false;
        return Response.json({ received: true });
    }) as typeof fetch;
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => { root?.unmount(); }); root = null; container.remove(); globalThis.fetch = originalFetch; });
afterAll(async () => {
    mock.restore(); await browser.happyDOM.abort();
    for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
});

describe('mounted folder import', () => {
    it('reviews the real selected folder and uploads only after explicit submit before navigating', async () => {
        await render(); await selectFolder();
        expect(begins).toHaveLength(0); expect(uploads).toHaveLength(0); expect(navigations).toHaveLength(0);
        expect(container.textContent).toContain('src/app/page.tsx'); expect(container.textContent).toContain('.env.local');
        await click(copy.start); await until(() => navigations.length === 1);
        expect(navigations).toEqual(['/project/project-a']); expect(begins).toHaveLength(1); expect(uploads).toHaveLength(1);
        expect(uploads[0]?.token).toBe('Bearer upload:session-a');
        expect(begins[0]?.files.some(file => file.path === '.env.local')).toBe(false);
        const raw = JSON.stringify(recovery()); expect(raw).not.toContain('page source'); expect(raw).not.toContain('private secret'); expect(raw).not.toContain('convex:');
        expect(finalizes).toHaveLength(1);
    });
    for (const pathname of ['/w/agency/cloud-pilot/import', '/w/agency/projects', '/project/project-other', '/project/project-a/settings']) {
        it(`keeps the completed receipt when navigation has not committed the exact saved project: ${pathname}`, async () => {
            await render(); await selectFolder(); await click(copy.start); await until(() => navigations.length === 1);
            const key = browser.sessionStorage.key(0)!;
            const raw = browser.sessionStorage.getItem(key);
            expect(raw).not.toBeNull();
            // The real completed callback called router.push. That alone is not
            // a successful navigation, so the recovery record still exists.
            expect(browser.location.pathname).toBe('/w/agency/cloud-pilot/import');
            expect(navigations).toEqual(['/project/project-a']);
            browser.history.replaceState(null, '', pathname);
            await act(async () => { root?.render(null); });
            expect(browser.sessionStorage.getItem(key)).toBe(raw);
        });
    }
    it('retires the matching receipt only after committed project navigation and admits a distinct folder on return', async () => {
        await render(); await selectFolder(); await click(copy.start); await until(() => navigations.length === 1);
        const first = recovery(); const key = browser.sessionStorage.key(0)!;
        expect(browser.sessionStorage.getItem(key)).not.toBeNull();
        browser.history.replaceState(null, '', '/project/project-a');
        await act(async () => { root?.render(null); });
        expect(browser.sessionStorage.getItem(key)).toBeNull();
        browser.history.replaceState(null, '', '/w/agency/cloud-pilot/import');
        await render(); await selectFolder(folder('second-site', 'different page source'));
        expect(begins).toHaveLength(1); expect(container.textContent).toContain('second-site');
        await click(copy.start); await until(() => navigations.length === 2);
        expect(begins).toHaveLength(2); expect(begins[1]?.operationKey).not.toBe(first.operationKey);
        expect(begins[1]?.name).toBe('second-site'); expect(recovery().manifestHash).not.toBe(first.manifestHash);
        expect(navigations).toEqual(['/project/project-a', '/project/project-b']);
    });
    it('leaves a replacement record intact even when the exact saved project URL commits', async () => {
        await render(); await selectFolder(); await click(copy.start); await until(() => navigations.length === 1);
        const key = browser.sessionStorage.key(0)!;
        const raw = browser.sessionStorage.getItem(key)!;
        // Another writer replaced the owner key. The retiring controller only
        // owns its exact serialized receipt, never newer bytes at that key.
        const replacement = JSON.stringify({ ...JSON.parse(raw), operationKey: 'replacement-operation-identity' });
        browser.sessionStorage.setItem(key, replacement);
        browser.history.replaceState(null, '', '/project/project-a');
        await act(async () => { root?.render(null); });
        expect(browser.sessionStorage.getItem(key)).toBe(replacement);
    });
    it('resumes uncertain begin and finalize replies with the same immutable request and no duplicate upload', async () => {
        beginRepliesLostBeforeCommit = 1; finalizeRepliesLostBeforeCommit = 1;
        await render(); await selectFolder(); await click(copy.start);
        await until(() => !!container.textContent?.includes(copy.uncertain) && !button(copy.resume)?.disabled);
        const first = recovery(); await click(copy.resume);
        await until(() => finalizes.length === 1 && !button(copy.resume)?.disabled);
        expect(navigations).toHaveLength(0); expect(recovery().operationKey).toBe(first.operationKey);
        await click(copy.resume); await until(() => navigations.length === 1);
        expect(begins).toHaveLength(2); expect(begins[1]).toEqual(begins[0]); expect(finalizes).toHaveLength(2);
        expect(finalizes[1]).toEqual(finalizes[0]); expect(uploads).toHaveLength(1);
    });
    it('reconciles committed lost replies without creating or finalizing a second project', async () => {
        beginRepliesLostAfterCommit = 1; finalizeRepliesLostAfterCommit = 1;
        await render(); await selectFolder(); await click(copy.start); await until(() => navigations.length === 1);
        expect(begins).toHaveLength(1); expect(finalizes).toHaveLength(1); expect(uploads).toHaveLength(1);
        expect(calls.some(call => call.name === 'findAttempt')).toBe(true); expect(navigations).toEqual(['/project/project-a']);
    });
    it('fences the old captured token on same-account session rotation before dispatch', async () => {
        await render(); await selectFolder(); tokenGate = deferred<string>(); await click(copy.start);
        const pending = tokenGate; const originalAttempt = recovery(); tokenGate = null; login('session-b'); await render();
        await act(async () => { pending.resolve('convex:session-a'); });
        await until(() => !!container.textContent?.includes(copy.uncertain));
        expect(begins).toHaveLength(0); expect(uploads).toHaveLength(0); expect(navigations).toHaveLength(0);
        await selectFolder(); await click(copy.resume); await until(() => navigations.length === 1);
        expect(begins[0]?.operationKey).toBe(originalAttempt.operationKey);
        expect(calls.filter(call => call.name === 'begin').map(call => call.token)).toEqual(['convex:session-b']);
    });
    it('ignores a begin reply after sign-out without uploading or navigating', async () => {
        beginGate = deferred<void>(); await render(); await selectFolder(); await click(copy.start);
        await until(() => begins.length === 1); const gate = beginGate;
        session = null; clerk.session = null; clerk.user = null; await render();
        await act(async () => { gate.resolve(); });
        expect(container.textContent).toContain(copy.signIn); expect(uploads).toHaveLength(0); expect(finalizes).toHaveLength(0); expect(navigations).toHaveLength(0);
    });
    it('persists cancel while begin is pending and observes closure before any upload', async () => {
        beginGate = deferred<void>(); await render(); await selectFolder(); await click(copy.start);
        await until(() => begins.length === 1); await click(copy.cancel); expect(recovery().cancelRequested).toBe(true);
        await act(async () => { beginGate?.resolve(); }); await until(() => !!container.textContent?.includes(copy.canceled));
        expect(calls.some(call => call.name === 'cancel')).toBe(true); expect(uploads).toHaveLength(0); expect(finalizes).toHaveLength(0); expect(navigations).toHaveLength(0);
    });
    it('recovers pending cancel under the new session without continuing the former session', async () => {
        beginGate = deferred<void>(); await render(); await selectFolder(); await click(copy.start);
        await until(() => row !== null); await click(copy.cancel); const originalAttempt = recovery();
        login('session-b'); await render();
        await until(() => !!container.textContent?.includes(copy.canceled));
        await act(async () => { beginGate?.resolve(); });
        expect(recovery().operationKey).toBe(originalAttempt.operationKey);
        expect(calls.filter(call => call.name === 'cancel').map(call => call.token)).toEqual(['convex:session-b']);
        expect(uploads).toHaveLength(0); expect(finalizes).toHaveLength(0); expect(navigations).toHaveLength(0);
    });
    it('keeps a finalized project when cancel races the final receipt', async () => {
        finalizeGate = deferred<void>(); await render(); await selectFolder(); await click(copy.start);
        await until(() => finalizes.length === 1); await click(copy.cancel);
        await act(async () => { finalizeGate?.resolve(); }); await until(() => navigations.length === 1);
        expect(navigations).toEqual(['/project/project-a']); expect(calls.some(call => call.name === 'cancel')).toBe(false);
        expect(begins).toHaveLength(1); expect(finalizes).toHaveLength(1);
    });
});
