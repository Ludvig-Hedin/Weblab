'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useConvex, useMutation, useQuery } from 'convex/react';
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

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';
import { ensureBreakpointSiblings } from '@/components/store/editor/frames';
import { useOnlineStatus } from '@/services/offline/online-status';
import { cacheProjectExtras, getCachedProject } from '@/services/offline/project-cache';
import { replayQueue } from '@/services/offline/replay-controller';
import { fromConvexBootstrap, fromConvexConversation } from '../_adapters/convex-bootstrap';
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
    // `activeSandbox` throws "No branch selected" when branch init failed or
    // hasn't written `currentBranchId` yet — gate on `hasActiveBranch` so the
    // hook degrades to "not ready" instead of detonating the editor route.
    const sandbox = editorEngine.branches.hasActiveBranch ? editorEngine.activeSandbox : null;
    const online = useOnlineStatus();
    const [sandboxError, setSandboxError] = useState<string | null>(null);
    const [dataError, setDataError] = useState<string | null>(null);
    const processedRequestIdRef = useRef<string | null>(null);
    const { tabState } = useTabActive();
    const convex = useConvex();
    // Convex's `'skip'` sentinel goes in the SECOND argument, not the first.
    // The migration left every gated query passing `'skip'` as the FunctionReference,
    // which Convex looked up as a query named literally `skip:default` — failing
    // with `Could not find public function for 'skip'.` and detonating the
    // entire editor route. Pass `api.X` unconditionally and gate `'skip'` on
    // the args slot so the query subscribes only when the gate flips true.
    const user = useQuery(api.users.me, online ? {} : 'skip');
    const userError: { message?: string } | null = null;
    // CR-050: poll the canvas + frames row so collaborator mutations show up
    // without a full reload. The userCanvas row is per-user (scale/position),
    // so re-applying it on every poll would clobber the local pan/zoom — we
    // gate that with `initialCanvasAppliedRef` below. Frames are shared and
    // re-apply safely thanks to the new idempotent `applyFrames`.
    //
    // Also enable the live query when the server-rendered bootstrap has empty
    // frame URLs — this is the optimistic-creation case where `createBlank`
    // returned before the sandbox was provisioned. The query stays active until
    // the background `_provisionSandbox` writes real URLs and the frame
    // component triggers a page reload.
    const framesPendingSandbox = initialBootstrap?.canvas?.frames.some((f) => !f.url) ?? false;
    const rawBootstrap = useQuery(
        api.projects.getEditorBootstrap,
        online && (!initialBootstrap || framesPendingSandbox)
            ? { projectId: editorEngine.projectId as Id<'projects'> }
            : 'skip',
    );
    const bootstrapError: { message?: string } | null = null;
    // Map the raw Convex doc graph into the editor-store shapes the stores were
    // written against. The server-rendered `initialBootstrap` (page.tsx) is
    // already mapped via `fromConvexBootstrap`; this covers the client-side
    // refetch path so both feed identical shapes downstream.
    // Memoized on the raw query result — mapping inline produced a NEW object
    // every render, and the effects keyed on the derived `canvasWithFrames`
    // re-fired indefinitely (render → new ref → effect → setState → render…).
    const bootstrap = useMemo(
        () => (rawBootstrap ? fromConvexBootstrap(rawBootstrap as never) : undefined),
        [rawBootstrap],
    );
    const effectiveBootstrap = initialBootstrap ?? bootstrap ?? undefined;

    // Surface background-provisioning failures written by `_provisionSandbox`
    // → `_markProvisioningFailed`. Read from the LIVE query (not the stale
    // server bootstrap) — without this, an optimistic-creation project whose
    // sandbox failed to provision spins on "Setting up your workspace" forever.
    const provisioningError = (() => {
        const branches = (
            rawBootstrap as { branches?: Array<{ runtimeMetadata?: unknown }> } | null | undefined
        )?.branches;
        for (const branch of branches ?? []) {
            const meta = branch.runtimeMetadata;
            if (
                meta &&
                typeof meta === 'object' &&
                typeof (meta as Record<string, unknown>).provisioningError === 'string'
            ) {
                return (meta as { provisioningError: string }).provisioningError;
            }
        }
        return null;
    })();

    // TODO(convex-migration): `userCanvas.getWithFrames` had no direct Convex
    // equivalent at migration time. Bootstrap canvas/frames are still loaded via
    // `getEditorBootstrap`; collaborator polling needs a dedicated Convex query.
    const canvasWithFrames = effectiveBootstrap?.canvas ?? null;
    const canvasError: { message?: string } | null = null;
    const initialCanvasAppliedRef = useRef(false);
    const breakpointMigrationRanRef = useRef(false);
    const liveConversations = useQuery(
        api.conversations.list,
        online && Boolean(effectiveBootstrap)
            ? { projectId: editorEngine.projectId as Id<'projects'> }
            : 'skip',
    );
    // `conversations.list` returns raw Convex docs (`_id`/`displayName`); map
    // them to `ChatConversation` (`id`/`title`) so `applyConversations` and the
    // chat panel see a real `id`. `effectiveBootstrap.conversations` is already
    // mapped (server bootstrap or the mapped client `bootstrap` above).
    // Memoized on the raw query result — an inline `.map()` minted a new array
    // every render, re-firing the `applyConversations` + cache effects below
    // in a loop (with an IndexedDB write per cycle) once the query resolved.
    const conversations = useMemo(
        () =>
            (liveConversations
                ? liveConversations.map(fromConvexConversation)
                : effectiveBootstrap?.conversations) ?? undefined,
        [liveConversations, effectiveBootstrap?.conversations],
    );
    const conversationsError: { message?: string } | null = null;
    const livePendingRequest = useQuery(
        api.projectCreateRequests.getPendingRequest,
        online && Boolean(effectiveBootstrap)
            ? { projectId: editorEngine.projectId as Id<'projects'> }
            : 'skip',
    );
    // Only fall back to the server-rendered bootstrap while the live query is
    // still LOADING (undefined). Once it resolves to `null` (no pending
    // request — e.g. the handoff completed), the bootstrap copy is stale; a
    // `??` chain here kept `hasPendingCreation` true forever, which left the
    // "Building your site" frame overlay stuck after the AI had started.
    const creationRequest =
        (livePendingRequest === undefined
            ? effectiveBootstrap?.creationRequest
            : livePendingRequest) ?? undefined;
    const creationRequestError: { message?: string } | null = null;
    const updateCreateRequest = useMutation(api.projectCreateRequests.updateStatus);
    const [projectReadyState, setProjectReadyState] = useState<ProjectReadyState>({
        canvas: false,
        conversations: false,
        sandbox: false,
    });

    const updateProjectReadyState = (state: Partial<ProjectReadyState>) => {
        setProjectReadyState((prev) => {
            // Bail with the SAME reference when nothing changed — effects that
            // depend on this state object would otherwise re-fire forever
            // (every call minted a new object even for identical flags).
            const changed = Object.entries(state).some(
                ([key, value]) => prev[key as keyof ProjectReadyState] !== value,
            );
            return changed ? { ...prev, ...state } : prev;
        });
    };

    useEffect(() => {
        if (sandbox?.session.provider) {
            updateProjectReadyState({ sandbox: true });
            setSandboxError(null);
            return;
        }

        if (sandbox?.session.connectionError) {
            updateProjectReadyState({ sandbox: false });
            setSandboxError(sandbox.session.connectionError);
        }
    }, [sandbox?.session.provider, sandbox?.session.connectionError]);

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
        void cacheProjectExtras(editorEngine.projectId, {
            conversations,
        });
    }, [online, conversations, editorEngine.projectId]);

    // Offline → online transition: swap the offline shim for the real cloud
    // provider, then drain the durable write queue against it. Failures are
    // logged + surfaced via the queue's dead-letter store.
    // `activeBranch` is a throwing getter — `?.` can't save us, gate first.
    const branchSandboxId = editorEngine.branches.hasActiveBranch
        ? (editorEngine.branches.activeBranch.sandbox?.id ?? null)
        : null;
    useEffect(() => {
        if (!online) return;
        if (!sandbox) return;
        if (!sandbox.session.isOffline) return;
        if (!branchSandboxId) return;
        let cancelled = false;
        void (async () => {
            let syncInitResumed = false;
            const resumeSync = async () => {
                if (syncInitResumed) return;
                syncInitResumed = true;
                await sandbox.resumeSyncInit();
            };
            try {
                // Block the provider-reaction sync engine init so the queue
                // drain runs against the cloud provider FIRST. Without this
                // gate `pullFromSandbox` would race the replay and overwrite
                // local edits that haven't been pushed yet.
                sandbox.suppressSyncInitForReplay();
                await sandbox.session.swapToOnline(branchSandboxId, user?._id);
                if (cancelled) return;
                if (!sandbox.session.provider) {
                    await resumeSync();
                    return;
                }
                // Network may have flickered between swap and replay,
                // pushing `start()` back into its offline path. Bail
                // before replayQueue tries to drain records into the
                // OfflineProvider's no-op writeFile (which would silently
                // delete every queued edit). The next online transition
                // re-fires this effect and tries again.
                if (sandbox.session.isOffline) {
                    await resumeSync();
                    return;
                }
                const result = await replayQueue(sandbox.session.provider, editorEngine.projectId);
                // Only run the bidirectional sync engine after the queue is
                // drained — at this point the cloud filesystem reflects the
                // user's offline edits, so the pull won't clobber them.
                await resumeSync();
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
                // Convex queries are live — no manual invalidation needed.
            } catch (err) {
                console.error('[offline] reconnect/replay failed', err);
                if (!cancelled) {
                    toast.error('Failed to sync offline changes. Try reloading the project.', {
                        description: err instanceof Error ? err.message : 'Unknown error',
                    });
                }
            } finally {
                // Ensure sync engine init is never left permanently suppressed
                // even if swap or replay throws. resumeSync() is idempotent.
                try {
                    await resumeSync();
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
        sandbox?.session.isOffline,
        branchSandboxId,
        editorEngine.projectId,
        user?._id,
        sandbox?.session,
    ]);

    useEffect(() => {
        if (tabState === 'reactivated' && sandbox && branchSandboxId && user?._id) {
            void sandbox.session.reconnect(branchSandboxId, user._id);
        }
    }, [tabState, sandbox, branchSandboxId, user?._id]);

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
        const requestId =
            (creationRequest as { _id?: string; id?: string } | null | undefined)?._id ??
            (creationRequest as { id?: string } | null | undefined)?.id ??
            null;
        if (
            creationRequest &&
            requestId &&
            processedRequestIdRef.current !== requestId &&
            isProjectReady &&
            editorEngine.chat._sendMessageAction
        ) {
            processedRequestIdRef.current = requestId;
            void resumeCreate(creationRequest as ProjectCreateRequest);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [creationRequest, projectReadyState, editorEngine.chat._sendMessageAction]);

    const resumeCreate = async (creationData: ProjectCreateRequest) => {
        try {
            if (editorEngine.projectId !== creationData.projectId) {
                throw new Error('Project ID mismatch');
            }

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

            // Surface the handoff the moment the editor can act on the
            // request — BEFORE the slow work below (sandbox file reads for
            // create-context retry up to ~6.5s, conversation hydration).
            // Toasting after that work made the first 10–20s in the editor
            // feel silent and broken.
            const promptPreview = prompt.length > 80 ? `${prompt.slice(0, 77).trimEnd()}…` : prompt;
            toast.success('Got your prompt', {
                description: promptPreview
                    ? `Building: "${promptPreview}"`
                    : 'Starting on your project now.',
            });

            // Create-context (page.tsx + style guide from the freshly-forked
            // sandbox) — retries internally while the sandbox file system
            // catches up.
            const createContext: MessageContext[] =
                await editorEngine.chat.context.getCreateContext();
            editorEngine.chat.context.addContexts([...createContext, ...imageContexts]);

            const [conversation] = await editorEngine.chat.conversation.getConversations(
                editorEngine.projectId,
            );

            if (!conversation) {
                throw new Error('No conversation found');
            }

            await editorEngine.chat.conversation.selectConversation(conversation.id);

            await editorEngine.chat.sendMessage(prompt, ChatType.CREATE);

            try {
                await updateCreateRequest({
                    projectId: editorEngine.projectId as Id<'projects'>,
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
            (userError as { message?: string } | null)?.message ??
                (canvasError as { message?: string } | null)?.message ??
                (conversationsError as { message?: string } | null)?.message ??
                (creationRequestError as { message?: string } | null)?.message ??
                (bootstrapError as { message?: string } | null)?.message ??
                (provisioningError ? `Workspace setup failed: ${provisioningError}` : null) ??
                null,
        );
    }, [
        online,
        userError,
        canvasError,
        conversationsError,
        creationRequestError,
        bootstrapError,
        provisioningError,
    ]);

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
