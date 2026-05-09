'use client';

import type { ToolUIPart } from 'ai';
import type { ComponentProps, ReactNode } from 'react';
import { memo } from 'react';
import { CheckCircleIcon, CircleIcon, ClockIcon, WrenchIcon, XCircleIcon } from 'lucide-react';

import { Badge } from '../../components/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../components/collapsible';
import { cn } from '../../utils/index';
import { CodeBlock } from './code-block';

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
    <Collapsible
        className={cn('text-foreground-tertiary/80 my-2 flex flex-col p-0', className)}
        {...props}
        data-oid="840dd1de45"
    />
);

export type ToolHeaderProps = {
    type: ToolUIPart['type'];
    state: ToolUIPart['state'];
    className?: string;
    icon?: ReactNode;
    title?: string;
    loading?: boolean;
    showStatus?: boolean;
};

const getStatusBadge = (status: ToolUIPart['state'], showLabel = false) => {
    const labels = {
        'input-streaming': 'Pending',
        'input-available': 'Running',
        'output-available': 'Completed',
        'output-error': 'Error',
    } as const;

    const icons = {
        'input-streaming': <CircleIcon className="size-4" data-oid="4992b71bff" />,
        'input-available': <ClockIcon className="size-4 animate-pulse" data-oid="1eb05f14e5" />,
        'output-available': (
            <CheckCircleIcon className="size-4 text-foreground-success" data-oid="3b4b470f02" />
        ),
        'output-error': <XCircleIcon className="size-4 text-destructive" data-oid="047c2c6a66" />,
    } as const;

    return (
        <Badge className="gap-1.5 rounded-full text-xs" variant="outline" data-oid="535cbedaab">
            {icons[status]}
            {showLabel && labels[status]}
        </Badge>
    );
};

export const ToolHeader = ({
    className,
    type,
    state,
    icon,
    title,
    loading,
    showStatus = false,
    ...props
}: ToolHeaderProps) => (
    <CollapsibleTrigger
        className={cn('flex w-full items-center justify-between gap-4', className)}
        {...props}
        data-oid="195ef61643"
    >
        <div className="flex items-center gap-2" data-oid="b763616fe2">
            {icon ? (
                icon
            ) : (
                <WrenchIcon className="text-muted-foreground size-4" data-oid="3db6e7ea30" />
            )}
            <span
                className={cn(
                    'text-regularPlus hover:text-foreground-tertiary truncate',
                    loading &&
                        'animate-shimmer bg-gradient-to-l from-white/20 via-white/90 to-white/20 bg-[length:200%_100%] bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(255,255,255,0.4)] filter',
                )}
                data-oid="13939dd3e4"
            >
                {title ? title : type}
            </span>
            {showStatus && getStatusBadge(state)}
        </div>
    </CollapsibleTrigger>
);

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
    <CollapsibleContent
        className={cn(
            'data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-popover-foreground data-[state=closed]:animate-out data-[state=open]:animate-in text-xs outline-none',
            className,
        )}
        {...props}
        data-oid="d0f401386a"
    />
);

export type ToolInputProps = ComponentProps<'div'> & {
    input: ToolUIPart['input'];
    isStreaming?: boolean;
};

const ToolInputComponent = ({ className, input, isStreaming, ...props }: ToolInputProps) => (
    <div
        className={cn('space-y-2 overflow-hidden p-1', className)}
        {...props}
        data-oid="6323cc8a64"
    >
        <h4
            className="text-muted-foreground text-xs font-medium tracking-wide capitalize"
            data-oid="2758716d14"
        >
            Parameters
        </h4>
        <CodeBlock
            className="m-0 p-0"
            code={JSON.stringify(input, null, 2)}
            language="json"
            isStreaming={isStreaming}
            data-oid="f4bae922ce"
        />
    </div>
);

export const ToolInput = memo(ToolInputComponent);

export type ToolOutputProps = ComponentProps<'div'> & {
    output: ToolUIPart['output'];
    errorText: ToolUIPart['errorText'];
    isStreaming?: boolean;
};

const ToolOutputComponent = ({
    className,
    output,
    errorText,
    isStreaming,
    ...props
}: ToolOutputProps) => {
    if (!(output || errorText)) {
        return null;
    }

    let Output = <div data-oid="c5c3c668f9">{output as ReactNode}</div>;

    if (typeof output === 'object') {
        Output = (
            <CodeBlock
                code={JSON.stringify(output, null, 2)}
                language="json"
                isStreaming={isStreaming}
                data-oid="ece14ad9f2"
            />
        );
    } else if (typeof output === 'string') {
        Output = (
            <CodeBlock
                code={output}
                language="json"
                isStreaming={isStreaming}
                data-oid="fd291df407"
            />
        );
    }

    return (
        <div className={cn('space-y-2 p-1', className)} {...props} data-oid="dc98148a78">
            <h4
                className="text-muted-foreground text-xs font-medium tracking-wide capitalize"
                data-oid="3e3de2b95f"
            >
                {errorText ? 'Error' : 'Result'}
            </h4>
            <div
                className={cn(
                    'overflow-x-auto rounded-md text-xs [&_table]:w-full',
                    errorText
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-muted/50 text-foreground',
                )}
                data-oid="273b2d16a4"
            >
                {errorText && <div data-oid="186134dc5a">{errorText}</div>}
                {Output}
            </div>
        </div>
    );
};

export const ToolOutput = memo(ToolOutputComponent);
