import { autocompletion } from '@codemirror/autocomplete';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { bracketMatching, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { lintGutter } from '@codemirror/lint';
import { highlightSelectionMatches } from '@codemirror/search';
import { StateEffect, StateField } from '@codemirror/state';
import {
    Decoration,
    drawSelection,
    EditorView,
    highlightActiveLine,
    highlightActiveLineGutter,
    highlightSpecialChars,
    keymap,
    lineNumbers,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { debounce } from 'lodash';

import type { DecorationSet } from '@codemirror/view';
import { errorFixExtensions } from './error-fix';
import { inlineEditField, inlineEditKeymap, inlineEditTheme } from './inline-edit';
import { tabCompleteExtensions } from './tab-complete';

// Custom syntax colors — dark theme uses saturated brights on dark surfaces;
// light theme uses GitHub-light-style darker shades for legibility on white.
const customColors = {
    orange: '#FFAC60',
    purple: '#C478FF',
    blue: '#3FA4FF',
    green: '#1AC69C',
    pink: '#FF32C6',
};

const customLightColors = {
    red: '#d73a49', // keywords
    blue: '#005cc5', // numbers, properties, atoms, attributes
    deepBlue: '#032f62', // strings, regexps
    purple: '#6f42c1', // types, classes, function names
    green: '#22863a', // JSX tags
    gray: '#6a737d', // comments
    near: '#24292e', // operators, punctuation, variables
    orange: '#e36209', // literals
    error: '#cb2431', // invalid
};

// Basic theme for CodeMirror
export const basicTheme = {
    '&': {
        fontSize: '12px',
        backgroundColor: 'transparent',
    },
    '&.cm-focused .cm-selectionBackground, & .cm-selectionBackground': {
        backgroundColor: 'rgba(63, 164, 255, 0.2) !important',
    },
    '.cm-content': {
        lineHeight: '1.5',
    },
};

//dark theme for code editor
export const customDarkTheme = EditorView.theme(
    {
        '&': {
            color: 'var(--foreground)',
            backgroundColor: 'var(--background-canvas)',
            fontSize: '12px',
            userSelect: 'none !important',
        },
        '.cm-content': {
            padding: '10px 0',
            lineHeight: '1.5',
            caretColor: customColors.blue,
            backgroundColor: 'var(--background-canvas)',
            userSelect: 'text !important',
        },
        '.cm-focused': {
            outline: 'none',
        },
        '&.cm-focused .cm-cursor': {
            borderLeftColor: customColors.blue,
            borderLeftWidth: '2px',
        },
        '&.cm-focused .cm-selectionBackground, ::selection': {
            backgroundColor: `${customColors.blue}33`,
        },
        '&.cm-editor.cm-focused .cm-selectionBackground': {
            backgroundColor: `${customColors.blue}33 !important`,
        },
        '&.cm-editor .cm-selectionBackground': {
            backgroundColor: `${customColors.blue}33 !important`,
        },
        '&.cm-editor .cm-content ::selection': {
            backgroundColor: `${customColors.blue}33 !important`,
        },
        '.cm-line ::selection': {
            backgroundColor: `${customColors.blue}33 !important`,
        },
        '::selection': {
            backgroundColor: `${customColors.blue}33 !important`,
        },
        '.cm-selectionBackground': {
            backgroundColor: `${customColors.blue}33`,
        },
        '.cm-gutters': {
            backgroundColor: 'var(--background-bar) !important',
            color: 'var(--foreground-quadranary) !important',
            border: 'none !important',
            borderRight: '1px solid var(--border-bar) !important',
            width: '45px !important',
        },
        '.cm-foldGutter': {
            width: '12px !important',
        },
        '.cm-gutterElement': {
            color: 'var(--foreground-quadranary)',
            width: '12px !important',
        },
        '.cm-lineNumbers .cm-gutterElement': {
            color: 'var(--foreground-quadranary)',
            fontSize: '12px',
        },
        '.cm-activeLine': {
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
        },
        '.cm-activeLineGutter': {
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
        },
        '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
            backgroundColor: 'rgba(63, 164, 255, 0.18)',
            outline: '1px solid rgba(63, 164, 255, 0.35)',
        },
        '.cm-foldPlaceholder': {
            backgroundColor: 'var(--background-secondary)',
            border: '1px solid var(--border)',
            color: customColors.blue,
        },
        // Scrollbar styling
        '.cm-scroller::-webkit-scrollbar': {
            width: '8px',
            height: '8px',
        },
        '.cm-scroller::-webkit-scrollbar-track': {
            backgroundColor: 'var(--background-bar)',
        },
        '.cm-scroller::-webkit-scrollbar-thumb': {
            backgroundColor: 'var(--border-active)',
            borderRadius: '4px',
        },
        '.cm-scroller::-webkit-scrollbar-thumb:hover': {
            backgroundColor: 'var(--border-hover)',
        },
        '.cm-scroller': {
            scrollBehavior: 'smooth',
        },
        '.cm-search-highlight': {
            backgroundColor: 'rgba(138, 194, 255, 0.42)',
        },
        '.cm-element-highlight': {
            backgroundColor: 'rgba(26, 198, 156, 0.2)',
            padding: '0.1735em 0',
            boxDecorationBreak: 'clone',
        },
    },
    { dark: true },
);

// Custom syntax highlighting with the specified colors
export const customDarkHighlightStyle = HighlightStyle.define([
    // Keywords (if, for, function, etc.) - Pink
    { tag: tags.keyword, color: customColors.pink, fontWeight: 'bold' },
    { tag: tags.controlKeyword, color: customColors.pink, fontWeight: 'bold' },
    { tag: tags.operatorKeyword, color: customColors.pink },

    // Strings - Blue
    { tag: tags.string, color: customColors.blue },
    { tag: tags.regexp, color: customColors.blue },

    // Numbers - Pink, bool purple, null pink
    { tag: tags.number, color: customColors.pink },
    { tag: tags.bool, color: customColors.purple },
    { tag: tags.null, color: customColors.pink },

    // Functions - purple and methods - pink
    { tag: tags.function(tags.variableName), color: customColors.purple },
    { tag: tags.function(tags.propertyName), color: customColors.pink },

    // Variables-purple and properties - Green
    { tag: tags.variableName, color: customColors.purple },
    { tag: tags.propertyName, color: customColors.green },
    { tag: tags.attributeName, color: customColors.green },

    // Types and classes - Purple (lighter shade)
    { tag: tags.typeName, color: '#E879F9' },
    { tag: tags.className, color: '#E879F9' },
    { tag: tags.namespace, color: '#E879F9' },

    // Comments - Gray
    { tag: tags.comment, color: '#6b7280', fontStyle: 'italic' },
    { tag: tags.lineComment, color: '#6b7280', fontStyle: 'italic' },
    { tag: tags.blockComment, color: '#6b7280', fontStyle: 'italic' },

    // Operators - White/Light Gray
    { tag: tags.operator, color: '#d1d5db' },
    { tag: tags.punctuation, color: '#d1d5db' },
    { tag: tags.bracket, color: '#d1d5db' },

    // Tags (HTML/JSX) - Pink
    { tag: tags.tagName, color: customColors.pink },
    { tag: tags.angleBracket, color: '#d1d5db' },

    // Special tokens
    { tag: tags.atom, color: customColors.pink },
    { tag: tags.literal, color: customColors.orange },
    { tag: tags.unit, color: customColors.pink },

    // Invalid/Error
    { tag: tags.invalid, color: '#ef4444', textDecoration: 'underline' },
]);

// Light theme for code editor — surface colors come from CSS variables which
// are already theme-aware (--background-canvas / --background-bar / --border-bar
// resolve to white/light in :root). Only theme-specific overrides live here.
export const customLightTheme = EditorView.theme(
    {
        '&': {
            color: 'var(--foreground)',
            backgroundColor: 'var(--background-canvas)',
            fontSize: '12px',
            userSelect: 'none !important',
        },
        '.cm-content': {
            padding: '10px 0',
            lineHeight: '1.5',
            caretColor: customLightColors.blue,
            backgroundColor: 'var(--background-canvas)',
            userSelect: 'text !important',
        },
        '.cm-focused': {
            outline: 'none',
        },
        '&.cm-focused .cm-cursor': {
            borderLeftColor: customLightColors.blue,
            borderLeftWidth: '2px',
        },
        '&.cm-focused .cm-selectionBackground, ::selection': {
            backgroundColor: `${customLightColors.blue}26`,
        },
        '&.cm-editor.cm-focused .cm-selectionBackground': {
            backgroundColor: `${customLightColors.blue}26 !important`,
        },
        '&.cm-editor .cm-selectionBackground': {
            backgroundColor: `${customLightColors.blue}26 !important`,
        },
        '&.cm-editor .cm-content ::selection': {
            backgroundColor: `${customLightColors.blue}26 !important`,
        },
        '.cm-line ::selection': {
            backgroundColor: `${customLightColors.blue}26 !important`,
        },
        '::selection': {
            backgroundColor: `${customLightColors.blue}26 !important`,
        },
        '.cm-selectionBackground': {
            backgroundColor: `${customLightColors.blue}26`,
        },
        '.cm-gutters': {
            backgroundColor: 'var(--background-bar) !important',
            color: 'var(--foreground-quadranary) !important',
            border: 'none !important',
            borderRight: '1px solid var(--border-bar) !important',
            width: '45px !important',
        },
        '.cm-foldGutter': {
            width: '12px !important',
        },
        '.cm-gutterElement': {
            color: 'var(--foreground-quadranary)',
            width: '12px !important',
        },
        '.cm-lineNumbers .cm-gutterElement': {
            color: 'var(--foreground-quadranary)',
            fontSize: '12px',
        },
        '.cm-activeLine': {
            backgroundColor: 'rgba(0, 0, 0, 0.03)',
        },
        '.cm-activeLineGutter': {
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
        },
        '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
            backgroundColor: 'rgba(3, 47, 98, 0.12)',
            outline: '1px solid rgba(3, 47, 98, 0.25)',
        },
        '.cm-foldPlaceholder': {
            backgroundColor: 'var(--background-secondary)',
            border: '1px solid var(--border)',
            color: customLightColors.blue,
        },
        // Scrollbar styling — same shape as dark, surfaces come from tokens
        '.cm-scroller::-webkit-scrollbar': {
            width: '8px',
            height: '8px',
        },
        '.cm-scroller::-webkit-scrollbar-track': {
            backgroundColor: 'var(--background-bar)',
        },
        '.cm-scroller::-webkit-scrollbar-thumb': {
            backgroundColor: 'var(--border-active)',
            borderRadius: '4px',
        },
        '.cm-scroller::-webkit-scrollbar-thumb:hover': {
            backgroundColor: 'var(--border-hover)',
        },
        '.cm-scroller': {
            scrollBehavior: 'smooth',
        },
        '.cm-search-highlight': {
            backgroundColor: 'rgba(255, 196, 0, 0.35)',
        },
        '.cm-element-highlight': {
            backgroundColor: 'rgba(34, 134, 58, 0.18)',
            padding: '0.1735em 0',
            boxDecorationBreak: 'clone',
        },
    },
    { dark: false },
);

// Light syntax highlighting — GitHub-light-style palette tuned for white bg.
export const customLightHighlightStyle = HighlightStyle.define([
    // Keywords
    { tag: tags.keyword, color: customLightColors.red, fontWeight: 'bold' },
    { tag: tags.controlKeyword, color: customLightColors.red, fontWeight: 'bold' },
    { tag: tags.operatorKeyword, color: customLightColors.red },

    // Strings & regexps
    { tag: tags.string, color: customLightColors.deepBlue },
    { tag: tags.regexp, color: customLightColors.deepBlue },

    // Numbers / bool / null
    { tag: tags.number, color: customLightColors.blue },
    { tag: tags.bool, color: customLightColors.blue },
    { tag: tags.null, color: customLightColors.blue },

    // Functions
    { tag: tags.function(tags.variableName), color: customLightColors.purple },
    { tag: tags.function(tags.propertyName), color: customLightColors.purple },

    // Variables & properties
    { tag: tags.variableName, color: customLightColors.near },
    { tag: tags.propertyName, color: customLightColors.blue },
    { tag: tags.attributeName, color: customLightColors.blue },

    // Types and classes
    { tag: tags.typeName, color: customLightColors.purple },
    { tag: tags.className, color: customLightColors.purple },
    { tag: tags.namespace, color: customLightColors.purple },

    // Comments
    { tag: tags.comment, color: customLightColors.gray, fontStyle: 'italic' },
    { tag: tags.lineComment, color: customLightColors.gray, fontStyle: 'italic' },
    { tag: tags.blockComment, color: customLightColors.gray, fontStyle: 'italic' },

    // Operators / punctuation
    { tag: tags.operator, color: customLightColors.near },
    { tag: tags.punctuation, color: customLightColors.near },
    { tag: tags.bracket, color: customLightColors.near },

    // Tags (HTML/JSX)
    { tag: tags.tagName, color: customLightColors.green },
    { tag: tags.angleBracket, color: customLightColors.near },

    // Special tokens
    { tag: tags.atom, color: customLightColors.blue },
    { tag: tags.literal, color: customLightColors.orange },
    { tag: tags.unit, color: customLightColors.blue },

    // Invalid/Error
    { tag: tags.invalid, color: customLightColors.error, textDecoration: 'underline' },
]);

const searchHighlightEffect = StateEffect.define<{ term: string }>();
const clearHighlightEffect = StateEffect.define();

const searchHighlightField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(decorations, tr) {
        decorations = decorations.map(tr.changes);

        for (const effect of tr.effects) {
            if (effect.is(searchHighlightEffect)) {
                const { term } = effect.value;
                if (!term || term.length < 2) {
                    decorations = Decoration.none;
                    continue;
                }

                const content = tr.state.doc.toString();
                const termLower = term.toLowerCase();
                const contentLower = content.toLowerCase();
                const newDecorations = [];

                let index = 0;
                while ((index = contentLower.indexOf(termLower, index)) !== -1) {
                    const from = index;
                    const to = index + term.length;
                    newDecorations.push(
                        Decoration.mark({
                            class: 'cm-search-highlight',
                        }).range(from, to),
                    );
                    index = to;
                }

                decorations = Decoration.set(newDecorations);
            } else if (effect.is(clearHighlightEffect)) {
                decorations = Decoration.none;
            }
        }

        return decorations;
    },
    provide: (f) => EditorView.decorations.from(f),
});

export function createSearchHighlight(term: string) {
    return searchHighlightEffect.of({ term });
}

export function clearSearchHighlight() {
    return clearHighlightEffect.of(null);
}

// Element highlighting effects
const elementHighlightEffect = StateEffect.define<{
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
}>();
const clearElementHighlightEffect = StateEffect.define();

const elementHighlightField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(decorations, tr) {
        decorations = decorations.map(tr.changes);

        for (const effect of tr.effects) {
            if (effect.is(elementHighlightEffect)) {
                const { startLine, startCol, endLine, endCol } = effect.value;

                // Convert line/column to document positions (0-indexed)
                const doc = tr.state.doc;

                // Clamp line numbers to valid range (1 through doc.lines)
                const clampedStartLine = Math.max(1, Math.min(startLine, doc.lines));
                const clampedEndLine = Math.max(1, Math.min(endLine, doc.lines));

                const startLineObj = doc.line(clampedStartLine);
                const endLineObj = doc.line(clampedEndLine);

                // Clamp column positions to valid range (1 through line length + 1)
                const clampedStartCol = Math.max(1, Math.min(startCol, startLineObj.length + 1));
                const clampedEndCol = Math.max(1, Math.min(endCol, endLineObj.length + 1));

                const startPos = startLineObj.from + clampedStartCol - 1;
                const endPos = endLineObj.from + clampedEndCol;

                // Ensure positions are within document bounds
                const validStartPos = Math.max(0, Math.min(startPos, doc.length));
                const validEndPos = Math.max(validStartPos, Math.min(endPos, doc.length));

                decorations = Decoration.set([
                    Decoration.mark({
                        class: 'cm-element-highlight',
                    }).range(validStartPos, validEndPos),
                ]);
            } else if (effect.is(clearElementHighlightEffect)) {
                decorations = Decoration.none;
            }
        }

        return decorations;
    },
    provide: (f) => EditorView.decorations.from(f),
});

export function highlightElementRange(
    startLine: number,
    startCol: number,
    endLine: number,
    endCol: number,
) {
    // CodeMirror is 0-indexed, so we need to add 1 to the start and end columns
    return elementHighlightEffect.of({
        startLine,
        startCol: startCol + 1,
        endLine,
        endCol: endCol + 1,
    });
}

export function clearElementHighlight() {
    return clearElementHighlightEffect.of(null);
}

export const scrollToLineColumn = debounce(undebounceScrollToLineColumn, 100, { leading: true });

function undebounceScrollToLineColumn(view: EditorView, line: number, column: number): void {
    const doc = view.state.doc;

    // Ensure line number is within bounds (1-indexed to 0-indexed)
    const lineNum = Math.max(1, Math.min(line, doc.lines));
    const docLine = doc.line(lineNum);

    // Ensure column is within line bounds (1-indexed to 0-indexed)
    const colNum = Math.max(1, Math.min(column, docLine.length + 1));
    const pos = docLine.from + colNum - 1;

    // Scroll to position with center alignment
    view.dispatch({
        effects: EditorView.scrollIntoView(pos, {
            y: 'center',
        }),
    });
}

export function scrollToFirstMatch(view: EditorView, term: string): boolean {
    if (!term || term.length < 2) return false;

    const content = view.state.doc.toString();
    const termLower = term.toLowerCase();
    const contentLower = content.toLowerCase();

    const firstMatch = contentLower.indexOf(termLower);
    if (firstMatch !== -1) {
        const pos = firstMatch;
        view.dispatch({
            effects: EditorView.scrollIntoView(pos, {
                y: 'center',
            }),
        });
        return true;
    }

    return false;
}

export const getBasicSetup = (saveFile: () => void, isDark = true) => {
    const baseExtensions = [
        highlightActiveLine(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        drawSelection(),
        bracketMatching(),
        autocompletion(),
        highlightSelectionMatches(),
        lintGutter(),
        lineNumbers(),
        searchHighlightField,
        elementHighlightField,
        keymap.of([
            {
                key: 'Mod-s',
                run: () => {
                    saveFile();
                    return true;
                },
            },
        ]),

        // Cmd+K inline edit + error-fix gutter + Tab autocomplete extensions.
        // Order matters: inlineEditKeymap is placed before the default keymap
        // so Mod-k and Escape are captured before any other handler.
        inlineEditField,
        inlineEditTheme,
        inlineEditKeymap,
        ...errorFixExtensions(),
        ...tabCompleteExtensions(),

        isDark ? customDarkTheme : customLightTheme,
        syntaxHighlighting(isDark ? customDarkHighlightStyle : customLightHighlightStyle),
    ];

    return baseExtensions;
};

// Get language extensions for CodeMirror based on file type
export function getLanguageFromFileName(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
        case 'js':
            return 'javascript';
        case 'jsx':
            return 'javascript';
        case 'ts':
            return 'typescript';
        case 'tsx':
            return 'typescript';
        case 'css':
            return 'css';
        case 'html':
            return 'html';
        case 'json':
            return 'json';
        case 'md':
            return 'markdown';
        default:
            return 'typescript';
    }
}

// Get CodeMirror extensions based on file language
export function getExtensions(language: string): any[] {
    switch (language) {
        case 'javascript':
            return [javascript({ jsx: true })];
        case 'typescript':
            return [javascript({ jsx: true, typescript: true })];
        case 'css':
            return [css()];
        case 'html':
            return [html()];
        case 'json':
            return [json()];
        case 'markdown':
            return [markdown()];
        default:
            return [javascript({ jsx: true, typescript: true })];
    }
}
