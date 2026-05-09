'use client';

import { useEffect, useMemo, useState } from 'react';

import type { ProviderManifestEntry, ProviderModelEntry, ProviderStatus } from '@weblab/ai/client';
import type { ChatModel, LocalModelOption } from '@weblab/models';
import { PROVIDER_MANIFEST } from '@weblab/ai/client';
import { Button } from '@weblab/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from '@weblab/ui/command';
import { Icons } from '@weblab/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

import { api } from '@/trpc/react';
import { ProviderSetupDialog } from './provider-setup-dialog';
import { PullModelDialog } from './pull-model-dialog';
import { useProviderStatuses } from './use-provider-statuses';

function ProviderIcon({ name, className }: { name: string; className?: string }) {
    const Icon = (Icons as Record<string, React.ComponentType<{ className?: string }>>)[name];
    if (!Icon) return <Icons.Cube className={className} />;
    return <Icon className={className} />;
}

function statusActionLabel(status: ProviderStatus): string | null {
    if (status.kind === 'install') return 'Install';
    if (status.kind === 'sign-in') return 'Sign in';
    if (status.kind === 'desktop-only') return 'Desktop only';
    return null;
}

function modelsForEntry(
    entry: ProviderManifestEntry,
    status: ProviderStatus,
): ReadonlyArray<ProviderModelEntry> {
    if (status.discoveredModels && status.discoveredModels.length > 0)
        return status.discoveredModels;
    return entry.models;
}

function findCurrentLabel({
    value,
    localModels,
}: {
    value: ChatModel;
    localModels: ReadonlyArray<LocalModelOption>;
}): string {
    for (const entry of PROVIDER_MANIFEST) {
        const match = entry.models.find((m) => m.id === (value as string));
        if (match) return match.label;
    }
    const local = localModels.find((m) => m.model === value);
    if (local) return local.label;
    return value;
}

export const ModelSelectorV2 = ({
    value,
    onChange,
    localModels,
    localModelsLoading,
}: {
    value: ChatModel;
    onChange: (model: ChatModel) => void;
    localModels: LocalModelOption[];
    localModelsLoading: boolean;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [setupEntry, setSetupEntry] = useState<ProviderManifestEntry | null>(null);
    const [pullDialogOpen, setPullDialogOpen] = useState(false);
    const { statuses, refresh } = useProviderStatuses({ localModels, localModelsLoading });
    const disconnectMutation = api.provider.connectionsDelete.useMutation({
        onSuccess: () => refresh(),
    });
    const hasCliBridge =
        typeof window !== 'undefined' && Boolean(window.weblabNative?.cli?.providerStatus);

    useEffect(() => {
        const handleOpen = () => setIsOpen(true);
        window.addEventListener('open-model-selector', handleOpen);
        return () => window.removeEventListener('open-model-selector', handleOpen);
    }, []);

    // Surface OAuth callback errors. The callback redirects back to the page
    // that started the flow with `?provider_oauth_error=<code>` on failure.
    // Show it as a toast and strip the param so it doesn't re-fire on the
    // next router push or refresh.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const url = new URL(window.location.href);
        const errorCode = url.searchParams.get('provider_oauth_error');
        if (!errorCode) return;
        const friendly =
            errorCode === 'token_exchange_failed'
                ? 'Sign-in failed during token exchange.'
                : errorCode === 'provider_not_configured'
                  ? 'This provider has no OAuth credentials configured on the server yet.'
                  : errorCode === 'invalid_callback'
                    ? 'Sign-in callback was invalid. Try again.'
                    : `Sign-in failed: ${errorCode}`;
        toast.error('Provider sign-in failed', { description: friendly });
        url.searchParams.delete('provider_oauth_error');
        window.history.replaceState({}, '', url.toString());
    }, []);

    const currentLabel = useMemo(
        () => findCurrentLabel({ value, localModels }),
        [value, localModels],
    );

    const cloud = PROVIDER_MANIFEST.find((e) => e.kind === 'openrouter');
    const subProviders = PROVIDER_MANIFEST.filter((e) => e.kind !== 'openrouter');

    const selectedId = value as string;

    const handleSelectModel = (id: string) => {
        onChange(id as ChatModel);
        setIsOpen(false);
    };

    const handleDisconnect = (entry: ProviderManifestEntry) => {
        if (
            entry.kind === 'codex' ||
            entry.kind === 'cursor' ||
            entry.kind === 'gemini' ||
            entry.kind === 'opencode'
        ) {
            disconnectMutation.mutate({ provider: entry.kind });
        }
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-foreground-secondary hover:bg-background-secondary hover:text-foreground-primary text-mini h-8 gap-1.5 px-2"
                >
                    <Icons.ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    <span className="max-w-[80px] truncate @[260px]:max-w-[160px]">
                        {currentLabel}
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 overflow-hidden p-0">
                <Command
                    // Search both the visible label and the underlying model id
                    // so a user can type "sonnet" or "claude-3-5-sonnet" and
                    // both resolve. cmdk does substring + token matching.
                    filter={(itemValue, search) => {
                        if (!search) return 1;
                        const haystack = itemValue.toLowerCase();
                        const needle = search.toLowerCase();
                        if (haystack.includes(needle)) return 1;
                        // Token match: every search term must appear somewhere.
                        const tokens = needle.split(/\s+/).filter(Boolean);
                        return tokens.every((t) => haystack.includes(t)) ? 0.5 : 0;
                    }}
                >
                    <CommandInput placeholder="Search models…" autoFocus />
                    <CommandList className="max-h-[360px]">
                        <CommandEmpty>No models found.</CommandEmpty>

                        {cloud && cloud.models.length > 0 && (
                            <CommandGroup heading="Cloud models">
                                {cloud.models.map((option) => (
                                    <CommandItem
                                        key={`openrouter:${option.id}`}
                                        value={`${option.label} ${option.id} openrouter cloud`}
                                        onSelect={() => handleSelectModel(option.id)}
                                        className={cn(
                                            'flex flex-col items-start gap-0.5 px-3 py-2',
                                            option.id === selectedId && 'bg-background-weblab',
                                        )}
                                    >
                                        <span className="text-small font-medium">
                                            {option.label}
                                        </span>
                                        <span className="text-foreground-tertiary text-mini">
                                            {option.id}
                                        </span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}

                        {subProviders.map((entry) => {
                            const status = statuses[entry.kind];
                            const actionLabel = statusActionLabel(status);
                            const ready = status.kind === 'ready';
                            const loading = status.kind === 'loading';
                            const models = ready ? modelsForEntry(entry, status) : [];

                            // Provider not ready: show a single actionable row
                            // that opens the setup dialog (or is disabled for
                            // desktop-only / loading).
                            if (!ready) {
                                if (loading) {
                                    return (
                                        <CommandGroup key={entry.kind} heading={entry.label}>
                                            <CommandItem
                                                disabled
                                                value={`${entry.label} loading`}
                                                className="text-mini px-3 py-2"
                                            >
                                                <ProviderIcon
                                                    name={entry.icon}
                                                    className="mr-2 h-4 w-4 shrink-0"
                                                />
                                                Detecting…
                                            </CommandItem>
                                        </CommandGroup>
                                    );
                                }
                                if (status.kind === 'desktop-only') {
                                    return (
                                        <CommandGroup key={entry.kind} heading={entry.label}>
                                            <CommandItem
                                                disabled
                                                value={`${entry.label} desktop`}
                                                className="text-mini px-3 py-2 opacity-60"
                                            >
                                                <ProviderIcon
                                                    name={entry.icon}
                                                    className="mr-2 h-4 w-4 shrink-0"
                                                />
                                                Available in the Weblab desktop app
                                            </CommandItem>
                                        </CommandGroup>
                                    );
                                }
                                // install / sign-in
                                return (
                                    <CommandGroup key={entry.kind} heading={entry.label}>
                                        <CommandItem
                                            value={`${entry.label} ${actionLabel ?? ''}`}
                                            onSelect={() => {
                                                setSetupEntry(entry);
                                                setIsOpen(false);
                                            }}
                                            className="text-mini px-3 py-2"
                                        >
                                            <ProviderIcon
                                                name={entry.icon}
                                                className="mr-2 h-4 w-4 shrink-0"
                                            />
                                            <span className="text-small font-medium">
                                                {actionLabel === 'Install'
                                                    ? `Install ${entry.label}…`
                                                    : `Sign in to ${entry.label}…`}
                                            </span>
                                        </CommandItem>
                                    </CommandGroup>
                                );
                            }

                            // Ready provider: flat list of its models.
                            return (
                                <CommandGroup key={entry.kind} heading={entry.label}>
                                    {models.length === 0 ? (
                                        <CommandItem
                                            disabled
                                            value={`${entry.label} empty`}
                                            className="text-mini px-3 py-2"
                                        >
                                            No models available
                                        </CommandItem>
                                    ) : (
                                        models.map((m) => (
                                            <CommandItem
                                                key={`${entry.kind}:${m.id}`}
                                                value={`${m.label} ${m.id} ${entry.label}`}
                                                onSelect={() => handleSelectModel(m.id)}
                                                className={cn(
                                                    'flex flex-col items-start gap-0.5 px-3 py-2',
                                                    m.id === selectedId && 'bg-background-weblab',
                                                )}
                                            >
                                                <span className="text-small font-medium">
                                                    {m.label}
                                                </span>
                                                <span className="text-foreground-tertiary text-mini">
                                                    {m.id}
                                                </span>
                                            </CommandItem>
                                        ))
                                    )}

                                    {entry.ollamaSpecials && hasCliBridge && (
                                        <>
                                            <CommandItem
                                                value={`${entry.label} pull model`}
                                                onSelect={() => {
                                                    setPullDialogOpen(true);
                                                    setIsOpen(false);
                                                }}
                                                className="text-mini px-3 py-2"
                                            >
                                                Pull model…
                                            </CommandItem>
                                            <CommandItem
                                                value={`${entry.label} quit ollama`}
                                                onSelect={() => {
                                                    void window.weblabNative?.cli?.ollamaQuit?.();
                                                }}
                                                className="text-mini px-3 py-2"
                                            >
                                                Quit Ollama
                                            </CommandItem>
                                        </>
                                    )}

                                    {/* Disconnect surfaces only when the user signed in via web OAuth
                                        (no desktop bridge AND a webOAuth provider). It calls the tRPC
                                        mutation that deletes the stored connection and triggers a
                                        status refresh. */}
                                    {entry.webOAuth && !hasCliBridge && (
                                        <CommandItem
                                            value={`${entry.label} disconnect`}
                                            onSelect={() => handleDisconnect(entry)}
                                            className="text-mini px-3 py-2"
                                        >
                                            Disconnect {entry.label}
                                        </CommandItem>
                                    )}

                                    {entry.supportsCustomModel && (
                                        <CommandItem
                                            disabled
                                            value={`${entry.label} custom model`}
                                            className="text-mini px-3 py-2"
                                            title="Coming in a follow-up"
                                        >
                                            Custom model…
                                        </CommandItem>
                                    )}
                                </CommandGroup>
                            );
                        })}

                        <CommandSeparator className="hidden" />
                    </CommandList>
                </Command>
            </PopoverContent>
            {setupEntry && (
                <ProviderSetupDialog
                    entry={setupEntry}
                    status={statuses[setupEntry.kind]}
                    open={setupEntry !== null}
                    onOpenChange={(open) => {
                        if (!open) setSetupEntry(null);
                    }}
                    onRecheck={refresh}
                />
            )}
            {/* Pull dialog only mounts when the desktop bridge is present.
                On hosted web the menu item that opens it is already gated by
                the Ollama submenu's status, but if a self-hosted setup somehow
                makes Ollama 'ready' on web, we still don't want a dialog that
                immediately fails — better to never offer it. */}
            {hasCliBridge && (
                <PullModelDialog open={pullDialogOpen} onOpenChange={setPullDialogOpen} />
            )}
        </Popover>
    );
};
