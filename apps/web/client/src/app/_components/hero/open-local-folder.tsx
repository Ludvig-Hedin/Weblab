'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons/index';

import { ProjectCreationLoader } from '@/components/project-creation-loader';
import { useImportLocalProject } from '@/hooks/use-import-local-project';

/**
 * Hero CTA that picks a local folder and imports it into a cloud-backed
 * project. True local editing is handled by the desktop local provider path.
 *
 * The folder picker has to run inside the user-gesture click handler, so we
 * keep that on this component (rather than redirecting to a dedicated
 * `/projects/creating` page first). The full-screen overlay below stands in
 * for that route — same UX, but no risk of losing the gesture chain that
 * the File System Access API requires.
 */
export function OpenLocalFolder() {
    const { handleImportLocalProject, isImporting, progress, isFsAccessSupported } =
        useImportLocalProject();
    const t = useTranslations('landing.hero.openLocalFolder');
    const tActions = useTranslations('projects.actions');
    // Compute support detection client-side only to keep the SSR markup stable
    // (and avoid hydration warnings). On Safari/Firefox the API is unavailable;
    // disable the button with a tooltip rather than letting users click and
    // hit a generic toast that looks like a regression.
    const [supported, setSupported] = useState(true);
    useEffect(() => {
        setSupported(Boolean(isFsAccessSupported));
    }, [isFsAccessSupported]);

    // Map the import progress phases onto a single linear list of steps so
    // the loader has the same shape as the AI / blank flows.
    const creationSteps = [
        {
            label:
                progress.phase === 'uploading' && progress.filesUploaded > 0
                    ? progress.filesTotal
                        ? `Uploading ${progress.filesUploaded}/${progress.filesTotal} files`
                        : t('uploadingFiles', { count: String(progress.filesUploaded) })
                    : t('uploadingFolder'),
            ready: progress.phase === 'creating' || progress.phase === 'done',
        },
        {
            label: t('creatingProject'),
            ready: progress.phase === 'done',
        },
        { label: t('openingEditor'), ready: false },
    ];

    // 'picking' is a transient state between the click and the user
    // selecting a folder — there's no useful progress to show, so we don't
    // bring up the overlay until we know they actually picked something.
    const showOverlay = isImporting && progress.phase !== 'picking';

    return (
        <>
            {showOverlay && (
                <ProjectCreationLoader
                    overlay
                    heading={t('importingHeading')}
                    caption={t('importingCaption')}
                    steps={creationSteps}
                />
            )}
            <button
                onClick={() => void handleImportLocalProject()}
                disabled={isImporting || !supported}
                title={!supported ? t('unsupportedTooltip') : undefined}
                className="text-foreground-secondary hover:text-foreground disabled:hover:text-foreground-secondary flex items-center gap-2 text-sm transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {isImporting ? (
                    <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                ) : (
                    <Icons.Directory className="h-4 w-4" />
                )}
                {isImporting ? tActions('importingLocalFolder') : tActions('openLocalFolder')}
            </button>
        </>
    );
}
