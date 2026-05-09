import { RangeSet, StateEffect, StateField } from '@codemirror/state';
import { EditorView, gutter, GutterMarker } from '@codemirror/view';

import type { FileErrorLocation } from './parse';
import type { Extension, Range } from '@codemirror/state';
import { openInlineEditEffect } from '../inline-edit';

/**
 * In-editor errors delivered from the React layer via setEditorErrors().
 * Each one ends up as a clickable gutter marker on its line.
 */
const setEditorErrorsEffect = StateEffect.define<FileErrorLocation[]>();

const editorErrorsField = StateField.define<FileErrorLocation[]>({
    create() {
        return [];
    },
    update(value, tr) {
        let next = value;
        for (const effect of tr.effects) {
            if (effect.is(setEditorErrorsEffect)) {
                next = effect.value;
            }
        }
        return next;
    },
});

class ErrorMarker extends GutterMarker {
    constructor(public readonly location: FileErrorLocation) {
        super();
    }
    eq(other: ErrorMarker): boolean {
        return other.location.error.content === this.location.error.content;
    }
    toDOM() {
        const el = document.createElement('div');
        el.className = 'cm-error-fix-marker';
        el.title = `Fix with AI: ${this.location.message}`;
        el.textContent = '✦';
        return el;
    }
}

const buildMarkers = (view: EditorView, errors: FileErrorLocation[]): RangeSet<ErrorMarker> => {
    const ranges: Range<ErrorMarker>[] = [];
    const seenLines = new Set<number>();
    const doc = view.state.doc;
    for (const loc of errors) {
        if (seenLines.has(loc.line)) continue;
        if (loc.line < 1 || loc.line > doc.lines) continue;
        const lineFrom = doc.line(loc.line).from;
        ranges.push(new ErrorMarker(loc).range(lineFrom));
        seenLines.add(loc.line);
    }
    return RangeSet.of(ranges, true);
};

const errorFixGutter = gutter({
    class: 'cm-error-fix-gutter',
    markers: (view) => buildMarkers(view, view.state.field(editorErrorsField, false) ?? []),
    initialSpacer: () => new ErrorMarker({} as FileErrorLocation),
    domEventHandlers: {
        mousedown(view, line, event) {
            const errors = view.state.field(editorErrorsField, false) ?? [];
            const lineNum = view.state.doc.lineAt(line.from).number;
            const match = errors.find((e) => e.line === lineNum);
            if (!match) return false;
            (event as MouseEvent).preventDefault();
            openErrorFixPrompt(view, match);
            return true;
        },
    },
});

const errorFixTheme = EditorView.theme({
    '.cm-error-fix-gutter': {
        width: '14px',
        cursor: 'pointer',
    },
    '.cm-error-fix-marker': {
        color: '#FFAC60',
        fontSize: '11px',
        textAlign: 'center',
        lineHeight: '1.5',
    },
    '.cm-error-fix-marker:hover': {
        color: '#FFAC60',
        textShadow: '0 0 4px rgba(255, 172, 96, 0.7)',
    },
});

export const openErrorFixPrompt = (view: EditorView, location: FileErrorLocation) => {
    const doc = view.state.doc;
    const targetLine = Math.max(1, Math.min(location.line, doc.lines));
    const line = doc.line(targetLine);
    const original = view.state.sliceDoc(line.from, line.to);
    view.dispatch({
        effects: openInlineEditEffect.of({
            from: line.from,
            to: line.to,
            original,
            initialInstruction: `Fix this error: ${location.message}`,
        }),
    });
};

export const setEditorErrors = (view: EditorView, errors: FileErrorLocation[]) => {
    view.dispatch({ effects: setEditorErrorsEffect.of(errors) });
};

export const errorFixExtensions = (): Extension[] => [
    editorErrorsField,
    errorFixGutter,
    errorFixTheme,
];
