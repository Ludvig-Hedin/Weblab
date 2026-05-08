import type { ToolSet } from 'ai';
import { generateObject, NoSuchToolError, smoothStream, stepCountIs, streamText } from 'ai';

import type { ChatMessage, ChatModel, ModelConfig, OllamaModelId } from '@weblab/models';
import {
    ChatType,
    getProviderFromModel,
    LLMProvider,
    OLLAMA_DEFAULT_BASE_URL,
    OPENROUTER_MODELS,
} from '@weblab/models';

import type { MemorySearchResult } from '../memory/types';
import type { ToolCall } from '@ai-sdk/provider-utils';
import {
    convertToStreamMessages,
    getAskModeSystemPrompt,
    getCreatePageSystemPrompt,
    getSystemPrompt,
    getToolSetFromType,
    initModel,
} from '../index';

export const createRootAgentStream = ({
    chatType,
    conversationId,
    projectId,
    userId,
    traceId,
    messages,
    model,
    ollamaBaseUrl,
    memories,
}: {
    chatType: ChatType;
    conversationId: string;
    projectId: string;
    userId: string;
    traceId: string;
    messages: ChatMessage[];
    model: ChatModel;
    ollamaBaseUrl?: string;
    memories: MemorySearchResult[];
}) => {
    const modelConfig = getModelFromType(chatType, model, ollamaBaseUrl);
    const systemPrompt = getSystemPromptFromType(chatType, memories);
    const toolSet = getToolSetFromType(chatType);
    return streamText({
        providerOptions: modelConfig.providerOptions,
        messages: convertToStreamMessages(messages),
        model: modelConfig.model,
        system: systemPrompt,
        tools: toolSet,
        headers: modelConfig.headers,
        stopWhen: stepCountIs(8),
        experimental_repairToolCall: repairToolCall,
        experimental_transform: smoothStream(),
        experimental_telemetry: {
            isEnabled: true,
            metadata: {
                conversationId,
                projectId,
                userId,
                chatType: chatType,
                tags: ['chat'],
                langfuseTraceId: traceId,
                sessionId: conversationId,
            },
        },
    });
};

const getSystemPromptFromType = (chatType: ChatType, memories: MemorySearchResult[]): string => {
    switch (chatType) {
        case ChatType.CREATE:
            return getCreatePageSystemPrompt(memories);
        case ChatType.ASK:
            return getAskModeSystemPrompt(memories);
        case ChatType.EDIT:
        default:
            return getSystemPrompt(memories);
    }
};

const getModelFromType = (
    chatType: ChatType,
    selectedModel: ChatModel,
    ollamaBaseUrl?: string,
): ModelConfig => {
    const provider = getProviderFromModel(selectedModel);
    switch (provider) {
        case LLMProvider.OLLAMA:
            return initModel({
                provider: LLMProvider.OLLAMA,
                model: selectedModel as OllamaModelId,
                ollamaBaseUrl: ollamaBaseUrl ?? OLLAMA_DEFAULT_BASE_URL,
            });
        case LLMProvider.OPENROUTER:
        default:
            return initModel({
                provider: LLMProvider.OPENROUTER,
                model: selectedModel as OPENROUTER_MODELS,
            });
    }
};

export const repairToolCall = async ({
    toolCall,
    tools,
    error,
}: {
    toolCall: ToolCall<string, unknown>;
    tools: ToolSet;
    error: Error;
}) => {
    if (NoSuchToolError.isInstance(error)) {
        throw new Error(
            `Tool "${toolCall.toolName}" not found. Available tools: ${Object.keys(tools).join(', ')}`,
        );
    }
    const tool = tools[toolCall.toolName];
    if (!tool?.inputSchema) {
        throw new Error(`Tool "${toolCall.toolName}" has no input schema`);
    }

    console.warn(
        `Invalid parameter for tool ${toolCall.toolName} with args ${JSON.stringify(toolCall.input)}, attempting to fix`,
    );

    // Use a cheaper, fast model for structured repair; GPT-5.5 is overkill here.
    const { model } = initModel({
        provider: LLMProvider.OPENROUTER,
        model: OPENROUTER_MODELS.CLAUDE_3_5_HAIKU,
    });

    const { object: repairedArgs } = await generateObject({
        model,
        schema: tool.inputSchema,
        prompt: [
            `The model tried to call the tool "${toolCall.toolName}"` +
                ` with the following arguments:`,
            JSON.stringify(toolCall.input),
            `The tool accepts the following schema:`,
            JSON.stringify(tool?.inputSchema),
            'Please fix the inputs. Return the fixed inputs as a JSON object, DO NOT include any other text.',
        ].join('\n'),
    });

    return {
        type: 'tool-call' as const,
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: JSON.stringify(repairedArgs),
    };
};
