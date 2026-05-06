import { observer } from 'mobx-react-lite';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';

import { useEditorEngine } from '@/components/store/editor';

export const ChatControls = observer(() => {
    const editorEngine = useEditorEngine();

    const isStartingNewConversation = editorEngine.chat.conversation.creatingConversation;
    const isDisabled = editorEngine.chat.isStreaming || isStartingNewConversation;

    const handleNewChat = () => {
        editorEngine.chat.conversation.startNewConversation();
        editorEngine.chat.focusChatInput();
    };

    return (
        <div className="flex flex-row">
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className="inline-block">
                        <Button
                            variant={'ghost'}
                            size={'icon'}
                            className="group text-foreground-secondary hover:text-foreground-primary h-fit w-fit cursor-pointer bg-transparent px-2 py-1 hover:!bg-transparent"
                            onClick={handleNewChat}
                            disabled={isDisabled}
                        >
                            {isStartingNewConversation ? (
                                <>
                                    <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                                    <span className="text-small">New Chat</span>
                                </>
                            ) : (
                                <>
                                    <Icons.Edit className="h-4 w-4" />
                                    <span className="text-small">New Chat</span>
                                </>
                            )}
                        </Button>
                    </span>
                </TooltipTrigger>
                {isDisabled && (
                    <TooltipContent side="bottom" hideArrow>
                        AI is still loading
                    </TooltipContent>
                )}
            </Tooltip>
        </div>
    );
});
