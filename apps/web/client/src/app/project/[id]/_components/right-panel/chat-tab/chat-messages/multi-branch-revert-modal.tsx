'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import type { GitMessageCheckpoint } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { restoreCheckpoint } from '@/components/store/editor/git';

interface MultiBranchRevertModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    checkpoints: GitMessageCheckpoint[];
}

export const MultiBranchRevertModal = ({
    open,
    onOpenChange,
    checkpoints,
}: MultiBranchRevertModalProps) => {
    const t = useTranslations('editor.chat.multiBranchRevert');
    const editorEngine = useEditorEngine();
    const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
    const [isRestoring, setIsRestoring] = useState(false);

    // Only checkpoints with a branchId are selectable — legacy checkpoints are
    // skipped in the list (and by selectAll). Comparing the selected count
    // against the full `checkpoints.length` would leave the toggle stuck on
    // "Select All" whenever a legacy checkpoint is mixed in.
    const selectableBranchIds = checkpoints
        .map((cp) => cp.branchId)
        .filter((id): id is string => !!id);
    const allAreSelected =
        selectableBranchIds.length > 0 && selectedBranchIds.length === selectableBranchIds.length;

    const toggleBranch = (branchId: string) => {
        setSelectedBranchIds((prev) =>
            prev.includes(branchId) ? prev.filter((id) => id !== branchId) : [...prev, branchId],
        );
    };

    const selectAll = () => {
        setSelectedBranchIds(selectableBranchIds);
    };

    const selectNone = () => {
        setSelectedBranchIds([]);
    };

    const handleRevert = async () => {
        try {
            if (selectedBranchIds.length === 0) {
                toast.error(t('toastSelectFirst'));
                return;
            }

            setIsRestoring(true);

            const restorePromises = selectedBranchIds.map(async (branchId) => {
                const checkpoint = checkpoints.find((cp) => cp.branchId === branchId);
                if (!checkpoint) {
                    return { success: false };
                }
                return restoreCheckpoint(checkpoint, editorEngine);
            });

            const results = await Promise.all(restorePromises);
            const successCount = results.filter((r) => r.success).length;
            const failCount = results.length - successCount;

            // Distinguish all-succeeded / partial / all-failed. The old code
            // showed "all failed" whenever any branch failed (so a partial
            // success read as a total failure) and showed no toast on success.
            if (failCount === 0) {
                toast.success(t('toastSuccess'));
            } else if (successCount === 0) {
                toast.error(t('toastAllFailed'));
            } else {
                toast.error(t('toastPartialFailed'));
            }
        } catch (error) {
            toast.error(t('toastFailed'), {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setIsRestoring(false);
            onOpenChange(false);
            setSelectedBranchIds([]);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('dialogTitle')}</DialogTitle>
                    <DialogDescription className="pt-2">
                        {t('dialogDesc')}
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-2 py-4">
                    <div className="mb-1 flex justify-end gap-1">
                        {allAreSelected ? (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={selectNone}
                                disabled={isRestoring}
                            >
                                {t('selectNone')}
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={selectAll}
                                disabled={isRestoring}
                            >
                                {t('selectAll')}
                            </Button>
                        )}
                    </div>
                    <div className="flex flex-col gap-2">
                        {checkpoints.map((checkpoint) => {
                            // Skip legacy checkpoints without branchId (shouldn't happen in multi-branch modal)
                            if (!checkpoint.branchId) return null;
                            const isSelected = selectedBranchIds.includes(checkpoint.branchId);
                            return (
                                <button
                                    key={checkpoint.branchId}
                                    onClick={() => toggleBranch(checkpoint.branchId!)}
                                    disabled={isRestoring}
                                    className={cn(
                                        'flex items-center justify-between rounded-md border px-3 py-2.5 text-left transition-all',
                                        'hover:bg-background-secondary/50',
                                        isSelected
                                            ? 'border-primary/50 bg-primary/5'
                                            : 'border-border/50',
                                        isRestoring && 'cursor-not-allowed opacity-50',
                                    )}
                                >
                                    <span className="text-small">
                                        {editorEngine.branches.getBranchById(checkpoint.branchId)
                                            ?.name ?? checkpoint.branchId}
                                    </span>
                                    {isSelected && <Icons.Check className="text-primary h-4 w-4" />}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <DialogFooter className="flex-col gap-3 sm:flex-row sm:gap-2">
                    <Button
                        variant="outline"
                        onClick={() => {
                            onOpenChange(false);
                            setSelectedBranchIds([]);
                        }}
                        disabled={isRestoring}
                        className="order-2 sm:order-1"
                    >
                        {t('cancel')}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleRevert}
                        disabled={isRestoring || selectedBranchIds.length === 0}
                        className="order-1 sm:order-2"
                    >
                        {isRestoring ? t('restoring') : t('restore')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
