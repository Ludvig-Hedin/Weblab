import { AskUserQuestionTool, getToolClassesFromType } from '@weblab/ai/client';
import { toast } from '@weblab/ui/sonner';

import type { EditorEngine } from '@/components/store/editor/engine';
import type { ToolCall } from '@ai-sdk/provider-utils';

type AddToolResult = (
    toolResult:
        | {
              state?: 'output-available';
              tool: string;
              toolCallId: string;
              output: any;
              errorText?: never;
          }
        | {
              state: 'output-error';
              tool: string;
              toolCallId: string;
              output?: never;
              errorText: string;
          },
) => Promise<void>;

export async function handleToolCall(
    toolCall: ToolCall<string, unknown>,
    editorEngine: EditorEngine,
    addToolResult: AddToolResult,
) {
    const toolName = toolCall.toolName;
    const currentChatMode = editorEngine.state.chatMode;
    const availableTools = getToolClassesFromType(currentChatMode);

    try {
        // ask_user_question pauses the stream until the user answers in the UI.
        // Store a resolver so PlanQuestionCard can unblock it via AskUserQuestionTool.resolve().
        if (toolName === AskUserQuestionTool.toolName) {
            const result = await new Promise<{ answer: string }>((resolve) => {
                AskUserQuestionTool.register(toolCall.toolCallId, resolve);
            });
            await addToolResult({
                tool: toolName,
                toolCallId: toolCall.toolCallId,
                output: result,
            });
            return;
        }

        const tool = availableTools.find((tool) => tool.toolName === toolName);
        if (!tool) {
            toast.error(`Tool "${toolName}" not available in ${currentChatMode} mode`, {
                description: `Switch to build mode to use this tool.`,
                duration: 2000,
            });

            throw new Error(`Tool "${toolName}" is not available in ${currentChatMode} mode`);
        }
        // Parse the input to the tool parameters. Throws if invalid.
        const validatedInput = tool.parameters.parse(toolCall.input);
        // ToolClass is typed as `typeof BaseTool` (abstract) but the array
        // only contains concrete subclasses, so the instantiation is safe.
        type ConcreteTool = new () => {
            handle: (input: object, editorEngine: EditorEngine) => Promise<unknown>;
        };
        const toolInstance = new (tool as unknown as ConcreteTool)();
        // Can force type with as any because we know the input is valid.
        const output = await toolInstance.handle(validatedInput as any, editorEngine);
        await addToolResult({
            tool: toolName,
            toolCallId: toolCall.toolCallId,
            output,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(`Tool failed: ${toolName} — ${message}`);
        await addToolResult({
            state: 'output-error',
            tool: toolName,
            toolCallId: toolCall.toolCallId,
            errorText: message,
        });
    }
}
