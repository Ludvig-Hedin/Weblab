import { SettingsTabValue } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { useEditorEngine } from '@/components/store/editor';
import { useStateManager } from '@/components/store/state';

export const AdvancedSettingsSection = () => {
    const stateManager = useStateManager();
    const editorEngine = useEditorEngine();

    const openAdvancedSettings = () => {
        editorEngine.state.setPublishOpen(false);
        stateManager.setSettingsTab(SettingsTabValue.DOMAIN);
        stateManager.setIsSettingsModalOpen(true);
    };

    return (
        <Button
            variant="ghost"
            className="h-9 w-full justify-start gap-2 rounded-none px-3"
            onClick={openAdvancedSettings}
        >
            <Icons.Gear className="h-4 w-4" />
            Advanced Settings
            <Icons.ChevronRight className="ml-auto h-3 w-3" />
        </Button>
    );
};
