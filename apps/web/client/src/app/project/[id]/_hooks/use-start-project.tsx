'use client';

import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import type {
    Canvas,
    ChatConversation,
    Frame,
    ImageMessageContext,
    MessageContext,
} from '@weblab/models';
import { getCloneSystemPrompt } from '@weblab/ai/client';
import { type ProjectCreateRequest } from '@weblab/db';
import {
    ChatType,
    CloneOutputFramework,
    CreateRequestContextType,
    MessageContextType,
    ProjectCreateRequestStatus,
} from '@weblab/models';
import { toast } from '@weblab/ui/sonner';

import { useEditorEngine } from '@/components/store/editor';
import { ensureBreakpointSiblings } from '@/components/store/editor/frames';
import { useOnlineStatus } from '@/services/offline/online-status';
import { cacheProjectExtras, getCachedProject } from '@/services/offline/project-cache';
import { replayQueue } from '@/services/offline/replay-controller';
import { api } from '@/trpc/react';
import { useTabActive } from '../_hooks/use-tab-active';

interface ProjectReadyState {
    canvas: boolean;
    conversations: boolean;
    sandbox: boolean;
}

export interface EditorBootstrapData {
    canvas: {
        userCanvas: Canvas;
        frames: Frame[];
    } | null;
    conversations: ChatConversation[];
    creationRequest: ProjectCreateRequest | null;
}

export const useStartProject = (initialBootstrap?: EditorBootstrapData) => {
    const editorEngine = useEditorEngine();
    const sandbox = editorEngine.activeSandbox;
    const online = useOnlineStatus();
    const [sandboxError, setSandboxError] = useState<string | null>(null);
    const [dataError, setDataError] = useState<string | null>(null);
    const processedRequestIdRef = useRef<string | null>(null);
    const { tabState } = useTabActive();
    const apiUtils = api.useUtils();
    const { data: user, error: userError } = api.user.get.useQuery(undefined, {
        enabled: online,
    });
    // CR-050: poll the canvas + frames row so collaborator mutations show up
    // without a full reload. The userCanvas row is per-user (scale/position),
    // so re-applying it on every poll would clobber the local pan/zoom — we
    // gate that with `initialCanvasAppliedRef` below. Frames are shared and
    // re-apply safely thanks to the new idempotent `applyFrames`.
    const { data: bootstrap, error: bootstrapError } = api.project.getEditorBootstrap.useQuery(
        { projectId: editorEngine.projectId },
        {
            enabled: online && !initialBootstrap,
            staleTime: 5_000,
            refetchOnWindowFocus: false,
        },
    );
    const effectiveBootstrap = initialBootstrap ?? bootstrap ?? undefined;

    const { data: canvasWithFrames, error: canvasError } = api.userCanvas.getWithFrames.useQuery(
        { projectId: editorEngine.projectId },
        {
            enabled: online && Boolean(effectiveBootstrap),
            refetchInterval: online ? 30_000 : false,
            refetchOnWindowFocus: online,
            initialData: effectiveBootstrap?.canvas ?? undefined,
            staleTime: 5_000,
            // Keep stale data on the screen during the refetch — avoids a flash
            // of the loading state when polling.
            refetchIntervalInBackground: false,
        },
    );
    const initialCanvasAppliedRef = useRef(false);
    const breakpointMigrationRanRef = useRef(false);
    const { data: conversations, error: conversationsError } =
        api.chat.conversation.getAll.useQuery(
            { projectId: editorEngine.projectId },
            {
                enabled: online && Boolean(effectiveBootstrap),
                initialData: effectiveBootstrap?.conversations,
                staleTime: 5_000,
                refetchOnMount: false,
            },
        );
    const { data: creationRequest, error: creationRequestError } =
        api.project.createRequest.getPendingRequest.useQuery(
            { projectId: editorEngine.projectId },
            {
                enabled: online && Boolean(effectiveBootstrap),
                initialData: effectiveBootstrap?.creationRequest ?? undefined,
                staleTime: 5_000,
                refetchOnMount: false,
            },
        );
    const { mutateAsync: updateCreateRequest } = api.project.createRequest.updateStatus.useMutation(
        {
            onSettled: async () => {
                await apiUtils.project.createRequest.getPendingRequest.invalidate({
                    projectId: editorEngine.projectId,
                });
            },
        },
    );
    const [projectReadyState, setProjectReadyState] = useState<ProjectReadyState>({
        canvas: false,
        conversations: false,
        sandbox: false,
    });

    const updateProjectReadyState = (state: Partial<ProjectReadyState>) => {
        setProjectReadyState((prev) => ({ ...prev, ...state }));
    };

    useEffect(() => {
        if (sandbox.session.provider) {
            updateProjectReadyState({ sandbox: true });
            setSandboxError(null);
            return;
        }

        if (sandbox.session.connectionError) {
            updateProjectReadyState({ sandbox: false });
            setSandboxError(sandbox.session.connectionError);
        }
    }, [sandbox.session.provider, sandbox.session.connectionError]);

    // Offline: hydrate canvas + frames + conversations from the IndexedDB
    // cache so the editor opens with a usable canvas instead of an empty
    // shell. Falls through to ready-without-data if nothing was cached.
    useEffect(() => {
        if (online) return;
        let cancelled = false;
        void (async () => {
            const cached = await getCachedProject(editorEngine.projectId);
            if (cancelled) return;
            try {
                if (cached?.userCanvas && !initialCanvasAppliedRef.current) {
                    editorEngine.canvas.applyCanvas(cached.userCanvas);
                    initialCanvasAppliedRef.current = true;
                }
                if (cached?.frames && cached.frames.length > 0) {
                    editorEngine.frames.applyFrames(cached.frames);
                }
                if (cached?.conversations) {
                    await editorEngine.chat.conversation.applyConversations(cached.conversations);
                }
            } catch (err) {
                console.warn('[offline] failed to hydrate from cache', err);
            } finally {
                if (!cancelled) {
                    updateProjectReadyState({ canvas: true, conversations: true });
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [
        online,
        editorEngine.projectId,
        editorEngine.canvas,
        editorEngine.frames,
        editorEngine.chat.conversation,
    ]);

    // Online: persist canvas/frames/conversations into the offline cache so
    // the next offline boot has a fully populated editor.
    useEffect(() => {
        if (!online) return;
        if (!canvasWithFrames) return;
        void cacheProjectExtras(editorEngine.projectId, {
            userCanvas: canvasWithFrames.userCanvas,
            frames: canvasWithFrames.frames,
        });
    }, [online, canvasWithFrames, editorEngine.projectId]);

    useEffect(() => {
        if (!online) return;
        if (!conversations) return;
        void cacheProjectExtras(editorEngine.projectId, { conversations });
    }, [online, conversations, editorEngine.projectId]);

    // Offline → online transition: swap the offline shim for the real cloud
    // provider, then drain the durable write queue against it. Failures are
    // logged + surfaced via the queue's dead-letter store.
    const branchSandboxId = editorEngine.branches.activeBranch?.sandbox?.id ?? null;
    useEffect(() => {
        if (!online) return;
        if (!sandbox.session.isOffline) return;
        if (!branchSandboxId) return;
        let cancelled = false;
        void (async () => {
            try {
                // Block the provider-reaction sync engine init so the queue
                // drain runs against the cloud provider FIRST. Without this
                // gate `pullFromSandbox` would race the replay and overwrite
                // local edits that haven't been pushed yet.
                sandbox.suppressSyncInitForReplay();
                await sandbox.session.swapToOnline(branchSandboxId, user?.id);
                if (cancelled) return;
                if (!sandbox.session.provider) {
                    await sandbox.resumeSyncInit();
                    return;
                }
                // Network may have flickered between swap and replay,
                // pushing `start()` back into its offline path. Bail
                // before replayQueue tries to drain records into the
                // OfflineProvider's no-op writeFile (which would silently
                // delete every queued edit). The next online transition
                // re-fires this effect and tries again.
                if (sandbox.session.isOffline) {
                    await sandbox.resumeSyncInit();
                    return;
                }
                const result = await replayQueue(sandbox.session.provider, editorEngine.projectId);
                // Only run the bidirectional sync engine after the queue is
                // drained — at this point the cloud filesystem reflects the
                // user's offline edits, so the pull won't clobber them.
                await sandbox.resumeSyncInit();
                if (result.drained > 0) {
                    toast.success(
                        `Synced ${result.drained} offline change${result.drained === 1 ? '' : 's'} to the cloud.`,
                    );
                }
                if (result.deadLettered > 0) {
                    toast.error(
                        `${result.deadLettered} change${result.deadLettered === 1 ? '' : 's'} could not be synced. Open the offline panel to review.`,
                    );
                }
                // Re-enable the polled queries now that we're online.
                await Promise.all([
                    apiUtils.userCanvas.getWithFrames.invalidate({
                        projectId: editorEngine.projectId,
                    }),
                    apiUtils.chat.conversation.getAll.invalidate({
                        projectId: editorEngine.projectId,
                    }),
                    apiUtils.user.get.invalidate(),
                ]);
            } catch (err) {
                console.error('[offline] reconnect/replay failed', err);
                if (!cancelled) {
                    toast.error('Failed to sync offline changes. Try reloading the project.', {
                        description: err instanceof Error ? err.message : 'Unknown error',
                    });
                }
            } finally {
                // Ensure sync engine init is never left permanently suppressed
                // even if swap or replay throws.
                try {
                    await sandbox.resumeSyncInit();
                } catch (resumeErr) {
                    console.warn('[offline] resumeSyncInit failed', resumeErr);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        online,
        sandbox.session.isOffline,
        branchSandboxId,
        editorEngine.projectId,
        user?.id,
        apiUtils,
        sandbox.session,
    ]);

    useEffect(() => {
        if (tabState === 'reactivated' && editorEngine.projectId && user?.id) {
            void sandbox.session.reconnect(editorEngine.projectId, user.id);
        }
    }, [tabState, sandbox.session, editorEngine.projectId, user?.id]);

    useEffect(() => {
        if (!canvasWithFrames) return;
        // Apply per-user canvas (scale/position) only on first load. Re-applying
        // on every poll would clobber the user's local pan/zoom that hasn't yet
        // been saved (canvas store debounces saves by 5s).
        if (!initialCanvasAppliedRef.current) {
            editorEngine.canvas.applyCanvas(canvasWithFrames.userCanvas);
            initialCanvasAppliedRef.current = true;
        }

        // Re-apply frames on every refetch. `applyFrames` is now idempotent —
        // preserves attached views and selection; prunes server-deleted frames
        // that don't have a live view binding.
        editorEngine.frames.applyFrames(canvasWithFrames.frames);
        updateProjectReadyState({ canvas: true });

        // First-load only: migrate legacy single-frame projects into full
        // Desktop+Tablet+Phone breakpoint groups. The synthesized siblings are
        // applied locally so the user sees them before the next 30s refetch.
        if (!breakpointMigrationRanRef.current) {
            breakpointMigrationRanRef.current = true;
            void (async () => {
                try {
                    const expanded = await ensureBreakpointSiblings(canvasWithFrames.frames);
                    if (expanded.length !== canvasWithFrames.frames.length) {
                        editorEngine.frames.applyFrames(expanded);
                    }
                } catch (error) {
                    console.error('Breakpoint migration failed', error);
                }
            })();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canvasWithFrames]);

    useEffect(() => {
        const applyConversations = async () => {
            if (conversations) {
                await editorEngine.chat.conversation.applyConversations(conversations);
                updateProjectReadyState({ conversations: true });
            }
        };
        void applyConversations();
    }, [editorEngine.chat.conversation, conversations]);

    useEffect(() => {
        const isProjectReady = Object.values(projectReadyState).every((value) => value);
        if (
            creationRequest &&
            processedRequestIdRef.current !== creationRequest.id &&
            isProjectReady &&
            editorEngine.chat._sendMessageAction
        ) {
            processedRequestIdRef.current = creationRequest.id;
            void resumeCreate(creationRequest);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [creationRequest, projectReadyState, editorEngine.chat._sendMessageAction]);

    const resumeCreate = async (creationData: ProjectCreateRequest) => {
        try {
            if (editorEngine.projectId !== creationData.projectId) {
                throw new Error('Project ID mismatch');
            }

            const createContext: MessageContext[] =
                await editorEngine.chat.context.getCreateContext();
            const imageContexts: ImageMessageContext[] = creationData.context
                .filter((context) => context.type === CreateRequestContextType.IMAGE)
                .map((context) => ({
                    type: MessageContextType.IMAGE,
                    source: 'external',
                    content: context.content,
                    mimeType: context.mimeType,
                    displayName: 'user image',
                    id: uuidv4(),
                }));

            const context: MessageContext[] = [...createContext, ...imageContexts];
            editorEngine.chat.context.addContexts(context);

            const userPrompt = creationData.context
                .filter((context) => context.type === CreateRequestContextType.PROMPT)
                .map((context) => context.content)
                .join('\n');

            // Clone-mode context: WEBSITE_URL carries the source URL plus the
            // chosen output framework. WEBSITE_SCRAPE carries the markdown +
            // brand-identity blob extracted by Firecrawl. We assemble a
            // clone-specific prompt prefix (system guidance + scrape data) and
            // glue the user's optional notes onto the end.
            const websiteUrlContext = creationData.context.find(
                (c) => c.type === CreateRequestContextType.WEBSITE_URL,
            );
            const websiteScrapeBlocks = creationData.context
                .filter((c) => c.type === CreateRequestContextType.WEBSITE_SCRAPE)
                .map((c) => c.content);

            const isCloneFramework = (v: unknown): v is CloneOutputFramework =>
                typeof v === 'string' &&
                (Object.values(CloneOutputFramework) as string[]).includes(v);

            let prompt: string;
            if (websiteUrlContext) {
                const rawFramework: unknown = websiteUrlContext.framework;
                if (rawFramework != null && !isCloneFramework(rawFramework)) {
                    console.warn(
                        '[useStartProject] unknown clone framework, falling back to NEXTJS',
                        rawFramework,
                    );
                }
                const framework: CloneOutputFramework = isCloneFramework(rawFramework)
                    ? rawFramework
                    : CloneOutputFramework.NEXTJS;
                const cloneGuidance = getCloneSystemPrompt(framework);
                const sourceBlock = websiteUrlContext.content
                    ? `Source URL: ${websiteUrlContext.content}\n`
                    : '';
                const scrapeBlock =
                    websiteScrapeBlocks.length > 0
                        ? `\n=== Source Page Content ===\n${websiteScrapeBlocks.join('\n\n')}\n`
                        : '';
                const screenshotNote =
                    imageContexts.length > 0
                        ? '\nA screenshot of the source page is attached as an image — use it as the visual source of truth.\n'
                        : '';
                const userNotes = userPrompt.trim()
                    ? `\nAdditional user notes:\n${userPrompt.trim()}\n`
                    : '';
                prompt =
                    `${cloneGuidance}\n${sourceBlock}${scrapeBlock}${screenshotNote}${userNotes}`.trim();
            } else if (websiteScrapeBlocks.length > 0) {
                // Scrape-only context without an explicit URL entry — rare,
                // but treat it as a clone with the default framework.
                const cloneGuidance = getCloneSystemPrompt(CloneOutputFramework.NEXTJS);
                const scrapeBlock = `\n=== Source Page Content ===\n${websiteScrapeBlocks.join('\n\n')}\n`;
                const screenshotNote =
                    imageContexts.length > 0
                        ? '\nA screenshot of the source page is attached as an image — use it as the visual source of truth.\n'
                        : '';
                const userNotes = userPrompt.trim()
                    ? `\nAdditional user notes:\n${userPrompt.trim()}\n`
                    : '';
                prompt = `${cloneGuidance}${scrapeBlock}${screenshotNote}${userNotes}`.trim();
            } else {
                prompt = userPrompt;
            }

            const [conversation] = await editorEngine.chat.conversation.getConversations(
                editorEngine.projectId,
            );

            if (!conversation) {
                throw new Error('No conversation found');
            }

            await editorEngine.chat.conversation.selectConversation(conversation.id);

            // Surface the handoff explicitly so the user knows their prompt
            // was received before the AI starts streaming. Without this the
            // first 5–10s feels silent — they only see the canvas overlay,
            // not the conversation.
            const promptPreview = prompt.length > 80 ? `${prompt.slice(0, 77).trimEnd()}…` : prompt;
            toast.success('Got your prompt', {
                description: promptPreview
                    ? `Building: "${promptPreview}"`
                    : 'Starting on your project now.',
            });

            await editorEngine.chat.sendMessage(prompt, ChatType.CREATE);

            try {
                await updateCreateRequest({
                    projectId: editorEngine.projectId,
                    status: ProjectCreateRequestStatus.COMPLETED,
                });
            } catch (error) {
                console.error('Failed to update create request', error);
                toast.error('Failed to complete create request', {
                    description: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        } catch (error) {
            processedRequestIdRef.current = null; // Allow retry on failure
            console.error('Failed to resume create request', error);
            toast.error('Failed to resume create request', {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    };

    useEffect(() => {
        // Suppress query errors when offline — they're expected (queries are
        // disabled). The OfflineBanner already communicates the offline state
        // to the user; surfacing these as a hard `dataError` would route them
        // to the ProjectLoadError page instead of the editor shell.
        if (!online) {
            setDataError(null);
            return;
        }
        setDataError(
            userError?.message ??
                canvasError?.message ??
                conversationsError?.message ??
                creationRequestError?.message ??
                bootstrapError?.message ??
                null,
        );
    }, [online, userError, canvasError, conversationsError, creationRequestError, bootstrapError]);

    return {
        isProjectReady: Object.values(projectReadyState).every((value) => value),
        error: sandboxError ?? dataError,
        readyState: projectReadyState,
        // True while a prompt-driven creation request exists for this project.
        // Drives the "AI is building your site" UX so users see progress instead
        // of a generic editor with a half-booted preview.
        hasPendingCreation: !!creationRequest,
    };
};
