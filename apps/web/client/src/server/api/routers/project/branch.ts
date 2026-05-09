import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import type { Frame } from '@weblab/models';
import { CodeProvider, getStaticCodeProvider } from '@weblab/code-provider';
import { DEFAULT_NEW_PROJECT_TEMPLATE, getSandboxPreviewUrl } from '@weblab/constants';
import {
    branches,
    branchInsertSchema,
    branchUpdateSchema,
    canvases,
    createDefaultBreakpointGroup,
    DEFAULT_BREAKPOINT_PRESETS,
    frames,
    fromDbBranch,
    fromDbFrame,
    GROUP_GUTTER,
} from '@weblab/db';
import { calculateNonOverlappingPosition, generateUniqueBranchName } from '@weblab/utility';

import { createTRPCRouter, protectedProcedure } from '../../trpc';
import { extractCsbPort, verifyProjectAccess } from './helper';

const SANDBOX_PRIVACY = 'private' as const;

// Helper function to get existing frames in a canvas
async function getExistingFrames(tx: any, canvasId: string): Promise<Frame[]> {
    const dbFrames = await tx.query.frames.findMany({
        where: eq(frames.canvasId, canvasId),
    });
    return dbFrames.map(fromDbFrame);
}

export const branchRouter = createTRPCRouter({
    getByProjectId: protectedProcedure
        .input(
            z.object({
                projectId: z.string(),
                onlyDefault: z.boolean().optional(),
            }),
        )
        .query(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const dbBranches = await ctx.db.query.branches.findMany({
                where: input.onlyDefault
                    ? and(eq(branches.isDefault, true), eq(branches.projectId, input.projectId))
                    : eq(branches.projectId, input.projectId),
                with: {
                    frames: true,
                },
            });
            // TODO: Create a default branch if none exists for backwards compatibility

            if (!dbBranches || dbBranches.length === 0) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Branches not found',
                });
            }
            return dbBranches.map((branch) => ({
                ...fromDbBranch(branch),
                frames: branch.frames.map(fromDbFrame),
            }));
        }),
    create: protectedProcedure.input(branchInsertSchema).mutation(async ({ ctx, input }) => {
        if (!input.projectId) {
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'projectId is required',
            });
        }
        await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
        try {
            await ctx.db.insert(branches).values(input);
            return true;
        } catch (error) {
            console.error('Error creating branch', error);
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: error instanceof Error ? error.message : 'Failed to create branch',
            });
        }
    }),
    update: protectedProcedure
        // Omit server-immutable fields at the schema level — Zod rejects any
        // caller that passes them rather than silently stripping (CR-119).
        .input(branchUpdateSchema.omit({ projectId: true, sandboxId: true }))
        .mutation(async ({ ctx, input }) => {
            const existing = await ctx.db.query.branches.findFirst({
                where: eq(branches.id, input.id),
            });
            if (!existing) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Branch not found',
                });
            }
            await verifyProjectAccess(ctx.db, ctx.user.id, existing.projectId);

            // Destructure id for the WHERE clause; spread the rest into SET.
            const { id, ...rest } = input;

            try {
                await ctx.db
                    .update(branches)
                    .set({ ...rest, updatedAt: new Date() })
                    .where(eq(branches.id, id));
                return true;
            } catch (error) {
                console.error('Error updating branch', error);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to update branch',
                    cause: error,
                });
            }
        }),
    delete: protectedProcedure
        .input(
            z.object({
                branchId: z.string().uuid(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const existing = await ctx.db.query.branches.findFirst({
                where: eq(branches.id, input.branchId),
            });
            if (!existing) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Branch not found',
                });
            }
            await verifyProjectAccess(ctx.db, ctx.user.id, existing.projectId);
            try {
                await ctx.db.delete(branches).where(eq(branches.id, input.branchId));
                return true;
            } catch (error) {
                console.error('Error deleting branch', error);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to delete branch',
                    cause: error,
                });
            }
        }),
    fork: protectedProcedure
        .input(
            z.object({
                branchId: z.uuid(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            try {
                // Get source branch with its frames to extract port
                const sourceBranch = await ctx.db.query.branches.findFirst({
                    where: eq(branches.id, input.branchId),
                    with: {
                        frames: true,
                    },
                });

                if (!sourceBranch) {
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: 'Source branch not found',
                    });
                }

                await verifyProjectAccess(ctx.db, ctx.user.id, sourceBranch.projectId);

                // Get existing branch names for unique name generation
                const existingBranches = await ctx.db.query.branches.findMany({
                    where: eq(branches.projectId, sourceBranch.projectId),
                });
                const existingNames = existingBranches.map((branch) => branch.name);

                // Generate unique branch name
                const branchName: string = generateUniqueBranchName(
                    sourceBranch.name,
                    existingNames,
                );

                // Fork the sandbox using code provider
                const CodesandboxProvider = await getStaticCodeProvider(CodeProvider.CodeSandbox);
                const forkedSandbox = await CodesandboxProvider.createProject({
                    source: 'template',
                    id: sourceBranch.sandboxId,
                    title: branchName,
                    tags: ['fork'],
                    privacy: SANDBOX_PRIVACY,
                });

                const sandboxId = forkedSandbox.id;
                // Extract port from source branch frames or fall back to 3000
                const port = extractCsbPort(sourceBranch.frames) ?? 3000;
                const previewUrl = getSandboxPreviewUrl(
                    sandboxId,
                    port,
                    forkedSandbox.previewToken,
                );

                // Create new branch
                const newBranchId = uuidv4();
                const newBranch = {
                    id: newBranchId,
                    name: branchName,
                    description: null,
                    projectId: sourceBranch.projectId,
                    sandboxId,
                    isDefault: false,
                    gitBranch: null,
                    gitCommitSha: null,
                    gitRepoUrl: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    runtimeType: 'cloud' as const,
                    runtimeMetadata: {},
                };

                return await ctx.db.transaction(async (tx) => {
                    await tx.insert(branches).values(newBranch);

                    // Always create at least one frame using the target branch's frame data
                    const createdFrames: Frame[] = [];

                    // Get the canvas for the project
                    const canvas = await tx.query.canvases.findFirst({
                        where: eq(canvases.projectId, sourceBranch.projectId),
                    });

                    if (canvas) {
                        // Get existing frames for smart positioning
                        const existingFrames = await getExistingFrames(tx, canvas.id);

                        // Use the first frame's position as anchor for the new group
                        let baseX = 100;
                        let baseY = 100;
                        if (
                            sourceBranch.frames &&
                            sourceBranch.frames.length > 0 &&
                            sourceBranch.frames[0]
                        ) {
                            const sourceFrame = sourceBranch.frames[0];
                            baseX = parseInt(sourceFrame.x) || baseX;
                            baseY = parseInt(sourceFrame.y) || baseY;
                        }

                        // Total width occupied by a default group (Desktop + Tablet + Phone with gutters)
                        const groupWidth =
                            DEFAULT_BREAKPOINT_PRESETS.reduce(
                                (sum, p) => sum + p.width + GROUP_GUTTER,
                                0,
                            ) - GROUP_GUTTER;
                        const desktopHeight = DEFAULT_BREAKPOINT_PRESETS[0]!.height;

                        const probe: Frame = {
                            id: uuidv4(),
                            branchId: newBranchId,
                            canvasId: canvas.id,
                            position: {
                                x: baseX + groupWidth + 100,
                                y: baseY,
                            },
                            dimension: {
                                width: groupWidth,
                                height: desktopHeight,
                            },
                            url: previewUrl,
                            groupId: 'probe',
                            breakpoint: {
                                id: 'desktop',
                                name: 'Desktop',
                                width: groupWidth,
                                order: 0,
                            },
                        };

                        const optimalPosition = calculateNonOverlappingPosition(
                            probe,
                            existingFrames,
                        );

                        const newFramesGroup = createDefaultBreakpointGroup({
                            canvasId: canvas.id,
                            branchId: newBranchId,
                            url: previewUrl,
                            startX: optimalPosition.x,
                            startY: optimalPosition.y,
                        });

                        await tx.insert(frames).values(newFramesGroup);
                        for (const f of newFramesGroup) {
                            createdFrames.push(fromDbFrame(f));
                        }
                    }

                    return {
                        branch: fromDbBranch(newBranch),
                        frames: createdFrames,
                        sandboxId,
                        previewUrl,
                    };
                });
            } catch (error) {
                console.error('Error forking branch', error);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: error instanceof Error ? error.message : 'Failed to fork branch',
                });
            }
        }),
    createBlank: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                branchName: z.string().optional(),
                framePosition: z
                    .object({
                        x: z.number(),
                        y: z.number(),
                        width: z.number(),
                        height: z.number(),
                    })
                    .optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            try {
                return await ctx.db.transaction(async (tx) => {
                    // Get existing branches with frames for unique name generation and port extraction
                    const existingBranches = await tx.query.branches.findMany({
                        where: eq(branches.projectId, input.projectId),
                        with: {
                            frames: true,
                        },
                    });
                    const existingNames = existingBranches.map((branch) => branch.name);

                    // Generate unique branch name if not provided
                    const baseName = 'empty';
                    let branchName: string;
                    if (input.branchName) {
                        branchName = input.branchName;
                    } else {
                        branchName = generateUniqueBranchName(baseName, existingNames);
                    }

                    // Create new blank sandbox
                    const CodesandboxProvider = await getStaticCodeProvider(
                        CodeProvider.CodeSandbox,
                    );
                    const blankSandbox = await CodesandboxProvider.createProject({
                        source: 'template',
                        id: DEFAULT_NEW_PROJECT_TEMPLATE.id,
                        title: branchName,
                        tags: ['blank'],
                        privacy: SANDBOX_PRIVACY,
                    });

                    const sandboxId = blankSandbox.id;
                    // Extract port from existing project frames or fall back to 3000
                    const allFrames = existingBranches.flatMap((branch) => branch.frames || []);
                    const port = extractCsbPort(allFrames) ?? 3000;
                    const previewUrl = getSandboxPreviewUrl(
                        sandboxId,
                        port,
                        blankSandbox.previewToken,
                    );

                    // Create new branch
                    const newBranchId = uuidv4();
                    const newBranch = {
                        id: newBranchId,
                        name: branchName,
                        description: null,
                        projectId: input.projectId,
                        sandboxId,
                        isDefault: false,
                        gitBranch: null,
                        gitCommitSha: null,
                        gitRepoUrl: null,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        runtimeType: 'cloud' as const,
                        runtimeMetadata: {},
                    };

                    await tx.insert(branches).values(newBranch);

                    // Create new frame if position is provided
                    const createdFrames: Frame[] = [];
                    if (input.framePosition) {
                        // Get the canvas for the project
                        const canvas = await tx.query.canvases.findFirst({
                            where: eq(canvases.projectId, input.projectId),
                        });

                        if (canvas) {
                            // Get existing frames for smart positioning
                            const existingFrames = await getExistingFrames(tx, canvas.id);

                            const groupWidth =
                                DEFAULT_BREAKPOINT_PRESETS.reduce(
                                    (sum, p) => sum + p.width + GROUP_GUTTER,
                                    0,
                                ) - GROUP_GUTTER;
                            const desktopHeight = DEFAULT_BREAKPOINT_PRESETS[0]!.height;

                            const probe: Frame = {
                                id: uuidv4(),
                                branchId: newBranchId,
                                canvasId: canvas.id,
                                position: {
                                    x: input.framePosition.x + input.framePosition.width + 100,
                                    y: input.framePosition.y,
                                },
                                dimension: {
                                    width: groupWidth,
                                    height: desktopHeight,
                                },
                                url: previewUrl,
                                groupId: 'probe',
                                breakpoint: {
                                    id: 'desktop',
                                    name: 'Desktop',
                                    width: groupWidth,
                                    order: 0,
                                },
                            };

                            const optimalPosition = calculateNonOverlappingPosition(
                                probe,
                                existingFrames,
                            );

                            const newFramesGroup = createDefaultBreakpointGroup({
                                canvasId: canvas.id,
                                branchId: newBranchId,
                                url: previewUrl,
                                startX: optimalPosition.x,
                                startY: optimalPosition.y,
                            });

                            await tx.insert(frames).values(newFramesGroup);
                            for (const f of newFramesGroup) {
                                createdFrames.push(fromDbFrame(f));
                            }
                        }
                    }

                    return {
                        branch: fromDbBranch(newBranch),
                        frames: createdFrames,
                        sandboxId,
                        previewUrl,
                    };
                });
            } catch (error) {
                console.error('Error creating blank sandbox', error);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message:
                        error instanceof Error ? error.message : 'Failed to create blank sandbox',
                });
            }
        }),
});
