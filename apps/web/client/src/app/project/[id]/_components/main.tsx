'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { observer } from 'mobx-react-lite';

import { EditorAttributes } from '@weblab/constants';
import { EditorMode } from '@weblab/models';
import { TooltipProvider } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import type { EditorBootstrapData } from '../_hooks/use-start-project';
import { ProjectCreationLoader } from '@/components/project-creation-loader';
import { useEditorEngine } from '@/components/store/editor';
import { ProjectCapabilitiesProvider } from '@/hooks/use-project-capabilities-context';
import { useEditorStatePersistence } from '../_hooks/use-editor-state-persistence';
import { usePanelMeasurements } from '../_hooks/use-panel-measure';
import { useStartProject } from '../_hooks/use-start-project';
import { BottomBar } from './bottom-bar';
import { Canvas } from './canvas';
import { EditorBar } from './editor-bar';
import { OfflineBanner } from './offline-banner';
import { LeftPanel } from './left-panel';
import { MobileLayout } from './mobile-layout';
import { OnboardingTour } from './onboarding-tour';
import { PreviewOverlay } from './preview-overlay';
import { ProjectLoadError } from './project-load-error';
import { RightPanel } from './right-panel';
import { TopBar } from './top-bar';

// Modals are mounted but inert until user opens them. Dynamic-loading them
// keeps the initial editor chunk lean — Stripe (SubscriptionModal), settings
// tabs, command/file palettes, and CMS dialogs only ship when needed.
const SettingsModalWithProjects = dynamic(
    () =>
        import('@/components/ui/settings-modal/with-project').then(
            (m) => m.SettingsModalWithProjects,
        ),
    { ssr: false },
);
const SubscriptionModal = dynamic(
    () => import('@/components/ui/pricing-modal').then((m) => m.SubscriptionModal),
    { ssr: false },
);
const KeyboardShortcutsModal = dynamic(
    () => import('./keyboard-shortcuts-modal').then((m) => m.KeyboardShortcutsModal),
    { ssr: false },
);
const ElementPalette = dynamic(() => import('./element-palette').then((m) => m.ElementPalette), {
    ssr: false,
});
const CommandPalette = dynamic(() => import('./command-palette').then((m) => m.CommandPalette), {
    ssr: false,
});
const FileFinder = dynamic(() => import('./file-finder').then((m) => m.FileFinder), {
    ssr: false,
});
const ProjectSearch = dynamic(() => import('./project-search').then((m) => m.ProjectSearch), {
    ssr: false,
});
const PageSettingsDrawer = dynamic(
    () => import('./page-settings-drawer').then((m) => m.PageSettingsDrawer),
    { ssr: false },
);
const CmsBindDialog = dynamic(
    () => import('./cms-workspace/bind-dialog').then((m) => m.BindDialog),
    { ssr: false },
);
const CmsDataPusher = dynamic(
    () => import('./cms-workspace/data-pusher').then((m) => m.CmsDataPusher),
    { ssr: false },
);
// CMS workspace itself only mounts when the user enters CMS mode. Keep the
// module out of the initial editor chunk — DESIGN-only users never load it.
const CmsWorkspace = dynamic(() => import('./cms-workspace').then((m) => m.CmsWorkspace), {
    ssr: false,
});

export const Main = observer(({ initialBootstrap }: { initialBootstrap?: EditorBootstrapData }) => {
    const editorEngine = useEditorEngine();
    const { isProjectReady, error, readyState, hasPendingCreation } =
        useStartProject(initialBootstrap);
    useEditorStatePersistence(editorEngine.projectId, editorEngine, isProjectReady);
    const leftPanelRef = useRef<HTMLDivElement | null>(null);
    const rightPanelRef = useRef<HTMLDivElement | null>(null);
    const { toolbarLeft, toolbarRight, editorBarAvailableWidth } = usePanelMeasurements(
        leftPanelRef,
        rightPanelRef,
    );
    // Initialize false (SSR-safe) so SSR and client hydration output the same
    // markup. useLayoutEffect then sets the correct value synchronously before
    // the browser paints, eliminating the hydration mismatch that arose when
    // the lazy initialiser diverged between server (false) and mobile client (true).
    const [isMobile, setIsMobile] = useState<boolean>(false);

    useLayoutEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check(); // Sync immediately before first paint
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    useEffect(() => {
        function handleGlobalWheel(event: WheelEvent) {
            if (!(event.ctrlKey || event.metaKey)) {
                return;
            }

            const canvasContainer = document.getElementById(EditorAttributes.CANVAS_CONTAINER_ID);
            if (canvasContainer?.contains(event.target as Node | null)) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
        }

        window.addEventListener('wheel', handleGlobalWheel, { passive: false });
        return () => {
            window.removeEventListener('wheel', handleGlobalWheel);
        };
    }, []);

    if (error) {
        return <ProjectLoadError variant="unknown" message={error} />;
    }

    const heading = hasPendingCreation ? 'Getting ready to build your site' : 'Opening project';
    const steps = hasPendingCreation
        ? [
              { label: 'Starting your sandbox', ready: readyState.sandbox },
              { label: 'Preparing the canvas', ready: readyState.canvas },
              { label: 'Loading the AI chat', ready: readyState.conversations },
          ]
        : [
              { label: 'Starting workspace', ready: readyState.sandbox },
              { label: 'Preparing canvas', ready: readyState.canvas },
              { label: 'Loading project history', ready: readyState.conversations },
          ];

    if (!isProjectReady && hasPendingCreation) {
        return (
            <ProjectCreationLoader
                heading={heading}
                caption={
                    'We saved your prompt. The AI will start writing as soon as the editor is ready.'
                }
                steps={steps}
            />
        );
    }

    if (isMobile) {
        return (
            <ProjectCapabilitiesProvider projectId={editorEngine.projectId}>
                <TooltipProvider>
                    <MobileLayout />
                    <SettingsModalWithProjects />
                    <SubscriptionModal />
                    <KeyboardShortcutsModal />
                    <ElementPalette />
                    <CommandPalette />
                    <FileFinder />
                    <ProjectSearch />
                </TooltipProvider>
            </ProjectCapabilitiesProvider>
        );
    }

    const isPreview = editorEngine.state.editorMode === EditorMode.PREVIEW;
    // CODE mode is full-bleed: stretch the left-panel container to the AI
    // panel's left edge so the code editor takes the full viewport width minus
    // the (resizable, collapsible) right panel — VS-Code-like split.
    const isCode = editorEngine.state.editorMode === EditorMode.CODE;
    const isCms = editorEngine.state.editorMode === EditorMode.CMS;

    return (
        <ProjectCapabilitiesProvider projectId={editorEngine.projectId}>
            <TooltipProvider>
                {/* First-run tour. Suppressed during the prompt-driven creation
                flow — the user is busy watching the AI scaffold their site,
                not in a normal editor session yet. */}
                <OnboardingTour suppressed={hasPendingCreation} />
                <div className="relative flex h-screen w-screen flex-row overflow-hidden select-none">
                    <Canvas />

                    {/* Editor chrome — hidden only in full-screen preview mode.
                    In CMS mode the top bar stays visible so users can navigate
                    back to Design via the mode toggle. */}
                    <div className={cn('absolute top-0 w-full', isPreview && 'hidden')}>
                        <TopBar />
                    </div>

                    {/* Left Panel */}
                    <div
                        ref={leftPanelRef}
                        className={cn(
                            'absolute top-14 left-0 z-50 h-[calc(100%-49px)]',
                            (isPreview || isCms) && 'hidden',
                        )}
                        style={isCode ? { right: toolbarRight } : undefined}
                    >
                        <LeftPanel />
                    </div>
                    {/* EditorBar anchored between panels */}
                    <div
                        className={cn('absolute top-14 z-49', (isPreview || isCms) && 'hidden')}
                        style={{
                            left: toolbarLeft,
                            right: toolbarRight,
                            overflow: 'hidden',
                            pointerEvents: 'none',
                            maxWidth: editorBarAvailableWidth,
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'flex-start',
                        }}
                    >
                        <div style={{ pointerEvents: 'auto' }}>
                            <EditorBar availableWidth={editorBarAvailableWidth} />
                        </div>
                    </div>

                    {/* Right Panel */}
                    <div
                        ref={rightPanelRef}
                        data-tour="chat-panel"
                        className={cn(
                            'absolute top-14 right-0 z-50 h-[calc(100%-49px)]',
                            (isPreview || isCms) && 'hidden',
                        )}
                    >
                        <RightPanel />
                    </div>

                    {/* Per-page settings drawer — opened from the Pages tab cog.
                    Anchored to the right of the left panel via toolbarLeft.
                    Hidden in preview/CMS/code modes where the layout differs. */}
                    {!isPreview && !isCms && !isCode && (
                        <PageSettingsDrawer toolbarLeft={toolbarLeft} />
                    )}

                    {/* BottomBar — anchored between the side panels so it stays
                    visually centered within the canvas area as panels resize. */}
                    <div
                        className={cn(
                            'pointer-events-none absolute bottom-0 z-40 flex justify-center',
                            (isPreview || isCms) && 'hidden',
                        )}
                        style={{ left: toolbarLeft, right: toolbarRight }}
                    >
                        <div className="pointer-events-auto">
                            <BottomBar />
                        </div>
                    </div>

                    {/* Full-viewport preview overlay — covers all editor chrome
                    when in PREVIEW mode (the chrome is also hidden via the
                    isPreview guards above so background interactions can't
                    leak through). */}
                    {isPreview && <PreviewOverlay />}

                    {/* Offline / sync banner — floating chip, 12px below top bar, 12px from right edge. */}
                    {!isPreview && !isCms && (
                        <div className="pointer-events-none absolute right-3 z-50" style={{ top: '68px' }}>
                            <OfflineBanner />
                        </div>
                    )}

                    {/* CMS workspace — sits below the top bar (top-14) and replaces
                    the canvas/side panels while in CMS mode. */}
                    {isCms && <CmsWorkspace />}
                </div>
                <SettingsModalWithProjects />
                <SubscriptionModal />
                <KeyboardShortcutsModal />
                <ElementPalette />
                <CommandPalette />
                <FileFinder />
                <ProjectSearch />
                <CmsBindDialog />
                <CmsDataPusher />
            </TooltipProvider>
        </ProjectCapabilitiesProvider>
    );
});
