import { describe, expect, it } from 'bun:test';
import { draftKey, emptyItemState, receiveItem } from '../app/project/[id]/_components/cms-workspace/item-editor-state';

const item = { slug: 'post', status: 'draft' as const, values: { title: 'Saved' }, revision: 1 };
describe('CMS live draft state', () => {
    it('keeps dirty edits and the captured revision when a newer saved item arrives', () => {
        const loaded = receiveItem(emptyItemState('post'), item);
        const dirty = { ...loaded, draft: { ...loaded.draft, values: { title: 'Unsaved' } } };
        const next = receiveItem(dirty, { ...item, revision: 2, values: { title: 'Peer' } });
        expect(next.draft.values).toEqual({ title: 'Unsaved' });
        expect(next.revision).toBe(1); expect(next.conflict).toBe(true);
        expect(next.baseline).toBe(loaded.baseline);
    });
    it('reloads only explicitly when dirty and accepts clean live updates', () => {
        const loaded = receiveItem(emptyItemState('post'), item);
        const dirty = { ...loaded, draft: { ...loaded.draft, slug: 'mine' } };
        const peer = { ...item, revision: 2, slug: 'peer' };
        expect(receiveItem(dirty, peer, true).draft.slug).toBe('peer');
        expect(receiveItem(loaded, peer).revision).toBe(2);
    });
    it('preserves dirty content when the item is deleted or its revision is invalid', () => {
        const loaded = receiveItem(emptyItemState('post'), item);
        const dirty = { ...loaded, draft: { ...loaded.draft, values: { title: 'Unsaved' } } };
        expect(receiveItem(dirty, null)).toMatchObject({ missing: true, draft: dirty.draft });
        expect(receiveItem(dirty, { ...item, revision: NaN })).toMatchObject({ conflict: true, draft: dirty.draft });
    });
    it('does not mistake key ordering for an unsaved edit', () => {
        expect(draftKey({ a: 1, b: 2 })).toBe(draftKey({ b: 2, a: 1 }));
    });
    it('refuses malformed saved values without replacing the local draft', () => {
        const loaded = receiveItem(emptyItemState('post'), item);
        expect(receiveItem(loaded, { ...item, values: [] })).toMatchObject({ conflict: true, draft: loaded.draft });
    });
});
