'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isCloudEditorRuntime } from '@convex/lib/cloudEditor';
import { usePostHog } from 'posthog-js/react';

import type { Branch, Project } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';

import type { ScopedEditorProject } from './engine';
import { ProjectLoadError } from '@/app/project/[id]/_components/project-load-error';
import { useWorkingLevelLifecycle } from '@/components/working-level/editor-gate';
import { useCloudEditorCopy } from '@/lib/cloud-editor/copy';
import { EditorEngine } from './engine';

function CloudStartup() {
    const copy = useCloudEditorCopy();
    return (
        <div
            role="status"
            aria-live="polite"
            className="bg-background text-foreground-secondary flex h-dvh items-center justify-center gap-2 text-sm"
        >
            <Icons.LoadingSpinner className="h-4 w-4 animate-spin" aria-hidden="true" />
            {copy.previewStarting}
        </div>
    );
}

const EditorEngineContext = createContext<EditorEngine | null>(null);

export const useEditorEngine = () => {
    const ctx = useContext(EditorEngineContext);
    if (!ctx) throw new Error('useEditorEngine must be inside EditorEngineProvider');
    return ctx;
};

/**
 * Safe variant that returns `null` when no `EditorEngineProvider` ancestor is
 * present. Use only from components that may render both inside and outside
 * the provider (e.g. `ProjectLoadError`, which can be returned from the page
 * Server Component for `not-found`/`unauthorized` BEFORE providers mount, or
 * from `Main` after providers exist when sandbox connect fails).
 */
export const useOptionalEditorEngine = () => useContext(EditorEngineContext);

export const EditorEngineProvider = ({
    children,
    project,
    branches,
    scopedProject,
}: {
    children: React.ReactNode;
    project: Project;
    branches: Branch[];
    scopedProject?: ScopedEditorProject;
}) => {
    const posthog = usePostHog();
    const currentProjectId = useRef(project.id);
    const engineRef = useRef<EditorEngine | null>(null);
    const pendingEngine = useRef<EditorEngine | null>(null);
    const renderedChildren = useRef(children);
    const lifecycle = useWorkingLevelLifecycle();
    const initializing = useRef<Promise<void> | null>(null);
    const initializationRequest = useRef<{
        projectId: string;
        engine: EditorEngine | null;
        ready: boolean;
        promise: Promise<void>;
    } | null>(null);
    const requestedProjectId = useRef(project.id);
    requestedProjectId.current = project.id;
    const mountGeneration = useRef(0);
    const cleanupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const initializationFailed = useRef(false);
    const closing = useRef(false);
    // Mirror the latest `branches` prop into a ref so the async init effects
    // always read the most recent value at await/invocation time, not the
    // snapshot captured on the render that scheduled them. Without this, a
    // branches change that lands while the engine is initialising would be
    // silently lost (the effect would still call `initBranches(stale)`).
    const branchesRef = useRef(branches);
    useEffect(() => {
        branchesRef.current = branches;
    }, [branches]);

    const [editorEngine, setEditorEngine] = useState(() => {
        const engine = new EditorEngine(
            project.id,
            posthog,
            project.metadata?.runtime?.framework ?? null,
            scopedProject,
        );
        engine.screenshot.lastScreenshotAt = project.metadata?.previewImg?.updatedAt ?? null;
        return engine;
    });
    if (!engineRef.current && !initializationRequest.current) engineRef.current = editorEngine;
    const [isReady, setIsReady] = useState(false);
    const [startupFailure, setStartupFailure] = useState<string | null>(null);
    const [resumeAttempt, setResumeAttempt] = useState(0);

    // StrictMode replays setup immediately. Only that replay may cancel this
    // provider's deferred unmount cleanup; account closure remains latched.
    useLayoutEffect(() => {
        const generation = ++mountGeneration.current;
        if (cleanupTimer.current !== null) {
            clearTimeout(cleanupTimer.current);
            cleanupTimer.current = null;
        }
        return () => {
            cleanupTimer.current = setTimeout(() => {
                cleanupTimer.current = null;
                if (mountGeneration.current !== generation) return;
                closing.current = true;
                void (async () => {
                    try {
                        await initializing.current;
                    } catch {
                        /* Failed engines remain reachable for disposal. */
                    }
                    if (mountGeneration.current !== generation) return;
                    const losingEngine = pendingEngine.current;
                    await losingEngine?.clear();
                    if (pendingEngine.current === losingEngine) pendingEngine.current = null;
                    if (mountGeneration.current !== generation) return;
                    await engineRef.current?.clear();
                })().catch((err: unknown) => {
                    console.error('[EditorEngineProvider] unmount cleanup failed', err);
                });
            }, 0);
        };
    }, []);

    // Register before passive initialization so an account change cannot
    // remove this provider while its first sandbox is still being created.
    useLayoutEffect(
        () =>
            lifecycle?.register(async () => {
                closing.current = true;
                try {
                    await initializing.current;
                } catch {
                    initializationFailed.current = true;
                }
                const losingEngine = pendingEngine.current;
                await losingEngine?.clear();
                pendingEngine.current = null;
                const retainedEngine = engineRef.current;
                try {
                    await retainedEngine?.clear();
                } catch (error) {
                    if (
                        !initializationFailed.current &&
                        !losingEngine &&
                        retainedEngine &&
                        retainedEngine === engineRef.current &&
                        retainedEngine.isClosing === false
                    ) {
                        lifecycle.allowResumeBeforeDisposal();
                        closing.current = false;
                        setResumeAttempt((attempt) => attempt + 1);
                    }
                    throw error;
                }
            }),
        [lifecycle],
    );

    // One operation per requested project, including StrictMode's replay.
    // Project handoffs serialize behind initialization and retain failed or
    // superseded engines until their guarded disposal succeeds.
    useEffect(() => {
        let cancelled = false;
        let request = initializationRequest.current;
        if (!request || request.projectId !== project.id) {
            const previousInitialization = initializing.current;
            const initialEngine = previousInitialization ? null : engineRef.current;
            request = {
                projectId: project.id,
                engine: initialEngine,
                ready: false,
                promise: Promise.resolve(),
            };
            const ownedRequest = request;
            const isCurrent = () =>
                !closing.current &&
                initializationRequest.current === ownedRequest &&
                requestedProjectId.current === ownedRequest.projectId;
            const operation = Promise.resolve().then(async () => {
                try {
                    await previousInitialization;
                } catch {
                    /* Dispose the failed pending engine before its replacement. */
                }
                if (!isCurrent()) return;

                if (!initialEngine) {
                    const losingEngine = pendingEngine.current;
                    if (losingEngine) {
                        await losingEngine.clear();
                        if (pendingEngine.current === losingEngine) pendingEngine.current = null;
                    }
                    if (!isCurrent()) return;
                    const stale = engineRef.current;
                    if (stale) {
                        try {
                            await stale.clear();
                        } catch (err) {
                            // Refused disposal leaves the old editor's mounted
                            // buffers intact for recovery through its owner gate.
                            console.error(
                                '[EditorEngineProvider] previous engine cleanup failed',
                                err,
                            );
                            lifecycle?.reportFailure();
                            return;
                        }
                        if (engineRef.current === stale) {
                            engineRef.current = null;
                            setIsReady(false);
                        }
                    }
                    if (!isCurrent()) return;
                    // The old editor is now disposed. Never show its children
                    // if replacement initialization fails.
                    setIsReady(false);
                    ownedRequest.engine = new EditorEngine(
                        project.id,
                        posthog,
                        project.metadata?.runtime?.framework ?? null,
                        scopedProject,
                    );
                    pendingEngine.current = ownedRequest.engine;
                }
                const engine = ownedRequest.engine;
                if (!engine) throw new Error('The editor could not start. Reload this project.');
                await engine.initBranches(branchesRef.current);
                await engine.init();
                ownedRequest.ready = true;
            });
            ownedRequest.promise = operation;
            initializationRequest.current = ownedRequest;
            initializing.current = operation;
        }
        const ownedRequest = request;
        const ownsRequest = () =>
            !cancelled &&
            !closing.current &&
            initializationRequest.current === ownedRequest &&
            requestedProjectId.current === ownedRequest.projectId;
        const canPublish = () =>
            ownsRequest() &&
            ownedRequest.engine !== null &&
            (engineRef.current === ownedRequest.engine ||
                pendingEngine.current === ownedRequest.engine);
        void ownedRequest.promise.then(
            () => {
                const engine = ownedRequest.engine;
                if (!engine || !ownedRequest.ready || !canPublish()) return;
                engine.screenshot.lastScreenshotAt =
                    project.metadata?.previewImg?.updatedAt ?? null;
                engineRef.current = engine;
                if (pendingEngine.current === engine) pendingEngine.current = null;
                currentProjectId.current = ownedRequest.projectId;
                initializationFailed.current = false;
                setStartupFailure(null);
                setEditorEngine(engine);
                setIsReady(true);
            },
            (err: unknown) => {
                console.error('[EditorEngineProvider] initialization failed', err);
                if (!ownsRequest()) return;
                initializationFailed.current = true;
                setStartupFailure(ownedRequest.projectId);
                setIsReady(false);
            },
        );
        return () => {
            cancelled = true;
        };
        // Same-project metadata changes must not rebuild a live sandbox.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project.id, resumeAttempt]);

    // Apply branch updates without recreating the engine.
    //
    // LIMITATION: BranchManager exposes only `initBranches`, which is
    // destructive — it tears down every branch's sandbox/history/error
    // managers and rebuilds them from scratch. There is no incremental
    // `setBranches` / `applyBranches` API that diffs branches and updates
    // in-place. Calling `initBranches` here on every prop change would
    // detonate active sandbox state on innocuous edits (e.g. branch
    // rename, default-flag toggle) and is therefore worse than the bug
    // it solves.
    //
    // Until BranchManager grows an incremental update method, branch
    // changes that arrive after the initial mount are picked up only on
    // project-id change (full re-init) or via direct calls into the
    // engine from the routers/components that mutate branches (fork,
    // create, rename, remove all call into BranchManager directly).
    // This effect intentionally has no body — the ref above keeps the
    // initial-mount path correct; documenting the gap here so reviewers
    // and future agents don't accidentally wire an `initBranches` call
    // here and nuke live editor state.
    useEffect(() => {
        // Intentional no-op. See comment above.
    }, [branches]);

    // Hold children until the first `initBranches` + `init` pair resolves.
    // Without this gate, observer components downstream read
    // `editorEngine.activeSandbox` on the first render — which calls
    // `branches.activeBranchData`, throws "No branch selected", and tears the
    // whole tree down through the root error boundary before `initBranches`
    // has had a chance to write `currentBranchId`. Cloud startup can include
    // its first dependency install; give that wait feedback before Main mounts.
    if (startupFailure === project.id) {
        return <ProjectLoadError variant="unknown" onRetry={() => window.location.reload()} />;
    }
    if (!isReady) {
        return branches.some((branch) => isCloudEditorRuntime(branch.runtime)) ? (
            <CloudStartup />
        ) : null;
    }
    if (currentProjectId.current === project.id) renderedChildren.current = children;
    return (
        <EditorEngineContext.Provider value={editorEngine}>
            {renderedChildren.current}
        </EditorEngineContext.Provider>
    );
};
