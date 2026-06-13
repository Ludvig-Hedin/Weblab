'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

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
    const t = useTranslations('editor.leftPanel.codePanel');
    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const [instruction, setInstruction] = useState(session.instruction);

    const getPromptPos = useCallback(() => {
        try {
            const coords = editor.coordsAtPos(session.from);
            if (!coords) return null;
            const editorRect = editor.dom.getBoundingClientRect();
            return {
                top: Math.max(8, coords.top - editorRect.top - 56),
                left: Math.max(12, coords.left - editorRect.left),
            };
        } catch {
            return null;
        }
    }, [editor, session.from]);

    const [promptPos, setPromptPos] = useState(getPromptPos);

    // Reposition when session.from changes (e.g. lines inserted above selection).
    useEffect(() => {
        const pos = getPromptPos();
        if (pos) setPromptPos(pos);
    }, [getPromptPos]);

    // Follow editor scroll — don't null out if anchor is off-screen; keep last pos.
    useEffect(() => {
        const scrollEl = editor.scrollDOM;
        const onScroll = () => {
            const pos = getPromptPos();
            if (pos) setPromptPos(pos);
        };
        scrollEl.addEventListener('scroll', onScroll, { passive: true });
        return () => scrollEl.removeEventListener('scroll', onScroll);
    }, [editor, getPromptPos]);

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

        const body = JSON.stringify({
            filePath,
            language,
            before,
            selection: session.original,
            after,
            instruction: trimmed,
            projectId,
        });

        const abortableDelay = (ms: number, signal: AbortSignal) =>
            new Promise<void>((resolve, reject) => {
                if (signal.aborted) {
                    reject(new DOMException('Aborted', 'AbortError'));
                    return;
                }
                const timeoutId = setTimeout(() => {
                    signal.removeEventListener('abort', onAbort);
                    resolve();
                }, ms);
                const onAbort = () => {
                    clearTimeout(timeoutId);
                    reject(new DOMException('Aborted', 'AbortError'));
                };
                signal.addEventListener('abort', onAbort, { once: true });
            });

        let lastErr: string | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
            if (ctrl.signal.aborted) return;
            if (attempt > 0) {
                try {
                    await abortableDelay(500, ctrl.signal);
                } catch {
                    return;
                }
                editor.dispatch({
                    effects: updateInlineEditEffect.of({
                        streaming: true,
                        error: null,
                        preview: '',
                    }),
                });
            }
            try {
                const res = await fetch('/api/ai/inline-edit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body,
                    signal: ctrl.signal,
                });

                if (!res.ok || !res.body) {
                    const errMsg = await res
                        .json()
                        .then((j: { error?: string }) => j.error)
                        .catch(() => 'Request failed');
                    if (res.status === 401 || res.status === 429) {
                        editor.dispatch({
                            effects: updateInlineEditEffect.of({
                                streaming: false,
                                error: errMsg ?? 'Request failed',
                            }),
                        });
                        return;
                    }
                    lastErr = errMsg ?? 'Request failed';
                    continue;
                }

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    if (ctrl.signal.aborted) {
                        await reader.cancel().catch(() => {});
                        return;
                    }
                    const { value, done } = await reader.read();
                    if (done) break;
                    if (ctrl.signal.aborted) return;
                    buffer += decoder.decode(value, { stream: true });
                    editor.dispatch({
                        effects: updateInlineEditEffect.of({ preview: buffer }),
                    });
                }
                if (ctrl.signal.aborted) return;
                editor.dispatch({
                    effects: updateInlineEditEffect.of({ streaming: false }),
                });
                return;
            } catch (err) {
                if (ctrl.signal.aborted) return;
                lastErr = err instanceof Error ? err.message : String(err);
            }
        }

        if (ctrl.signal.aborted) return;
        editor.dispatch({
            effects: updateInlineEditEffect.of({
                streaming: false,
                error: lastErr ?? 'Request failed',
            }),
        });
    };

    const accept = () => {
        // Never apply an incomplete or failed generation. A mid-stream failure
        // (provider 5xx / network drop) leaves a truncated `preview` plus an
        // `error`; applying it would write a half-written edit into the file.
        // Only a fully-streamed, error-free preview is acceptable.
        if (session.streaming || session.error) {
            return;
        }
        const cleaned = stripCodeFences(session.preview);
        if (!cleaned.trim()) {
            close();
            return;
        }
        onApply(cleaned);
    };

    if (!promptPos) return null;

    const style: React.CSSProperties = {
        position: 'absolute',
        top: promptPos.top,
        left: promptPos.left,
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
                        placeholder={t('inlineEditPlaceholder')}
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
                            ? t('inlineAcceptReject')
                            : t('inlineGenerateCancel')}
                    </span>
                    <div className="flex items-center gap-1">
                        {session.preview && !session.streaming && (
                            <>
                                <button
                                    onClick={close}
                                    className="text-mini text-foreground-tertiary hover:text-foreground-primary rounded px-2 py-1"
                                >
                                    {t('inlineReject')}
                                </button>
                                <button
                                    onClick={accept}
                                    className="text-mini bg-primary/30 text-foreground-primary hover:bg-primary/50 rounded px-2 py-1"
                                >
                                    {t('inlineAccept')}
                                </button>
                            </>
                        )}
                    </div>
                </div>
                {session.error && (
                    <div className="text-mini text-destructive flex flex-col gap-0.5">
                        <span>{session.error}</span>
                        <span className="text-foreground-tertiary">{t('inlineRetry')}</span>
                    </div>
                )}
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
