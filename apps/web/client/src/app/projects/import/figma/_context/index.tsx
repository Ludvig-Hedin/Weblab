'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api as convexApi } from '@convex/_generated/api';
import { useAction, useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';

import type { FigmaTopLevelFrame } from '@weblab/figma';

import type { Id } from '@convex/_generated/dataModel';
import { Routes } from '@/utils/constants';

export type FigmaImportStep = 0 | 1 | 2; // credentials | selectFrames | finalizing

interface FigmaImportContextValue {
    currentStep: FigmaImportStep;
    nextStep: () => Promise<void>;
    prevStep: () => void;

    fileUrl: string;
    setFileUrl: (v: string) => void;
    personalAccessToken: string;
    setPersonalAccessToken: (v: string) => void;
    isFetching: boolean;
    fetchError: string | null;
    fetchFile: () => Promise<void>;

    fileName: string;
    frames: FigmaTopLevelFrame[];
    selectedFrameIds: Set<string>;
    toggleFrame: (id: string) => void;
    selectAll: () => void;
    deselectAll: () => void;

    isFinalizing: boolean;
    finalizeProgress: FigmaFinalizeProgress;
    finalizeError: string | null;
    retry: () => void;
    cancel: () => void;
}

type FigmaFinalizePhase =
    | 'idle'
    | 'creating-sandbox'
    | 'uploading'
    | 'installing'
    | 'creating-project'
    | 'opening-editor';

interface FigmaFinalizeProgress {
    phase: FigmaFinalizePhase;
    filesUploaded: number;
    totalFiles: number;
}

const INITIAL_FINALIZE_PROGRESS: FigmaFinalizeProgress = {
    phase: 'idle',
    filesUploaded: 0,
    totalFiles: 0,
};

const FigmaImportContext = createContext<FigmaImportContextValue | null>(null);

export const FigmaImportProvider = ({ children }: { children: ReactNode }) => {
    const router = useRouter();

    const [currentStep, setCurrentStep] = useState<FigmaImportStep>(0);
    const [fileUrl, setFileUrl] = useState('');
    const [personalAccessToken, setPersonalAccessToken] = useState('');
    const [isFetching, setIsFetching] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [fileName, setFileName] = useState('');
    const [frames, setFrames] = useState<FigmaTopLevelFrame[]>([]);
    const [selectedFrameIds, setSelectedFrameIds] = useState<Set<string>>(new Set());
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [finalizeProgress, setFinalizeProgress] =
        useState<FigmaFinalizeProgress>(INITIAL_FINALIZE_PROGRESS);
    const [finalizeError, setFinalizeError] = useState<string | null>(null);

    const user = useQuery(convexApi.users.me, {});
    // Provisions a real Next.js sandbox, overlays the Figma-generated component
    // files, and inserts the project graph — all server-side. See
    // convex/projectActions.ts `createFromFigma` (mirrors createFromWebsiteClone).
    const createFromFigma = useAction(convexApi.projectActions.createFromFigma);
    const removeProjectMutation = useMutation(convexApi.projects.remove);
    const deleteProject = ({ id }: { id: string }) =>
        removeProjectMutation({ projectId: id as Id<'projects'> });
    const fetchFileMutation = useAction(convexApi.figmaActions.fetchFile);

    /**
     * Tracks the in-flight finalize so cancel() can abort and clean up an
     * already-created project (issue #9). The server action is atomic — it
     * either returns a committed projectId or throws after stopping its own
     * sandbox — so the client never has to clean up an orphan sandbox.
     */
    const abortController = useRef<AbortController | null>(null);
    const inFlightProjectId = useRef<string | null>(null);

    const fetchFile = async () => {
        if (!fileUrl.trim()) return;
        setIsFetching(true);
        setFetchError(null);
        try {
            const result = await fetchFileMutation({
                fileUrl: fileUrl.trim(),
                personalAccessToken: personalAccessToken.trim(),
            });
            setFileName(result.fileName);
            setFrames(result.frames);
            setSelectedFrameIds(new Set(result.frames.map((f) => f.id)));
            setCurrentStep(1);
        } catch (err: unknown) {
            setFetchError(err instanceof Error ? err.message : 'Failed to fetch file');
        } finally {
            setIsFetching(false);
        }
    };

    const toggleFrame = (id: string) => {
        setSelectedFrameIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAll = () => setSelectedFrameIds(new Set(frames.map((f) => f.id)));
    const deselectAll = () => setSelectedFrameIds(new Set());

    const doCreateProject = async () => {
        if (!user?._id) return;
        const selectedFrames = frames.filter((f) => selectedFrameIds.has(f.id));
        if (selectedFrames.length === 0) return;

        const controller = new AbortController();
        abortController.current = controller;
        inFlightProjectId.current = null;

        let didOpenEditor = false;

        setIsFinalizing(true);
        // The whole provision → file-overlay → project-graph chain runs inside a
        // single Convex action, so we can't surface per-file progress. Show the
        // bookend phases ('creating-sandbox' while the action runs, then
        // 'opening-editor') — the bar still animates meaningfully.
        setFinalizeProgress({
            phase: 'creating-sandbox',
            filesUploaded: 0,
            totalFiles: selectedFrames.length + 1,
        });
        setFinalizeError(null);
        try {
            const { projectId } = await createFromFigma({
                fileName,
                frames: selectedFrames.map((f) => ({
                    id: f.id,
                    name: f.name,
                    width: f.width,
                    height: f.height,
                    backgroundColor: f.backgroundColor,
                })),
            });

            // The user may have hit Cancel while the action was in flight. The
            // server already committed the project, so route it to cleanup.
            if (controller.signal.aborted) {
                void deleteProject({ id: projectId }).catch((err: any) => {
                    console.error('Failed to clean up project after cancelled import:', err);
                });
                return;
            }

            inFlightProjectId.current = projectId;
            setFinalizeProgress({
                phase: 'opening-editor',
                filesUploaded: selectedFrames.length + 1,
                totalFiles: selectedFrames.length + 1,
            });
            didOpenEditor = true;
            router.push(`${Routes.PROJECT}/${projectId}`);
        } catch (err: unknown) {
            // Surface the actual error rather than a generic fallback so
            // users see why the import failed (issue #40).
            const fallback =
                'Failed to create project. If this keeps happening, check your Figma credentials or try again.';
            const message = err instanceof Error ? err.message : fallback;
            setFinalizeError(message);
            inFlightProjectId.current = null;
        } finally {
            if (!didOpenEditor) {
                setIsFinalizing(false);
                setFinalizeProgress(INITIAL_FINALIZE_PROGRESS);
            }
            if (abortController.current === controller) {
                abortController.current = null;
            }
        }
    };

    const nextStep = async () => {
        if (currentStep === 0) {
            await fetchFile();
        } else if (currentStep === 1) {
            setCurrentStep(2);
            await doCreateProject();
        }
    };

    const prevStep = () => {
        if (currentStep === 0) {
            router.push(Routes.IMPORT_PROJECT);
        } else {
            setCurrentStep((s) => Math.max(0, s - 1) as FigmaImportStep);
        }
    };

    const retry = () => {
        setFinalizeError(null);
        void doCreateProject();
    };

    /**
     * Cancel an in-flight Figma import. Aborts the in-flight action, deletes any
     * project row that was already committed (the action is atomic, so there's
     * never an orphan sandbox to clean up here), and routes the user home
     * (issue #9).
     */
    const cancel = () => {
        const hadAbort = abortController.current !== null;
        abortController.current?.abort();

        const projectIdToClean = inFlightProjectId.current;
        if (projectIdToClean) {
            void deleteProject({ id: projectIdToClean }).catch((err: any) => {
                console.error('Failed to clean up orphan project on cancel:', err);
            });
        } else if (hadAbort) {
            toast.message('Import cancelled', {
                description: 'If a sandbox was created, it may take a moment to clean up.',
            });
        }

        inFlightProjectId.current = null;

        router.push(Routes.HOME);
    };

    return (
        <FigmaImportContext.Provider
            value={{
                currentStep,
                nextStep,
                prevStep,
                fileUrl,
                setFileUrl,
                personalAccessToken,
                setPersonalAccessToken,
                isFetching,
                fetchError,
                fetchFile,
                fileName,
                frames,
                selectedFrameIds,
                toggleFrame,
                selectAll,
                deselectAll,
                isFinalizing,
                finalizeProgress,
                finalizeError,
                retry,
                cancel,
            }}
        >
            {children}
        </FigmaImportContext.Provider>
    );
};

export const useFigmaImport = () => {
    const ctx = useContext(FigmaImportContext);
    if (!ctx) throw new Error('useFigmaImport must be used within FigmaImportProvider');
    return ctx;
};
