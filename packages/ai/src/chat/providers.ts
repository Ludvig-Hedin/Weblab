import type { LanguageModel } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOllama } from 'ollama-ai-provider-v2';

import type { InitialModelPayload, ModelConfig, OllamaModelId } from '@weblab/models';
import {
    getMaxTokens,
    LLMProvider,
    OLLAMA_DEFAULT_BASE_URL,
    OPENROUTER_MODELS,
} from '@weblab/models';
import { assertNever } from '@weblab/utility';

export function initModel(payload: InitialModelPayload): ModelConfig {
    let model: LanguageModel;
    let providerOptions: Record<string, any> | undefined;
    const maxOutputTokens = getMaxTokens(payload.model);

    switch (payload.provider) {
        case LLMProvider.OPENROUTER: {
            model = getOpenRouterProvider(payload.model);
            providerOptions = {
                openrouter: { transforms: ['middle-out'] },
            };
            const isAnthropic =
                payload.model === OPENROUTER_MODELS.CLAUDE_4_5_SONNET ||
                payload.model === OPENROUTER_MODELS.CLAUDE_3_5_HAIKU ||
                payload.model === OPENROUTER_MODELS.CLAUDE_OPUS_4_7;
            if (isAnthropic) {
                providerOptions = {
                    ...providerOptions,
                    anthropic: { cacheControl: { type: 'ephemeral' } },
                };
            }
            break;
        }
        case LLMProvider.OLLAMA: {
            model = getOllamaProvider(
                payload.model,
                payload.ollamaBaseUrl ?? OLLAMA_DEFAULT_BASE_URL,
            );
            break;
        }
        default:
            assertNever(payload);
    }

    return {
        model,
        providerOptions,
        maxOutputTokens,
    };
}

function getOpenRouterProvider(model: OPENROUTER_MODELS): LanguageModel {
    if (!process.env.OPENROUTER_API_KEY) {
        throw new Error('OPENROUTER_API_KEY must be set');
    }
    const openrouter = createOpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY,
        headers: {
            'HTTP-Referer': 'https://weblab.build',
            'X-Title': 'Weblab',
        },
    });
    return openrouter(model);
}

function getOllamaProvider(modelId: OllamaModelId, baseUrl: string): LanguageModel {
    // Strip "ollama/" prefix — the SDK expects just the model name (e.g. "llama3.2")
    const modelName = modelId.replace(/^ollama\//, '');
    // Normalise: strip trailing /api (or /api/) so users who paste the API URL
    // don't end up with a doubled /api/api path.
    const root = baseUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
    const ollama = createOllama({ baseURL: `${root}/api` });
    // TODO (CR-021): `ollama-ai-provider-v2` exposes its own LanguageModel type
    // that doesn't structurally satisfy `ai`'s LanguageModel (minor version
    // mismatch). To remove this cast, align both packages to the same major
    // release of the AI SDK LanguageModel interface, then verify the return type
    // is assignable without assertion.
    return ollama(modelName) as unknown as LanguageModel;
}
