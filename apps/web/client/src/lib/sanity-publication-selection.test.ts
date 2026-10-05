import { expect, test } from 'bun:test';
import { contentStatusSchema, matchesPublicationPin, publicationPin, togglePublicationSelection } from './sanity-publication-selection';
import type { PublicationDraft } from './sanity-publication-selection';

const row: PublicationDraft = { id: 'draft-one', documentId: 'published-one', title: 'Title', slug: 'title', revision: 2, providerRevision: 'provider-one', archived: false };

test('selection retains exact revisions across pages and refuses silent refresh', () => {
    const selected = togglePublicationSelection([], row, true);
    const newer = { ...row, revision: 3, archived: true };
    expect(matchesPublicationPin(newer, selected[0]!)).toBe(false);
    expect(togglePublicationSelection(selected, newer, true)).toBe(selected);
    const removed = togglePublicationSelection(selected, newer, false);
    expect(togglePublicationSelection(removed, newer, true)).toEqual([publicationPin(newer)]);
    expect(togglePublicationSelection(selected, { ...row, id: 'another' }, false)).toEqual(selected);
});

test('selection limits changes without losing selections from other pages', () => {
    const pins = Array.from({ length: 8 }, (_, i) => publicationPin({ ...row, id: `draft-${i}` }));
    expect(() => togglePublicationSelection(pins, row, true)).toThrow('eight');
    expect(togglePublicationSelection(pins, { ...row, id: 'draft-3' }, false)).toHaveLength(7);
});

test('public content status refuses raw content and private paths', () => {
    expect(contentStatusSchema.parse({ status: 'absent' })).toEqual({ status: 'absent' });
    const ready = { status: 'complete' as const, manifestHash: 'a'.repeat(64), captureId: '5ba88f8f-851f-43d4-9caa-34c594a3b417', contentHash: 'b'.repeat(64), draftHash: 'c'.repeat(64), selectedCount: 1,
        connectionId: 'connection-one', connectionRevision: 1, selections: [publicationPin(row)], quoteFormUnavailable: true as const };
    expect(contentStatusSchema.parse(ready)).toEqual(ready);
    expect(contentStatusSchema.safeParse({ ...ready, rootPath: '/customer' }).success).toBe(false);
    expect(contentStatusSchema.safeParse({ ...ready, evidence: { documents: [] } }).success).toBe(false);
    expect(contentStatusSchema.safeParse({ ...ready, quoteFormUnavailable: false }).success).toBe(false);
});
