import { useState } from 'react';
import { useTranslations } from 'next-intl';

import type { Branch } from '@weblab/models';
import { BranchTabValue, LeftPanelTabValue } from '@weblab/models';
import { DropdownMenuItem } from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';

import { useEditorEngine } from '@/components/store/editor';

interface BranchControlsProps {
    branch: Branch;
    onClose?: () => void;
    onForkBranch?: () => void;
    onCreateBlankSandbox?: () => void;
    onManageBranches?: () => void;
}

export function BranchControls({
    branch,
    onClose,
    onForkBranch,
    onCreateBlankSandbox,
    onManageBranches,
}: BranchControlsProps) {
    const t = useTranslations('editor.branch');
    const editorEngine = useEditorEngine();
    const [isForking, setIsForking] = useState(false);
    const [isCreatingBlank, setIsCreatingBlank] = useState(false);

    const handleForkBranch = async () => {
        if (isForking) return;

        try {
            setIsForking(true);
            await editorEngine.branches.forkBranch(branch.id);
            onForkBranch?.();
            onClose?.();
        } catch (error) {
            console.error('Failed to fork branch:', error);
            // Surface the failure — branch fork is currently #disabled on
            // Vercel Sandbox (TODO(sandbox-fork)); a silent console-only
            // failure made the menu item look dead.
            toast.error(
                error instanceof Error && error.message
                    ? error.message
                    : t('forkNotAvailable'),
            );
        } finally {
            setIsForking(false);
        }
    };

    const handleCreateBlankSandbox = async () => {
        if (isCreatingBlank) return;

        try {
            setIsCreatingBlank(true);
            await editorEngine.branches.createBlankSandbox();
            onCreateBlankSandbox?.();
            onClose?.();
        } catch (error) {
            console.error('Failed to create blank sandbox:', error);
            toast.error(
                error instanceof Error && error.message
                    ? error.message
                    : t('createBlankFailed'),
            );
        } finally {
            setIsCreatingBlank(false);
        }
    };

    const handleManageBranches = () => {
        // Open the branches tab in the left panel
        editorEngine.state.setLeftPanelTab(LeftPanelTabValue.BRANCHES);
        editorEngine.state.setLeftPanelLocked(true);
        editorEngine.state.setBranchTab(BranchTabValue.MANAGE);
        editorEngine.state.setManageBranchId(branch.id);
        onManageBranches?.();
        onClose?.();
    };

    return (
        <div className="p-1">
            <DropdownMenuItem
                className="flex items-center gap-2 p-2"
                onSelect={() => void handleForkBranch()}
                disabled={isForking}
            >
                {isForking ? (
                    <Icons.LoadingSpinner className="h-4 w-4" />
                ) : (
                    <Icons.Branch className="h-4 w-4" />
                )}
                <span>{isForking ? t('forking') : t('forkBranch')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
                className="flex items-center gap-2 p-2"
                onSelect={() => void handleCreateBlankSandbox()}
                disabled={isCreatingBlank}
            >
                {isCreatingBlank ? (
                    <Icons.LoadingSpinner className="h-4 w-4" />
                ) : (
                    <Icons.Plus className="h-4 w-4" />
                )}
                <span>{isCreatingBlank ? t('creating') : t('createBlankSandbox')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
                className="flex items-center gap-2 p-2"
                onSelect={handleManageBranches}
            >
                <Icons.Gear className="h-4 w-4" />
                <span>{t('manageBranch')}</span>
            </DropdownMenuItem>
        </div>
    );
}
