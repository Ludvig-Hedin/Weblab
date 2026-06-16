import { ProjectCreationLoader } from '@/components/project-creation-loader';

/**
 * Suspense fallback for the legacy `/projects` route.
 *
 * `/projects` is a server component that resolves the caller's workspace via
 * Convex and then redirects to `/w/<slug>/projects`. On a soft client
 * navigation (e.g. the navbar "Projects" button) that server work blocks the
 * transition with no visual feedback — if Convex is briefly slow (cold start /
 * prod deploy version-swap) the user clicks and nothing appears to happen for
 * up to the 10s fetch timeout. This fallback paints immediately so the click
 * always has an instant response while the redirect resolves.
 */
export default function ProjectsLoading() {
    return <ProjectCreationLoader heading="Loading your projects" />;
}
