'use client';

import { useEffect, useMemo, useState } from 'react';

import type { ProviderManifestEntry, ProviderModelEntry, ProviderStatus } from '@weblab/ai/client';
import type { ChatModel, LocalModelOption, ReasoningEffort } from '@weblab/models';
import { inferProviderFromModelId, PROVIDER_MANIFEST } from '@weblab/ai/client';
import { APP_NAME } from '@weblab/constants';
import { modelSupportsReasoningEffort } from '@weblab/models';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@weblab/ui/alert-dialog';
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
import { ReasoningEffortPills } from './reasoning-effort-pills';
import { useProviderStatuses } from './use-provider-statuses';

function ProviderIcon({ name, className }: { name: string; className?: string }) {
    const Icon = (Icons as Record<string, React.ComponentType<{ className?: string }>>)[name];
    if (!Icon) return <Icons.Cube className={className} />;
    return <Icon className={className} />;
}

function StatusPill({ status }: { status: ProviderStatus }) {
    if (status.kind === 'ready' || status.kind === 'loading') return null;
    const label =
        status.kind === 'install'
            ? 'Install'
            : status.kind === 'sign-in'
              ? 'Sign in'
              : 'Desktop only';
    return (
        <span className="text-foreground-tertiary ml-auto pl-2 text-[10px] font-normal whitespace-nowrap">
            {label}
        </span>
    );
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
    reasoningEffort,
    onReasoningEffortChange,
}: {
    value: ChatModel;
    onChange: (model: ChatModel) => void;
    localModels: LocalModelOption[];
    localModelsLoading: boolean;
    reasoningEffort?: ReasoningEffort;
    onReasoningEffortChange?: (effort: ReasoningEffort) => void;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [setupEntry, setSetupEntry] = useState<ProviderManifestEntry | null>(null);
    const [pullDialogOpen, setPullDialogOpen] = useState(false);
    const [disconnectTarget, setDisconnectTarget] = useState<ProviderManifestEntry | null>(null);
    const { statuses, refresh } = useProviderStatuses({ localModels, localModelsLoading });
    const disconnectMutation = api.provider.connectionsDelete.useMutation({
        onSuccess: (_, vars) => {
            refresh();
            toast.success(`Disconnected ${vars.provider}`);
        },
        onError: () => toast.error('Disconnect failed. Try again.'),
    });
    const hasCliBridge =
        typeof window !== 'undefined' && Boolean(window.weblabNative?.cli?.providerStatus);

    useEffect(() => {
        const handleOpen = () => setIsOpen(true);
        window.addEventListener('open-model-selector', handleOpen);
        return () => window.removeEventListener('open-model-selector', handleOpen);
    }, []);

    // Surface OAuth callback errors. Keyed messages cover the common failure
    // codes; unknown codes get a generic line so we never echo raw env-var
    // names back to the user.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const url = new URL(window.location.href);
        const errorCode = url.searchParams.get('provider_oauth_error');
        if (!errorCode) return;
        const friendly =
            errorCode === 'token_exchange_failed'
                ? 'Sign-in failed during token exchange. Try again.'
                : errorCode === 'provider_not_configured'
                  ? "This provider isn't available yet. We'll enable it soon."
                  : errorCode === 'invalid_callback'
                    ? 'Sign-in callback was invalid. Try again.'
                    : 'Sign-in failed. Try again in a moment.';
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

    // Open the setup dialog AFTER the popover finishes closing so Radix's
    // focus traps don't fight: closing popover yields focus, then the dialog
    // claims it. Without the rAF, the dialog can fail to mount visibly.
    const openSetup = (entry: ProviderManifestEntry) => {
        setIsOpen(false);
        requestAnimationFrame(() => setSetupEntry(entry));
    };

    const openPullDialog = () => {
        setIsOpen(false);
        requestAnimationFrame(() => setPullDialogOpen(true));
    };

    const requestDisconnect = (entry: ProviderManifestEntry) => {
        setIsOpen(false);
        // Defer dialog mount until popover focus trap releases (same pattern
        // as openSetup) so the AlertDialog mounts visibly.
        requestAnimationFrame(() => setDisconnectTarget(entry));
    };

    const confirmDisconnect = () => {
        const entry = disconnectTarget;
        if (!entry) return;
        if (
            entry.kind === 'codex' ||
            entry.kind === 'cursor' ||
            entry.kind === 'gemini' ||
            entry.kind === 'opencode'
        ) {
            disconnectMutation.mutate({ provider: entry.kind });
        }
        setDisconnectTarget(null);
    };

    const handleQuitOllama = () => {
        const quit = window.weblabNative?.cli?.ollamaQuit;
        if (!quit) return;
        void quit()
            .then(() => {
                refresh();
                toast.success('Ollama stopped');
            })
            .catch(() => toast.error('Failed to stop Ollama'));
    };

    // Resolve current model's provider so the trigger can show its icon. Falls
    // back to the cloud sparkle if inference can't match (legacy/free-form ID).
    const currentProviderKind = inferProviderFromModelId(value as string);
    const currentProviderEntry = PROVIDER_MANIFEST.find((e) => e.kind === currentProviderKind);
    const currentIconName = currentProviderEntry?.icon ?? 'Sparkles';

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Model: ${currentLabel}`}
                    className="text-foreground-secondary hover:bg-background-secondary hover:text-foreground-primary h-8 gap-1 px-2 text-xs"
                >
                    <ProviderIcon
                        name={currentIconName}
                        className="text-foreground-tertiary h-3.5 w-3.5 shrink-0 hide hidden"
                    />
                    <span
                        title={currentLabel}
                        className="max-w-[80px] truncate @[260px]:max-w-[160px]"
                    >
                        {currentLabel}
                    </span>
                    <Icons.ChevronDown className="text-foreground-tertiary h-3 w-2.5 shrink-0" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                sideOffset={6}
                className="border-border bg-popover w-72 overflow-hidden rounded-lg p-0 shadow-xl"
            >
                <Command
                    className="bg-transparent"
                    filter={(itemValue, search) => {
                        if (!search) return 1;
                        const haystack = itemValue.toLowerCase();
                        const needle = search.toLowerCase();
                        if (haystack.includes(needle)) return 1;
                        const tokens = needle.split(/\s+/).filter(Boolean);
                        return tokens.every((t) => haystack.includes(t)) ? 0.5 : 0;
                    }}
                >
                    <CommandInput placeholder="Search models…" autoFocus className="h-9 text-xs" />
                    <CommandList className="max-h-[360px] py-1">
                        <CommandEmpty className="text-foreground-tertiary px-3 py-4 text-center text-xs">
                            No models found.
                        </CommandEmpty>

                        {cloud && cloud.models.length > 0 && (
                            <CommandGroup
                                heading="Cloud"
                                className="[&_[cmdk-group-heading]]:text-foreground-tertiary [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:uppercase"
                            >
                                {cloud.models.map((option) => (
                                    <CommandItem
                                        key={`openrouter:${option.id}`}
                                        value={`${option.label} ${option.id} openrouter cloud`}
                                        onSelect={() => handleSelectModel(option.id)}
                                        className={cn(
                                            'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs',
                                            option.id === selectedId && 'bg-background-secondary',
                                        )}
                                    >
                                        <Icons.Sparkles className="text-foreground-tertiary h-3.5 w-3.5 shrink-0" />
                                        <span className="text-foreground-primary truncate font-medium">
                                            {option.label}
                                        </span>
                                        {option.id === selectedId && (
                                            <Icons.Check className="text-foreground-secondary ml-auto h-3.5 w-3.5 shrink-0" />
                                        )}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}

                        {subProviders.map((entry) => {
                            const status = statuses[entry.kind];
                            const ready = status.kind === 'ready';
                            const loading = status.kind === 'loading';
                            const models = ready ? modelsForEntry(entry, status) : [];

                            const groupClass =
                                '[&_[cmdk-group-heading]]:text-foreground-tertiary [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:flex [&_[cmdk-group-heading]]:items-center [&_[cmdk-group-heading]]:gap-1.5';

                            if (loading) {
                                return (
                                    <CommandGroup
                                        key={entry.kind}
                                        heading={entry.label}
                                        className={groupClass}
                                    >
                                        <CommandItem
                                            disabled
                                            value={`${entry.label} loading`}
                                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
                                        >
                                            <ProviderIcon
                                                name={entry.icon}
                                                className="text-foreground-tertiary h-3.5 w-3.5 shrink-0"
                                            />
                                            <span className="text-foreground-tertiary">
                                                Detecting…
                                            </span>
                                        </CommandItem>
                                    </CommandGroup>
                                );
                            }
                            if (status.kind === 'desktop-only') {
                                return (
                                    <CommandGroup
                                        key={entry.kind}
                                        heading={entry.label}
                                        className={groupClass}
                                    >
                                        <CommandItem
                                            disabled
                                            value={`${entry.label} desktop`}
                                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs opacity-60"
                                        >
                                            <ProviderIcon
                                                name={entry.icon}
                                                className="text-foreground-tertiary h-3.5 w-3.5 shrink-0"
                                            />
                                            <span className="text-foreground-secondary truncate">
                                                Available in the {APP_NAME} desktop app
                                            </span>
                                        </CommandItem>
                                    </CommandGroup>
                                );
                            }
                            if (status.kind === 'install' || status.kind === 'sign-in') {
                                const action =
                                    status.kind === 'install'
                                        ? `Install ${entry.label}…`
                                        : `Sign in to ${entry.label}…`;
                                return (
                                    <CommandGroup
                                        key={entry.kind}
                                        heading={entry.label}
                                        className={groupClass}
                                    >
                                        <CommandItem
                                            value={`${entry.label} ${action}`}
                                            onSelect={() => openSetup(entry)}
                                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
                                        >
                                            <ProviderIcon
                                                name={entry.icon}
                                                className="text-foreground-secondary h-3.5 w-3.5 shrink-0"
                                            />
                                            <span className="text-foreground-primary truncate">
                                                {action}
                                            </span>
                                            <StatusPill status={status} />
                                        </CommandItem>
                                    </CommandGroup>
                                );
                            }

                            // Ready
                            return (
                                <CommandGroup
                                    key={entry.kind}
                                    heading={entry.label}
                                    className={groupClass}
                                >
                                    {models.length === 0 ? (
                                        <CommandItem
                                            disabled
                                            value={`${entry.label} empty`}
                                            className="text-foreground-tertiary rounded-md px-2 py-1.5 text-xs"
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
                                                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs',
                                                    m.id === selectedId &&
                                                        'bg-background-secondary',
                                                )}
                                            >
                                                <ProviderIcon
                                                    name={entry.icon}
                                                    className="text-foreground-tertiary h-3.5 w-3.5 shrink-0"
                                                />
                                                <span className="text-foreground-primary truncate font-medium">
                                                    {m.label}
                                                </span>
                                                {m.id === selectedId && (
                                                    <Icons.Check className="text-foreground-secondary ml-auto h-3.5 w-3.5 shrink-0" />
                                                )}
                                            </CommandItem>
                                        ))
                                    )}

                                    {entry.ollamaSpecials && hasCliBridge && (
                                        <>
                                            <CommandItem
                                                value={`${entry.label} pull model`}
                                                onSelect={openPullDialog}
                                                className="text-foreground-secondary flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
                                            >
                                                <Icons.Plus className="h-3.5 w-3.5 shrink-0" />
                                                <span>Pull model…</span>
                                            </CommandItem>
                                            <CommandItem
                                                value={`${entry.label} quit ollama`}
                                                onSelect={handleQuitOllama}
                                                className="text-foreground-secondary flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
                                            >
                                                <Icons.Stop className="h-3.5 w-3.5 shrink-0" />
                                                <span>Quit Ollama</span>
                                            </CommandItem>
                                        </>
                                    )}

                                    {entry.webOAuth && !hasCliBridge && (
                                        <CommandItem
                                            value={`${entry.label} disconnect`}
                                            onSelect={() => requestDisconnect(entry)}
                                            disabled={disconnectMutation.isPending}
                                            className="text-foreground-tertiary flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
                                        >
                                            <span>
                                                {disconnectMutation.isPending &&
                                                disconnectMutation.variables?.provider ===
                                                    entry.kind
                                                    ? `Disconnecting ${entry.label}…`
                                                    : `Disconnect ${entry.label}`}
                                            </span>
                                        </CommandItem>
                                    )}
                                </CommandGroup>
                            );
                        })}

                        <CommandSeparator className="hidden" />
                    </CommandList>
                </Command>
                {reasoningEffort &&
                    onReasoningEffortChange &&
                    modelSupportsReasoningEffort(value) && (
                        <div className="border-border/40 border-t px-3 py-2">
                            <ReasoningEffortPills
                                value={reasoningEffort}
                                onChange={onReasoningEffortChange}
                            />
                        </div>
                    )}
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
            {hasCliBridge && (
                <PullModelDialog open={pullDialogOpen} onOpenChange={setPullDialogOpen} />
            )}
            <AlertDialog
                open={disconnectTarget !== null}
                onOpenChange={(open) => {
                    if (!open) setDisconnectTarget(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect {disconnectTarget?.label}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            You&apos;ll need to sign in again to use {disconnectTarget?.label}{' '}
                            models.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDisconnect}>
                            Disconnect
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Popover>
    );
};
