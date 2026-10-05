'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePostHog } from 'posthog-js/react';
import { isCloudEditorRuntime } from '@convex/lib/cloudEditor';
import { Icons } from '@weblab/ui/icons';
import { useCloudEditorCopy } from '@/lib/cloud-editor/copy';

import type { Branch, Project } from '@weblab/models';

import { EditorEngine } from './engine';
import { useWorkingLevelLifecycle } from '@/components/working-level/editor-gate';

function CloudStartup() {
    const copy = useCloudEditorCopy();
    return <div role="status" aria-live="polite" className="bg-background text-foreground-secondary flex h-dvh items-center justify-center gap-2 text-sm">
        <Icons.LoadingSpinner className="h-4 w-4 animate-spin" aria-hidden="true" />
        {copy.previewStarting}
    </div>;
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
}: {
    children: React.ReactNode;
    project: Project;
    branches: Branch[];
}) => {
    const posthog = usePostHog();
    const currentProjectId = useRef(project.id);
    const engineRef = useRef<EditorEngine | null>(null);
    const pendingEngine = useRef<EditorEngine | null>(null);
    const renderedChildren = useRef(children);
    const lifecycle = useWorkingLevelLifecycle();
    const initializing = useRef<Promise<void> | null>(null);
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
        );
        engine.screenshot.lastScreenshotAt = project.metadata?.previewImg?.updatedAt ?? null;
        engineRef.current = engine;
        return engine;
    });
    const [isReady, setIsReady] = useState(false);

    // Register before passive initialization so an account change cannot
    // remove this provider while its first sandbox is still being created.
    useLayoutEffect(() => lifecycle?.register(async () => {
        closing.current = true;
        try { await initializing.current; }
        catch { initializationFailed.current = true; }
        const losingEngine = pendingEngine.current;
        await losingEngine?.clear();
        pendingEngine.current = null;
        const retainedEngine = engineRef.current;
        try {
            await retainedEngine?.clear();
        } catch (error) {
            if (!initializationFailed.current && !losingEngine && retainedEngine
                && retainedEngine === engineRef.current && retainedEngine.isClosing === false) {
                lifecycle.allowResumeBeforeDisposal();
                closing.current = false;
            }
            throw error;
        }
    }), [lifecycle]);

    // Initialize the engine for the very first mount. Awaits both init Promises
    // so children never observe a half-hydrated engine (e.g. `activeSandbox`
    // returning undefined while `initBranches` is still resolving).
    useEffect(() => {
        let cancelled = false;
        const operation = (async () => {
            if (closing.current) return;
            try {
                await editorEngine.initBranches(branchesRef.current);
                await editorEngine.init();
            } catch (err) {
                initializationFailed.current = true;
                console.error('[EditorEngineProvider] initial init failed', err);
            }
            if (!cancelled && !closing.current) {
                setIsReady(true);
            }
        })();
        initializing.current = operation;
        return () => {
            cancelled = true;
        };
        // Only runs on initial mount; project-change is handled by the next effect.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Re-initialize when project ID changes.
    useEffect(() => {
        // Cancellation guard for rapid id changes: each run owns a flag the
        // cleanup flips, so a stale (superseded) init can never overwrite a
        // newer engine in state/ref.
        let cancelled = false;
        const previousInitialization = initializing.current;
        const initializeEngine = async () => {
            if (currentProjectId.current !== project.id) {
                await previousInitialization;
                if (cancelled || closing.current) return;

                // Finish the previous project's writes before starting a new
                // engine. Its beforeunload guard remains attached until then.
                const stale = engineRef.current;
                if (stale) {
                    try {
                        await stale.clear();
                    } catch (err) {
                        console.error('[EditorEngineProvider] previous engine cleanup failed', err);
                        lifecycle?.reportFailure();
                        return;
                    }
                }

                if (cancelled || closing.current) return;
                setIsReady(false);

                const newEngine = new EditorEngine(
                    project.id,
                    posthog,
                    project.metadata?.runtime?.framework ?? null,
                );
                pendingEngine.current = newEngine;
                // Mirror the initial-mount path: log and continue instead of
                // letting an unhandled rejection leave the provider rendering
                // null forever.
                try {
                    await newEngine.initBranches(branchesRef.current);
                    await newEngine.init();
                } catch (err) {
                    initializationFailed.current = true;
                    console.error('[EditorEngineProvider] project-switch init failed', err);
                }
                if (cancelled || closing.current) {
                    // A newer project id superseded this run — dispose the
                    // losing engine instead of leaking its sandbox/listeners.
                    await newEngine.clear();
                    if (pendingEngine.current === newEngine) pendingEngine.current = null;
                    return;
                }
                newEngine.screenshot.lastScreenshotAt =
                    project.metadata?.previewImg?.updatedAt ?? null;

                engineRef.current = newEngine;
                pendingEngine.current = null;
                setEditorEngine(newEngine);
                currentProjectId.current = project.id;
                setIsReady(true);
            }
        };

        if (currentProjectId.current !== project.id) {
            initializing.current = initializeEngine();
            void initializing.current.catch((err: unknown) => {
                console.error('[EditorEngineProvider] project handoff failed', err);
                lifecycle?.reportFailure();
            });
        }
        return () => {
            cancelled = true;
        };
    }, [project.id]);

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

    // Cleanup on unmount — capture the engine locally so a later remount
    // cannot point engineRef at a different instance before the timeout fires.
    useEffect(() => {
        return () => {
            const stale = engineRef.current;
            if (stale) {
                setTimeout(() => {
                    void (async () => {
                        closing.current = true;
                        try { await initializing.current; }
                        catch { /* Retained losing engine still needs disposal. */ }
                        await pendingEngine.current?.clear();
                        pendingEngine.current = null;
                        await stale.clear();
                    })().catch((err: unknown) => {
                        console.error('[EditorEngineProvider] unmount cleanup failed', err);
                    });
                }, 0);
            }
        };
    }, []);

    // Hold children until the first `initBranches` + `init` pair resolves.
    // Without this gate, observer components downstream read
    // `editorEngine.activeSandbox` on the first render — which calls
    // `branches.activeBranchData`, throws "No branch selected", and tears the
    // whole tree down through the root error boundary before `initBranches`
    // has had a chance to write `currentBranchId`. Cloud startup can include
    // its first dependency install; give that wait feedback before Main mounts.
    if (!isReady) {
        return branches.some((branch) => isCloudEditorRuntime(branch.runtime)) ? <CloudStartup /> : null;
    }
    if (currentProjectId.current === project.id) renderedChildren.current = children;
    return (
        <EditorEngineContext.Provider value={editorEngine}>{renderedChildren.current}</EditorEngineContext.Provider>
    );
};
