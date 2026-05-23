'use client';

import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';

import { HOSTING_PROVIDER_LABELS, HostingProvider } from '@weblab/models';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';

import { useSelectedProvider } from './selected-provider';

interface Props {
    onOpenIntegrations: () => void;
}

export const ProviderSwitcher = ({ onOpenIntegrations }: Props) => {
    const { selectedProvider, setSelectedProvider } = useSelectedProvider();
    const connections = useQuery(api.hostingConnections.list, {});
    const connectedProviders = connections?.map((c) => c.provider) ?? [];

    return (
        <div className="flex flex-col gap-1 border-b p-3">
            <p className="text-foreground-tertiary text-mini font-medium tracking-wide uppercase">
                Deploy target
            </p>
            <Select
                value={selectedProvider}
                onValueChange={(value: string) => setSelectedProvider(value as HostingProvider)}
            >
                <SelectTrigger className="h-8">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={HostingProvider.FREESTYLE}>
                        {HOSTING_PROVIDER_LABELS[HostingProvider.FREESTYLE]} (default)
                    </SelectItem>
                    {connectedProviders.map((provider) => (
                        <SelectItem key={provider} value={provider}>
                            {HOSTING_PROVIDER_LABELS[provider]}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {connectedProviders.length === 0 && (
                <button
                    type="button"
                    onClick={onOpenIntegrations}
                    className="text-foreground-secondary hover:text-foreground-primary text-mini text-left underline-offset-2 hover:underline"
                >
                    Connect Vercel, Netlify, Cloudflare, Railway, or Render →
                </button>
            )}
        </div>
    );
};
