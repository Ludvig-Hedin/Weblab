import mime from 'mime-lite';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import type { EditorEngine } from '@weblab/web-client/src/components/store/editor/engine';
import { Icons } from '@weblab/ui/icons';

import { ClientTool } from '../models/client';
import { sanitizeProjectPath } from '../shared/path';
import { BRANCH_ID_SCHEMA } from '../shared/type';

/**
 * Save an AI-generated image into the project's sandbox. The image is
 * resolved by the cache id returned from `generate_image` / `edit_image`,
 * served from `/api/chat-images/<id>` — keeps the heavy base64 out of the
 * model's message thread.
 */
export class AddGeneratedImageToProjectTool extends ClientTool {
    static readonly toolName = 'add_generated_image_to_project';
    static readonly description =
        'Save an AI-generated image (returned from a prior generate_image / edit_image step) to the project. Pass the `id` from that step. Defaults the destination to public/.';
    static readonly parameters = z.object({
        id: z.string().describe('Cache id returned by generate_image or edit_image.'),
        destination_path: z
            .string()
            .optional()
            .describe('Destination path within the project. Defaults to "public".'),
        filename: z
            .string()
            .optional()
            .describe('Custom filename without extension. UUID is generated when omitted.'),
        branchId: BRANCH_ID_SCHEMA,
    });
    static readonly icon = Icons.Image;
    static readonly category = 'images';

    async handle(
        args: z.infer<typeof AddGeneratedImageToProjectTool.parameters>,
        editorEngine: EditorEngine,
    ): Promise<string> {
        const sandbox = editorEngine.branches.getSandboxById(args.branchId);
        if (!sandbox) {
            throw new Error(`Sandbox not found for branch ID: ${args.branchId}`);
        }

        const response = await fetch(`/api/chat-images/${encodeURIComponent(args.id)}`);
        if (!response.ok) {
            throw new Error(
                `Generated image with id "${args.id}" is no longer available. The cache may have expired (30 min TTL) — generate the image again.`,
            );
        }
        const mimeType = response.headers.get('content-type') ?? 'image/png';
        const bytes = new Uint8Array(await response.arrayBuffer());

        const extension = mime.getExtension(mimeType) ?? 'png';
        const safeFilenameBase = args.filename
            ? args.filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64)
            : uuidv4();
        const filename = `${safeFilenameBase}.${extension}`;
        const destination = sanitizeProjectPath(args.destination_path, 'public');
        const fullPath = `${destination}/${filename}`;

        await sandbox.writeFile(fullPath, bytes);
        return `Saved generated image to ${fullPath}`;
    }

    static getLabel(input?: z.infer<typeof AddGeneratedImageToProjectTool.parameters>): string {
        if (input?.filename) {
            return `Adding image ${input.filename.substring(0, 24)}`;
        }
        return 'Adding image to project';
    }
}
