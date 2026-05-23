import { createContext, useContext, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';

import { DeploymentType, SettingsTabValue } from '@weblab/models';
import { ProductType } from '@weblab/stripe';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';
import { useHostingType } from '@/components/store/hosting';
import { useStateManager } from '@/components/store/state';
import { useSelectedProvider } from '../selected-provider';

const useCustomDomain = () => {
    const editorEngine = useEditorEngine();
    const stateManager = useStateManager();
    const { selectedProvider } = useSelectedProvider();
    const [isLoading, setIsLoading] = useState(false);
    const subscription = useQuery(api.subscriptions.get, {});
    const customDomain = useQuery(api.domains.customGet, {
        projectId: editorEngine.projectId as Id<'projects'>,
    });
    const { deployment, publish: runPublish, isDeploying } = useHostingType(DeploymentType.CUSTOM);

    const product = subscription?.product;
    const isPro = product?.type === ProductType.PRO;

    const openCustomDomain = (): void => {
        editorEngine.state.setPublishOpen(false);
        stateManager.setSettingsTab(SettingsTabValue.DOMAIN);
        stateManager.setIsSettingsModalOpen(true);
    };

    const publish = async () => {
        if (!customDomain) {
            console.error(`No custom domain hosting manager found`);
            return;
        }
        const sandboxId = editorEngine.branches.activeBranch?.sandbox?.id;
        if (!sandboxId) {
            console.error('No sandbox found for custom domain publish');
            return;
        }
        setIsLoading(true);
        try {
            await runPublish({
                projectId: editorEngine.projectId,
                sandboxId,
                provider: selectedProvider,
            });
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const retry = () => {
        if (!customDomain) {
            console.error(`No custom domain hosting manager found`);
            return;
        }
        publish();
    };

    return {
        customDomain,
        deployment,
        publish,
        retry,
        isDeploying,
        isPro,
        openCustomDomain,
        isLoading,
    };
};

const CustomDomainContext = createContext<ReturnType<typeof useCustomDomain> | null>(null);

export const CustomDomainProvider = ({ children }: { children: React.ReactNode }) => {
    const value = useCustomDomain();
    return <CustomDomainContext.Provider value={value}>{children}</CustomDomainContext.Provider>;
};

export const useCustomDomainContext = () => {
    const context = useContext(CustomDomainContext);
    if (!context) {
        throw new Error('useCustomDomainContext must be used within a CustomDomainProvider');
    }
    return context;
};
