import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { extractFigmaFileKey, extractTopLevelFrames, fetchFigmaFile } from '@weblab/figma';

import { createTRPCRouter, protectedProcedure } from '../trpc';

export const figmaRouter = createTRPCRouter({
    fetchFile: protectedProcedure
        .input(
            z.object({
                fileUrl: z.string().url(),
                personalAccessToken: z.string().min(1).optional(),
            }),
        )
        .mutation(async ({ input }) => {
            const pat = input.personalAccessToken;
            if (!pat) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Paste a Figma personal access token to import this file.',
                });
            }
            const fileKey = extractFigmaFileKey(input.fileUrl);
            if (!fileKey) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message:
                        'Could not extract a file key from the Figma URL. Use a /file/ or /design/ URL.',
                });
            }
            let file;
            try {
                file = await fetchFigmaFile(fileKey, pat);
            } catch (err) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: err instanceof Error ? err.message : 'Failed to fetch Figma file',
                    cause: err,
                });
            }
            return {
                fileName: file.name,
                fileKey,
                frames: extractTopLevelFrames(file),
            };
        }),
});
