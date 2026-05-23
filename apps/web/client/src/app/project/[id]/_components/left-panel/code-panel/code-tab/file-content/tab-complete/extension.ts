import { Annotation, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, keymap, ViewPlugin, WidgetType } from '@codemirror/view';

import type { Extension } from '@codemirror/state';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';

/**
 * Per-editor context needed to make tab-complete requests.
 * Set via {@link setTabCompleteContext} from the React layer.
 */
export interface TabCompleteContext {
    filePath: string;
    language: string;
    projectId: string;
    enabled: boolean;
    /** Active chat model id (string-ChatModel) — passed through so the
     * server uses the user's selected model instead of the route default. */
    model?: string;
}

interface GhostSuggestion {
    /** Position in the document where the suggestion would be inserted. */
    pos: number;
    text: string;
}

const setSuggestionEffect = StateEffect.define<GhostSuggestion | null>();
const setContextEffect = StateEffect.define<TabCompleteContext>();
const setEnabledEffect = StateEffect.define<boolean>();

const suggestionAnnotation = Annotation.define<'tab-complete'>();

const contextField = StateField.define<TabCompleteContext>({
    create() {
        return {
            filePath: '',
            language: '',
            projectId: '',
            enabled: false,
            model: undefined,
        };
    },
    update(value, tr) {
        let next = value;
        for (const effect of tr.effects) {
            if (effect.is(setContextEffect)) {
                next = { ...next, ...effect.value };
            } else if (effect.is(setEnabledEffect)) {
                next = { ...next, enabled: effect.value };
            }
        }
        return next;
    },
});

class GhostTextWidget extends WidgetType {
    constructor(private readonly text: string) {
        super();
    }
    eq(other: GhostTextWidget) {
        return other.text === this.text;
    }
    toDOM() {
        const span = document.createElement('span');
        span.className = 'cm-tab-complete-ghost';
        // Render multi-line ghost text by inserting actual line breaks.
        const lines = this.text.split('\n');
        lines.forEach((line, i) => {
            if (i > 0) span.appendChild(document.createElement('br'));
            span.appendChild(document.createTextNode(line));
        });
        return span;
    }
    ignoreEvent() {
        return true;
    }
}

const suggestionField = StateField.define<GhostSuggestion | null>({
    create() {
        return null;
    },
    update(suggestion, tr) {
        let next = suggestion;
        for (const effect of tr.effects) {
            if (effect.is(setSuggestionEffect)) {
                next = effect.value;
            }
        }
        // Any user-typed change other than our own suggestion-clearing dispatch
        // dismisses the current suggestion (it is no longer at the right pos).
        if (next && tr.docChanged && tr.annotation(suggestionAnnotation) !== 'tab-complete') {
            next = null;
        }
        return next;
    },
    provide: (f) =>
        EditorView.decorations.compute([f], (state) => {
            const s = state.field(f);
            if (!s) return Decoration.none;
            return Decoration.set([
                Decoration.widget({
                    widget: new GhostTextWidget(s.text),
                    side: 1,
                }).range(s.pos),
            ]);
        }),
});

const ghostTextTheme = EditorView.theme({
    '.cm-tab-complete-ghost': {
        opacity: 0.45,
        color: '#9ca3af',
        whiteSpace: 'pre',
        pointerEvents: 'none',
    },
});

const acceptSuggestion = (view: EditorView): boolean => {
    const s = view.state.field(suggestionField, false);
    if (!s) return false;
    view.dispatch({
        changes: { from: s.pos, to: s.pos, insert: s.text },
        selection: { anchor: s.pos + s.text.length },
        effects: setSuggestionEffect.of(null),
        annotations: suggestionAnnotation.of('tab-complete'),
    });
    return true;
};

const rejectSuggestion = (view: EditorView): boolean => {
    const s = view.state.field(suggestionField, false);
    if (!s) return false;
    view.dispatch({ effects: setSuggestionEffect.of(null) });
    return true;
};

const tabCompleteKeymap = keymap.of([
    { key: 'Tab', run: acceptSuggestion },
    { key: 'Escape', run: rejectSuggestion },
]);

const DEBOUNCE_MS = 300;
const MIN_PREFIX_CHARS_AFTER_NEWLINE = 2;
// When the API responds with 429 (usage-limit), suspend further fetches for
// this long so we don't burn quota / retry on every keystroke.
const RATE_LIMIT_BACKOFF_MS = 30_000;

const fetchPlugin = ViewPlugin.fromClass(
    class {
        timer: ReturnType<typeof setTimeout> | null = null;
        controller: AbortController | null = null;
        rateLimitedUntil = 0;

        constructor(public view: EditorView) {}

        update(update: ViewUpdate) {
            // Only fetch on actual edits — clicking around / arrow-keying is
            // not a signal to spend tokens on a new completion.
            if (!update.docChanged) return;
            // Don't trigger when an accept-suggestion transaction lands.
            if (
                update.transactions.some(
                    (t) => t.annotation(suggestionAnnotation) === 'tab-complete',
                )
            ) {
                return;
            }
            this.scheduleFetch();
        }

        scheduleFetch() {
            const ctx = this.view.state.field(contextField);
            if (!ctx.enabled) return;
            if (Date.now() < this.rateLimitedUntil) return;
            if (this.timer) clearTimeout(this.timer);
            this.controller?.abort();

            this.timer = setTimeout(() => {
                void this.fetchSuggestion();
            }, DEBOUNCE_MS);
        }

        async fetchSuggestion() {
            const view = this.view;
            const ctx = view.state.field(contextField);
            if (!ctx.enabled) return;

            const sel = view.state.selection.main;
            if (sel.from !== sel.to) return; // Don't suggest while user has a selection
            const pos = sel.from;
            const doc = view.state.doc;
            const line = doc.lineAt(pos);
            const charsBeforeOnLine = pos - line.from;
            const lineText = line.text.slice(0, charsBeforeOnLine);

            // Skip whitespace-only lines and prefixes that are too short to
            // give the model any signal. We intentionally allow completion in
            // the middle of a word (Cursor does this) — the FIM model uses the
            // suffix for context and produces a fitting middle.
            if (charsBeforeOnLine < MIN_PREFIX_CHARS_AFTER_NEWLINE) return;
            if (!lineText.trim()) return;

            // Smaller windows for FIM models — Codestral has 32k total context
            // but quality drops fast past a few hundred lines. The big chunk
            // around the cursor matters more than the file tails.
            const PREFIX_CHARS = 1500;
            const SUFFIX_CHARS = 600;
            const prefix = doc.sliceString(Math.max(0, pos - PREFIX_CHARS), pos);
            const suffix = doc.sliceString(pos, Math.min(doc.length, pos + SUFFIX_CHARS));

            const ctrl = new AbortController();
            this.controller = ctrl;

            try {
                const res = await fetch('/api/ai/tab-complete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filePath: ctx.filePath,
                        language: ctx.language,
                        projectId: ctx.projectId,
                        prefix,
                        suffix,
                        ...(ctx.model ? { model: ctx.model } : {}),
                    }),
                    signal: ctrl.signal,
                });
                if (!res.ok) {
                    // 429 → over quota; back off so we stop retrying every
                    // keystroke. Other non-2xx are treated as transient.
                    if (res.status === 429) {
                        this.rateLimitedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
                    }
                    return;
                }
                const json = (await res.json()) as { completion?: string };
                const completion = (json.completion ?? '').replace(/^```[\w-]*\n|\n```$/g, '');
                if (!completion.trim()) return;
                if (ctrl.signal.aborted) return;

                // Re-check pos hasn't moved while we waited.
                const stillAtPos = view.state.selection.main.from === pos;
                if (!stillAtPos) return;

                view.dispatch({
                    effects: setSuggestionEffect.of({ pos, text: completion }),
                });
            } catch {
                // Network or abort — silently drop.
            }
        }

        destroy() {
            this.controller?.abort();
            if (this.timer) clearTimeout(this.timer);
        }
    },
);

export const setTabCompleteContext = (view: EditorView, ctx: Partial<TabCompleteContext>) => {
    const current = view.state.field(contextField);
    view.dispatch({
        effects: setContextEffect.of({
            filePath: ctx.filePath ?? current.filePath,
            language: ctx.language ?? current.language,
            projectId: ctx.projectId ?? current.projectId,
            enabled: ctx.enabled ?? current.enabled,
            model: ctx.model ?? current.model,
        }),
    });
};

export const setTabCompleteEnabled = (view: EditorView, enabled: boolean) => {
    view.dispatch({ effects: setEnabledEffect.of(enabled) });
};

export const tabCompleteExtensions = (): Extension[] => [
    contextField,
    suggestionField,
    fetchPlugin,
    tabCompleteKeymap,
    ghostTextTheme,
];
