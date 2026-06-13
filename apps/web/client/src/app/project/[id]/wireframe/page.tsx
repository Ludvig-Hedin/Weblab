import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import { fetchQuery } from 'convex/nextjs';

import { APP_NAME } from '@weblab/constants';

import type { Id } from '@convex/_generated/dataModel';
import { ProjectLoadError } from '../_components/project-load-error';
import { WireframeWorkspace } from './_components/wireframe-workspace';

export const metadata: Metadata = { title: `Wireframes | ${APP_NAME}` };

export default async function WireframePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (!id || id === 'undefined') {
        return <ProjectLoadError variant="invalid-id" />;
    }

    try {
        const { getToken } = await auth();
        const token = await getToken({ template: 'convex' });
        const project = await fetchQuery(
            api.projects.get,
            { projectId: id as Id<'projects'> },
            { token: token ?? undefined },
        );
        if (!project) {
            return <ProjectLoadError variant="not-found" />;
        }
        return <WireframeWorkspace projectId={id as Id<'projects'>} projectName={project.name} />;
    } catch {
        return <ProjectLoadError variant="not-found" />;
    }
}
