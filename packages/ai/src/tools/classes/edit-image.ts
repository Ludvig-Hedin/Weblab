import { z } from 'zod';

import type { ImageMessageContext } from '@weblab/models';
import { MessageContextType } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';

import type { ServerToolContext } from '../server-context';
import { putImage } from '../../image/cache';
import { ServerTool } from '../models/server';

const SUPPORTED_EDIT_SIZES = ['1024x1024', '1024x1536', '1536x1024', 'auto'] as const;

/**
 * Edit an existing image with `gpt-image-2` via the OpenAI images.edit
 * endpoint. Source is resolved server-side from `source_image_id` (matching
 * a chat upload's ImageMessageContext.id) so the heavy base64 never flows
 * through the AI SDK message thread.
 *
 * Result is cached and returned as { id, url } — same shape as
 * generate_image — so add_generated_image_to_project / replace_image_in_element
 * can chain off it without DB lookups.
 */
export class EditImageTool extends ServerTool {
    static readonly toolName = 'edit_image';
    static readonly description =
        'Edit an existing image. Source is resolved by source_image_id matching a chat-attached image (see <available-images> in the user message context). Returns metadata + a URL for inline rendering. Chain with add_generated_image_to_project or replace_image_in_element using the returned id.';
    static readonly parameters = z.object({
        prompt: z
            .string()
            .min(1)
            .describe('Edit prompt — describe the change to make to the source image.'),
        source_image_id: z
            .string()
            .describe(
                'Id of a chat-attached image (from <available-images> in the user message context).',
            ),
        size: z
            .enum(SUPPORTED_EDIT_SIZES)
            .optional()
            .describe('1024x1024 (square), 1024x1536 (portrait), 1536x1024 (landscape), or auto.'),
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
        modelId: string;
        prompt: string;
        mimeType: string;
    }> {
        const args = EditImageTool.parameters.parse(input);

        if (!process.env.OPENAI_API_KEY) {
            throw new Error('edit_image requires OPENAI_API_KEY in the server environment.');
        }

        const source = findImageContextById(ctx.messages, args.source_image_id);
        if (!source) {
            throw new Error(
                `Source image "${args.source_image_id}" not found among the chat-attached images for this turn.`,
            );
        }

        const sourceB64 = source.content.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
        const sourceBytes = Buffer.from(sourceB64, 'base64');
        const { default: OpenAI, toFile } = await import('openai');
        const sourceFile = await toFile(
            sourceBytes,
            `source.${extensionFromMime(source.mimeType)}`,
            {
                type: source.mimeType,
            },
        );

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        // The installed openai SDK types lag the live API; gpt-image-2 is a
        // real model id accepted by OpenAI's images.edit endpoint. The SDK
        // type union allows arbitrary strings via `(string & {})`.
        const result = await openai.images.edit({
            model: 'gpt-image-2',
            image: sourceFile,
            prompt: args.prompt,
            n: 1,
            ...(args.size ? { size: args.size } : {}),
        });

        const out = result.data?.[0];
        const b64 = out?.b64_json;
        if (!b64) {
            throw new Error('OpenAI image edit returned no data.');
        }

        const mimeType = 'image/png';
        const id = putImage(b64, mimeType, ctx.userId);

        return {
            id,
            url: `/api/chat-images/${id}`,
            modelId: 'gpt-image-2',
            prompt: args.prompt,
            mimeType,
        };
    }

    static getLabel(input?: z.infer<typeof EditImageTool.parameters>): string {
        if (input?.prompt) {
            const trimmed =
                input.prompt.length > 32 ? input.prompt.slice(0, 32) + '…' : input.prompt;
            return `Editing image: "${trimmed}"`;
        }
        return 'Editing image';
    }
}

interface MessageWithMetadata {
    metadata?: { context?: unknown[] };
}

function findImageContextById(
    messages: MessageWithMetadata[],
    imageId: string,
): ImageMessageContext | null {
    for (let i = messages.length - 1; i >= 0; i--) {
        const ctxs = messages[i]?.metadata?.context;
        if (!Array.isArray(ctxs)) continue;
        for (const c of ctxs) {
            if (
                c &&
                typeof c === 'object' &&
                (c as { type?: string }).type === MessageContextType.IMAGE &&
                (c as { id?: string }).id === imageId
            ) {
                return c as ImageMessageContext;
            }
        }
    }
    return null;
}

function extensionFromMime(mime: string): string {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
    if (mime === 'image/webp') return 'webp';
    return 'png';
}
