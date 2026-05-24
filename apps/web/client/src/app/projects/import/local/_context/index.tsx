'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api as convexApi } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';

import type { Provider } from '@weblab/code-provider';
import type { FrameworkId, ProjectFile } from '@weblab/framework';
import { CodeProvider, createCodeProviderClient } from '@weblab/code-provider';
import { SandboxTemplates, Templates } from '@weblab/constants';
import { detectFrameworkFromFiles, getFrameworkAdapter } from '@weblab/framework';

import type { NextJsProjectValidation, ProcessedFile } from '@/app/projects/types';
import type { Id } from '@convex/_generated/dataModel';
import { ProcessedFileType } from '@/app/projects/types';
import { env } from '@/env';
import { Routes } from '@/utils/constants';

export interface Project {
    name: string;
    folderPath: string;
    files: ProcessedFile[];
}

interface ProjectCreationContextValue {
    // State
    currentStep: number;
    projectData: Partial<Project>;
    direction: number;
    isFinalizing: boolean;
    finalizeProgress: ImportFinalizeProgress;
    totalSteps: number;

    // Framework
    framework: FrameworkId;
    setFramework: (id: FrameworkId) => void;
    isMultiFrameworkEnabled: boolean;
    /** Run every adapter against `files` and update `framework` to the first match. */
    autoDetectFramework: (files: ProcessedFile[]) => Promise<void>;

    // Actions
    error: string | null;
    setProjectData: (newData: Partial<Project>) => void;
    nextStep: () => void;
    prevStep: () => void;
    setCurrentStep: (step: number) => void;
    setDirection: (direction: number) => void;
    resetProjectData: () => void;
    retry: () => void;
    cancel: () => void;
    validateNextJsProject: (files: ProcessedFile[]) => Promise<NextJsProjectValidation>;
}

export type ImportFinalizePhase =
    | 'idle'
    | 'creating-sandbox'
    | 'uploading'
    | 'installing'
    | 'creating-project'
    | 'opening-editor';

export interface ImportFinalizeProgress {
    phase: ImportFinalizePhase;
    filesUploaded: number;
    totalFiles: number;
}

const INITIAL_FINALIZE_PROGRESS: ImportFinalizeProgress = {
    phase: 'idle',
    filesUploaded: 0,
    totalFiles: 0,
};

const ProjectCreationContext = createContext<ProjectCreationContextValue | undefined>(undefined);

export function detectPortFromPackageJson(packageJsonFile: ProcessedFile | undefined): number {
    const defaultPort = 3000;

    if (
        !packageJsonFile ||
        typeof packageJsonFile.content !== 'string' ||
        packageJsonFile.type !== ProcessedFileType.TEXT
    ) {
        return defaultPort;
    }

    try {
        const pkg = JSON.parse(packageJsonFile.content) as Record<string, unknown>;
        const scripts = pkg.scripts as Record<string, string> | undefined;
        const devScript = scripts?.dev;

        if (!devScript || typeof devScript !== 'string') {
            return defaultPort;
        }

        const portRegex = /(?:PORT=|--port[=\s]|-p\s*?)(\d+)/;
        const portMatch = portRegex.exec(devScript);

        if (portMatch?.[1]) {
            const port = parseInt(portMatch[1], 10);
            if (port > 0 && port <= 65535) {
                return port;
            }
        }

        return defaultPort;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn('Failed to parse package.json for port detection:', errorMessage);
        return defaultPort;
    }
}

interface ProjectCreationProviderProps {
    children: ReactNode;
    totalSteps: number;
}

export const ProjectCreationProvider = ({ children, totalSteps }: ProjectCreationProviderProps) => {
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState(0);
    const [projectData, setProjectDataState] = useState<Partial<Project>>({
        name: '',
        folderPath: '',
        files: [],
    });
    const [error, setError] = useState<string | null>(null);
    const [direction, setDirection] = useState(0);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [finalizeProgress, setFinalizeProgress] =
        useState<ImportFinalizeProgress>(INITIAL_FINALIZE_PROGRESS);
    const [framework, setFramework] = useState<FrameworkId>('nextjs');
    const isMultiFrameworkEnabled = env.NEXT_PUBLIC_MULTI_FRAMEWORK_ENABLED;
    const user = useQuery(convexApi.users.me, {});
    const createProject = useMutation(convexApi.projects.create);
    const removeProjectMutation = useMutation(convexApi.projects.remove);
    const deleteProject = ({ id }: { id: string }) =>
        removeProjectMutation({ projectId: id as Id<'projects'> });
    // TODO(sandbox-port): api.sandbox.* has no Convex equivalent yet — all
    // sandbox calls throw a clear error until the routes are ported.
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
        throw new Error('Local import is temporarily unavailable.');
    };
    const startOrphanSandbox = async (_args: unknown): Promise<never> => {
        throw new Error('Local import is temporarily unavailable.');
    };
    const deleteOrphanSandbox = async (_args: unknown): Promise<void> => {
        // No-op: sandbox cleanup is unavailable until api.sandbox.* ports.
    };
    const orphanBulkUpload = async (_args: unknown): Promise<void> => {
        throw new Error('Local import is temporarily unavailable.');
    };

    /**
     * Tracks the in-flight finalize so cancel() can abort the chain and clean
     * up any orphan sandbox/project that's already been provisioned (issue #9).
     */
    const abortController = useRef<AbortController | null>(null);
    const inFlightSandboxId = useRef<string | null>(null);
    const inFlightProjectId = useRef<string | null>(null);

    const setProjectData = (newData: Partial<Project>) => {
        setProjectDataState((prevData) => ({ ...prevData, ...newData }));
    };

    const finalizeProject = async () => {
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
        let provider: Provider | null = null;

        try {
            setIsFinalizing(true);
            setFinalizeProgress({
                phase: 'creating-sandbox',
                filesUploaded: 0,
                totalFiles: projectData.files?.length ?? 0,
            });
            setError(null);

            if (!user?._id) {
                setError('Sign in again before importing this project.');
                return;
            }
            if (!projectData.files?.length) {
                setError('Select a project folder before finishing setup.');
                return;
            }

            const packageJsonFile = projectData.files.find(
                (f) => f.path.endsWith('package.json') && f.type === ProcessedFileType.TEXT,
            );

            checkAborted();
            const template = SandboxTemplates[Templates.BLANK];
            const forkedSandbox = await forkSandbox({
                sandbox: {
                    id: template.id,
                    port: detectPortFromPackageJson(packageJsonFile),
                },
                // No hardcoded provider — server uses configured WEBLAB_CLOUD_PROVIDER.
                config: {
                    title: `Imported project - ${user._id}`,
                    tags: ['imported', 'local', user._id],
                },
            });
            inFlightSandboxId.current = forkedSandbox.sandboxId;
            checkAborted();

            if (forkedSandbox.sandboxRuntime.provider === 'vercel_sandbox') {
                // Vercel Sandbox SDK is server-only — upload via tRPC.
                setFinalizeProgress({
                    phase: 'uploading',
                    filesUploaded: 0,
                    totalFiles: projectData.files.length,
                });
                await orphanBulkUpload({
                    sandboxId: forkedSandbox.sandboxId,
                    files: projectData.files.map((f) => ({
                        path: f.path,
                        content:
                            f.type === ProcessedFileType.BINARY
                                ? Array.from(new Uint8Array(f.content))
                                : f.content,
                    })),
                    runSetup: true,
                });
                setFinalizeProgress({
                    phase: 'installing',
                    filesUploaded: projectData.files.length,
                    totalFiles: projectData.files.length,
                });
            } else {
                // CodeSandbox: browser WebSocket upload. Use startOrphan (not
                // start) — no branch row exists until project.create below.
                provider = await createCodeProviderClient(CodeProvider.CodeSandbox, {
                    providerOptions: {
                        codesandbox: {
                            sandboxId: forkedSandbox.sandboxId,
                            userId: user._id,
                            initClient: true,
                            keepActiveWhileConnected: false,
                            getSession: async (sandboxId) => {
                                return startOrphanSandbox({
                                    sandboxId,
                                    provider: 'code_sandbox',
                                });
                            },
                        },
                    },
                });

                try {
                    setFinalizeProgress({
                        phase: 'uploading',
                        filesUploaded: 0,
                        totalFiles: projectData.files.length,
                    });
                    await uploadToSandbox(projectData.files, provider, {
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
                        filesUploaded: projectData.files.length,
                        totalFiles: projectData.files.length,
                    });
                    await provider.setup({});
                } finally {
                    await provider.destroy();
                    provider = null;
                }
            }
            checkAborted();

            setFinalizeProgress({
                phase: 'creating-project',
                filesUploaded: projectData.files.length,
                totalFiles: projectData.files.length,
            });
            const project = await createProject({
                name: projectData.name ?? 'New project',
                description: 'Your new project',
                sandboxId: forkedSandbox.sandboxId,
                sandboxUrl: forkedSandbox.previewUrl,
                sandboxRuntime: forkedSandbox.sandboxRuntime,
                framework,
            });
            if (!project) {
                setError('Project setup finished, but the project could not be created.');
                return;
            }
            inFlightProjectId.current = project._id;
            setFinalizeProgress({
                phase: 'opening-editor',
                filesUploaded: projectData.files.length,
                totalFiles: projectData.files.length,
            });
            // Open the project
            didOpenEditor = true;
            router.push(`${Routes.PROJECT}/${project._id}`);
        } catch (error: unknown) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                // cancel() will already have surfaced its own toast.
                return;
            }
            console.error('Error creating project:', error);
            setError('Failed to create project');
            if (inFlightSandboxId.current && !inFlightProjectId.current) {
                await deleteOrphanSandbox({
                    sandboxId: inFlightSandboxId.current,
                }).catch((cleanupError: any) => {
                    console.warn('Failed to clean up orphan sandbox after import error:', {
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
            return;
        } finally {
            if (provider) {
                await provider.destroy().catch((destroyError) => {
                    console.warn('Failed to destroy import provider:', destroyError);
                });
            }
            if (!didOpenEditor) {
                setIsFinalizing(false);
                setFinalizeProgress(INITIAL_FINALIZE_PROGRESS);
            }
            if (abortController.current === controller) {
                abortController.current = null;
            }
        }
    };

    /**
     * Convert the importer's ProcessedFile[] to the framework adapter's
     * ProjectFiles shape: text files keep their string content; binary files
     * surface as `null` content so adapters can still see the path (e.g. to
     * detect images) but won't try to parse them.
     */
    const toProjectFiles = (files: ProcessedFile[]): ProjectFile[] =>
        files.map((f) => ({
            path: f.path,
            content: f.type === ProcessedFileType.TEXT ? f.content : null,
        }));

    /**
     * Try every registered adapter against the uploaded files and update the
     * picker selection to the first one that recognizes them. Called
     * opportunistically on upload so users don't have to manually pick a
     * framework — the picker becomes an override, not a required step.
     *
     * Skips when no adapter matches (silent: the picker stays visible if the
     * flag is on, and the existing default ('nextjs') keeps the import flow
     * working).
     */
    const autoDetectFramework = async (files: ProcessedFile[]): Promise<void> => {
        try {
            const detected = await detectFrameworkFromFiles(toProjectFiles(files));
            if (detected) setFramework(detected);
        } catch (err: unknown) {
            // Detection failures are non-fatal — log for diagnostics and
            // leave the picker at its current value.
            console.warn('[import] framework auto-detection failed', err);
        }
    };

    /**
     * Validates the imported folder against the picked framework's adapter.
     * Kept under the historical name `validateNextJsProject` so existing
     * callers don't churn — the function is now framework-aware and dispatches
     * via `getFrameworkAdapter(framework).validate(...)`. The Next.js adapter
     * preserves the original validation rules; static-html only requires an
     * `index.html` at the root.
     */
    const validateNextJsProject = async (
        files: ProcessedFile[],
    ): Promise<NextJsProjectValidation> => {
        const adapter = getFrameworkAdapter(framework);
        const result = await adapter.validate(toProjectFiles(files));
        if (!result.isValid) {
            return { isValid: false, error: result.error };
        }
        // Adapter returns RouterType (enum) | undefined directly — the
        // verify screen and downstream consumers accept the same literal
        // ('app' | 'pages') values.
        return {
            isValid: true,
            routerType: result.routerType,
        };
    };

    const nextStep = () => {
        if (currentStep < totalSteps - 2) {
            // -2 because we have 2 final steps
            setDirection(1);
            setCurrentStep((prev) => prev + 1);
        } else {
            // This is the final step, so we should finalize the project
            setCurrentStep((prev) => prev + 1);
            void finalizeProject();
        }
    };

    const prevStep = () => {
        if (currentStep === 0) {
            resetProjectData();
            return;
        }
        setDirection(-1);
        setCurrentStep((prev) => prev - 1);
    };

    const resetProjectData = () => {
        setProjectData({
            folderPath: undefined,
            name: undefined,
            files: undefined,
        });
        setCurrentStep(0);
        setError(null);
    };

    const retry = () => {
        setError(null);
        void finalizeProject();
    };

    /**
     * Cancel the in-flight import. Aborts the active mutation chain via the
     * AbortController, deletes any orphan project row that was already
     * inserted, and routes the user home. If a sandbox was created but the
     * project row wasn't, surfaces a toast (no client-side sandbox delete RPC).
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

        resetProjectData();
        router.push(Routes.HOME);
    };

    const value: ProjectCreationContextValue = {
        currentStep,
        projectData,
        direction,
        isFinalizing,
        finalizeProgress,
        totalSteps,
        framework,
        setFramework,
        isMultiFrameworkEnabled,
        autoDetectFramework,
        error,
        setProjectData,
        nextStep,
        prevStep,
        setCurrentStep,
        setDirection,
        resetProjectData,
        retry,
        cancel,
        validateNextJsProject,
    };

    return (
        <ProjectCreationContext.Provider value={value}>{children}</ProjectCreationContext.Provider>
    );
};

export const useProjectCreation = (): ProjectCreationContextValue => {
    const context = useContext(ProjectCreationContext);
    if (context === undefined) {
        throw new Error('useProjectCreation must be used within a ProjectCreationProvider');
    }
    return context;
};

export const uploadToSandbox = async (
    files: ProcessedFile[],
    provider: Provider,
    options?: {
        concurrency?: number;
        onProgress?: (progress: { uploaded: number; total: number }) => void;
    },
) => {
    const concurrency = Math.max(1, options?.concurrency ?? 8);
    let nextIndex = 0;
    let uploaded = 0;
    const total = files.length;
    options?.onProgress?.({ uploaded, total });

    const uploadOne = async (file: ProcessedFile) => {
        try {
            if (file.type === ProcessedFileType.BINARY) {
                const uint8Array = new Uint8Array(file.content);
                const result = await provider.writeFile({
                    args: {
                        path: file.path,
                        content: uint8Array,
                        overwrite: true,
                    },
                });
                if (!result.success) {
                    throw new Error('Provider rejected the file write');
                }
            } else {
                const result = await provider.writeFile({
                    args: {
                        path: file.path,
                        content: file.content,
                        overwrite: true,
                    },
                });
                if (!result.success) {
                    throw new Error('Provider rejected the file write');
                }
            }
        } catch (fileError: unknown) {
            console.error(`Error uploading file ${file.path}:`, fileError);
            throw new Error(
                `Failed to upload file: ${file.path} - ${fileError instanceof Error ? fileError.message : 'Unknown error'}`,
            );
        }
    };

    const workers = Array.from({ length: Math.min(concurrency, total) }, async () => {
        while (nextIndex < total) {
            const file = files[nextIndex];
            nextIndex += 1;
            if (!file) {
                continue;
            }
            await uploadOne(file);
            uploaded += 1;
            options?.onProgress?.({ uploaded, total });
        }
    });

    await Promise.all(workers);
};
