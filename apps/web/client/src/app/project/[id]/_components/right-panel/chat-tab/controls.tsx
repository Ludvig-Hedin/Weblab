import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { getFrameworkAdapter } from '@weblab/framework';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';

import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';

export const ChatControls = observer(() => {
    const editorEngine = useEditorEngine();
    const t = useTranslations();

    const isStartingNewConversation = editorEngine.chat.conversation.creatingConversation;
    const isStreaming = editorEngine.chat.isStreaming;
    const isDisabled = isStreaming || isStartingNewConversation;

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

    const disabledTooltip = isStartingNewConversation
        ? t(transKeys.editor.panels.edit.tabs.chat.controls.newChatTooltipStarting)
        : t(transKeys.editor.panels.edit.tabs.chat.controls.newChatTooltipStreaming);

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
                            className="group text-foreground-secondary hover:text-foreground-primary h-8 w-fit cursor-pointer gap-1.5 bg-transparent px-2 hover:!bg-transparent"
                            onClick={handleNewChat}
                            disabled={isDisabled}
                        >
                            {isStartingNewConversation ? (
                                <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                            ) : (
                                <Icons.Edit className="h-4 w-4" />
                            )}
                            <span className="text-small">
                                {t(transKeys.editor.panels.edit.tabs.chat.controls.newChat)}
                            </span>
                        </Button>
                    </span>
                </TooltipTrigger>
                {isDisabled && (
                    <TooltipContent side="bottom" hideArrow>
                        {disabledTooltip}
                    </TooltipContent>
                )}
            </Tooltip>
        </div>
    );
});
