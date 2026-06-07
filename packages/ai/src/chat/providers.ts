import type { LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOllama } from 'ollama-ai-provider-v2';

import type {
    InitialModelPayload,
    ModelConfig,
    OllamaModelId,
    OPENROUTER_MODELS,
    ReasoningEffort,
} from '@weblab/models';
import {
    getMaxTokens,
    LLMProvider,
    modelSupportsReasoningEffort,
    OLLAMA_DEFAULT_BASE_URL,
} from '@weblab/models';
import { assertNever } from '@weblab/utility';

type ProviderOptions = Record<string, Record<string, unknown>>;

/**
 * Wire identifier surfaced via telemetry so we can tell direct-Anthropic calls
 * apart from OpenRouter-routed Anthropic calls at the dashboard layer. Routing
 * picks `anthropic-direct` only when ANTHROPIC_API_KEY is set AND the model is
 * one of Anthropic's.
 */
export type ResolvedProvider = 'openrouter' | 'ollama' | 'anthropic-direct';

/**
 * Map our OpenRouter-style Anthropic model ids onto the model strings that
 * Anthropic's direct API accepts. Keep this in one place so adding a new
 * Anthropic model only touches two files (this map + OPENROUTER_MODELS).
 *
 * The right side is intentionally the unversioned alias (no date suffix) so
 * we get whatever Anthropic considers current. If we ever need to pin to a
 * specific snapshot, change the right side.
 */
const ANTHROPIC_DIRECT_MODEL_MAP: Record<string, string> = {
    'anthropic/claude-opus-4.8': 'claude-opus-4-8',
    'anthropic/claude-sonnet-4.6': 'claude-sonnet-4-6',
    'anthropic/claude-3.5-haiku': 'claude-3-5-haiku-latest',
};

function isAnthropicModelId(model: string): boolean {
    return model.startsWith('anthropic/');
}

function canUseDirectAnthropic(model: string): boolean {
    if (!process.env.ANTHROPIC_API_KEY) return false;
    if (!isAnthropicModelId(model)) return false;
    return ANTHROPIC_DIRECT_MODEL_MAP[model] !== undefined;
}

/**
 * Public helper for callers (request-builder, telemetry) that need to know
 * what wire the call will actually go over without instantiating the model.
 */
export function resolveProviderForModel(payload: InitialModelPayload): ResolvedProvider {
    if (payload.provider === LLMProvider.OLLAMA) return 'ollama';
    if (canUseDirectAnthropic(payload.model)) return 'anthropic-direct';
    return 'openrouter';
}

export function initModel(payload: InitialModelPayload): ModelConfig {
    let model: LanguageModel;
    let providerOptions: ProviderOptions | undefined;
    const maxOutputTokens = getMaxTokens(payload.model);

    switch (payload.provider) {
        case LLMProvider.OPENROUTER: {
            const isAnthropic = isAnthropicModelId(payload.model);
            const useDirect = canUseDirectAnthropic(payload.model);

            if (useDirect) {
                // Direct Anthropic. Cache control is applied per-block at the
                // prompt assembly layer (see prompt/cache-blocks.ts) using
                // ProviderMetadata on system / message parts. We still set a
                // top-level provider option for any non-marked content so the
                // SDK doesn't strip the cacheControl markers on the way out.
                model = getDirectAnthropicProvider(payload.model);
                providerOptions = {
                    anthropic: { cacheControl: { type: 'ephemeral' } },
                };
            } else {
                model = getOpenRouterProvider(payload.model);
                providerOptions = {
                    openrouter: { transforms: ['middle-out'] },
                };
                if (isAnthropic) {
                    // OpenRouter-routed Anthropic — provider-level cache hint.
                    // Granularity here is whatever OpenRouter chooses to honour.
                    providerOptions = {
                        ...providerOptions,
                        anthropic: { cacheControl: { type: 'ephemeral' } },
                    };
                }
            }
            providerOptions = applyReasoningEffort(
                providerOptions,
                payload.model,
                payload.reasoningEffort,
            );
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

function applyReasoningEffort(
    base: ProviderOptions | undefined,
    model: OPENROUTER_MODELS,
    effort: ReasoningEffort | undefined,
): ProviderOptions | undefined {
    if (!effort || effort === 'minimal' || !modelSupportsReasoningEffort(model)) return base;
    const next: ProviderOptions = { ...(base ?? {}) };
    // For direct Anthropic models the SDK accepts a `thinking` budget; for
    // OpenRouter we route via the openrouter.reasoning.effort key (existing
    // contract). Detection mirrors initModel's branch so we apply the right
    // shape to whichever provider actually runs.
    if (canUseDirectAnthropic(model)) {
        next.anthropic = {
            ...(next.anthropic ?? {}),
            thinking: { type: 'enabled', budgetTokens: budgetForEffort(effort) },
        };
        return next;
    }
    next.openrouter = {
        ...(next.openrouter ?? {}),
        reasoning: { effort },
    };
    return next;
}

function budgetForEffort(effort: ReasoningEffort): number {
    switch (effort) {
        case 'low':
            return 2048;
        case 'medium':
            return 8192;
        case 'high':
            return 32768;
        default:
            return 0;
    }
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
    // TODO (CR-022): `@ai-sdk/gateway` vendors its own copy of `@ai-sdk/provider`
    // at a different minor, causing a structural LanguageModel mismatch. Remove
    // once the vendored duplicate is aligned (same issue as the Ollama cast).
    return openrouter(model) as unknown as LanguageModel;
}

function getDirectAnthropicProvider(model: OPENROUTER_MODELS): LanguageModel {
    // Caller has already checked ANTHROPIC_API_KEY via canUseDirectAnthropic.
    const directId = ANTHROPIC_DIRECT_MODEL_MAP[model];
    if (!directId) {
        // Defence: should be impossible because canUseDirectAnthropic returns
        // false when the id isn't in the map. Falling through to OpenRouter
        // here would be silent — surface it.
        throw new Error(`No direct Anthropic mapping for model "${model}"`);
    }
    const anthropic = createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        headers: {
            'anthropic-version': '2023-06-01',
        },
    });
    return anthropic(directId) as unknown as LanguageModel;
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
