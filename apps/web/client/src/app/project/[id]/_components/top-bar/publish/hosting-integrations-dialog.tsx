'use client';

import { useState } from 'react';

import {
    EXTERNAL_HOSTING_PROVIDERS,
    HOSTING_PROVIDER_LABELS,
    HostingProvider,
} from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { toast } from '@weblab/ui/sonner';

import { api } from '@/trpc/react';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const PROVIDER_TOKEN_HINTS: Record<HostingProvider, string> = {
    [HostingProvider.FREESTYLE]: '',
    [HostingProvider.VERCEL]: 'Create at vercel.com/account/tokens',
    [HostingProvider.NETLIFY]: 'Create at app.netlify.com/user/applications/personal',
    [HostingProvider.CLOUDFLARE]: 'Create at dash.cloudflare.com/profile/api-tokens (Pages:Edit)',
    [HostingProvider.RAILWAY]: 'Create at railway.app/account/tokens',
    [HostingProvider.RENDER]: 'Create at dashboard.render.com/u/settings (API Keys)',
};

export const HostingIntegrationsDialog = ({ open, onOpenChange }: Props) => {
    const [provider, setProvider] = useState<HostingProvider>(HostingProvider.VERCEL);
    const [token, setToken] = useState('');
    const [accountLabel, setAccountLabel] = useState('');

    const { data: connections, refetch } = api.hostingConnection.list.useQuery(undefined, {
        enabled: open,
    });
    const { mutateAsync: validate, isPending: isValidating } =
        api.hostingConnection.validateToken.useMutation();
    const { mutateAsync: create, isPending: isCreating } =
        api.hostingConnection.create.useMutation();
    const { mutateAsync: remove, isPending: isRemoving } =
        api.hostingConnection.delete.useMutation();

    const reset = () => {
        setToken('');
        setAccountLabel('');
    };

    const handleTest = async () => {
        if (!token.trim()) {
            toast.error('Paste an API token first.');
            return;
        }
        try {
            const result = await validate({ provider, token: token.trim() });
            if (result.ok) {
                toast.success(
                    `Connected to ${result.accountLabel ?? HOSTING_PROVIDER_LABELS[provider]}`,
                );
                if (!accountLabel && result.accountLabel) {
                    setAccountLabel(result.accountLabel);
                }
            } else {
                toast.error(result.message ?? 'Token validation failed.');
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Validation failed.');
        }
    };

    const handleSave = async () => {
        if (!token.trim()) {
            toast.error('Paste an API token first.');
            return;
        }
        try {
            await create({
                provider,
                token: token.trim(),
                accountLabel: accountLabel.trim() || undefined,
            });
            toast.success(`${HOSTING_PROVIDER_LABELS[provider]} connected.`);
            reset();
            await refetch();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to save connection.');
        }
    };

    const handleDelete = async (id: string, label: string) => {
        try {
            await remove({ id });
            toast.success(`Disconnected ${label}.`);
            await refetch();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to disconnect.');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>Hosting integrations</DialogTitle>
                    <DialogDescription>
                        Connect a provider account to deploy to your own Vercel, Netlify,
                        Cloudflare, Railway, or Render instead of Weblab-managed hosting.
                    </DialogDescription>
                </DialogHeader>

                {/* Connected providers list */}
                <div className="flex flex-col gap-2">
                    <p className="text-foreground-tertiary text-mini font-medium tracking-wide uppercase">
                        Connected
                    </p>
                    <div className="text-foreground-secondary flex flex-col divide-y rounded-md border">
                        {(!connections || connections.length === 0) && (
                            <p className="text-mini p-3">No providers connected yet.</p>
                        )}
                        {connections?.map((connection) => (
                            <div key={connection.id} className="flex items-center gap-2 p-3">
                                <Icons.Globe className="h-4 w-4" />
                                <span className="text-foreground-primary text-small">
                                    {HOSTING_PROVIDER_LABELS[connection.provider]}
                                </span>
                                <span className="text-mini ml-1">
                                    {connection.accountLabel ?? 'Account'}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="ml-auto"
                                    disabled={isRemoving}
                                    onClick={() => {
                                        void handleDelete(
                                            connection.id,
                                            HOSTING_PROVIDER_LABELS[connection.provider],
                                        );
                                    }}
                                >
                                    Disconnect
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Add new connection */}
                <div className="flex flex-col gap-3">
                    <p className="text-foreground-tertiary text-mini font-medium tracking-wide uppercase">
                        Add a connection
                    </p>
                    <div className="flex flex-col gap-2">
                        <label className="text-mini" htmlFor="hosting-provider">
                            Provider
                        </label>
                        <Select
                            value={provider}
                            onValueChange={(value: string) => setProvider(value as HostingProvider)}
                        >
                            <SelectTrigger id="hosting-provider">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {EXTERNAL_HOSTING_PROVIDERS.map((p) => (
                                    <SelectItem key={p} value={p}>
                                        {HOSTING_PROVIDER_LABELS[p]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-mini" htmlFor="hosting-token">
                            API token
                        </label>
                        <Input
                            id="hosting-token"
                            type="password"
                            placeholder="Paste your token"
                            value={token}
                            onChange={(event) => setToken(event.target.value)}
                        />
                        <p className="text-foreground-tertiary text-mini">
                            {PROVIDER_TOKEN_HINTS[provider]}
                        </p>
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-mini" htmlFor="hosting-account-label">
                            Display label (optional)
                        </label>
                        <Input
                            id="hosting-account-label"
                            placeholder="Filled in automatically if you Test first"
                            value={accountLabel}
                            onChange={(event) => setAccountLabel(event.target.value)}
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={isValidating || !token.trim()}
                            onClick={() => {
                                void handleTest();
                            }}
                        >
                            {isValidating ? 'Testing…' : 'Test'}
                        </Button>
                        <Button
                            size="sm"
                            disabled={isCreating || !token.trim()}
                            onClick={() => {
                                void handleSave();
                            }}
                        >
                            {isCreating ? 'Saving…' : 'Save'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
