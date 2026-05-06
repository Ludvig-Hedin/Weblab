'use client';

import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

import type { Branch, Project } from '@weblab/models';

import { EditorEngineProvider } from '@/components/store/editor';
import { HostingProvider } from '@/components/store/hosting';

export const ProjectProviders = ({
    children,
    project,
    branches,
}: {
    children: React.ReactNode;
    project: Project;
    branches: Branch[];
}) => {
    return (
        <DndProvider backend={HTML5Backend}>
            <EditorEngineProvider project={project} branches={branches}>
                <HostingProvider>{children}</HostingProvider>
            </EditorEngineProvider>
        </DndProvider>
    );
};
