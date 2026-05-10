'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import type { FrameworkId } from '@weblab/framework';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { ProjectCreationLoader } from '@/components/project-creation-loader';
import { useCreateBlankProject } from '@/hooks/use-create-blank-project';
import { useImportLocalProject } from '@/hooks/use-import-local-project';
import { transKeys } from '@/i18n/keys';
import { ExternalRoutes, Routes } from '@/utils/constants';
import { CloneWebsiteDialog } from './clone-website-dialog';
import { FrameworkSelectDialog } from './framework-select-dialog';

interface ChooserCardProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    cta: string;
    onClick: () => void;
    disabled?: boolean;
    busy?: boolean;
}

function ChooserCard({ icon, title, description, cta, onClick, disabled, busy }: ChooserCardProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled === true || busy === true}
            className={cn(
                'group border-foreground/10 bg-foreground/4 hover:border-foreground/20 hover:bg-foreground/8',
                'flex h-full min-h-[180px] flex-col justify-between rounded-xl border p-5 text-left transition-colors',
                'backdrop-blur-[10px]',
                'disabled:cursor-not-allowed disabled:opacity-60',
            )}
        >
            <div className="flex flex-col gap-3">
                <div className="border-foreground/10 bg-background flex h-10 w-10 items-center justify-center rounded-full border">
                    {busy ? <Icons.LoadingSpinner className="h-4 w-4 animate-spin" /> : icon}
                </div>
                <div className="space-y-1">
                    <div className="text-foreground text-sm font-medium">{title}</div>
                    <p className="text-foreground-tertiary text-sm leading-5">{description}</p>
                </div>
            </div>
            <div className="text-foreground-secondary group-hover:text-foreground mt-4 flex items-center gap-2 text-sm">
                {cta}
                <Icons.ArrowRight className="h-4 w-4" />
            </div>
        </button>
    );
}

interface ProjectChooserCardsProps {
    /** When the AI prompt is mid-creation; disables the secondary cards. */
    aiBusy?: boolean;
    /** Whether to render the "Want to keep code on your machine?" footer link. */
    showDesktopFooter?: boolean;
}

/**
 * Secondary creation paths shown alongside the AI prompt: blank, GitHub, local
 * folder. Used on /projects/new and on the empty-projects state so the user
 * gets one consistent set of starting points wherever they land.
 */
export function ProjectChooserCards({
    aiBusy = false,
    showDesktopFooter = true,
}: ProjectChooserCardsProps) {
    const router = useRouter();
    const t = useTranslations();
    const [showFrameworkDialog, setShowFrameworkDialog] = useState(false);
    const [showCloneDialog, setShowCloneDialog] = useState(false);

    const { handleStartBlankProject, isCreatingProject, phase } = useCreateBlankProject();
    const { handleImportLocalProject, isImporting, isFsAccessSupported } = useImportLocalProject();

    const isBusy = aiBusy || isCreatingProject || isImporting;

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
        <div className="w-full">
            {isCreatingProject && (
                <ProjectCreationLoader
                    overlay
                    heading={t(transKeys.projects.actions.creatingBlankProject)}
                    caption={t(transKeys.projects.actions.creatingBlankProjectCaption)}
                    steps={creationSteps}
                />
            )}
            <div className="flex w-full items-center gap-3">
                <div className="bg-foreground/10 h-px flex-1" />
                <span className="text-foreground-tertiary text-xs tracking-[0.2em] uppercase">
                    or pick a starting point
                </span>
                <div className="bg-foreground/10 h-px flex-1" />
            </div>
            <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                <ChooserCard
                    icon={<Icons.FilePlus className="h-4 w-4" />}
                    title="Start blank"
                    description="An empty project. Choose your stack — React (recommended) or plain HTML."
                    cta="Choose a framework"
                    onClick={() => setShowFrameworkDialog(true)}
                    busy={isCreatingProject}
                    disabled={isBusy}
                />
                <ChooserCard
                    icon={<Icons.MagicWand className="h-4 w-4" />}
                    title="Clone a website"
                    description="Recreate any site from a URL or a screenshot. The AI rebuilds it as an editable project."
                    cta="Open the cloner"
                    onClick={() => setShowCloneDialog(true)}
                    disabled={isBusy}
                />
                <ChooserCard
                    icon={<Icons.GitHubLogo className="h-4 w-4" />}
                    title="Import from GitHub"
                    description="Bring an existing repo. Connect your account once, then pick any repo to open in the editor."
                    cta="Open GitHub import"
                    onClick={() => router.push(Routes.IMPORT_GITHUB)}
                    disabled={isBusy}
                />
                <ChooserCard
                    icon={<Icons.Directory className="h-4 w-4" />}
                    title="Upload folder"
                    description={
                        isFsAccessSupported
                            ? 'Upload a local project folder to Weblab Cloud. The files become a sandbox you can edit in the browser.'
                            : 'Upload requires a Chromium-based browser (Chrome, Edge, or Arc).'
                    }
                    cta="Choose a folder"
                    onClick={() => void handleImportLocalProject()}
                    busy={isImporting}
                    disabled={isBusy || !isFsAccessSupported}
                />
            </div>

            {showDesktopFooter && (
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
                onSelect={(framework: FrameworkId) => {
                    setShowFrameworkDialog(false);
                    void handleStartBlankProject(framework);
                }}
            />

            <CloneWebsiteDialog open={showCloneDialog} onOpenChange={setShowCloneDialog} />
        </div>
    );
}
