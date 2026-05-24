'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api as convexApi } from '@convex/_generated/api';
import { useAction, useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';

import type { FigmaTopLevelFrame } from '@weblab/figma';
import { CodeProvider, createCodeProviderClient } from '@weblab/code-provider';
import { SandboxTemplates, Templates } from '@weblab/constants';
import { scaffoldAppPage, scaffoldFrameComponent, toComponentName } from '@weblab/figma';

import type { ProcessedFile } from '@/app/projects/types';
import type { Id } from '@convex/_generated/dataModel';
import { ProcessedFileType } from '@/app/projects/types';
import { Routes } from '@/utils/constants';
import { uploadToSandbox } from '../../local/_context';

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
    // TODO(sandbox-port): port api.sandbox.* — no Convex equivalents yet (fork, startOrphan,
    // deleteOrphan, orphanBulkUpload). Replaced with stubs that throw so the
    // import flow surfaces a clear error instead of silently doing nothing.
    const forkSandbox = async (
        _args: unknown,
    ): Promise<{
        sandboxId: string;
        previewUrl: string;
        sandboxRuntime: {
            provider: 'code_sandbox' | 'vercel_sandbox';
            snapshotId?: string;
            port?: number;
            devCommand?: string;
            runtime?: string;
        };
    }> => {
        throw new Error(
            'Sandbox provisioning is temporarily unavailable while the sandbox service is migrated.',
        );
    };
    const startOrphanSandbox = async (_args: unknown): Promise<unknown> => {
        throw new Error(
            'Sandbox start is temporarily unavailable while the sandbox service is migrated.',
        );
    };
    const deleteOrphanSandbox = async (_args: unknown): Promise<void> => {
        // No-op: the sandbox endpoint is gone, so there's nothing to clean up.
    };
    const orphanBulkUpload = async (_args: unknown): Promise<void> => {
        throw new Error(
            'Sandbox upload is temporarily unavailable while the sandbox service is migrated.',
        );
    };
    const createProjectMutation = useMutation(convexApi.projects.create);
    const removeProjectMutation = useMutation(convexApi.projects.remove);
    const createProject = (args: Parameters<typeof createProjectMutation>[0]) =>
        createProjectMutation(args);
    const deleteProject = ({ id }: { id: string }) =>
        removeProjectMutation({ projectId: id as Id<'projects'> });
    const fetchFileMutation = useAction(convexApi.figmaActions.fetchFile);

    /**
     * Tracks the in-flight finalize so cancel() can abort and clean up any
     * sandbox/project that's already been created (issue #9).
     */
    const abortController = useRef<AbortController | null>(null);
    const inFlightSandboxId = useRef<string | null>(null);
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
        inFlightSandboxId.current = null;
        inFlightProjectId.current = null;

        const checkAborted = () => {
            if (controller.signal.aborted) {
                throw new DOMException('Import cancelled', 'AbortError');
            }
        };
        let didOpenEditor = false;

        setIsFinalizing(true);
        setFinalizeProgress({
            phase: 'creating-sandbox',
            filesUploaded: 0,
            totalFiles: selectedFrames.length + 1,
        });
        setFinalizeError(null);
        try {
            const template = SandboxTemplates[Templates.BLANK];
            const forkedSandbox = await forkSandbox({
                sandbox: template,
                // No hardcoded provider — server uses configured WEBLAB_CLOUD_PROVIDER.
                config: {
                    title: `Figma import – ${fileName}`,
                    tags: ['figma', 'imported', user._id],
                },
            });
            inFlightSandboxId.current = forkedSandbox.sandboxId;
            checkAborted();

            const usedNames = new Set<string>();
            const dedupedFrames = selectedFrames.map((frame) => {
                const baseName = toComponentName(frame.name);
                let uniqueName = baseName;
                let counter = 2;
                while (usedNames.has(uniqueName)) {
                    uniqueName = `${baseName}${counter}`;
                    counter++;
                }
                usedNames.add(uniqueName);
                return { ...frame, name: uniqueName };
            });

            const files: ProcessedFile[] = [
                ...dedupedFrames.map((frame) => ({
                    path: `src/components/${toComponentName(frame.name)}.tsx`,
                    content: scaffoldFrameComponent(frame),
                    type: ProcessedFileType.TEXT as const,
                })),
                {
                    path: 'src/app/page.tsx',
                    content: scaffoldAppPage(dedupedFrames),
                    type: ProcessedFileType.TEXT as const,
                },
            ];

            if (forkedSandbox.sandboxRuntime.provider === 'vercel_sandbox') {
                // Vercel Sandbox SDK is server-only — upload via tRPC.
                setFinalizeProgress({
                    phase: 'uploading',
                    filesUploaded: 0,
                    totalFiles: files.length,
                });
                await orphanBulkUpload({
                    sandboxId: forkedSandbox.sandboxId,
                    files: files.map((f) => ({
                        path: f.path,
                        content: f.content as string,
                    })),
                    runSetup: true,
                });
                setFinalizeProgress({
                    phase: 'installing',
                    filesUploaded: files.length,
                    totalFiles: files.length,
                });
            } else {
                // CodeSandbox: browser WebSocket upload. Use startOrphan (not
                // start) — no branch row exists until project.create below.
                const provider = await createCodeProviderClient(CodeProvider.CodeSandbox, {
                    providerOptions: {
                        codesandbox: {
                            sandboxId: forkedSandbox.sandboxId,
                            userId: user._id,
                            initClient: true,
                            keepActiveWhileConnected: false,
                            getSession: async (sandboxId) =>
                                startOrphanSandbox({ sandboxId, provider: 'code_sandbox' }),
                        },
                    },
                });

                try {
                    setFinalizeProgress({
                        phase: 'uploading',
                        filesUploaded: 0,
                        totalFiles: files.length,
                    });
                    await uploadToSandbox(files, provider, {
                        onProgress: ({ uploaded, total }) =>
                            setFinalizeProgress({
                                phase: 'uploading',
                                filesUploaded: uploaded,
                                totalFiles: total,
                            }),
                    });
                    checkAborted();
                    setFinalizeProgress({
                        phase: 'installing',
                        filesUploaded: files.length,
                        totalFiles: files.length,
                    });
                    await provider.setup({});
                } finally {
                    await provider.destroy();
                }
            }
            checkAborted();

            setFinalizeProgress({
                phase: 'creating-project',
                filesUploaded: files.length,
                totalFiles: files.length,
            });
            const project = await createProject({
                name: fileName || 'Figma Import',
                description: `Imported from Figma: ${fileName}`,
                sandboxId: forkedSandbox.sandboxId,
                sandboxUrl: forkedSandbox.previewUrl,
                sandboxRuntime: forkedSandbox.sandboxRuntime,
                framework: 'nextjs',
            });

            if (!project) throw new Error('Failed to create project');
            inFlightProjectId.current = project._id;
            setFinalizeProgress({
                phase: 'opening-editor',
                filesUploaded: files.length,
                totalFiles: files.length,
            });
            didOpenEditor = true;
            router.push(`${Routes.PROJECT}/${project._id}`);
        } catch (err: unknown) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                return;
            }
            // Surface the actual error rather than a generic fallback so
            // users see why the import failed (issue #40).
            const fallback =
                'Failed to create project. If this keeps happening, check your Figma credentials or try again.';
            const message = err instanceof Error ? err.message : fallback;
            setFinalizeError(message);
            if (inFlightSandboxId.current && !inFlightProjectId.current) {
                await deleteOrphanSandbox({
                    sandboxId: inFlightSandboxId.current,
                }).catch((cleanupError: any) => {
                    console.warn('Failed to clean up orphan sandbox after Figma import error:', {
                        sandboxId: inFlightSandboxId.current,
                        error:
                            cleanupError instanceof Error
                                ? cleanupError.message
                                : String(cleanupError),
                    });
                });
            }
            inFlightSandboxId.current = null;
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
     * Cancel an in-flight Figma import. Aborts the active mutation chain,
     * deletes any orphan project row that was already inserted, and routes
     * the user home (issue #9).
     */
    const cancel = () => {
        const hadAbort = abortController.current !== null;
        abortController.current?.abort();

        const projectIdToClean = inFlightProjectId.current;
        const sandboxCreated = inFlightSandboxId.current !== null;

        if (projectIdToClean) {
            void deleteProject({ id: projectIdToClean }).catch((err: any) => {
                console.error('Failed to clean up orphan project on cancel:', err);
            });
        } else if (sandboxCreated) {
            const sandboxIdToClean = inFlightSandboxId.current;
            if (sandboxIdToClean) {
                void deleteOrphanSandbox({ sandboxId: sandboxIdToClean }).catch((err: any) => {
                    console.error('Failed to clean up orphan sandbox on cancel:', err);
                });
            }
            toast.message('Import cancelled', {
                description: 'If a sandbox was created, it may take a moment to clean up.',
            });
        } else if (hadAbort) {
            toast.message('Import cancelled');
        }

        inFlightSandboxId.current = null;
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
