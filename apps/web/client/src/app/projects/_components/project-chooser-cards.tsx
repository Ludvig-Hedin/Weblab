'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';

import { useOpenLocalProject } from '@/hooks/use-open-local-project';
import { ExternalRoutes } from '@/utils/constants';

interface ActionButtonProps {
    icon: React.ReactNode;
    label: string;
    /** Hover description — replaces the old card body copy. */
    tooltip: string;
    onClick?: () => void;
    href?: string;
    disabled?: boolean;
    busy?: boolean;
    variant?: 'default' | 'outline';
}

/** A compact starting-point action: icon + label, with the detail on hover. */
function ActionButton({
    icon,
    label,
    tooltip,
    onClick,
    href,
    disabled,
    busy,
    variant = 'outline',
}: ActionButtonProps) {
    const inner = busy ? <Icons.LoadingSpinner className="h-3.5 w-3.5 animate-spin" /> : icon;

    const trigger =
        href && !disabled && !busy ? (
            <Button asChild variant={variant} size="sm">
                <Link href={href}>
                    {inner}
                    {label}
                </Link>
            </Button>
        ) : (
            <Button
                type="button"
                variant={variant}
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
    /** When the AI prompt is mid-creation; disables local actions. */
    aiBusy?: boolean;
    /** Whether to show the desktop download action in the browser. */
    showDesktopFooter?: boolean;
}

/** Local project entry points shared by the new-project and empty-project views. */
export function ProjectChooserCards({
    aiBusy = false,
    showDesktopFooter = true,
}: ProjectChooserCardsProps) {
    const t = useTranslations();
    const { openLocalFolder, isBusy: isOpeningLocal, isDesktop } =
        useOpenLocalProject();

    // Desktop-only flag. Gate on a mounted flag so SSR and the first client
    // render agree (the IPC bridge only exists in the desktop app), avoiding a
    // hydration mismatch when the desktop-only actions appear.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const isBusy = aiBusy || isOpeningLocal;

    if (!mounted) return null;

    return (
        <div className="w-full">
            {isDesktop ? (
                <>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                        <ActionButton
                            icon={<Icons.Directory className="h-3.5 w-3.5" />}
                            label={t('projects.chooser.openFolder.label')}
                            tooltip={t('projects.chooser.openFolder.tooltip')}
                            onClick={() => void openLocalFolder()}
                            busy={isOpeningLocal}
                            disabled={isBusy}
                            variant="default"
                        />
                    </div>
                    <p className="text-foreground-tertiary mx-auto mt-4 max-w-sm text-center text-sm">
                        {t('projects.chooser.openFolder.limits')}
                    </p>
                </>
            ) : showDesktopFooter ? (
                <div className="flex justify-center">
                    <ActionButton
                        icon={<Icons.Download className="h-3.5 w-3.5" />}
                        label={t('projects.chooser.desktopFooter.link')}
                        tooltip={t('projects.chooser.desktopFooter.cta')}
                        href={ExternalRoutes.DOWNLOAD_PAGE}
                    />
                </div>
            ) : null}
        </div>
    );
}
