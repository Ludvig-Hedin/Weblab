import type { LanguageModel } from 'ai';

export enum LLMProvider {
    OPENROUTER = 'openrouter',
    OLLAMA = 'ollama',
}

export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';

export enum OPENROUTER_MODELS {
    // Generate object does not work for Anthropic models https://github.com/OpenRouterTeam/ai-sdk-provider/issues/165
    OPEN_AI_GPT_5_5 = 'openai/gpt-5.5',
    OPEN_AI_GPT_5_4_MINI = 'openai/gpt-5.4-mini',
    GEMINI_3_PRO_PREVIEW = 'google/gemini-3-pro-preview',
    CLAUDE_OPUS_4_7 = 'anthropic/claude-opus-4.7',
    CLAUDE_3_5_HAIKU = 'anthropic/claude-3.5-haiku',
    KIMI_K2_6 = 'moonshotai/kimi-k2.6',
    GLM_5_1 = 'zai/glm-5.1',
    DEEPSEEK_V4_PRO = 'deepseek/deepseek-v4-pro',
    MISTRAL_CODESTRAL = 'mistralai/codestral-2501',
}

// Template literal type for Ollama model IDs (e.g. "ollama/llama3.2")
export type OllamaModelId = `ollama/${string}`;

export type LocalModelOption = {
    label: string;
    model: OllamaModelId;
    /** Human-readable size string from Ollama (e.g. "4.7 GB") */
    size?: string;
};

interface ModelMapping {
    [LLMProvider.OPENROUTER]: OPENROUTER_MODELS;
    [LLMProvider.OLLAMA]: OllamaModelId;
}

export type InitialModelPayload = {
    [K in keyof ModelMapping]: {
        provider: K;
        model: ModelMapping[K];
        /** Base URL for the Ollama server, required when provider is OLLAMA */
        ollamaBaseUrl?: string;
    };
}[keyof ModelMapping];

export type ModelConfig = {
    model: LanguageModel;
    providerOptions?: Record<string, any>;
    headers?: Record<string, string>;
    maxOutputTokens: number;
};

export const MODEL_MAX_TOKENS: Record<string, number> = {
    [OPENROUTER_MODELS.OPEN_AI_GPT_5_5]: 400000,
    [OPENROUTER_MODELS.OPEN_AI_GPT_5_4_MINI]: 400000,
    [OPENROUTER_MODELS.GEMINI_3_PRO_PREVIEW]: 1048576,
    [OPENROUTER_MODELS.CLAUDE_OPUS_4_7]: 200000,
    [OPENROUTER_MODELS.CLAUDE_3_5_HAIKU]: 200000,
    [OPENROUTER_MODELS.KIMI_K2_6]: 1000000,
    [OPENROUTER_MODELS.GLM_5_1]: 1000000,
    [OPENROUTER_MODELS.DEEPSEEK_V4_PRO]: 1000000,
    [OPENROUTER_MODELS.MISTRAL_CODESTRAL]: 256000,
};

/**
 * Defaults for Cursor-style in-editor AI surfaces.
 * Both keyed off OpenRouter so users only need OPENROUTER_API_KEY set.
 */
export const DEFAULT_INLINE_EDIT_MODEL: OPENROUTER_MODELS = OPENROUTER_MODELS.OPEN_AI_GPT_5_4_MINI;
export const DEFAULT_TAB_COMPLETE_MODEL: OPENROUTER_MODELS = OPENROUTER_MODELS.MISTRAL_CODESTRAL;

/** Fallback context window for local models not present in MODEL_MAX_TOKENS */
const OLLAMA_DEFAULT_MAX_TOKENS = 32768;

/** Resolve max output tokens for any model, cloud or local */
export function getMaxTokens(model: ChatModel): number {
    return MODEL_MAX_TOKENS[model] ?? OLLAMA_DEFAULT_MAX_TOKENS;
}

/** Parse provider from a model ID string (e.g. "ollama/llama3.2" → OLLAMA) */
export function getProviderFromModel(model: ChatModel): LLMProvider {
    if (model.startsWith('ollama/')) return LLMProvider.OLLAMA;
    return LLMProvider.OPENROUTER;
}

export const CHAT_MODEL_OPTIONS = [
    {
        label: 'OpenAI GPT-5.5',
        model: OPENROUTER_MODELS.OPEN_AI_GPT_5_5,
    },
    {
        label: 'Gemini 3 Pro Preview',
        model: OPENROUTER_MODELS.GEMINI_3_PRO_PREVIEW,
    },
    {
        label: 'Claude Opus 4.7',
        model: OPENROUTER_MODELS.CLAUDE_OPUS_4_7,
    },
    {
        label: 'Kimi K2.6',
        model: OPENROUTER_MODELS.KIMI_K2_6,
    },
    {
        label: 'GLM-5.1',
        model: OPENROUTER_MODELS.GLM_5_1,
    },
    {
        label: 'DeepSeek V4 Pro',
        model: OPENROUTER_MODELS.DEEPSEEK_V4_PRO,
    },
] as const;

/**
 * Canonical default chat model — single source of truth used by both:
 *   - `DefaultSettings.AI_SETTINGS.defaultModel` in `@weblab/constants`
 *   - the `ai-tab` settings UI fallback
 *
 * Always anchored to the head of `CHAT_MODEL_OPTIONS` so changing the option
 * order changes the default automatically (CR-025).
 */
export const DEFAULT_CHAT_MODEL: OPENROUTER_MODELS = CHAT_MODEL_OPTIONS[0].model;

export type ChatModel = OPENROUTER_MODELS | OllamaModelId;
