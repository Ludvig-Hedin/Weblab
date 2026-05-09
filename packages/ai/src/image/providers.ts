import type { ImageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

import type { ImageModelId } from '@weblab/models';
import { IMAGE_MODEL_CONFIGS, IMAGE_MODELS } from '@weblab/models';

/**
 * Build the AI SDK ImageModel for a given image model id.
 *
 * Throws a clear error when:
 *  - the model id is not in the registry,
 *  - the provider for the model is not yet wired (placeholder),
 *  - the required env key is unset.
 *
 * Real provider routing for image gen is intentionally separate from chat
 * provider routing — chat goes through OpenRouter/Ollama; image gen goes
 * direct to OpenAI (and later other image-specific providers).
 */
export function initImageModel(modelId: ImageModelId): ImageModel {
    const config = IMAGE_MODEL_CONFIGS[modelId];
    if (!config) {
        throw new Error(`Unknown image model: ${modelId}`);
    }

    if (config.status === 'placeholder' || config.provider === 'placeholder') {
        throw new Error(
            `Image model "${config.label}" (${modelId}) is not yet available — ${config.todo ?? 'provider not wired'}`,
        );
    }

    if (!process.env[config.envKey]) {
        throw new Error(
            `Image model "${config.label}" (${modelId}) requires ${config.envKey} to be set in the server environment.`,
        );
    }

    if (config.provider === 'openai') {
        const openai = createOpenAI({ apiKey: process.env[config.envKey] });
        if (modelId === IMAGE_MODELS.GPT_IMAGE_2) {
            return openai.image('gpt-image-2');
        }
        return openai.image(modelId);
    }

    throw new Error(
        `Provider "${String(config.provider)}" for image model "${modelId}" is not implemented in initImageModel().`,
    );
}
