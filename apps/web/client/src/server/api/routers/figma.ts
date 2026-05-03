import { extractFigmaFileKey, fetchFigmaFile, extractTopLevelFrames } from '@weblab/figma';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const figmaRouter = createTRPCRouter({
    fetchFile: protectedProcedure
        .input(
            z.object({
                personalAccessToken: z.string().min(1),
                fileUrl: z.string().url(),
            }),
        )
        .mutation(async ({ input }) => {
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
                file = await fetchFigmaFile(fileKey, input.personalAccessToken);
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
