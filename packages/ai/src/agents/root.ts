import type { ToolSet } from 'ai';
import { generateObject, NoSuchToolError, smoothStream, stepCountIs, streamText } from 'ai';

import type { FrameworkId } from '@weblab/framework';
import type { ChatMessage, ChatModel, ModelConfig, OllamaModelId } from '@weblab/models';
import {
    ChatType,
    getProviderFromModel,
    LLMProvider,
    OLLAMA_DEFAULT_BASE_URL,
    OPENROUTER_MODELS,
} from '@weblab/models';

import type { MemorySearchResult } from '../memory/types';
import type { SkillSummary } from '../skills/types';
import type { ServerToolContext } from '../tools/server-context';
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
    framework,
    abortSignal,
    serverToolContext,
    skills,
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
    /**
     * The project's framework id, used to pick the right system prompt
     * variant. Optional for backward compatibility — when omitted the JSX
     * (React) variant is used, matching pre-multi-framework behavior.
     */
    framework?: FrameworkId | null;
    abortSignal?: AbortSignal;
    /**
     * Per-request server tool context. When provided, ServerTool subclasses
     * (image-gen, server-side web tools, settings) execute in-stream on the
     * server. Without it, only ClientTools are invoked (browser-side).
     */
    serverToolContext?: ServerToolContext;
    /** Discovered Agent Skills (name + description) injected into the system prompt. */
    skills?: SkillSummary[];
}) => {
    const modelConfig = getModelFromType(chatType, model, ollamaBaseUrl);
    const systemPrompt = getSystemPromptFromType(chatType, memories, framework, skills);
    const toolSet = getToolSetFromType(chatType, { serverContext: serverToolContext });
    const provider = getProviderFromModel(model);
    return streamText({
        providerOptions: modelConfig.providerOptions,
        messages: convertToStreamMessages(messages),
        model: modelConfig.model,
        system: systemPrompt,
        tools: toolSet,
        headers: modelConfig.headers,
        // Without this, streamText silently uses the SDK default cap (~4k),
        // which truncates long responses on models with a much larger window.
        maxOutputTokens: modelConfig.maxOutputTokens,
        abortSignal,
        stopWhen: stepCountIs(8),
        experimental_repairToolCall: createRepairToolCall(provider),
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

const getSystemPromptFromType = (
    chatType: ChatType,
    memories: MemorySearchResult[],
    framework?: FrameworkId | null,
    skills?: SkillSummary[],
): string => {
    switch (chatType) {
        case ChatType.CREATE:
            return getCreatePageSystemPrompt(memories, framework, skills);
        case ChatType.ASK:
            return getAskModeSystemPrompt(memories, framework, skills);
        case ChatType.EDIT:
        default:
            return getSystemPrompt(memories, framework, skills);
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

/**
 * Tool-call repair factory. Repair always uses OpenRouter's Claude Haiku as a
 * structured-output helper, which means it requires `OPENROUTER_API_KEY`. Local
 * Ollama users may not have that key configured; for those sessions we skip
 * repair entirely so a malformed tool call surfaces as a normal SDK error
 * instead of crashing the request with "OPENROUTER_API_KEY must be set".
 */
export const createRepairToolCall = (provider: LLMProvider) => {
    if (provider === LLMProvider.OLLAMA) {
        // Skip repair for local-only sessions — the SDK will fall through to
        // its default error path and surface the malformed call to the model
        // for self-correction.
        return undefined;
    }
    if (!process.env.OPENROUTER_API_KEY) {
        // Repair would crash on first invocation; better to skip it entirely
        // and let the SDK propagate the original parameter error.
        console.warn('[repairToolCall] OPENROUTER_API_KEY not set, skipping tool-call repair');
        return undefined;
    }
    return repairToolCall;
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
