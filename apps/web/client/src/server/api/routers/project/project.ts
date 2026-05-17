import FirecrawlApp from '@mendable/firecrawl-js';
import { TRPCError } from '@trpc/server';
import { generateText } from 'ai';
import { and, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import type { Canvas, UserCanvas } from '@weblab/db';
import type { ProjectFrameworkId } from '@weblab/models';
import { initModel } from '@weblab/ai';
import {
    CodeProvider,
    createCodeProviderClient,
    getStaticCodeProvider,
} from '@weblab/code-provider';
import { getSandboxPreviewUrl, STORAGE_BUCKETS } from '@weblab/constants';
import {
    branches,
    canvases,
    conversations,
    createDefaultBranch,
    createDefaultBreakpointGroup,
    createDefaultCanvas,
    createDefaultConversation,
    createDefaultProject,
    createDefaultUserCanvas,
    frames,
    fromDbBranch,
    fromDbCanvas,
    fromDbConversation,
    fromDbFrame,
    fromDbProject,
    fromDbUser,
    projectCreateRequestInsertSchema,
    projectCreateRequests,
    projectInsertSchema,
    projectInvitations,
    projects,
    projectUpdateSchema,
    toDbPreviewImg,
    userCanvases,
    userProjects,
    workspaceMembers,
} from '@weblab/db';
import { getFrameworkAdapter } from '@weblab/framework';
import { compressImageServer } from '@weblab/image-server';
import {
    AuditEventKind,
    InvitationStatus,
    LLMProvider,
    OPENROUTER_MODELS,
    ProjectAccessMode,
    ProjectCreateRequestStatus,
    ProjectMemberRole,
    ProjectRole,
    WorkspaceRole,
} from '@weblab/models';
import { getScreenshotPath } from '@weblab/utility';

import { env } from '@/env';
import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { trackEvent } from '@/utils/analytics/server';
import { audit } from '../../permissions/audit';
import { requireCap } from '../../permissions/requireCap';
import { resolvePersonalWorkspaceId } from '../workspace/personal';
import { projectCreateRequestRouter } from './createRequest';
import { fork } from './fork';
import { extractCsbPort, verifyProjectAccess } from './helper';
import { offlineRouter } from './offline';

const ACCESS_PROJECT_ROLE_TO_MEMBER_ROLE: Record<ProjectRole, ProjectMemberRole> = {
    [ProjectRole.OWNER]: ProjectMemberRole.MANAGER,
    [ProjectRole.ADMIN]: ProjectMemberRole.MANAGER,
    [ProjectRole.EDITOR]: ProjectMemberRole.EDITOR,
    [ProjectRole.VIEWER]: ProjectMemberRole.VIEWER,
};

const PROJECT_ROLE_RANK: Record<ProjectMemberRole, number> = {
    [ProjectMemberRole.MANAGER]: 0,
    [ProjectMemberRole.EDITOR]: 1,
    [ProjectMemberRole.REVIEWER]: 2,
    [ProjectMemberRole.VIEWER]: 3,
};

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
        .input(
            z.object({
                projectId: z.string(),
                // Lets a foreground action (manual refresh, post-clone, etc.)
                // bypass the 30-min skip — used by the editor today and kept
                // here for future explicit "Refresh preview" buttons.
                force: z.boolean().optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            try {
                await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
                if (!env.FIRECRAWL_API_KEY) {
                    // Soft-fail: dashboards keep working with their existing
                    // previews / fallback initial, and we don't spam the
                    // client with a thrown error every list refresh.
                    return {
                        success: false,
                        error: 'FIRECRAWL_API_KEY is not configured',
                        skipped: 'no-api-key' as const,
                    };
                }

                // Server-side dedupe: belt-and-suspenders against multiple
                // tabs (or the dashboard backfill hook) firing the same
                // project within the refresh window. Client-side gating
                // would let a second tab through.
                if (!input.force) {
                    const existing = await ctx.db.query.projects.findFirst({
                        where: eq(projects.id, input.projectId),
                        columns: { updatedPreviewImgAt: true },
                    });
                    const lastCaptured = existing?.updatedPreviewImgAt;
                    if (
                        lastCaptured &&
                        Date.now() - new Date(lastCaptured).getTime() < 30 * 60 * 1000
                    ) {
                        return { success: true, skipped: 'recent' as const };
                    }
                }

                // Single round-trip — pulls the branch, its frames, AND the
                // owning project's runtimeMetadata in one query (Drizzle
                // generates an inner SELECT join). Avoids a second
                // `projects.findFirst` for the framework lookup below.
                const branch = await ctx.db.query.branches.findFirst({
                    where: and(
                        eq(branches.projectId, input.projectId),
                        eq(branches.isDefault, true),
                    ),
                    with: {
                        frames: true,
                        project: {
                            columns: { runtimeMetadata: true },
                        },
                    },
                });

                if (!branch) {
                    throw new Error('Branch not found');
                }

                if (!branch.sandboxId) {
                    throw new Error('No sandbox found for branch');
                }

                // Resolve the dev-server port in this priority:
                //   1. an existing frame URL (proves the sandbox is already
                //      serving on that port),
                //   2. the framework adapter's default port (Vite=5173,
                //      Astro=4321, Next=3000, etc.),
                //   3. 3000 as the historical default.
                // Without (2) static-html / Vite / Astro projects whose
                // frames row has not been populated yet would always be
                // scraped on port 3000 and return 404.
                const frameworkId = branch.project?.runtimeMetadata?.framework ?? null;
                const adapterPort = getFrameworkAdapter(frameworkId).template.port;
                const port = extractCsbPort(branch.frames) ?? adapterPort ?? 3000;
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
                    workspaceId: z.string().uuid().optional(),
                })
                .optional(),
        )
        .query(async ({ ctx, input }) => {
            // Defensive cap. The dashboard renders project cards inline; an
            // unbounded list on a heavy user balloons the round-trip and the
            // hydrated client cache. Math.min enforces the ceiling so a client
            // passing limit: 10_000 doesn't bypass the defense. Callers needing
            // infinite scrolling should add cursor-based paging.
            const MAX_PROJECTS_LIMIT = 200;
            const effectiveLimit = Math.min(input?.limit ?? MAX_PROJECTS_LIMIT, MAX_PROJECTS_LIMIT);

            // When workspaceId is supplied, push the filter into the SQL so a
            // user with many projects across workspaces can't have the limit
            // exhausted by rows in OTHER workspaces (a 200-row JS filter
            // could return zero rows for the target workspace). Look up the
            // candidate project ids first, then re-fetch the full relation
            // graph for just that slice.
            let candidateProjectIds: string[] | null = null;
            if (input?.workspaceId) {
                const rows = await ctx.db
                    .select({ id: projects.id })
                    .from(projects)
                    .innerJoin(userProjects, eq(userProjects.projectId, projects.id))
                    .where(
                        and(
                            eq(userProjects.userId, ctx.user.id),
                            eq(projects.workspaceId, input.workspaceId),
                            input?.excludeProjectId
                                ? ne(projects.id, input.excludeProjectId)
                                : undefined,
                        ),
                    )
                    .limit(effectiveLimit);
                candidateProjectIds = rows.map((r) => r.id);
                if (candidateProjectIds.length === 0) {
                    return [];
                }
            }

            // Step 1: collect candidate user_project rows (membership-scoped),
            // optionally filtered by excludeProjectId. When candidate ids are
            // pre-computed (workspace-scoped path) we narrow to that slice.
            const fetchedUserProjects = await ctx.db.query.userProjects.findMany({
                where: and(
                    eq(userProjects.userId, ctx.user.id),
                    input?.excludeProjectId
                        ? ne(userProjects.projectId, input.excludeProjectId)
                        : undefined,
                    candidateProjectIds
                        ? inArray(userProjects.projectId, candidateProjectIds)
                        : undefined,
                ),
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
                limit: effectiveLimit,
            });

            const filteredUserProjects = fetchedUserProjects;
            return filteredUserProjects
                .map((userProject) => {
                    const project = userProject.project;
                    const defaultBranch = project.branches[0];
                    const previewDomain = project.previewDomains[0]?.fullDomain ?? null;
                    const publishedDomain = project.projectCustomDomains[0]?.fullDomain ?? null;
                    const previewUrl = previewDomain ? `https://${previewDomain}` : null;
                    const publishedUrl = publishedDomain ? `https://${publishedDomain}` : null;

                    // Internal live-preview URL — the running dev server for
                    // the project's sandbox. Used by the dashboard preview
                    // surface as an iframe fallback while a fresh screenshot
                    // backfills. Not user-shareable: do not expose in
                    // social meta / "Copy link" / OG cards. The frame URL is
                    // preferred when present because it has the resolved
                    // port; otherwise we synthesize from sandboxId + the
                    // framework adapter's default port.
                    let sandboxPreviewUrl: string | null = null;
                    if (defaultBranch?.sandboxId) {
                        const frameUrl = defaultBranch.frames?.[0]?.url ?? null;
                        if (frameUrl) {
                            sandboxPreviewUrl = frameUrl;
                        } else {
                            const framework = project.runtimeMetadata?.framework ?? null;
                            const adapterPort = framework
                                ? getFrameworkAdapter(framework).template.port
                                : null;
                            const port = adapterPort ?? 3000;
                            sandboxPreviewUrl = getSandboxPreviewUrl(defaultBranch.sandboxId, port);
                        }
                    }

                    return {
                        ...fromDbProject(project),
                        previewUrl,
                        publishedUrl,
                        // User-facing weblab domain. Stays null until publish.
                        siteUrl: publishedUrl ?? previewUrl ?? null,
                        sandboxPreviewUrl,
                    };
                })
                .sort(
                    (a, b) =>
                        new Date(b.metadata.updatedAt).getTime() -
                        new Date(a.metadata.updatedAt).getTime(),
                );
        }),
    /**
     * Returns projects the caller is an explicit project_member of where the
     * project's workspace is NOT one the caller is a workspace member of.
     * These are "shared with me" projects — typically project-only invitees
     * who accepted an invite to a single restricted project in someone else's
     * workspace. Surfaced under the Personal workspace dashboard so the user
     * can find them without bookmarking the project URL.
     */
    sharedWithMe: protectedProcedure.query(async ({ ctx }) => {
        const memberships = await ctx.db.query.userProjects.findMany({
            where: eq(userProjects.userId, ctx.user.id),
            with: {
                project: {
                    with: {
                        branches: {
                            where: eq(branches.isDefault, true),
                            with: { frames: true },
                        },
                        previewDomains: true,
                        projectCustomDomains: true,
                    },
                },
            },
            limit: 200,
        });

        const workspaceIds = Array.from(
            new Set(
                memberships.map((m) => m.project.workspaceId).filter((id): id is string => !!id),
            ),
        );
        if (workspaceIds.length === 0) {
            return [];
        }

        const myWorkspaceRows = await ctx.db
            .select({ workspaceId: workspaceMembers.workspaceId })
            .from(workspaceMembers)
            .where(
                and(
                    eq(workspaceMembers.userId, ctx.user.id),
                    inArray(workspaceMembers.workspaceId, workspaceIds),
                ),
            );
        const myWorkspaceIds = new Set(myWorkspaceRows.map((r) => r.workspaceId));

        const shared = memberships.filter(
            (m) => m.project.workspaceId && !myWorkspaceIds.has(m.project.workspaceId),
        );

        return shared
            .map((m) => {
                const project = m.project;
                const defaultBranch = project.branches[0];
                const previewDomain = project.previewDomains[0]?.fullDomain ?? null;
                const publishedDomain = project.projectCustomDomains[0]?.fullDomain ?? null;
                const previewUrl = previewDomain ? `https://${previewDomain}` : null;
                const publishedUrl = publishedDomain ? `https://${publishedDomain}` : null;

                let sandboxPreviewUrl: string | null = null;
                if (defaultBranch?.sandboxId) {
                    const frameUrl = defaultBranch.frames?.[0]?.url ?? null;
                    if (frameUrl) {
                        sandboxPreviewUrl = frameUrl;
                    } else {
                        const framework = project.runtimeMetadata?.framework ?? null;
                        const adapterPort = framework
                            ? getFrameworkAdapter(framework).template.port
                            : null;
                        const port = adapterPort ?? 3000;
                        sandboxPreviewUrl = getSandboxPreviewUrl(defaultBranch.sandboxId, port);
                    }
                }

                return {
                    ...fromDbProject(project),
                    previewUrl,
                    publishedUrl,
                    siteUrl: publishedUrl ?? previewUrl ?? null,
                    sandboxPreviewUrl,
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
    getEditorBootstrap: protectedProcedure
        .input(z.object({ projectId: z.string() }))
        .query(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const [project, dbBranches, dbCanvas, dbConversations, creationRequest] =
                await Promise.all([
                    ctx.db.query.projects.findFirst({
                        where: eq(projects.id, input.projectId),
                    }),
                    ctx.db.query.branches.findMany({
                        where: eq(branches.projectId, input.projectId),
                        with: {
                            frames: true,
                        },
                    }),
                    ctx.db.query.canvases.findFirst({
                        where: eq(canvases.projectId, input.projectId),
                        with: {
                            frames: true,
                            userCanvases: {
                                where: eq(userCanvases.userId, ctx.user.id),
                            },
                        },
                    }),
                    ctx.db.query.conversations.findMany({
                        where: eq(conversations.projectId, input.projectId),
                        orderBy: (conversations, { desc }) => [desc(conversations.updatedAt)],
                        limit: 200,
                    }),
                    ctx.db.query.projectCreateRequests.findFirst({
                        where: and(
                            eq(projectCreateRequests.projectId, input.projectId),
                            eq(projectCreateRequests.status, ProjectCreateRequestStatus.PENDING),
                        ),
                    }),
                ]);

            if (!project) {
                return null;
            }

            const canvas = dbCanvas
                ? {
                      userCanvas: fromDbCanvas(
                          dbCanvas.userCanvases[0] ??
                              createDefaultUserCanvas(ctx.user.id, dbCanvas.id),
                      ),
                      frames: dbCanvas.frames.map(fromDbFrame),
                  }
                : null;

            return {
                project: fromDbProject(project),
                branches: dbBranches.map((branch) => ({
                    ...fromDbBranch(branch),
                    frames: branch.frames.map(fromDbFrame),
                })),
                canvas,
                conversations: dbConversations.map(fromDbConversation),
                creationRequest: creationRequest ?? null,
            };
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
                // Reject empty IDs and non-URL strings so a degenerate
                // sandbox.fork response (empty id / previewUrl) cannot
                // persist as `frames.url = ''`, which would render the
                // editor inside its own iframe via `<iframe src="">`.
                sandboxId: z.string().min(1),
                sandboxUrl: z.string().url(),
                sandboxRuntime: z
                    .object({
                        provider: z.enum(['code_sandbox', 'vercel_sandbox']),
                        snapshotId: z.string().optional(),
                        port: z.number().optional(),
                        devCommand: z.string().optional(),
                        runtime: z.string().optional(),
                    })
                    .optional(),
                creationData: projectCreateRequestInsertSchema
                    .omit({
                        projectId: true,
                    })
                    .optional(),
                // Optional: explicit target workspace. When omitted, project
                // lands in caller's personal workspace (legacy behavior).
                // When supplied, caller must have `project.create` cap on it.
                workspaceId: z.string().uuid().optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const ownerId = ctx.user.id;
            const workspaceId = input.workspaceId
                ? input.workspaceId
                : await resolvePersonalWorkspaceId(ctx.db, ownerId, ctx.user.email);
            if (input.workspaceId) {
                await requireCap(ctx.db, ownerId, 'project.create', {
                    workspaceId: input.workspaceId,
                });
            }
            return await ctx.db.transaction(async (tx) => {
                // 1. Insert the new project — pin to caller's personal workspace.
                const [newProject] = await tx
                    .insert(projects)
                    .values({
                        ...input.project,
                        workspaceId,
                        accessMode: ProjectAccessMode.WORKSPACE,
                    })
                    .returning();
                if (!newProject) {
                    throw new Error('Failed to create project in database');
                }

                // 2. Create the default branch
                const newBranch = createDefaultBranch({
                    projectId: newProject.id,
                    sandboxId: input.sandboxId,
                });
                newBranch.runtimeMetadata = {
                    ...newBranch.runtimeMetadata,
                    cloud: {
                        provider: input.sandboxRuntime?.provider ?? 'code_sandbox',
                        sandboxId: input.sandboxId,
                        previewUrl: input.sandboxUrl,
                        snapshotId: input.sandboxRuntime?.snapshotId,
                        port: input.sandboxRuntime?.port,
                        devCommand: input.sandboxRuntime?.devCommand,
                        runtime: input.sandboxRuntime?.runtime,
                    },
                };
                await tx.insert(branches).values(newBranch);

                // 3. Create the association in the junction table
                await tx.insert(userProjects).values({
                    userId: ownerId,
                    projectId: newProject.id,
                    role: ProjectRole.OWNER,
                    memberRole: ProjectMemberRole.MANAGER,
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
    createBlank: protectedProcedure
        .input(
            z.object({
                framework: z
                    .enum([
                        'nextjs',
                        'vite-react',
                        'remix',
                        'astro',
                        'tanstack-start',
                        'static-html',
                    ])
                    .default('nextjs'),
                workspaceId: z.string().uuid().optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const ownerId = ctx.user.id;
            if (input.workspaceId) {
                await requireCap(ctx.db, ownerId, 'project.create', {
                    workspaceId: input.workspaceId,
                });
            }
            const adapter = getFrameworkAdapter(input.framework);
            const cloudProvider =
                input.framework === 'nextjs'
                    ? env.WEBLAB_CLOUD_PROVIDER === 'vercel_sandbox'
                        ? CodeProvider.VercelSandbox
                        : CodeProvider.CodeSandbox
                    : CodeProvider.CodeSandbox;
            const StaticProvider = await getStaticCodeProvider(cloudProvider);
            let forkedSandboxId: string | null = null;

            try {
                const sandbox = await StaticProvider.createProject({
                    source: 'template',
                    id: adapter.template.codesandboxId,
                    title: `Blank project - ${ownerId}`,
                    tags: ['blank', ownerId],
                    privacy: 'private',
                    port: adapter.template.port,
                });
                forkedSandboxId = sandbox.id;

                const previewUrl =
                    cloudProvider === CodeProvider.VercelSandbox && sandbox.previewUrl
                        ? sandbox.previewUrl
                        : getSandboxPreviewUrl(
                              sandbox.id,
                              adapter.template.port,
                              sandbox.previewToken,
                          );

                const now = new Date();
                const projectName = `New Project · ${now.toLocaleString(undefined, {
                    month: 'short',
                })} ${now.getDate()}`;

                const workspaceId = input.workspaceId
                    ? input.workspaceId
                    : await resolvePersonalWorkspaceId(ctx.db, ownerId, ctx.user.email);
                const project = createDefaultProject({
                    overrides: {
                        name: projectName,
                        description: 'Your new blank project',
                        tags: ['blank'],
                        runtimeMetadata: { framework: input.framework },
                        workspaceId,
                        accessMode: ProjectAccessMode.WORKSPACE,
                    },
                });

                const created = await ctx.db.transaction(async (tx) => {
                    const [newProject] = await tx.insert(projects).values(project).returning();
                    if (!newProject) {
                        throw new Error('Failed to create project in database');
                    }

                    const newBranch = createDefaultBranch({
                        projectId: newProject.id,
                        sandboxId: sandbox.id,
                    });
                    newBranch.runtimeMetadata = {
                        ...newBranch.runtimeMetadata,
                        cloud: {
                            provider:
                                cloudProvider === CodeProvider.VercelSandbox
                                    ? 'vercel_sandbox'
                                    : 'code_sandbox',
                            sandboxId: sandbox.id,
                            previewUrl,
                            snapshotId: sandbox.snapshotId,
                            port: sandbox.port ?? adapter.template.port,
                            devCommand: sandbox.devCommand,
                            runtime: sandbox.runtime,
                        },
                    };
                    await tx.insert(branches).values(newBranch);
                    await tx.insert(userProjects).values({
                        userId: ownerId,
                        projectId: newProject.id,
                        role: ProjectRole.OWNER,
                        memberRole: ProjectMemberRole.MANAGER,
                    });

                    const newCanvas = createDefaultCanvas(newProject.id);
                    await tx.insert(canvases).values(newCanvas);
                    await tx.insert(userCanvases).values(
                        createDefaultUserCanvas(ownerId, newCanvas.id, {
                            x: '120',
                            y: '120',
                            scale: '0.56',
                        }),
                    );
                    await tx.insert(frames).values(
                        createDefaultBreakpointGroup({
                            canvasId: newCanvas.id,
                            branchId: newBranch.id,
                            url: previewUrl,
                        }),
                    );
                    await tx.insert(conversations).values(createDefaultConversation(newProject.id));

                    trackEvent({
                        distinctId: ownerId,
                        event: 'user_create_project',
                        properties: {
                            projectId: newProject.id,
                            source: 'blank',
                            framework: input.framework,
                        },
                    });

                    return newProject;
                });

                forkedSandboxId = null;
                return created;
            } catch (error) {
                if (forkedSandboxId) {
                    const provider =
                        cloudProvider === CodeProvider.VercelSandbox
                            ? await createCodeProviderClient(CodeProvider.VercelSandbox, {
                                  providerOptions: {
                                      vercelSandbox: {
                                          sandboxId: forkedSandboxId,
                                          port: adapter.template.port,
                                      },
                                  },
                              })
                            : await createCodeProviderClient(CodeProvider.CodeSandbox, {
                                  providerOptions: {
                                      codesandbox: {
                                          sandboxId: forkedSandboxId,
                                      },
                                  },
                              });
                    try {
                        await provider.stopProject({}).catch(() => undefined);
                    } finally {
                        await provider.destroy().catch(() => undefined);
                    }
                }
                throw error;
            }
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
                workspaceId: z.string().uuid().optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            if (input.workspaceId) {
                await requireCap(ctx.db, ctx.user.id, 'project.create', {
                    workspaceId: input.workspaceId,
                });
            }
            const workspaceId = input.workspaceId
                ? input.workspaceId
                : await resolvePersonalWorkspaceId(ctx.db, ctx.user.id, ctx.user.email);
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
                        workspaceId,
                        accessMode: ProjectAccessMode.WORKSPACE,
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
                    memberRole: ProjectMemberRole.MANAGER,
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
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            // Cap check inside the tx (with FOR UPDATE on the project row)
            // closes the TOCTOU between the gate and the delete — a caller
            // demoted mid-flight cannot land a stale delete, and a parallel
            // .update on the same project can't commit against an
            // already-doomed row.
            const projectId = input.id;
            await ctx.db.transaction(async (tx) => {
                const lockedRows = await tx.execute(sql`
                    SELECT id, workspace_id, name
                    FROM projects
                    WHERE id = ${projectId}
                    FOR UPDATE
                `);
                const locked = (
                    lockedRows as unknown as Array<{
                        id: string;
                        workspace_id: string | null;
                        name: string;
                    }>
                )[0];
                if (!locked) {
                    throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
                }
                await requireCap(tx, ctx.user.id, 'project.delete', { projectId });
                await tx.delete(userProjects).where(eq(userProjects.projectId, projectId));
                await tx.delete(projects).where(eq(projects.id, projectId));
                // NB: no dedicated PROJECT_DELETED audit event in the
                // current enum (audit_event_kind in 0034). Deletion still
                // shows in the workspace's audit trail via the cascade-cleared
                // project_id; a follow-up should add a PROJECT_DELETED enum
                // value in a new migration + here.
                void locked;
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
            await requireCap(ctx.db, ctx.user.id, 'project.update', { projectId: input.id });
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
    /**
     * Change a project's access mode. Requires `project.manage_access_mode`.
     * Mode `workspace` makes the project visible to workspace members per
     * their role; `restricted` hides it from non-explicit members.
     */
    setAccessMode: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                accessMode: z.nativeEnum(ProjectAccessMode),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.manage_access_mode', {
                projectId: input.projectId,
            });
            const [updated] = await ctx.db
                .update(projects)
                .set({ accessMode: input.accessMode, updatedAt: new Date() })
                .where(eq(projects.id, input.projectId))
                .returning();
            if (!updated) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
            }
            await audit(ctx.db, {
                event: AuditEventKind.PROJECT_ACCESS_MODE_CHANGED,
                projectId: input.projectId,
                workspaceId: updated.workspaceId,
                actorUserId: ctx.user.id,
                payload: { accessMode: input.accessMode },
            });
            return updated;
        }),
    /**
     * Aggregated access list for a project's settings page. Returns:
     *   - workspaceInherited: workspace owners/admins with recovery access
     *     who are NOT also explicit project members.
     *   - directMembers: explicit project_members (legacy column normalized).
     *   - pendingInvites: still-pending invitations (status='pending' AND not expired).
     */
    listAccess: protectedProcedure
        .input(z.object({ projectId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.view', {
                projectId: input.projectId,
            });

            const project = await ctx.db.query.projects.findFirst({
                where: eq(projects.id, input.projectId),
                columns: { id: true, workspaceId: true },
            });
            if (!project?.workspaceId) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Project not found',
                });
            }

            const direct = await ctx.db.query.userProjects.findMany({
                where: eq(userProjects.projectId, input.projectId),
                with: { user: true },
            });
            const directIds = new Set(direct.map((d) => d.userId));
            const directMembers = direct
                .map((d) => {
                    const memberRole =
                        d.memberRole ?? ACCESS_PROJECT_ROLE_TO_MEMBER_ROLE[d.role as ProjectRole];
                    // @ts-expect-error - Drizzle relation typing quirk; the
                    // row is the full users record at runtime.
                    const user = fromDbUser(d.user);
                    return {
                        userId: user.id,
                        displayName: user.displayName ?? user.firstName ?? null,
                        email: user.email,
                        avatarUrl: user.avatarUrl,
                        memberRole,
                    };
                })
                .sort((a, b) => {
                    const rankDiff =
                        PROJECT_ROLE_RANK[a.memberRole] - PROJECT_ROLE_RANK[b.memberRole];
                    if (rankDiff !== 0) return rankDiff;
                    return (a.displayName ?? a.email ?? '').localeCompare(
                        b.displayName ?? b.email ?? '',
                    );
                });

            const wsAdmins = await ctx.db.query.workspaceMembers.findMany({
                where: and(
                    eq(workspaceMembers.workspaceId, project.workspaceId),
                    inArray(workspaceMembers.role, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]),
                ),
                with: { user: true },
            });
            const workspaceInherited = wsAdmins
                .filter((m) => !directIds.has(m.userId))
                .map((m) => {
                    // @ts-expect-error - see directMembers note
                    const user = fromDbUser(m.user);
                    return {
                        userId: user.id,
                        displayName: user.displayName ?? user.firstName ?? null,
                        email: user.email,
                        avatarUrl: user.avatarUrl,
                        workspaceRole: m.role as WorkspaceRole,
                    };
                })
                .sort((a, b) => {
                    if (a.workspaceRole === b.workspaceRole) {
                        return (a.displayName ?? a.email ?? '').localeCompare(
                            b.displayName ?? b.email ?? '',
                        );
                    }
                    return a.workspaceRole === WorkspaceRole.OWNER ? -1 : 1;
                });

            const invites = await ctx.db.query.projectInvitations.findMany({
                where: and(
                    eq(projectInvitations.projectId, input.projectId),
                    eq(projectInvitations.status, InvitationStatus.PENDING),
                    gt(projectInvitations.expiresAt, new Date()),
                ),
                orderBy: (table, { desc }) => [desc(table.createdAt)],
            });
            const pendingInvites = invites.map((inv) => ({
                id: inv.id,
                email: inv.inviteeEmail,
                memberRole:
                    inv.memberRole ?? ACCESS_PROJECT_ROLE_TO_MEMBER_ROLE[inv.role as ProjectRole],
                invitedAt: inv.createdAt,
                expiresAt: inv.expiresAt,
            }));

            return { workspaceInherited, directMembers, pendingInvites };
        }),
});
