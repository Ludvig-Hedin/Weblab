import { describe, expect, it } from 'bun:test';
import type { CloudJournalDraft } from './journal-drafts';
import { acknowledgeJournalDraft } from './journal-state';

const original: CloudJournalDraft['item'] = {
    key: 'journal_entry_0001', slug: 'story', revision: 3, status: 'draft', archived: false,
    values: { title: 'Story', excerpt: '', body: 'Saved body' },
};
const submitted: CloudJournalDraft = {
    version: 1, projectId: 'project-one', branchId: 'branch-one', actorId: 'actor-one', generation: 2,
    writerId: 'writer_0000000001', changeId: 'change_0000000001', updatedAt: 1, ancestors: [], original,
    item: { ...original, values: { ...original.values, body: 'Confirmed body' } },
};
const owner = JSON.stringify([submitted.projectId, submitted.branchId, submitted.actorId]);

describe('Journal confirmed draft acknowledgment', () => {
    it('closes the exact saved draft instead of retaining its old revision against the subscription', () => {
        const saved = { ...submitted.item, revision: 4, status: 'ready' as const };
        expect(saved.revision).not.toBe(submitted.original.revision);
        expect(acknowledgeJournalDraft(submitted, submitted, owner)).toBeNull();
    });
    it('retains later typing and a reopened draft when an earlier receipt resolves', () => {
        const newer = { ...submitted, changeId: 'change_0000000002', item: {
            ...submitted.item, values: { ...submitted.item.values, body: 'More typing' },
        } };
        expect(acknowledgeJournalDraft(newer, submitted, owner)).toBe(newer);
        const reopened = structuredClone(submitted);
        expect(acknowledgeJournalDraft(reopened, submitted, owner)).toBe(reopened);
    });
    it('does not close a retained draft after actor, project or branch changes', () => {
        for (const currentOwner of [null,
            JSON.stringify(['project-two', submitted.branchId, submitted.actorId]),
            JSON.stringify([submitted.projectId, 'branch-two', submitted.actorId]),
            JSON.stringify([submitted.projectId, submitted.branchId, 'actor-two']),
        ]) expect(acknowledgeJournalDraft(submitted, submitted, currentOwner)).toBe(submitted);
        expect(acknowledgeJournalDraft(null, submitted, owner)).toBeNull();
    });
});
