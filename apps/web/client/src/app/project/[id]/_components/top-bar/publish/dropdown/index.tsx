import { observer } from 'mobx-react-lite';

import { DeploymentType } from '@weblab/models';
import { Separator } from '@weblab/ui/separator';

import { useHostingType } from '@/components/store/hosting';
import { AdvancedSettingsSection } from './advanced-settings';
import { CustomDomainSection } from './custom-domain';
import { DeployHistoryTriggerSection } from './deploy-history-trigger';
import { HostingIntegrationsTriggerSection } from './hosting-integrations-trigger';
import { LoadingState } from './loading';
import { PreviewDomainSection } from './preview-domain-section';
import { ProviderSwitcher } from './provider-switcher';

interface PublishDropdownProps {
    onOpenHistory: () => void;
    onOpenIntegrations: () => void;
}

export const PublishDropdown = observer(
    ({ onOpenHistory, onOpenIntegrations }: PublishDropdownProps) => {
        const { isDeploying: isPreviewDeploying } = useHostingType(DeploymentType.PREVIEW);
        const { isDeploying: isCustomDeploying } = useHostingType(DeploymentType.CUSTOM);

        return (
            <div className="text-foreground-secondary flex flex-col rounded-md">
                <ProviderSwitcher onOpenIntegrations={onOpenIntegrations} />
                {isPreviewDeploying ? (
                    <LoadingState type={DeploymentType.PREVIEW} />
                ) : (
                    <PreviewDomainSection />
                )}
                <Separator />
                {isCustomDeploying ? (
                    <LoadingState type={DeploymentType.CUSTOM} />
                ) : (
                    <CustomDomainSection />
                )}
                <Separator />
                <DeployHistoryTriggerSection onOpenHistory={onOpenHistory} />
                <HostingIntegrationsTriggerSection onOpenIntegrations={onOpenIntegrations} />
                <AdvancedSettingsSection />
            </div>
        );
    },
);
