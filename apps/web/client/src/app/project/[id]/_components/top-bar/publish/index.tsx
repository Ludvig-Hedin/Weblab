import { observer } from 'mobx-react-lite';

import { DropdownMenu, DropdownMenuContent } from '@weblab/ui/dropdown-menu';

import { useEditorEngine } from '@/components/store/editor';
import { PublishDropdown } from './dropdown';
import { TriggerButton } from './trigger-button';

export const PublishButton = observer(() => {
    const editorEngine = useEditorEngine();

    return (
        <DropdownMenu
            modal={false}
            open={editorEngine.state.publishOpen}
            onOpenChange={(open: boolean) => {
                editorEngine.state.publishOpen = open;
            }}
        >
            <TriggerButton />
            <DropdownMenuContent align="end" className="text-small w-80 p-0">
                <PublishDropdown />
            </DropdownMenuContent>
        </DropdownMenu>
    );
});
