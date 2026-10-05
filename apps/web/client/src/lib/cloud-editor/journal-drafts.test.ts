import { describe, expect, it } from 'bun:test';
import { clearAcknowledgedJournalDraft, clearJournalDraft, dismissJournalDraftEntry, journalDraftKey, listJournalDrafts, writeJournalDraft, type CloudJournalDraft } from './journal-drafts';

class StorageFixture {
    values = new Map<string, string>();
    failWrites = false;
    beforeSet: ((key: string) => void) | null = null;
    beforeRemove: ((key: string) => void) | null = null;
    get length() { return this.values.size; }
    key(index: number) { return [...this.values.keys()][index] ?? null; }
    getItem(key: string) { return this.values.get(key) ?? null; }
    setItem(key: string, value: string) { this.beforeSet?.(key); if (this.failWrites) throw new Error('Quota exceeded'); this.values.set(key, value); }
    removeItem(key: string) { this.beforeRemove?.(key); this.values.delete(key); }
}
const scope = { projectId: 'project-one', branchId: 'branch-one' }, actor = 'actor-one';
function draft(writerId = 'writer_0000000001', title = 'Unsaved title'): CloudJournalDraft {
    const original = { key: 'journal_entry_0001', slug: 'story', revision: 3, status: 'draft' as const, archived: false,
        values: { title: 'Saved title', excerpt: '', body: 'Saved body' } };
    return { version: 1, ...scope, actorId: actor, generation: 2, writerId, changeId: `change_${writerId}`, updatedAt: 1, ancestors: [],
        original, item: { ...original, values: { ...original.values, title } } };
}
describe('Journal browser draft ownership', () => {
    it('keeps two writers separate and recovers exact original item/approval revisions', () => {
        const storage = new StorageFixture(), first = draft(), second = draft('writer_0000000002', 'Other tab text');
        writeJournalDraft(storage, first); writeJournalDraft(storage, second);
        const recovered = listJournalDrafts(storage, scope, actor);
        expect(recovered).toHaveLength(2);
        expect(recovered.map(value => value.item.values.title)).toEqual(['Unsaved title', 'Other tab text']);
        expect(recovered[0]!.original.revision).toBe(3);
        expect(recovered[0]!.generation).toBe(2);
        clearJournalDraft(storage, first);
        expect(listJournalDrafts(storage, scope, actor)).toEqual([second]);
    });
    it('clears an acknowledged fork and only unchanged ancestor copies', () => {
        const storage = new StorageFixture(), first = draft();
        const fork = { ...draft('writer_0000000002', 'Recovered and edited'), ancestors: [{ writerId: first.writerId, changeId: first.changeId }] };
        writeJournalDraft(storage, first); writeJournalDraft(storage, fork);
        clearAcknowledgedJournalDraft(storage, scope, actor, { kind: 'save', key: fork.item.key, expectedItemRevision: 3,
            slug: fork.item.slug, values: fork.item.values, status: 'ready' });
        expect(listJournalDrafts(storage, scope, actor)).toEqual([]);
        expect([...storage.values.values()].every(value => value.length < 100)).toBe(true);
        const nextStorage = new StorageFixture();
        writeJournalDraft(nextStorage, first); writeJournalDraft(nextStorage, fork);
        const newer = { ...first, changeId: 'change_newer_00001', item: { ...first.item, values: { ...first.item.values, title: 'New work in original tab' } } };
        writeJournalDraft(nextStorage, newer);
        clearJournalDraft(nextStorage, fork);
        expect(listJournalDrafts(nextStorage, scope, actor)).toEqual([newer]);
    });
    it('does not delete newer text or a different request after acknowledgment', () => {
        const storage = new StorageFixture(), current = draft();
        writeJournalDraft(storage, current);
        const newer = { ...current, changeId: 'change_newer_00001', item: { ...current.item, values: { ...current.item.values, title: 'More typing' } } };
        writeJournalDraft(storage, newer);
        clearJournalDraft(storage, current);
        clearAcknowledgedJournalDraft(storage, scope, actor, { kind: 'save', key: current.item.key, expectedItemRevision: 3,
            slug: current.item.slug, values: current.item.values, status: 'draft' });
        expect(listJournalDrafts(storage, scope, actor)).toEqual([newer]);
    });
    it('rejects storage failure before replacing the last durable draft', () => {
        const storage = new StorageFixture(), current = draft();
        writeJournalDraft(storage, current); storage.failWrites = true;
        expect(() => writeJournalDraft(storage, { ...current, changeId: 'change_newer_00001', item: { ...current.item, values: { ...current.item.values, title: 'Cannot be accepted' } } })).toThrow('Quota exceeded');
        expect(listJournalDrafts(storage, scope, actor)).toEqual([current]);
    });
    it('isolates actor/project/branch and preserves malformed recovery for download', () => {
        const storage = new StorageFixture(), current = draft();
        writeJournalDraft(storage, current);
        expect(listJournalDrafts(storage, scope, 'other-actor')).toEqual([]);
        expect(listJournalDrafts(storage, { ...scope, branchId: 'other-branch' }, actor)).toEqual([]);
        const key = journalDraftKey(scope, actor, current.writerId);
        storage.setItem(key, '{broken');
        expect(() => listJournalDrafts(storage, scope, actor)).toThrow();
        expect(storage.getItem(key)).toBe('{broken');
    });
    it('preserves a foreign writer edit injected between acknowledgment and cleanup', () => {
        const storage = new StorageFixture(), original = draft();
        writeJournalDraft(storage, original);
        const newer = { ...original, changeId: 'change_racing_00001', item: { ...original.item, values: { ...original.item.values, title: 'Typing during cleanup' } } };
        storage.beforeRemove = key => {
            if (!key.includes(':change:')) return;
            storage.beforeRemove = null;
            writeJournalDraft(storage, newer);
        };
        clearAcknowledgedJournalDraft(storage, scope, actor, { kind: 'save', key: original.item.key, expectedItemRevision: 3,
            slug: original.item.slug, values: original.item.values, status: 'draft' });
        expect(listJournalDrafts(storage, scope, actor)).toEqual([newer]);
        expect(storage.getItem(journalDraftKey(scope, actor, original.writerId))).not.toBeNull();
    });
    it('never deletes a legacy mutable writer slot when its ancestor changes during acknowledgment', () => {
        const storage = new StorageFixture(), original = draft();
        const key = journalDraftKey(scope, actor, original.writerId);
        storage.setItem(key, JSON.stringify(original));
        const newer = { ...original, changeId: 'change_racing_00001', item: { ...original.item, values: { ...original.item.values, title: 'Legacy tab typing' } } };
        const fork = { ...draft('writer_0000000002', 'Forked edit'), ancestors: [{ writerId: original.writerId, changeId: original.changeId }] };
        writeJournalDraft(storage, fork);
        storage.beforeSet = marker => {
            if (!marker.includes(`:ack:${original.writerId}:`)) return;
            storage.beforeSet = null; storage.setItem(key, JSON.stringify(newer));
        };
        clearJournalDraft(storage, fork);
        expect(listJournalDrafts(storage, scope, actor)).toEqual([newer]);
        expect(storage.getItem(key)).toBe(JSON.stringify(newer));
    });
    it('does not count acknowledged copies against the active limit or keep full saved payloads', () => {
        const storage = new StorageFixture();
        for (let index = 0; index < 25; index++) {
            const current = draft(`writer_${String(index).padStart(12, '0')}`);
            writeJournalDraft(storage, current); clearJournalDraft(storage, current);
        }
        const current = draft('writer_final_00001'); writeJournalDraft(storage, current);
        expect(listJournalDrafts(storage, scope, actor)).toEqual([current]);
        expect([...storage.values.values()].filter(value => value.includes('Saved body'))).toHaveLength(1);
    });
    it('dismisses unknown bytes without deleting a mutable slot that changes during dismissal', () => {
        const storage = new StorageFixture(), current = draft();
        const key = journalDraftKey(scope, actor, current.writerId);
        storage.setItem(key, '{broken');
        storage.beforeSet = marker => { if (marker.endsWith(':ignored')) { storage.beforeSet = null; storage.setItem(key, JSON.stringify(current)); } };
        dismissJournalDraftEntry(storage, { key, raw: '{broken' });
        expect(listJournalDrafts(storage, scope, actor)).toEqual([current]);
    });
});
