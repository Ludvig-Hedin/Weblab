import { type QueuedMessage } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';

export const QueuedMessageItem = ({
    message,
    removeFromQueue,
}: {
    message: QueuedMessage;
    index: number;
    removeFromQueue: (id: string) => void;
}) => {
    return (
        <div className="hover:bg-background-weblab group relative flex w-full cursor-default flex-row items-center overflow-hidden rounded-md py-1.5 transition-none select-none">
            <Icons.ChatBubble className="text-muted-foreground group-hover:text-foreground mr-2 ml-3 flex-none" />
            <span className="text-small text-muted-foreground group-hover:text-foreground mr-2 w-full truncate text-left">
                {message.content}
            </span>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground !bg-background-weblab hover:!bg-background-weblab absolute top-1/2 right-0 z-10 h-fit w-fit -translate-y-1/2 cursor-pointer px-2.5 py-2 opacity-0 transition-none group-hover:opacity-100"
                        onClick={(e) => {
                            e.stopPropagation();
                            removeFromQueue(message.id);
                        }}
                    >
                        <Icons.Trash className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="top" hideArrow>
                    <p className="font-normal">Remove from queue</p>
                </TooltipContent>
            </Tooltip>
        </div>
    );
};
