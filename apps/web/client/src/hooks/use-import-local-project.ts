'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import localforage from 'localforage';
import { toast } from 'sonner';

import { useAuthContext } from '@/app/auth/auth-context';
import { isFsAccessSupported } from '@/services/local-fs/directory-handle';
import { LocalForageKeys, Routes } from '@/utils/constants';

export interface ImportProgress {
    /** Number of files uploaded so far. Total is unknown until the walk finishes. */
    filesUploaded: number;
    filesTotal?: number;
    /** Phase the import is currently in. UI surfaces this as a status string. */
    phase: 'idle' | 'picking' | 'forking' | 'connecting' | 'uploading' | 'creating' | 'done';
}

const INITIAL_PROGRESS: ImportProgress = { filesUploaded: 0, phase: 'idle' };

const LOCAL_IMPORT_ROUTE = `${Routes.IMPORT_PROJECT}/local`;

/**
 * Entry-point hook for "Import a local folder" buttons (dashboard cards, hero,
 * empty state). It validates support + auth, then routes to the canonical
 * multi-step importer at {@link LOCAL_IMPORT_ROUTE} (folder pick → upload into a
 * fresh Vercel sandbox via `projectActions.createEmptySandbox` → `projects.create`
 * → editor). The full flow lives in `app/projects/import/local/_context`.
 *
 * History: this used to run the whole import inline, but that path depended on
 * the pre-Convex tRPC sandbox routers and was stubbed during the migration. The
 * dedicated importer page is now wired to Convex and is the single source of
 * truth, so these entry points just navigate there. The returned `isImporting`
 * / `progress` fields are kept (inert) so existing consumers compile unchanged.
 */
export function useImportLocalProject() {
    const user = useQuery(api.users.me, {});
    const { setIsAuthModalOpen } = useAuthContext();
    const router = useRouter();

    // Surface whether the user attempted "Import folder" while signed out, so
    // the `/projects` empty state can render a resume banner whose click is a
    // fresh user gesture (the dedicated page's folder picker needs one).
    const [hasPendingLocalImport, setHasPendingLocalImport] = useState(false);

    // SSR-safe File System Access support flag. `isFsAccessSupported()` reads
    // `window`, so calling it during render makes the server (false) and the
    // first client render (true in Chromium) disagree → React hydration
    // mismatch. Resolve it after mount so the first client render matches the
    // server, then update post-hydration.
    const [fsAccessSupported, setFsAccessSupported] = useState(false);
    useEffect(() => {
        setFsAccessSupported(isFsAccessSupported());
    }, []);

    const clearPendingLocalImport = async () => {
        setHasPendingLocalImport(false);
        await localforage.removeItem(LocalForageKeys.PENDING_LOCAL_IMPORT);
    };

    const handleImportLocalProject = async () => {
        if (!isFsAccessSupported()) {
            toast.error('Local folder access not supported', {
                description: 'Use a Chromium-based browser like Chrome, Edge, or Arc.',
            });
            return;
        }

        if (!user?._id) {
            // Send the user straight to the importer after auth, and flag the
            // intent so the empty-state banner can re-offer it as a fresh
            // gesture if the post-auth redirect doesn't land there.
            await localforage.setItem(LocalForageKeys.RETURN_URL, LOCAL_IMPORT_ROUTE);
            await localforage.setItem(LocalForageKeys.PENDING_LOCAL_IMPORT, true);
            setIsAuthModalOpen(true);
            return;
        }

        await clearPendingLocalImport();
        router.push(LOCAL_IMPORT_ROUTE);
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

    return {
        handleImportLocalProject,
        // Navigation-based now — the dedicated importer owns progress UI. Kept
        // inert so consumers that render an inline loader still compile.
        isImporting: false as boolean,
        progress: INITIAL_PROGRESS,
        isFsAccessSupported: fsAccessSupported,
        hasPendingLocalImport,
        clearPendingLocalImport,
    };
}
