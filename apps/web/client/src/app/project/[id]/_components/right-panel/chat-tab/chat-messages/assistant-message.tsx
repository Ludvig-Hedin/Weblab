import { memo, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { ChatMessage } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';

import { MessageContent } from './message-content';

const AssistantMessageComponent = ({
    message,
    isStreaming,
    isLatestAssistant = false,
    isAnyStreaming = false,
    onRegenerate,
}: {
    message: ChatMessage;
    isStreaming: boolean;
    isLatestAssistant?: boolean;
    isAnyStreaming?: boolean;
    onRegenerate?: () => Promise<void>;
}) => {
    const [isRegenerating, setIsRegenerating] = useState(false);
    const createdAt = message.metadata?.createdAt
        ? new Date(message.metadata.createdAt)
        : undefined;

    const showRegenerate = isLatestAssistant && !!onRegenerate;
    const regenerateDisabled = isAnyStreaming || isRegenerating;

    const handleRegenerate = async () => {
        if (!onRegenerate || regenerateDisabled) return;
        try {
            setIsRegenerating(true);
            await onRegenerate();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to regenerate response';
            toast.error(message);
        } finally {
            setIsRegenerating(false);
        }
    };

    return (
        <div className="group/assistant text-small flex flex-col content-start gap-1.5 px-3 py-2 leading-snug tracking-[-0.005em] text-wrap">
            <MessageContent
                messageId={message.id}
                parts={message.parts}
                applied={false}
                isStream={isStreaming}
                createdAt={createdAt}
            />
            {showRegenerate && (
                <div className="flex gap-1 pl-1 opacity-0 transition-opacity duration-200 group-hover/assistant:opacity-100 focus-within:opacity-100">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                onClick={handleRegenerate}
                                size="icon"
                                variant="ghost"
                                disabled={regenerateDisabled}
                                className="h-6 w-6 p-1"
                                aria-label="Regenerate response"
                            >
                                {isRegenerating ? (
                                    <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Icons.Reload className="h-4 w-4" />
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={5}>
                            Regenerate response
                        </TooltipContent>
                    </Tooltip>
                </div>
            )}
        </div>
    );
};

export const AssistantMessage = memo(observer(AssistantMessageComponent));
