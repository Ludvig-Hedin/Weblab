import { describe, expect, test, spyOn } from 'bun:test';
import { getFunctionName } from 'convex/server';
import type { ActionCtx, MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { archive, capture, cleanupBranch, connection, create, createConnection, drafts, exportSelected, findDraft, load, publicationDrafts, save } from '../cmsSanityBlog';
import { open } from '../cmsSanityBlogActions';
import { authorize } from '../nativePublishing';
import { SanityBlogReader } from './sanityBlogReader';

type Row = Record<string, unknown> & { _id: string };
const scope = { projectId: 'projects:one' as Id<'projects'>, branchId: 'branches:one' as Id<'branches'> };
const uuid = '8fa93f56-1dca-40b0-b270-273fdd4b7f75';
const raw = JSON.stringify({ _id: 'published-post', _type: 'blogPost', _rev: 'provider-1', title: 'Original', slug: { _type: 'slug', current: 'original', custom: 1 }, publishedAt: '2026-01-01T12:00:00Z', categories: ['News'], author: 'Author', content: [{ _type: 'block', _key: 'block-1', style: 'h3', children: [{ _type: 'span', _key: 'span-1', text: 'Original text', marks: ['strong'] }], markDefs: [], custom: true }], heroImage: { _type: 'image', asset: { _ref: 'image-original' }, crop: { left: .1 }, hotspot: { x: .5 }, alt: 'Original photo' }, seo: { noIndex: true }, unknown: { keep: true } });

function fixture() {
    const tables = new Map<string, Map<string, Row>>();
    const table = (name: string) => { let rows = tables.get(name); if (!rows) { rows = new Map(); tables.set(name, rows); } return rows; };
    const put = (name: string, id: string, value: Record<string, unknown>) => table(name).set(id, { _id: id, _creationTime: 1, ...value });
    const get = (id: string) => table(id.split(':')[0]!).get(id) ?? null;
    let subject: string | null = 'editor';
    let sequence = 0;
    const writes: string[] = [];
    const scheduled: string[] = [];
    put('users', 'users:editor', { clerkUserId: 'editor' });
    put('users', 'users:other', { clerkUserId: 'other' });
    put('workspaces', 'workspaces:one', { createdByUserId: 'users:owner' });
    put('projects', scope.projectId, { workspaceId: 'workspaces:one', accessMode: 'restricted' });
    put('workspaceMembers', 'workspaceMembers:editor', { workspaceId: 'workspaces:one', userId: 'users:editor', role: 'member' });
    put('projectMembers', 'projectMembers:editor', { projectId: scope.projectId, userId: 'users:editor', role: 'manager' });
    put('branches', scope.branchId, { projectId: scope.projectId, runtimeType: 'local', runtimeMetadata: { local: { rootPath: '/private/test-copy' } } });
    const ctx = { auth: { getUserIdentity: async () => subject ? { subject } : null }, db: {
        get: async (id: string) => get(id),
        insert: async (name: string, value: Record<string, unknown>) => { const id = `${name}:${++sequence}`; put(name, id, value); writes.push(`insert:${id}`); return id; },
        patch: async (id: string, value: Record<string, unknown>) => { Object.assign(get(id)!, value); writes.push(`patch:${id}`); },
        delete: async (id: string) => { table(id.split(':')[0]!).delete(id); writes.push(`delete:${id}`); },
        query: (name: string) => {
            const constraints: Array<{ key: string; value: unknown; greater?: boolean }> = [];
            const index = { eq: (key: string, value: unknown) => { constraints.push({ key, value }); return index; }, gt: (key: string, value: unknown) => { constraints.push({ key, value, greater: true }); return index; } };
            const rows = () => [...table(name).values()].filter(row => constraints.every(c => c.greater ? String(row[c.key]) > String(c.value) : row[c.key] === c.value)).sort((a, b) => String(a.documentId ?? a._id).localeCompare(String(b.documentId ?? b._id)));
            const query = { withIndex: (_name: string, build: (q: typeof index) => unknown) => { build(index); return query; }, collect: async () => rows(), take: async (n: number) => rows().slice(0, n), unique: async () => { const result = rows(); if (result.length > 1) throw new Error('nonunique'); return result[0] ?? null; } };
            return query;
        },
    }, scheduler: { runAfter: async (_time: number, ref: Parameters<typeof getFunctionName>[0]) => { scheduled.push(getFunctionName(ref)); } } } as unknown as MutationCtx;
    return { ctx, get, put, table, writes, scheduled, signIn: (id: string | null) => { subject = id; }, revoke: () => { get('projectMembers:editor')!.role = 'viewer'; } };
}
async function connected(f: ReturnType<typeof fixture>) {
    const row = await createConnection._handler(f.ctx, { ...scope, sanityProjectId: 'exampleid', dataset: 'production' });
    return { ...scope, connectionId: row.id, connectionRevision: row.revision };
}
const pin = (draft: Awaited<ReturnType<typeof capture._handler>>) => ({ draftId: draft.id, expectedRevision: draft.revision, providerRevision: draft.providerRevision });

describe('native Weblab blog draft handlers', () => {
    test('publication selection returns bounded exact pins without document bodies or writes', async () => {
        const f = fixture(); const c = await connected(f);
        const first = await capture._handler(f.ctx, { ...c, documentJson: raw });
        for (let i = 0; i < 9; i++) await create._handler(f.ctx, { ...c, operationId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, title: `Post ${i}`, slug: `post-${i}`, publishedAt: '2026-02-01T10:00:00Z' });
        const writes = f.writes.length;
        const page = await publicationDrafts._handler(f.ctx, c);
        expect(page.items).toHaveLength(8); expect(page.cursor).not.toBeNull();
        const next = await publicationDrafts._handler(f.ctx, { ...c, cursor: page.cursor! });
        expect(next.items).toHaveLength(2); expect(next.cursor).toBeNull();
        const published = [...page.items, ...next.items].find(row => row.id === first.id);
        expect(published).toMatchObject({ providerRevision: 'provider-1', revision: 1, archived: false });
        expect(Object.keys(published!).sort()).toEqual(['archived', 'documentId', 'id', 'providerRevision', 'revision', 'slug', 'title']);
        expect(f.writes).toHaveLength(writes);
        await expect(publicationDrafts._handler(f.ctx, { ...c, cursor: '../bad' })).rejects.toThrow('BAD_REQUEST');
        f.revoke(); await expect(publicationDrafts._handler(f.ctx, c)).rejects.toThrow('FORBIDDEN');
        expect(f.writes).toHaveLength(writes);
    });
    test('native export reads exact selected revisions without writes and requires current publication access', async () => {
        const f = fixture(); const c = await connected(f);
        const first = await capture._handler(f.ctx, { ...c, documentJson: raw });
        const selected = { ...pin(first), archived: first.archived };
        const writes = f.writes.length;
        const exported = await exportSelected._handler(f.ctx, { ...c, selections: [selected] });
        expect(exported).toMatchObject({ version: 1, userId: 'editor', connection: { id: c.connectionId, revision: c.connectionRevision }, drafts: [first] });
        expect(exported.drafts[0]?.originalJson).toBe(raw);
        expect(f.writes).toHaveLength(writes);
        await expect(exportSelected._handler(f.ctx, { ...c, selections: [selected, selected] })).rejects.toThrow('unique');
        await expect(exportSelected._handler(f.ctx, { ...c, selections: [{ ...selected, providerRevision: 'different' }] })).rejects.toThrow('CONFLICT');
        await expect(exportSelected._handler(f.ctx, { ...c, selections: [{ ...selected, archived: true }] })).rejects.toThrow('CONFLICT');
        await expect(exportSelected._handler(f.ctx, { ...c, connectionRevision: c.connectionRevision + 1, selections: [] })).rejects.toThrow('CONFLICT');
        const archived = await archive._handler(f.ctx, { ...c, ...pin(first), archived: true });
        await expect(exportSelected._handler(f.ctx, { ...c, selections: [selected] })).rejects.toThrow('CONFLICT');
        expect((await exportSelected._handler(f.ctx, { ...c, selections: [{ ...pin(archived), archived: true }] })).drafts).toEqual([archived]);
        f.revoke();
        await expect(exportSelected._handler(f.ctx, { ...c, selections: [] })).rejects.toThrow('FORBIDDEN');
        f.signIn(null);
        await expect(exportSelected._handler(f.ctx, { ...c, selections: [] })).rejects.toThrow('UNAUTHORIZED');
    });
    test('native export cannot read a different branch or draft scope or an unbounded selection', async () => {
        const f = fixture(); const c = await connected(f);
        const draft = await capture._handler(f.ctx, { ...c, documentJson: raw });
        const selected = { ...pin(draft), archived: false };
        f.get(draft.id)!.branchId = 'branches:other';
        await expect(exportSelected._handler(f.ctx, { ...c, selections: [selected] })).rejects.toThrow('NOT_FOUND');
        f.get(draft.id)!.branchId = c.branchId;
        await expect(exportSelected._handler(f.ctx, { ...c, selections: Array.from({ length: 9 }, (_, i) => ({ ...selected, draftId: `cmsSanityBlogDrafts:${i}` as Id<'cmsSanityBlogDrafts'> })) })).rejects.toThrow('bounded');
        await expect(exportSelected._handler(f.ctx, { ...c, selections: [{ ...selected, expectedRevision: 1.5 }] })).rejects.toThrow('BAD_REQUEST');
        f.get(scope.branchId)!.runtimeType = 'cloud';
        await expect(exportSelected._handler(f.ctx, { ...c, selections: [] })).rejects.toThrow('NOT_FOUND');
    });
    test('captures a published baseline once, preserves metadata, and rejects stale saves', async () => {
        const f = fixture(); const c = await connected(f);
        const first = await capture._handler(f.ctx, { ...c, documentJson: raw });
        const saved = await save._handler(f.ctx, { ...c, ...pin(first), operationsJson: JSON.stringify([{ kind: 'set', field: 'title', value: 'Changed' }, { kind: 'span', blockKey: 'block-1', spanKey: 'span-1', text: 'Changed text' }]) });
        const edited = JSON.parse(saved.documentJson);
        expect(edited.heroImage).toEqual(JSON.parse(raw).heroImage);
        expect(edited.seo).toEqual({ noIndex: true });
        expect(edited.content[0].style).toBe('h3'); expect(edited.content[0].children[0].marks).toEqual(['strong']);
        expect(saved.originalJson).toBe(raw); expect(saved.providerRevision).toBe('provider-1');
        const writes = f.writes.length;
        await expect(save._handler(f.ctx, { ...c, ...pin(first), operationsJson: '[]' })).rejects.toThrow('CONFLICT');
        expect(f.writes).toHaveLength(writes);
        const reopened = await capture._handler(f.ctx, { ...c, documentJson: raw.replace('provider-1', 'provider-2') });
        expect(reopened).toEqual(saved);
    });
    test('registered save accepts structural draft edits with CAS and refuses malformed structure without writes', async () => {
        const f = fixture(); const c = await connected(f);
        const first = await capture._handler(f.ctx, { ...c, documentJson: raw });
        const operationsJson = JSON.stringify([
            { kind: 'appendText', blockKey: 'new-block', spanKey: 'new-span' },
            { kind: 'span', blockKey: 'new-block', spanKey: 'new-span', text: 'New paragraph' },
            { kind: 'blockStyle', blockKey: 'new-block', style: 'h2' },
            { kind: 'decorator', blockKey: 'new-block', spanKey: 'new-span', decorator: 'em', enabled: true },
            { kind: 'blockStyle', blockKey: 'block-1', style: 'normal' },
        ]);
        const saved = await save._handler(f.ctx, { ...c, ...pin(first), operationsJson });
        const document = JSON.parse(saved.documentJson) as Record<string, unknown>;
        const source = JSON.parse(raw) as Record<string, unknown>;
        expect(saved.revision).toBe(first.revision + 1);
        expect(saved.originalJson).toBe(raw);
        expect(document.unknown).toEqual(source.unknown); expect(document.heroImage).toEqual(source.heroImage);
        expect(document.content).toMatchObject([{ _key: 'block-1', style: 'normal', custom: true }, { _key: 'new-block', style: 'h2', children: [{ _key: 'new-span', text: 'New paragraph', marks: ['em'] }] }]);
        const writes = f.writes.length;
        await expect(save._handler(f.ctx, { ...c, ...pin(first), operationsJson })).rejects.toThrow('CONFLICT');
        for (const operation of [
            { kind: 'appendText', blockKey: 'new-block', spanKey: 'another' },
            { kind: 'blockStyle', blockKey: 'block-1', style: 'h1' },
            { kind: 'decorator', blockKey: 'block-1', spanKey: 'span-1', decorator: 'strong', enabled: false, marks: [] },
        ]) await expect(save._handler(f.ctx, { ...c, ...pin(saved), operationsJson: JSON.stringify([operation]) })).rejects.toThrow('BAD_REQUEST');
        expect(f.writes).toHaveLength(writes);
        const reserved = JSON.parse(raw) as { content: Array<{ markDefs: unknown[] }> };
        reserved.content[0]!.markDefs = [{ _key: 'strong', _type: 'link', href: 'https://example.com' }];
        const reservedJson = JSON.stringify({ ...reserved, _id: 'reserved-post', slug: { _type: 'slug', current: 'reserved-post' } });
        const reservedDraft = await capture._handler(f.ctx, { ...c, documentJson: reservedJson });
        const beforeRefusal = f.writes.length;
        await expect(save._handler(f.ctx, { ...c, ...pin(reservedDraft), operationsJson: JSON.stringify([{ kind: 'decorator', blockKey: 'block-1', spanKey: 'span-1', decorator: 'strong', enabled: false }]) })).rejects.toThrow('Reserved');
        expect(f.writes).toHaveLength(beforeRefusal);
        expect(f.get(reservedDraft.id)!.documentJson).toBe(reservedJson);
    });
    test('rights, branch, connection and provider version are checked before any edit', async () => {
        const f = fixture(); const c = await connected(f); const draft = await capture._handler(f.ctx, { ...c, documentJson: raw });
        const args = { ...c, ...pin(draft), operationsJson: '[]' };
        const writes = f.writes.length;
        await expect(save._handler(f.ctx, { ...args, providerRevision: 'other' })).rejects.toThrow('CONFLICT');
        await expect(save._handler(f.ctx, { ...args, connectionRevision: 2 })).rejects.toThrow('CONFLICT');
        f.get(scope.branchId)!.runtimeType = 'cloud'; await expect(save._handler(f.ctx, args)).rejects.toThrow('NOT_FOUND');
        f.get(scope.branchId)!.runtimeType = 'local'; f.revoke(); await expect(save._handler(f.ctx, args)).rejects.toThrow('FORBIDDEN');
        f.signIn('other'); await expect(connection._handler(f.ctx, scope)).rejects.toThrow('FORBIDDEN');
        f.signIn(null); await expect(connection._handler(f.ctx, scope)).rejects.toThrow('UNAUTHORIZED');
        expect(f.writes).toHaveLength(writes);
    });
    test('archives and restores only local drafts with revision checks and reserved addresses', async () => {
        const f = fixture(); const c = await connected(f);
        const draft = await create._handler(f.ctx, { ...c, operationId: uuid, title: 'New', slug: 'new', publishedAt: '2026-02-01T10:00:00Z' });
        const archived = await archive._handler(f.ctx, { ...c, ...pin(draft), archived: true });
        await expect(save._handler(f.ctx, { ...c, ...pin(archived), operationsJson: '[]' })).rejects.toThrow('restore');
        await expect(create._handler(f.ctx, { ...c, operationId: '1'.repeat(8) + '-1111-4111-8111-111111111111', title: 'Other', slug: 'new', publishedAt: '2026-02-01T10:00:00Z' })).rejects.toThrow('address');
        const restored = await archive._handler(f.ctx, { ...c, ...pin(archived), archived: false });
        expect(restored.archived).toBe(false); expect(restored.documentJson).toBe(draft.documentJson); expect(restored.providerRevision).toBeNull();
        const replay = await create._handler(f.ctx, { ...c, operationId: uuid, title: 'New', slug: 'new', publishedAt: '2026-02-01T10:00:00Z' });
        expect(replay.id).toBe(draft.id); expect(replay.revision).toBe(restored.revision);
    });
    test('immutable connection refuses dataset repoint and activates the existing CMS release refusal', async () => {
        const f = fixture(); const c = await connected(f);
        await expect(createConnection._handler(f.ctx, { ...scope, sanityProjectId: 'other', dataset: 'production' })).rejects.toThrow('already connected');
        const grant = await authorize._handler(f.ctx, scope);
        expect(grant.cmsRequired).toBe(true); expect(grant.productionSwitchEnabled).toBe(false);
        const current = await connection._handler(f.ctx, scope); expect(current?.id).toBe(c.connectionId);
    });
    test('open reuses saved edits and cannot capture after rights are revoked during GET', async () => {
        const f = fixture(); const c = await connected(f);
        const actionCtx = { runQuery: async (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
            const name = getFunctionName(ref);
            if (name === 'cmsSanityBlog:load') return load._handler(f.ctx, args as Parameters<typeof load._handler>[1]);
            if (name === 'cmsSanityBlog:findDraft') return findDraft._handler(f.ctx, args as Parameters<typeof findDraft._handler>[1]);
            throw new Error(name);
        }, runMutation: async (_ref: unknown, args: unknown) => capture._handler(f.ctx, args as Parameters<typeof capture._handler>[1]) } as unknown as ActionCtx;
        const get = spyOn(SanityBlogReader.prototype, 'get').mockImplementation(async () => { f.revoke(); return raw; });
        try {
            await expect(open._handler(actionCtx, { ...c, documentId: 'published-post' })).rejects.toThrow('FORBIDDEN');
            expect(f.table('cmsSanityBlogDrafts').size).toBe(0);
            f.get('projectMembers:editor')!.role = 'manager';
            const first = await capture._handler(f.ctx, { ...c, documentJson: raw });
            const result = await open._handler(actionCtx, { ...c, documentId: 'published-post' });
            expect(result).toEqual(first); expect(get).toHaveBeenCalledTimes(1);
        } finally { get.mockRestore(); }
    });
    test('draft pagination reports more rows and cleanup never deletes an existing branch', async () => {
        const f = fixture(); const c = await connected(f);
        for (let n = 0; n < 9; n++) await capture._handler(f.ctx, { ...c, documentJson: raw.replace('published-post', `post-${n}`).replace('"current":"original"', `"current":"original-${n}"`) });
        const page = await drafts._handler(f.ctx, c);
        expect(page.items).toHaveLength(8); expect(page.cursor).toBe('post-7');
        expect((await drafts._handler(f.ctx, { ...c, cursor: page.cursor! })).items.map(row => row.documentId)).toEqual(['post-8']);
        await expect(cleanupBranch._handler(f.ctx, { branchId: scope.branchId })).rejects.toThrow('still exists');
        f.table('branches').delete(scope.branchId);
        await cleanupBranch._handler(f.ctx, { branchId: scope.branchId });
        expect(f.table('cmsSanityBlogDrafts').size).toBe(1); expect(f.scheduled).toEqual(['cmsSanityBlog:cleanupBranch']);
        await cleanupBranch._handler(f.ctx, { branchId: scope.branchId });
        expect(f.table('cmsSanityBlogDrafts').size).toBe(0); expect(f.table('cmsSanityBlogConnections').size).toBe(0);
    });
});
