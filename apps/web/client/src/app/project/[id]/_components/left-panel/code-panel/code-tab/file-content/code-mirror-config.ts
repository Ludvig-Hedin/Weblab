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

// Editor palette — deliberately blue-free. Neutral ink carries most of the
// text; three warm/cool accents (peach, mint, lilac) mark structure so code
// reads calm next to the monochrome app chrome. Light mode uses deeper shades
// of the same hues so both themes feel like one family.
type SyntaxPalette = {
    text: string;
    muted: string;
    comment: string;
    keyword: string;
    fn: string;
    string: string;
    number: string;
    property: string;
    heading: string;
    invalid: string;
};

const darkSyntax: SyntaxPalette = {
    text: '#e6e6e6',
    muted: '#8a8a8a',
    comment: '#6b6b6b',
    keyword: '#b4b4b4',
    fn: '#ffc799',
    string: '#99e6cf',
    number: '#ffab85',
    property: '#cbb8ff',
    heading: '#ffffff',
    invalid: '#ff7a7a',
};

const lightSyntax: SyntaxPalette = {
    text: '#1f1f1f',
    muted: '#737373',
    comment: '#9a9a9a',
    keyword: '#555555',
    fn: '#a4520a',
    string: '#0f7564',
    number: '#c2410c',
    property: '#6d3fd1',
    heading: '#0d0d0d',
    invalid: '#c62828',
};

const MONO_FONT =
    'ui-monospace, "SF Mono", SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace';

type SurfaceTokens = {
    selection: string;
    activeLine: string;
    lineNumber: string;
    lineNumberActive: string;
    bracket: string;
    searchMatch: string;
    elementMatch: string;
    scrollThumb: string;
    scrollThumbHover: string;
};

const darkSurface: SurfaceTokens = {
    selection: 'rgba(255, 255, 255, 0.13)',
    activeLine: 'rgba(255, 255, 255, 0.025)',
    lineNumber: '#4a4a4a',
    lineNumberActive: '#b2b2b2',
    bracket: 'rgba(255, 255, 255, 0.28)',
    searchMatch: 'rgba(255, 199, 153, 0.28)',
    elementMatch: 'rgba(153, 230, 207, 0.14)',
    scrollThumb: 'rgba(255, 255, 255, 0.1)',
    scrollThumbHover: 'rgba(255, 255, 255, 0.18)',
};

const lightSurface: SurfaceTokens = {
    selection: 'rgba(0, 0, 0, 0.09)',
    activeLine: 'rgba(0, 0, 0, 0.025)',
    lineNumber: '#c4c4c4',
    lineNumberActive: '#5c5c5c',
    bracket: 'rgba(0, 0, 0, 0.3)',
    searchMatch: 'rgba(234, 150, 60, 0.28)',
    elementMatch: 'rgba(15, 117, 100, 0.12)',
    scrollThumb: 'rgba(0, 0, 0, 0.12)',
    scrollThumbHover: 'rgba(0, 0, 0, 0.22)',
};

const buildEditorTheme = (syntax: SyntaxPalette, surface: SurfaceTokens, dark: boolean) =>
    EditorView.theme(
        {
            '&': {
                color: syntax.text,
                backgroundColor: 'var(--background-canvas)',
                fontSize: '13px',
                height: '100%',
                userSelect: 'none !important',
            },
            '&.cm-focused': {
                outline: 'none',
            },
            '.cm-scroller': {
                fontFamily: MONO_FONT,
                lineHeight: '1.7',
                fontVariantLigatures: 'none',
            },
            '.cm-content': {
                padding: '4px 0 40vh',
                caretColor: syntax.heading,
                userSelect: 'text !important',
            },
            '.cm-line': {
                padding: '0 24px 0 12px',
            },
            '&.cm-focused .cm-cursor, .cm-cursor': {
                borderLeftColor: syntax.heading,
                borderLeftWidth: '2px',
            },
            // Selection — one neutral wash for every selection surface.
            '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
                {
                    backgroundColor: `${surface.selection} !important`,
                },
            '.cm-selectionMatch': {
                backgroundColor: surface.activeLine,
                outline: `1px solid ${surface.bracket}`,
                borderRadius: '2px',
            },
            '.cm-activeLine': {
                backgroundColor: surface.activeLine,
            },
            '.cm-gutters': {
                backgroundColor: 'var(--background-canvas) !important',
                color: `${surface.lineNumber} !important`,
                border: 'none !important',
                fontFamily: MONO_FONT,
            },
            '.cm-lineNumbers .cm-gutterElement': {
                minWidth: '44px',
                padding: '0 4px 0 16px',
                fontSize: '12px',
                color: surface.lineNumber,
            },
            '.cm-activeLineGutter': {
                backgroundColor: 'transparent',
            },
            '.cm-lineNumbers .cm-activeLineGutter': {
                color: surface.lineNumberActive,
            },
            // Fold arrows stay out of the way until the gutter is hovered.
            '.cm-foldGutter .cm-gutterElement': {
                width: '14px',
                color: surface.lineNumber,
                opacity: '0',
                transition: 'opacity 150ms ease',
                cursor: 'pointer',
            },
            '.cm-gutters:hover .cm-foldGutter .cm-gutterElement': {
                opacity: '1',
            },
            '.cm-foldGutter .cm-gutterElement:hover': {
                color: surface.lineNumberActive,
            },
            '.cm-foldPlaceholder': {
                backgroundColor: surface.activeLine,
                border: `1px solid ${surface.bracket}`,
                borderRadius: '4px',
                color: syntax.muted,
                padding: '0 6px',
            },
            '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
                backgroundColor: 'transparent',
                outline: `1px solid ${surface.bracket}`,
                borderRadius: '2px',
            },
            '.cm-nonmatchingBracket': {
                color: syntax.invalid,
            },
            '.cm-tooltip': {
                backgroundColor: 'var(--background-chrome)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--foreground)',
                overflow: 'hidden',
            },
            '.cm-tooltip-autocomplete > ul > li': {
                fontFamily: MONO_FONT,
                padding: '2px 8px !important',
            },
            '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
                backgroundColor: 'var(--background-tertiary)',
                color: 'var(--foreground)',
            },
            '.cm-panels': {
                backgroundColor: 'var(--background-chrome)',
                color: 'var(--foreground)',
            },
            '.cm-panels.cm-panels-top': {
                borderBottom: '1px solid var(--border)',
            },
            '.cm-searchMatch': {
                backgroundColor: surface.searchMatch,
                borderRadius: '2px',
            },
            '.cm-searchMatch.cm-searchMatch-selected': {
                outline: `1px solid ${syntax.fn}`,
            },
            '.cm-scroller::-webkit-scrollbar': {
                width: '10px',
                height: '10px',
            },
            '.cm-scroller::-webkit-scrollbar-track': {
                backgroundColor: 'transparent',
            },
            '.cm-scroller::-webkit-scrollbar-thumb': {
                backgroundColor: surface.scrollThumb,
                borderRadius: '10px',
                border: '3px solid transparent',
                backgroundClip: 'content-box',
            },
            '.cm-scroller::-webkit-scrollbar-thumb:hover': {
                backgroundColor: surface.scrollThumbHover,
            },
            '.cm-search-highlight': {
                backgroundColor: surface.searchMatch,
                borderRadius: '2px',
            },
            '.cm-element-highlight': {
                backgroundColor: surface.elementMatch,
                padding: '0.1735em 0',
                boxDecorationBreak: 'clone',
            },
        },
        { dark },
    );

const buildHighlightStyle = (c: SyntaxPalette) =>
    HighlightStyle.define([
        {
            tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword],
            color: c.keyword,
        },
        { tag: [tags.operatorKeyword, tags.definitionKeyword], color: c.keyword },
        {
            tag: [tags.string, tags.special(tags.string), tags.regexp],
            color: c.string,
        },
        {
            tag: [tags.number, tags.bool, tags.null, tags.atom, tags.unit],
            color: c.number,
        },
        { tag: tags.literal, color: c.number },
        {
            tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
            color: c.fn,
        },
        { tag: [tags.typeName, tags.className, tags.namespace], color: c.fn },
        { tag: [tags.tagName, tags.standard(tags.tagName)], color: c.fn },
        { tag: [tags.propertyName, tags.attributeName], color: c.property },
        { tag: tags.variableName, color: c.text },
        { tag: tags.definition(tags.variableName), color: c.text },
        {
            tag: [tags.comment, tags.lineComment, tags.blockComment],
            color: c.comment,
        },
        { tag: tags.docComment, color: c.comment },
        {
            tag: [tags.operator, tags.punctuation, tags.bracket, tags.angleBracket],
            color: c.muted,
        },
        { tag: tags.separator, color: c.muted },
        // Markdown / prose
        { tag: tags.heading, color: c.heading, fontWeight: '600' },
        { tag: tags.strong, color: c.heading, fontWeight: '600' },
        { tag: tags.emphasis, fontStyle: 'italic' },
        { tag: tags.strikethrough, textDecoration: 'line-through' },
        { tag: tags.link, color: c.string, textDecoration: 'underline' },
        { tag: tags.url, color: c.string },
        { tag: tags.monospace, color: c.fn },
        { tag: tags.quote, color: c.muted, fontStyle: 'italic' },
        { tag: [tags.list, tags.processingInstruction], color: c.muted },
        { tag: tags.contentSeparator, color: c.muted },
        { tag: tags.meta, color: c.muted },
        { tag: tags.invalid, color: c.invalid, textDecoration: 'underline' },
    ]);

export const customDarkTheme = buildEditorTheme(darkSyntax, darkSurface, true);
export const customLightTheme = buildEditorTheme(lightSyntax, lightSurface, false);
export const customDarkHighlightStyle = buildHighlightStyle(darkSyntax);
export const customLightHighlightStyle = buildHighlightStyle(lightSyntax);

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

export const scrollToLineColumn = debounce(undebounceScrollToLineColumn, 100, {
    leading: true,
});

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
        case 'mjs':
        case 'cjs':
            return 'javascript';
        case 'ts':
            return 'typescript';
        case 'tsx':
            return 'typescript';
        case 'mts':
        case 'cts':
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
            // Unknown extensions (.env, .yml, .toml, Dockerfile, .sh, lockfiles,
            // …) → plain text. Defaulting to 'typescript' painted them with
            // TS/JSX highlighting AND spurious parser error markers.
            return 'text';
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
        case 'text':
            // Plain text — no language extension, so no spurious error markers
            // on config files, dotfiles, lockfiles, etc.
            return [];
        default:
            return [javascript({ jsx: true, typescript: true })];
    }
}
