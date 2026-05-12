'use client';

import Link from 'next/link';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { DropdownMenuItem } from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';

import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';
import { Routes } from '@/utils/constants';

interface NewProjectMenuProps {
    onShowCloneDialog: (open: boolean) => void;
}

export const NewProjectMenu = observer(({ onShowCloneDialog }: NewProjectMenuProps) => {
    const editorEngine = useEditorEngine();
    const t = useTranslations();

    const handleNewProjectClick = (e: React.MouseEvent) => {
        // cmd/ctrl/shift → let the browser handle new tab/window. We skip the
        // screenshot capture in that case because the current project is not
        // navigating away.
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        try {
            void editorEngine.screenshot.captureScreenshot();
        } catch (error) {
            console.error('Failed to capture screenshot:', error);
        }
    };

    return (
        <>
            <DropdownMenuItem asChild className="cursor-pointer">
                <Link href={Routes.NEW_PROJECT} onClick={handleNewProjectClick}>
                    <div className="center flex flex-row items-center">
                        <Icons.Plus className="mr-2" />
                        {t(transKeys.projects.actions.newProject)}
                    </div>
                </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onShowCloneDialog(true)} className="cursor-pointer">
                <div className="center group flex flex-row items-center">
                    <Icons.Copy className="mr-2" />
                    {t(transKeys.projects.actions.cloneProject)}
                </div>
            </DropdownMenuItem>
        </>
    );
});
