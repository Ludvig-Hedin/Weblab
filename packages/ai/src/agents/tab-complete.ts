import { generateText } from 'ai';

import type { ChatModel, OllamaModelId, OPENROUTER_MODELS } from '@weblab/models';
import { DEFAULT_TAB_COMPLETE_MODEL, getProviderFromModel, LLMProvider } from '@weblab/models';

import { initModel } from '../chat/providers';
import { estimateCostFromResult } from '../observability';
import { escapeXml } from './xml-escape';

/** Codestral and Mistral models accept Mistral-style FIM tokens directly in the
 * prompt. When the selected model is Codestral, we send those tokens; otherwise
 * we fall back to a chat-style prompt that still works on GPT/Claude/etc. */
const isCodestral = (model: string) => model.toLowerCase().includes('codestral');

const buildFimPrompt = (prefix: string, suffix: string) => `[SUFFIX]${suffix}[PREFIX]${prefix}`;

const SYSTEM_PROMPT = `You are a fill-in-the-middle code completion engine.

Given the prefix and suffix of a file, output a single completion that should be inserted at the cursor (between prefix and suffix).

Rules:
- Output ONLY the inserted text. No explanations, no markdown fences.
- The completion must form valid code when concatenated as: prefix + completion + suffix.
- Prefer short, high-confidence completions. Stop at a natural boundary (end of line, end of expression, end of block).
- If you have low confidence about what to write, output an empty string.
- Do not repeat what's already in prefix or suffix.`;

const CHAT_USER_TEMPLATE = (params: {
    filePath: string;
    language: string;
    prefix: string;
    suffix: string;
}) => `<file path="${escapeXml(params.filePath)}" language="${escapeXml(params.language)}">
<prefix>${escapeXml(params.prefix)}</prefix>
<suffix>${escapeXml(params.suffix)}</suffix>
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
    /**
     * Reports the request's real token cost (USD) once generation completes, so
     * the caller can reconcile token-cost billing. Optional; best-effort and
     * wrapped so a sink failure never affects the returned completion.
     */
    onUsage?: (info: { estimatedCostUsd: number }) => void;
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
    onUsage,
}: TabCompleteArgs): Promise<string> => {
    const selectedModel: ChatModel = model ?? DEFAULT_TAB_COMPLETE_MODEL;
    const provider = getProviderFromModel(selectedModel);
    if (provider !== LLMProvider.OLLAMA && provider !== LLMProvider.OPENROUTER) {
        throw new Error(
            `tab-complete: unsupported provider "${provider}" for model "${selectedModel}"`,
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

    // FIM-tuned models (Codestral) get raw FIM tokens with no system prompt;
    // chat-tuned models get a structured XML prompt + system instructions.
    const useFim = typeof selectedModel === 'string' && isCodestral(selectedModel);
    const result = await generateText({
        model: modelConfig.model,
        providerOptions: modelConfig.providerOptions,
        system: useFim ? undefined : SYSTEM_PROMPT,
        prompt: useFim
            ? buildFimPrompt(prefix, suffix)
            : CHAT_USER_TEMPLATE({ filePath, language, prefix, suffix }),
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

    if (onUsage) {
        try {
            onUsage({
                estimatedCostUsd: estimateCostFromResult({
                    model: selectedModel,
                    usage: result.usage,
                    providerMetadata: result.providerMetadata,
                }),
            });
        } catch {
            // Best-effort metering — never let a sink error break the completion.
        }
    }

    return result.text;
};
