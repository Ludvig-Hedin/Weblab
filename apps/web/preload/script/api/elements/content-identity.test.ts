import { expect, test } from 'bun:test';
import { EditorAttributes } from '@weblab/constants';
import { getContentIdentity } from './content-identity';

const leaf = (mappingId: string | null, itemId: string | null) => ({
    getAttribute: (key: string) => key === EditorAttributes.DATA_WEBLAB_CONTENT_MAP ? mappingId
        : key === EditorAttributes.DATA_WEBLAB_CONTENT_ITEM ? itemId : null,
});

test('records only complete bounded leaf hints and keeps repeated renderer records distinct', () => {
    expect(getContentIdentity(leaf('stilta-home-faq', 'audience'))).toEqual({ mappingId: 'stilta-home-faq', itemId: 'audience' });
    expect(getContentIdentity(leaf('stilta-home-faq', 'privacy'))).toEqual({ mappingId: 'stilta-home-faq', itemId: 'privacy' });
    for (const [mapping, item] of [[null, 'audience'], ['map', null], ['', 'id'], ['a'.repeat(161), 'id'], ['map', 'a'.repeat(161)], ['map', 'id\n'], ['../map', 'id']]) {
        expect(getContentIdentity(leaf(mapping ?? null, item ?? null))).toBeUndefined();
    }
});
