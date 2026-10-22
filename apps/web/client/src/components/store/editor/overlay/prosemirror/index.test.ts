import { describe, expect, test } from 'bun:test';
import { EditorState } from 'prosemirror-state';
import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { Slice } from 'prosemirror-model';
import { undo, redo } from 'prosemirror-history';
import { createNodesFromContent, extractContentWithNewlines, isTextInputTransaction, schema, STYLE_ONLY_TRANSACTION, plainTextSchema, createEditorPlugins, plainTextInput } from './index';

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


describe('approved plain-string overlay', () => {
    const mode = 'plain-string-v1' as const;
    const doc = (content: string) => plainTextSchema.node('doc', null,
        plainTextSchema.node('paragraph', null, createNodesFromContent(content, mode)));
    const editor = (content: string) => {
        let state = EditorState.create({ schema: plainTextSchema, doc: doc(content), plugins: createEditorPlugins(undefined, undefined, mode) });
        const view = { get state() { return state; }, dispatch: (tr: Transaction) => { state = state.apply(tr); } } as EditorView;
        return view;
    };
    test('roundtrips exact whitespace as text without hard-break nodes', () => {
        for (const content of ['', '\n', '  Text\t\u00a0 ', '\n\nText\n\n\n', '<br>&nbsp;']) {
            const current = doc(content);
            expect(extractContentWithNewlines(current, mode)).toBe(content);
            expect(current.firstChild?.childCount).toBe(content ? 1 : 0);
            expect(current.firstChild?.firstChild?.isText ?? true).toBe(true);
        }
        expect(plainTextSchema.nodes.hard_break).toBeUndefined();
    });
    test('refuses CR reseeds while allowing clipboard line endings as new LF input', () => {
        for (const input of ['a\rb', 'a\r\nb']) {
            expect(() => doc(input)).toThrow('Carriage returns');
            expect(plainTextInput(input)).toBe('a\nb');
        }
    });
    test('immediate undo never clears seeded content and local undo/redo preserves raw LF', () => {
        const view = editor('First\nSecond');
        expect(undo(view.state, view.dispatch)).toBe(false);
        view.dispatch(view.state.tr.insertText('\n\n', 6));
        const edited = view.state.doc.textContent;
        expect(undo(view.state, view.dispatch)).toBe(true);
        expect(view.state.doc.textContent).toBe('First\nSecond');
        expect(redo(view.state, view.dispatch)).toBe(true);
        expect(view.state.doc.textContent).toBe(edited);
    });
    test('Shift+Enter inserts an LF text character', () => {
        const view = editor('Text');
        const event = { key: 'Enter', keyCode: 13, shiftKey: true, altKey: false, ctrlKey: false, metaKey: false } as KeyboardEvent;
        const handled = view.state.plugins.some(plugin => plugin.props.handleKeyDown?.call(plugin, view, event));
        expect(handled).toBe(true);
        expect(view.state.doc.textContent).toBe('\nText');
        expect(view.state.doc.firstChild?.childCount).toBe(1);
    });
    test('paste inserts only plain text and keeps repeated and edge newlines', () => {
        const view = editor('Text');
        const event = { clipboardData: { getData: (type: string) => type === 'text/plain' ? ' \r\n\r\nPaste\n ' : '<b>Wrong</b>' } } as ClipboardEvent;
        const handled = view.state.plugins.some(plugin => plugin.props.handlePaste?.call(plugin, view, event, Slice.empty));
        expect(handled).toBe(true);
        expect(view.state.doc.textContent).toBe(' \n\nPaste\n Text');
        expect(view.state.doc.childCount).toBe(1);
        expect(view.state.doc.firstChild?.childCount).toBe(1);
    });
});
