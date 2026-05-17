import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { useEditorEngine } from '@/components/store/editor';

interface Props {
    onOpenHistory: () => void;
}

export const DeployHistoryTriggerSection = ({ onOpenHistory }: Props) => {
    const editorEngine = useEditorEngine();

    const handleClick = () => {
        editorEngine.state.publishOpen = false;
        onOpenHistory();
    };

    return (
        <Button
            variant="ghost"
            className="h-9 w-full justify-start gap-2 rounded-none px-3"
            onClick={handleClick}
        >
            <Icons.CounterClockwiseClock className="h-4 w-4" />
            Deployment history
            <Icons.ChevronRight className="ml-auto h-3 w-3" />
        </Button>
    );
};
