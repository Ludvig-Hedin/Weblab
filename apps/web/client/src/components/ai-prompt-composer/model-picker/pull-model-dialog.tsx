'use client';

import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { Input } from '@weblab/ui/input';

const CURATED_MODELS = [
    { label: 'Qwen 2.5 Coder 1.5B', model: 'qwen2.5-coder:1.5b', size: '~1 GB' },
    { label: 'Qwen 2.5 Coder 7B', model: 'qwen2.5-coder:7b', size: '~4.5 GB' },
    { label: 'Llama 3.2 3B', model: 'llama3.2:3b', size: '~2 GB' },
    { label: 'Gemma 2 4B', model: 'gemma2:4b', size: '~3 GB' },
    { label: 'DeepSeek Coder V2 16B', model: 'deepseek-coder-v2:16b', size: '~9 GB' },
];

// Mirror of `SAFE_OLLAMA_MODEL` in `apps/desktop/weblab-cli.js` so we can
// reject malformed model names client-side and give a precise error before
// the IPC round-trip. Reject leading `-` to block flag injection through
// the desktop bridge (defense-in-depth — the bridge enforces this too).
const SAFE_OLLAMA_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,127}$/;

/**
 * Parse an `ollama pull` stderr line into a percent + status. Lines look like:
 *   "pulling abc1234... 100%  4.3 GB/4.3 GB"
 *   "verifying sha256 digest"
 *   "success"
 * Falls back to the raw line when no percent can be extracted.
 */
function parseProgress(line: string): { percent: number | null; label: string } {
    const m = /(\d{1,3})%/.exec(line);
    const percent = m?.[1] ? Math.min(100, parseInt(m[1], 10)) : null;
    return { percent, label: line };
}

export function PullModelDialog({
    open,
    onOpenChange,
    onPulled,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onPulled?: () => void;
}) {
    const [custom, setCustom] = useState('');
    const [pulling, setPulling] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [progressPercent, setProgressPercent] = useState<number | null>(null);
    const [progressLabel, setProgressLabel] = useState<string>('');
    const pullIdRef = useRef<string | null>(null);

    // Subscribe to progress events for the current pull. We re-subscribe per
    // pull (fresh listener) and unsubscribe on dialog close / pull end so we
    // don't leak the IPC listener — same pattern as WeblabCliTransport.
    useEffect(() => {
        const bridge = typeof window !== 'undefined' ? window.weblabNative?.cli : undefined;
        if (!bridge?.onOllamaPullProgress) return;
        const unsubscribe = bridge.onOllamaPullProgress((event) => {
            if (event.pullId !== pullIdRef.current) return;
            const parsed = parseProgress(event.line);
            setProgressLabel(parsed.label);
            if (parsed.percent !== null) setProgressPercent(parsed.percent);
        });
        return unsubscribe;
    }, []);

    const pull = async (model: string) => {
        const bridge = typeof window !== 'undefined' ? window.weblabNative?.cli : undefined;
        if (!bridge?.ollamaPullModel) {
            setError('Pull is only available in the desktop app.');
            return;
        }
        if (!SAFE_OLLAMA_MODEL.test(model)) {
            setError(
                'Invalid model name. Use letters, digits, and one of `._:/@-`, with no leading dash.',
            );
            return;
        }
        const pullId = uuidv4();
        pullIdRef.current = pullId;
        setPulling(model);
        setError(null);
        setProgressPercent(null);
        setProgressLabel('Starting…');
        try {
            const result = await bridge.ollamaPullModel(model, pullId);
            if (!result.ok) {
                setError(result.error ?? 'Pull failed.');
            } else {
                onPulled?.();
                onOpenChange(false);
            }
        } finally {
            pullIdRef.current = null;
            setPulling(null);
            setProgressPercent(null);
            setProgressLabel('');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Pull an Ollama model</DialogTitle>
                    <DialogDescription>
                        Download a local model with the Ollama CLI. Progress streams below — keep
                        this window open until the download finishes.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-2">
                    <span className="text-foreground-tertiary text-mini">Curated</span>
                    {CURATED_MODELS.map((m) => (
                        <div
                            key={m.model}
                            className="border-foreground-primary/15 flex items-center justify-between rounded-md border px-3 py-2"
                        >
                            <div className="flex flex-col">
                                <span className="text-small font-medium">{m.label}</span>
                                <span className="text-foreground-tertiary text-mini">
                                    {m.model} · {m.size}
                                </span>
                            </div>
                            <Button
                                size="sm"
                                variant="secondary"
                                disabled={pulling !== null}
                                onClick={() => void pull(m.model)}
                            >
                                {pulling === m.model ? 'Pulling…' : 'Pull'}
                            </Button>
                        </div>
                    ))}

                    <span className="text-foreground-tertiary text-mini mt-2">Custom</span>
                    <div className="flex items-center gap-2">
                        <Input
                            placeholder="model:tag (e.g. llama3.2:3b)"
                            value={custom}
                            onChange={(e) => setCustom(e.target.value)}
                            disabled={pulling !== null}
                        />
                        <Button
                            size="sm"
                            disabled={
                                pulling !== null ||
                                custom.trim().length === 0 ||
                                !SAFE_OLLAMA_MODEL.test(custom.trim())
                            }
                            onClick={() => void pull(custom.trim())}
                        >
                            {pulling === custom.trim() ? 'Pulling…' : 'Pull'}
                        </Button>
                    </div>
                </div>

                {pulling && (
                    <div
                        className="border-foreground-primary/15 mt-2 flex flex-col gap-1.5 rounded-md border p-3"
                        role="status"
                        aria-live="polite"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-foreground-secondary text-mini truncate">
                                {progressLabel || 'Pulling…'}
                            </span>
                            {progressPercent !== null && (
                                <span className="text-foreground-tertiary text-mini font-mono">
                                    {progressPercent}%
                                </span>
                            )}
                        </div>
                        <div className="bg-background-secondary h-1.5 w-full overflow-hidden rounded-full">
                            <div
                                className="bg-foreground-primary h-full transition-[width] duration-200 ease-out"
                                style={{
                                    width:
                                        progressPercent !== null
                                            ? `${progressPercent}%`
                                            : // Indeterminate: a small bar that the user sees as
                                              // "running" until the first percent line arrives.
                                              '12%',
                                }}
                            />
                        </div>
                    </div>
                )}

                {error && (
                    <p className="text-foreground-error text-mini" role="alert">
                        {error}
                    </p>
                )}

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
