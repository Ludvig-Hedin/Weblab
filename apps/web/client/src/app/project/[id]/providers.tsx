'use client';

import { useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

import type { Branch, Project } from '@weblab/models';

import {
    ScopedProjectBoundary,
    useScopedProject,
} from '@/components/cloud-editor/scoped-project-context';
import { SanityBlogWorkspace } from '@/components/sanity-blog/workspace';
import { EditorEngineProvider } from '@/components/store/editor';
import { HostingProvider } from '@/components/store/hosting';
import { WorkingLevelEditorGate } from '@/components/working-level/editor-gate';
import {
    cacheProject,
    precacheOfflineShell,
    requestPersistentStorage,
    setLastOpenedProject,
} from '@/services/offline/project-cache';
import { fromConvexBranch } from './_adapters/convex-bootstrap';

export const ProjectProviders = ({
    children,
    project,
    branches,
    scopedActorId,
}: {
    children: React.ReactNode;
    project: Project;
    branches: Branch[];
    scopedActorId?: string;
}) => {
    if (scopedActorId)
        return (
            <ScopedProjectBoundary
                key={`${project.id}:${scopedActorId}`}
                projectId={project.id}
                actorId={scopedActorId}
            >
                {(value) => (
                    <ProjectEditorProviders
                        key={`${project.id}:${value.scope.actorId}:${value.scope.sessionId}:${value.entry.bootstrap.branches
                            .map((branch) => branch._id)
                            .sort()
                            .join(',')}`}
                        project={project}
                        branches={value.entry.bootstrap.branches.map((branch) =>
                            fromConvexBranch({
                                ...branch,
                                sandboxId: branch.sandboxId ?? '',
                                runtimeType: branch.runtimeType ?? 'cloud',
                            }),
                        )}
                    >
                        {children}
                    </ProjectEditorProviders>
                )}
            </ScopedProjectBoundary>
        );
    return (
        <ProjectEditorProviders project={project} branches={branches}>
            {children}
        </ProjectEditorProviders>
    );
};

function ProjectEditorProviders({
    children,
    project,
    branches,
}: {
    children: React.ReactNode;
    project: Project;
    branches: Branch[];
}) {
    const scoped = useScopedProject();
    useEffect(() => {
        if (scoped) return;
        // Keep project data locally for recovery and request durable storage.
        // Private editor documents still require a network connection to open.
        void setLastOpenedProject(project.id);
        void cacheProject(project, branches);
        void requestPersistentStorage();
        void precacheOfflineShell();
    }, [project, branches, scoped]);

    const localBranch =
        branches.find((branch) => branch.isDefault && branch.runtime.type === 'local') ??
        branches.find((branch) => branch.runtime.type === 'local');
    return (
        <WorkingLevelEditorGate
            siteId={project.id}
            contentChildren={
                localBranch ? (
                    <SanityBlogWorkspace
                        key={`${project.id}:${localBranch.id}`}
                        projectId={project.id}
                        branchId={localBranch.id}
                    />
                ) : undefined
            }
        >
            <DndProvider backend={HTML5Backend}>
                <EditorEngineProvider
                    project={project}
                    branches={branches}
                    scopedProject={scoped?.scope}
                >
                    <HostingProvider>{children}</HostingProvider>
                </EditorEngineProvider>
            </DndProvider>
        </WorkingLevelEditorGate>
    );
}
