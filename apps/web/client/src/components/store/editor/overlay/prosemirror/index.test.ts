import { describe, expect, test } from 'bun:test';
import { EditorState } from 'prosemirror-state';
import { createNodesFromContent, extractContentWithNewlines, isTextInputTransaction, schema, STYLE_ONLY_TRANSACTION } from './index';

describe('inline text line breaks', () => {
    test('pasted paragraphs retain their boundary when extracted for saving', () => {
        const doc = schema.node('doc', null, [
            schema.node('paragraph', null, schema.text('Built together.')),
            schema.node('paragraph', null, schema.text('Saved in the cloud.')),
        ]);
        expect(extractContentWithNewlines(doc)).toBe('Built together.\nSaved in the cloud.');
    });

    test('hard breaks and blank paragraphs retain distinct newlines', () => {
        const doc = schema.node('doc', null, [
            schema.node('paragraph', null, [schema.text('First'), schema.node('hard_break'), schema.text('Second')]),
            schema.node('paragraph'),
            schema.node('paragraph', null, schema.text('Fourth')),
        ]);
        expect(extractContentWithNewlines(doc)).toBe('First\nSecond\n\nFourth');
    });

    test('leading, trailing and repeated blank lines round trip without empty text nodes', () => {
        for (const content of ['', '\n', '\nHeading', '\n\nHeading\n', 'First\n\nThird']) {
            const doc = schema.node('doc', null, schema.node('paragraph', null, createNodesFromContent(content)));
            expect(extractContentWithNewlines(doc)).toBe(content);
        }
    });
});

describe('inline text transaction admission', () => {
    const state = () => EditorState.create({ schema,
        doc: schema.node('doc', null, [schema.node('paragraph', null, schema.text('Heading'))]) });

    test('a style-only mark does not become a text edit', () => {
        const current = state();
        const transaction = current.tr.addMark(1, 8, schema.marks.style!.create({ style: { fontFamily: 'Inter' } }))
            .setMeta(STYLE_ONLY_TRANSACTION, true);
        expect(transaction.docChanged).toBe(true);
        expect(isTextInputTransaction(transaction)).toBe(false);
    });

    test('typed text and hard breaks still become text edits', () => {
        const current = state();
        expect(isTextInputTransaction(current.tr.insertText('New ', 1))).toBe(true);
        expect(isTextInputTransaction(current.tr.insert(3, schema.nodes.hard_break!.create()))).toBe(true);
        expect(isTextInputTransaction(current.tr)).toBe(false);
    });
});
