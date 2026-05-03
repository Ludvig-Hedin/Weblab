'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'lodash';
import { observer } from 'mobx-react-lite';

import type { LocalModelOption } from '@weblab/models';
import { CHAT_MODEL_OPTIONS, OLLAMA_DEFAULT_BASE_URL } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
} from '@weblab/ui/select';
import { toast } from '@weblab/ui/sonner';
import { Switch } from '@weblab/ui/switch';

import { api } from '@/trpc/react';

type PendingAI = {
    defaultModel?: string;
    showSuggestions?: boolean;
    showMiniChat?: boolean;
    autoApplyCode?: boolean;
    expandCodeBlocks?: boolean;
    ollamaBaseUrl?: string;
};

export const AITab = observer(() => {
    const apiUtils = api.useUtils();
    const { data: userSettings } = api.user.settings.get.useQuery();
    const { mutate: updateSettings } = api.user.settings.upsert.useMutation({
        onSuccess: () => void apiUtils.user.settings.get.invalidate(),
        onError: () => {
            void apiUtils.user.settings.get.invalidate();
            toast.error('Failed to save AI settings');
        },
    });

    const pending = useRef<PendingAI>({});

    const debouncedSave = useMemo(
        () =>
            debounce(() => {
                if (Object.keys(pending.current).length === 0) return;
                const next = pending.current;
                pending.current = {};
                updateSettings(next);
            }, 400),
        [updateSettings],
    );

    useEffect(() => () => debouncedSave.cancel(), [debouncedSave]);

    const patch = (changes: PendingAI) => {
        apiUtils.user.settings.get.setData(undefined, (current) => {
            if (!current) return current;
            return { ...current, chat: { ...current.chat, ...changes } };
        });
        pending.current = { ...pending.current, ...changes };
        debouncedSave();
    };

    const ai = userSettings?.chat;

    // Local model detection state
    const [localModels, setLocalModels] = useState<LocalModelOption[]>([]);
    const [localModelsLoading, setLocalModelsLoading] = useState(false);
    const [ollamaUrlInput, setOllamaUrlInput] = useState<string>(
        userSettings?.chat?.ollamaBaseUrl ?? OLLAMA_DEFAULT_BASE_URL,
    );

    // Sync input if settings load after mount
    useEffect(() => {
        if (userSettings?.chat?.ollamaBaseUrl !== undefined) {
            setOllamaUrlInput(userSettings.chat.ollamaBaseUrl ?? OLLAMA_DEFAULT_BASE_URL);
        }
    }, [userSettings?.chat?.ollamaBaseUrl]);

    const detectLocalModels = (baseUrl: string, signal?: AbortSignal) => {
        setLocalModelsLoading(true);
        const params = new URLSearchParams({ baseUrl });
        fetch(`/api/models/local?${params.toString()}`, { signal })
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            })
            .then((data: { available: boolean; models: LocalModelOption[] }) => {
                setLocalModels(data.models ?? []);
            })
            .catch((err) => {
                if (err instanceof Error && err.name === 'AbortError') return;
                setLocalModels([]);
            })
            .finally(() => setLocalModelsLoading(false));
    };

    // Auto-detect on mount and when saved URL changes
    useEffect(() => {
        const controller = new AbortController();
        detectLocalModels(userSettings?.chat?.ollamaBaseUrl ?? OLLAMA_DEFAULT_BASE_URL, controller.signal);
        return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userSettings?.chat?.ollamaBaseUrl]);

    const handleOllamaUrlBlur = () => {
        const trimmed = ollamaUrlInput.trim() || OLLAMA_DEFAULT_BASE_URL;
        patch({ ollamaBaseUrl: trimmed });
        detectLocalModels(trimmed);
    };

    const ToggleRow = ({
        label,
        description,
        field,
        defaultValue = false,
    }: {
        label: string;
        description: string;
        field: keyof Pick<
            PendingAI,
            'showSuggestions' | 'showMiniChat' | 'autoApplyCode' | 'expandCodeBlocks'
        >;
        defaultValue?: boolean;
    }) => (
        <div className="flex items-center justify-between gap-4">
            <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-muted-foreground text-sm">{description}</p>
            </div>
            <Switch
                checked={ai?.[field] ?? defaultValue}
                onCheckedChange={(v) => patch({ [field]: v })}
            />
        </div>
    );

    return (
        <div className="flex flex-col gap-8 p-6">
            {/* Default model */}
            <section className="border-border/60 bg-background-secondary/30 space-y-4 rounded-lg border p-4">
                <div>
                    <h2 className="text-base font-medium">Default model</h2>
                    <p className="text-muted-foreground text-sm">
                        Pre-selected when you open a new chat.
                    </p>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Model</Label>
                    <Select
                        value={ai?.defaultModel ?? CHAT_MODEL_OPTIONS[0]?.model ?? ''}
                        onValueChange={(v) => patch({ defaultModel: v })}
                    >
                        <SelectTrigger className="w-72">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {CHAT_MODEL_OPTIONS.map((opt) => (
                                <SelectItem key={opt.model} value={opt.model}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                            {localModels.length > 0 && (
                                <>
                                    <SelectSeparator />
                                    {localModels.map((opt) => (
                                        <SelectItem key={opt.model} value={opt.model}>
                                            {opt.label}
                                            {opt.size ? ` (${opt.size})` : ''}
                                        </SelectItem>
                                    ))}
                                </>
                            )}
                        </SelectContent>
                    </Select>
                </div>
            </section>

            {/* Local models (Ollama) */}
            <section className="border-border/60 bg-background-secondary/30 space-y-4 rounded-lg border p-4">
                <div>
                    <h2 className="text-base font-medium">Local models</h2>
                    <p className="text-muted-foreground text-sm">
                        Use locally-running models via Ollama.
                    </p>
                </div>
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs">Ollama server URL</Label>
                        <div className="flex items-center gap-2">
                            <Input
                                className="w-64 text-sm"
                                value={ollamaUrlInput}
                                onChange={(e) => setOllamaUrlInput(e.target.value)}
                                onBlur={handleOllamaUrlBlur}
                                placeholder={OLLAMA_DEFAULT_BASE_URL}
                            />
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={localModelsLoading}
                                onClick={() =>
                                    detectLocalModels(
                                        ollamaUrlInput.trim() || OLLAMA_DEFAULT_BASE_URL,
                                    )
                                }
                            >
                                {localModelsLoading ? 'Detecting…' : 'Detect'}
                            </Button>
                        </div>
                    </div>
                    <p className="text-muted-foreground text-xs">
                        {localModelsLoading
                            ? 'Looking for Ollama…'
                            : localModels.length > 0
                              ? `${localModels.length} model${localModels.length === 1 ? '' : 's'} detected: ${localModels.map((m) => m.label).join(', ')}`
                              : 'No local models detected. Make sure Ollama is running.'}
                    </p>
                </div>
            </section>

            {/* Chat behaviour */}
            <section className="border-border/60 bg-background-secondary/30 space-y-4 rounded-lg border p-4">
                <div>
                    <h2 className="text-base font-medium">Chat behaviour</h2>
                </div>
                <div className="space-y-3">
                    <ToggleRow
                        field="showSuggestions"
                        label="Show prompt suggestions"
                        description="Keep prompt chips visible in the AI panel."
                        defaultValue={true}
                    />
                    <ToggleRow
                        field="showMiniChat"
                        label="Show mini chat on canvas"
                        description="Inline chat entry point while editing."
                    />
                    <ToggleRow
                        field="autoApplyCode"
                        label="Auto-apply code changes"
                        description="Apply AI-suggested code without a manual step."
                        defaultValue={true}
                    />
                    <ToggleRow
                        field="expandCodeBlocks"
                        label="Expand code blocks by default"
                        description="Show code blocks expanded in the chat."
                    />
                </div>
            </section>
        </div>
    );
});
