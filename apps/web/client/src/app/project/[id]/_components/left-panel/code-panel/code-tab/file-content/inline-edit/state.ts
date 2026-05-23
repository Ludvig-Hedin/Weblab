import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, keymap, WidgetType } from '@codemirror/view';

import type { DecorationSet } from '@codemirror/view';

/** Renders the streaming preview as green ghost text immediately after the
 * original (struck-through) selection. Lives only while a session is active. */
class InlineEditPreviewWidget extends WidgetType {
    constructor(
        private readonly text: string,
        private readonly streaming: boolean,
    ) {
        super();
    }
    eq(other: InlineEditPreviewWidget) {
        return other.text === this.text && other.streaming === this.streaming;
    }
    toDOM() {
        const container = document.createElement('span');
        container.className = 'cm-inline-edit-preview';
        if (this.streaming) container.classList.add('cm-inline-edit-preview-streaming');
        const lines = this.text.split('\n');
        lines.forEach((line, i) => {
            if (i > 0) container.appendChild(document.createElement('br'));
            container.appendChild(document.createTextNode(line));
        });
        return container;
    }
    ignoreEvent() {
        return true;
    }
}

/**
 * State for the floating Cmd+K inline-edit prompt.
 * One active session per editor view at a time.
 */
export interface InlineEditSession {
    from: number;
    to: number;
    /** Original text in [from, to] when the session opened. */
    original: string;
    /** Streaming/preview text. Empty before the model has produced output. */
    preview: string;
    /** Latest user instruction (visible in the prompt input). */
    instruction: string;
    /** Whether the model is actively streaming. */
    streaming: boolean;
    /** Optional error message from the last attempt. */
    error: string | null;
    /** Pre-fill instruction when the session was opened (e.g. error-fix). */
    initialInstruction?: string;
}

export const openInlineEditEffect = StateEffect.define<{
    from: number;
    to: number;
    original: string;
    initialInstruction?: string;
}>();
export const updateInlineEditEffect = StateEffect.define<Partial<InlineEditSession>>();
export const closeInlineEditEffect = StateEffect.define<void>();

export const inlineEditField = StateField.define<InlineEditSession | null>({
    create() {
        return null;
    },
    update(session, tr) {
        let next = session;
        if (next) {
            next = {
                ...next,
                from: tr.changes.mapPos(next.from, -1),
                to: tr.changes.mapPos(next.to, 1),
            };
        }
        for (const effect of tr.effects) {
            if (effect.is(openInlineEditEffect)) {
                next = {
                    from: effect.value.from,
                    to: effect.value.to,
                    original: effect.value.original,
                    preview: '',
                    instruction: effect.value.initialInstruction ?? '',
                    streaming: false,
                    error: null,
                    initialInstruction: effect.value.initialInstruction,
                };
            } else if (effect.is(updateInlineEditEffect) && next) {
                next = { ...next, ...effect.value };
            } else if (effect.is(closeInlineEditEffect)) {
                next = null;
            }
        }
        return next;
    },
    provide: (f) =>
        EditorView.decorations.compute([f], (state) => {
            const session = state.field(f);
            if (!session) return Decoration.none;
            const ranges = [];
            if (session.from < session.to) {
                // Strike-through + red bg over the original selection while a
                // preview is being generated or shown.
                const cls = session.preview
                    ? 'cm-inline-edit-target cm-inline-edit-target-replacing'
                    : 'cm-inline-edit-target';
                ranges.push(Decoration.mark({ class: cls }).range(session.from, session.to));
            }
            // Show streaming/preview text as a green inline widget right after
            // the original. User sees what will replace before pressing Accept.
            if (session.preview) {
                ranges.push(
                    Decoration.widget({
                        widget: new InlineEditPreviewWidget(session.preview, session.streaming),
                        side: 1,
                    }).range(session.to),
                );
            }
            return Decoration.set(ranges, true);
        }),
});

/**
 * Open the inline-edit prompt for the current selection. If the cursor has no
 * range (just a caret), fall back to the current line — this matches the
 * "edit at cursor" UX from Cursor.
 */
export const openInlineEditFromSelection = (
    view: EditorView,
    initialInstruction?: string,
): boolean => {
    const sel = view.state.selection.main;
    let from = sel.from;
    let to = sel.to;
    if (from === to) {
        const line = view.state.doc.lineAt(from);
        from = line.from;
        to = line.to;
    }
    const original = view.state.sliceDoc(from, to);
    view.dispatch({
        effects: openInlineEditEffect.of({
            from,
            to,
            original,
            initialInstruction,
        }),
    });
    return true;
};

export const inlineEditKeymap = keymap.of([
    {
        key: 'Mod-k',
        run: (view) => openInlineEditFromSelection(view),
    },
    {
        key: 'Escape',
        run: (view) => {
            if (!view.state.field(inlineEditField, false)) return false;
            view.dispatch({ effects: closeInlineEditEffect.of() });
            return true;
        },
    },
]);

export const inlineEditTheme = EditorView.theme({
    '.cm-inline-edit-target': {
        backgroundColor: 'rgba(63, 164, 255, 0.18)',
        outline: '1px solid rgba(63, 164, 255, 0.5)',
        borderRadius: '2px',
    },
    '.cm-inline-edit-target-replacing': {
        backgroundColor: 'rgba(239, 68, 68, 0.18)',
        outline: '1px solid rgba(239, 68, 68, 0.5)',
        textDecoration: 'line-through',
        textDecorationColor: 'rgba(239, 68, 68, 0.7)',
    },
    '.cm-inline-edit-preview': {
        backgroundColor: 'rgba(26, 198, 156, 0.15)',
        outline: '1px solid rgba(26, 198, 156, 0.5)',
        borderRadius: '2px',
        color: '#1AC69C',
        whiteSpace: 'pre',
        padding: '0 2px',
    },
    '.cm-inline-edit-preview-streaming::after': {
        content: '"▍"',
        opacity: 0.6,
        animation: 'cm-inline-edit-blink 1s steps(2) infinite',
    },
    '@keyframes cm-inline-edit-blink': {
        '50%': { opacity: 0 },
    },
});
