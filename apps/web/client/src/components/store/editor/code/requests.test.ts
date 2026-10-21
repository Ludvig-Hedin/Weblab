import { describe, expect, test } from 'bun:test';
import { getEditTextRequests, processGroupedRequests } from './requests';
import { getAstFromContent, getContentFromAst } from '@weblab/parser';
import type { CodeDiffRequest, EditTextAction } from '@weblab/models';

const action: EditTextAction = {
    type: 'edit-text',
    targets: [{ oid: 'heading', domId: 'heading', branchId: 'branch', frameId: 'frame' }],
    originalContent: 'Hello world', newContent: 'Hello world', textSlots: [],
};

describe('explicit rich text protocol', () => {
    test('an unchanged rich edit never falls back to flattened text', async () => {
        expect(await getEditTextRequests(action)).toEqual([]);
    });

    test('an explicit empty source slot request preserves inline markup without duplication', async () => {
        const content = 'export function Page(){return <h1 data-oid="heading">Hello <span data-oid="line">world</span>{/* keep */}</h1>}';
        const request: CodeDiffRequest = {
            oid: 'heading', branchId: 'branch', attributes: {}, tagName: null,
            textContent: 'Hello world', textSlots: [], overrideClasses: null, structureChanges: [],
        };
        const diffs = await processGroupedRequests(new Map([['page.tsx', { content, oidToRequest: new Map([['heading', request]]) }]]));
        const ast = getAstFromContent(content);
        if (!ast) throw new Error('Invalid fixture');
        expect(diffs[0]?.generated).toBe(await getContentFromAst(ast, content));
    });
});
