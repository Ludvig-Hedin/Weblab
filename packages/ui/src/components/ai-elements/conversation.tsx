'use client';

import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import { ArrowDownIcon } from 'lucide-react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';

import { cn } from '../../utils';
import { Button } from '../button';

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({ className, ...props }: ConversationProps) => (
    <StickToBottom
        className={cn('relative flex-1 overflow-y-auto', className)}
        initial="smooth"
        resize="smooth"
        role="log"
        {...props}
        data-oid="644a9318ff"
    />
);

export type ConversationContentProps = ComponentProps<typeof StickToBottom.Content>;

export const ConversationContent = ({ className, ...props }: ConversationContentProps) => (
    <StickToBottom.Content className={cn('p-4', className)} {...props} data-oid="b3d7d97489" />
);

export type ConversationEmptyStateProps = ComponentProps<'div'> & {
    title?: string;
    description?: string;
    icon?: React.ReactNode;
};

export const ConversationEmptyState = ({
    className,
    title = 'No messages yet',
    description = 'Start a conversation to see messages here',
    icon,
    children,
    ...props
}: ConversationEmptyStateProps) => (
    <div
        className={cn(
            'flex size-full flex-col items-center justify-center gap-3 p-8 text-center',
            className,
        )}
        {...props}
        data-oid="e542cae42f"
    >
        {children ?? (
            <>
                {icon && (
                    <div className="text-muted-foreground" data-oid="947647d56b">
                        {icon}
                    </div>
                )}
                <div className="space-y-1" data-oid="bda77b9e2e">
                    <h3 className="text-sm font-medium" data-oid="0834be957a">
                        {title}
                    </h3>
                    {description && (
                        <p className="text-muted-foreground text-sm" data-oid="001cdffc00">
                            {description}
                        </p>
                    )}
                </div>
            </>
        )}
    </div>
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
    className,
    ...props
}: ConversationScrollButtonProps) => {
    const { isAtBottom, scrollToBottom } = useStickToBottomContext();

    const handleScrollToBottom = useCallback(() => {
        scrollToBottom();
    }, [scrollToBottom]);

    return (
        !isAtBottom && (
            <Button
                className={cn(
                    'bg-background-weblab/20 text-foreground-weblab hover:bg-foreground-primary hover:text-background-weblab border-foreground-primary/20 absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full border-[0.5px] opacity-100 backdrop-blur-lg',
                    className,
                )}
                onClick={handleScrollToBottom}
                size="icon"
                type="button"
                variant="default"
                {...props}
                data-oid="6a1bd244e6"
            >
                <ArrowDownIcon className="size-4" data-oid="67b7b74298" />
            </Button>
        )
    );
};
