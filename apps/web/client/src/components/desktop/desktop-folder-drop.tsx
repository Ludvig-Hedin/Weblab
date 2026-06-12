'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Icons } from '@weblab/ui/icons';

import { useOpenLocalProject } from '@/hooks/use-open-local-project';

// Subset of the desktop preload bridge (apps/desktop/preload.js) this component
// uses. Present only in the Weblab desktop app on an app origin.
interface DropBridge {
    getPathForDroppedFile?: (file: File) => string | null;
    onOpenFolder?: (listener: (payload: { rootPath: string }) => void) => () => void;
    signalReady?: () => void;
}

function getDropBridge(): DropBridge | undefined {
    if (typeof window === 'undefined') return undefined;
    return (window as unknown as { weblabNative?: DropBridge }).weblabNative;
}

function dragHasFiles(e: DragEvent): boolean {
    return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

/**
 * Desktop-only. Lets the user open a folder as a Weblab project by:
 *  - dragging it into the app window (shows a drop overlay), or
 *  - dropping it on the dock icon / "Open With Weblab" (main-process `open-file`,
 *    delivered here via the `weblab:open-folder` IPC).
 *
 * Both routes funnel into `openLocalFolderAtPath` from `useOpenLocalProject`,
 * which opens an existing folder or scaffolds a starter into an empty one.
 * Mounted app-wide so a drop works from any route. No-ops on web.
 */
export function DesktopFolderDrop() {
    const { openLocalFolderAtPath, isDesktop, isAuthed } = useOpenLocalProject();

    // Keep a fresh reference so the window/IPC listeners (attached once) always
    // call the latest closure — it captures the current create `phase` for its
    // in-flight guard.
    const openAtPathRef = useRef(openLocalFolderAtPath);
    openAtPathRef.current = openLocalFolderAtPath;

    const [dragging, setDragging] = useState(false);

    // Subscribe to dock-drop / "Open With" deliveries (main → renderer).
    useEffect(() => {
        const bridge = getDropBridge();
        if (!bridge?.onOpenFolder) return;
        const unsub = bridge.onOpenFolder((payload) => {
            if (payload?.rootPath) void openAtPathRef.current(payload.rootPath);
        });
        return unsub;
    }, []);

    // Tell main we're ready to receive — but only once signed in, so a folder
    // dropped on the dock during a cold launch stays queued in main until the
    // user can actually create a project (createLocal needs auth), then opens.
    useEffect(() => {
        if (!isAuthed) return;
        getDropBridge()?.signalReady?.();
    }, [isAuthed]);

    // Window-level drag detection to reveal the overlay. The overlay itself
    // (rendered below, pointer-events enabled) handles the actual drop so it
    // also captures drops over child iframes (e.g. the editor canvas).
    useEffect(() => {
        const bridge = getDropBridge();
        if (!bridge?.getPathForDroppedFile) return;

        const onEnter = (e: DragEvent) => {
            if (dragHasFiles(e)) {
                e.preventDefault();
                setDragging(true);
            }
        };
        const onOver = (e: DragEvent) => {
            if (dragHasFiles(e)) e.preventDefault();
        };
        const onLeave = (e: DragEvent) => {
            // relatedTarget is null when the cursor leaves the window entirely.
            if (e.relatedTarget == null) setDragging(false);
        };
        const onDrop = (e: DragEvent) => {
            // Always swallow stray drops so Electron never navigates to a file.
            e.preventDefault();
            setDragging(false);
        };

        window.addEventListener('dragenter', onEnter);
        window.addEventListener('dragover', onOver);
        window.addEventListener('dragleave', onLeave);
        window.addEventListener('drop', onDrop);
        return () => {
            window.removeEventListener('dragenter', onEnter);
            window.removeEventListener('dragover', onOver);
            window.removeEventListener('dragleave', onLeave);
            window.removeEventListener('drop', onDrop);
        };
    }, []);

    if (!isDesktop) return null;

    const handleOverlayDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);

        const bridge = getDropBridge();
        if (!bridge?.getPathForDroppedFile) return;

        // Find the first dropped item that is a directory. webkitGetAsEntry +
        // getAsFile must be read synchronously while the drop event is live.
        let dirFile: File | null = null;
        const items = e.dataTransfer?.items;
        if (items) {
            for (const item of Array.from(items)) {
                if (item.kind !== 'file') continue;
                const entry = item.webkitGetAsEntry?.();
                if (entry?.isDirectory) {
                    dirFile = item.getAsFile();
                    break;
                }
            }
        }

        if (!dirFile) {
            toast.error('Drop a folder, not a file.');
            return;
        }
        const rootPath = bridge.getPathForDroppedFile(dirFile);
        if (!rootPath) {
            toast.error('Could not read that folder.');
            return;
        }
        void openAtPathRef.current(rootPath);
    };

    if (!dragging) return null;

    return (
        <div
            className="desktop-no-drag bg-background/70 fixed inset-0 z-[9999] flex items-center justify-center backdrop-blur-sm"
            onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            }}
            onDragLeave={(e) => {
                if (e.relatedTarget == null) setDragging(false);
            }}
            onDrop={handleOverlayDrop}
        >
            <div className="border-foreground/20 bg-background/80 text-foreground pointer-events-none flex flex-col items-center gap-3 rounded-2xl border border-dashed px-10 py-8">
                <Icons.Directory className="h-7 w-7" />
                <div className="text-center">
                    <div className="text-sm font-medium">Drop a folder to open it in Weblab</div>
                    <div className="text-foreground-tertiary mt-1 text-xs">
                        An empty folder starts a new project.
                    </div>
                </div>
            </div>
        </div>
    );
}
