'use client';

import { useRouter } from 'next/navigation';
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
    const router = useRouter();

    const handleNewProject = () => {
        // Best-effort screenshot of the current project before navigating away —
        // matches the pre-existing behavior so the project card thumbnail
        // refreshes when the user comes back to the projects list.
        try {
            void editorEngine.screenshot.captureScreenshot();
        } catch (error) {
            console.error('Failed to capture screenshot:', error);
        }
        router.push(Routes.NEW_PROJECT);
    };

    return (
        <>
            <DropdownMenuItem onClick={handleNewProject} className="cursor-pointer">
                <div className="center flex flex-row items-center">
                    <Icons.Plus className="mr-2" />
                    {t(transKeys.projects.actions.newProject)}
                </div>
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
