'use client';

import { api } from '@/trpc/react';
import { Routes } from '@/utils/constants';
import type { ProcessedFile } from '@/app/projects/types';
import { ProcessedFileType } from '@/app/projects/types';
import { uploadToSandbox } from '../../local/_context';
import { SandboxTemplates, Templates } from '@weblab/constants';
import type { FigmaTopLevelFrame } from '@weblab/figma';
import { scaffoldAppPage, scaffoldFrameComponent, toComponentName } from '@weblab/figma';
import { CodeProvider, createCodeProviderClient } from '@weblab/code-provider';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export type FigmaImportStep = 0 | 1 | 2; // credentials | selectFrames | finalizing

interface FigmaImportContextValue {
    currentStep: FigmaImportStep;
    nextStep: () => void;
    prevStep: () => void;

    fileUrl: string;
    setFileUrl: (v: string) => void;
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
    const { mutateAsync: fetchFileMutation } = api.figma.fetchFile.useMutation();

    const fetchFile = async () => {
        if (!fileUrl.trim()) return;
        setIsFetching(true);
        setFetchError(null);
        try {
            const result = await fetchFileMutation({
                fileUrl: fileUrl.trim(),
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
                await provider.setup({});
            } finally {
                await provider.destroy();
            }

            const project = await createProject({
                project: {
                    name: fileName || 'Figma Import',
                    description: `Imported from Figma: ${fileName}`,
                },
                sandboxId: forkedSandbox.sandboxId,
                sandboxUrl: forkedSandbox.previewUrl,
                userId: user.id,
            });

            if (!project) throw new Error('Failed to create project');
            router.push(`${Routes.PROJECT}/${project.id}`);
        } catch (err) {
            setFinalizeError(err instanceof Error ? err.message : 'Failed to create project');
        } finally {
            setIsFinalizing(false);
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

    const cancel = () => router.push(Routes.IMPORT_PROJECT);

    return (
        <FigmaImportContext.Provider
            value={{
                currentStep,
                nextStep,
                prevStep,
                fileUrl,
                setFileUrl,
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
