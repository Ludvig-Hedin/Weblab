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

const OPENROUTER_IMAGE_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Parse a base64 `data:` URL into raw base64 + mime type. Returns null for
 * non-`data:` URLs (caller rejects those). Throws when a `data:` URL is present
 * but malformed. Pure — unit-tested without network.
 */
export function parseImageDataUrl(url: string): { base64: string; mimeType: string } | null {
    if (!url.startsWith('data:')) {
        return null;
    }
    const match = /^data:([^;]+);base64,(.*)$/s.exec(url);
    if (!match?.[2]) {
        throw new Error('Malformed base64 image data URL.');
    }
    return { mimeType: match[1] ?? 'image/png', base64: match[2] };
}

/**
 * Generate an image through OpenRouter's REST chat-completions endpoint.
 *
 * OpenRouter's AI-SDK provider exposes no image interface, so image-capable
 * models (e.g. `google/gemini-2.5-flash-image`, "nano banana") are driven by a
 * direct REST call with `modalities: ['image','text']`. The image comes back as
 * a base64 data URL on `choices[0].message.images[0].image_url.url`.
 *
 * Returns raw base64 + mime so the caller can hand it to the same image cache
 * the OpenAI path uses.
 */
export async function generateImageViaOpenRouter(
    modelId: ImageModelId,
    prompt: string,
    opts?: { aspectRatio?: string },
): Promise<{ base64: string; mimeType: string }> {
    const config = IMAGE_MODEL_CONFIGS[modelId];
    if (!config) {
        throw new Error(`Unknown image model: ${modelId}`);
    }
    const apiKey = process.env[config.envKey];
    if (!apiKey) {
        throw new Error(
            `Image model "${config.label}" (${modelId}) requires ${config.envKey} to be set in the server environment.`,
        );
    }
    const providerModelId = config.providerModelId;
    if (!providerModelId) {
        throw new Error(
            `Image model "${modelId}" has no providerModelId configured for OpenRouter.`,
        );
    }

    const imageConfig: Record<string, string> = {};
    if (opts?.aspectRatio) {
        imageConfig.aspect_ratio = opts.aspectRatio;
    }

    const res = await fetch(OPENROUTER_IMAGE_ENDPOINT, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'https://weblab.build',
            'X-Title': 'Weblab',
        },
        body: JSON.stringify({
            model: providerModelId,
            messages: [{ role: 'user', content: prompt }],
            modalities: ['image', 'text'],
            ...(Object.keys(imageConfig).length > 0 ? { image_config: imageConfig } : {}),
        }),
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(
            `OpenRouter image generation failed (${res.status}): ${detail.slice(0, 200)}`,
        );
    }

    const json = (await res.json()) as {
        choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
    };
    const url = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (typeof url !== 'string' || url.length === 0) {
        throw new Error('OpenRouter returned no image in the response.');
    }

    const parsed = parseImageDataUrl(url);
    if (parsed) {
        return parsed;
    }

    // Only inline base64 `data:` URLs are accepted. We deliberately do NOT fetch
    // a hosted URL taken from the model response — that would be an SSRF vector
    // (server fetching an arbitrary URL from a semi-trusted upstream). The
    // configured models (e.g. gemini-2.5-flash-image) return base64 data URLs;
    // if a future model returns hosted URLs, add it behind a host allowlist.
    throw new Error('OpenRouter returned a non-inline image URL; expected base64 image data.');
}
