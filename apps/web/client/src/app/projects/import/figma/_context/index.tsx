'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TRPCClientError } from '@trpc/client';
import { toast } from 'sonner';

import type { FigmaTopLevelFrame } from '@weblab/figma';
import { CodeProvider, createCodeProviderClient } from '@weblab/code-provider';
import { SandboxTemplates, Templates } from '@weblab/constants';
import { scaffoldAppPage, scaffoldFrameComponent, toComponentName } from '@weblab/figma';

import type { ProcessedFile } from '@/app/projects/types';
import { ProcessedFileType } from '@/app/projects/types';
import { api } from '@/trpc/react';
import { Routes } from '@/utils/constants';
import { uploadToSandbox } from '../../local/_context';

export type FigmaImportStep = 0 | 1 | 2; // credentials | selectFrames | finalizing

interface FigmaImportContextValue {
    currentStep: FigmaImportStep;
    nextStep: () => void;
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
    finalizeError: string | null;
    retry: () => void;
    cancel: () => void;
}

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
    const [finalizeError, setFinalizeError] = useState<string | null>(null);

    const { data: user } = api.user.get.useQuery();
    const { mutateAsync: forkSandbox } = api.sandbox.fork.useMutation();
    const { mutateAsync: startSandbox } = api.sandbox.start.useMutation();
    const { mutateAsync: createProject } = api.project.create.useMutation();
    const { mutateAsync: deleteProject } = api.project.delete.useMutation();
    const { mutateAsync: fetchFileMutation } = api.figma.fetchFile.useMutation();

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
        } catch (err) {
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
        if (!user?.id) return;
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

        setIsFinalizing(true);
        setFinalizeError(null);
        try {
            const template = SandboxTemplates[Templates.BLANK];
            const forkedSandbox = await forkSandbox({
                sandbox: template,
                config: {
                    title: `Figma import – ${fileName}`,
                    tags: ['figma', 'imported', user.id],
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

            const provider = await createCodeProviderClient(CodeProvider.CodeSandbox, {
                providerOptions: {
                    codesandbox: {
                        sandboxId: forkedSandbox.sandboxId,
                        userId: user.id,
                        initClient: true,
                        keepActiveWhileConnected: false,
                        getSession: async (sandboxId) => startSandbox({ sandboxId }),
                    },
                },
            });

            try {
                await uploadToSandbox(files, provider);
                checkAborted();
                await provider.setup({});
            } finally {
                await provider.destroy();
            }
            checkAborted();

            const project = await createProject({
                project: {
                    name: fileName || 'Figma Import',
                    description: `Imported from Figma: ${fileName}`,
                    // Figma scaffolding writes a Next.js src/app/page.tsx, so
                    // hint the framework upfront to avoid the preload-injector
                    // race on first load.
                    runtimeMetadata: { framework: 'nextjs' },
                },
                sandboxId: forkedSandbox.sandboxId,
                sandboxUrl: forkedSandbox.previewUrl,
            });

            if (!project) throw new Error('Failed to create project');
            inFlightProjectId.current = project.id;
            router.push(`${Routes.PROJECT}/${project.id}`);
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                return;
            }
            // Surface the actual tRPC error rather than a generic fallback so
            // users see why the import failed (issue #40).
            const fallback =
                'Failed to create project. If this keeps happening, check your Figma credentials or try again.';
            const message =
                err instanceof TRPCClientError
                    ? err.message
                    : err instanceof Error
                      ? err.message
                      : fallback;
            setFinalizeError(message);
        } finally {
            setIsFinalizing(false);
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
            void deleteProject({ id: projectIdToClean }).catch((err) => {
                console.error('Failed to clean up orphan project on cancel:', err);
            });
        } else if (sandboxCreated) {
            // TODO: If sandbox forking succeeds but project creation fails, the forked
            // sandbox is leaked. A server-side cleanup job (or idempotent creation) is
            // needed to handle this. Until then, creation errors may leave orphaned sandboxes.
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
