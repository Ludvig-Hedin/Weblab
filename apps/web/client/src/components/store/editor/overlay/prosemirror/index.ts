import type { EditorState, Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { baseKeymap } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { Schema } from 'prosemirror-model';

import { isColorEmpty } from '@weblab/utility';

import { ensureFontLoaded } from '@/hooks/use-font-loader';
import { adaptValueToCanvas } from '../utils';

export const schema = new Schema({
    nodes: {
        doc: { content: 'paragraph+' },
        paragraph: {
            content: '(text | hard_break)*',
            toDOM: () => ['p', { style: 'margin: 0; padding: 0;' }, 0],
        },
        text: { inline: true },
        hard_break: {
            inline: true,
            group: 'inline',
            selectable: false,
            toDOM: () => ['br'],
        },
    },
    marks: {
        style: {
            attrs: { style: { default: null } },
            parseDOM: [
                {
                    tag: 'span[style]',
                    getAttrs: (node) => ({
                        style: node.getAttribute('style'),
                    }),
                },
            ],
            toDOM: (mark) => ['span', { style: mark.attrs.style }, 0],
        },
    },
});

export function applyStylesToEditor(editorView: EditorView, styles: Record<string, string>) {
    const { state, dispatch } = editorView;
    const styleMark = state.schema.marks?.style;
    if (!styleMark) {
        console.error('No style mark found');
        return;
    }

    const tr = state.tr.addMark(0, state.doc.content.size, styleMark.create({ style: styles }));
    const fontSizePx = parseFloat(styles.fontSize ?? '');
    const lineHeightPx = parseFloat(styles.lineHeight ?? '');
    const fontSize = Number.isFinite(fontSizePx) ? adaptValueToCanvas(fontSizePx) : null;
    // Skip lineHeight when computed style is non-numeric ("normal", percentages
    // we can't resolve). Forcing `NaNpx` would push the box bigger than the
    // iframe's rendered text and make the edit-mode box visibly grow.
    const lineHeight = Number.isFinite(lineHeightPx) ? adaptValueToCanvas(lineHeightPx) : null;
    const fontFamily = ensureFontLoaded(styles.fontFamily ?? '');

    Object.assign(editorView.dom.style, {
        fontSize: fontSize !== null ? `${fontSize}px` : '',
        lineHeight: lineHeight !== null ? `${lineHeight}px` : '',
        fontWeight: styles.fontWeight,
        fontStyle: styles.fontStyle,
        color: isColorEmpty(styles.color ?? '') ? 'inherit' : styles.color,
        textAlign: styles.textAlign,
        textDecoration: styles.textDecoration,
        letterSpacing: styles.letterSpacing,
        wordSpacing: styles.wordSpacing,
        alignItems: styles.alignItems,
        justifyContent: styles.justifyContent,
        layout: styles.layout,
        display: styles.display,
        backgroundColor: styles.backgroundColor,
        wordBreak: 'break-word',
        overflow: 'visible',
        height: '100%',
        width: '100%',
        boxSizing: 'border-box',
        margin: '0',
        padding: '0',
        fontFamily,
    });
    dispatch(tr);
}

const createLineBreakHandler = () => (state: EditorState, dispatch?: (tr: any) => void) => {
    if (dispatch) {
        const hardBreakNode = state.schema.nodes.hard_break;
        if (hardBreakNode) {
            dispatch(state.tr.replaceSelectionWith(hardBreakNode.create()));
        }
    }
    return true;
};

const createEnterHandler = (onExit: () => void) => (state: EditorState) => {
    onExit();
    return true;
};

export const createEditorPlugins = (onEscape?: () => void, onEnter?: () => void): Plugin[] => [
    history(),
    keymap({
        'Mod-z': undo,
        'Mod-shift-z': redo,
        Escape: () => {
            onEscape?.();
            return !!onEscape;
        },
        Enter: onEnter ? createEnterHandler(onEnter) : () => false,
        'Shift-Enter': createLineBreakHandler(),
    }),
    keymap(baseKeymap),
];
