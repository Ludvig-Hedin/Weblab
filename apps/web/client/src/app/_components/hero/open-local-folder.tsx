'use client';

import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons/index';

import { useImportLocalProject } from '@/hooks/use-import-local-project';
import { transKeys } from '@/i18n/keys';

/**
 * Hero CTA that picks a local folder and imports it into a cloud-backed
 * project. True local editing is handled by the desktop local provider path.
 */
export function OpenLocalFolder() {
    const { handleImportLocalProject, isImporting } = useImportLocalProject();
    const t = useTranslations();

    return (
        <button
            onClick={() => void handleImportLocalProject()}
            disabled={isImporting}
            className="text-foreground-secondary hover:text-foreground disabled:hover:text-foreground-secondary flex items-center gap-2 text-sm transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
            {isImporting ? (
                <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
            ) : (
                <Icons.Directory className="h-4 w-4" />
            )}
            {isImporting
                ? t(transKeys.projects.actions.importingLocalFolder)
                : t(transKeys.projects.actions.openLocalFolder)}
        </button>
    );
}
