import { api } from '@/trpc/server';
import { Main } from './_components/main';
import { OfflineEditorBootstrap } from './_components/offline-editor-bootstrap';
import { ProjectLoadError } from './_components/project-load-error';
import { ProjectProviders } from './providers';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const projectId = (await params).id;
    if (!projectId) {
        return <ProjectLoadError variant="invalid-id" />;
    }

    try {
        const bootstrap = await api.project.getEditorBootstrap({ projectId });

        if (!bootstrap?.project) {
            return <ProjectLoadError variant="not-found" />;
        }

        return (
            <ProjectProviders project={bootstrap.project} branches={bootstrap.branches}>
                <Main initialBootstrap={bootstrap} />
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
