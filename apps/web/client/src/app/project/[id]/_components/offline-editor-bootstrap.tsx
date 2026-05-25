'use client';

import { useEffect, useRef, useState } from 'react';

import type { Branch, Project } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';

import { getCachedProject } from '@/services/offline/project-cache';
import { ProjectProviders } from '../providers';
import { Main } from './main';
import { ProjectLoadError } from './project-load-error';

const STALE_CACHE_AGE_MS = 14 * 24 * 60 * 60 * 1000;

type CacheState =
    | { status: 'loading' }
    | { status: 'hit'; project: Project; branches: Branch[] }
    | { status: 'miss' };

export function OfflineEditorBootstrap({
    projectId,
    reason,
    fallbackVariant = 'unknown',
}: {
    projectId: string;
    reason?: string;
    fallbackVariant?: 'unauthorized' | 'forbidden' | 'not-found' | 'unknown' | 'invalid-id';
}) {
    const [state, setState] = useState<CacheState>({ status: 'loading' });
    const stalenessToastedRef = useRef(false);
    const accessChangeToastedRef = useRef(false);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const cached = await getCachedProject(projectId);
            if (cancelled) return;
            // A cached record without branches can't safely render the editor
            // (`editorEngine.branches.activeBranch` would be undefined and
            // every chat/canvas access path crashes). Treat as a miss so the
            // user lands on ProjectLoadError instead of a white screen.
            if (cached && cached.branches.length > 0) {
                setState({
                    status: 'hit',
                    project: cached.project,
                    branches: cached.branches,
                });
                const age = Date.now() - cached.cachedAt;
                if (age > STALE_CACHE_AGE_MS && !stalenessToastedRef.current) {
                    stalenessToastedRef.current = true;
                    const days = Math.floor(age / (24 * 60 * 60 * 1000));
                    toast.warning(
                        `Working from a cached copy that's ${days} day${days === 1 ? '' : 's'} old.`,
                        {
                            description: 'Reconnect to pull the latest from the cloud.',
                        },
                    );
                }
                // We're rendering an interactive editor from cache because the
                // server fetch failed with an access error (401/403/session),
                // NOT a plain network/offline failure. The data the user sees
                // is stale and edits may not sync, so warn non-blockingly —
                // they keep full editor access but know the caveat. One-time
                // per mount; independent of the staleness toast above so both
                // can fire if the copy is also old.
                if (fallbackVariant === 'unauthorized' && !accessChangeToastedRef.current) {
                    accessChangeToastedRef.current = true;
                    toast.warning("You're viewing a cached copy.", {
                        description:
                            'Your access may have changed — edits might not sync. Reload to reconnect.',
                    });
                }
            } else {
                setState({ status: 'miss' });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [projectId, fallbackVariant]);

    if (state.status === 'loading') {
        return (
            <div className="bg-background flex min-h-screen items-center justify-center">
                <Icons.LoadingSpinner className="text-muted-foreground h-5 w-5 animate-spin" />
            </div>
        );
    }

    // Cache miss: delegate to the standard error page. We pass through the
    // fallback variant the server saw so the user gets the right message
    // ("session expired" vs "not found" vs offline-empty).
    if (state.status === 'miss') {
        return <ProjectLoadError variant={fallbackVariant} message={reason} />;
    }

    return (
        <ProjectProviders project={state.project} branches={state.branches}>
            <Main />
        </ProjectProviders>
    );
}
