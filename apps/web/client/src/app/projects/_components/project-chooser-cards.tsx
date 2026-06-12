'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import type { FrameworkId } from '@weblab/framework';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';

import type { CreateDestination } from './framework-select-dialog';
import { ProjectCreationLoader } from '@/components/project-creation-loader';
import { useCreateBlankProject } from '@/hooks/use-create-blank-project';
import { useImportLocalProject } from '@/hooks/use-import-local-project';
import { useOpenLocalProject } from '@/hooks/use-open-local-project';
import { transKeys } from '@/i18n/keys';
import { ExternalRoutes, Routes } from '@/utils/constants';
import { CloneWebsiteDialog } from './clone-website-dialog';
import { FrameworkSelectDialog } from './framework-select-dialog';

interface ActionButtonProps {
    icon: React.ReactNode;
    label: string;
    /** Hover description — replaces the old card body copy. */
    tooltip: string;
    onClick?: () => void;
    href?: string;
    disabled?: boolean;
    busy?: boolean;
}

/** A compact starting-point action: icon + label, with the detail on hover. */
function ActionButton({ icon, label, tooltip, onClick, href, disabled, busy }: ActionButtonProps) {
    const inner = busy ? <Icons.LoadingSpinner className="h-3.5 w-3.5 animate-spin" /> : icon;

    const trigger =
        href && !disabled && !busy ? (
            <Button asChild variant="outline" size="sm">
                <Link href={href}>
                    {inner}
                    {label}
                </Link>
            </Button>
        ) : (
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClick}
                disabled={disabled === true || busy === true}
            >
                {inner}
                {label}
            </Button>
        );

    return (
        <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent className="max-w-56 text-center">{tooltip}</TooltipContent>
        </Tooltip>
    );
}

interface ProjectChooserCardsProps {
    /** When the AI prompt is mid-creation; disables the secondary actions. */
    aiBusy?: boolean;
    /** Whether to render the "Want to keep code on your machine?" footer link. */
    showDesktopFooter?: boolean;
}

/**
 * Secondary creation paths shown alongside the AI prompt: blank, clone, GitHub,
 * and a folder action (open a local folder on desktop, upload one on web). Used
 * on /projects/new and on the empty-projects state so users get one consistent
 * set of starting points wherever they land.
 */
export function ProjectChooserCards({
    aiBusy = false,
    showDesktopFooter = true,
}: ProjectChooserCardsProps) {
    const t = useTranslations();
    const [showFrameworkDialog, setShowFrameworkDialog] = useState(false);
    const [showCloneDialog, setShowCloneDialog] = useState(false);

    const { handleStartBlankProject, isCreatingProject, phase } = useCreateBlankProject();
    const { handleImportLocalProject, isImporting, progress, isFsAccessSupported } =
        useImportLocalProject();
    const {
        openLocalFolder,
        createLocalBlank,
        isBusy: isOpeningLocal,
        isDesktop,
    } = useOpenLocalProject();

    // Desktop-only flag. Gate on a mounted flag so SSR and the first client
    // render agree (the IPC bridge only exists in the desktop app), avoiding a
    // hydration mismatch when the desktop-only actions appear.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const isDesktopApp = mounted && isDesktop;

    const isBusy = aiBusy || isCreatingProject || isImporting || isOpeningLocal;

    const onSelectFramework = (framework: FrameworkId, destination: CreateDestination) => {
        setShowFrameworkDialog(false);
        // The dialog only offers Next.js / Static HTML under "Local", but guard
        // here too so a future framework can never reach the disk-scaffold path
        // it can't handle — anything else falls back to a cloud sandbox.
        if (destination === 'local' && (framework === 'nextjs' || framework === 'static-html')) {
            void createLocalBlank(framework);
        } else {
            void handleStartBlankProject(framework);
        }
    };

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
    const uploadLabel =
        progress.filesTotal && progress.filesUploaded > 0
            ? `Uploading ${progress.filesUploaded} of ${progress.filesTotal} files`
            : progress.filesUploaded > 0
              ? `Uploading ${progress.filesUploaded} files`
              : 'Uploading files';

    const importSteps = [
        {
            label: 'Preparing workspace',
            ready: ['uploading', 'creating', 'done'].includes(progress.phase),
        },
        {
            label: uploadLabel,
            ready: ['creating', 'done'].includes(progress.phase),
        },
        {
            label: 'Creating project',
            ready: progress.phase === 'done',
        },
        { label: 'Opening editor', ready: false },
    ];

    return (
        <div className="w-full">
            {isCreatingProject && (
                <ProjectCreationLoader
                    overlay
                    heading={t(transKeys.projects.actions.creatingBlankProject)}
                    caption={t(transKeys.projects.actions.creatingBlankProjectCaption)}
                    steps={creationSteps}
                />
            )}
            {isImporting && progress.phase !== 'picking' && (
                <ProjectCreationLoader
                    overlay
                    heading="Importing folder"
                    caption="Your files are being uploaded to a cloud workspace."
                    steps={importSteps}
                />
            )}
            <div className="flex w-full items-center gap-3">
                <div className="bg-foreground/10 h-px flex-1" />
                <span className="text-foreground-tertiary text-xs">or pick a starting point</span>
                <div className="bg-foreground/10 h-px flex-1" />
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <ActionButton
                    icon={<Icons.FilePlus className="h-3.5 w-3.5" />}
                    label="Start blank"
                    tooltip="An empty project. Pick your stack — and on desktop, cloud or local."
                    onClick={() => setShowFrameworkDialog(true)}
                    busy={isCreatingProject}
                    disabled={isBusy}
                />

                {isDesktopApp ? (
                    <ActionButton
                        icon={<Icons.Directory className="h-3.5 w-3.5" />}
                        label="Open folder"
                        tooltip="Open a folder from your machine. Edits sync to disk and your code editor, live."
                        onClick={() => void openLocalFolder()}
                        busy={isOpeningLocal}
                        disabled={isBusy}
                    />
                ) : (
                    <ActionButton
                        icon={<Icons.Upload className="h-3.5 w-3.5" />}
                        label="Upload folder"
                        tooltip={
                            isFsAccessSupported
                                ? 'Upload a local project folder to Weblab Cloud and edit it in the browser.'
                                : 'Upload requires a Chromium-based browser (Chrome, Edge, or Arc).'
                        }
                        onClick={() => void handleImportLocalProject()}
                        busy={isImporting}
                        disabled={isBusy || !isFsAccessSupported}
                    />
                )}

                <ActionButton
                    icon={<Icons.MagicWand className="h-3.5 w-3.5" />}
                    label="Clone a site"
                    tooltip="Recreate any site from a URL or screenshot. The AI rebuilds it as an editable project."
                    onClick={() => setShowCloneDialog(true)}
                    disabled={isBusy}
                />

                <ActionButton
                    icon={<Icons.GitHubLogo className="h-3.5 w-3.5" />}
                    label="GitHub repo"
                    tooltip="Bring an existing repo. Connect your account once, then pick any repo to open."
                    href={Routes.IMPORT_GITHUB}
                    disabled={isBusy}
                />
            </div>

            {showDesktopFooter && !isDesktopApp && (
                <p className="text-foreground-tertiary mt-6 text-center text-sm">
                    Want to keep code on your machine?{' '}
                    <Link
                        href={ExternalRoutes.DOWNLOAD_PAGE}
                        target="_blank"
                        rel="noreferrer"
                        className="text-foreground-secondary hover:text-foreground underline underline-offset-2"
                    >
                        Get the desktop app
                    </Link>
                    .
                </p>
            )}

            <FrameworkSelectDialog
                open={showFrameworkDialog}
                onOpenChange={setShowFrameworkDialog}
                onSelect={onSelectFramework}
                localAvailable={isDesktopApp}
            />

            <CloneWebsiteDialog open={showCloneDialog} onOpenChange={setShowCloneDialog} />
        </div>
    );
}
