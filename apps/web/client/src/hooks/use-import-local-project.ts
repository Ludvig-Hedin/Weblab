'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import localforage from 'localforage';
import { toast } from 'sonner';

import type { Provider } from '@weblab/code-provider';
import { CodeProvider, createCodeProviderClient } from '@weblab/code-provider';
import { DEFAULT_NEW_PROJECT_TEMPLATE } from '@weblab/constants';

import { useAuthContext } from '@/app/auth/auth-context';
import {
    DEFAULT_MAX_IMPORT_BYTES,
    DEFAULT_MAX_IMPORT_FILES,
    isFsAccessSupported,
    pickDirectory,
    walkFiles,
} from '@/services/local-fs/directory-handle';
import { api as apiClient } from '@/trpc/client';
import { api } from '@/trpc/react';
import { LocalForageKeys, Routes } from '@/utils/constants';

export interface ImportProgress {
    /** Number of files uploaded so far. Total is unknown until the walk finishes. */
    filesUploaded: number;
    filesTotal?: number;
    /** Phase the import is currently in. UI surfaces this as a status string. */
    phase: 'idle' | 'picking' | 'forking' | 'connecting' | 'uploading' | 'creating' | 'done';
}

const INITIAL_PROGRESS: ImportProgress = { filesUploaded: 0, phase: 'idle' };

/**
 * Counterpart to `useCreateBlankProject`. Picks a folder via the File System
 * Access API, forks a blank cloud sandbox, uploads the folder's files into
 * it, then creates the project record and routes to the editor.
 *
 * This is intentionally a cloud import flow. It is not true local project
 * editing; true local mode uses separate runtime metadata and a desktop local
 * provider.
 */
export function useImportLocalProject() {
    const { data: user } = api.user.get.useQuery();
    const { mutateAsync: forkSandbox } = api.sandbox.fork.useMutation();
    const { mutateAsync: createProject } = api.project.create.useMutation();
    const { mutateAsync: deleteOrphanSandbox } = api.sandbox.deleteOrphan.useMutation();
    const { mutateAsync: orphanBulkUpload } = api.sandbox.orphanBulkUpload.useMutation();
    const { setIsAuthModalOpen } = useAuthContext();
    const router = useRouter();
    const [progress, setProgress] = useState<ImportProgress>(INITIAL_PROGRESS);
    const isImporting = progress.phase !== 'idle' && progress.phase !== 'done';

    // Surface whether the user attempted "Import folder to cloud" while signed out.
    // The picker itself can't be auto-invoked here — `showDirectoryPicker()` requires
    // a fresh user gesture, and a `useEffect` running after auth-redirect doesn't
    // count. Consumers (e.g. the `/projects` empty state) read this flag and render
    // a banner whose button click *is* a fresh gesture, then call
    // `handleImportLocalProject()` from there.
    const [hasPendingLocalImport, setHasPendingLocalImport] = useState(false);

    const handleImportLocalProject = async () => {
        // Idempotency: this function is called both from the button
        // click and from the post-auth resume effect below. Without this
        // guard a click-then-auth-then-resume sequence could trigger
        // two parallel imports.
        if (isImporting) {
            return;
        }

        if (!isFsAccessSupported()) {
            toast.error('Local folder access not supported', {
                description: 'Use a Chromium-based browser like Chrome, Edge, or Arc.',
            });
            return;
        }

        if (!user?.id) {
            await localforage.setItem(LocalForageKeys.RETURN_URL, window.location.pathname);
            // Mark a pending import intent so the hook can re-trigger the picker
            // automatically once the user returns from the auth flow.
            await localforage.setItem(LocalForageKeys.PENDING_LOCAL_IMPORT, true);
            setIsAuthModalOpen(true);
            return;
        }

        setProgress({ filesUploaded: 0, phase: 'picking' });
        let provider: Provider | null = null;
        // Track the forked sandbox so we can release it (best-effort) on any
        // failure between fork and project.create — large-folder rejections,
        // upload errors, sandbox provisioning hiccups all leak otherwise.
        let forkedSandboxId: string | null = null;

        try {
            const folderHandle = await pickDirectory({ mode: 'read' });
            if (!folderHandle) {
                setProgress(INITIAL_PROGRESS);
                return;
            }

            // The user has now actually picked a folder while signed in, so any
            // banner-prompt the projects page may be showing is no longer relevant.
            await localforage.removeItem(LocalForageKeys.PENDING_LOCAL_IMPORT);
            setHasPendingLocalImport(false);

            const folderName = folderHandle.name || 'Local Project';

            // 1. Fork blank sandbox. No hardcoded provider — the server uses
            // the configured WEBLAB_CLOUD_PROVIDER (vercel_sandbox or code_sandbox).
            setProgress({ filesUploaded: 0, phase: 'forking' });
            const { sandboxId, previewUrl, sandboxRuntime } = await forkSandbox({
                sandbox: DEFAULT_NEW_PROJECT_TEMPLATE,
                config: {
                    title: `${folderName} - ${user.id}`,
                    tags: ['local-import', user.id],
                },
            });
            forkedSandboxId = sandboxId;

            // 2. Walk files (needed by both upload paths).
            setProgress({ filesUploaded: 0, phase: 'uploading' });
            const walker = walkFiles(folderHandle, {
                maxFiles: DEFAULT_MAX_IMPORT_FILES,
                maxBytes: DEFAULT_MAX_IMPORT_BYTES,
            });
            const filesToUpload: Array<{ path: string; content: Uint8Array }> = [];

            while (true) {
                const next = await walker.next();
                if (next.done) {
                    if (next.value.truncated) {
                        throw new Error(
                            `Folder is too large. Limit is ${DEFAULT_MAX_IMPORT_FILES} files / ${
                                DEFAULT_MAX_IMPORT_BYTES / (1024 * 1024)
                            } MB. Try removing build artifacts (\`node_modules\`, \`dist\`, \`.next\`) or pick a smaller folder.`,
                        );
                    }
                    break;
                }
                filesToUpload.push(next.value);
            }

            setProgress({ filesUploaded: 0, filesTotal: filesToUpload.length, phase: 'uploading' });

            if (sandboxRuntime.provider === 'vercel_sandbox') {
                // Vercel Sandbox SDK is server-only; upload via tRPC so the
                // server writes files directly into the sandbox.
                await orphanBulkUpload({
                    sandboxId,
                    files: filesToUpload.map((f) => ({
                        path: f.path,
                        content: Array.from(f.content),
                    })),
                    runSetup: true,
                });
            } else {
                // CodeSandbox: connect via browser WebSocket and upload files
                // concurrently. Use startOrphan (not start) because the sandbox
                // has no branch row yet — that is created in step 3 below.
                setProgress({ filesUploaded: 0, phase: 'connecting' });
                provider = await createCodeProviderClient(CodeProvider.CodeSandbox, {
                    providerOptions: {
                        codesandbox: {
                            sandboxId,
                            userId: user.id,
                            initClient: true,
                            getSession: async (id) =>
                                apiClient.sandbox.startOrphan.mutate({
                                    sandboxId: id,
                                    provider: 'code_sandbox',
                                }),
                        },
                    },
                });

                let filesUploaded = 0;
                setProgress({
                    filesUploaded,
                    filesTotal: filesToUpload.length,
                    phase: 'uploading',
                });
                const uploadConcurrency = 8;
                let nextUploadIndex = 0;
                const uploadWorkers = Array.from(
                    { length: Math.min(uploadConcurrency, filesToUpload.length) },
                    async () => {
                        while (nextUploadIndex < filesToUpload.length) {
                            const file = filesToUpload[nextUploadIndex];
                            nextUploadIndex += 1;
                            if (!file) continue;
                            const result = await provider?.writeFile({
                                args: {
                                    path: file.path,
                                    content: file.content,
                                    overwrite: true,
                                },
                            });
                            if (!result?.success) {
                                throw new Error(`Failed to upload file: ${file.path}`);
                            }
                            filesUploaded += 1;
                            if (
                                filesUploaded % 25 === 0 ||
                                filesUploaded === filesToUpload.length
                            ) {
                                setProgress({
                                    filesUploaded,
                                    filesTotal: filesToUpload.length,
                                    phase: 'uploading',
                                });
                            }
                        }
                    },
                );
                await Promise.all(uploadWorkers);
            }

            setProgress({
                filesUploaded: filesToUpload.length,
                filesTotal: filesToUpload.length,
                phase: 'creating',
            });

            // 4. Create the project record.
            const newProject = await createProject({
                project: {
                    name: folderName,
                    description: 'Imported from local folder',
                    tags: ['cloud-import'],
                },
                sandboxId,
                sandboxUrl: previewUrl,
                sandboxRuntime,
            });

            // Sandbox is now owned by the new project; the catch path must
            // not delete it.
            forkedSandboxId = null;

            setProgress({
                filesUploaded: filesToUpload.length,
                filesTotal: filesToUpload.length,
                phase: 'done',
            });
            if (newProject) {
                router.push(`${Routes.PROJECT}/${newProject.id}`);
            }
        } catch (error) {
            console.error('Error importing local project:', error);
            const message = error instanceof Error ? error.message : String(error);
            toast.error('Failed to import folder', { description: message });
            setProgress(INITIAL_PROGRESS);
            if (forkedSandboxId) {
                await deleteOrphanSandbox({ sandboxId: forkedSandboxId }).catch((cleanupErr) => {
                    console.warn('[useImportLocalProject] failed to clean up orphan sandbox', {
                        sandboxId: forkedSandboxId,
                        error:
                            cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
                    });
                });
            }
        } finally {
            // Disconnect the temporary upload client; the editor will spin up
            // its own session when the user lands there.
            if (provider) {
                try {
                    await provider.destroy();
                } catch (cleanupError) {
                    console.warn('Failed to destroy upload provider:', cleanupError);
                }
            }
        }
    };

    useEffect(() => {
        if (!user?.id) {
            setHasPendingLocalImport(false);
            return;
        }
        let cancelled = false;
        void (async () => {
            const pending = await localforage.getItem<boolean>(
                LocalForageKeys.PENDING_LOCAL_IMPORT,
            );
            if (!cancelled) {
                setHasPendingLocalImport(Boolean(pending));
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [user?.id]);

    const clearPendingLocalImport = async () => {
        setHasPendingLocalImport(false);
        await localforage.removeItem(LocalForageKeys.PENDING_LOCAL_IMPORT);
    };

    return {
        handleImportLocalProject,
        isImporting,
        progress,
        isFsAccessSupported: isFsAccessSupported(),
        hasPendingLocalImport,
        clearPendingLocalImport,
    };
}
