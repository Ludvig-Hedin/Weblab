'use client';

import { useEffect, useMemo, useState } from 'react';

import type { ProviderManifestEntry, ProviderModelEntry, ProviderStatus } from '@weblab/ai';
import type { ChatModel, LocalModelOption } from '@weblab/models';
import { PROVIDER_MANIFEST } from '@weblab/ai';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { ProviderSetupDialog } from './provider-setup-dialog';
import { PullModelDialog } from './pull-model-dialog';
import { useProviderStatuses } from './use-provider-statuses';

function ProviderIcon({ name, className }: { name: string; className?: string }) {
    const Icon = (Icons as Record<string, React.ComponentType<{ className?: string }>>)[name];
    if (!Icon) return <Icons.Cube className={className} />;
    return <Icon className={className} />;
}

function StatusBadge({ status }: { status: ProviderStatus }) {
    if (status.kind === 'ready') return null;
    const label =
        status.kind === 'install'
            ? 'Install'
            : status.kind === 'sign-in'
              ? 'Sign in'
              : status.kind === 'desktop-only'
                ? 'Desktop only'
                : null;
    if (!label) return null;
    return <span className="text-foreground-tertiary text-mini ml-auto font-normal">{label}</span>;
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
    const statuses = useProviderStatuses({ localModels, localModelsLoading });

    useEffect(() => {
        const handleOpen = () => setIsOpen(true);
        window.addEventListener('open-model-selector', handleOpen);
        return () => window.removeEventListener('open-model-selector', handleOpen);
    }, []);

    const currentLabel = useMemo(
        () => findCurrentLabel({ value, localModels }),
        [value, localModels],
    );

    const cloud = PROVIDER_MANIFEST.find((e) => e.kind === 'openrouter');
    const subProviders = PROVIDER_MANIFEST.filter((e) => e.kind !== 'openrouter');

    return (
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
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
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
                {cloud && (
                    <>
                        <DropdownMenuLabel className="text-foreground-tertiary text-mini px-3 py-1.5 font-normal">
                            Cloud models
                        </DropdownMenuLabel>
                        {cloud.models.map((option) => (
                            <DropdownMenuItem
                                key={option.id}
                                onClick={() => onChange(option.id as ChatModel)}
                                className={cn(
                                    'flex flex-col items-start gap-0.5 px-3 py-2',
                                    option.id === (value as string) && 'bg-background-weblab',
                                )}
                            >
                                <span className="text-small font-medium">{option.label}</span>
                                <span className="text-foreground-tertiary text-mini">
                                    {option.id}
                                </span>
                            </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                    </>
                )}

                <DropdownMenuLabel className="text-foreground-tertiary text-mini px-3 py-1.5 font-normal">
                    Providers
                </DropdownMenuLabel>

                {subProviders.map((entry) => {
                    const status = statuses[entry.kind];
                    const desktopOnly = status.kind === 'desktop-only';
                    return (
                        <DropdownMenuSub key={entry.kind}>
                            <DropdownMenuSubTrigger
                                disabled={desktopOnly}
                                className={cn(
                                    'flex items-center gap-2 px-3 py-2',
                                    desktopOnly && 'opacity-60',
                                )}
                            >
                                <ProviderIcon name={entry.icon} className="h-4 w-4 shrink-0" />
                                <span className="text-small font-medium">{entry.label}</span>
                                <StatusBadge status={status} />
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="w-64">
                                <ProviderSubmenuBody
                                    entry={entry}
                                    status={status}
                                    selectedModel={value}
                                    onChange={onChange}
                                    onOpenSetup={() => setSetupEntry(entry)}
                                    onOpenPullDialog={() => setPullDialogOpen(true)}
                                    onQuitOllama={async () => {
                                        await window.weblabNative?.cli?.ollamaQuit?.();
                                    }}
                                />
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                    );
                })}
            </DropdownMenuContent>
            {setupEntry && (
                <ProviderSetupDialog
                    entry={setupEntry}
                    status={statuses[setupEntry.kind]}
                    open={setupEntry !== null}
                    onOpenChange={(open) => {
                        if (!open) setSetupEntry(null);
                    }}
                />
            )}
            <PullModelDialog open={pullDialogOpen} onOpenChange={setPullDialogOpen} />
        </DropdownMenu>
    );
};

function ProviderSubmenuBody({
    entry,
    status,
    selectedModel,
    onChange,
    onOpenSetup,
    onOpenPullDialog,
    onQuitOllama,
}: {
    entry: ProviderManifestEntry;
    status: ProviderStatus;
    selectedModel: ChatModel;
    onChange: (model: ChatModel) => void;
    onOpenSetup: () => void;
    onOpenPullDialog: () => void;
    onQuitOllama: () => void | Promise<void>;
}) {
    const models = modelsForEntry(entry, status);

    if (status.kind === 'loading') {
        return (
            <DropdownMenuItem disabled className="text-mini px-3 py-2">
                Detecting…
            </DropdownMenuItem>
        );
    }

    if (status.kind === 'desktop-only') {
        return (
            <DropdownMenuItem disabled className="text-mini px-3 py-2">
                Available in the Weblab desktop app
            </DropdownMenuItem>
        );
    }

    if (status.kind === 'install') {
        return (
            <DropdownMenuItem onClick={onOpenSetup} className="text-mini px-3 py-2">
                Install {entry.label}…
            </DropdownMenuItem>
        );
    }

    if (status.kind === 'sign-in') {
        return (
            <DropdownMenuItem onClick={onOpenSetup} className="text-mini px-3 py-2">
                Sign in to {entry.label}…
            </DropdownMenuItem>
        );
    }

    return (
        <>
            {models.length === 0 ? (
                <DropdownMenuItem disabled className="text-mini px-3 py-2">
                    No models available
                </DropdownMenuItem>
            ) : (
                models.map((m) => (
                    <DropdownMenuItem
                        key={m.id}
                        onClick={() => onChange(m.id as ChatModel)}
                        className={cn(
                            'flex flex-col items-start gap-0.5 px-3 py-2',
                            m.id === (selectedModel as string) && 'bg-background-weblab',
                        )}
                    >
                        <span className="text-small font-medium">{m.label}</span>
                        <span className="text-foreground-tertiary text-mini">{m.id}</span>
                    </DropdownMenuItem>
                ))
            )}

            {entry.ollamaSpecials && (
                <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onOpenPullDialog} className="text-mini px-3 py-2">
                        Pull model…
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => void onQuitOllama()}
                        className="text-mini px-3 py-2"
                    >
                        Quit Ollama
                    </DropdownMenuItem>
                </>
            )}

            {entry.supportsCustomModel && (
                <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        disabled
                        className="text-mini px-3 py-2"
                        title="Coming in a follow-up"
                    >
                        Custom model…
                    </DropdownMenuItem>
                </>
            )}
        </>
    );
}
