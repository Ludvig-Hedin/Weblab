'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';

import type { ProviderManifestEntry, ProviderModelEntry, ProviderStatus } from '@weblab/ai/client';
import type { ChatModel, LocalModelOption, ReasoningEffort } from '@weblab/models';
import { CLI_CHAT_PROVIDER_KINDS, PROVIDER_MANIFEST } from '@weblab/ai/client';
import { APP_NAME } from '@weblab/constants';
import { isProOnlyModel, modelSupportsReasoningEffort } from '@weblab/models';
import { ProductType } from '@weblab/stripe';
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

import { useStateManager } from '@/components/store/state';
import { useHasAuthCookie } from '@/hooks/use-has-auth-cookie';
import { ProviderSetupDialog } from './provider-setup-dialog';
import { PullModelDialog } from './pull-model-dialog';
import { ReasoningEffortPills } from './reasoning-effort-pills';
import { useProviderStatuses } from './use-provider-statuses';

function ProviderIcon({ name, className }: { name: string; className?: string }) {
    const Icon = (Icons as Record<string, React.ComponentType<{ className?: string }>>)[name];
    if (!Icon) return <Icons.Cube className={className} />;
    return <Icon className={className} />;
}

const MODEL_DESCRIPTIONS: Record<string, string> = {
    auto: 'Picks the best model per task automatically',
    'openai/gpt-6-astra': 'Flagship GPT for the hardest, longest tasks',
    'openai/gpt-6-sol': 'Strong GPT for everyday coding and reasoning',
    'openai/gpt-6-luna': 'Fast, low-cost GPT for quick edits',
    'anthropic/claude-opus-5.5': 'Most capable Claude for the hardest tasks',
    'google/gemini-3.1-pro-preview': "Google's latest flagship model",
    'x-ai/grok-4.7': 'Strong at coding and long agent tasks',
    'x-ai/grok-4.6': 'Fast frontier model for coding',
    'deepseek/deepseek-v4.1-flash': 'Low-cost open model with a huge context',
};

function cloudProviderIconName(modelId: string | undefined): string {
    if (!modelId) return 'Sparkles';
    if (modelId.startsWith('anthropic/')) return 'ClaudeLogo';
    if (modelId.startsWith('openai/')) return 'OpenAiLogo';
    if (modelId.startsWith('google/')) return 'GeminiMonoLogo';
    if (modelId.startsWith('deepseek/')) return 'DeepSeekLogo';
    if (modelId.startsWith('x-ai/')) return 'GrokLogo';
    return 'Sparkles';
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
        <span className="text-foreground-tertiary ml-auto pl-2 text-tiny font-normal whitespace-nowrap">
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
    // Search box is hidden by default. Flip `showSearch` on to surface the
    // filter input (the cmdk filter still works when shown). Kept off here to
    // match the build/plan dropdown's plain-list feel.
    showSearch = false,
    cliUnavailableReason = null,
}: {
    value: ChatModel;
    onChange: (model: ChatModel) => void;
    localModels: LocalModelOption[];
    localModelsLoading: boolean;
    reasoningEffort?: ReasoningEffort;
    onReasoningEffortChange?: (effort: ReasoningEffort) => void;
    /** Show the search/filter input atop the model list. Default: false. */
    showSearch?: boolean;
    /** Why CLI models can't run here (cloud project). Shown on a disabled row. */
    cliUnavailableReason?: string | null;
}) => {
    const safety = useTranslations('desktopSafety');
    const [isOpen, setIsOpen] = useState(false);
    const stateManager = useStateManager();
    const hasAuthCookie = useHasAuthCookie();
    const subscription = useQuery(api.subscriptions.get, hasAuthCookie === true ? {} : 'skip');
    const isPro = subscription?.product?.type === ProductType.PRO;
    const [setupEntry, setSetupEntry] = useState<ProviderManifestEntry | null>(null);
    const [pullDialogOpen, setPullDialogOpen] = useState(false);
    const [disconnectTarget, setDisconnectTarget] = useState<ProviderManifestEntry | null>(null);
    const { statuses, refresh } = useProviderStatuses({
        localModels,
        localModelsLoading,
    });
    const deleteProviderConnection = useMutation(api.users.deleteProviderConnection);
    const [disconnectingProvider, setDisconnectingProvider] = useState<string | null>(null);
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
    // Desktop only: CLI providers whose adapter can run a chat turn. The rest
    // (Gemini, OpenCode, Cursor, Ollama) stay hidden until they work end to end.
    const subProviders = hasCliBridge
        ? PROVIDER_MANIFEST.filter((e) => CLI_CHAT_PROVIDER_KINDS.includes(e.kind))
        : [];

    const selectedId = value as string;

    // cmdk auto-highlights the first row at rest; point its initial highlight at
    // the currently-selected model instead so the rest-state matches the
    // build/plan dropdown (only the chosen row is highlighted until hover).
    const selectedCloudOption = cloud?.models.find((m) => m.id === selectedId);
    const selectedCloudValue = selectedCloudOption
        ? `${selectedCloudOption.label} ${selectedCloudOption.id} openrouter cloud`
        : undefined;

    const handleSelectModel = (id: string) => {
        if (isProOnlyModel(id) && !isPro) {
            setIsOpen(false);
            if (hasAuthCookie) {
                stateManager.setIsSubscriptionModalOpen(true);
            } else {
                toast.info('This model is available on Pro.');
            }
            return;
        }
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

    const confirmDisconnect = async () => {
        const entry = disconnectTarget;
        setDisconnectTarget(null);
        if (!entry) return;
        if (
            entry.kind === 'codex' ||
            entry.kind === 'cursor' ||
            entry.kind === 'gemini' ||
            entry.kind === 'opencode'
        ) {
            setDisconnectingProvider(entry.kind);
            try {
                await deleteProviderConnection({ provider: entry.kind });
                refresh();
                toast.success(`Disconnected ${entry.kind}`);
            } catch {
                toast.error('Disconnect failed. Try again.');
            } finally {
                setDisconnectingProvider(null);
            }
        }
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

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Model: ${currentLabel}`}
                    className="text-foreground-tertiary hover:bg-background-tertiary hover:text-foreground-primary h-7 gap-1 px-1.5 text-xs font-normal"
                >
                    <Icons.Cpu className="h-3 w-3 shrink-0" />
                    <span title={currentLabel} className="max-w-[160px] truncate">
                        {currentLabel}
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                sideOffset={6}
                className="border-border bg-popover w-72 overflow-hidden rounded-lg p-0 shadow-xl"
            >
                <Command
                    className="bg-transparent"
                    defaultValue={selectedCloudValue}
                    filter={(itemValue, search) => {
                        if (!search) return 1;
                        const haystack = itemValue.toLowerCase();
                        const needle = search.toLowerCase();
                        if (haystack.includes(needle)) return 1;
                        const tokens = needle.split(/\s+/).filter(Boolean);
                        return tokens.every((t) => haystack.includes(t)) ? 0.5 : 0;
                    }}
                >
                    {/* Search input — hidden by default (showSearch=false). Kept here
                        intentionally: flip the prop on to restore the filter box. */}
                    {showSearch && (
                        <CommandInput
                            placeholder="Search models…"
                            autoFocus
                            className="h-9 text-xs"
                        />
                    )}
                    <CommandList className="max-h-[360px] py-1">
                        <CommandEmpty className="text-foreground-tertiary px-3 py-4 text-center text-xs">
                            No models found.
                        </CommandEmpty>

                        {cloud && cloud.models.length > 0 && (
                            <CommandGroup className="[&_[cmdk-group-heading]]:hidden">
                                {cloud.models.map((option) => {
                                    const description = MODEL_DESCRIPTIONS[option.id];
                                    const isSelected = option.id === selectedId;
                                    return (
                                        <CommandItem
                                            key={`openrouter:${option.id}`}
                                            value={`${option.label} ${option.id} openrouter cloud`}
                                            onSelect={() => handleSelectModel(option.id)}
                                            className={cn(
                                                'flex cursor-pointer items-start gap-2.5 rounded-md px-3 py-2',
                                                isSelected && 'bg-accent',
                                            )}
                                        >
                                            <ProviderIcon
                                                name={cloudProviderIconName(option.id)}
                                                className="text-foreground-tertiary mt-0.5 h-4 w-4 shrink-0"
                                            />
                                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                                <span className="text-mini font-medium">
                                                    {option.label}
                                                </span>
                                                {description && (
                                                    <span className="text-foreground-tertiary text-mini">
                                                        {description}
                                                    </span>
                                                )}
                                            </div>
                                            {isProOnlyModel(option.id) && !isPro && (
                                                <span className="text-foreground-tertiary text-tiny border-border mt-0.5 shrink-0 rounded-sm border px-1">
                                                    Pro
                                                </span>
                                            )}
                                            {isSelected && (
                                                <Icons.Check className="text-foreground-secondary mt-0.5 h-3.5 w-3.5 shrink-0" />
                                            )}
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        )}

                        {/* Desktop CLI providers (Claude Code, Codex): run the user's own CLI */}
                        {subProviders.map((entry) => {
                                const status = statuses[entry.kind];
                                const ready = status.kind === 'ready';
                                const loading = status.kind === 'loading';
                                const models = ready ? modelsForEntry(entry, status) : [];

                                const groupClass =
                                    '[&_[cmdk-group-heading]]:text-foreground-tertiary [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-tiny [&_[cmdk-group-heading]]:flex [&_[cmdk-group-heading]]:items-center [&_[cmdk-group-heading]]:gap-1.5';

                                const unavailableReason = cliUnavailableReason ?? (status.kind === 'unavailable'
                                    ? safety(status.unavailableReason === 'isolation-unverified' ? 'isolationUnverified' : 'statusUnverified')
                                    : null);
                                if (unavailableReason) {
                                    return (
                                        <CommandGroup
                                            key={entry.kind}
                                            heading={entry.label}
                                            className={groupClass}
                                        >
                                            <CommandItem
                                                disabled
                                                value={`${entry.label} unavailable`}
                                                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs opacity-60"
                                            >
                                                <ProviderIcon
                                                    name={entry.icon}
                                                    className="text-foreground-tertiary h-3.5 w-3.5 shrink-0"
                                                />
                                                <span className="text-foreground-secondary whitespace-normal">
                                                    {unavailableReason.replace(
                                                        '{provider}',
                                                        entry.label,
                                                    )}
                                                </span>
                                            </CommandItem>
                                        </CommandGroup>
                                    );
                                }

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
                                                disabled={disconnectingProvider !== null}
                                                className="text-foreground-tertiary flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
                                            >
                                                <span>
                                                    {disconnectingProvider === entry.kind
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
                        <AlertDialogAction onClick={() => void confirmDisconnect()}>
                            Disconnect
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Popover>
    );
};
