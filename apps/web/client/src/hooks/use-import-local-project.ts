'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import localforage from 'localforage';
import { toast } from 'sonner';

import { useAuthContext } from '@/app/auth/auth-context';
import { isFsAccessSupported } from '@/services/local-fs/directory-handle';
import { LocalForageKeys } from '@/utils/constants';

export interface ImportProgress {
    /** Number of files uploaded so far. Total is unknown until the walk finishes. */
    filesUploaded: number;
    filesTotal?: number;
    /** Phase the import is currently in. UI surfaces this as a status string. */
    phase: 'idle' | 'picking' | 'forking' | 'connecting' | 'uploading' | 'creating' | 'done';
}

const INITIAL_PROGRESS: ImportProgress = { filesUploaded: 0, phase: 'idle' };

// TODO(sandbox-port): the entire local-import flow depends on
// `api.sandbox.fork`, `api.sandbox.deleteOrphan`, `api.sandbox.orphanBulkUpload`,
// `api.sandbox.startOrphan` (no Convex equivalents yet) and the legacy
// `project.create` shape. Until sandbox provisioning lands in Convex, this
// hook keeps its public surface but the action throws with a clear message
// so the UI can render "temporarily unavailable" instead of silently
// dropping the request.

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
    const user = useQuery(api.users.me, {});
    const { setIsAuthModalOpen } = useAuthContext();
    const router = useRouter();
    const [progress, setProgress] = useState<ImportProgress>(INITIAL_PROGRESS);
    const isImporting = progress.phase !== 'idle' && progress.phase !== 'done';

    // Keep the router reference live so future re-introduction of the flow
    // (when the sandbox port lands) doesn't need import housekeeping.
    void router;

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

        if (!user?._id) {
            await localforage.setItem(LocalForageKeys.RETURN_URL, window.location.pathname);
            // Mark a pending import intent so the hook can re-trigger the picker
            // automatically once the user returns from the auth flow.
            await localforage.setItem(LocalForageKeys.PENDING_LOCAL_IMPORT, true);
            setIsAuthModalOpen(true);
            return;
        }

        // TODO(sandbox-port): re-enable once `api.sandbox.fork`,
        // `api.sandbox.orphanBulkUpload`, `api.sandbox.startOrphan`, and the
        // new project.create flow are available in Convex. For now surface
        // an explicit error so the UI shows a clear message instead of
        // silently dropping the click.
        const message =
            'Local folder import is temporarily unavailable while the sandbox provisioning service is migrated.';
        toast.error('Folder import unavailable', { description: message });
        setProgress(INITIAL_PROGRESS);
        throw new Error(message);
    };

    useEffect(() => {
        if (!user?._id) {
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
    }, [user?._id]);

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
