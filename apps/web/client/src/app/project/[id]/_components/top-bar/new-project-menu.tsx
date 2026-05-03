'use client';

import { useRouter } from 'next/navigation';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import {
    DropdownMenuItem,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';

import { useEditorEngine } from '@/components/store/editor';
import { useCreateBlankProject } from '@/hooks/use-create-blank-project';
import { useImportLocalProject } from '@/hooks/use-import-local-project';
import { transKeys } from '@/i18n/keys';
import { Routes } from '@/utils/constants';

interface NewProjectMenuProps {
    onShowCloneDialog: (open: boolean) => void;
}

export const NewProjectMenu = observer(({ onShowCloneDialog }: NewProjectMenuProps) => {
    const editorEngine = useEditorEngine();
    const { handleStartBlankProject, isCreatingProject } = useCreateBlankProject();
    const { handleImportLocalProject, isImporting } = useImportLocalProject();
    const t = useTranslations();
    const router = useRouter();

    const handleStartBlankWithScreenshot = async () => {
        // Capture screenshot of current project before cleanup
        try {
            editorEngine.screenshot.captureScreenshot();
        } catch (error) {
            console.error('Failed to capture screenshot:', error);
        }

        await handleStartBlankProject();
    };

    const handleImportWithScreenshot = async () => {
        try {
            void editorEngine.screenshot.captureScreenshot();
        } catch (error) {
            console.error('Failed to capture screenshot:', error);
        }

        await handleImportLocalProject();
    };

    return (
        <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
                <div className="center flex flex-row items-center">
                    <Icons.Plus className="mr-2" />
                    {t(transKeys.projects.actions.newProject)}
                </div>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="ml-2 w-48">
                <DropdownMenuItem
                    onClick={handleStartBlankWithScreenshot}
                    disabled={isCreatingProject}
                    className="cursor-pointer"
                >
                    <div className="center group flex flex-row items-center">
                        {isCreatingProject ? (
                            <Icons.LoadingSpinner className="mr-2 animate-spin" />
                        ) : (
                            <Icons.FilePlus className="mr-2" />
                        )}
                        {t(transKeys.projects.actions.blankProject)}
                    </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => void handleImportWithScreenshot()}
                    disabled={isImporting || isCreatingProject}
                    className="cursor-pointer"
                >
                    <div className="center group flex flex-row items-center">
                        {isImporting ? (
                            <Icons.LoadingSpinner className="mr-2 animate-spin" />
                        ) : (
                            <Icons.Directory className="mr-2" />
                        )}
                        {t(transKeys.projects.actions.openLocalFolder)}
                    </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push(Routes.IMPORT_PROJECT)}>
                    <div className="center group flex flex-row items-center">
                        <Icons.Upload className="mr-2" />
                        {t(transKeys.projects.actions.import)}
                    </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => onShowCloneDialog(true)}
                    className="cursor-pointer"
                >
                    <div className="center group flex flex-row items-center">
                        <Icons.Copy className="mr-2" />
                        {t(transKeys.projects.actions.cloneProject)}
                    </div>
                </DropdownMenuItem>
            </DropdownMenuSubContent>
        </DropdownMenuSub>
    );
});
