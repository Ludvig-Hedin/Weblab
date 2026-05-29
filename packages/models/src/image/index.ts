/**
 * Registry of image generation/editing models exposed to the AI tool layer.
 *
 * Two real providers today:
 *  - `gpt-image-2`  → OpenAI direct (AI SDK `experimental_generateImage`).
 *  - `nano-banana`  → Google Gemini image via OpenRouter's REST chat-completions
 *                     endpoint (the OpenRouter AI-SDK provider has no image
 *                     interface, so the tool calls REST directly — see
 *                     packages/ai/src/image/providers.ts:generateImageViaOpenRouter).
 *
 * GPT image is intentionally NOT routed through OpenRouter — OpenRouter's image
 * endpoint only supports Gemini/Flux/Recraft families, not OpenAI image models.
 */

export const IMAGE_MODELS = {
    GPT_IMAGE_2: 'gpt-image-2',
    NANO_BANANA: 'nano-banana',
} as const;

export type ImageModelId = (typeof IMAGE_MODELS)[keyof typeof IMAGE_MODELS];

export const IMAGE_MODEL_IDS: ImageModelId[] = Object.values(IMAGE_MODELS);

export type ImageModelStatus = 'available' | 'placeholder';

export interface ImageModelConfig {
    id: string;
    label: string;
    provider: 'openai' | 'openrouter' | 'placeholder';
    status: ImageModelStatus;
    /** Server env var that gates runtime availability. */
    envKey: string;
    /**
     * Upstream model id used at the provider's API (e.g. the OpenRouter slug).
     * Only meaningful for non-OpenAI providers; OpenAI uses `id` directly.
     */
    providerModelId?: string;
    /** Human description of the placeholder gap, surfaced in errors. */
    todo?: string;
}

export const IMAGE_MODEL_CONFIGS: Record<string, ImageModelConfig> = {
    [IMAGE_MODELS.GPT_IMAGE_2]: {
        id: IMAGE_MODELS.GPT_IMAGE_2,
        label: 'GPT Image 2',
        provider: 'openai',
        status: 'available',
        envKey: 'OPENAI_API_KEY',
    },
    [IMAGE_MODELS.NANO_BANANA]: {
        id: IMAGE_MODELS.NANO_BANANA,
        label: 'Nano Banana',
        provider: 'openrouter',
        status: 'available',
        envKey: 'OPENROUTER_API_KEY',
        providerModelId: 'google/gemini-2.5-flash-image',
    },
};

export const DEFAULT_IMAGE_MODEL: ImageModelId = IMAGE_MODELS.GPT_IMAGE_2;

/**
 * Hard ceiling on image generations the agent may trigger within a single chat
 * turn. Defense-in-depth on top of the per-user daily cap + per-minute burst
 * limit enforced server-side (convex/lib/imageLimits.ts) — stops a runaway
 * tool-calling loop from racking up spend inside one response.
 */
export const IMAGE_MAX_PER_TURN = 4;
