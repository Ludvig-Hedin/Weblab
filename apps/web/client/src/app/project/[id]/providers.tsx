'use client';

import { useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

import type { Branch, Project } from '@weblab/models';

import { EditorEngineProvider } from '@/components/store/editor';
import { HostingProvider } from '@/components/store/hosting';
import {
    cacheProject,
    precacheNavigationUrls,
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
        // Persist the freshest project + branches to IndexedDB so the editor
        // can boot offline next time the user opens this project. Also seed
        // the SW navigation cache and request durable IDB storage so the
        // last-opened project survives storage pressure on Safari/Chrome.
        void setLastOpenedProject(project.id);
        void cacheProject(project, branches);
        void requestPersistentStorage();
        void precacheNavigationUrls([`/project/${project.id}`, '/projects']);
    }, [project, branches]);

    return (
        <DndProvider backend={HTML5Backend}>
            <EditorEngineProvider project={project} branches={branches}>
                <HostingProvider>{children}</HostingProvider>
            </EditorEngineProvider>
        </DndProvider>
    );
};
