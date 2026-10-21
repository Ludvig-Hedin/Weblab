import { describe, expect, test } from 'bun:test';
import { acceptBlogRecoveryEdit, appendBlogOperation, BLOG_RECOVERY_MAX_BYTES, blogOperationsAfterSave, blogRecoveryKey, listBlogRecovery, removeBlogRecovery, writeBlogRecovery,
    listBlogCreateRecovery, previewBlogOperations, removeBlogCreateRecovery, validateBlogRecovery, writeBlogCreateRecovery, type BlogCreateCheckpoint, type BlogRecoveryCheckpoint, type BlogRecoveryStorage } from './sanity-blog-recovery';
import type { BlogOperation } from '../../convex/lib/sanityBlogContract';
import { applyBlogOperations, blogEditableTextKeys, newBlogDocument, SANITY_BLOG_MAX_BYTES } from '../../convex/lib/sanityBlogContract';

function storage() {
    const values = new Map<string, string>();
    const store: BlogRecoveryStorage = {
        get length() { return values.size; },
        key: (index) => [...values.keys()][index] ?? null,
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, value); },
        removeItem: (key) => { values.delete(key); },
    };
    return { store, values };
}
function checkpoint(overrides: Partial<BlogRecoveryCheckpoint> = {}): BlogRecoveryCheckpoint {
    return { version: 1, ownerId: 'alice', projectId: 'site', branchId: 'branch', connectionId: 'connection', connectionRevision: 1,
        documentId: 'post', draftId: 'draft', writerId: 'writer-a', token: 'edit-1', draftRevision: 2, providerRevision: 'provider-rev',
        documentJson: '{"title":"first"}', operationsJson: '[{"kind":"set","field":"title","value":"first"}]', updatedAt: 1, ...overrides };
}

function baseline(): string {
    const doc = JSON.parse(newBlogDocument('weblab-9a6191f0-13d1-4a90-8c41-7aee19c1d397', 'First', 'first', '2026-10-02T00:00:00.000Z')) as Record<string, unknown>;
    return JSON.stringify({ ...doc, _id: 'post', _rev: 'provider-rev', unknown: { keep: true } });
}

describe('durable blog recovery', () => {
    test('storage failure denies an accepted edit and leaves prior recovery intact', () => {
        const { store } = storage();
        const prior = checkpoint();
        expect(acceptBlogRecoveryEdit(store, prior, null)).toEqual(prior);
        const failing: BlogRecoveryStorage = { ...store, setItem() { throw new Error('Quota'); } };
        expect(acceptBlogRecoveryEdit(failing, checkpoint({ token: 'edit-2' }), prior)).toBeNull();
        expect(listBlogRecovery(store, prior, 2, 'provider-rev')).toEqual([prior]);
    });
    test('accounts, sites, branches, immutable connections and document baselines never inherit recovery', () => {
        const { store } = storage();
        const prior = checkpoint();
        writeBlogRecovery(store, prior, null);
        for (const overrides of [{ ownerId: 'bob' }, { projectId: 'other' }, { branchId: 'other' }, { connectionId: 'other' },
            { connectionRevision: 2 }, { documentId: 'other' }, { draftId: 'other' }]) {
            expect(listBlogRecovery(store, checkpoint(overrides), 2, 'provider-rev')).toEqual([]);
        }
        expect(listBlogRecovery(store, prior, 3, 'provider-rev')).toEqual([]);
        expect(listBlogRecovery(store, prior, 2, 'new-provider-rev')).toEqual([]);
    });
    test('a stale save receipt cannot remove newer typing or another writer', () => {
        const { store, values } = storage();
        const saved = checkpoint();
        const other = checkpoint({ writerId: 'writer-b', token: 'other-tab' });
        writeBlogRecovery(store, saved, null);
        writeBlogRecovery(store, other, null);
        const newer = checkpoint({ token: 'edit-2', updatedAt: 2 });
        expect(writeBlogRecovery(store, newer, saved.token)).toBe(true);
        expect(removeBlogRecovery(store, saved)).toBe(false);
        expect(values.size).toBe(2);
        expect(removeBlogRecovery(store, newer)).toBe(true);
        expect(listBlogRecovery(store, other, 2, 'provider-rev')).toEqual([other]);
    });
    test('exact checkpoint removal preserves other users and rejects stale writer CAS', () => {
        const { store } = storage();
        const alice = checkpoint();
        const bob = checkpoint({ ownerId: 'bob' });
        writeBlogRecovery(store, alice, null);
        writeBlogRecovery(store, bob, null);
        expect(writeBlogRecovery(store, checkpoint({ token: 'wrong' }), 'missing-token')).toBe(false);
        expect(removeBlogRecovery(store, alice)).toBe(true);
        expect(listBlogRecovery(store, bob, 2, 'provider-rev')).toEqual([bob]);
        expect(blogRecoveryKey(checkpoint({ ownerId: 'a:b' }), 'x')).not.toBe(blogRecoveryKey(checkpoint({ ownerId: 'a%3Ab' }), 'x'));
    });
    test('reopen offers all matching writer checkpoints newest first, without silently accepting one', () => {
        const { store } = storage();
        const first = checkpoint();
        const second = checkpoint({ writerId: 'writer-b', updatedAt: 3 });
        writeBlogRecovery(store, first, null);
        writeBlogRecovery(store, second, null);
        expect(listBlogRecovery(store, first, 2, 'provider-rev')).toEqual([second, first]);
    });
    test('save prefix extraction keeps edits typed while a save is in flight', () => {
        const sent = [{ field: 'title', value: 'first' }];
        const typed = [...sent, { field: 'title', value: 'newer' }];
        expect(blogOperationsAfterSave(typed, sent)).toEqual([typed[1]!]);
        expect(blogOperationsAfterSave([{ field: 'title', value: 'different document' }], sent)).toBeNull();
    });
    test('reopen after a lost save receipt rebases newer typing only onto the exact saved document', () => {
        const { store } = storage();
        const savedOperation = { kind: 'set', field: 'title', value: 'saved' };
        const newerOperation = { kind: 'set', field: 'title', value: 'newer' };
        const savedJson = applyBlogOperations(baseline(), JSON.stringify([savedOperation]));
        const pending = checkpoint({ operationsJson: JSON.stringify([savedOperation, newerOperation]), documentJson: applyBlogOperations(savedJson, JSON.stringify([newerOperation])),
            saveIntent: { operationsJson: JSON.stringify([savedOperation]), documentJson: savedJson } });
        writeBlogRecovery(store, pending, null);
        const offered = listBlogRecovery(store, pending, 3, 'provider-rev', savedJson);
        expect(offered).toHaveLength(1);
        expect(offered[0]!.draftRevision).toBe(3);
        expect(JSON.parse(offered[0]!.operationsJson)).toEqual([newerOperation]);
        expect(listBlogRecovery(store, pending, 3, 'provider-rev', '{"title":"other editor"}')).toEqual([]);
        expect(listBlogRecovery(store, pending, 4, 'provider-rev', savedJson)).toEqual([]);
        expect(listBlogRecovery(store, pending, 3, 'changed-provider', savedJson)).toEqual([]);
    });
    test('size bounds reject excessive recovery without replacing the last good edit', () => {
        const { store } = storage();
        const prior = checkpoint();
        writeBlogRecovery(store, prior, null);
        expect(acceptBlogRecoveryEdit(store, checkpoint({ token: 'too-big', documentJson: 'x'.repeat(BLOG_RECOVERY_MAX_BYTES) }), prior)).toBeNull();
        expect(listBlogRecovery(store, prior, 2, 'provider-rev')).toEqual([prior]);
    });
    test('thousands of keystrokes remain one saveable field operation, with the pending save prefix frozen', () => {
        let operations: BlogOperation[] = [];
        for (let index = 0; index < 1500; index++) operations = appendBlogOperation(operations, { kind: 'set', field: 'title', value: String(index) });
        expect(operations).toEqual([{ kind: 'set', field: 'title', value: '1499' }]);
        const captured = [...operations];
        for (let index = 0; index < 1500; index++) operations = appendBlogOperation(operations, { kind: 'set', field: 'title', value: `newer ${index}` }, captured.length);
        expect(operations).toHaveLength(2);
        expect(blogOperationsAfterSave(operations, captured)).toEqual([{ kind: 'set', field: 'title', value: 'newer 1499' }]);
    });
    test('unresolved save intent survives further accepted typing and reopen against its original receipt', () => {
        const { store } = storage();
        const sent: BlogOperation[] = [{ kind: 'set', field: 'title', value: 'saved' }];
        const prior = checkpoint({ operationsJson: JSON.stringify(sent), documentJson: '{"title":"saved"}',
            saveIntent: { operationsJson: JSON.stringify(sent), documentJson: '{"title":"saved"}' } });
        writeBlogRecovery(store, prior, null);
        const operations = appendBlogOperation(sent, { kind: 'set', field: 'title', value: 'newer' }, sent.length);
        const newer = { ...prior, token: 'typed-after-save', operationsJson: JSON.stringify(operations), documentJson: '{"title":"newer"}' };
        expect(acceptBlogRecoveryEdit(store, newer, prior)).toEqual(newer);
        const recovered = listBlogRecovery(store, newer, 3, 'provider-rev', '{"title":"saved"}');
        expect(JSON.parse(recovered[0]!.operationsJson)).toEqual([{ kind: 'set', field: 'title', value: 'newer' }]);
    });
    test('new post form and unknown create payload retain the same operation identity after reopen', () => {
        const { store } = storage();
        const form: BlogCreateCheckpoint = { version: 1, ownerId: 'alice', projectId: 'site', branchId: 'branch', connectionId: 'connection', connectionRevision: 1,
            writerId: 'create-writer', token: 'create-1', operationId: '9a6191f0-13d1-4a90-8c41-7aee19c1d397', title: 'First post', slug: 'first-post', publishedAt: '2026-10-02', updatedAt: 1 };
        expect(writeBlogCreateRecovery(store, form, null)).toBe(true);
        const submitted = { ...form, token: 'submitted', submitted: { title: form.title, slug: form.slug, publishedAt: form.publishedAt } };
        expect(writeBlogCreateRecovery(store, submitted, form.token)).toBe(true);
        expect(listBlogCreateRecovery(store, form)).toEqual([submitted]);
        expect(listBlogCreateRecovery(store, { ...form, ownerId: 'bob' })).toEqual([]);
        expect(listBlogCreateRecovery(store, { ...form, connectionRevision: 2 })).toEqual([]);
        expect(removeBlogCreateRecovery(store, form)).toBe(false);
        expect(removeBlogCreateRecovery(store, submitted)).toBe(true);
    });
    test('new post form edit denial keeps the last durable fields and does not accept a changed UUID', () => {
        const { store } = storage();
        const form: BlogCreateCheckpoint = { version: 1, ownerId: 'alice', projectId: 'site', branchId: 'branch', connectionId: 'connection', connectionRevision: 1,
            writerId: 'create-writer', token: 'create-1', operationId: '9a6191f0-13d1-4a90-8c41-7aee19c1d397', title: '', slug: '', publishedAt: '', updatedAt: 1 };
        writeBlogCreateRecovery(store, form, null);
        const failing: BlogRecoveryStorage = { ...store, setItem() { throw new Error('Blocked'); } };
        expect(writeBlogCreateRecovery(failing, { ...form, token: 'edit-2', title: 'Not accepted' }, form.token)).toBe(false);
        expect(listBlogCreateRecovery(store, form)).toEqual([form]);
    });
    test('appended text, style and decorators replay the accepted coalesced log and recover intact', () => {
        const { store } = storage();
        const source = baseline();
        let operations: BlogOperation[] = [];
        let prior: BlogRecoveryCheckpoint | null = null;
        const edits: BlogOperation[] = [
            { kind: 'appendText', blockKey: 'append-one', spanKey: 'append-span' },
            { kind: 'span', blockKey: 'append-one', spanKey: 'append-span', text: 'First text' },
            { kind: 'blockStyle', blockKey: 'append-one', style: 'h2' },
            { kind: 'decorator', blockKey: 'append-one', spanKey: 'append-span', decorator: 'strong', enabled: true },
            { kind: 'span', blockKey: 'append-one', spanKey: 'append-span', text: 'Newest text' },
            { kind: 'blockStyle', blockKey: 'append-one', style: 'h3' },
            { kind: 'decorator', blockKey: 'append-one', spanKey: 'append-span', decorator: 'strong', enabled: false },
            { kind: 'decorator', blockKey: 'append-one', spanKey: 'append-span', decorator: 'em', enabled: true },
            { kind: 'appendText', blockKey: 'append-two', spanKey: 'another-span' },
        ];
        for (const [index, operation] of edits.entries()) {
            const nextOperations = appendBlogOperation(operations, operation);
            const documentJson = previewBlogOperations(source, nextOperations);
            const candidate = checkpoint({ token: `structural-${index}`, operationsJson: JSON.stringify(nextOperations), documentJson });
            const accepted = acceptBlogRecoveryEdit(store, candidate, prior);
            expect(accepted).toEqual(candidate);
            operations = nextOperations; prior = accepted;
            expect(validateBlogRecovery(source, candidate)).toEqual({ operations, documentJson, saveIntent: undefined });
            expect(documentJson).toBe(applyBlogOperations(source, JSON.stringify(operations)));
            expect(blogEditableTextKeys(JSON.parse(documentJson) as Record<string, unknown>).has('append-one')).toBe(true);
        }
        expect(operations.filter((operation) => operation.kind === 'appendText')).toHaveLength(2);
        expect(operations.filter((operation) => operation.kind === 'decorator')).toHaveLength(3);
        expect(operations.filter((operation) => operation.kind === 'span')).toHaveLength(1);
        expect(operations.filter((operation) => operation.kind === 'blockStyle')).toHaveLength(1);
        if (!prior) throw new Error('Expected the structural edit recovery checkpoint');
        expect(listBlogRecovery(store, prior, 2, 'provider-rev', source)).toEqual([prior]);
    });
    test('incomplete scalar and link typing keeps appended blocks editable and recoverable, while saves stay strict', () => {
        const doc = JSON.parse(baseline()) as { content: Array<{ markDefs: unknown[]; children: Array<{ marks: string[] }> }> };
        doc.content[0]!.markDefs = [{ _key: 'link', _type: 'link', href: 'https://example.com' }];
        doc.content[0]!.children[0]!.marks = ['link'];
        const source = JSON.stringify(doc);
        const operations: BlogOperation[] = [
            { kind: 'set', field: 'title', value: '' },
            { kind: 'set', field: 'slug', value: 'unfinished-' },
            { kind: 'link', blockKey: 'block-new', markKey: 'link', href: 'https://' },
            { kind: 'appendText', blockKey: 'appended', spanKey: 'new-span' },
            { kind: 'blockStyle', blockKey: 'appended', style: 'h4' },
            { kind: 'decorator', blockKey: 'appended', spanKey: 'new-span', decorator: 'strong', enabled: true },
        ];
        const documentJson = previewBlogOperations(source, operations);
        expect(blogEditableTextKeys(JSON.parse(documentJson) as Record<string, unknown>)).toEqual(new Set(['block-new', 'appended']));
        expect(validateBlogRecovery(source, checkpoint({ documentJson, operationsJson: JSON.stringify(operations) }))).not.toBeNull();
        expect(() => applyBlogOperations(source, JSON.stringify(operations))).toThrow();
    });
    test('structural suffixes stay behind the immutable save prefix and survive a lost receipt', () => {
        const { store } = storage(); const source = baseline();
        const sent: BlogOperation[] = [
            { kind: 'appendText', blockKey: 'sent-block', spanKey: 'sent-span' },
            { kind: 'blockStyle', blockKey: 'sent-block', style: 'h2' },
            { kind: 'decorator', blockKey: 'sent-block', spanKey: 'sent-span', decorator: 'strong', enabled: true },
        ];
        let current = appendBlogOperation(sent, { kind: 'blockStyle', blockKey: 'sent-block', style: 'h3' }, sent.length);
        current = appendBlogOperation(current, { kind: 'blockStyle', blockKey: 'sent-block', style: 'blockquote' }, sent.length);
        current = appendBlogOperation(current, { kind: 'decorator', blockKey: 'sent-block', spanKey: 'sent-span', decorator: 'strong', enabled: false }, sent.length);
        current = appendBlogOperation(current, { kind: 'appendText', blockKey: 'suffix-block', spanKey: 'suffix-span' }, sent.length);
        expect(current.slice(0, sent.length)).toEqual(sent);
        const savedJson = applyBlogOperations(source, JSON.stringify(sent));
        const pending = checkpoint({ operationsJson: JSON.stringify(current), documentJson: previewBlogOperations(source, current), saveIntent: { operationsJson: JSON.stringify(sent), documentJson: savedJson } });
        expect(validateBlogRecovery(source, pending)).not.toBeNull();
        expect(writeBlogRecovery(store, pending, null)).toBe(true);
        const recovered = listBlogRecovery(store, pending, 3, 'provider-rev', savedJson)[0]!;
        const suffix = blogOperationsAfterSave(current, sent)!;
        expect(JSON.parse(recovered.operationsJson)).toEqual(suffix);
        expect(validateBlogRecovery(savedJson, recovered)).toEqual({ operations: suffix, documentJson: pending.documentJson, saveIntent: undefined });
    });
    test('invalid recovered save intents are refused without changing or deleting stored edits', () => {
        const { store, values } = storage(); const source = baseline();
        const operations: BlogOperation[] = [{ kind: 'set', field: 'title', value: 'Newest' }];
        const documentJson = previewBlogOperations(source, operations);
        for (const saveIntent of [
            { operationsJson: JSON.stringify([{ kind: 'set', field: 'title', value: 'Wrong prefix' }]), documentJson },
            { operationsJson: JSON.stringify(operations), documentJson: source },
            { operationsJson: '[]', documentJson: source },
            { operationsJson: '[invalid', documentJson },
        ]) {
            const captured = checkpoint({ writerId: `invalid-${values.size}`, documentJson, operationsJson: JSON.stringify(operations), saveIntent });
            // Fixtures model a corrupt old checkpoint already present on the device.
            values.set(blogRecoveryKey(captured, captured.writerId), JSON.stringify(captured));
            const before = new Map(values);
            expect(validateBlogRecovery(source, captured)).toBeNull();
            expect(values).toEqual(before);
        }
        const incomplete: BlogOperation[] = [{ kind: 'set', field: 'title', value: '' }];
        const captured = checkpoint({ documentJson: previewBlogOperations(source, incomplete), operationsJson: JSON.stringify(incomplete), saveIntent: { operationsJson: JSON.stringify(incomplete), documentJson: previewBlogOperations(source, incomplete) } });
        expect(validateBlogRecovery(source, captured)).toBeNull();
        const valid = checkpoint({ documentJson, operationsJson: JSON.stringify(operations), saveIntent: { operationsJson: JSON.stringify(operations), documentJson } });
        expect(validateBlogRecovery(source, valid)).not.toBeNull();
        const reordered = checkpoint({ ...valid, saveIntent: { operationsJson: '[{"value":"Newest","field":"title","kind":"set"}]', documentJson } });
        expect(validateBlogRecovery(source, reordered)).toBeNull();
    });
    test('local typing refuses field maximums without replacing the last accepted recovery', () => {
        const { store, values } = storage();
        const doc = JSON.parse(baseline()) as { content: Array<Record<string, unknown>> };
        doc.content[0]!.markDefs = [{ _key: 'link', _type: 'link', href: 'https://example.com' }];
        doc.content.push({ _key: 'image', _type: 'image', asset: { _ref: 'asset' } });
        const source = JSON.stringify(doc);
        const initial: BlogOperation[] = [{ kind: 'set', field: 'title', value: 'Accepted' }];
        const prior = checkpoint({ documentJson: previewBlogOperations(source, initial), operationsJson: JSON.stringify(initial) });
        expect(acceptBlogRecoveryEdit(store, prior, null)).toEqual(prior);
        const refused: BlogOperation[] = [
            { kind: 'set', field: 'title', value: 'x'.repeat(10_001) },
            { kind: 'set', field: 'excerpt', value: 'x'.repeat(281) },
            { kind: 'set', field: 'author', value: 'x'.repeat(1001) },
            { kind: 'set', field: 'slug', value: 'x'.repeat(97) },
            { kind: 'span', blockKey: 'block-new', spanKey: 'span-new', text: 'x'.repeat(10_001) },
            { kind: 'link', blockKey: 'block-new', markKey: 'link', href: 'x'.repeat(4097) },
            { kind: 'imageText', blockKey: 'image', field: 'alt', value: 'x'.repeat(10_001) },
            { kind: 'categories', value: Array.from({ length: 101 }, () => 'Category') },
            { kind: 'categories', value: ['x'.repeat(121)] },
        ];
        for (const operation of refused) {
            const before = new Map(values);
            expect(() => {
                const operations = appendBlogOperation(initial, operation);
                const documentJson = previewBlogOperations(source, operations);
                acceptBlogRecoveryEdit(store, checkpoint({ token: 'refused', documentJson, operationsJson: JSON.stringify(operations) }), prior);
            }).toThrow();
            expect(values).toEqual(before);
            expect(listBlogRecovery(store, prior, 2, 'provider-rev', source)).toEqual([prior]);
        }
    });
    test('local structural preview refuses excessive document/log size or operation count before acceptance', () => {
        const source = JSON.parse(baseline()) as Record<string, unknown>;
        source.padding = '';
        source.padding = 'x'.repeat(SANITY_BLOG_MAX_BYTES - new TextEncoder().encode(JSON.stringify(source)).byteLength - 1);
        const original = JSON.stringify(source);
        expect(() => previewBlogOperations(original, [{ kind: 'appendText', blockKey: 'too-big', spanKey: 'span' }])).toThrow('too large');
        const toggle: BlogOperation = { kind: 'decorator', blockKey: 'block-new', spanKey: 'span-new', decorator: 'strong', enabled: true };
        expect(() => previewBlogOperations(baseline(), Array.from({ length: 1001 }, () => toggle))).toThrow('Too many');
        const hugeLog: BlogOperation[] = Array.from({ length: 30 }, () => ({ kind: 'span', blockKey: 'block-new', spanKey: 'span-new', text: 'x'.repeat(10_000) }));
        expect(() => previewBlogOperations(baseline(), hugeLog)).toThrow('too large');
        expect(() => previewBlogOperations(baseline(), [{ ...toggle, enabled: 'yes' } as unknown as BlogOperation])).toThrow();
        const duplicate = JSON.parse(baseline()) as { content: unknown[] };
        duplicate.content.push(duplicate.content[0]);
        expect(() => previewBlogOperations(JSON.stringify(duplicate), [toggle])).toThrow('unique');
    });
    test('a near-document-limit source can persist a save intent and recover newer typing after the receipt', () => {
        const { store } = storage();
        const source = JSON.parse(newBlogDocument('weblab-9a6191f0-13d1-4a90-8c41-7aee19c1d397', 'First', 'first', '2026-10-02T00:00:00.000Z')) as Record<string, unknown>;
        source.unknownMetadata = '';
        const overhead = new TextEncoder().encode(JSON.stringify(source)).byteLength;
        source.unknownMetadata = 'x'.repeat(SANITY_BLOG_MAX_BYTES - overhead - 8);
        const sourceJson = JSON.stringify(source);
        const sent: BlogOperation[] = [{ kind: 'set', field: 'title', value: 'Saved' }];
        const expectedSavedJson = applyBlogOperations(sourceJson, JSON.stringify(sent));
        const newer: BlogOperation = { kind: 'set', field: 'title', value: 'Newer' };
        const pending = checkpoint({ operationsJson: JSON.stringify([...sent, newer]),
            documentJson: applyBlogOperations(expectedSavedJson, JSON.stringify([newer])),
            saveIntent: { operationsJson: JSON.stringify(sent), documentJson: expectedSavedJson } });
        expect(new TextEncoder().encode(sourceJson).byteLength).toBeGreaterThan(SANITY_BLOG_MAX_BYTES - 16);
        expect(writeBlogRecovery(store, pending, null)).toBe(true);
        const offered = listBlogRecovery(store, pending, 3, 'provider-rev', expectedSavedJson);
        expect(offered).toHaveLength(1);
        expect(JSON.parse(offered[0]!.operationsJson)).toEqual([newer]);
        expect(JSON.parse(offered[0]!.documentJson).unknownMetadata).toBe(source.unknownMetadata);
    });
});
