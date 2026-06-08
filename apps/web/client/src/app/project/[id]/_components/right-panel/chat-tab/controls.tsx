import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { getFrameworkAdapter } from '@weblab/framework';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';

export const ChatControls = observer(
    ({ compact = false, onOpenHistory }: { compact?: boolean; onOpenHistory?: () => void }) => {
        const editorEngine = useEditorEngine();
        const t = useTranslations();

        const isStartingNewConversation = editorEngine.chat.conversation.creatingConversation;
        const isStreaming = editorEngine.chat.isStreaming;
        const isDisabled = isStreaming || isStartingNewConversation;

        const currentTitle = editorEngine.chat.conversation.current?.title?.trim();
        const threadLabel =
            currentTitle && currentTitle.length > 0
                ? currentTitle
                : t(transKeys.editor.panels.edit.tabs.chat.history.newConversationFallback);
        const viewHistoryLabel = t(transKeys.editor.panels.edit.tabs.chat.controls.viewHistory);

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
            void editorEngine.chat.startNewChat();
            editorEngine.chat.focusChatInput();
        };

        const disabledTooltip = isStartingNewConversation
            ? t(transKeys.editor.panels.edit.tabs.chat.controls.newChatTooltipStarting)
            : t(transKeys.editor.panels.edit.tabs.chat.controls.newChatTooltipStreaming);

        return (
            <div className="flex flex-row items-center gap-1">
                {onOpenHistory && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant={'ghost'}
                                size={'sm'}
                                onClick={onOpenHistory}
                                aria-label={viewHistoryLabel}
                                className="text-foreground-secondary hover:text-foreground-primary h-8 max-w-[140px] min-w-0 gap-1 bg-transparent px-2 hover:!bg-transparent"
                            >
                                <span className="text-small truncate">{threadLabel}</span>
                                <Icons.ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" hideArrow>
                            {viewHistoryLabel}
                        </TooltipContent>
                    </Tooltip>
                )}
                {showFrameworkChip && !compact && (
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
                                aria-label={t(
                                    transKeys.editor.panels.edit.tabs.chat.controls.newChat,
                                )}
                                className={cn(
                                    'group text-foreground-secondary hover:text-foreground-primary h-8 cursor-pointer gap-1.5 bg-transparent hover:!bg-transparent',
                                    compact ? 'w-8 px-0' : 'w-fit px-2',
                                )}
                                onClick={handleNewChat}
                                disabled={isDisabled}
                            >
                                {isStartingNewConversation ? (
                                    <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Icons.Edit className="h-4 w-4" />
                                )}
                                {!compact && (
                                    <span className="text-small">
                                        {t(transKeys.editor.panels.edit.tabs.chat.controls.newChat)}
                                    </span>
                                )}
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
    },
);
