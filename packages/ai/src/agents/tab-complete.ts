import { generateText } from 'ai';

import type { ChatModel } from '@weblab/models';
import {
    DEFAULT_TAB_COMPLETE_MODEL,
    getProviderFromModel,
    LLMProvider,
    OPENROUTER_MODELS,
    type OllamaModelId,
} from '@weblab/models';

import { initModel } from '../chat/providers';

const SYSTEM_PROMPT = `You are a code completion engine.

Given the prefix and suffix of a file, output a single completion that should be inserted at the cursor (between prefix and suffix).

Rules:
- Output ONLY the inserted text. No explanations, no markdown fences.
- The completion must form valid code when concatenated as: prefix + completion + suffix.
- Prefer short, high-confidence completions. Stop at a natural boundary (end of line, end of expression, end of block).
- If you have low confidence about what to write, output an empty string.
- Do not repeat what's already in prefix or suffix.`;

const USER_TEMPLATE = (params: {
    filePath: string;
    language: string;
    prefix: string;
    suffix: string;
}) => `<file path="${params.filePath}" language="${params.language}">
<prefix>${params.prefix}</prefix>
<suffix>${params.suffix}</suffix>
</file>

Complete at the cursor.`;

export interface TabCompleteArgs {
    filePath: string;
    language: string;
    prefix: string;
    suffix: string;
    model?: ChatModel;
    ollamaBaseUrl?: string;
    userId: string;
    projectId: string;
    abortSignal?: AbortSignal;
}

export const generateTabCompletion = async ({
    filePath,
    language,
    prefix,
    suffix,
    model,
    ollamaBaseUrl,
    userId,
    projectId,
    abortSignal,
}: TabCompleteArgs): Promise<string> => {
    const selectedModel: ChatModel = model ?? DEFAULT_TAB_COMPLETE_MODEL;
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

    const { text } = await generateText({
        model: modelConfig.model,
        providerOptions: modelConfig.providerOptions,
        system: SYSTEM_PROMPT,
        prompt: USER_TEMPLATE({ filePath, language, prefix, suffix }),
        // Hard cap — completions over ~120 tokens are almost never accepted.
        maxOutputTokens: 128,
        abortSignal,
        experimental_telemetry: {
            isEnabled: true,
            metadata: {
                userId,
                projectId,
                tags: ['tab-complete'],
            },
        },
    });

    return text;
};
