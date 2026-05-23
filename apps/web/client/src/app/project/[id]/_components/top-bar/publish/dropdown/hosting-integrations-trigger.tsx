import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { useEditorEngine } from '@/components/store/editor';

interface Props {
    onOpenIntegrations: () => void;
}

export const HostingIntegrationsTriggerSection = ({ onOpenIntegrations }: Props) => {
    const editorEngine = useEditorEngine();

    const handleClick = () => {
        editorEngine.state.setPublishOpen(false);
        onOpenIntegrations();
    };

    return (
        <Button
            variant="ghost"
            className="h-9 w-full justify-start gap-2 rounded-none px-3"
            onClick={handleClick}
        >
            <Icons.Link className="h-4 w-4" />
            Hosting integrations
            <Icons.ChevronRight className="ml-auto h-3 w-3" />
        </Button>
    );
};
