'use client';

import { useState } from 'react';

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

    const pull = async (model: string) => {
        const bridge = typeof window !== 'undefined' ? window.weblabNative?.cli : undefined;
        if (!bridge?.ollamaPullModel) {
            setError('Pull is only available in the desktop app.');
            return;
        }
        setPulling(model);
        setError(null);
        try {
            const result = await bridge.ollamaPullModel(model);
            if (!result.ok) {
                setError(result.error ?? 'Pull failed.');
            } else {
                onPulled?.();
                onOpenChange(false);
            }
        } finally {
            setPulling(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Pull an Ollama model</DialogTitle>
                    <DialogDescription>
                        Download a local model with the Ollama CLI. The download runs in the desktop
                        app — keep this window open until it finishes.
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
                            disabled={pulling !== null || custom.trim().length === 0}
                            onClick={() => void pull(custom.trim())}
                        >
                            {pulling === custom.trim() ? 'Pulling…' : 'Pull'}
                        </Button>
                    </div>
                </div>

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
