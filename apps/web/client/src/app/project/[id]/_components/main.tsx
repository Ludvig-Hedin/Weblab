'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { EditorAttributes } from '@weblab/constants';
import { EditorMode } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';
import { TooltipProvider } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { SubscriptionModal } from '@/components/ui/pricing-modal';
import { SettingsModalWithProjects } from '@/components/ui/settings-modal/with-project';
import { usePanelMeasurements } from '../_hooks/use-panel-measure';
import { useStartProject } from '../_hooks/use-start-project';
import { BottomBar } from './bottom-bar';
import { Canvas } from './canvas';
import { EditorBar } from './editor-bar';
import { ElementPalette } from './element-palette';
import { KeyboardShortcutsModal } from './keyboard-shortcuts-modal';
import { LeftPanel } from './left-panel';
import { MobileLayout } from './mobile-layout';
import { ProjectLoadError } from './project-load-error';
import { RightPanel } from './right-panel';
import { TopBar } from './top-bar';

export const Main = observer(() => {
    const editorEngine = useEditorEngine();
    const { isProjectReady, error, readyState } = useStartProject();
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
        const steps: { label: string; ready: boolean }[] = [
            { label: 'Starting workspace', ready: readyState.sandbox },
            { label: 'Preparing canvas', ready: readyState.canvas },
            { label: 'Restoring chat', ready: readyState.conversations },
        ];
        return (
            <div className="bg-background flex h-screen w-screen items-center justify-center">
                <div className="flex min-w-[260px] flex-col items-center gap-5">
                    <div className="flex items-center gap-2.5">
                        <Icons.LoadingSpinner className="text-foreground-primary h-5 w-5 animate-spin" />
                        <div className="text-title3 text-foreground-primary">
                            Setting up your editor
                        </div>
                    </div>
                    <ul className="text-foreground-tertiary text-small flex w-full flex-col gap-1.5">
                        {steps.map((step) => (
                            <li key={step.label} className="flex items-center gap-2">
                                {step.ready ? (
                                    <Icons.CheckCircled className="text-foreground-positive h-4 w-4" />
                                ) : (
                                    <Icons.LoadingSpinner className="text-foreground-quadranary h-4 w-4 animate-spin" />
                                )}
                                <span
                                    className={
                                        step.ready
                                            ? 'text-foreground-primary'
                                            : 'text-foreground-tertiary'
                                    }
                                >
                                    {step.label}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
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
            </TooltipProvider>
        );
    }

    return (
        <TooltipProvider>
            <div className="relative flex h-screen w-screen flex-row overflow-hidden select-none">
                <Canvas />

                <div className="absolute top-0 w-full">
                    <TopBar />
                </div>

                {/* Left Panel */}
                <div ref={leftPanelRef} className="absolute top-10 left-0 z-50 h-[calc(100%-40px)]">
                    <LeftPanel />
                </div>
                {/* EditorBar anchored between panels */}
                <div
                    className="absolute top-10 z-49"
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
                    className={cn(
                        'absolute top-10 right-0 z-50 h-[calc(100%-40px)]',
                        editorEngine.state.editorMode === EditorMode.PREVIEW && 'hidden',
                    )}
                >
                    <RightPanel />
                </div>

                <BottomBar />
            </div>
            <SettingsModalWithProjects />
            <SubscriptionModal />
            <KeyboardShortcutsModal />
            <ElementPalette />
        </TooltipProvider>
    );
});
