import { Skeleton } from '@weblab/ui/skeleton';

/**
 * Suspense fallback for the workspace projects dashboard.
 *
 * Without it, a soft navigation here (from `/projects` or the navbar) shows no
 * feedback while the server segment resolves — which reads as "nothing
 * happened" when Convex is briefly slow. This skeleton mirrors the dashboard's
 * own in-page loading grid so the handoff to the real list is seamless.
 */
export default function WorkspaceProjectsLoading() {
    return (
        <div className="mx-auto w-full max-w-6xl px-6 py-8">
            <div className="mb-6 flex flex-col gap-4">
                <div className="h-9 w-32">
                    <Skeleton className="h-full w-full rounded-md" />
                </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex flex-col gap-3 p-1.5">
                        <Skeleton className="aspect-[4/2.75] w-full rounded-xl" />
                        <div className="flex items-start justify-between gap-3 px-1">
                            <div className="flex flex-col gap-2">
                                <Skeleton className="h-4 w-32 rounded-sm" />
                                <Skeleton className="h-3 w-24 rounded-sm" />
                            </div>
                            <Skeleton className="h-3 w-12 rounded-sm" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
