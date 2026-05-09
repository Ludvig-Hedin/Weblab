import mime from 'mime-lite';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import type { EditorEngine } from '@weblab/web-client/src/components/store/editor/engine';
import { Icons } from '@weblab/ui/icons';

import { ClientTool } from '../models/client';
import { sanitizeProjectPath } from '../shared/path';
import { BRANCH_ID_SCHEMA } from '../shared/type';

/**
 * Save an AI-generated image into the project, then return the new asset
 * path along with the target element's oid. The follow-up step is the AI
 * calling `search_replace_edit` on the JSX file containing that oid to
 * actually swap the element's `src`. The model receives a tight,
 * imperative hint string so the agent loop reliably chains the edit.
 */
export class ReplaceImageInElementTool extends ClientTool {
    static readonly toolName = 'replace_image_in_element';
    static readonly description =
        'Save an AI-generated image to the project and prepare to replace the src of a target element. REQUIRED: after this tool returns, you MUST call search_replace_edit on the JSX file containing data-oid="{element_oid}" to update its src to the returned assetUrl. Do not stop after this step.';
    static readonly parameters = z.object({
        id: z.string().describe('Cache id returned by generate_image or edit_image.'),
        element_oid: z
            .string()
            .describe('The oid (data-oid) of the element whose image src should be replaced.'),
        destination_path: z
            .string()
            .optional()
            .describe('Destination path within the project. Defaults to "public".'),
        filename: z.string().optional(),
        branchId: BRANCH_ID_SCHEMA,
    });
    static readonly icon = Icons.Image;
    static readonly category = 'images';

    async handle(
        args: z.infer<typeof ReplaceImageInElementTool.parameters>,
        editorEngine: EditorEngine,
    ): Promise<{
        assetPath: string;
        assetUrl: string;
        elementOid: string;
        nextStep: string;
    }> {
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
        const assetPath = `${destination}/${filename}`;
        await sandbox.writeFile(assetPath, bytes);

        // Only files under public/ are served at the site root by Next.js.
        // Refuse other destinations rather than emit a broken src attribute.
        if (destination !== 'public' && !destination.startsWith('public/')) {
            throw new Error(
                `replace_image_in_element only supports destinations under public/ (got "${destination}"). Save the file there so Next.js can serve it as /<filename>.`,
            );
        }
        const assetUrl = `/${assetPath.slice('public/'.length)}`;

        return {
            assetPath,
            assetUrl,
            elementOid: args.element_oid,
            nextStep: `Now call search_replace_edit on the JSX file containing data-oid="${args.element_oid}" to swap its src attribute to "${assetUrl}". Find the file with grep '${args.element_oid}' if you don't know it.`,
        };
    }

    static getLabel(_input?: z.infer<typeof ReplaceImageInElementTool.parameters>): string {
        return 'Replacing element image';
    }
}
