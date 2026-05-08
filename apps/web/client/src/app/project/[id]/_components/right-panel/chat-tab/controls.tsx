import { observer } from 'mobx-react-lite';

import { getFrameworkAdapter } from '@weblab/framework';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';

import { useEditorEngine } from '@/components/store/editor';

export const ChatControls = observer(() => {
    const editorEngine = useEditorEngine();

    const isStartingNewConversation = editorEngine.chat.conversation.creatingConversation;
    const isDisabled = editorEngine.chat.isStreaming || isStartingNewConversation;

    // Surface the project's framework so users can see what stack the AI is
    // calibrated for. We hide the chip when framework is null (pre-
    // multi-framework projects) or when it's the implicit default
    // ('nextjs') — the chip carries the most signal when the project is
    // something other than the assumed default.
    const frameworkAdapter = editorEngine.framework
        ? getFrameworkAdapter(editorEngine.framework)
        : null;
    const showFrameworkChip = frameworkAdapter && editorEngine.framework !== 'nextjs';

    const handleNewChat = () => {
        void editorEngine.chat.conversation.startNewConversation();
        editorEngine.chat.focusChatInput();
    };

    return (
        <div className="flex flex-row items-center gap-1">
            {showFrameworkChip && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span
                            className="text-mini text-foreground-secondary border-border bg-background-secondary inline-flex items-center rounded-md border px-1.5 py-0.5 select-none"
                            aria-label={`This project is configured as ${frameworkAdapter.displayName}; the AI will respond in that stack`}
                        >
                            {frameworkAdapter.displayName}
                        </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" hideArrow>
                        {`AI is calibrated for ${frameworkAdapter.displayName}`}
                    </TooltipContent>
                </Tooltip>
            )}
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
