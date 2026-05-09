import { smoothStream, streamText } from 'ai';

import type { ChatModel } from '@weblab/models';
import {
    DEFAULT_INLINE_EDIT_MODEL,
    getProviderFromModel,
    LLMProvider,
    OPENROUTER_MODELS,
    type OllamaModelId,
} from '@weblab/models';

import { initModel } from '../chat/providers';

const SYSTEM_PROMPT = `You are an inline code editor. The user will give you a snippet of code and an instruction.

Output ONLY the rewritten snippet. No explanations, no markdown fences, no commentary, no diff markers.
The rewritten snippet replaces the original character-for-character — preserve indentation style and trailing newlines that were present in the original.
If the instruction asks for a question rather than an edit, still respond with the original code unchanged.`;

const USER_TEMPLATE = (params: {
    filePath: string;
    language: string;
    before: string;
    selection: string;
    after: string;
    instruction: string;
}) => `<file path="${params.filePath}" language="${params.language}">
<before>${params.before}</before>
<selection>${params.selection}</selection>
<after>${params.after}</after>
</file>
<instruction>${params.instruction}</instruction>

Rewrite the <selection> per the instruction. Output only the new selection text.`;

export interface InlineEditStreamArgs {
    filePath: string;
    language: string;
    /** Up to ~80 lines of code immediately before the selection, for context. */
    before: string;
    selection: string;
    /** Up to ~80 lines of code immediately after the selection, for context. */
    after: string;
    instruction: string;
    model?: ChatModel;
    ollamaBaseUrl?: string;
    userId: string;
    projectId: string;
    traceId: string;
    /** Propagate client aborts so cancelled requests stop billing tokens upstream. */
    abortSignal?: AbortSignal;
}

export const createInlineEditStream = ({
    filePath,
    language,
    before,
    selection,
    after,
    instruction,
    model,
    ollamaBaseUrl,
    userId,
    projectId,
    traceId,
    abortSignal,
}: InlineEditStreamArgs) => {
    const selectedModel: ChatModel = model ?? DEFAULT_INLINE_EDIT_MODEL;
    const provider = getProviderFromModel(selectedModel);
    const modelConfig =
        provider === LLMProvider.OLLAMA
            ? initModel({
                  provider: LLMProvider.OLLAMA,
                  model: selectedModel as OllamaModelId,
                  ollamaBaseUrl,
              })
            : initModel({
                  provider: LLMProvider.OPENROUTER,
                  model: selectedModel as OPENROUTER_MODELS,
              });

    return streamText({
        model: modelConfig.model,
        providerOptions: modelConfig.providerOptions,
        system: SYSTEM_PROMPT,
        prompt: USER_TEMPLATE({ filePath, language, before, selection, after, instruction }),
        // Cap output — inline edits should not be enormous.
        maxOutputTokens: Math.min(modelConfig.maxOutputTokens, 4096),
        abortSignal,
        experimental_transform: smoothStream(),
        experimental_telemetry: {
            isEnabled: true,
            metadata: {
                userId,
                projectId,
                tags: ['inline-edit'],
                langfuseTraceId: traceId,
                sessionId: traceId,
            },
        },
    });
};
