import { describe, expect, it } from 'bun:test';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { create, list, listPage, remove, restore, update } from '../cmsItems';
import { cmsRevision, nextCmsRevision } from './cmsRevision';
import { serializeCmsRelease, type CmsReleaseCollection } from './cmsReleaseSnapshot';
import { validateAndCleanItemValues } from './cmsValueValidation';

const projectId = 'project' as Id<'projects'>;
const collectionId = 'collection' as Id<'cmsCollections'>;
const itemId = 'item' as Id<'cmsItems'>;
const fields = [{ _id: 'title', key: 'title', name: 'Title', type: 'text', required: true, config: {}, order: 0 }] as Doc<'cmsFields'>[];

function fixture({ revision = 0, external = false, role = 'owner', itemFields = fields }: { revision?: number; external?: boolean; role?: string; itemFields?: Doc<'cmsFields'>[] } = {}) {
    const rows = new Map<string, Record<string, unknown>>([
        ['user', { _id: 'user', clerkUserId: 'clerk', _creationTime: 1 }],
        ['workspace', { _id: 'workspace', createdByUserId: 'user' }],
        ['project', { _id: projectId, workspaceId: 'workspace', accessMode: 'restricted' }],
        ['collection', { _id: collectionId, projectId, sourceId: 'source' }],
        ['source', { _id: 'source', projectId, type: external ? 'rest' : 'weblab' }],
        ['item', { _id: itemId, collectionId, values: { title: 'Before' }, status: 'published', revision, updatedAt: 1 }],
    ]);
    const writes: string[] = [];
    const paginationCalls: { numItems: number; maximumRowsRead?: number; maximumBytesRead?: number }[] = [];
    const db = {
        get: async (id: string) => rows.get(id) ?? null,
        normalizeId: (_table: string, id: string) => rows.has(id) ? id : null,
        patch: async (id: string, patch: Record<string, unknown>) => { writes.push('patch'); rows.set(id, { ...rows.get(id), ...patch }); },
        delete: async (id: string) => { writes.push('delete'); rows.delete(id); },
        insert: async (_table: string, row: Record<string, unknown>) => { writes.push('insert'); rows.set('new', { _id: 'new', ...row }); return 'new'; },
        query: (table: string) => {
            const constraints: [string, unknown][] = [];
            const index = { eq: (key: string, value: unknown) => { constraints.push([key, value]); return index; } };
            const filters: ((row: Record<string, unknown>) => boolean)[] = [];
            const select = () => {
                if (table === 'users') return [rows.get('user')!];
                if (table === 'workspaceMembers') return [{ role }];
                if (table === 'projectMembers') return [{ role: role === 'owner' ? 'manager' : role }];
                if (table === 'cmsFields') return itemFields;
                return [...rows.values()].filter((row) => constraints.every(([key, value]) => row[key] === value) && filters.every((predicate) => predicate(row)));
            };
            const query = {
                withIndex: (_name: string, build: (queryIndex: typeof index) => unknown) => { build(index); return query; },
                order: (_direction: string) => query,
                filter: (build: (expressions: { field: (key: string) => (row: Record<string, unknown>) => unknown; eq: (left: (row: Record<string, unknown>) => unknown, right: unknown) => (row: Record<string, unknown>) => boolean; neq: (left: (row: Record<string, unknown>) => unknown, right: unknown) => (row: Record<string, unknown>) => boolean }) => (row: Record<string, unknown>) => boolean) => {
                    filters.push(build({ field: (key) => (row) => row[key], eq: (left, right) => (row) => left(row) === right, neq: (left, right) => (row) => left(row) !== right })); return query;
                },
                paginate: async (options: { numItems: number; maximumRowsRead?: number; maximumBytesRead?: number }) => { paginationCalls.push(options); const selected = select(); return { page: selected.slice(0, options.numItems), isDone: selected.length <= options.numItems, continueCursor: '' }; },
                collect: async () => select(), unique: async () => select()[0] ?? null,
                take: async (limit: number) => select().slice(0, limit),
            };
            return query;
        },
    };
    const ctx = { db, auth: { getUserIdentity: async () => ({ subject: 'clerk', tokenIdentifier: 'issuer|clerk' }) } } as unknown as MutationCtx;
    return { ctx, rows, writes, paginationCalls };
}

// This exercises the registered mutation handlers, not a duplicate implementation.
const updateItem = (update as unknown as { _handler: (ctx: MutationCtx, args: { projectId: Id<'projects'>; itemId: Id<'cmsItems'>; expectedRevision: number; values?: unknown; status?: 'draft' | 'published'; slug?: string }) => Promise<unknown> })._handler;
const deleteItem = (remove as unknown as { _handler: (ctx: MutationCtx, args: { projectId: Id<'projects'>; itemId: Id<'cmsItems'>; expectedRevision: number }) => Promise<unknown> })._handler;
const createItem = (create as unknown as { _handler: (ctx: MutationCtx, args: { projectId: Id<'projects'>; collectionId: Id<'cmsCollections'>; values: unknown; slug?: string; status?: 'draft' | 'published' }) => Promise<unknown> })._handler;
const restoreItem = (restore as unknown as { _handler: (ctx: MutationCtx, args: { projectId: Id<'projects'>; itemId: Id<'cmsItems'>; expectedRevision: number; values?: Record<string, unknown> }) => Promise<unknown> })._handler;
const listItems = (list as unknown as { _handler: (ctx: MutationCtx, args: { projectId: Id<'projects'>; collectionId: Id<'cmsCollections'>; archived?: boolean }) => Promise<Doc<'cmsItems'>[]> })._handler;
const listItemPage = (listPage as unknown as { _handler: (ctx: MutationCtx, args: { projectId: Id<'projects'>; collectionId: Id<'cmsCollections'>; archived?: boolean; paginationOpts: { numItems: number; cursor: null; maximumRowsRead?: number; maximumBytesRead?: number } }) => Promise<{ page: Doc<'cmsItems'>[] }> })._handler;

describe('native CMS revision writes', () => {
    it('refuses all item writes while source deletion is draining its collections', async () => {
        const { ctx, rows, writes } = fixture();
        rows.set('source', { ...rows.get('source'), status: 'deleting' });
        await expect(createItem(ctx, { projectId, collectionId, values: { title: 'New' } })).rejects.toThrow('Source removal');
        await expect(updateItem(ctx, { projectId, itemId, expectedRevision: 0, values: { title: 'Changed' } })).rejects.toThrow('Source removal');
        await expect(deleteItem(ctx, { projectId, itemId, expectedRevision: 0 })).rejects.toThrow('Source removal');
        rows.set('item', { ...rows.get('item'), archivedAt: 0 });
        await expect(restoreItem(ctx, { projectId, itemId, expectedRevision: 0 })).rejects.toThrow('Source removal');
        expect(writes).toEqual([]);
    });
    it('accepts a legacy revision once and refuses a stale second save', async () => {
        const { ctx, rows, writes } = fixture();
        await updateItem(ctx, { projectId, itemId, expectedRevision: 0, values: { title: 'Mine' }, status: 'draft' });
        expect(rows.get('item')?.revision).toBe(1);
        expect(rows.get('item')?.status).toBe('draft');
        await expect(updateItem(ctx, { projectId, itemId, expectedRevision: 0, values: { title: 'Stale' } })).rejects.toThrow('CONFLICT:');
        expect(rows.get('item')?.values).toEqual({ title: 'Mine' });
        expect(writes).toEqual(['patch']);
    });
    it('refuses stale deletion without removing the current draft', async () => {
        const { ctx, rows, writes } = fixture({ revision: 2 });
        await expect(deleteItem(ctx, { projectId, itemId, expectedRevision: 1 })).rejects.toThrow('CONFLICT:');
        expect(rows.has('item')).toBe(true); expect(writes).toEqual([]);
    });
    it('refuses external-source edits, deletions and shadow additions', async () => {
        const { ctx, writes } = fixture({ external: true });
        await expect(updateItem(ctx, { projectId, itemId, expectedRevision: 0, values: { title: 'Wrong' } })).rejects.toThrow('READ_ONLY:');
        await expect(deleteItem(ctx, { projectId, itemId, expectedRevision: 0 })).rejects.toThrow('READ_ONLY:');
        await expect(createItem(ctx, { projectId, collectionId, values: { title: 'Wrong' } })).rejects.toThrow('READ_ONLY:');
        expect(writes).toEqual([]);
    });
    it('requires publish rights to mark content ready', async () => {
        const { ctx, writes } = fixture({ role: 'editor' });
        await expect(updateItem(ctx, { projectId, itemId, expectedRevision: 0, status: 'published' })).rejects.toThrow('FORBIDDEN');
        expect(writes).toEqual([]);
        await updateItem(ctx, { projectId, itemId, expectedRevision: 0, status: 'draft', values: { title: 'Draft' } });
        expect(writes).toEqual(['patch']);
    });
    it('refuses duplicate collection slugs', async () => {
        const { ctx, rows, writes } = fixture();
        rows.set('peer', { _id: 'peer', collectionId, slug: 'same' });
        await expect(createItem(ctx, { projectId, collectionId, values: { title: 'Title' }, slug: 'same' })).rejects.toThrow('slug is already used');
        expect(writes).toEqual([]);
    });
    it('refuses references outside the configured project collection', async () => {
        const referenceFields = [{ ...fields[0]!, type: 'reference' as const, config: { collectionId: 'targetCollection' } }];
        const { ctx, rows, writes } = fixture({ itemFields: referenceFields });
        rows.set('targetCollection', { _id: 'targetCollection', projectId });
        rows.set('outsideCollection', { _id: 'outsideCollection', projectId: 'outsideProject' });
        rows.set('foreign', { _id: 'foreign', collectionId: 'outsideCollection' });
        await expect(updateItem(ctx, { projectId, itemId, expectedRevision: 0, values: { title: 'foreign' } })).rejects.toThrow('allowed project collection');
        expect(writes).toEqual([]);
        rows.set('allowed', { _id: 'allowed', collectionId: 'targetCollection' });
        await updateItem(ctx, { projectId, itemId, expectedRevision: 0, values: { title: 'allowed' } });
        expect(rows.get('item')?.values).toEqual({ title: 'allowed' });
    });
    it('validates current values even for readiness-only saves', async () => {
        const { ctx, rows, writes } = fixture();
        rows.set('item', { ...rows.get('item'), values: {} });
        await expect(updateItem(ctx, { projectId, itemId, expectedRevision: 0, status: 'published' })).rejects.toThrow('Title is required');
        expect(writes).toEqual([]);
    });
    it('archive preserves identity, content and slug, then stale or normal edits cannot overwrite it', async () => {
        const { ctx, rows, writes } = fixture({ revision: 2 });
        rows.set('item', { ...rows.get('item'), slug: 'reserved-slug', values: { title: 'Before', oldField: 'Retained' } });
        await deleteItem(ctx, { projectId, itemId, expectedRevision: 2 });
        expect(rows.get('item')?.values).toEqual({ title: 'Before', oldField: 'Retained' });
        expect(rows.get('item')?.slug).toBe('reserved-slug');
        expect(rows.get('item')?.revision).toBe(3);
        expect(typeof rows.get('item')?.archivedAt).toBe('number');
        await expect(deleteItem(ctx, { projectId, itemId, expectedRevision: 2 })).rejects.toThrow('CONFLICT');
        await expect(updateItem(ctx, { projectId, itemId, expectedRevision: 3, values: { title: 'Wrong' } })).rejects.toThrow('READ_ONLY');
        await expect(createItem(ctx, { projectId, collectionId, slug: 'reserved-slug', values: { title: 'Another' } })).rejects.toThrow('slug is already used');
        expect(writes).toEqual(['patch']);
    });
    it('restores as a draft under current rights and exact revision while preserving unchanged content', async () => {
        const { ctx, rows, writes } = fixture({ revision: 2, role: 'editor' });
        rows.set('item', { ...rows.get('item'), archivedAt: 0, slug: 'reserved-slug', values: { title: 'Before', oldField: 'Retained' } });
        await expect(restoreItem(ctx, { projectId, itemId, expectedRevision: 1 })).rejects.toThrow('CONFLICT');
        await restoreItem(ctx, { projectId, itemId, expectedRevision: 2 });
        expect(rows.get('item')?.archivedAt).toBeUndefined();
        expect(rows.get('item')?.status).toBe('draft');
        expect(rows.get('item')?.revision).toBe(3);
        expect(rows.get('item')?.slug).toBe('reserved-slug');
        expect(rows.get('item')?.values).toEqual({ title: 'Before', oldField: 'Retained' });
        await expect(restoreItem(ctx, { projectId, itemId, expectedRevision: 3 })).rejects.toThrow('not archived');
        expect(writes).toEqual(['patch']);
    });
    it('restore validates changed schema and accepts repaired values only under the captured revision', async () => {
        const requiredFields = [...fields, { ...fields[0]!, _id: 'summary' as Id<'cmsFields'>, key: 'summary', name: 'Summary' }];
        const { ctx, rows, writes } = fixture({ revision: 2, itemFields: requiredFields });
        rows.set('item', { ...rows.get('item'), archivedAt: 0, values: { title: 'Before', oldField: 'Retained' } });
        await expect(restoreItem(ctx, { projectId, itemId, expectedRevision: 2 })).rejects.toThrow('Summary is required');
        expect(writes).toEqual([]);
        await expect(restoreItem(ctx, { projectId, itemId, expectedRevision: 1, values: { summary: 'Repair' } })).rejects.toThrow('CONFLICT');
        await expect(restoreItem(ctx, { projectId, itemId, expectedRevision: 2, values: { summary: 'Repair', unknown: 'Unknown repair' } })).rejects.toThrow('Unknown archived repair field');
        await restoreItem(ctx, { projectId, itemId, expectedRevision: 2, values: { summary: 'Repair' } });
        expect(rows.get('item')?.values).toEqual({ title: 'Before', oldField: 'Retained', summary: 'Repair' });
        expect(rows.get('item')?.status).toBe('draft');
    });
    it('explicit null repair clears only that known optional field and preserves old unknown keys', async () => {
        const itemFields = [...fields, { ...fields[0]!, key: 'caption', name: 'Caption', required: false }];
        const { ctx, rows } = fixture({ itemFields });
        rows.set('item', { ...rows.get('item'), archivedAt: 0, values: { title: 'Before', caption: 'Clear me', oldField: 'Retained' } });
        await restoreItem(ctx, { projectId, itemId, expectedRevision: 0, values: { caption: null } });
        expect(rows.get('item')?.values).toEqual({ title: 'Before', oldField: 'Retained' });
        expect(rows.get('item')?.status).toBe('draft');
    });
    it('archive and restore refuse foreign projects, foreign sources, external rows and revoked rights', async () => {
        for (const scenario of ['project', 'source', 'external', 'remote', 'remoteEmpty', 'revoked']) {
            const { ctx, rows, writes } = fixture({ external: scenario === 'external', role: scenario === 'revoked' ? 'viewer' : 'owner' });
            rows.set('item', { ...rows.get('item'), archivedAt: 0, ...(scenario.startsWith('remote') ? { remoteId: scenario === 'remoteEmpty' ? '' : 'provider-id' } : {}) });
            if (scenario === 'project') rows.set('collection', { ...rows.get('collection'), projectId: 'foreign-project' });
            if (scenario === 'source') rows.set('source', { ...rows.get('source'), projectId: 'foreign-project' });
            await expect(restoreItem(ctx, { projectId, itemId, expectedRevision: 0 })).rejects.toThrow();
            rows.set('item', { ...rows.get('item'), archivedAt: undefined });
            await expect(deleteItem(ctx, { projectId, itemId, expectedRevision: 0 })).rejects.toThrow();
            expect(writes).toEqual([]);
        }
    });
    it('active and archived reads distinguish archivedAt zero and clamp pagination scan budgets', async () => {
        const { ctx, rows, paginationCalls } = fixture();
        rows.set('archived', { ...rows.get('item'), _id: 'archived', archivedAt: 0 });
        expect((await listItems(ctx, { projectId, collectionId })).map((item) => item._id)).toEqual(['item']);
        expect((await listItems(ctx, { projectId, collectionId, archived: true })).map((item) => item._id)).toEqual(['archived']);
        const page = await listItemPage(ctx, { projectId, collectionId, archived: true, paginationOpts: { numItems: 50, cursor: null, maximumRowsRead: 99999, maximumBytesRead: 99999999 } });
        expect(page.page.map((item) => item._id)).toEqual(['archived']);
        expect(paginationCalls.at(-1)?.maximumRowsRead).toBe(1000);
        expect(paginationCalls.at(-1)?.maximumBytesRead).toBe(4 * 1024 * 1024);
    });
    it('rejects unknown or unsafe revision values', () => {
        expect(cmsRevision({})).toBe(0);
        for (const revision of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER]) expect(() => cmsRevision({ revision })).toThrow();
        expect(() => nextCmsRevision({}, NaN)).toThrow();
    });
});

describe('typed content values', () => {
    const field = (type: Doc<'cmsFields'>['type'], config: Record<string, unknown> = {}) => [{ ...fields[0]!, type, config }];
    it('validates option membership and multiplicity', () => {
        expect(validateAndCleanItemValues(field('option', { options: ['yes', 'no'] }), { title: 'yes' })).toEqual({ title: 'yes' });
        expect(() => validateAndCleanItemValues(field('option', { options: ['yes'] }), { title: 'missing' })).toThrow();
        expect(() => validateAndCleanItemValues(field('option', { options: ['yes'] }), { title: ['yes'] })).toThrow();
    });
    it('refuses code links and malformed images', () => {
        expect(() => validateAndCleanItemValues(field('text', { format: 'url' }), { title: 'javascript:alert(1)' })).toThrow();
        expect(() => validateAndCleanItemValues(field('image'), { title: { url: 'https://user:password@example.test/a.png' } })).toThrow();
        expect(validateAndCleanItemValues(field('image'), { title: { url: 'https://example.test/a.png', alt: 'Logo' } })).toEqual({ title: { url: 'https://example.test/a.png', alt: 'Logo' } });
    });
    it('accepts real IDs for server-side reference checking and refuses empty required selections', () => {
        expect(validateAndCleanItemValues(field('reference'), { title: 'convexItemId' })).toEqual({ title: 'convexItemId' });
        expect(() => validateAndCleanItemValues(field('reference', { multiple: true }), { title: [] })).toThrow();
        expect(() => validateAndCleanItemValues(field('number'), { title: Infinity })).toThrow();
    });
});


function referenceRelease(): CmsReleaseCollection[] {
    const first = 'first' as Id<'cmsCollections'>;
    const target = 'target' as Id<'cmsCollections'>;
    return [
        { collection: { _id: first, projectId, name: 'First', slug: 'first' } as Doc<'cmsCollections'>,
          fields: [{ ...fields[0]!, collectionId: first, type: 'reference', config: { collectionId: target }, required: true }],
          items: [{ _id: 'first-item', collectionId: first, status: 'published', values: { title: 'target-item' }, revision: 1 } as Doc<'cmsItems'>] },
        { collection: { _id: target, projectId, name: 'Target', slug: 'target' } as Doc<'cmsCollections'>,
          fields: [{ ...fields[0]!, collectionId: target }],
          items: [{ _id: 'target-item', collectionId: target, status: 'published', values: { title: 'Target' }, revision: 1 } as Doc<'cmsItems'>] },
    ];
}
describe('eligible frozen CMS references', () => {
    it('accepts exact eligible configured-collection references and rejects missing targets', () => {
        const release = referenceRelease();
        expect(JSON.parse(serializeCmsRelease(release)).collections[0].items[0].values.title).toBe('target-item');
        release[1]!.items = [];
        expect(() => serializeCmsRelease(release)).toThrow('CMS_RELEASE_INVALID_REFERENCE');
    });
    it('rejects archived zero, draft and external targets rather than emitting hidden content', () => {
        for (const patch of [{ archivedAt: 0 }, { status: 'draft' as const }, { remoteId: 'provider-id' }]) {
            const release = referenceRelease();
            release[1]!.items[0] = { ...release[1]!.items[0]!, ...patch };
            expect(() => serializeCmsRelease(release)).toThrow('CMS_RELEASE_INVALID_COLLECTION');
        }
    });
    it('does not accept a globally eligible ID from the wrong target collection', () => {
        const release = referenceRelease();
        release[0]!.fields[0]!.config = { collectionId: release[0]!.collection._id };
        expect(() => serializeCmsRelease(release)).toThrow('CMS_RELEASE_INVALID_REFERENCE');
    });
    it('honors single and multiple reference shapes while retaining public config', () => {
        const release = referenceRelease();
        release[0]!.fields[0]!.config = { collectionId: 'target', multiple: true };
        expect(() => serializeCmsRelease(release)).toThrow('CMS_RELEASE_INVALID_REFERENCE');
        release[0]!.items[0]!.values = { title: ['target-item'] };
        expect(JSON.parse(serializeCmsRelease(release)).collections[0].items[0].values.title).toEqual(['target-item']);
        release[0]!.fields[0]!.config = { collectionId: 'target', multiple: false };
        expect(() => serializeCmsRelease(release)).toThrow('allows one selection');
    });
    it('retains reference targets and multiplicity without exposing private metadata', () => {
        const release = referenceRelease();
        release[0]!.fields[0]!.config = { collectionId: 'target', multiple: true, token: 'private-token', provider: { secret: 'private-secret' } };
        release[0]!.items[0]!.values = { title: ['target-item'] };
        const before = JSON.stringify(release);
        const json = serializeCmsRelease(release);
        const snapshot = JSON.parse(json);
        expect(snapshot.version).toBe(2);
        expect(snapshot.collections[0].fields[0].config).toEqual({ collectionId: 'target', multiple: true });
        expect(json).not.toContain('private-token');
        expect(json).not.toContain('private-secret');
        expect(JSON.stringify(release)).toBe(before);
    });
    it('refuses a dangling optional reference even without selected values or items', () => {
        const release = referenceRelease();
        release[0]!.fields[0]!.required = false;
        release[0]!.items = [];
        release[1]!.items = [];
        expect(() => serializeCmsRelease(release)).not.toThrow();
        release[0]!.fields[0]!.config = { collectionId: 'missing' };
        expect(() => serializeCmsRelease(release)).toThrow('CMS_RELEASE_INVALID_REFERENCE');
    });
    it('preserves allowed choices and validates values against the same frozen settings', () => {
        const release = referenceRelease();
        release[0]!.fields[0]!.type = 'option';
        release[0]!.fields[0]!.config = { options: ['A', 'B'], multiple: true, credential: 'private' };
        release[0]!.items[0]!.values = { title: ['B', 'A'] };
        const snapshot = JSON.parse(serializeCmsRelease(release));
        expect(snapshot.collections[0].fields[0].config).toEqual({ options: ['A', 'B'], multiple: true });
        expect(snapshot.collections[0].items[0].values.title).toEqual(['B', 'A']);
        release[0]!.items[0]!.values = { title: ['C'] };
        expect(() => serializeCmsRelease(release)).toThrow('unknown option');
    });
    it('refuses legacy choice normalization and invalid settings even on empty collections', () => {
        const release = referenceRelease();
        const field = release[0]!.fields[0]!;
        release[0]!.items = [];
        field.type = 'option';
        field.config = { options: [' A', 'B'] };
        expect(() => serializeCmsRelease(release)).toThrow('CMS_RELEASE_INVALID_FIELD_CONFIG');
        field.config = { options: ['A'], multiple: 'true' };
        expect(() => serializeCmsRelease(release)).toThrow('Multiple selections');
        field.type = 'text';
        field.config = { format: 'unrecognized' };
        expect(() => serializeCmsRelease(release)).toThrow('Text format');
    });
    it('preserves link validation for text, rich text and slug without private metadata', () => {
        for (const type of ['text', 'rich_text', 'slug'] as const) {
            const release = referenceRelease();
            const field = release[0]!.fields[0]!;
            field.type = type;
            field.config = { format: 'url', token: 'private-token' };
            release[0]!.items[0]!.values = { title: 'https://example.test/page' };
            const snapshot = JSON.parse(serializeCmsRelease(release));
            expect(snapshot.collections[0].fields[0].config).toEqual({ format: 'url' });
            release[0]!.items[0]!.values = { title: 'javascript:alert(1)' };
            expect(() => serializeCmsRelease(release)).toThrow('HTTP or HTTPS');
        }
    });
});
