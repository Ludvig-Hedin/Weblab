import { describe, expect, test } from 'bun:test';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { _wizardAttachCollection, _wizardCreateCollection } from '../cmsActionsInternal';
import { draftChanges, newPost, remoteDocument, validatePilotDocument } from './sanityPilotContract';

export function postFixture() {
    return {
        _id: 'drafts.article-1', _rev: 'rev-one', _type: 'pilotPost' as const,
        title: 'Title', slug: { _type: 'slug', current: 'first-post', custom: 'preserved' },
        excerpt: 'Excerpt', category: 'News', publishedAt: '2026-10-01',
        body: [{ _key: 'block1', _type: 'block', style: 'normal', markDefs: [],
            children: [{ _key: 'span1', _type: 'span', text: 'Hello', marks: ['strong'] }],
        }],
        mainImage: { _type: 'image', asset: { _type: 'reference', _ref: 'image-abc123-640x480-png' },
            alt: 'Image', crop: { left: 0.1 }, hotspot: { x: 0.5 },
        }, customMetadata: { untouched: true },
    };
}

describe('exact Sanity pilot contract', () => {
    test('text and alt edits preserve provider metadata, asset, crop and PortableText keys', () => {
        const initial = postFixture();
        const { set, expected } = draftChanges(remoteDocument(initial), { title: 'Changed', mainImage: { alt: 'New description' }, slug: { current: 'new-slug' } });
        expect(expected.customMetadata).toEqual(initial.customMetadata);
        expect(expected.body).toEqual(initial.body);
        expect(set.mainImage).toEqual({ ...initial.mainImage, alt: 'New description' });
        expect(set.slug).toEqual({ ...initial.slug, current: 'new-slug' });
        expect(initial.title).toBe('Title');
    });
    test('rejects identity/system/unknown changes and public image replacement', () => {
        const doc = remoteDocument(postFixture());
        for (const change of [{ _rev: 'new' }, { _id: 'other' }, { _type: 'other' }, { unknown: true },
            { mainImage: { alt: 'New', asset: { _ref: 'image-other-1x1-png' } } }]) {
            expect(() => draftChanges(doc, change)).toThrow('BAD_REQUEST');
        }
    });
    test('refuses unsupported rich content instead of flattening or losing formatting', () => {
        const doc = postFixture();
        expect(() => validatePilotDocument({ ...doc, body: [{ ...doc.body[0], listItem: 'bullet' }] })).toThrow();
        expect(() => validatePilotDocument({ ...doc, body: [{ ...doc.body[0], markDefs: [{ _type: 'link', href: '/x' }] }] })).toThrow();
        expect(() => validatePilotDocument({ ...doc, body: [{ ...doc.body[0], children: [{ ...doc.body[0]!.children[0], marks: ['link-key'] }] }] })).toThrow();
        expect(() => validatePilotDocument({ ...doc, body: [doc.body[0], doc.body[0]] })).toThrow();
    });
    test('validates canonical slug, calendar date and homepage identity on the server', () => {
        const doc = postFixture();
        expect(() => validatePilotDocument({ ...doc, slug: { _type: 'slug', current: 'Wrong/Slug' } })).toThrow();
        expect(() => validatePilotDocument({ ...doc, publishedAt: '2026-02-30' })).toThrow();
        expect(() => validatePilotDocument({ _type: 'pilotHome', _id: 'other-home', title: 'Home', intro: 'Intro' })).toThrow();
        expect(validatePilotDocument({ _type: 'pilotHome', _id: 'drafts.pilot-home', title: 'Home', intro: 'Intro' })).toBeDefined();
    });
    test('new posts use explicit draft identity and refuse images until staged upload exists', () => {
        const { _id: _id, _rev: _rev, _type: _type, mainImage: _image, customMetadata: _custom, ...values } = postFixture();
        const post = newPost('new-article', { ...values, slug: { current: 'new-article' } });
        expect(post._id).toBe('drafts.new-article');
        expect(() => newPost('pilot-home', { ...values, slug: { current: 'new-article' } })).toThrow();
        expect(() => newPost('new-article', { ...values, mainImage: {} })).toThrow();
    });
});


function mappingFixture() {
    const projectId = 'project' as Id<'projects'>;
    const sourceId = 'source' as Id<'cmsSources'>;
    const collectionId = 'collection' as Id<'cmsCollections'>;
    const rows = new Map<string, Record<string, unknown>>([
        ['user', { _id: 'user', clerkUserId: 'clerk', _creationTime: 1 }],
        ['workspace', { _id: 'workspace', createdByUserId: 'user' }],
        ['project', { _id: 'project', workspaceId: 'workspace', accessMode: 'restricted' }],
        ['source', { _id: 'source', projectId: 'project', type: 'payload', status: 'connected' }],
        ['collection', { _id: 'collection', projectId: 'project', sourceId: 'original-source', description: 'Original' }],
    ]);
    let allowed = true;
    const writes: { kind: string; id: string; value: Record<string, unknown> }[] = [];
    const db = {
        get: async (id: string) => rows.get(id) ?? null,
        query: (table: string) => {
            const selected = () => table === 'users' ? [rows.get('user')!] : table === 'workspaceMembers' ? [{ role: allowed ? 'owner' : 'viewer' }] : table === 'projectMembers' ? [{ role: allowed ? 'manager' : 'viewer' }] : [];
            const query = { withIndex: (_name: string, _build: unknown) => query, collect: async () => selected(), unique: async () => selected()[0] ?? null };
            return query;
        },
        insert: async (table: string, value: Record<string, unknown>) => { const id = `created-${writes.length}`; writes.push({ kind: table, id, value }); return id; },
        patch: async (id: string, value: Record<string, unknown>) => { writes.push({ kind: 'patch', id, value }); },
    };
    const ctx = { db, auth: { getUserIdentity: async () => ({ subject: 'clerk', tokenIdentifier: 'issuer|clerk' }) } } as unknown as MutationCtx;
    return { ctx, rows, writes, revoke: () => { allowed = false; }, projectId, sourceId, collectionId };
}
type CreateMapping = { projectId: Id<'projects'>; sourceId: Id<'cmsSources'>; remoteRef: string; name: string; slug: string; fields: { key: string; name: string; type: string }[] };
type AttachMapping = { projectId: Id<'projects'>; sourceId: Id<'cmsSources'>; collectionId: Id<'cmsCollections'>; remoteRef: string };
const createMapping = (_wizardCreateCollection as unknown as { _handler: (ctx: MutationCtx, args: CreateMapping) => Promise<Id<'cmsCollections'>> })._handler;
const attachMapping = (_wizardAttachCollection as unknown as { _handler: (ctx: MutationCtx, args: AttachMapping) => Promise<void> })._handler;
function mappingArgs(fixture: ReturnType<typeof mappingFixture>): CreateMapping {
    return { projectId: fixture.projectId, sourceId: fixture.sourceId, remoteRef: 'posts', name: 'Posts', slug: 'posts', fields: [{ key: 'title', name: 'Title', type: 'text' }] };
}

describe('actual CMS mapping mutations after provider discovery', () => {
    test('current capability is checked again after discovery and before any write', async () => {
        const fixture = mappingFixture();
        const discovered = await Promise.resolve(mappingArgs(fixture));
        fixture.revoke();
        await expect(createMapping(fixture.ctx, discovered)).rejects.toThrow('FORBIDDEN');
        await expect(attachMapping(fixture.ctx, { ...discovered, collectionId: fixture.collectionId })).rejects.toThrow('FORBIDDEN');
        expect(fixture.writes).toEqual([]);
    });
    test('missing, moved, deleting and Sanity sources cannot create or attach generic mappings', async () => {
        for (const changed of [null, { projectId: 'other-project' }, { status: 'deleting' }, { type: 'sanity' }]) {
            const fixture = mappingFixture();
            const discovered = await Promise.resolve(mappingArgs(fixture));
            if (changed === null) fixture.rows.delete('source');
            else fixture.rows.set('source', { ...fixture.rows.get('source'), ...changed });
            await expect(createMapping(fixture.ctx, discovered)).rejects.toThrow(changed?.type === 'sanity' ? 'BAD_REQUEST' : 'NOT_FOUND');
            await expect(attachMapping(fixture.ctx, { ...discovered, collectionId: fixture.collectionId })).rejects.toThrow(changed?.type === 'sanity' ? 'BAD_REQUEST' : 'NOT_FOUND');
            expect(fixture.writes).toEqual([]);
        }
    });
    test('attaching refuses a collection from another project before changing its source', async () => {
        const fixture = mappingFixture();
        fixture.rows.set('collection', { ...fixture.rows.get('collection'), projectId: 'other-project' });
        await expect(attachMapping(fixture.ctx, { ...mappingArgs(fixture), collectionId: fixture.collectionId })).rejects.toThrow('NOT_FOUND');
        expect(fixture.writes).toEqual([]);
    });
    test('authorized generic provider mapping still creates the collection and fields or attaches once', async () => {
        const created = mappingFixture();
        await createMapping(created.ctx, mappingArgs(created));
        expect(created.writes.map((write) => write.kind)).toEqual(['cmsCollections', 'cmsFields']);
        expect(created.writes[0]!.value.sourceId).toBe('source');
        const attached = mappingFixture();
        await attachMapping(attached.ctx, { ...mappingArgs(attached), collectionId: attached.collectionId });
        expect(attached.writes).toHaveLength(1);
        expect(attached.writes[0]!.value.sourceId).toBe('source');
    });
});
