'use client';

import { useEffect, useRef, useState } from 'react';

import { Icons } from '@weblab/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { toast } from '@weblab/ui/sonner';
import { Switch } from '@weblab/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

// Persisted, feature-local preferences. Kept in localStorage (not the global
// settings store) so the terminal owns its own toggles without new plumbing.
const AI_ENABLED_KEY = 'weblab:terminal-ai-enabled';
const AI_AUTORUN_KEY = 'weblab:terminal-ai-autorun';

const readBool = (key: string, fallback: boolean): boolean => {
    if (typeof window === 'undefined') return fallback;
    try {
        const v = window.localStorage.getItem(key);
        return v === null ? fallback : v === 'true';
    } catch {
        return fallback;
    }
};

const writeBool = (key: string, value: boolean) => {
    try {
        window.localStorage.setItem(key, String(value));
    } catch {
        // Ignore — private mode / storage disabled. The toggle still works
        // for the session; it just won't persist.
    }
};

interface TerminalInputProps {
    projectId: string;
    /** True when the active tab is an interactive terminal we can write into. */
    canRun: boolean;
    /** Write a command line into the active terminal's PTY (runs it). */
    onRun: (command: string) => void;
}

export function TerminalInput({ projectId, canRun, onRun }: TerminalInputProps) {
    const [value, setValue] = useState('');
    const [aiEnabled, setAiEnabled] = useState(false);
    const [autoRun, setAutoRun] = useState(false);
    const [loading, setLoading] = useState(false);
    // Mirrors `previewedRef` for rendering the "command ready — ↵ to run" hint.
    const [previewActive, setPreviewActive] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    // The command AI wrote into the box as a preview. While a preview is active
    // the box holds an editable command — Enter runs it (the "preview → Enter to
    // run" flow). Clearing the box (or Esc) drops the preview so the next typed
    // request is treated as fresh natural language to translate again.
    const previewedRef = useRef<string | null>(null);

    const clearPreview = () => {
        previewedRef.current = null;
        setPreviewActive(false);
    };

    // Hydrate prefs after mount to avoid SSR/client mismatch.
    useEffect(() => {
        setAiEnabled(readBool(AI_ENABLED_KEY, false));
        setAutoRun(readBool(AI_AUTORUN_KEY, false));
    }, []);

    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    const toggleAi = () => {
        setAiEnabled((prev) => {
            const next = !prev;
            writeBool(AI_ENABLED_KEY, next);
            return next;
        });
        clearPreview();
        inputRef.current?.focus();
    };

    const toggleAutoRun = (next: boolean) => {
        setAutoRun(next);
        writeBool(AI_AUTORUN_KEY, next);
    };

    const runLiteral = (command: string) => {
        const trimmed = command.trim();
        if (!trimmed) return;
        onRun(trimmed);
        setValue('');
        clearPreview();
    };

    const translateWithAi = async (instruction: string) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setLoading(true);
        try {
            const res = await fetch('/api/ai/terminal-command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instruction, projectId }),
                signal: controller.signal,
            });
            if (!res.ok) {
                const code = res.status;
                toast.error(
                    code === 402
                        ? 'AI credit limit reached.'
                        : code === 401 || code === 403
                          ? 'Not authorized to use AI here.'
                          : 'Could not translate that into a command.',
                );
                return;
            }
            const data = (await res.json()) as { command?: string };
            const command = (data.command ?? '').trim();
            if (!command) {
                toast.error('Could not translate that into a command.');
                return;
            }
            if (autoRun) {
                runLiteral(command);
            } else {
                // Preview: drop the command into the box and let the user
                // review (and edit) it. Next Enter runs it literally.
                setValue(command);
                previewedRef.current = command;
                setPreviewActive(true);
                inputRef.current?.focus();
            }
        } catch (err) {
            if ((err as Error)?.name !== 'AbortError') {
                toast.error('AI request failed.');
            }
        } finally {
            setLoading(false);
            abortRef.current = null;
        }
    };

    const handleSubmit = () => {
        const text = value.trim();
        if (!text || loading) return;
        if (!canRun) return;
        // Run literally when AI is off, OR when a preview is active (the box now
        // holds a command — Enter runs it, even if the user tweaked it first).
        // Only translate when AI is on and there's no active preview (fresh NL).
        // Clearing the box resets the preview (see onChange), so the next typed
        // request translates again.
        if (!aiEnabled || previewedRef.current !== null) {
            runLiteral(text);
        } else {
            void translateWithAi(text);
        }
    };

    return (
        // Elevated surface (vs the panel body's `bg-background`) so the command
        // input reads as a distinct, findable field instead of blending into the
        // empty terminal area — the "I don't see any input" complaint.
        <div className="border-border/60 bg-background-secondary flex items-center gap-1.5 border-t px-2 py-2">
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        onClick={toggleAi}
                        aria-label={
                            aiEnabled ? 'Disable AI command mode' : 'Enable AI command mode'
                        }
                        aria-pressed={aiEnabled}
                        className={cn(
                            'flex h-7 w-7 items-center justify-center rounded-md border border-transparent transition-colors',
                            aiEnabled
                                ? 'bg-primary/15 text-primary'
                                : 'text-foreground-tertiary hover:text-foreground-hover hover:bg-background-bar-active',
                        )}
                    >
                        {loading ? (
                            <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                        ) : (
                            <Icons.Sparkles className="h-4 w-4" />
                        )}
                    </button>
                </TooltipTrigger>
                <TooltipContent sideOffset={5} hideArrow>
                    {aiEnabled ? 'AI command mode on' : 'Run commands with natural language'}
                </TooltipContent>
            </Tooltip>

            {aiEnabled && (
                <Popover>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <PopoverTrigger asChild>
                                <button
                                    type="button"
                                    aria-label="AI command settings"
                                    className="text-foreground-tertiary hover:text-foreground-hover hover:bg-background-bar-active flex h-7 w-7 items-center justify-center rounded-md border border-transparent transition-colors"
                                >
                                    <Icons.Gear className="h-3.5 w-3.5" />
                                </button>
                            </PopoverTrigger>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={5} hideArrow>
                            AI command settings
                        </TooltipContent>
                    </Tooltip>
                    <PopoverContent align="start" sideOffset={8} className="w-64 p-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-small text-foreground-primary font-medium">
                                    Auto-run commands
                                </span>
                                <span className="text-mini text-foreground-tertiary">
                                    {autoRun
                                        ? 'AI commands run immediately.'
                                        : 'Preview first, press Enter to run.'}
                                </span>
                            </div>
                            <Switch checked={autoRun} onCheckedChange={toggleAutoRun} />
                        </div>
                    </PopoverContent>
                </Popover>
            )}

            <input
                ref={inputRef}
                value={value}
                disabled={!canRun}
                onChange={(e) => {
                    setValue(e.target.value);
                    // Clearing the box drops the active preview so the next typed
                    // request is treated as fresh natural language to translate.
                    if (e.target.value === '') clearPreview();
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSubmit();
                    } else if (e.key === 'Escape' && (value || previewActive)) {
                        // Esc clears the box (and any active AI preview) so the
                        // user can immediately ask a fresh question instead of
                        // the box's command running literally on the next Enter.
                        e.preventDefault();
                        setValue('');
                        clearPreview();
                    }
                }}
                placeholder={
                    !canRun
                        ? 'Open a terminal tab to run commands'
                        : aiEnabled
                          ? 'Ask AI to run a command…'
                          : 'Type a command…'
                }
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                className={cn(
                    'text-small text-foreground-primary placeholder:text-foreground-tertiary h-7 flex-1 border-none bg-transparent font-mono outline-none disabled:cursor-not-allowed disabled:opacity-60',
                )}
            />

            {previewActive && canRun && (
                <span className="text-mini text-foreground-tertiary hidden shrink-0 items-center gap-1 select-none sm:flex">
                    ↵ run · esc clear
                </span>
            )}

            {value.trim() && canRun && (
                <button
                    type="button"
                    onClick={handleSubmit}
                    aria-label="Run command"
                    className="text-foreground-tertiary hover:text-foreground-hover hover:bg-background-bar-active flex h-7 items-center gap-1 rounded-md px-1.5 transition-colors"
                >
                    <Icons.Return className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    );
}
