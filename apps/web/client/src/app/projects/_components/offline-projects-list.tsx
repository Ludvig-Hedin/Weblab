'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Icons } from '@weblab/ui/icons';

import type { CachedProjectRecord } from '@/services/offline/project-cache';
import { listCachedProjects } from '@/services/offline/project-cache';
import { useOnlineStatus } from '@/services/offline/online-status';

function timeAgo(ms: number): string {
    const diff = Date.now() - ms;
    if (diff < 60_000) return 'just now';
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

/**
 * Offline rescue panel for the `/projects` page. When the browser can't
 * reach the server, the normal `api.project.list.useQuery` returns nothing
 * — which the existing UI renders as "no projects yet", a confusing
 * empty state for returning users. This widget surfaces the projects we
 * have cached locally so they can resume work without re-establishing
 * connectivity.
 */
export function OfflineProjectsList() {
    const online = useOnlineStatus();
    const [cached, setCached] = useState<CachedProjectRecord[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const list = await listCachedProjects();
            if (!cancelled) setCached(list);
        })();
        return () => {
            cancelled = true;
        };
    }, [online]);

    if (online) return null;
    if (!cached || cached.length === 0) return null;

    return (
        <div className="bg-amber-500/5 border-amber-500/20 mx-auto w-full max-w-5xl rounded-lg border px-6 py-5">
            <div className="flex items-center gap-2">
                <Icons.InfoCircled className="h-4 w-4 text-amber-200" />
                <h2 className="text-base font-medium tracking-tight text-amber-200">
                    You're offline — showing {cached.length} cached project
                    {cached.length === 1 ? '' : 's'}
                </h2>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
                Open one to keep editing. Changes save locally and sync when you
                reconnect.
            </p>
            <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {cached.map((entry) => (
                    <li key={entry.project.id}>
                        <Link
                            href={`/project/${entry.project.id}`}
                            className="hover:bg-muted/40 border-border/60 group flex flex-col gap-1 rounded-md border px-3 py-2 transition"
                        >
                            <span className="line-clamp-1 text-sm font-medium">
                                {entry.project.name}
                            </span>
                            <span className="text-muted-foreground text-xs">
                                Cached {timeAgo(entry.cachedAt)}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
