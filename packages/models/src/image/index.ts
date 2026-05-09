/**
 * Registry of image generation/editing models exposed to the AI tool layer.
 *
 * `gpt-image-2` is the only **active** model today (real OpenAI provider).
 * `nano-banana` lives in IMAGE_MODEL_CONFIGS as a documented placeholder
 * but is intentionally NOT in the active enum or IMAGE_MODEL_IDS — that
 * way the AI tool's Zod model enum cannot select it and produce a guaranteed
 * runtime failure. Re-add it once a real provider is wired.
 */

export const IMAGE_MODELS = {
    GPT_IMAGE_2: 'gpt-image-2',
} as const;

export type ImageModelId = (typeof IMAGE_MODELS)[keyof typeof IMAGE_MODELS];

export const IMAGE_MODEL_IDS: ImageModelId[] = Object.values(IMAGE_MODELS);

export type ImageModelStatus = 'available' | 'placeholder';

export interface ImageModelConfig {
    id: string;
    label: string;
    provider: 'openai' | 'placeholder';
    status: ImageModelStatus;
    /** Server env var that gates runtime availability. */
    envKey: string;
    /** Human description of the placeholder gap, surfaced in errors. */
    todo?: string;
}

/**
 * Extended config registry — includes the placeholder so docs/status pages
 * can list it. The runtime tool surface uses IMAGE_MODELS only.
 */
export const IMAGE_MODEL_CONFIGS: Record<string, ImageModelConfig> = {
    [IMAGE_MODELS.GPT_IMAGE_2]: {
        id: IMAGE_MODELS.GPT_IMAGE_2,
        label: 'GPT Image 2',
        provider: 'openai',
        status: 'available',
        envKey: 'OPENAI_API_KEY',
    },
    'nano-banana': {
        id: 'nano-banana',
        label: 'Nano Banana',
        provider: 'placeholder',
        status: 'placeholder',
        envKey: 'NANO_BANANA_API_KEY',
        todo: 'No first-party AI SDK provider for nano-banana yet — wire Replicate/fal or a direct provider.',
    },
};

export const DEFAULT_IMAGE_MODEL: ImageModelId = IMAGE_MODELS.GPT_IMAGE_2;
