import { useState } from 'react';
import { observer } from 'mobx-react-lite';

import { HostingProvider } from '@weblab/models';
import { DropdownMenu, DropdownMenuContent } from '@weblab/ui/dropdown-menu';

import { useEditorEngine } from '@/components/store/editor';
import { useProjectCapabilitiesContext } from '@/hooks/use-project-capabilities-context';
import { DeployHistoryDialog } from './deploy-history-dialog';
import { PublishDropdown } from './dropdown';
import { SelectedProviderContext } from './dropdown/selected-provider';
import { HostingIntegrationsDialog } from './hosting-integrations-dialog';
import { TriggerButton } from './trigger-button';

export const PublishButton = observer(() => {
    const editorEngine = useEditorEngine();
    const [historyOpen, setHistoryOpen] = useState(false);
    const [integrationsOpen, setIntegrationsOpen] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState<HostingProvider>(
        HostingProvider.FREESTYLE,
    );
    const { canPublish, isLoading: capsLoading } = useProjectCapabilitiesContext();
    // Hide the publish dropdown entirely when the caller lacks publish cap.
    // While caps load we hide too — server is the trust boundary so flashing
    // a button only to refuse on click is worse than waiting.
    if (capsLoading || !canPublish) {
        return null;
    }

    return (
        <SelectedProviderContext.Provider value={{ selectedProvider, setSelectedProvider }}>
            <DropdownMenu
                modal={false}
                open={editorEngine.state.publishOpen}
                onOpenChange={(open: boolean) => {
                    editorEngine.state.setPublishOpen(open);
                }}
            >
                <TriggerButton />
                <DropdownMenuContent align="end" className="text-small w-80 p-0">
                    <PublishDropdown
                        onOpenHistory={() => setHistoryOpen(true)}
                        onOpenIntegrations={() => setIntegrationsOpen(true)}
                    />
                </DropdownMenuContent>
            </DropdownMenu>
            <DeployHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
            <HostingIntegrationsDialog open={integrationsOpen} onOpenChange={setIntegrationsOpen} />
        </SelectedProviderContext.Provider>
    );
});
