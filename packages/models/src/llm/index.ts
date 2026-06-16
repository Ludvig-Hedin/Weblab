import type { LanguageModel } from 'ai';

export enum LLMProvider {
    OPENROUTER = 'openrouter',
    OLLAMA = 'ollama',
}

export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';

// ---------------------------------------------------------------------------
// Cloud model registry — edit here to add/remove OpenRouter models
// ---------------------------------------------------------------------------
export enum OPENROUTER_MODELS {
    // Generate object does not work for Anthropic models https://github.com/OpenRouterTeam/ai-sdk-provider/issues/165
    OPEN_AI_GPT_5_5 = 'openai/gpt-5.5',
    OPEN_AI_GPT_5_4_MINI = 'openai/gpt-5.4-mini',
    GEMINI_3_1_PRO_PREVIEW = 'google/gemini-3.1-pro-preview',
    CLAUDE_OPUS_4_8 = 'anthropic/claude-opus-4.8',
    CLAUDE_SONNET_4_6 = 'anthropic/claude-sonnet-4.6',
    CLAUDE_3_5_HAIKU = 'anthropic/claude-3.5-haiku',
    KIMI_K2_7_CODE = 'moonshotai/kimi-k2.7-code',
    GLM_5_2 = 'z-ai/glm-5.2',
    MINIMAX_M3 = 'minimax/minimax-m3',
    DEEPSEEK_V4_PRO = 'deepseek/deepseek-v4-pro',
    DEEPSEEK_V4_FLASH = 'deepseek/deepseek-v4-flash',
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

/**
 * User-facing reasoning effort knob. Controls how long the model "thinks"
 * before answering. Surfaced in the model picker as Fast / Balanced / Deep.
 *  - `minimal`  → Fast: skip reasoning entirely where the provider supports it
 *  - `low`      → Balanced (default for most surfaces)
 *  - `medium`   → more deliberate reasoning
 *  - `high`     → Deep: longest budget, slowest, best for hard tasks
 */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'minimal';

export type InitialModelPayload = {
    [K in keyof ModelMapping]: {
        provider: K;
        model: ModelMapping[K];
        /** Base URL for the Ollama server, required when provider is OLLAMA */
        ollamaBaseUrl?: string;
        /** User-selected reasoning effort. Translated to provider-specific options. */
        reasoningEffort?: ReasoningEffort;
    };
}[keyof ModelMapping];

export type ModelConfig = {
    model: LanguageModel;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    providerOptions?: Record<string, any>;
    headers?: Record<string, string>;
    maxOutputTokens: number;
};

/**
 * Models that meaningfully support a reasoning-effort knob. Used by the UI to
 * hide the Fast / Balanced / Deep selector for models where the control would
 * be a no-op (e.g. Ollama, non-reasoning Claude variants, Mistral).
 */
const REASONING_CAPABLE_MODELS: ReadonlySet<string> = new Set<string>([
    OPENROUTER_MODELS.OPEN_AI_GPT_5_5,
    OPENROUTER_MODELS.OPEN_AI_GPT_5_4_MINI,
    OPENROUTER_MODELS.GEMINI_3_1_PRO_PREVIEW,
    OPENROUTER_MODELS.CLAUDE_OPUS_4_8,
    OPENROUTER_MODELS.CLAUDE_SONNET_4_6,
    OPENROUTER_MODELS.DEEPSEEK_V4_PRO,
]);

export function modelSupportsReasoningEffort(model: ChatModel): boolean {
    return REASONING_CAPABLE_MODELS.has(model);
}

export const MODEL_MAX_TOKENS: Record<string, number> = {
    [OPENROUTER_MODELS.OPEN_AI_GPT_5_5]: 1050000,
    [OPENROUTER_MODELS.OPEN_AI_GPT_5_4_MINI]: 400000,
    [OPENROUTER_MODELS.GEMINI_3_1_PRO_PREVIEW]: 1048576,
    [OPENROUTER_MODELS.CLAUDE_OPUS_4_8]: 1000000,
    [OPENROUTER_MODELS.CLAUDE_SONNET_4_6]: 1000000,
    [OPENROUTER_MODELS.CLAUDE_3_5_HAIKU]: 200000,
    [OPENROUTER_MODELS.KIMI_K2_7_CODE]: 1000000,
    [OPENROUTER_MODELS.GLM_5_2]: 128000,
    [OPENROUTER_MODELS.MINIMAX_M3]: 1000000,
    [OPENROUTER_MODELS.DEEPSEEK_V4_PRO]: 1048576,
    [OPENROUTER_MODELS.DEEPSEEK_V4_FLASH]: 1048576,
    [OPENROUTER_MODELS.MISTRAL_CODESTRAL]: 256000,
};

/**
 * Defaults for Cursor-style in-editor AI surfaces.
 * Both keyed off OpenRouter so users only need OPENROUTER_API_KEY set.
 */
export const DEFAULT_INLINE_EDIT_MODEL: OPENROUTER_MODELS = OPENROUTER_MODELS.OPEN_AI_GPT_5_4_MINI;
export const DEFAULT_TAB_COMPLETE_MODEL: OPENROUTER_MODELS = OPENROUTER_MODELS.MISTRAL_CODESTRAL;
/** Cheap, fast model for structured-output tool-call repair. */
export const DEFAULT_REPAIR_MODEL: OPENROUTER_MODELS = OPENROUTER_MODELS.CLAUDE_3_5_HAIKU;

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

// ---------------------------------------------------------------------------
// Chat model options — shown in the UI model picker (cloud / OpenRouter)
// Edit here to add/remove models from the user-facing dropdown.
//
// `auto` (AUTO_MODEL_ID) is a sentinel — when the user picks it, the chat
// route delegates to `resolveAutoModel` in @weblab/ai to pick the real model
// per chat type + user tier + estimated input size.
// ---------------------------------------------------------------------------
export const AUTO_MODEL_ID = 'auto' as const;

export const CHAT_MODEL_OPTIONS = [
    {
        label: 'Auto',
        model: AUTO_MODEL_ID,
        description: 'Pick the best model per task automatically',
    },
    {
        label: 'GPT-5.5',
        model: OPENROUTER_MODELS.OPEN_AI_GPT_5_5,
    },
    {
        label: 'Claude Sonnet 4.6',
        model: OPENROUTER_MODELS.CLAUDE_SONNET_4_6,
    },
    {
        label: 'Claude Opus 4.8',
        model: OPENROUTER_MODELS.CLAUDE_OPUS_4_8,
    },
    {
        label: 'Gemini 3.1 Pro',
        model: OPENROUTER_MODELS.GEMINI_3_1_PRO_PREVIEW,
    },
    {
        label: 'DeepSeek V4 Pro',
        model: OPENROUTER_MODELS.DEEPSEEK_V4_PRO,
    },
    {
        label: 'Kimi K2.7 Code',
        model: OPENROUTER_MODELS.KIMI_K2_7_CODE,
    },
    {
        label: 'GLM-5.2',
        model: OPENROUTER_MODELS.GLM_5_2,
    },
    {
        label: 'MiniMax M3',
        model: OPENROUTER_MODELS.MINIMAX_M3,
    },
] as const;

/**
 * Canonical default chat model — single source of truth used by both:
 *   - `DefaultSettings.AI_SETTINGS.defaultModel` in `@weblab/constants`
 *   - the `ai-tab` settings UI fallback
 *
 * Anchored to the FIRST entry in `CHAT_MODEL_OPTIONS` (the `auto` sentinel)
 * so new users default to auto routing — gives best perf-per-dollar without
 * forcing the user to learn the model lineup.
 */
export const DEFAULT_CHAT_MODEL: OPENROUTER_MODELS | typeof AUTO_MODEL_ID =
    CHAT_MODEL_OPTIONS[0].model;

export type ChatModel = OPENROUTER_MODELS | OllamaModelId | typeof AUTO_MODEL_ID;

// ---------------------------------------------------------------------------
// Per-provider model lists — edit here to add/remove models everywhere.
// These feed manifest.ts and the Ollama pull dialog; no IDs live elsewhere.
// ---------------------------------------------------------------------------

/** Claude Code CLI models (direct Anthropic API model IDs). */
export const CLAUDE_CODE_MODELS = [
    { id: 'claude-opus-4.8', label: 'Claude Opus 4.8' },
    { id: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4.5', label: 'Claude Haiku 4.5' },
] as const;

/** Gemini CLI models (direct Gemini API model IDs). */
export const GEMINI_CLI_MODELS = [
    { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro' },
    { id: 'gemini-3.1-flash', label: 'Gemini 3.1 Flash' },
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
] as const;

/** Curated Ollama models shown in the "Pull model" dialog. */
export const OLLAMA_CURATED_MODELS = [
    { id: 'qwen2.5-coder:7b', label: 'Qwen 2.5 Coder 7B', size: '~4.5 GB' },
    { id: 'qwen2.5-coder:14b', label: 'Qwen 2.5 Coder 14B', size: '~9 GB' },
    { id: 'llama3.2:3b', label: 'Llama 3.2 3B', size: '~2 GB' },
    {
        id: 'deepseek-coder-v2:16b',
        label: 'DeepSeek Coder V2 16B',
        size: '~9 GB',
    },
    { id: 'gemma2:4b', label: 'Gemma 2 4B', size: '~3 GB' },
] as const;
