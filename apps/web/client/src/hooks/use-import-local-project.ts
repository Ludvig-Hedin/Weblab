'use client';

import { useState, useEffect } from 'react';
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
    /** Phase the import is currently in. UI surfaces this as a status string. */
    phase: 'idle' | 'picking' | 'forking' | 'connecting' | 'uploading' | 'creating' | 'done';
}

const INITIAL_PROGRESS: ImportProgress = { filesUploaded: 0, phase: 'idle' };

/**
 * Counterpart to `useCreateBlankProject`. Picks a folder via the File System
 * Access API, forks a blank cloud sandbox, uploads the folder's files into
 * it, then creates the project record and routes to the editor.
 *
 * The cloud sandbox is intentionally retained for live preview. Phase 1 of
 * the local-projects feature does NOT support pure-local mode — every
 * project still has a `sandboxId`. See plan
 * `understand-the-project-creation-proud-waffle.md`.
 */
export function useImportLocalProject() {
    const { data: user } = api.user.get.useQuery();
    const { mutateAsync: forkSandbox } = api.sandbox.fork.useMutation();
    const { mutateAsync: createProject } = api.project.create.useMutation();
    const { setIsAuthModalOpen } = useAuthContext();
    const router = useRouter();
    const [progress, setProgress] = useState<ImportProgress>(INITIAL_PROGRESS);
    const isImporting = progress.phase !== 'idle' && progress.phase !== 'done';

    const handleImportLocalProject = async () => {
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

        try {
            const folderHandle = await pickDirectory({ mode: 'read' });
            if (!folderHandle) {
                setProgress(INITIAL_PROGRESS);
                return;
            }

            const folderName = folderHandle.name || 'Local Project';

            // 1. Fork blank sandbox.
            setProgress({ filesUploaded: 0, phase: 'forking' });
            const { sandboxId, previewUrl } = await forkSandbox({
                sandbox: DEFAULT_NEW_PROJECT_TEMPLATE,
                config: {
                    title: `${folderName} - ${user.id}`,
                    tags: ['local-import', user.id],
                },
            });

            // 2. Connect a client to that sandbox so we can write files.
            setProgress({ filesUploaded: 0, phase: 'connecting' });
            provider = await createCodeProviderClient(CodeProvider.CodeSandbox, {
                providerOptions: {
                    codesandbox: {
                        sandboxId,
                        userId: user.id,
                        initClient: true,
                        getSession: async (id) => apiClient.sandbox.start.mutate({ sandboxId: id }),
                    },
                },
            });

            // 3. Stream-upload files.
            setProgress({ filesUploaded: 0, phase: 'uploading' });
            let filesUploaded = 0;
            const walker = walkFiles(folderHandle, {
                maxFiles: DEFAULT_MAX_IMPORT_FILES,
                maxBytes: DEFAULT_MAX_IMPORT_BYTES,
            });

            // Manual iteration so we can capture the generator's return value
            // (which carries the truncated flag).
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

                const { path, content } = next.value;
                await provider.writeFile({
                    args: {
                        path,
                        content,
                        overwrite: true,
                    },
                });
                filesUploaded += 1;
                if (filesUploaded % 25 === 0) {
                    setProgress({ filesUploaded, phase: 'uploading' });
                }
            }
            setProgress({ filesUploaded, phase: 'creating' });

            // 4. Create the project record.
            const newProject = await createProject({
                project: {
                    name: folderName,
                    description: 'Imported from local folder',
                    tags: ['local-import'],
                },
                sandboxId,
                sandboxUrl: previewUrl,
                userId: user.id,
            });

            setProgress({ filesUploaded, phase: 'done' });
            if (newProject) {
                router.push(`${Routes.PROJECT}/${newProject.id}`);
            }
        } catch (error) {
            console.error('Error importing local project:', error);
            const message = error instanceof Error ? error.message : String(error);
            toast.error('Failed to import folder', { description: message });
            setProgress(INITIAL_PROGRESS);
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

    // After a successful sign-in redirect, re-open the folder picker if the user
    // had clicked "Open local folder" while unauthenticated.
    useEffect(() => {
        if (!user?.id) return;
        const resume = async () => {
            const pending = await localforage.getItem<boolean>(
                LocalForageKeys.PENDING_LOCAL_IMPORT,
            );
            if (!pending) return;
            await localforage.removeItem(LocalForageKeys.PENDING_LOCAL_IMPORT);
            void handleImportLocalProject();
        };
        void resume();
        // handleImportLocalProject is recreated each render; user?.id is the real trigger.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    return {
        handleImportLocalProject,
        isImporting,
        progress,
        isFsAccessSupported: isFsAccessSupported(),
    };
}
