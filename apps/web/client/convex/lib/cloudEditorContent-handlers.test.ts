import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { getFunctionName } from 'convex/server';
import type { Id } from '../_generated/dataModel';
import type { ActionCtx, MutationCtx } from '../_generated/server';
import { _approvalInput, _approve, _commit, _input, assets, contracts, revoke } from '../cloudEditorContent';
import { approve, commit } from '../cloudEditorContentActions';
import { approveCloudContentBindings, type CloudContentBinding } from './cloudContentContract';

const scope = { projectId: 'projects:one' as Id<'projects'>, branchId: 'branches:one' as Id<'branches'> };
const workspaceId = 'workspaces:one' as Id<'workspaces'>;
const page = (id: string) => `export default function Page() { return <main data-oid="root-${id}"><h1 data-oid="title-${id}">Hello</h1></main>; }`;
type Row = Record<string, unknown> & { _id: string };

// Uses real registered Node actions, handlers and permission checks. The fixture
// emulates only auth/database IO; it does not simulate Convex transaction rollback
// or argument validators. Assertions on rejected batches require zero writes.
function fixture() {
    const tables = new Map<string, Map<string, Row>>();
    const table = (name: string) => {
        let result = tables.get(name);
        if (!result) { result = new Map(); tables.set(name, result); }
        return result;
    };
    const put = (name: string, id: string, value: Record<string, unknown>) => table(name).set(id, { _id: id, _creationTime: 1, ...value });
    const get = (id: string) => table(id.split(':')[0]!).get(id) ?? null;
    let subject: string | null = 'builder';
    let sequence = 0;
    let beforeCommit: (() => void) | null = null;
    const writes: string[] = [];
    const scheduled: Array<{ name: string; args: unknown }> = [];
    put('workspaces', workspaceId, { createdByUserId: 'users:owner' });
    put('projects', scope.projectId, { workspaceId, accessMode: 'restricted' });
    put('branches', scope.branchId, { projectId: scope.projectId });
    for (const user of ['builder', 'customer', 'other', 'viewer']) {
        put('users', `users:${user}`, { clerkUserId: user, email: `${user}@example.com` });
        put('workspaceMembers', `workspaceMembers:${user}`, { workspaceId, userId: `users:${user}`, role: 'member' });
        put('projectMembers', `projectMembers:${user}`, { projectId: scope.projectId, userId: `users:${user}`, role: user === 'builder' ? 'manager' : 'viewer' });
        if (user === 'customer' || user === 'other') put('cloudEditorGrants', `cloudEditorGrants:${user}`, {
            projectId: scope.projectId, userId: `users:${user}`, role: 'content', publish: false, updatedAt: 1 });
    }
    for (const [path, id] of [['app/page.tsx', 'one'], ['app/about/page.tsx', 'two']] as const) {
        const text = page(id);
        put('cloudEditorFiles', `cloudEditorFiles:${id}`, { ...scope, path, kind: 'file', text, bytes: Buffer.byteLength(text), hash: '0'.repeat(64) });
    }
    put('cloudEditorStates', 'cloudEditorStates:one', { ...scope, workspaceId, version: 1, createdByUserId: 'users:builder',
        revision: 1, bytes: Buffer.byteLength(page('one')) + Buffer.byteLength(page('two')), fileCount: 2, status: 'stopped' });
    const ctx = {
        auth: { getUserIdentity: async () => subject ? { subject, tokenIdentifier: `issuer|${subject}` } : null },
        db: {
            get: async (id: string) => get(id),
            insert: async (name: string, value: Record<string, unknown>) => { const id = `${name}:${++sequence}`; put(name, id, value); writes.push(`insert:${name}`); return id; },
            patch: async (id: string, value: Record<string, unknown>) => { Object.assign(get(id)!, value); writes.push(`patch:${id}`); },
            replace: async (id: string, value: Record<string, unknown>) => { put(id.split(':')[0]!, id, value); writes.push(`replace:${id}`); },
            delete: async (id: string) => { table(id.split(':')[0]!).delete(id); writes.push(`delete:${id}`); },
            query: (name: string) => {
                const constraints: Array<[string, unknown]> = [];
                const index = { eq: (key: string, value: unknown) => { constraints.push([key, value]); return index; } };
                const rows = () => [...table(name).values()].filter(row => constraints.every(([key, value]) => row[key] === value));
                const query = {
                    withIndex: (_name: string, build: (q: typeof index) => unknown) => { build(index); return query; },
                    take: async (limit: number) => rows().slice(0, limit),
                    collect: async () => rows(),
                    unique: async () => { const found = rows(); if (found.length > 1) throw new Error('Nonunique row'); return found[0] ?? null; },
                };
                return query;
            },
        },
        scheduler: { runAfter: async (_delay: number, ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
            scheduled.push({ name: getFunctionName(ref), args });
        } },
    } as unknown as MutationCtx;
    const handlers: Record<string, (ctx: MutationCtx, args: never) => Promise<unknown>> = {
        'cloudEditorContent:_approvalInput': _approvalInput._handler,
        'cloudEditorContent:_approve': _approve._handler,
        'cloudEditorContent:_input': _input._handler,
        'cloudEditorContent:_commit': _commit._handler,
    };
    const run = async (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
        const name = getFunctionName(reference);
        if (name === 'cloudEditorContent:_commit') beforeCommit?.();
        const handler = handlers[name];
        if (!handler) throw new Error(`Unexpected reference ${name}`);
        return handler(ctx, args as never);
    };
    const action = { runQuery: run, runMutation: run } as unknown as ActionCtx;
    const approvePath = (path = 'app/page.tsx', oid = 'title-one', expectedGeneration = 0) => approve._handler(action,
        { ...scope, path, oids: [oid], expectedRevision: Number(get('cloudEditorStates:one')!.revision), expectedGeneration });
    const request = (content = page('one').replace('Hello', 'Welcome')) => ({ ...scope,
        actorId: 'users:customer' as Id<'users'>, transport: 'content' as const, transportVersion: 1 as const,
        expectedRevision: 1, operationId: 'content_operation_0001', changes: [{ path: 'app/page.tsx', content }],
        expectedContracts: [{ path: 'app/page.tsx', generation: 1 }] });
    return { ctx, action, put, get, table, writes, scheduled, approvePath, request,
        signIn: (name: string | null) => { subject = name; }, beforeCommit: (hook: () => void) => { beforeCommit = hook; } };
}

const oldGate = process.env.WEBLAB_CLOUD_EDITOR_ENABLED;
beforeEach(() => { process.env.WEBLAB_CLOUD_EDITOR_ENABLED = 'true'; });
afterEach(() => { if (oldGate === undefined) delete process.env.WEBLAB_CLOUD_EDITOR_ENABLED; else process.env.WEBLAB_CLOUD_EDITOR_ENABLED = oldGate; });

const mediaSource = `export default function Page() { return <main data-oid="media-root"><h1 data-oid="title" className="text-left">Hello</h1><img data-oid="photo" src="/one.png" alt="Before" /><a data-oid="link" href="/about">About</a></main>; }`;
const mediaBindings: CloudContentBinding[] = [
    { oid: 'title', fields: ['text', 'className'], choices: { left: 'text-left', center: 'text-center' }, choiceLabels: { left: 'Vänster sida', center: 'I mitten' } },
    { oid: 'photo', fields: ['src', 'alt'], allowedValues: { src: ['/one.png', '/two.png'] } },
    { oid: 'link', fields: ['href'], allowedValues: { href: ['/about', 'https://example.com/work'] } },
];
function mediaFixture() {
    const f = fixture();
    f.get('cloudEditorFiles:one')!.text = mediaSource;
    f.get('cloudEditorFiles:one')!.bytes = Buffer.byteLength(mediaSource);
    for (const name of ['one', 'two', 'unapproved']) f.put('cloudEditorFiles', `cloudEditorFiles:${name}-image`, {
        ...scope, path: `public/${name}.png`, kind: 'file', bytes: 1, binary: new Uint8Array([1]).buffer,
    });
    Object.assign(f.get('cloudEditorStates:one')!, { bytes: Buffer.byteLength(mediaSource) + Buffer.byteLength(page('two')) + 3, fileCount: 5 });
    const approveMedia = (bindings = mediaBindings) => approve._handler(f.action, {
        ...scope, path: 'app/page.tsx', expectedRevision: 1, expectedGeneration: 0, bindings,
    });
    return { ...f, approveMedia };
}

describe('approved cloud image, link and variant handlers', () => {
    it('lists only enrolled public images for designers and persists explicit field approvals', async () => {
        const f = mediaFixture();
        f.put('cloudEditorFiles', 'cloudEditorFiles:foreign-image', { projectId: 'projects:other', branchId: 'branches:other', path: 'public/foreign.png', kind: 'file', bytes: 1 });
        expect((await assets._handler(f.ctx, scope)).assets).toEqual([
            { path: 'public/one.png', url: '/one.png' }, { path: 'public/two.png', url: '/two.png' },
            { path: 'public/unapproved.png', url: '/unapproved.png' },
        ]);
        await f.approveMedia();
        f.signIn('customer');
        await expect(assets._handler(f.ctx, scope)).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        expect((await contracts._handler(f.ctx, scope)).contracts[0]!.bindings).toEqual(mediaBindings);
    });

    it('atomically saves mixed approved fields and replays their receipt after revocation', async () => {
        const f = mediaFixture(); await f.approveMedia(); f.signIn('customer');
        const candidate = mediaSource.replace('>Hello<', '>Welcome<').replace('text-left', 'text-center')
            .replace('/one.png', '/two.png').replace('alt="Before"', 'alt="After"').replace('href="/about"', 'href="https://example.com/work"');
        const args = f.request(candidate);
        expect(await commit._handler(f.action, args)).toEqual({ revision: 2, currentRevision: 2 });
        expect(f.get('cloudEditorFiles:one')!.text).toBe(candidate);
        expect(f.table('cloudEditorOperations').size).toBe(1);
        f.signIn('builder'); await revoke._handler(f.ctx, { ...scope, path: 'app/page.tsx', expectedGeneration: 1 }); f.signIn('customer');
        const writes = f.writes.length;
        expect(await commit._handler(f.action, args)).toEqual({ revision: 2, currentRevision: 2 });
        expect(f.writes.length).toBe(writes);
        expect(f.scheduled).toHaveLength(1);
    });

    it('rejects owned but unapproved images, safe unapproved links, arbitrary CSS and new attributes without any writes', async () => {
        const f = mediaFixture(); await f.approveMedia(); f.signIn('customer'); f.writes.length = 0;
        for (const candidate of [
            mediaSource.replace('/one.png', '/unapproved.png'),
            mediaSource.replace('href="/about"', 'href="https://example.com/not-approved"'),
            mediaSource.replace('text-left', 'text-center hidden'),
            mediaSource.replace('alt="Before"', 'alt="Valid" title="Unapproved"'),
        ]) await expect(commit._handler(f.action, f.request(candidate))).rejects.toThrow('CLOUD_CONTENT_');
        expect(f.writes).toEqual([]);
        expect(f.get('cloudEditorFiles:one')!.text).toBe(mediaSource);
    });

    it('does not let customer approval or unsafe unused choices reach the stored contract', async () => {
        const f = mediaFixture(); f.signIn('customer');
        await expect(f.approveMedia()).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        f.signIn('builder');
        await expect(f.approveMedia([{ oid: 'link', fields: ['href'], allowedValues: { href: ['/about', 'javascript:alert(1)'] } }]))
            .rejects.toThrow('CLOUD_CONTENT_INVALID_VALUE');
        await expect(f.approveMedia([{ oid: 'photo', fields: ['src'], allowedValues: { src: ['/one.png', '/foreign.png'] } }]))
            .rejects.toThrow('CLOUD_CONTENT_INVALID_VALUE');
        expect(f.writes).toEqual([]);
    });

    it('rechecks a media contract generation and membership after validation', async () => {
        for (const change of ['generation', 'membership'] as const) {
            const f = mediaFixture(); await f.approveMedia(); f.signIn('customer'); f.writes.length = 0;
            f.beforeCommit(() => {
                if (change === 'generation') [...f.table('cloudEditorContentContracts').values()][0]!.generation = 2;
                else f.table('projectMembers').delete('projectMembers:customer');
            });
            await expect(commit._handler(f.action, f.request(mediaSource.replace('/one.png', '/two.png'))))
                .rejects.toThrow(change === 'generation' ? 'CLOUD_CONTENT_STALE_CONTRACT' : 'FORBIDDEN');
            expect(f.writes).toEqual([]);
        }
    });
});

describe('approved cloud text handlers', () => {
    it('requires current designer authority to approve saved source, with source and generation CAS', async () => {
        const f = fixture();
        f.signIn('customer');
        await expect(f.approvePath()).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        expect(f.writes).toEqual([]);
        f.signIn('builder');
        const approved = await f.approvePath();
        expect(approved.generation).toBe(1);
        expect(approved.fingerprint).toMatch(/^[a-f0-9]{64}$/);
        await expect(f.approvePath()).rejects.toThrow('CLOUD_CONTENT_STALE_CONTRACT');
        await expect(approve._handler(f.action, { ...scope, path: 'app/page.tsx', oids: ['title-one'], expectedRevision: 2, expectedGeneration: 1 }))
            .rejects.toThrow('CLOUD_CONFLICT');
        f.signIn('viewer');
        await expect(contracts._handler(f.ctx, scope)).rejects.toThrow('CLOUD_ROLE_REQUIRED');
    });

    it('saves approved text and replays the same receipt before stale source/contract checks', async () => {
        const f = fixture();
        await f.approvePath();
        f.signIn('customer');
        const args = f.request();
        expect(await commit._handler(f.action, args)).toEqual({ revision: 2, currentRevision: 2 });
        expect(f.get('cloudEditorFiles:one')!.text).toContain('Welcome');
        const writes = f.writes.length;
        f.signIn('builder');
        await revoke._handler(f.ctx, { ...scope, path: 'app/page.tsx', expectedGeneration: 1 });
        f.signIn('customer');
        expect(await commit._handler(f.action, args)).toEqual({ revision: 2, currentRevision: 2 });
        expect(f.writes.length).toBe(writes + 1);
        expect(f.table('cloudEditorOperations').size).toBe(1);
        expect(f.scheduled).toEqual([{ name: 'cloudEditorRuntime:sync', args: scope }]);
        const rows = await contracts._handler(f.ctx, scope);
        expect(rows.contracts[0]).toMatchObject({ active: false, generation: 2 });
    });

    it('rejects changed retry bytes, actor substitution and access revocation even with a saved receipt', async () => {
        const f = fixture(); await f.approvePath(); f.signIn('customer');
        await commit._handler(f.action, f.request());
        await expect(commit._handler(f.action, f.request(page('one').replace('Hello', 'Different')))).rejects.toThrow('CLOUD_INVALID_OPERATION');
        f.signIn('other');
        await expect(commit._handler(f.action, { ...f.request(), actorId: 'users:other' as Id<'users'> })).rejects.toThrow('CLOUD_INVALID_OPERATION');
        await expect(commit._handler(f.action, f.request())).rejects.toThrow('CLOUD_ACTOR_CHANGED');
        f.signIn('customer'); f.table('projectMembers').delete('projectMembers:customer');
        await expect(commit._handler(f.action, f.request())).rejects.toThrow('FORBIDDEN');
    });

    it('publishes the saved-source fingerprint with formatting, subsequent edits and undo without renewing approval', async () => {
        const f = fixture();
        const original = `export default function Page() { return <main data-oid="root-one">
  <img data-oid="photo" src="/image.png" alt="Photo" />
  <h1 data-oid="title-one">First<br data-oid="o.i8gu8" />Second</h1>
</main>; }`;
        Object.assign(f.get('cloudEditorFiles:one')!, { text: original, bytes: Buffer.byteLength(original) });
        f.get('cloudEditorStates:one')!.bytes = Buffer.byteLength(original) + Buffer.byteLength(page('two'));
        const oldApproval = await f.approvePath();
        const row = [...f.table('cloudEditorContentContracts').values()][0]!;
        const metadata = structuredClone(row);
        f.signIn('customer');
        const first = original.replace('/>\n  <h1', '/>\n\n  <h1').replace('Second</h1>', 'Changed</h1>').replace('o.i8gu8', 'wjyq.0v');
        const firstRequest = f.request(first);
        const second = first.replace('Changed</h1>', 'Again</h1>');
        for (const [index, content] of [first, second, original].entries()) {
            const request = { ...f.request(content), expectedRevision: index + 1, operationId: `content_sequential_${index}` };
            if (index === 0) request.operationId = firstRequest.operationId;
            expect(await commit._handler(f.action, request)).toEqual({ revision: index + 2, currentRevision: index + 2 });
            const nextFingerprint = approveCloudContentBindings({ path: 'app/page.tsx', source: content,
                bindings: [{ oid: 'title-one', fields: ['text'] }], approvedAssetPaths: [] }).fingerprint;
            expect(f.get('cloudEditorFiles:one')!.text).toBe(content);
            expect(row).toEqual({ ...metadata, fingerprint: nextFingerprint });
            if (index === 0) expect(nextFingerprint).not.toBe(oldApproval.fingerprint);
        }
        expect(row.fingerprint).toBe(oldApproval.fingerprint);
        const writes = f.writes.length;
        expect(await commit._handler(f.action, firstRequest)).toEqual({ revision: 2, currentRevision: 4 });
        expect(f.writes.length).toBe(writes);
        expect(row).toEqual(metadata);
        expect(f.scheduled).toHaveLength(3);
        expect(f.table('cloudEditorOperations').size).toBe(3);
    });

    it('rejects an invalid next fingerprint before changing source or approval', async () => {
        const f = fixture();
        const approved = await f.approvePath();
        f.signIn('customer'); f.writes.length = 0;
        const content = page('one').replace('Hello', 'Welcome');
        await expect(_commit._handler(f.ctx, { ...scope, actorId: 'users:customer' as Id<'users'>,
            transport: 'content', transportVersion: 1, expectedRevision: 1, operationId: 'invalid_next_fingerprint', fingerprint: 'a'.repeat(64),
            changes: [{ path: 'app/page.tsx', content, hash: 'b'.repeat(64), bytes: Buffer.byteLength(content),
                generation: 1, contractFingerprint: approved.fingerprint, nextContractFingerprint: 'invalid' }],
        })).rejects.toThrow('CLOUD_INVALID_OPERATION');
        expect(f.writes).toEqual([]);
        expect(f.get('cloudEditorFiles:one')!.text).toBe(page('one'));
        expect([...f.table('cloudEditorContentContracts').values()][0]!.fingerprint).toBe(approved.fingerprint);
    });

    it('rejects arbitrary style/code changes and mismatched contract paths before any source write', async () => {
        const f = fixture(); await f.approvePath(); f.signIn('customer'); f.writes.length = 0;
        await expect(commit._handler(f.action, f.request(page('one').replace('<h1 ', '<h1 className="hidden" ')))).rejects.toThrow('UNAPPROVED_CHANGE');
        await expect(commit._handler(f.action, { ...f.request(), expectedContracts: [{ path: 'app/other/page.tsx', generation: 1 }] }))
            .rejects.toThrow('CLOUD_CONTENT_STALE_CONTRACT');
        expect(f.writes).toEqual([]);
    });

    it('rejects unapproved paths, duplicate paths and oversized source before publication', async () => {
        const f = fixture(); await f.approvePath(); f.signIn('customer'); f.writes.length = 0;
        const wrongPath = f.request();
        wrongPath.changes[0]!.path = 'app/about/page.tsx';
        wrongPath.expectedContracts[0]!.path = 'app/about/page.tsx';
        await expect(commit._handler(f.action, wrongPath)).rejects.toThrow('CLOUD_CONTENT_STALE_CONTRACT');
        const duplicate = f.request(); duplicate.changes.push(duplicate.changes[0]!);
        await expect(commit._handler(f.action, duplicate)).rejects.toThrow('CLOUD_DUPLICATE_PATH');
        await expect(commit._handler(f.action, f.request('x'.repeat(750_001)))).rejects.toThrow('CLOUD_TEXT_TOO_LARGE');
        const traversal = f.request(); traversal.changes[0]!.path = '../app/page.tsx';
        await expect(commit._handler(f.action, traversal)).rejects.toThrow('CLOUD_INVALID_PATH');
        expect(f.writes).toEqual([]);
    });

    it('reapproving after revocation advances the tombstone instead of reviving old generations', async () => {
        const f = fixture(); await f.approvePath();
        await revoke._handler(f.ctx, { ...scope, path: 'app/page.tsx', expectedGeneration: 1 });
        const next = await f.approvePath('app/page.tsx', 'title-one', 2);
        expect(next.generation).toBe(3);
        f.signIn('customer');
        await expect(commit._handler(f.action, f.request())).rejects.toThrow('CLOUD_CONTENT_STALE_CONTRACT');
        const args = f.request(); args.expectedContracts[0]!.generation = 3;
        expect(await commit._handler(f.action, args)).toEqual({ revision: 2, currentRevision: 2 });
    });

    it('rechecks role, source revision and contract revocation after Node validation', async () => {
        for (const [change, error] of [
            [(f: ReturnType<typeof fixture>) => f.table('cloudEditorGrants').delete('cloudEditorGrants:customer'), 'CLOUD_ROLE_REQUIRED'],
            [(f: ReturnType<typeof fixture>) => { f.get('cloudEditorStates:one')!.revision = 2; }, 'CLOUD_CONFLICT'],
            [(f: ReturnType<typeof fixture>) => { const row = [...f.table('cloudEditorContentContracts').values()][0]!; row.generation = 2; row.active = false; }, 'CLOUD_CONTENT_STALE_CONTRACT'],
            [(f: ReturnType<typeof fixture>) => { [...f.table('cloudEditorContentContracts').values()][0]!.fingerprint = 'f'.repeat(64); }, 'CLOUD_CONTENT_STALE_CONTRACT'],
            [(f: ReturnType<typeof fixture>) => f.signIn('other'), 'CLOUD_ACTOR_CHANGED'],
        ] as const) {
            const f = fixture(); await f.approvePath(); f.signIn('customer'); f.writes.length = 0;
            f.beforeCommit(() => change(f));
            await expect(commit._handler(f.action, f.request())).rejects.toThrow(error);
            expect(f.writes).toEqual([]);
            expect(f.get('cloudEditorFiles:one')!.text).toBe(page('one'));
        }
    });

    it('saves an approved multi-file batch with one revision and one receipt', async () => {
        const f = fixture(); await f.approvePath(); await f.approvePath('app/about/page.tsx', 'title-two'); f.signIn('customer');
        const args = f.request();
        args.changes.push({ path: 'app/about/page.tsx', content: page('two').replace('Hello', 'Second') });
        args.expectedContracts.push({ path: 'app/about/page.tsx', generation: 1 });
        expect(await commit._handler(f.action, args)).toEqual({ revision: 2, currentRevision: 2 });
        expect(f.get('cloudEditorFiles:two')!.text).toContain('Second');
        expect(f.table('cloudEditorOperations').size).toBe(1);
        expect(f.get('cloudEditorStates:one')!.bytes).toBe(Buffer.byteLength(String(f.get('cloudEditorFiles:one')!.text)) + Buffer.byteLength(String(f.get('cloudEditorFiles:two')!.text)));
    });

    it('a later invalid file rejects the complete candidate batch before publication', async () => {
        const f = fixture(); await f.approvePath(); await f.approvePath('app/about/page.tsx', 'title-two'); f.signIn('customer'); f.writes.length = 0;
        const args = f.request();
        args.changes.push({ path: 'app/about/page.tsx', content: page('two').replace('<h1 ', '<h1 hidden ' ) });
        args.expectedContracts.push({ path: 'app/about/page.tsx', generation: 1 });
        await expect(commit._handler(f.action, args)).rejects.toThrow('UNAPPROVED_CHANGE');
        expect(f.writes).toEqual([]);
        expect(f.get('cloudEditorFiles:one')!.text).toBe(page('one'));
    });

    it('rejects a generated line-break ID that collides with unchanged source', async () => {
        const f = fixture(); await f.approvePath(); f.signIn('customer'); f.writes.length = 0;
        const candidate = page('one').replace('Hello', 'First<br data-oid="title-two" />Second');
        await expect(commit._handler(f.action, f.request(candidate))).rejects.toThrow('CLOUD_CONTENT_DUPLICATE_OID');
        expect(f.writes).toEqual([]);
    });

    it('rejects duplicate generated IDs across candidate files, without consulting another project', async () => {
        const f = fixture(); await f.approvePath(); await f.approvePath('app/about/page.tsx', 'title-two'); f.signIn('customer'); f.writes.length = 0;
        const args = f.request(page('one').replace('Hello', 'First<br data-oid="new-break" />Second'));
        args.changes.push({ path: 'app/about/page.tsx', content: page('two').replace('Hello', 'First<br data-oid="new-break" />Second') });
        args.expectedContracts.push({ path: 'app/about/page.tsx', generation: 1 });
        await expect(commit._handler(f.action, args)).rejects.toThrow('CLOUD_CONTENT_DUPLICATE_OID');
        expect(f.writes).toEqual([]);
        f.put('cloudEditorFiles', 'cloudEditorFiles:foreign', { projectId: 'projects:other', branchId: 'branches:other', path: 'app/page.tsx', kind: 'file', text: page('one'), bytes: 1 });
        expect(await commit._handler(f.action, f.request())).toEqual({ revision: 2, currentRevision: 2 });
        expect(f.get('cloudEditorFiles:foreign')!.text).toBe(page('one'));
    });

    it('refuses forged project/branch enrollment and disabled writes', async () => {
        const f = fixture(); await f.approvePath(); f.signIn('customer');
        f.put('branches', 'branches:foreign', { projectId: 'projects:foreign' });
        await expect(commit._handler(f.action, { ...f.request(), branchId: 'branches:foreign' as Id<'branches'> })).rejects.toThrow('CLOUD_NOT_ENROLLED');
        process.env.WEBLAB_CLOUD_EDITOR_ENABLED = 'false';
        await expect(commit._handler(f.action, f.request())).rejects.toThrow('CLOUD_DISABLED');
    });
});
