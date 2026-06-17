import type { ToolUIPart } from 'ai';
import { memo, useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';

import type { BaseTool } from '@weblab/ai/client';
import { TOOLS_MAP } from '@weblab/ai/client';
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@weblab/ui/ai-elements';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { transKeys } from '@/i18n/keys';
import { getToolNameFromPart } from './tool-name';

/** Global event dispatched when a stalled tool's Retry button is clicked.
 *  The chat hook listens for this and re-fires only the failed tool —
 *  surgical retry — instead of regenerating the whole assistant turn. */
export const CHAT_RETRY_TOOL_EVENT = 'weblab:chat-retry-tool';

const ToolCallSimpleComponent = ({
    toolPart,
    className,
    loading,
    stalled,
}: {
    toolPart: ToolUIPart;
    className?: string;
    loading?: boolean;
    /**
     * The tool turn is over but the tool never produced a result. The
     * `output-error` path was never taken — most likely the stream was
     * interrupted. Render a small retry affordance instead of a frozen
     * spinner.
     */
    stalled?: boolean;
}) => {
    const t = useTranslations();
    const toolName = getToolNameFromPart(toolPart);
    const ToolClass = TOOLS_MAP.get(toolName);
    const Icon = ToolClass?.icon ?? Icons.QuestionMarkCircled;
    const title = ToolClass
        ? getToolLabel(ToolClass, toolPart.input)
        : getDefaultToolLabel(toolName);

    const [retrySent, setRetrySent] = useState(false);
    const handleRetry = useCallback(() => {
        if (typeof window === 'undefined' || retrySent) return;
        setRetrySent(true);
        window.dispatchEvent(
            new CustomEvent(CHAT_RETRY_TOOL_EVENT, {
                detail: {
                    toolCallId: toolPart.toolCallId,
                    toolName,
                    input: toolPart.input,
                },
            }),
        );
    }, [retrySent, toolName, toolPart.input, toolPart.toolCallId]);

    return (
        <Tool className={cn(stalled && 'text-foreground-tertiary', className)}>
            <ToolHeader
                loading={loading}
                title={title}
                type={toolPart.type}
                state={toolPart.state}
                icon={
                    stalled ? (
                        <Icons.ExclamationTriangle className="text-foreground-warning h-4 w-4 flex-shrink-0" />
                    ) : (
                        <Icon className="h-4 w-4 flex-shrink-0" />
                    )
                }
            />
            <ToolContent>
                <ToolInput input={toolPart.input} isStreaming={loading} />
                {stalled ? (
                    <div className="flex items-center justify-between gap-3 px-1 py-2">
                        <span className="text-foreground-tertiary text-mini">
                            {t(transKeys.editor.panels.edit.tabs.chat.toolCall.stalledMessage)}
                        </span>
                        <button
                            type="button"
                            onClick={handleRetry}
                            disabled={retrySent}
                            aria-label={t(
                                transKeys.editor.panels.edit.tabs.chat.toolCall.ariaRetry,
                            )}
                            className="text-foreground-secondary hover:text-foreground-primary hover:bg-background-tertiary text-mini focus-visible:ring-ring inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:opacity-60"
                        >
                            {retrySent ? (
                                <Icons.LoadingSpinner className="h-3 w-3 animate-spin" />
                            ) : (
                                <Icons.Reload className="h-3 w-3" />
                            )}
                            {retrySent
                                ? t(transKeys.editor.panels.edit.tabs.chat.toolCall.retrying)
                                : t(transKeys.editor.panels.edit.tabs.chat.toolCall.retry)}
                        </button>
                    </div>
                ) : (
                    <ToolOutput
                        errorText={toolPart.errorText}
                        output={toolPart.output}
                        isStreaming={loading}
                    />
                )}
            </ToolContent>
        </Tool>
    );
};

export const ToolCallSimple = memo(ToolCallSimpleComponent);

function getDefaultToolLabel(toolName: string): string {
    return toolName?.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getToolLabel(toolClass: typeof BaseTool, input: unknown): string {
    try {
        return toolClass.getLabel(input);
    } catch (error) {
        console.error('Error getting tool label:', error);
        return getDefaultToolLabel(toolClass.name);
    }
}
