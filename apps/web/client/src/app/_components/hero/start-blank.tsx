'use client';

import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons/index';

import { ProjectCreationLoader } from '@/components/project-creation-loader';
import { useCreateBlankProject } from '@/hooks/use-create-blank-project';
import { transKeys } from '@/i18n/keys';

export function StartBlank() {
    const { handleStartBlankProject, isCreatingProject, phase } = useCreateBlankProject();
    const t = useTranslations();

    const creationSteps = [
        {
            label: t(transKeys.projects.actions.preparingWorkspace),
            ready: phase === 'creating-project' || phase === 'opening-editor',
        },
        {
            label: t(transKeys.projects.actions.creatingProject),
            ready: phase === 'opening-editor',
        },
        { label: t(transKeys.projects.actions.openingEditor), ready: false },
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
                    heading={t(transKeys.projects.actions.creatingBlankProject)}
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
                {t(transKeys.projects.actions.startBlankProject)}
            </button>
        </>
    );
}
