import { experimental_generateImage as generateImage } from 'ai';
import { z } from 'zod';

import type { ImageModelId } from '@weblab/models';
import { DEFAULT_IMAGE_MODEL, IMAGE_MODEL_CONFIGS, IMAGE_MODEL_IDS } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';

import type { ServerToolContext } from '../server-context';
import { putImage } from '../../image/cache';
import { generateImageViaOpenRouter, initImageModel } from '../../image/providers';
import { ServerTool } from '../models/server';

// Map the server-side limit errors (thrown by Convex `reserveImage` or the
// per-turn counter) to a concise message the agent can relay to the user.
function mapImageLimitError(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('IMAGE_DAILY_CAP_REACHED')) {
        return 'Daily image limit reached. Try again tomorrow or upgrade your plan.';
    }
    if (msg.includes('IMAGE_RATE_LIMITED')) {
        return 'Generating images too quickly — wait a moment and try again.';
    }
    if (msg.includes('IMAGE_TURN_CAP_REACHED')) {
        return 'Reached the maximum number of images for a single message.';
    }
    if (msg.includes('USAGE_LIMIT_REACHED')) {
        return 'Not enough credits to generate an image. Upgrade your plan for more.';
    }
    return 'Could not start image generation due to a usage limit.';
}

const SUPPORTED_SIZES = ['1024x1024', '1024x1536', '1536x1024', 'auto'] as const;
const ASPECT_RE = /^\d+:\d+$/;

export class GenerateImageTool extends ServerTool {
    static readonly toolName = 'generate_image';
    static readonly description =
        'Generate a new image from a text prompt. Returns metadata + a URL the UI uses to render the image inline. The user can save it to the project via the Add to Project button, or you can call add_generated_image_to_project with the returned id.';
    static readonly parameters = z.object({
        prompt: z.string().min(1).describe('Detailed prompt describing the image to generate.'),
        model: z
            .enum(IMAGE_MODEL_IDS as [ImageModelId, ...ImageModelId[]])
            .optional()
            .describe('Image model id. Defaults to gpt-image-2.'),
        size: z
            .enum(SUPPORTED_SIZES)
            .optional()
            .describe('1024x1024 (square), 1024x1536 (portrait), 1536x1024 (landscape), or auto.'),
        aspect_ratio: z
            .string()
            .regex(ASPECT_RE, 'Must be of the form W:H, e.g. 16:9')
            .optional()
            .describe('Aspect ratio. Used when the provider prefers ratios over sizes.'),
    });
    static readonly icon = Icons.Image;
    static readonly category = 'images';
    static readonly provider = 'openai';
    static readonly requiresNetwork = true;
    static readonly requiresProject = false;

    static async execute(
        input: object,
        ctx: ServerToolContext,
    ): Promise<{
        id: string;
        url: string;
        modelId: ImageModelId;
        prompt: string;
        mimeType: string;
    }> {
        const args = GenerateImageTool.parameters.parse(input);
        const modelId: ImageModelId = args.model ?? DEFAULT_IMAGE_MODEL;
        const config = IMAGE_MODEL_CONFIGS[modelId];

        // Reserve credits + enforce daily/burst/per-turn caps BEFORE spending on
        // the provider. The web app injects this; it's absent in unmetered
        // contexts (tests, local tooling), where generation proceeds uncapped.
        let creditHandle: Awaited<
            ReturnType<NonNullable<ServerToolContext['reserveImageCredits']>>
        > | null = null;
        if (ctx.reserveImageCredits) {
            try {
                creditHandle = await ctx.reserveImageCredits();
            } catch (err) {
                throw new Error(mapImageLimitError(err));
            }
        }

        try {
            let base64: string;
            let mimeType: string;

            if (config?.provider === 'openrouter') {
                const out = await generateImageViaOpenRouter(modelId, args.prompt, {
                    aspectRatio: args.aspect_ratio,
                });
                base64 = out.base64;
                mimeType = out.mimeType;
            } else {
                const model = initImageModel(modelId);
                // 'auto' is supported by OpenAI but not the AI SDK's
                // `${number}x${number}` template literal type — let the provider
                // default kick in.
                const sizeParam =
                    args.size && args.size !== 'auto'
                        ? { size: args.size as `${number}x${number}` }
                        : {};
                const result = await generateImage({
                    model,
                    prompt: args.prompt,
                    n: 1,
                    ...sizeParam,
                    ...(args.aspect_ratio
                        ? { aspectRatio: args.aspect_ratio as `${number}:${number}` }
                        : {}),
                });
                base64 = result.image.base64;
                mimeType = result.image.mediaType ?? 'image/png';
            }

            const id = putImage(base64, mimeType, ctx.userId);

            return {
                id,
                url: `/api/chat-images/${id}`,
                modelId,
                prompt: args.prompt,
                mimeType,
            };
        } catch (err) {
            // Generation failed after the credit was reserved — refund it so the
            // user isn't charged and the slot is freed from the daily/burst caps.
            if (creditHandle && ctx.releaseImageCredits) {
                await ctx.releaseImageCredits(creditHandle).catch(() => {
                    // Best-effort refund; never mask the original failure.
                });
            }
            throw err;
        }
    }

    static getLabel(input?: z.infer<typeof GenerateImageTool.parameters>): string {
        if (input?.prompt) {
            const trimmed =
                input.prompt.length > 32 ? input.prompt.slice(0, 32) + '…' : input.prompt;
            return `Generating image: "${trimmed}"`;
        }
        return 'Generating image';
    }
}
