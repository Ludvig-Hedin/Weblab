import { describe, expect, test } from 'bun:test';

import { EditorAttributes } from '@weblab/constants';
import { CodeActionType, type CodeInsert } from '@weblab/models';

import { getOidFromJsxElement } from 'src/code-edit/helpers';
import { createInsertedElement } from 'src/code-edit/insert';

describe('createInsertedElement', () => {
    // Regression guard for the paste oid flow. The copied code block carries the
    // SOURCE element's data-weblab-id, but the pasted element MUST receive a
    // fresh oid — otherwise the source and the paste share an oid and the editor
    // can no longer resolve the pasted element ("duplicate oid"). Correctness
    // relies on `getAstFromCodeblock(code, /* stripIds */ true)` removing the
    // source id before the fresh oid is added. This test pins that behavior so a
    // future change to the strip flag (or the add/replace order) can't silently
    // regress it.
    test('paste assigns the fresh oid, not the source oid embedded in the code block', () => {
        const SOURCE_OID = 'source-oid-aaaaaaaa';
        const NEW_OID = 'new-oid-bbbbbbbb';

        const insert: CodeInsert = {
            type: CodeActionType.INSERT,
            oid: NEW_OID,
            tagName: 'div',
            attributes: {},
            textContent: null,
            codeBlock: `<div ${EditorAttributes.DATA_WEBLAB_ID}="${SOURCE_OID}">hi</div>`,
            pasteParams: { oid: NEW_OID, domId: 'dom-new' },
            children: [],
            location: { type: 'append', targetDomId: 'target-dom', targetOid: null },
        };

        const element = createInsertedElement(insert);
        const resolvedOid = getOidFromJsxElement(element.openingElement);

        expect(resolvedOid).toBe(NEW_OID);
        expect(resolvedOid).not.toBe(SOURCE_OID);
    });

    // Without a code block the element is built from scratch and the fresh oid is
    // applied directly — guards the simpler create path too.
    test('non-paste insert (no code block) still carries the fresh oid', () => {
        const NEW_OID = 'new-oid-cccccccc';
        const insert: CodeInsert = {
            type: CodeActionType.INSERT,
            oid: NEW_OID,
            tagName: 'div',
            attributes: { [EditorAttributes.DATA_WEBLAB_ID]: NEW_OID },
            textContent: 'hello',
            codeBlock: null,
            pasteParams: null,
            children: [],
            location: { type: 'append', targetDomId: 'target-dom', targetOid: null },
        };

        const element = createInsertedElement(insert);
        expect(getOidFromJsxElement(element.openingElement)).toBe(NEW_OID);
    });
});
