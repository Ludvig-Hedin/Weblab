import { smoothStream, streamText } from 'ai';

import type { ChatModel, OllamaModelId, OPENROUTER_MODELS } from '@weblab/models';
import { DEFAULT_INLINE_EDIT_MODEL, getProviderFromModel, LLMProvider } from '@weblab/models';

import { initModel } from '../chat/providers';
import { escapeXml } from './xml-escape';

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
}) => `<file path="${escapeXml(params.filePath)}" language="${escapeXml(params.language)}">
<before>${escapeXml(params.before)}</before>
<selection>${escapeXml(params.selection)}</selection>
<after>${escapeXml(params.after)}</after>
</file>
<instruction>${escapeXml(params.instruction)}</instruction>

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
    /**
     * Called on a mid-stream failure (provider 5xx, network drop, abort). The
     * stream is returned lazily and errors fire AFTER the route's try/catch has
     * exited, so the caller can't catch them — this hook lets the caller refund
     * usage that was charged up-front and log the failure. Optional; omitting it
     * preserves the prior behavior exactly.
     */
    onError?: (error: unknown) => void;
    /**
     * Called when the client aborts mid-stream. The AI SDK routes aborts to
     * `onAbort`, NOT `onError`, so refund-on-cancel must hook this separately.
     * Optional; omitting it preserves the prior behavior exactly.
     */
    onAbort?: () => void;
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
    onError,
    onAbort,
}: InlineEditStreamArgs): ReturnType<typeof streamText> => {
    const selectedModel: ChatModel = model ?? DEFAULT_INLINE_EDIT_MODEL;
    const provider = getProviderFromModel(selectedModel);
    if (provider !== LLMProvider.OLLAMA && provider !== LLMProvider.OPENROUTER) {
        throw new Error(
            `inline-edit: unsupported provider "${provider}" for model "${selectedModel}"`,
        );
    }
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
        onError: onError ? (event) => onError(event.error) : undefined,
        onAbort: onAbort ? () => onAbort() : undefined,
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
