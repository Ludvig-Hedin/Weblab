import type { ToolUIPart } from 'ai';
import { memo } from 'react';

import type { BaseTool } from '@weblab/ai/client';
import { TOOLS_MAP } from '@weblab/ai/client';
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@weblab/ui/ai-elements';
import { Icons } from '@weblab/ui/icons';

const ToolCallSimpleComponent = ({
    toolPart,
    className,
    loading,
}: {
    toolPart: ToolUIPart;
    className?: string;
    loading?: boolean;
}) => {
    const toolName = toolPart.type.split('-')[1] ?? '';
    const ToolClass = TOOLS_MAP.get(toolName);
    const Icon = ToolClass?.icon ?? Icons.QuestionMarkCircled;
    const title = ToolClass
        ? getToolLabel(ToolClass, toolPart.input)
        : getDefaultToolLabel(toolName);

    return (
        <Tool className={className}>
            <ToolHeader
                loading={loading}
                title={title}
                type={toolPart.type}
                state={toolPart.state}
                icon={<Icon className="h-4 w-4 flex-shrink-0" />}
            />
            <ToolContent>
                <ToolInput input={toolPart.input} isStreaming={loading} />
                <ToolOutput
                    errorText={toolPart.errorText}
                    output={toolPart.output}
                    isStreaming={loading}
                />
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
