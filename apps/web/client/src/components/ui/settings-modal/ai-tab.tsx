'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '@convex/_generated/api';
// Uses Convex `getMappedSettings` / `updateMappedSettings` — they return /
// accept the nested {chat, ai, appearance, language, git, customShortcuts}
// shape this file was written against. Optimistic updates removed (Convex
// live queries auto-revalidate after mutation completes; sub-second sync is
// fine for a settings panel).
import { useMutation, useQuery } from 'convex/react';
import { debounce } from 'lodash';
import { observer } from 'mobx-react-lite';

import type { LocalModelOption } from '@weblab/models';
import { CHAT_MODEL_OPTIONS, DEFAULT_CHAT_MODEL, OLLAMA_DEFAULT_BASE_URL } from '@weblab/models';
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
import { cn } from '@weblab/ui/utils';

type PendingAI = {
    defaultModel?: string;
    showSuggestions?: boolean;
    showMiniChat?: boolean;
    autoApplyCode?: boolean;
    expandCodeBlocks?: boolean;
    ollamaBaseUrl?: string;
};

export const AITab = observer(() => {
    const userSettings = useQuery(api.users.getMappedSettings, {});
    const updateMappedSettings = useMutation(api.users.updateMappedSettings);
    const [savedFlash, setSavedFlash] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isMountedRef = useRef(true);

    const updateSettings = (chatPatch: PendingAI) => {
        setIsSaving(true);
        // `updateMappedSettings` accepts the nested shape; pass chat-scoped
        // patches under `chat`. The server flattens before writing.
        updateMappedSettings({ settings: { chat: chatPatch } })
            .then(() => {
                if (isMountedRef.current) {
                    setSavedFlash(true);
                    if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
                    savedFlashTimer.current = setTimeout(() => setSavedFlash(false), 1800);
                }
            })
            .catch(() => {
                toast.error('Failed to save AI settings');
            })
            .finally(() => {
                if (isMountedRef.current) setIsSaving(false);
            });
    };

    useEffect(
        () => () => {
            isMountedRef.current = false;
            if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
        },
        [],
    );

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

    // Flush in-flight pending changes on unmount so closing the modal mid-debounce
    // doesn't drop the user's last edit. cancel() would silently discard it.
    useEffect(() => () => debouncedSave.flush(), [debouncedSave]);

    const patch = (changes: PendingAI) => {
        // Convex live queries auto-revalidate after mutation completes — no
        // optimistic local cache write needed. UI sees the change within ~50ms.
        pending.current = { ...pending.current, ...changes };
        debouncedSave();
    };

    const ai = userSettings?.chat;

    // Local model detection state
    const [localModels, setLocalModels] = useState<LocalModelOption[]>([]);
    const [localModelsLoading, setLocalModelsLoading] = useState(false);
    const [detectionError, setDetectionError] = useState<string | null>(null);
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
        setDetectionError(null);
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
                setDetectionError(
                    err instanceof Error ? err.message : 'Failed to reach Ollama server.',
                );
            })
            .finally(() => setLocalModelsLoading(false));
    };

    // Auto-detect on mount and when saved URL changes
    useEffect(() => {
        const controller = new AbortController();
        detectLocalModels(
            userSettings?.chat?.ollamaBaseUrl ?? OLLAMA_DEFAULT_BASE_URL,
            controller.signal,
        );
        return () => controller.abort();
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
    }) => {
        // Stable per-row id so the visible label clicks toggle the switch.
        const id = useId();
        return (
            <div className="flex items-center justify-between gap-4">
                <label htmlFor={id} className="cursor-pointer">
                    <p className="text-regularPlus">{label}</p>
                    <p className="text-regular text-foreground-tertiary">{description}</p>
                </label>
                <Switch
                    id={id}
                    checked={ai?.[field] ?? defaultValue}
                    onCheckedChange={(v) => patch({ [field]: v })}
                />
            </div>
        );
    };

    const SaveStatus = () => (
        <span className="text-mini">
            {isSaving ? (
                <span className="text-foreground-tertiary">Saving…</span>
            ) : (
                <span
                    className="text-foreground-secondary transition-opacity duration-300"
                    style={{ opacity: savedFlash ? 1 : 0 }}
                >
                    Saved
                </span>
            )}
        </span>
    );

    return (
        <div className="flex flex-col gap-16 p-6">
            {/* Default model */}
            <section className="border-border bg-background-secondary space-y-4 rounded-lg border p-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-largePlus">Default model</h2>
                        <p className="text-regular text-foreground-tertiary">
                            Pre-selected when you open a new chat.
                        </p>
                    </div>
                    <SaveStatus />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-mini">Model</Label>
                    <Select
                        value={ai?.defaultModel ?? DEFAULT_CHAT_MODEL}
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
            <section className="border-border bg-background-secondary space-y-4 rounded-lg border p-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-largePlus">Local models</h2>
                        <p className="text-regular text-foreground-tertiary">
                            Use locally-running models via Ollama.
                        </p>
                    </div>
                    <SaveStatus />
                </div>
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label className="text-mini">Ollama server URL</Label>
                        <div className="flex items-center gap-2">
                            <Input
                                className="text-small w-64"
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
                    <div className="flex items-start gap-2">
                        <span
                            aria-hidden="true"
                            className={cn(
                                'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                                localModelsLoading
                                    ? 'bg-foreground-warning animate-pulse'
                                    : localModels.length > 0
                                      ? 'bg-foreground-success'
                                      : 'bg-foreground-tertiary/40',
                            )}
                        />
                        <p className="text-mini text-foreground-tertiary">
                            {localModelsLoading
                                ? 'Looking for Ollama…'
                                : localModels.length > 0
                                  ? `${localModels.length} model${localModels.length === 1 ? '' : 's'} detected: ${localModels.map((m) => m.label).join(', ')}`
                                  : detectionError
                                    ? `Couldn't reach Ollama: ${detectionError}`
                                    : 'No local models detected. Make sure Ollama is running.'}
                        </p>
                    </div>
                    <p className="text-micro text-foreground-tertiary leading-snug">
                        Detection probes Ollama from the Weblab server, not your browser. On hosted
                        deployments only models reachable from the server are visible — when running
                        self-hosted or in dev, the server probes your own machine&apos;s localhost.
                    </p>
                </div>
            </section>

            {/* Chat behaviour */}
            <section className="border-border bg-background-secondary space-y-4 rounded-lg border p-4">
                <div className="flex items-start justify-between gap-4">
                    <h2 className="text-largePlus">Chat behaviour</h2>
                    <SaveStatus />
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
