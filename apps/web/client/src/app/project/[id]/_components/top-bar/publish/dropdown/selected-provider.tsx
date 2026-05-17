'use client';

import { createContext, useContext } from 'react';

import { HostingProvider } from '@weblab/models';

interface SelectedProviderContextValue {
    selectedProvider: HostingProvider;
    setSelectedProvider: (provider: HostingProvider) => void;
}

export const SelectedProviderContext = createContext<SelectedProviderContextValue | null>(null);

export const useSelectedProvider = (): SelectedProviderContextValue => {
    const ctx = useContext(SelectedProviderContext);
    // Default to Weblab/Freestyle when used outside the provider. This keeps
    // legacy callers and existing tests working without any rewiring.
    if (!ctx) {
        return {
            selectedProvider: HostingProvider.FREESTYLE,
            setSelectedProvider: () => {
                /* no-op */
            },
        };
    }
    return ctx;
};
