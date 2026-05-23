import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import { fetchQuery } from 'convex/nextjs';

import { APP_NAME } from '@weblab/constants';

import type { Id } from '@convex/_generated/dataModel';
import { fromConvexBranch, fromConvexProject } from './_adapters/convex-bootstrap';
import { Main } from './_components/main';
import { OfflineEditorBootstrap } from './_components/offline-editor-bootstrap';
import { ProjectLoadError } from './_components/project-load-error';
import { ProjectProviders } from './providers';

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<Metadata> {
    try {
        const projectId = (await params).id;
        const { getToken } = await auth();
        const token = await getToken({ template: 'convex' });
        const project = await fetchQuery(
            api.projects.get,
            { projectId: projectId as Id<'projects'> },
            { token: token ?? undefined },
        );
        if (project?.name) {
            return { title: `${project.name} | ${APP_NAME}` };
        }
    } catch {
        // fall through to default
    }
    return { title: APP_NAME };
}

/**
 * Collect unique origins from frame preview URLs so the browser can
 * open a TCP + TLS handshake to the sandbox CDN in parallel with
 * editor hydration. Cuts ~100-300ms off the first iframe load. Skips
 * URLs we can't parse or that point at relative paths.
 */
function collectFramePreconnectOrigins(
    frames: { url?: string | null }[] | null | undefined,
): string[] {
    if (!frames) return [];
    const origins = new Set<string>();
    for (const frame of frames) {
        if (!frame?.url) continue;
        try {
            const { origin } = new URL(frame.url);
            if (origin.startsWith('http')) origins.add(origin);
        } catch {
            // ignore malformed URLs
        }
    }
    return Array.from(origins);
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const resolved = await params;
    const projectId = resolved.id;
    console.log('[project/page] resolved params:', resolved, 'projectId:', projectId);
    if (!projectId || projectId === 'undefined') {
        return <ProjectLoadError variant="invalid-id" />;
    }

    try {
        const { getToken } = await auth();
        const token = await getToken({ template: 'convex' });
        const bootstrap = await fetchQuery(
            api.projects.getEditorBootstrap,
            { projectId: projectId as Id<'projects'> },
            { token: token ?? undefined },
        );

        if (!bootstrap?.project) {
            return <ProjectLoadError variant="not-found" />;
        }

        const preconnectOrigins = collectFramePreconnectOrigins(bootstrap.canvas?.frames);

        // Convex Doc shapes don't perfectly align with the legacy editor-store
        // shapes (`branch.sandbox: { id }` vs flat `sandboxId`, `Date` vs epoch
        // ms timestamps). Run them through the adapter so MobX stores see what
        // they were written against; downstream consumers will be migrated to
        // `Doc<T>` in a follow-up.
        const project = fromConvexProject(bootstrap.project as never);
        const branches = (
            bootstrap.branches as never as Array<Parameters<typeof fromConvexBranch>[0]>
        ).map(fromConvexBranch);
        return (
            <ProjectProviders project={project} branches={branches}>
                {preconnectOrigins.map((origin) => (
                    <link key={`preconnect-${origin}`} rel="preconnect" href={origin} />
                ))}
                {preconnectOrigins.map((origin) => (
                    <link key={`dns-prefetch-${origin}`} rel="dns-prefetch" href={origin} />
                ))}
                <Main initialBootstrap={bootstrap as unknown as any} />
            </ProjectProviders>
        );
    } catch (error) {
        console.error('Failed to load project data:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        const lower = message.toLowerCase();

        // Always offer the offline-cache fallback — the client component
        // checks IndexedDB and falls through to ProjectLoadError if there's
        // no cached copy. This handles three cases that all look different
        // server-side but are functionally the same to the user:
        //   1. truly offline (fetch failed)
        //   2. session expired during a long offline session (401)
        //   3. transient backend/Supabase outage
        // The previous string-match-based gate sent (2) and (3) straight to
        // an error page, stranding users with valid offline edits.
        const fallbackHint: 'unauthorized' | 'not-found' | 'unknown' =
            lower.includes('unauth') || lower.includes('forbidden') || lower.includes('session')
                ? 'unauthorized'
                : lower.includes('not found') || lower.includes('not_found')
                  ? 'not-found'
                  : 'unknown';
        return (
            <OfflineEditorBootstrap
                projectId={projectId}
                reason={message}
                fallbackVariant={fallbackHint}
            />
        );
    }
}
