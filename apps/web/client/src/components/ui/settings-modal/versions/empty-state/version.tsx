import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons/index';
import { toast } from '@weblab/ui/sonner';

import { useEditorEngine } from '@/components/store/editor';

export const NoVersions = observer(() => {
    const t = useTranslations('settings.versions');
    const editorEngine = useEditorEngine();
    const [isCreating, setIsCreating] = useState(false);

    const handleCreateBackup = async () => {
        try {
            setIsCreating(true);
            const branchData = editorEngine.branches.activeBranchData;

            if (!branchData) {
                throw new Error('No active branch available to create backup');
            }

            const result = await branchData.sandbox.gitManager.createCommit('Initial commit');
            if (!result.success) {
                throw new Error(result.error || 'Failed to create backup');
            }

            toast.success(t('toastCreateSuccess'));
            editorEngine.posthog.capture('versions_create_first_commit');
        } catch (error) {
            toast.error(t('toastCreateFailed'), {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="mt-4 flex flex-col items-center gap-2 rounded border border-dashed p-12">
            <div className="">{t('noVersionsTitle')}</div>
            <div className="text-muted-foreground text-center">
                {t('noVersionsDesc')}
            </div>
            <Button variant="outline" size="sm" onClick={handleCreateBackup} disabled={isCreating}>
                {isCreating ? (
                    <Icons.Shadow className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <Icons.Plus className="mr-2 h-4 w-4" />
                )}
                {isCreating ? t('saving') : t('createBackup')}
            </Button>
        </div>
    );
});
