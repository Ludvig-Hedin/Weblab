import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { assertImportedTextChanges, getPreparedImport, hashPreparationPolicy, type ImportedTextChange } from './cloudImportedState';

const projectId = 'projects:site' as Id<'projects'>;
const branchId = 'branches:site' as Id<'branches'>;
const workspaceId = 'workspaces:agency' as Id<'workspaces'>;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const change = (path: string, text: string): ImportedTextChange => ({ path, kind: 'file', text, hash: hash(text), bytes: Buffer.byteLength(text) });
const file = (path: string, text: string): Doc<'cloudEditorFiles'> => ({
    ...change(path, text), kind: 'file', storageId: undefined, projectId, branchId,
    _id: `cloudEditorFiles:${path}` as Id<'cloudEditorFiles'>, _creationTime: 1,
});
type Policy = Doc<'cloudEditorImportPreparations'>['policy'];

async function fixture() {
    const files = [file('package.json', '{}'), file('bun.lock', '{}'), file('next.config.ts', 'export default {};'),
        file('tsconfig.json', '{}'), file('bunfig.toml', '[install]\nexact = true'),
        file('public/weblab-preload-script.js', 'globalThis.weblab = true;'),
        file('public/weblab-ix-runtime.js', 'globalThis.weblabIx = true;'),
        file('src/app/layout.tsx', 'export default function Layout({children}) { return <html><body>{children}</body></html>; }'),
        file('src/app/page.tsx', 'export default function Page() { return <p>Hello</p>; }'),
        file('src/styles/main.css', 'p { color: red; }'),
        { ...file('public/asset.mp4', ''), text: undefined, bytes: 22_700_000, hash: hash('media'), storageId: '_storage:media' as Id<'_storage'> }];
    const body = {
        kind: 'next-app-bun-v1' as const, node: 'node24' as const, bun: '1.3.11' as const, next: '16.3.1' as const,
        install: 'frozen-ignore-scripts' as const, dev: 'next-dev' as const, build: 'next-build-webpack' as const,
        bunArchiveSha256: '8611ba935af886f05a6f38740a15160326c15e5d5d07adef966130b4493607ed',
        pinnedFiles: files.slice(0, 8).map(({ path, hash, bytes }) => ({ path, hash, bytes })),
    };
    const policy: Policy = { ...body, policyHash: await hashPreparationPolicy(body) };
    const baseline = { _id: 'cloudEditorImports:baseline', _creationTime: 1, projectId, branchId, workspaceId,
        state: 'finalized', manifestHash: hash('baseline') } as Doc<'cloudEditorImports'>;
    const receipt = { _id: 'cloudEditorImportPreparations:ready', _creationTime: 1, projectId, branchId, workspaceId,
        actorId: 'users:builder', operationKey: 'preparation_operation_123', baselineAttemptId: baseline._id,
        baselineManifestHash: baseline.manifestHash, inputManifestHash: baseline.manifestHash, preparedManifestHash: hash('prepared'),
        inputRevision: 1, preparedRevision: 2, generation: 1, profileVersion: 1, preparationVersion: 1,
        policy, instrumentation: [], createdAt: 1 } as Doc<'cloudEditorImportPreparations'>;
    const state = { _id: 'cloudEditorStates:site', _creationTime: 1, projectId, branchId, workspaceId, version: 1,
        profile: 'imported-next-v1', preparationId: receipt._id, revision: 5, generation: 4,
        createdByUserId: 'users:builder', creationId: 'initial_import_123', status: 'stopped',
        bytes: files.reduce((sum, item) => sum + item.bytes, 0), fileCount: files.length, updatedAt: 1 } as Doc<'cloudEditorStates'>;
    const rows = new Map<string, unknown>([[receipt._id, receipt], [baseline._id, baseline]]);
    let reads = 0;
    const ctx = { db: {
        get: async (id: string) => rows.get(id) ?? null,
        query: (table: string) => {
            if (table !== 'cloudEditorFiles') throw Error('Unexpected table');
            const filters: Array<[string, unknown]> = [];
            const index = { eq: (field: string, value: unknown) => { filters.push([field, value]); return index; } };
            return { withIndex: (name: string, select: (q: typeof index) => unknown) => {
                if (name !== 'by_branchId_path') throw Error('Unexpected index');
                select(index);
                return { unique: async () => {
                    reads++;
                    const matches = files.filter(row => filters.every(([field, value]) => Reflect.get(row, field) === value));
                    if (matches.length > 1) throw Error('Not unique');
                    return matches[0] ?? null;
                } };
            } };
        },
    } } as unknown as QueryCtx;
    return { ctx, files, state, receipt, baseline, policy, rows, reads: () => reads };
}

describe('prepared import state and text saves', () => {
    it('uses the exact Node policy encoding and canonical pin order', async () => {
        const { policy } = await fixture();
        const { policyHash, ...body } = policy;
        body.pinnedFiles.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
        expect(policyHash).toBe(hash(JSON.stringify(body)));
        expect(await hashPreparationPolicy({ ...body, pinnedFiles: [...body.pinnedFiles].reverse() })).toBe(policyHash);
    });

    it('returns a bound receipt after indexed pin reads and permits later source/runtime generations', async () => {
        const f = await fixture();
        expect(await getPreparedImport(f.ctx, f.state)).toBe(f.receipt);
        expect(f.reads()).toBe(f.policy.pinnedFiles.length);
        expect(await getPreparedImport(f.ctx, { ...f.state, revision: 2 })).toBe(f.receipt);
    });

    it('does not read preparation records for other profiles', async () => {
        const f = await fixture();
        for (const profile of [undefined, 'starter-v1', 'imported-source-v1'] as const) {
            expect(await getPreparedImport(f.ctx, { ...f.state, profile })).toBeNull();
        }
        expect(f.reads()).toBe(0);
    });

    it('rejects missing receipt/baseline and cross-project, branch or workspace provenance', async () => {
        const missing = await fixture();
        await expect(getPreparedImport(missing.ctx, { ...missing.state, preparationId: undefined })).rejects.toThrow('CLOUD_IMPORT_PREPARATION_INVALID');
        for (const table of ['receipt', 'baseline'] as const) {
            const f = await fixture(); f.rows.delete(f[table]._id);
            await expect(getPreparedImport(f.ctx, f.state)).rejects.toThrow('CLOUD_IMPORT_PREPARATION_INVALID');
            for (const field of ['projectId', 'branchId', 'workspaceId']) {
                const scope = await fixture(); Reflect.set(scope[table], field, `${field}:foreign`);
                await expect(getPreparedImport(scope.ctx, scope.state)).rejects.toThrow('CLOUD_IMPORT_PREPARATION_INVALID');
            }
        }
    });

    it('rejects nonfinalized or altered baseline hashes and invalid preparation generations/revisions', async () => {
        for (const patch of [
            { generation: 2 }, { profileVersion: 2 }, { preparationVersion: 2 },
            { inputRevision: 0 }, { inputRevision: 1.5 }, { preparedRevision: 6 },
            { preparedRevision: 3 }, { preparedManifestHash: 'invalid' },
            { inputManifestHash: hash('other') }, { baselineManifestHash: hash('other') },
        ]) {
            const f = await fixture(); Object.assign(f.receipt, patch);
            await expect(getPreparedImport(f.ctx, f.state)).rejects.toThrow('CLOUD_IMPORT_PREPARATION_INVALID');
        }
        for (const patch of [{ state: 'open' }, { manifestHash: hash('other') }]) {
            const f = await fixture(); Object.assign(f.baseline, patch);
            await expect(getPreparedImport(f.ctx, f.state)).rejects.toThrow();
        }
        const f = await fixture();
        await expect(getPreparedImport(f.ctx, { ...f.state, revision: 1 })).rejects.toThrow();
    });

    it('checks fixed policy constants, integrity, unique pins and required inventory', async () => {
        for (const patch of [{ bun: '1.3.10' }, { node: 'node22' }, { next: '16.3.2' },
            { install: 'default' }, { dev: 'shell' }, { build: 'turbopack' },
            { bunArchiveSha256: hash('wrong archive') }, { policyHash: hash('wrong policy') }, { extra: true }]) {
            const f = await fixture(); Object.assign(f.policy, patch);
            await expect(getPreparedImport(f.ctx, f.state)).rejects.toThrow();
        }
        for (const mode of ['missing', 'duplicate', 'new-config', 'second-layout', 'bad-path', 'bad-size']) {
            const f = await fixture();
            if (mode === 'missing') f.policy.pinnedFiles.splice(0, 1);
            if (mode === 'duplicate') f.policy.pinnedFiles.push({ ...f.policy.pinnedFiles[0]! });
            if (mode === 'new-config') f.policy.pinnedFiles.push({ path: 'webpack.config.js', hash: hash('{}'), bytes: 2 });
            if (mode === 'second-layout') f.policy.pinnedFiles.push({ path: 'app/layout.tsx', hash: hash('layout'), bytes: 6 });
            if (mode === 'bad-path') f.policy.pinnedFiles[0]!.path = '../package.json';
            if (mode === 'bad-size') f.policy.pinnedFiles[0]!.bytes = 750_001;
            f.policy.policyHash = await hashPreparationPolicy(f.policy);
            await expect(getPreparedImport(f.ctx, f.state)).rejects.toThrow();
        }
    });

    it('rehashes actual pinned text and rejects missing, binary, mis-scoped or forged pin rows', async () => {
        for (const mode of ['missing', 'changed-text', 'changed-hash', 'changed-bytes', 'storage', 'directory', 'scope']) {
            const f = await fixture();
            if (mode === 'missing') f.files.splice(0, 1);
            else if (mode === 'changed-text') f.files[0]!.text = '[]'; // same size, stale hash
            else if (mode === 'changed-hash') f.files[0]!.hash = hash('other');
            else if (mode === 'changed-bytes') f.files[0]!.bytes++;
            else if (mode === 'storage') f.files[0]!.storageId = '_storage:pin' as Id<'_storage'>;
            else if (mode === 'directory') f.files[0]!.kind = 'directory';
            else f.files[0]!.projectId = 'projects:foreign' as Id<'projects'>;
            await expect(getPreparedImport(f.ctx, f.state)).rejects.toThrow('CLOUD_IMPORT_PREPARATION_INVALID');
        }
    });

    it('accepts exact existing source and CSS replacements including Unicode without mutation', async () => {
        const f = await fixture(), before = JSON.stringify(f.files);
        await assertImportedTextChanges(f.files, [change('src/app/page.tsx', 'export default () => <p>Hej åäö 🌍</p>;'),
            change('src/styles/main.css', 'p { color: blue; }')], f.policy);
        expect(JSON.stringify(f.files)).toBe(before);
    });

    it('rejects new paths, deletion, directory, media, storage-backed source and all pin replacements', async () => {
        const f = await fixture();
        const invalid: ImportedTextChange[] = [
            change('src/new.tsx', 'new'), change('public/asset.mp4', 'new'),
            { ...change('src/app/page.tsx', ''), kind: 'delete' },
            { ...change('src/app/page.tsx', ''), kind: 'directory' },
            { ...change('src/app/page.tsx', 'new'), storageId: '_storage:new' },
            ...f.policy.pinnedFiles.map(pin => change(pin.path, f.files.find(file => file.path === pin.path)!.text!)),
        ];
        for (const value of invalid) await expect(assertImportedTextChanges(f.files, [value], f.policy)).rejects.toThrow('CLOUD_IMPORT_SOURCE_CHANGE_FORBIDDEN');
        const binarySource = [...f.files, { ...file('src/binary.ts', ''), text: undefined, storageId: '_storage:source' as Id<'_storage'> }];
        await expect(assertImportedTextChanges(binarySource, [change('src/binary.ts', 'new')], f.policy)).rejects.toThrow();
    });

    it('does not allow an ordinary source save to cover existing pin or config drift', async () => {
        for (const mode of ['text', 'metadata', 'missing', 'extra-config', 'duplicate', 'scope']) {
            const f = await fixture();
            if (mode === 'text') f.files[0]!.text = '[]';
            if (mode === 'metadata') f.files[0]!.hash = hash('other');
            if (mode === 'missing') f.files.splice(0, 1);
            if (mode === 'extra-config') f.files.push(file('src/next.config.ts', 'export default {};'));
            if (mode === 'duplicate') f.files.push({ ...f.files[0]! });
            if (mode === 'scope') f.files[8]!.branchId = 'branches:other' as Id<'branches'>;
            await expect(assertImportedTextChanges(f.files, [change('src/app/page.tsx', 'Saved')], f.policy)).rejects.toThrow();
        }
    });

    it('checks source bytes, hashes, Unicode, paths, secrets and duplicate changes', async () => {
        const f = await fixture();
        for (const value of [
            { ...change('src/app/page.tsx', 'new'), hash: hash('wrong') },
            { ...change('src/app/page.tsx', 'å'), bytes: 1 },
            change('src/app/page.tsx', '\ud800'), change('../src/app/page.tsx', 'new'),
            change('src/app/page.tsx', `ghp_${'x'.repeat(30)}`),
        ]) await expect(assertImportedTextChanges(f.files, [value], f.policy)).rejects.toThrow();
        const value = change('src/app/page.tsx', 'new');
        await expect(assertImportedTextChanges(f.files, [value, value], f.policy)).rejects.toThrow();
        f.files[8]!.text = 'Corrupt original';
        await expect(assertImportedTextChanges(f.files, [value], f.policy)).rejects.toThrow();
    });

    it('bounds empty/large batches, individual text and the encoded change envelope', async () => {
        const f = await fixture();
        await expect(assertImportedTextChanges(f.files, [], f.policy)).rejects.toThrow();
        await expect(assertImportedTextChanges(f.files, Array.from({ length: 401 }, () => change('src/app/page.tsx', '')), f.policy)).rejects.toThrow();
        await expect(assertImportedTextChanges(f.files, [change('src/app/page.tsx', 'x'.repeat(750_001))], f.policy)).rejects.toThrow();
        const paths = Array.from({ length: 5 }, (_, i) => `src/large-${i}.ts`);
        const files = [...f.files, ...paths.map(path => file(path, 'before'))];
        await expect(assertImportedTextChanges(files, paths.map(path => change(path, 'x'.repeat(700_000))), f.policy)).rejects.toThrow();
        // JSON escaping counts toward the envelope even when decoded text is smaller.
        await expect(assertImportedTextChanges(f.files, [change('src/app/page.tsx', '\u0000'.repeat(600_000))], f.policy)).rejects.toThrow();
    });
});
