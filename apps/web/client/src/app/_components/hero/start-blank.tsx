'use client';

import { Icons } from '@weblab/ui/icons/index';

import { ProjectCreationLoader } from '@/components/project-creation-loader';
import { useCreateBlankProject } from '@/hooks/use-create-blank-project';

export function StartBlank() {
    const { handleStartBlankProject, isCreatingProject, phase } = useCreateBlankProject();

    const creationSteps = [
        {
            label: 'Preparing your workspace',
            ready: phase === 'creating-project' || phase === 'opening-editor',
        },
        {
            label: 'Creating your project',
            ready: phase === 'opening-editor',
        },
        { label: 'Opening editor', ready: false },
    ];

    return (
        <>
            {/*
              Full-screen overlay so the user gets a clear "we're working on
              it" surface for the 5–30s sandbox-fork window instead of a
              tiny in-button spinner that looks like nothing happened.
            */}
            {isCreatingProject && (
                <ProjectCreationLoader
                    overlay
                    heading="Creating your blank project"
                    caption="This usually takes 10–20 seconds."
                    steps={creationSteps}
                />
            )}
            <button
                onClick={() => void handleStartBlankProject()}
                disabled={isCreatingProject}
                className="text-foreground-secondary hover:text-foreground disabled:hover:text-foreground-secondary flex items-center gap-2 text-sm transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {isCreatingProject ? (
                    <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                ) : (
                    <Icons.File className="h-4 w-4" />
                )}
                Start blank project
            </button>
        </>
    );
}
