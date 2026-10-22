import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { getFunctionName } from 'convex/server';

import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { _asset as legacyAsset, _commit, _lease, _reserveRuntime, _runtimeInput, _runtimeReady, _sealDependencies, ensurePreview, snapshot, status } from '../cloudEditor';
import { access, authorizeCloudPreviewStart, requireCloudAccess, setPreviewAllowance } from '../cloudEditorAccess';
import { _asset as importedAsset } from '../cloudEditorImports';
import { authorize as authorizeTicket, issue as issueTicket } from '../cloudPreviewAccess';
import { createHmac } from 'node:crypto';
import { hashPreparationPolicy } from './cloudImportedState';

type Row = Record<string, unknown> & { _id: string };
const scope = {
    projectId: 'projects:one' as Id<'projects'>,
    branchId: 'branches:one' as Id<'branches'>,
};
const builder = 'users:builder' as Id<'users'>;
const customer = 'users:customer' as Id<'users'>;
const stateId = 'cloudEditorStates:one';

// Real handlers and permission logic; this fixture replaces only database/session IO.
function fixture() {
    const tables = new Map<string, Map<string, Row>>();
    const table = (name: string): Map<string, Row> => {
        let rows = tables.get(name);
        if (!rows) {
            rows = new Map();
            tables.set(name, rows);
        }
        return rows;
    };
    const put = (name: string, id: string, data: Record<string, unknown>) =>
        table(name).set(id, { _id: id, _creationTime: 1, ...data });
    const get = (id: string) => table(id.split(':')[0]!).get(id) ?? null;
    let actor = 'builder';
    let sequence = 0;
    const scheduled: Array<{ name: string; args: unknown }> = [];
    put('workspaces', 'workspaces:one', { createdByUserId: builder });
    put('projects', scope.projectId, { workspaceId: 'workspaces:one', accessMode: 'restricted' });
    put('branches', scope.branchId, { projectId: scope.projectId });
    for (const name of ['builder', 'customer']) {
        put('users', `users:${name}`, { clerkUserId: name });
        put('workspaceMembers', `workspaceMembers:${name}`, {
            workspaceId: 'workspaces:one',
            userId: `users:${name}`,
            role: 'member',
        });
        put('projectMembers', `projectMembers:${name}`, {
            projectId: scope.projectId,
            userId: `users:${name}`,
            role: name === 'builder' ? 'manager' : 'viewer',
        });
    }
    put('cloudEditorGrants', 'cloudEditorGrants:customer', {
        projectId: scope.projectId,
        userId: customer,
        role: 'content',
        publish: false,
    });
    put('cloudEditorStates', stateId, {
        ...scope,
        workspaceId: 'workspaces:one',
        createdByUserId: builder,
        version: 1,
        revision: 1,
        generation: 0,
        status: 'stopped',
        bytes: 10,
        fileCount: 1,
        contentPreviewAllowance: {
            remainingStarts: 2,
            expiresAt: Date.now() + 60_000,
            generation: 1,
        },
    });
    put('cloudEditorFiles', 'cloudEditorFiles:lock', {
        ...scope,
        path: 'bun.lock',
        kind: 'file',
        text: '{}',
        bytes: 2,
    });
    const ctx = {
        auth: {
            getUserIdentity: async () => ({ subject: actor, tokenIdentifier: `issuer|${actor}` }),
        },
        db: {
            system: { get: async (id: string) => get(id) },
            get: async (id: string) => get(id),
            insert: async (name: string, data: Record<string, unknown>) => {
                const id = `${name}:${++sequence}`;
                put(name, id, data);
                return id;
            },
            patch: async (id: string, data: Record<string, unknown>) => {
                put(id.split(':')[0]!, id, { ...get(id)!, ...data });
            },
            replace: async (id: string, data: Record<string, unknown>) => {
                put(id.split(':')[0]!, id, data);
            },
            query: (name: string) => {
                const clauses: Array<[string, unknown]> = [];
                const index = {
                    eq: (key: string, value: unknown) => {
                        clauses.push([key, value]);
                        return index;
                    },
                };
                const rows = () =>
                    [...table(name).values()].filter((row) =>
                        clauses.every(([key, value]) => row[key] === value),
                    );
                const query = {
                    withIndex: (_name: string, build: (q: typeof index) => unknown) => {
                        build(index);
                        return query;
                    },
                    collect: async () => rows(),
                    take: async (limit: number) => rows().slice(0, limit),
                    unique: async () => {
                        const found = rows();
                        if (found.length > 1) throw new Error('Duplicate');
                        return found[0] ?? null;
                    },
                };
                return query;
            },
        },
        storage: { getUrl: async () => 'https://storage.example/owned' },
        scheduler: {
            runAfter: async (
                _delay: number,
                ref: Parameters<typeof getFunctionName>[0],
                args: unknown,
            ) => {
                scheduled.push({ name: getFunctionName(ref), args });
            },
        },
    } as unknown as MutationCtx;
    const state = () => get(stateId)!;
    const request = () =>
        state().previewStartRequest as {
            generation: number;
            actorId: Id<'users'>;
            kind: string;
            expiresAt: number;
            reservedToken?: string;
        };
    const lease = () =>
        Object.assign(state(), { leaseToken: 'lease-one', leaseUntil: Date.now() + 60_000 });
    const reserve = () =>
        _reserveRuntime._handler(ctx, {
            ...scope,
            token: 'lease-one',
            requestGeneration: request().generation,
        });
    return {
        ctx,
        get,
        put,
        table,
        state,
        request,
        lease,
        reserve,
        scheduled,
        signIn: (name: string) => {
            actor = name;
        },
    };
}

const gate = process.env.WEBLAB_CLOUD_EDITOR_ENABLED;
const importedGate = process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED;
const importsGate = process.env.WEBLAB_CLOUD_IMPORTS_ENABLED;
const importSecret = process.env.WEBLAB_CLOUD_IMPORT_SECRET;
beforeEach(() => {
    process.env.WEBLAB_CLOUD_EDITOR_ENABLED = 'true';
    delete process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED;
});
afterEach(() => {
    if (gate === undefined) delete process.env.WEBLAB_CLOUD_EDITOR_ENABLED;
    else process.env.WEBLAB_CLOUD_EDITOR_ENABLED = gate;
    for (const [key, value] of Object.entries({ WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED: importedGate,
        WEBLAB_CLOUD_IMPORTS_ENABLED: importsGate, WEBLAB_CLOUD_IMPORT_SECRET: importSecret })) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
});

describe('cloud preview start reservations', () => {
    it('deduplicates queued customer requests and allocates each reservation once', async () => {
        const f = fixture();
        f.signIn('customer');
        await ensurePreview._handler(f.ctx, scope);
        await ensurePreview._handler(f.ctx, scope);
        expect(f.scheduled).toHaveLength(1);
        expect(f.scheduled[0]).toEqual({
            name: 'cloudEditorRuntime:sync',
            args: { ...scope, allowCreate: true, requestGeneration: 1 },
        });
        expect(f.state().contentPreviewAllowance).toMatchObject({ remainingStarts: 1 });
        expect(f.request()).toMatchObject({ actorId: customer, kind: 'content' });
        f.lease();
        expect(await f.reserve()).toBe(true);
        expect(await f.reserve()).toBe(false);
        expect(f.table('cloudEditorSlots').size).toBe(1);
        expect(f.state().runtimeStarts).toHaveLength(1);
    });

    it('revoking the role or ordinary project access after scheduling prevents allocation', async () => {
        for (const revokedTable of ['cloudEditorGrants', 'projectMembers']) {
            const f = fixture();
            f.signIn('customer');
            await ensurePreview._handler(f.ctx, scope);
            f.lease();
            f.table(revokedTable).delete(`${revokedTable}:customer`);
            expect(await f.reserve()).toBe(false);
            expect(f.table('cloudEditorSlots').size).toBe(0);
            expect(f.state().runtimeStarts).toBeUndefined();
        }
    });

    it('changing the allowance cancels queued work without reviving it after regrant', async () => {
        const f = fixture();
        f.signIn('customer');
        await ensurePreview._handler(f.ctx, scope);
        const requestGeneration = f.request().generation;
        f.signIn('builder');
        await setPreviewAllowance._handler(f.ctx, { ...scope, starts: 0 });
        expect(f.state().previewStartRequest).toBeUndefined();
        expect(f.state().contentPreviewAllowance).toMatchObject({
            remainingStarts: 0,
            generation: 2,
        });
        f.lease();
        expect(
            await _reserveRuntime._handler(f.ctx, {
                ...scope,
                token: 'lease-one',
                requestGeneration,
            }),
        ).toBe(false);
        await setPreviewAllowance._handler(f.ctx, { ...scope, starts: 2 });
        expect(await authorizeCloudPreviewStart(f.ctx, scope, requestGeneration)).toBe(false);
    });

    it('rechecks cancellation after allocation and binds the request to its worker token', async () => {
        const f = fixture();
        f.signIn('customer');
        await ensurePreview._handler(f.ctx, scope);
        f.lease();
        const generation = f.request().generation;
        expect(await f.reserve()).toBe(true);
        expect(await authorizeCloudPreviewStart(f.ctx, scope, generation, 'wrong-worker')).toBe(
            false,
        );
        expect(await authorizeCloudPreviewStart(f.ctx, scope, generation, 'lease-one')).toBe(true);
        f.signIn('builder');
        await setPreviewAllowance._handler(f.ctx, { ...scope, starts: 0 });
        expect(await authorizeCloudPreviewStart(f.ctx, scope, generation, 'lease-one')).toBe(false);
    });

    it('does not reserve allowance for missing builder preparation and rechecks the lock before allocation', async () => {
        const f = fixture();
        f.signIn('customer');
        f.table('cloudEditorFiles').delete('cloudEditorFiles:lock');
        await expect(ensurePreview._handler(f.ctx, scope)).rejects.toThrow(
            'CLOUD_PREVIEW_PREPARATION_REQUIRED',
        );
        expect(f.state().contentPreviewAllowance).toMatchObject({ remainingStarts: 2 });
        expect(f.scheduled).toHaveLength(0);
        const g = fixture();
        g.signIn('customer');
        await ensurePreview._handler(g.ctx, scope);
        g.lease();
        g.table('cloudEditorFiles').delete('cloudEditorFiles:lock');
        expect(await g.reserve()).toBe(false);
        await expect(
            _sealDependencies._handler(g.ctx, {
                ...scope,
                token: 'lease-one',
                revision: 1,
                text: '{}',
                hash: '0'.repeat(64),
            }),
        ).rejects.toThrow('CLOUD_PREVIEW_PREPARATION_REQUIRED');
    });

    it('rejects expired reservations, disabled gate and exhausted allowances', async () => {
        const f = fixture();
        f.signIn('customer');
        await ensurePreview._handler(f.ctx, scope);
        f.lease();
        f.request().expiresAt = Date.now() - 1;
        expect(await f.reserve()).toBe(false);
        f.request().expiresAt = Date.now() + 60_000;
        process.env.WEBLAB_CLOUD_EDITOR_ENABLED = 'false';
        await expect(f.reserve()).rejects.toThrow('CLOUD_DISABLED');
        process.env.WEBLAB_CLOUD_EDITOR_ENABLED = 'true';
        const g = fixture();
        g.signIn('customer');
        g.state().contentPreviewAllowance = {
            remainingStarts: 0,
            expiresAt: Date.now() + 60_000,
            generation: 1,
        };
        await expect(ensurePreview._handler(g.ctx, scope)).rejects.toThrow(
            'CLOUD_PREVIEW_ALLOWANCE_REQUIRED',
        );
    });

    it('preserves designer preparation, but rechecks designer authority before allocation', async () => {
        const f = fixture();
        f.table('cloudEditorFiles').delete('cloudEditorFiles:lock');
        f.state().contentPreviewAllowance = undefined;
        await ensurePreview._handler(f.ctx, scope);
        f.lease();
        expect(f.request().kind).toBe('design');
        expect(await f.reserve()).toBe(true);
        const g = fixture();
        await ensurePreview._handler(g.ctx, scope);
        g.lease();
        g.get('projectMembers:builder')!.role = 'viewer';
        expect(await g.reserve()).toBe(false);
    });

    it('syncing an existing customer preview schedules no permission to create', async () => {
        const f = fixture();
        f.signIn('customer');
        Object.assign(f.state(), {
            status: 'ready',
            previewGatewayVersion: 2,
            sandboxId: 'existing',
            expiresAt: Date.now() + 120_000,
            appliedRevision: 0,
        });
        await ensurePreview._handler(f.ctx, scope);
        expect(f.scheduled).toEqual([{ name: 'cloudEditorRuntime:sync', args: scope }]);
        expect(f.state().previewStartRequest).toBeUndefined();
        expect(f.state().contentPreviewAllowance).toMatchObject({ remainingStarts: 2 });
    });
});


const sha = (value: string) => createHash('sha256').update(value).digest('hex');
async function preparedFixture() {
    const f = fixture();
    f.table('cloudEditorFiles').clear();
    const source = [
        ['package.json', '{}'], ['bun.lock', '{}'], ['next.config.ts', 'export default {};'],
        ['tsconfig.json', '{}'], ['public/weblab-preload-script.js', '// editor'],
        ['public/weblab-ix-runtime.js', '// interactions'],
        ['src/app/layout.tsx', 'export default function Layout({children}) { return <html><body>{children}</body></html>; }'],
        ['src/app/page.tsx', 'export default function Page() { return <p>Hello</p>; }'],
    ] as const;
    for (const [path, text] of source) f.put('cloudEditorFiles', `cloudEditorFiles:${path}`, {
        ...scope, path, text, kind: 'file', hash: sha(text), bytes: Buffer.byteLength(text),
    });
    for (const [index, bytes] of [23_000_000, 26_000_000].entries()) f.put('cloudEditorFiles', `cloudEditorFiles:media${index}`, {
        ...scope, path: `public/media${index}.mp4`, kind: 'file', hash: sha(`media${index}`), bytes, storageId: `_storage:media${index}`,
    });
    const policyBody = {
        kind: 'next-app-bun-v1' as const, node: 'node24' as const, bun: '1.3.11' as const, next: '16.3.1' as const,
        install: 'frozen-ignore-scripts' as const, dev: 'next-dev' as const, build: 'next-build-webpack' as const,
        bunArchiveSha256: '8611ba935af886f05a6f38740a15160326c15e5d5d07adef966130b4493607ed',
        pinnedFiles: source.filter(([path]) => path !== 'src/app/page.tsx').map(([path, text]) => ({ path, hash: sha(text), bytes: Buffer.byteLength(text) }))
            .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
    };
    const policy = { ...policyBody, policyHash: await hashPreparationPolicy(policyBody) };
    const preparationId = 'cloudEditorImportPreparations:one';
    const baselineAttemptId = 'cloudEditorImports:one';
    const manifestHash = sha('retained pristine manifest');
    f.put('cloudEditorImports', baselineAttemptId, { ...scope, workspaceId: 'workspaces:one', state: 'finalized', manifestHash });
    f.put('cloudEditorImportPreparations', preparationId, { ...scope, workspaceId: 'workspaces:one', actorId: builder,
        generation: 1, profileVersion: 1, preparationVersion: 1, inputRevision: 1, preparedRevision: 2,
        baselineAttemptId, baselineManifestHash: manifestHash, inputManifestHash: manifestHash,
        preparedManifestHash: sha('prepared manifest'), policy, instrumentation: [], operationKey: 'prepare_operation_one', createdAt: 1 });
    Object.assign(f.state(), { profile: 'imported-next-v1', preparationId, revision: 2, designRevision: 2,
        bytes: [...f.table('cloudEditorFiles').values()].reduce((sum, file) => sum + Number(file.bytes), 0), fileCount: 10 });
    const dependencyHash = sha(JSON.stringify({ profile: 'imported-next-v1', profileVersion: 1, preparationVersion: 1,
        policyHash: policy.policyHash, node: policy.node, bun: policy.bun, archive: policy.bunArchiveSha256, pins: policy.pinnedFiles }));
    const readyArgs = () => ({ ...scope, token: 'lease-one', revision: 2, sandboxId: 'sandbox-prepared',
        previewUrl: 'https://preview.example', expiresAt: Date.now() + 600_000, previewToken: 'preview-token',
        paths: [...f.table('cloudEditorFiles').values()].map(file => String(file.path)), dependencyHash, requestGeneration: f.request().generation });
    return { ...f, policy, preparationId, baselineAttemptId, readyArgs };
}

describe('prepared import runtime and source boundaries', () => {
    it('validates the receipt before lease/slot allocation and adopts only its dependency policy', async () => {
        const f = await preparedFixture();
        const input = await _runtimeInput._handler(f.ctx, scope);
        expect(input?.policy).toEqual(f.policy);
        await ensurePreview._handler(f.ctx, scope);
        expect(f.request().kind).toBe('design');
        expect(await _lease._handler(f.ctx, { ...scope, token: 'lease-one' })).toEqual({ reuse: false, generation: 1 });
        expect(await f.reserve()).toBe(true);
        expect(await _runtimeReady._handler(f.ctx, { ...f.readyArgs(), dependencyHash: sha('foreign runtime') })).toBe(false);
        expect(await _runtimeReady._handler(f.ctx, { ...f.readyArgs(), paths: ['package.json'] })).toBe(false);
        expect(f.state().status).toBe('starting');
        expect(await _runtimeReady._handler(f.ctx, f.readyArgs())).toBe(true);
        expect(f.state()).toMatchObject({ status: 'ready', appliedRevision: 2, sandboxId: 'sandbox-prepared' });
    });

    it('rejects missing, foreign and drifted preparations before changing lease or runtime budgets', async () => {
        for (const corruption of ['missing', 'foreign', 'pin', 'baseline']) {
            const f = await preparedFixture();
            await ensurePreview._handler(f.ctx, scope);
            if (corruption === 'missing') f.table('cloudEditorImportPreparations').delete(f.preparationId);
            if (corruption === 'foreign') f.get(f.preparationId)!.workspaceId = 'workspaces:foreign';
            if (corruption === 'pin') f.get('cloudEditorFiles:next.config.ts')!.text = 'export default { changed: true };';
            if (corruption === 'baseline') f.get(f.baselineAttemptId)!.state = 'expired';
            await expect(_lease._handler(f.ctx, { ...scope, token: 'lease-one' })).rejects.toThrow('CLOUD_IMPORT_PREPARATION_INVALID');
            expect(f.state().generation).toBe(0);
            expect(f.state().leaseToken).toBeUndefined();
            f.lease();
            await expect(f.reserve()).rejects.toThrow('CLOUD_IMPORT_PREPARATION_INVALID');
            await expect(_runtimeInput._handler(f.ctx, scope)).rejects.toThrow('CLOUD_IMPORT_PREPARATION_INVALID');
            await expect(_runtimeReady._handler(f.ctx, f.readyArgs())).rejects.toThrow('CLOUD_IMPORT_PREPARATION_INVALID');
            expect(f.table('cloudEditorSlots').size).toBe(0);
            expect(f.state().runtimeStarts).toBeUndefined();
            expect(f.state().sandboxId).toBeUndefined();
        }
    });

    it('keeps unprepared source non-executable and denies a content role prepared preview', async () => {
        const f = await preparedFixture();
        f.state().profile = 'imported-source-v1';
        expect(await _lease._handler(f.ctx, { ...scope, token: 'lease-one' })).toBeNull();
        expect(await _runtimeInput._handler(f.ctx, scope)).toBeNull();
        f.state().profile = 'imported-next-v1';
        f.signIn('customer');
        await expect(ensurePreview._handler(f.ctx, scope)).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        expect(f.scheduled).toEqual([]);
    });

    it('saves source with 49MB of retained media, reuses receipts, and refuses a pinned edit', async () => {
        const f = await preparedFixture();
        const media = structuredClone([...f.table('cloudEditorFiles').values()].filter(file => file.storageId));
        const text = 'export default function Page() { return <p>Saved</p>; }';
        const args = { ...scope, actorId: builder, expectedRevision: 2, operationId: 'source_operation_one', fingerprint: 'source-fingerprint',
            changes: [{ path: 'src/app/page.tsx', kind: 'file' as const, text, hash: sha(text), bytes: Buffer.byteLength(text) }] };
        // Imported totals derive from source rows, even if cached state accounting is stale.
        f.state().bytes = 0;
        const result = await _commit._handler(f.ctx, args);
        expect(result).toEqual({ revision: 3, currentRevision: 3, storageIds: [] });
        expect(Number(f.state().bytes)).toBeGreaterThan(49_000_000);
        expect([...f.table('cloudEditorFiles').values()].filter(file => file.storageId)).toEqual(media);
        expect(await _commit._handler(f.ctx, args)).toEqual(result);
        const saved = await snapshot._handler(f.ctx, scope);
        expect(saved.files.filter(file => file.path.endsWith('.mp4')).every(file => file.storageId === null)).toBe(true);
        await expect(_commit._handler(f.ctx, { ...args, operationId: 'source_operation_two', expectedRevision: 3,
            changes: [{ ...args.changes[0]!, path: 'next.config.ts' }] })).rejects.toThrow('CLOUD_IMPORT_SOURCE_CHANGE_FORBIDDEN');
        f.table('cloudEditorImportPreparations').delete(f.preparationId);
        await expect(_commit._handler(f.ctx, args)).rejects.toThrow('CLOUD_IMPORT_PREPARATION_INVALID');
    });
});


describe('prepared imported customer authority', () => {
    it('opens full source and a live preview with zero text approvals and no start allowance', async () => {
        process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED = 'true';
        const f = await preparedFixture();
        f.signIn('customer');
        const privateToken = 'ab'.repeat(32);
        Object.assign(f.state(), { contentPreviewAllowance: undefined, status: 'ready', sandboxId: 'runtime',
            previewToken: privateToken, previewGatewayVersion: 2, appliedRevision: 2, expiresAt: Date.now() + 600_000 });
        expect(await access._handler(f.ctx, scope)).toMatchObject({ actorId: customer, canDesign: false,
            canEditImportedText: true, canEditContent: true, canPreview: true, canPublish: false });
        const saved = await snapshot._handler(f.ctx, scope);
        expect(saved.files).toHaveLength(10);
        expect(saved.files.filter(file => file.path.endsWith('.mp4')).map(file => file.storageId)).toEqual([null, null]);
        expect(saved.importedAuthority).toEqual({ preparationId: f.preparationId, designRevision: 2 });
        const ticket = await issueTicket._handler(f.ctx, scope);
        const args = { ...scope, sandboxId: 'runtime', ticket: ticket.previewToken,
            verifier: createHmac('sha256', privateToken).update('weblab-preview-verifier-v1').digest('hex') };
        expect((await authorizeTicket._handler(f.ctx, args)).allowed).toBe(true);
        expect((await status._handler(f.ctx, scope)).previewToken).toBe(ticket.previewToken);
        expect(f.table('cloudEditorContentContracts').size).toBe(0);
        expect(f.scheduled).toEqual([]);
        expect(f.state().previewStartRequest).toBeUndefined();
        expect(f.state().runtimeStarts).toBeUndefined();
        // Viewing can follow an agency design change; stale edit grants remain separate.
        Object.assign(f.state(), { revision: 3, designRevision: 3, appliedRevision: 3 });
        expect((await authorizeTicket._handler(f.ctx, args)).allowed).toBe(true);
        process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED = 'false';
        expect((await authorizeTicket._handler(f.ctx, args)).allowed).toBe(false);
        await expect(snapshot._handler(f.ctx, scope)).rejects.toThrow('CLOUD_ROLE_REQUIRED');
    });

    it('keeps source-only, default-off, invalid epochs and missing grants closed without unlocking legacy writes', async () => {
        const f = await preparedFixture();
        f.signIn('customer');
        expect((await access._handler(f.ctx, scope)).canEditImportedText).toBeUndefined();
        await expect(snapshot._handler(f.ctx, scope)).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED = 'true';
        await expect(requireCloudAccess(f.ctx, scope, 'content')).rejects.toThrow('CLOUD_CONTENT_PROFILE_UNSUPPORTED');
        await expect(requireCloudAccess(f.ctx, scope, 'designer')).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        for (const designRevision of [undefined, 1, 3, Number.NaN]) {
            f.state().designRevision = designRevision;
            expect((await access._handler(f.ctx, scope)).canEditImportedText).toBeUndefined();
            await expect(snapshot._handler(f.ctx, scope)).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        }
        f.state().designRevision = 2;
        f.table('cloudEditorGrants').clear();
        await expect(snapshot._handler(f.ctx, scope)).rejects.toThrow('CLOUD_ROLE_REQUIRED');
        f.signIn('builder');
        process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED = 'false';
        expect((await snapshot._handler(f.ctx, scope)).files).toHaveLength(10);
        f.state().profile = 'imported-source-v1';
        expect((await snapshot._handler(f.ctx, scope)).profile).toBe('imported-source-v1');
        f.signIn('customer');
        await expect(snapshot._handler(f.ctx, scope)).rejects.toThrow('CLOUD_ROLE_REQUIRED');
    });

    it('reads exact private media for the current customer and rejects changed bytes, scope and access', async () => {
        process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED = 'true';
        process.env.WEBLAB_CLOUD_IMPORTS_ENABLED = 'true';
        process.env.WEBLAB_CLOUD_IMPORT_SECRET = 'cd'.repeat(32);
        const f = await preparedFixture();
        f.signIn('customer');
        const file = f.get('cloudEditorFiles:media0')!;
        f.put('_storage', '_storage:media0', { size: file.bytes, sha256: file.hash });
        const args = { ...scope, path: String(file.path), expectedHash: String(file.hash), secret: 'cd'.repeat(32) };
        expect(await importedAsset._handler(f.ctx, args)).toEqual({ url: 'https://storage.example/owned', bytes: file.bytes, hash: file.hash });
        await expect(legacyAsset._handler(f.ctx, args)).rejects.toThrow('CLOUD_CONTENT_PROFILE_UNSUPPORTED');
        process.env.WEBLAB_CLOUD_IMPORTS_ENABLED = 'false';
        await expect(importedAsset._handler(f.ctx, args)).rejects.toThrow('CLOUD_IMPORT_DISABLED');
        await expect(legacyAsset._handler(f.ctx, args)).rejects.toThrow('CLOUD_CONTENT_PROFILE_UNSUPPORTED');
        process.env.WEBLAB_CLOUD_IMPORTS_ENABLED = 'true';
        await expect(importedAsset._handler(f.ctx, { ...args, expectedHash: sha('wrong') })).rejects.toThrow('CLOUD_IMPORT_ASSET_CHANGED');
        await expect(importedAsset._handler(f.ctx, { ...args, secret: 'ef'.repeat(32) })).rejects.toThrow('CLOUD_IMPORT_SERVER_REQUIRED');
        file.projectId = 'projects:foreign';
        await expect(importedAsset._handler(f.ctx, args)).rejects.toThrow('CLOUD_IMPORT_ASSET_CHANGED');
        file.projectId = scope.projectId;
        f.get('_storage:media0')!.size = 1;
        await expect(importedAsset._handler(f.ctx, args)).rejects.toThrow('CLOUD_IMPORT_ASSET_CHANGED');
        f.get('_storage:media0')!.size = file.bytes;
        f.table('cloudEditorGrants').clear();
        await expect(importedAsset._handler(f.ctx, args)).rejects.toThrow('CLOUD_ROLE_REQUIRED');
    });

    it('pins explicit customer starts to the preparation and epoch, then rechecks them before allocation', async () => {
        process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED = 'true';
        for (const change of ['epoch', 'preparation', 'flag', 'canonical-user', 'none'] as const) {
            const f = await preparedFixture();
            f.signIn('customer');
            await ensurePreview._handler(f.ctx, scope);
            expect(f.request()).toMatchObject({ actorId: customer, kind: 'content',
                importedAuthority: { preparationId: f.preparationId, designRevision: 2 } });
            expect(f.state().contentPreviewAllowance).toMatchObject({ remainingStarts: 1 });
            if (change === 'epoch') Object.assign(f.state(), { revision: 3, designRevision: 3 });
            if (change === 'preparation') {
                const id = 'cloudEditorImportPreparations:replacement';
                f.put('cloudEditorImportPreparations', id, { ...f.get(f.preparationId)!, _id: id });
                f.state().preparationId = id;
            }
            if (change === 'flag') process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED = 'false';
            if (change === 'canonical-user') f.put('users', 'users:canonical', { clerkUserId: 'customer', _creationTime: 0 });
            if (change === 'none') f.state().revision = 3; // Approved v2 saves do not advance the design epoch.
            f.lease();
            expect(await f.reserve()).toBe(change === 'none');
            if (change !== 'none') expect(f.table('cloudEditorSlots').size).toBe(0);
            process.env.WEBLAB_CLOUD_IMPORTED_CONTENT_ENABLED = 'true';
        }
    });
});
