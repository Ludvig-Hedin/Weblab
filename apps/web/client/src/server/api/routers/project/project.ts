import FirecrawlApp from '@mendable/firecrawl-js';
import { TRPCError } from '@trpc/server';
import { generateText } from 'ai';
import { and, eq, ne } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import type { Canvas, UserCanvas } from '@weblab/db';
import type { ProjectFrameworkId } from '@weblab/models';
import { initModel } from '@weblab/ai';
import { getSandboxPreviewUrl, STORAGE_BUCKETS } from '@weblab/constants';
import {
    branches,
    canvases,
    conversations,
    createDefaultBranch,
    createDefaultBreakpointGroup,
    createDefaultCanvas,
    createDefaultConversation,
    createDefaultUserCanvas,
    frames,
    fromDbCanvas,
    fromDbFrame,
    fromDbProject,
    projectCreateRequestInsertSchema,
    projectCreateRequests,
    projectInsertSchema,
    projects,
    projectUpdateSchema,
    toDbPreviewImg,
    userCanvases,
    userProjects,
} from '@weblab/db';
import { compressImageServer } from '@weblab/image-server';
import {
    LLMProvider,
    OPENROUTER_MODELS,
    ProjectCreateRequestStatus,
    ProjectRole,
} from '@weblab/models';
import { getScreenshotPath } from '@weblab/utility';

import { env } from '@/env';
import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { trackEvent } from '@/utils/analytics/server';
import { projectCreateRequestRouter } from './createRequest';
import { fork } from './fork';
import { extractCsbPort, verifyProjectAccess } from './helper';
import { offlineRouter } from './offline';

export const projectRouter = createTRPCRouter({
    hasAccess: protectedProcedure
        .input(z.object({ projectId: z.string() }))
        .query(async ({ ctx, input }) => {
            const user = ctx.user;
            const project = await ctx.db.query.projects.findFirst({
                where: eq(projects.id, input.projectId),
                with: {
                    userProjects: {
                        where: eq(userProjects.userId, user.id),
                    },
                },
            });
            return !!project && project.userProjects.length > 0;
        }),
    createRequest: projectCreateRequestRouter,
    offline: offlineRouter,
    captureScreenshot: protectedProcedure
        .input(z.object({ projectId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            try {
                await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
                if (!env.FIRECRAWL_API_KEY) {
                    throw new Error('FIRECRAWL_API_KEY is not configured');
                }

                const branch = await ctx.db.query.branches.findFirst({
                    where: and(
                        eq(branches.projectId, input.projectId),
                        eq(branches.isDefault, true),
                    ),
                    with: {
                        frames: true,
                    },
                });

                if (!branch) {
                    throw new Error('Branch not found');
                }

                if (!branch.sandboxId) {
                    throw new Error('No sandbox found for branch');
                }

                // Extract port from existing frame URL or fall back to 3000
                const port = extractCsbPort(branch.frames) ?? 3000;
                const url = branch.frames[0]?.url ?? getSandboxPreviewUrl(branch.sandboxId, port);
                const app = new FirecrawlApp({ apiKey: env.FIRECRAWL_API_KEY });

                // Optional: Add actions to click the button for CSB free tier
                // const _csbFreeActions = [{
                //     type: 'click',
                //     selector: '#btn-answer-yes',
                // }];
                const result = await app.scrapeUrl(url, {
                    formats: ['screenshot'],
                    onlyMainContent: true,
                    timeout: 10000,
                });

                if (!result.success) {
                    throw new Error(`Failed to scrape URL: ${result.error || 'Unknown error'}`);
                }

                const screenshotUrl = result.screenshot;

                if (!screenshotUrl) {
                    throw new Error('Invalid screenshot URL');
                }

                const response = await fetch(screenshotUrl, {
                    signal: AbortSignal.timeout(10000),
                });
                if (!response.ok) {
                    throw new Error(
                        `Failed to fetch screenshot: ${response.status} ${response.statusText}`,
                    );
                }

                const arrayBuffer = await response.arrayBuffer();
                const mimeType = response.headers.get('content-type') ?? 'image/png';
                const buffer = Buffer.from(arrayBuffer);

                const compressedImage = await compressImageServer(buffer, undefined, {
                    quality: 80,
                    width: 1024,
                    height: 1024,
                    format: 'jpeg',
                });

                const useCompressed = !!compressedImage.buffer;
                const finalMimeType = useCompressed ? 'image/jpeg' : mimeType;
                const finalBuffer = useCompressed ? (compressedImage.buffer ?? buffer) : buffer;

                const path = getScreenshotPath(input.projectId, finalMimeType);

                const { data, error } = await ctx.supabase.storage
                    .from(STORAGE_BUCKETS.PREVIEW_IMAGES)
                    .upload(path, finalBuffer, {
                        contentType: finalMimeType,
                    });

                if (error) {
                    throw new Error(`Supabase upload error: ${error.message}`);
                }

                if (!data) {
                    throw new Error('No data returned from storage upload');
                }

                const { previewImgUrl, previewImgPath, previewImgBucket, updatedPreviewImgAt } =
                    toDbPreviewImg({
                        type: 'storage',
                        storagePath: {
                            bucket: STORAGE_BUCKETS.PREVIEW_IMAGES,
                            path: data.path,
                        },
                        updatedAt: new Date(),
                    });

                await ctx.db
                    .update(projects)
                    .set({
                        previewImgUrl,
                        previewImgPath,
                        previewImgBucket,
                        updatedPreviewImgAt,
                        updatedAt: new Date(),
                    })
                    .where(eq(projects.id, input.projectId));

                return { success: true, path: data.path };
            } catch (error) {
                console.error('Error capturing project screenshot:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        }),
    list: protectedProcedure
        .input(
            z
                .object({
                    limit: z.number().optional(),
                    excludeProjectId: z.string().optional(),
                })
                .optional(),
        )
        .query(async ({ ctx, input }) => {
            const fetchedUserProjects = await ctx.db.query.userProjects.findMany({
                where: input?.excludeProjectId
                    ? and(
                          eq(userProjects.userId, ctx.user.id),
                          ne(userProjects.projectId, input.excludeProjectId),
                      )
                    : eq(userProjects.userId, ctx.user.id),
                with: {
                    project: {
                        with: {
                            branches: {
                                where: eq(branches.isDefault, true),
                                with: {
                                    frames: true,
                                },
                            },
                            previewDomains: true,
                            projectCustomDomains: true,
                        },
                    },
                },
                limit: input?.limit,
            });
            return fetchedUserProjects
                .map((userProject) => {
                    const project = userProject.project;
                    const defaultBranch = project.branches[0];
                    const previewDomain = project.previewDomains[0]?.fullDomain ?? null;
                    const publishedDomain = project.projectCustomDomains[0]?.fullDomain ?? null;
                    const previewUrl = previewDomain ? `https://${previewDomain}` : null;
                    const publishedUrl = publishedDomain ? `https://${publishedDomain}` : null;

                    return {
                        ...fromDbProject(project),
                        previewUrl,
                        publishedUrl,
                        // Only surface user-facing weblab domains. The raw CSB sandbox
                        // URL (frameUrl) is an internal dev-server address that should
                        // never appear in the project card or be shared externally.
                        siteUrl: publishedUrl ?? previewUrl ?? null,
                    };
                })
                .sort(
                    (a, b) =>
                        new Date(b.metadata.updatedAt).getTime() -
                        new Date(a.metadata.updatedAt).getTime(),
                );
        }),
    get: protectedProcedure
        .input(z.object({ projectId: z.string() }))
        .query(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const project = await ctx.db.query.projects.findFirst({
                where: eq(projects.id, input.projectId),
            });
            if (!project) {
                console.error('project not found');
                return null;
            }
            return fromDbProject(project);
        }),
    getProjectWithCanvas: protectedProcedure
        .input(z.object({ projectId: z.string() }))
        .query(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const project = await ctx.db.query.projects.findFirst({
                where: eq(projects.id, input.projectId),
                with: {
                    canvas: {
                        with: {
                            frames: true,
                            userCanvases: {
                                where: eq(userCanvases.userId, ctx.user.id),
                            },
                        },
                    },
                },
            });
            if (!project) {
                console.error('project not found');
                return null;
            }
            const canvas: Canvas = project.canvas ?? createDefaultCanvas(project.id);
            const userCanvas: UserCanvas =
                project.canvas?.userCanvases[0] ?? createDefaultUserCanvas(ctx.user.id, canvas.id);

            return {
                project: fromDbProject(project),
                userCanvas: fromDbCanvas(userCanvas),
                frames: project.canvas?.frames.map(fromDbFrame) ?? [],
            };
        }),
    create: protectedProcedure
        .input(
            z.object({
                project: projectInsertSchema,
                sandboxId: z.string(),
                sandboxUrl: z.string(),
                creationData: projectCreateRequestInsertSchema
                    .omit({
                        projectId: true,
                    })
                    .optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const ownerId = ctx.user.id;
            return await ctx.db.transaction(async (tx) => {
                // 1. Insert the new project
                const [newProject] = await tx.insert(projects).values(input.project).returning();
                if (!newProject) {
                    throw new Error('Failed to create project in database');
                }

                // 2. Create the default branch
                const newBranch = createDefaultBranch({
                    projectId: newProject.id,
                    sandboxId: input.sandboxId,
                });
                await tx.insert(branches).values(newBranch);

                // 3. Create the association in the junction table
                await tx.insert(userProjects).values({
                    userId: ownerId,
                    projectId: newProject.id,
                    role: ProjectRole.OWNER,
                });

                // 4. Create the default canvas
                const newCanvas = createDefaultCanvas(newProject.id);
                await tx.insert(canvases).values(newCanvas);

                const newUserCanvas = createDefaultUserCanvas(ownerId, newCanvas.id, {
                    x: '120',
                    y: '120',
                    scale: '0.56',
                });
                await tx.insert(userCanvases).values(newUserCanvas);

                // 5. Create the default breakpoint group (Desktop + Tablet + Phone)
                const defaultFrames = createDefaultBreakpointGroup({
                    canvasId: newCanvas.id,
                    branchId: newBranch.id,
                    url: input.sandboxUrl,
                });
                await tx.insert(frames).values(defaultFrames);

                // 6. Create the default chat conversation
                await tx.insert(conversations).values(createDefaultConversation(newProject.id));

                // 7. Create the creation request
                if (input.creationData) {
                    await tx.insert(projectCreateRequests).values({
                        ...input.creationData,
                        status: ProjectCreateRequestStatus.PENDING,
                        projectId: newProject.id,
                    });
                }

                trackEvent({
                    distinctId: ownerId,
                    event: 'user_create_project',
                    properties: {
                        projectId: newProject.id,
                    },
                });
                return newProject;
            });
        }),
    createLocal: protectedProcedure
        .input(
            z.object({
                name: z.string().trim().min(1),
                description: z.string().optional(),
                rootPath: z.string().trim().min(1),
                devCommand: z.string().trim().min(1).default('bun run dev'),
                port: z.number().int().min(1).max(65535).default(3000),
                framework: z
                    .enum([
                        'nextjs',
                        'vite-react',
                        'remix',
                        'astro',
                        'tanstack-start',
                        'static-html',
                    ])
                    .optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            return await ctx.db.transaction(async (tx) => {
                const previewUrl = `http://localhost:${input.port}`;
                const framework: ProjectFrameworkId = input.framework ?? 'nextjs';
                const [newProject] = await tx
                    .insert(projects)
                    .values({
                        name: input.name,
                        description: input.description ?? 'Local project',
                        tags: ['local'],
                        // Without these, the editor pipeline boots a local
                        // project as a cloud project and tries to fetch a
                        // sandbox URL that doesn't exist. Persist the local
                        // runtime + framework so downstream code branches
                        // correctly on first read.
                        storageMode: 'local',
                        runtimeMetadata: {
                            framework,
                            local: {
                                rootPath: input.rootPath,
                                devCommand: input.devCommand,
                                port: input.port,
                            },
                        },
                    })
                    .returning();
                if (!newProject) {
                    throw new Error('Failed to create local project in database');
                }

                const localBranchId = `local:${uuidv4()}`;
                const newBranch = createDefaultBranch({
                    projectId: newProject.id,
                    sandboxId: localBranchId,
                    overrides: {
                        description: 'Local main branch',
                    },
                });
                await tx.insert(branches).values(newBranch);

                await tx.insert(userProjects).values({
                    userId: ctx.user.id,
                    projectId: newProject.id,
                    role: ProjectRole.OWNER,
                });

                const newCanvas = createDefaultCanvas(newProject.id);
                await tx.insert(canvases).values(newCanvas);

                const newUserCanvas = createDefaultUserCanvas(ctx.user.id, newCanvas.id, {
                    x: '120',
                    y: '120',
                    scale: '0.56',
                });
                await tx.insert(userCanvases).values(newUserCanvas);

                const defaultFrames = createDefaultBreakpointGroup({
                    canvasId: newCanvas.id,
                    branchId: newBranch.id,
                    url: previewUrl,
                });
                await tx.insert(frames).values(defaultFrames);

                await tx.insert(conversations).values(createDefaultConversation(newProject.id));

                trackEvent({
                    distinctId: ctx.user.id,
                    event: 'user_create_local_project',
                    properties: {
                        projectId: newProject.id,
                    },
                });

                return fromDbProject(newProject);
            });
        }),
    fork,
    generateName: protectedProcedure
        .input(
            z.object({
                prompt: z.string(),
            }),
        )
        .mutation(async ({ ctx, input }): Promise<string> => {
            try {
                const { model, providerOptions, headers } = initModel({
                    provider: LLMProvider.OPENROUTER,
                    model: OPENROUTER_MODELS.OPEN_AI_GPT_5_5,
                });

                const MAX_NAME_LENGTH = 50;
                const result = await generateText({
                    model,
                    headers,
                    prompt: `Generate a concise and meaningful project name (2-4 words maximum) that reflects the main purpose or theme of the project based on user's creation prompt. Generate only the project name, nothing else. Keep it short and descriptive. User's creation prompt: <prompt>${input.prompt}</prompt>`,
                    providerOptions,
                    maxOutputTokens: 50,
                    experimental_telemetry: {
                        isEnabled: true,
                        metadata: {
                            userId: ctx.user.id,
                            tags: ['project-name-generation'],
                        },
                    },
                });

                const generatedName = result.text.trim();
                if (
                    generatedName &&
                    generatedName.length > 0 &&
                    generatedName.length <= MAX_NAME_LENGTH
                ) {
                    return generatedName;
                }

                return 'New Project';
            } catch (error) {
                console.error('Error generating project name:', error);
                return 'New Project';
            }
        }),
    delete: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await ctx.db.transaction(async (tx) => {
                await verifyProjectAccess(tx, ctx.user.id, input.id);
                await tx.delete(userProjects).where(eq(userProjects.projectId, input.id));
                await tx.delete(projects).where(eq(projects.id, input.id));
            });
        }),
    getPreviewProjects: protectedProcedure
        .input(z.object({ userId: z.string() }).optional())
        .query(async ({ ctx, input }) => {
            if (input?.userId && input.userId !== ctx.user.id) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: "Cannot access another user's preview projects",
                });
            }
            const projects = await ctx.db.query.userProjects.findMany({
                where: eq(userProjects.userId, ctx.user.id),
                with: {
                    project: true,
                },
            });
            return projects.map((project) => fromDbProject(project.project));
        }),
    update: protectedProcedure
        .input(
            // Reject whitespace-only names server-side (issue #41). Trimming +
            // min(1) ensures we never persist "" or "   " regardless of which
            // client sent the mutation. `optional()` keeps the partial-update
            // shape from `projectUpdateSchema` intact for callers that don't
            // touch `name`.
            projectUpdateSchema.extend({
                name: z.string().trim().min(1, 'Project name cannot be empty').optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.id);
            const [updatedProject] = await ctx.db
                .update(projects)
                .set({
                    ...input,
                    updatedAt: new Date(),
                })
                .where(eq(projects.id, input.id))
                .returning();
            if (!updatedProject) {
                throw new Error('Project not found');
            }
            return fromDbProject(updatedProject);
        }),
    addTag: protectedProcedure
        .input(
            z.object({
                projectId: z.string(),
                tag: z.string(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const project = await ctx.db.query.projects.findFirst({
                where: eq(projects.id, input.projectId),
            });

            if (!project) {
                throw new Error('Project not found');
            }

            const currentTags = project.tags ?? [];
            const newTags = currentTags.includes(input.tag)
                ? currentTags
                : [...currentTags, input.tag];

            await ctx.db
                .update(projects)
                .set({
                    tags: newTags,
                    updatedAt: new Date(),
                })
                .where(eq(projects.id, input.projectId));

            return { success: true, tags: newTags };
        }),
    removeTag: protectedProcedure
        .input(
            z.object({
                projectId: z.string(),
                tag: z.string(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const project = await ctx.db.query.projects.findFirst({
                where: eq(projects.id, input.projectId),
            });

            if (!project) {
                throw new Error('Project not found');
            }

            const currentTags = project.tags ?? [];
            const newTags = currentTags.filter((tag) => tag !== input.tag);

            await ctx.db
                .update(projects)
                .set({
                    tags: newTags,
                    updatedAt: new Date(),
                })
                .where(eq(projects.id, input.projectId));

            return { success: true, tags: newTags };
        }),
});
