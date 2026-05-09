import { experimental_generateImage as generateImage } from 'ai';
import { z } from 'zod';

import type { ImageModelId } from '@weblab/models';
import { DEFAULT_IMAGE_MODEL, IMAGE_MODEL_IDS } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';

import type { ServerToolContext } from '../server-context';
import { putImage } from '../../image/cache';
import { initImageModel } from '../../image/providers';
import { ServerTool } from '../models/server';

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
        const model = initImageModel(modelId);

        // 'auto' is supported by OpenAI but not the AI SDK's `${number}x${number}`
        // template literal type — let the provider default kick in.
        const sizeParam =
            args.size && args.size !== 'auto' ? { size: args.size as `${number}x${number}` } : {};
        const result = await generateImage({
            model,
            prompt: args.prompt,
            n: 1,
            ...sizeParam,
            ...(args.aspect_ratio
                ? { aspectRatio: args.aspect_ratio as `${number}:${number}` }
                : {}),
        });

        const image = result.image;
        const mimeType = image.mediaType ?? 'image/png';
        const id = putImage(image.base64, mimeType, ctx.userId);

        return {
            id,
            url: `/api/chat-images/${id}`,
            modelId,
            prompt: args.prompt,
            mimeType,
        };
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
