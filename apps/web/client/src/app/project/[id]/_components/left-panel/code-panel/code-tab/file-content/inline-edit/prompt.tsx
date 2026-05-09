'use client';

import { useEffect, useRef, useState } from 'react';

import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import type { InlineEditSession } from './state';
import type { EditorView } from '@codemirror/view';
import { closeInlineEditEffect, updateInlineEditEffect } from './state';

interface InlineEditPromptProps {
    editor: EditorView;
    session: InlineEditSession;
    filePath: string;
    language: string;
    projectId: string;
    onApply: (newText: string) => void;
}

const CONTEXT_LINES = 80;

const sliceContext = (editor: EditorView, from: number, to: number) => {
    const doc = editor.state.doc;
    const startLine = doc.lineAt(from).number;
    const endLine = doc.lineAt(to).number;
    const beforeStart = Math.max(1, startLine - CONTEXT_LINES);
    const afterEnd = Math.min(doc.lines, endLine + CONTEXT_LINES);
    const before = doc.sliceString(doc.line(beforeStart).from, from);
    const after = doc.sliceString(to, doc.line(afterEnd).to);
    return { before, after };
};

export const InlineEditPrompt = ({
    editor,
    session,
    filePath,
    language,
    projectId,
    onApply,
}: InlineEditPromptProps) => {
    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const [instruction, setInstruction] = useState(session.instruction);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    const close = () => {
        abortRef.current?.abort();
        editor.dispatch({ effects: closeInlineEditEffect.of() });
    };

    const submit = async () => {
        const trimmed = instruction.trim();
        if (!trimmed) return;
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;

        const { before, after } = sliceContext(editor, session.from, session.to);
        editor.dispatch({
            effects: updateInlineEditEffect.of({
                streaming: true,
                error: null,
                preview: '',
                instruction: trimmed,
            }),
        });

        try {
            const res = await fetch('/api/ai/inline-edit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filePath,
                    language,
                    before,
                    selection: session.original,
                    after,
                    instruction: trimmed,
                    projectId,
                }),
                signal: ctrl.signal,
            });

            if (!res.ok || !res.body) {
                const errMsg = await res
                    .json()
                    .then((j) => j.error)
                    .catch(() => 'Request failed');
                editor.dispatch({
                    effects: updateInlineEditEffect.of({
                        streaming: false,
                        error: errMsg ?? 'Request failed',
                    }),
                });
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            // Stream into the preview, but stay tolerant of the model emitting
            // accidental ```markdown fences — strip them at apply time.

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                editor.dispatch({
                    effects: updateInlineEditEffect.of({ preview: buffer }),
                });
            }
            editor.dispatch({
                effects: updateInlineEditEffect.of({ streaming: false }),
            });
        } catch (err) {
            if (ctrl.signal.aborted) return;
            editor.dispatch({
                effects: updateInlineEditEffect.of({
                    streaming: false,
                    error: err instanceof Error ? err.message : String(err),
                }),
            });
        }
    };

    const accept = () => {
        const cleaned = stripCodeFences(session.preview);
        if (!cleaned.trim()) {
            close();
            return;
        }
        onApply(cleaned);
    };

    const getPromptRect = () => {
        try {
            const startCoords = editor.coordsAtPos(session.from);
            if (!startCoords) return null;
            const editorRect = editor.dom.getBoundingClientRect();
            return {
                top: startCoords.top - editorRect.top,
                left: startCoords.left - editorRect.left,
            };
        } catch {
            return null;
        }
    };

    const rect = getPromptRect();
    if (!rect) return null;

    const style: React.CSSProperties = {
        position: 'absolute',
        top: Math.max(8, rect.top - 56),
        left: Math.max(12, rect.left),
        zIndex: 1000,
        pointerEvents: 'auto',
        width: 'min(560px, calc(100% - 24px))',
    };

    return (
        <div style={style} onClick={(e) => e.stopPropagation()}>
            <div
                className={cn(
                    'rounded-lg backdrop-blur-lg',
                    'shadow-background-secondary/50 shadow-xl',
                    'bg-background-primary/95 border-foreground-secondary/20',
                    'flex flex-col gap-1 border p-2',
                )}
            >
                <div className="flex items-center gap-2">
                    <Icons.Sparkles className="text-foreground-tertiary h-3.5 w-3.5 shrink-0" />
                    <textarea
                        ref={inputRef}
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (session.preview && !session.streaming) {
                                    accept();
                                } else {
                                    void submit();
                                }
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                close();
                            }
                        }}
                        placeholder="Tell Weblab what to change…"
                        rows={1}
                        className={cn(
                            'flex-1 resize-none bg-transparent outline-none',
                            'text-foreground-primary placeholder:text-foreground-tertiary',
                            'text-small leading-tight',
                        )}
                    />
                    {session.streaming && (
                        <Icons.LoadingSpinner className="text-foreground-tertiary h-3.5 w-3.5 animate-spin" />
                    )}
                </div>
                <div className="flex items-center justify-between gap-2">
                    <span className="text-mini text-foreground-tertiary">
                        {session.preview && !session.streaming
                            ? '⏎ Accept · Esc Reject'
                            : '⏎ Generate · Esc Cancel'}
                    </span>
                    <div className="flex items-center gap-1">
                        {session.preview && !session.streaming && (
                            <>
                                <button
                                    onClick={close}
                                    className="text-mini text-foreground-tertiary hover:text-foreground-primary rounded px-2 py-1"
                                >
                                    Reject
                                </button>
                                <button
                                    onClick={accept}
                                    className="text-mini bg-primary/30 text-foreground-primary hover:bg-primary/50 rounded px-2 py-1"
                                >
                                    Accept
                                </button>
                            </>
                        )}
                    </div>
                </div>
                {session.error && <div className="text-mini text-destructive">{session.error}</div>}
            </div>
        </div>
    );
};

const stripCodeFences = (text: string): string => {
    let t = text.trim();
    // ```ts\n...\n```  →  ...
    const fenceMatch = /^```[\w-]*\n([\s\S]*?)\n```$/.exec(t);
    if (fenceMatch?.[1] !== undefined) {
        t = fenceMatch[1];
    }
    return t;
};
