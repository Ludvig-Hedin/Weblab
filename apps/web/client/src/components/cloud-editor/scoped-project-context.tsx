'use client';

import type { FunctionReturnType } from 'convex/server';
import type { ReactNode } from 'react';
import {
    createContext,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useAuth, useClerk } from '@clerk/nextjs';
import { useConvexAuth, useQuery } from 'convex/react';

import type { ScopedProjectEpoch } from './scoped-project-lifetime';
import type { ScopedEditorProject } from '@/components/store/editor/engine';
import type { ConvexAuthOwner } from '@/components/store/lib/convex-http-client';
import type { Id } from '@convex/_generated/dataModel';
import {
    captureConvexAuthOwner,
    getConvexHttpClientForOwner,
} from '@/components/store/lib/convex-http-client';
import { cloudEditorEntryApi } from '@/lib/cloud-editor-entry-api';
import { useCloudEditorCopy } from '@/lib/cloud-editor/copy';
import { useOnlineStatus } from '@/services/offline/online-status';
import { CloudProjectSignIn } from './project-sign-in';
import { ScopedProjectLifetime } from './scoped-project-lifetime';

type Entry = NonNullable<FunctionReturnType<typeof cloudEditorEntryApi.entry>>;
export type ScopedProjectContextValue = {
    projectId: string;
    entry: Entry;
    scope: ScopedEditorProject;
};
const ScopedProjectContext = createContext<ScopedProjectContextValue | null>(null);
export const useScopedProject = () => useContext(ScopedProjectContext);

/** Server props are hints. Only a current live entry may mount this editor. */
export function ScopedProjectBoundary({
    projectId,
    actorId,
    children,
}: {
    projectId: string;
    actorId: string;
    children: (value: ScopedProjectContextValue) => ReactNode;
}) {
    const copy = useCloudEditorCopy();
    const clerk = useClerk();
    const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
    const { isAuthenticated, isLoading } = useConvexAuth();
    const online = useOnlineStatus();
    const entry = useQuery(
        cloudEditorEntryApi.entry,
        online && isLoaded && isSignedIn && isAuthenticated
            ? { projectId: projectId as Id<'projects'> }
            : 'skip',
    );
    const live = useRef(entry);
    live.current = online && isAuthenticated ? entry : null;
    const [lifetime] = useState(() => new ScopedProjectLifetime());
    const [epoch, setEpoch] = useState(0);
    const [fresh, setFresh] = useState<{
        captured: ScopedProjectEpoch;
        owner: ConvexAuthOwner;
        entry: Entry;
    } | null>(null);
    const [failedEpoch, setFailedEpoch] = useState<number | null>(null);
    useLayoutEffect(() => {
        const observe = ({
            user,
            session,
        }: {
            user?: { id: string } | null;
            session?: { id: string } | null;
        }) => {
            setEpoch(
                lifetime.observe({ userId: user?.id ?? null, sessionId: session?.id ?? null }),
            );
        };
        observe(clerk);
        const unsubscribe = clerk.addListener(observe);
        return () => {
            unsubscribe();
            lifetime.invalidate();
        };
    }, [clerk, lifetime]);
    useLayoutEffect(() => {
        if (!online || !isAuthenticated) {
            lifetime.invalidate();
            setEpoch(lifetime.capture().epoch);
        }
    }, [isAuthenticated, lifetime, online]);
    useEffect(() => {
        if (!online || !isLoaded || !isSignedIn || !isAuthenticated || !userId || !sessionId)
            return;
        const captured = lifetime.capture();
        const owner = captureConvexAuthOwner();
        if (!owner) return;
        if (
            owner.userId !== userId ||
            owner.sessionId !== sessionId ||
            !lifetime.current(captured) ||
            captured.userId !== userId ||
            captured.sessionId !== sessionId
        )
            return;
        let cancelled = false;
        const current = () =>
            !cancelled &&
            owner.isCurrent() &&
            lifetime.current(captured) &&
            clerk.user?.id === userId &&
            clerk.session?.id === sessionId;
        void (async () => {
            try {
                await owner.ready;
                if (!current()) return;
                const result = await getConvexHttpClientForOwner(owner).query(
                    cloudEditorEntryApi.entry,
                    { projectId: projectId as Id<'projects'> },
                );
                if (!current()) return;
                if (!result) {
                    setFailedEpoch(captured.epoch);
                    return;
                }
                if (
                    result.user._id !== actorId ||
                    result.user.clerkUserId !== userId ||
                    result.bootstrap.project._id !== projectId
                ) {
                    setFailedEpoch(captured.epoch);
                    return;
                }
                if (lifetime.admit(captured)) setFresh({ captured, owner, entry: result });
            } catch {
                if (current()) setFailedEpoch(captured.epoch);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [
        actorId,
        clerk,
        epoch,
        isAuthenticated,
        isLoaded,
        isSignedIn,
        lifetime,
        online,
        projectId,
        sessionId,
        userId,
    ]);
    const value = useMemo<ScopedProjectContextValue | null>(() => {
        if (
            !online ||
            !isLoaded ||
            !isSignedIn ||
            !isAuthenticated ||
            !sessionId ||
            !userId ||
            !entry ||
            !fresh ||
            !lifetime.admitted(fresh.captured) ||
            !fresh.owner.isCurrent() ||
            fresh.captured.sessionId !== sessionId ||
            fresh.captured.userId !== userId ||
            fresh.entry.user._id !== actorId ||
            fresh.entry.bootstrap.project._id !== projectId ||
            entry.user._id !== actorId ||
            entry.user.clerkUserId !== userId ||
            entry.bootstrap.project._id !== projectId
        )
            return null;
        // A cached reactive result cannot add a branch absent from this session's
        // fresh entry. Reactive null still removes access immediately.
        const admittedIds = new Set(fresh.entry.bootstrap.branches.map((branch) => branch._id));
        const branches = entry.bootstrap.branches.filter((branch) => admittedIds.has(branch._id));
        if (!branches.length) return null;
        const currentIds = new Set(branches.map((branch) => branch._id));
        const filteredEntry: Entry = {
            ...entry,
            bootstrap: {
                ...entry.bootstrap,
                branches: branches.map((branch) => ({
                    ...branch,
                    frames: branch.frames.filter(
                        (frame) => frame.branchId && currentIds.has(frame.branchId),
                    ),
                })),
                canvas: entry.bootstrap.canvas
                    ? {
                          ...entry.bootstrap.canvas,
                          frames: entry.bootstrap.canvas.frames.filter(
                              (frame) => frame.branchId && currentIds.has(frame.branchId),
                          ),
                      }
                    : null,
            },
        };
        return {
            projectId,
            entry: filteredEntry,
            scope: {
                actorId,
                clerkUserId: userId,
                sessionId,
                isCurrent: (branchId) =>
                    lifetime.admitted(fresh.captured) &&
                    fresh.owner.isCurrent() &&
                    clerk.session?.id === sessionId &&
                    clerk.user?.id === userId &&
                    live.current?.user._id === actorId &&
                    live.current.user.clerkUserId === userId &&
                    live.current.bootstrap.project._id === projectId &&
                    (branchId === undefined ||
                        (admittedIds.has(branchId as Id<'branches'>) &&
                            live.current.bootstrap.branches.some(
                                (branch) => branch._id === branchId,
                            ))),
            },
        };
    }, [
        actorId,
        clerk,
        entry,
        epoch,
        fresh,
        isAuthenticated,
        isLoaded,
        isSignedIn,
        lifetime,
        online,
        projectId,
        sessionId,
        userId,
    ]);
    const loading =
        !isLoaded ||
        isLoading ||
        (online &&
            isAuthenticated &&
            entry !== null &&
            failedEpoch !== epoch &&
            (!fresh || !lifetime.admitted(fresh.captured) || entry === undefined));
    if (!value)
        return loading ? (
            <div
                className="bg-background text-foreground-secondary flex h-dvh items-center justify-center p-6 text-sm"
                role="status"
            >
                {copy.loading}
            </div>
        ) : (
            <CloudProjectSignIn
                denied={isSignedIn === true && online && entry === null}
                onOpen={() => {
                    lifetime.invalidate();
                    setEpoch(lifetime.capture().epoch);
                }}
            />
        );
    return (
        <ScopedProjectContext.Provider value={value}>
            {children(value)}
        </ScopedProjectContext.Provider>
    );
}
