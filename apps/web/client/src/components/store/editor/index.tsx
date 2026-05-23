'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { usePostHog } from 'posthog-js/react';

import type { Branch, Project } from '@weblab/models';

import { EditorEngine } from './engine';

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

    // Initialize the engine for the very first mount. Awaits both init Promises
    // so children never observe a half-hydrated engine (e.g. `activeSandbox`
    // returning undefined while `initBranches` is still resolving).
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                await editorEngine.initBranches(branchesRef.current);
                await editorEngine.init();
            } catch (err) {
                console.error('[EditorEngineProvider] initial init failed', err);
            }
            if (!cancelled) {
                setIsReady(true);
            }
        })();
        return () => {
            cancelled = true;
        };
        // Only runs on initial mount; project-change is handled by the next effect.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Re-initialize when project ID changes.
    useEffect(() => {
        const initializeEngine = async () => {
            if (currentProjectId.current !== project.id) {
                setIsReady(false);

                // Snapshot the previous engine so the deferred clear targets
                // exactly that instance, not whichever one engineRef points to
                // by the time the timeout fires.
                const stale = engineRef.current;
                if (stale) {
                    setTimeout(() => stale.clear(), 0);
                }

                const newEngine = new EditorEngine(
                    project.id,
                    posthog,
                    project.metadata?.runtime?.framework ?? null,
                );
                await newEngine.initBranches(branchesRef.current);
                await newEngine.init();
                newEngine.screenshot.lastScreenshotAt =
                    project.metadata?.previewImg?.updatedAt ?? null;

                engineRef.current = newEngine;
                setEditorEngine(newEngine);
                currentProjectId.current = project.id;
                setIsReady(true);
            }
        };

        initializeEngine();
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
            setTimeout(() => stale?.clear(), 0);
        };
    }, []);

    if (!isReady) {
        return null;
    }

    // Hold children until the first `initBranches` + `init` pair resolves.
    // Without this gate, observer components downstream read
    // `editorEngine.activeSandbox` on the first render — which calls
    // `branches.activeBranchData`, throws "No branch selected", and tears the
    // whole tree down through the root error boundary before `initBranches`
    // has had a chance to write `currentBranchId`. A null-render here is the
    // smallest change that lets the async init finish cleanly; a loader at
    // this layer would compete with `useStartProject`'s richer step UI inside
    // `<Main>`, which we want to keep as the single source of progress copy.
    if (!isReady) {
        return null;
    }
    return (
        <EditorEngineContext.Provider value={editorEngine}>{children}</EditorEngineContext.Provider>
    );
};
