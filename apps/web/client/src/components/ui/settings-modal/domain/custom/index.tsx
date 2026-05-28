import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';

import { ProductType } from '@weblab/stripe';
import { Badge } from '@weblab/ui/badge';
import { Icons } from '@weblab/ui/icons';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';
import { useStateManager } from '@/components/store/state';
import { UpgradePrompt } from '../upgrade-prompt';
import { DomainVerificationProvider } from './use-domain-verification';
import { Verification } from './verification';
import { Verified } from './verified';

export const CustomDomain = observer(() => {
    const editorEngine = useEditorEngine();
    const stateManager = useStateManager();

    const subscription = useQuery(api.subscriptions.get);
    const product = subscription?.product;
    const customDomain = useQuery(
        api.domains.customGet,
        editorEngine.projectId ? { projectId: editorEngine.projectId as Id<'projects'> } : 'skip',
    );

    const renderContent = () => {
        if (product?.type !== ProductType.PRO) {
            return (
                <UpgradePrompt
                    onClick={() => {
                        stateManager.setIsSettingsModalOpen(false);
                        stateManager.setIsSubscriptionModalOpen(true);
                    }}
                />
            );
        }
        if (customDomain) {
            return <Verified />;
        }
        return <Verification />;
    };

    return (
        <DomainVerificationProvider>
            <div className="space-y-4">
                <div className="flex items-center justify-start gap-3">
                    <h2 className="text-largePlus">Custom Domain</h2>
                    {product?.type === ProductType.PRO && (
                        <Badge variant="secondary" className="text-mini gap-1">
                            <Icons.Sparkles className="h-3 w-3" />
                            Pro
                        </Badge>
                    )}
                </div>
                {renderContent()}
            </div>
        </DomainVerificationProvider>
    );
});
