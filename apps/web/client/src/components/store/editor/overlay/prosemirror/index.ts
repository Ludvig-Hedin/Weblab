import type { EditorState, Transaction } from 'prosemirror-state';
import { Plugin } from 'prosemirror-state';
import type { TextRenderMode } from '@weblab/models';
import type { EditorView } from 'prosemirror-view';
import { baseKeymap } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { Schema, type Node as ProseMirrorNode } from 'prosemirror-model';

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

/** A React string is one textblock; CSS, not BR nodes, determines its line layout. */
export const plainTextSchema = new Schema({
    nodes: {
        doc: { content: 'paragraph' },
        paragraph: { content: 'text*', whitespace: 'pre',
            toDOM: () => ['p', { style: 'margin: 0; padding: 0;' }, 0] },
        text: { inline: true },
    },
    marks: schema.spec.marks,
});

export function textEditorSchema(mode: TextRenderMode = 'legacy'): Schema {
    return mode === 'plain-string-v1' ? plainTextSchema : schema;
}

/** New clipboard input may canonicalize line endings; saved source and reseeds must not. */
export function plainTextInput(content: string): string {
    return content.replace(/\r\n?/g, '\n');
}

/** Preserve empty lines as breaks without constructing invalid empty text nodes. */
export function createNodesFromContent(content: string, mode: TextRenderMode = 'legacy'): ProseMirrorNode[] {
    if (mode === 'plain-string-v1') {
        if (content.includes('\r')) throw new Error('Carriage returns cannot be seeded into the plain text editor.');
        return content ? [plainTextSchema.text(content)] : [];
    }
    const nodes: ProseMirrorNode[] = [];
    const lines = content.split('\n');
    for (const [index, line] of lines.entries()) {
        if (index > 0) nodes.push(schema.node('hard_break'));
        if (line) nodes.push(schema.text(line));
    }
    return nodes;
}

/** Pasted paragraphs and Shift+Enter breaks both represent a source newline. */
export function extractContentWithNewlines(doc: ProseMirrorNode, mode: TextRenderMode = 'legacy'): string {
    if (mode === 'plain-string-v1') {
        if (doc.type.schema !== plainTextSchema || doc.childCount !== 1) throw new Error('Invalid plain text document.');
        const content = doc.textContent;
        if (content.includes('\r')) throw new Error('Carriage returns are unsupported in the plain text editor.');
        return content;
    }
    return doc.textBetween(0, doc.content.size, '\n', '\n');
}

export const STYLE_ONLY_TRANSACTION = 'weblab-style-only';

export function isTextInputTransaction(transaction: Transaction): boolean {
    return transaction.docChanged && !transaction.getMeta(STYLE_ONLY_TRANSACTION);
}

export function applyStylesToEditor(editorView: EditorView, styles: Record<string, string>, mode: TextRenderMode = 'legacy') {
    const { state, dispatch } = editorView;
    const styleMark = state.schema.marks?.style;
    if (!styleMark) {
        console.error('No style mark found');
        return;
    }

    const tr = state.tr.addMark(0, state.doc.content.size, styleMark.create({ style: styles }));
    tr.setMeta(STYLE_ONLY_TRANSACTION, true).setMeta('addToHistory', false);
    const fontSizePx = parseFloat(styles.fontSize ?? '');
    const lineHeightPx = parseFloat(styles.lineHeight ?? '');
    const fontSize = Number.isFinite(fontSizePx) ? adaptValueToCanvas(fontSizePx) : null;
    // Skip lineHeight when computed style is non-numeric ("normal", percentages
    // we can't resolve). Forcing `NaNpx` would push the box bigger than the
    // iframe's rendered text and make the edit-mode box visibly grow.
    const lineHeight = Number.isFinite(lineHeightPx) ? adaptValueToCanvas(lineHeightPx) : null;
    // Keep the element's full font stack: its @font-face fonts are registered
    // in this document when editing starts (see text/fonts.ts). Only fall back
    // to a Google Fonts guess of the first family, after the real stack.
    const rawFontFamily = styles.fontFamily ?? '';
    const googleFamily = ensureFontLoaded(rawFontFamily);
    const fontFamily = [rawFontFamily, googleFamily ? `"${googleFamily}"` : '']
        .filter(Boolean)
        .join(', ');

    Object.assign(editorView.dom.style, {
        fontSize: fontSize !== null ? `${fontSize}px` : '',
        lineHeight: lineHeight !== null ? `${lineHeight}px` : '',
        fontWeight: styles.fontWeight,
        fontStyle: styles.fontStyle,
        fontStretch: styles.fontStretch ?? '',
        fontVariant: styles.fontVariant ?? '',
        fontFeatureSettings: styles.fontFeatureSettings ?? '',
        fontVariationSettings: styles.fontVariationSettings ?? '',
        fontKerning: styles.fontKerning ?? '',
        fontOpticalSizing: styles.fontOpticalSizing ?? '',
        color: isColorEmpty(styles.color ?? '') ? 'inherit' : styles.color,
        textAlign: styles.textAlign,
        textTransform: styles.textTransform ?? '',
        textIndent: scalePx(styles.textIndent),
        textDecoration: styles.textDecoration,
        textShadow: styles.textShadow ?? '',
        letterSpacing: scalePx(styles.letterSpacing),
        wordSpacing: scalePx(styles.wordSpacing),
        backgroundColor: styles.backgroundColor,
        wordBreak: 'break-word',
        overflow: 'hidden',
        height: '100%',
        width: '100%',
        boxSizing: 'border-box',
        margin: '0',
        // The overlay box is the element's border box; inset the text by the
        // element's own padding so lines start where they do on the canvas.
        padding: '0',
        paddingTop: scalePx(styles.paddingTop) || '0',
        paddingRight: scalePx(styles.paddingRight) || '0',
        paddingBottom: scalePx(styles.paddingBottom) || '0',
        paddingLeft: scalePx(styles.paddingLeft) || '0',
        fontFamily,
        ...(mode === 'plain-string-v1' ? { whiteSpace: styles.whiteSpace || 'normal',
            tabSize: styles.tabSize ?? '',
            ...(styles.whiteSpaceCollapse ? { whiteSpaceCollapse: styles.whiteSpaceCollapse } : {}),
            ...(styles.textWrapMode ? { textWrapMode: styles.textWrapMode } : {}) } : {}),
    });
    dispatch(tr);
}

/** Scale a computed `Npx` length to canvas zoom; pass other values through. */
function scalePx(value: string | undefined): string {
    if (!value) {
        return '';
    }
    const match = /^(-?[\d.]+)px$/.exec(value.trim());
    if (!match) {
        return value;
    }
    return `${adaptValueToCanvas(parseFloat(match[1] ?? '0'))}px`;
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

const plainTextClipboard = () => new Plugin({
    props: {
        handlePaste(view, event) {
            const content = event.clipboardData?.getData('text/plain');
            if (content) view.dispatch(view.state.tr.insertText(plainTextInput(content)).scrollIntoView());
            // No HTML or multi-paragraph fallback in the single-string contract.
            return true;
        },
        handleDrop(view, event, _slice, moved) {
            if (moved) return false; // Internal moves already have the plain schema.
            const content = event.dataTransfer?.getData('text/plain');
            const point = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (content && point) view.dispatch(view.state.tr.insertText(plainTextInput(content), point.pos).scrollIntoView());
            return true;
        },
    },
});

export const createEditorPlugins = (onEscape?: () => void, onEnter?: () => void, mode: TextRenderMode = 'legacy'): Plugin[] => [
    ...(mode === 'plain-string-v1' ? [plainTextClipboard()] : []),
    history(),
    keymap({
        'Mod-z': undo,
        'Mod-shift-z': redo,
        Escape: () => {
            onEscape?.();
            return !!onEscape;
        },
        Enter: onEnter ? createEnterHandler(onEnter) : () => false,
        'Shift-Enter': mode === 'plain-string-v1' ? (state, dispatch) => {
            dispatch?.(state.tr.insertText('\n'));
            return true;
        } : createLineBreakHandler(),
    }),
    keymap(baseKeymap),
];
