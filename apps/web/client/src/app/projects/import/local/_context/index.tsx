'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api as convexApi } from '@convex/_generated/api';
import { useAction, useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';

import type { FrameworkId, ProjectFile } from '@weblab/framework';
import { detectFrameworkFromFiles, getFrameworkAdapter } from '@weblab/framework';

import type { NextJsProjectValidation, ProcessedFile } from '@/app/projects/types';
import type { Id } from '@convex/_generated/dataModel';
import { ProcessedFileType } from '@/app/projects/types';
import { env } from '@/env';
import { getSandboxServerClient } from '@/lib/sandbox-server-client';
import { Routes } from '@/utils/constants';

/**
 * Browser-safe base64 for binary import assets. Chunked so a large file's byte
 * array never blows the call stack via spread into String.fromCharCode.
 */
function bytesToBase64(bytes: number[]): string {
    const arr = Uint8Array.from(bytes);
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < arr.length; i += CHUNK) {
        binary += String.fromCharCode(...arr.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

/**
 * Per-file upload ceiling. The sandbox WS client (sandbox-server-client.ts)
 * reconnects forever with backoff, so when the sandbox server (port 8080) is
 * down a `fileWrite` mutate never resolves AND never rejects — the import sits
 * on "Uploading 0/N files" behind a progress bar that has already animated to
 * 100%. This timeout converts that silent hang into a real error so the user
 * gets the Retry button instead of a frozen modal.
 */
const UPLOAD_FILE_TIMEOUT_MS = 30_000;

const UPLOAD_TIMEOUT_MESSAGE =
    'Upload timed out — the sandbox server is unreachable. Make sure it is running, then retry.';

/** Reject with `message` if `promise` hasn't settled within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (err) => {
                clearTimeout(timer);
                reject(err);
            },
        );
    });
}

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
    const createEmptySandboxAction = useAction(convexApi.projectActions.createEmptySandbox);
    const removeProjectMutation = useMutation(convexApi.projects.remove);
    const deleteProject = ({ id }: { id: string }) =>
        removeProjectMutation({ projectId: id as Id<'projects'> });
    // Provision a bare Vercel sandbox (no scaffold) for the import. The user's
    // uploaded files become the project, so a scaffold would collide.
    // TODO(sandbox-port): imported sandboxes aren't snapshotted yet, so the
    // project is lost when the sandbox times out (~30m). Follow-up: snapshot
    // after upload+install so cold-resume works like blank/clone.
    const forkSandbox = async (args: {
        port?: number;
        config?: unknown;
    }): Promise<{
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
        // Pass the port detected from the imported package.json so the sandbox
        // exposes the right one (a Next project is 3000, but static-HTML serves
        // on 8080 and would 502 on a 3000-only sandbox).
        const res = await createEmptySandboxAction({ port: args.port });
        return {
            sandboxId: res.sandboxId,
            previewUrl: res.previewUrl,
            sandboxRuntime: {
                provider: 'vercel_sandbox',
                port: res.port,
                runtime: res.runtime,
            },
        };
    };
    const deleteOrphanSandbox = async (_args: unknown): Promise<void> => {
        // No-op: imported sandboxes auto-expire on the Vercel timeout, so
        // best-effort cleanup is a future hardening (a stop route).
    };
    // Upload the picked folder into the sandbox over the authed proxy (text as
    // utf8, binary as base64), then run setup() to install deps + start dev.
    const orphanBulkUpload = async (args: {
        sandboxId: string;
        files: Array<{ path: string; content: string | number[] }>;
        runSetup?: boolean;
    }): Promise<void> => {
        const client = getSandboxServerClient();
        let uploaded = 0;
        for (const file of args.files) {
            const isBinary = Array.isArray(file.content);
            await withTimeout(
                client.sandbox.fileWrite.mutate({
                    sandboxId: args.sandboxId,
                    path: file.path,
                    content: isBinary
                        ? bytesToBase64(file.content as number[])
                        : (file.content as string),
                    encoding: isBinary ? 'base64' : 'utf8',
                }),
                UPLOAD_FILE_TIMEOUT_MS,
                UPLOAD_TIMEOUT_MESSAGE,
            );
            uploaded += 1;
            setFinalizeProgress({
                phase: 'uploading',
                filesUploaded: uploaded,
                totalFiles: args.files.length,
            });
        }
        if (args.runSetup) {
            await client.sandbox.setup.mutate({ sandboxId: args.sandboxId });
        }
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
            // Local import is stubbed (server-side route not yet ported to
            // Vercel) — `forkSandbox` throws "Local import is temporarily
            // unavailable.". The detected port is preserved for when the
            // real route lands; framework comes from package.json detection
            // upstream, not from a CSB template id.
            const forkedSandbox = await forkSandbox({
                port: detectPortFromPackageJson(packageJsonFile),
                config: {
                    title: `Imported project - ${user._id}`,
                    tags: ['imported', 'local', user._id],
                },
            });
            inFlightSandboxId.current = forkedSandbox.sandboxId;
            checkAborted();

            // Vercel Sandbox SDK is server-only — upload via tRPC. CodeSandbox
            // was removed 2026-05-24; any non-Vercel provider is a server
            // misconfiguration and should fail loudly rather than fall back
            // to a now-archived runtime.
            if (forkedSandbox.sandboxRuntime.provider !== 'vercel_sandbox') {
                throw new Error(
                    'Server provisioned a non-Vercel sandbox during import. ' +
                        'CodeSandbox is archived; set WEBLAB_CLOUD_PROVIDER and ' +
                        'the VERCEL_* tokens (see apps/web/client/.env.example).',
                );
            }
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
            setError(error instanceof Error ? error.message : 'Failed to create project');
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
