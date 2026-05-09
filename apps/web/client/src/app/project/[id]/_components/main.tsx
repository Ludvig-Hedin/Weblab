'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { EditorAttributes } from '@weblab/constants';
import { EditorMode } from '@weblab/models';
import { TooltipProvider } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { ProjectCreationLoader } from '@/components/project-creation-loader';
import { useEditorEngine } from '@/components/store/editor';
import { SubscriptionModal } from '@/components/ui/pricing-modal';
import { SettingsModalWithProjects } from '@/components/ui/settings-modal/with-project';
import { usePanelMeasurements } from '../_hooks/use-panel-measure';
import { useStartProject } from '../_hooks/use-start-project';
import { BottomBar } from './bottom-bar';
import { Canvas } from './canvas';
import { CmsWorkspace } from './cms-workspace';
import { BindDialog as CmsBindDialog } from './cms-workspace/bind-dialog';
import { CmsDataPusher } from './cms-workspace/data-pusher';
import { CommandPalette } from './command-palette';
import { EditorBar } from './editor-bar';
import { ElementPalette } from './element-palette';
import { FileFinder } from './file-finder';
import { KeyboardShortcutsModal } from './keyboard-shortcuts-modal';
import { LeftPanel } from './left-panel';
import { MobileLayout } from './mobile-layout';
import { OfflineBanner } from './offline-banner';
import { OnboardingTour } from './onboarding-tour';
import { PreviewOverlay } from './preview-overlay';
import { ProjectLoadError } from './project-load-error';
import { ProjectSearch } from './project-search';
import { RightPanel } from './right-panel';
import { TopBar } from './top-bar';

export const Main = observer(() => {
    const editorEngine = useEditorEngine();
    const { isProjectReady, error, readyState, hasPendingCreation } = useStartProject();
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

    if (!isProjectReady) {
        const heading = hasPendingCreation
            ? 'Getting ready to build your site'
            : 'Setting up your editor';
        const steps = hasPendingCreation
            ? [
                  { label: 'Starting your sandbox', ready: readyState.sandbox },
                  { label: 'Preparing the canvas', ready: readyState.canvas },
                  { label: 'Loading the AI chat', ready: readyState.conversations },
              ]
            : [
                  { label: 'Starting workspace', ready: readyState.sandbox },
                  { label: 'Preparing canvas', ready: readyState.canvas },
                  { label: 'Restoring chat', ready: readyState.conversations },
              ];
        return (
            <ProjectCreationLoader
                heading={heading}
                caption={
                    hasPendingCreation
                        ? 'We saved your prompt. The AI will start writing as soon as the editor is ready.'
                        : undefined
                }
                steps={steps}
            />
        );
    }

    if (isMobile) {
        return (
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
        );
    }

    const isPreview = editorEngine.state.editorMode === EditorMode.PREVIEW;
    // CODE mode is full-bleed: stretch the left-panel container to the AI
    // panel's left edge so the code editor takes the full viewport width minus
    // the (resizable, collapsible) right panel — VS-Code-like split.
    const isCode = editorEngine.state.editorMode === EditorMode.CODE;
    const isCms = editorEngine.state.editorMode === EditorMode.CMS;

    return (
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

                {/* Offline / sync banner. Visible only when the editor session
                    is offline or there are queued/dead-letter writes. */}
                <div className="pointer-events-none absolute top-16 right-4 z-50 max-w-xs">
                    <OfflineBanner />
                </div>

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
    );
});
