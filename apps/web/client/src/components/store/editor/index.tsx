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
                await editorEngine.initBranches(branches);
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
                await newEngine.initBranches(branches);
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

    return (
        <EditorEngineContext.Provider value={editorEngine}>{children}</EditorEngineContext.Provider>
    );
};
