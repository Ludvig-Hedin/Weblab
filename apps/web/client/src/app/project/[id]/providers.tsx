'use client';

import { useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

import type { Branch, Project } from '@weblab/models';

import { EditorEngineProvider } from '@/components/store/editor';
import { HostingProvider } from '@/components/store/hosting';
import { WorkingLevelEditorGate } from '@/components/working-level/editor-gate';
import { SanityBlogWorkspace } from '@/components/sanity-blog/workspace';
import {
    cacheProject,
    precacheOfflineShell,
    requestPersistentStorage,
    setLastOpenedProject,
} from '@/services/offline/project-cache';

export const ProjectProviders = ({
    children,
    project,
    branches,
}: {
    children: React.ReactNode;
    project: Project;
    branches: Branch[];
}) => {
    useEffect(() => {
        // Keep project data locally for recovery and request durable storage.
        // Private editor documents still require a network connection to open.
        void setLastOpenedProject(project.id);
        void cacheProject(project, branches);
        void requestPersistentStorage();
        void precacheOfflineShell();
    }, [project, branches]);

    const localBranch = branches.find(branch => branch.isDefault && branch.runtime.type === 'local')
        ?? branches.find(branch => branch.runtime.type === 'local');
    return (
        <WorkingLevelEditorGate siteId={project.id} contentChildren={localBranch
            ? <SanityBlogWorkspace key={`${project.id}:${localBranch.id}`} projectId={project.id} branchId={localBranch.id} /> : undefined}>
            <DndProvider backend={HTML5Backend}>
                <EditorEngineProvider project={project} branches={branches}>
                    <HostingProvider>{children}</HostingProvider>
                </EditorEngineProvider>
            </DndProvider>
        </WorkingLevelEditorGate>
    );
};
