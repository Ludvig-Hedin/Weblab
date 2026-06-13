import { useRef, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useMutation } from 'convex/react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type { Branch } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { timeAgo } from '@weblab/utility/src/time';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';

interface BranchManagementProps {
    branch: Branch;
}

export const BranchManagement = observer(({ branch }: BranchManagementProps) => {
    const t = useTranslations('editor.leftPanel.branches');
    const editorEngine = useEditorEngine();
    const removeBranchMutation = useMutation(api.branches.remove);
    const [isRenaming, setIsRenaming] = useState(false);
    const [newName, setNewName] = useState(branch.name);
    const [isForking, setIsForking] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    // Dedupe latch for handleRename (wired to both Enter and blur).
    const renameInFlightRef = useRef(false);
    const isActiveBranch = editorEngine.branches.activeBranch.id === branch.id;
    const isOnlyBranch = editorEngine.branches.allBranches.length === 1;

    const handleClose = () => {
        editorEngine.state.setBranchTab(null);
        editorEngine.state.setManageBranchId(null);
    };

    const handleRename = async () => {
        // handleRename is wired to BOTH onKeyDown(Enter) and onBlur. Pressing
        // Enter calls setIsRenaming(false), which unmounts the focused input
        // and fires a native blur → handleRename again. The name guard below
        // can miss the dedupe because `branch.name` may not have updated from
        // the Convex round-trip yet, so a ref-based in-flight latch is the
        // reliable guard against a duplicate mutation + toast.
        if (renameInFlightRef.current) return;
        if (newName.trim() === branch.name || !newName.trim()) {
            setIsRenaming(false);
            setNewName(branch.name);
            return;
        }

        renameInFlightRef.current = true;
        try {
            await editorEngine.branches.updateBranch(branch.id, {
                name: newName.trim(),
            });
            toast.success(`Branch renamed to "${newName.trim()}"`);
            setIsRenaming(false);
        } catch (error) {
            console.error('Failed to rename branch:', error);
            toast.error('Failed to rename branch', {
                description: error instanceof Error ? error.message : 'Please try again.',
            });
            setNewName(branch.name);
            setIsRenaming(false);
        } finally {
            renameInFlightRef.current = false;
        }
    };

    const handleFork = async () => {
        if (isForking) return;

        try {
            setIsForking(true);
            await editorEngine.branches.forkBranch(branch.id);
            toast.success('Branch forked successfully');
            handleClose();
        } catch (error) {
            console.error('Failed to fork branch:', error);
            toast.error('Failed to fork branch');
        } finally {
            setIsForking(false);
        }
    };

    const handleDelete = async () => {
        if (isDeleting) return;

        // Pre-compute the switch target (if needed) but don't actually switch
        // until after the delete succeeds — switching first leaves the user on
        // a different branch when the mutation throws and the source branch
        // was never deleted.
        let switchTargetId: string | null = null;
        if (isActiveBranch) {
            const allBranches = editorEngine.branches.allBranches;
            const otherBranches = allBranches.filter((b) => b.id !== branch.id);

            if (otherBranches.length === 0) {
                toast.error('Cannot delete the last remaining branch');
                return;
            }

            const targetBranch = otherBranches.find((b) => b.isDefault) || otherBranches[0];
            if (!targetBranch) {
                toast.error('No target branch available for switching');
                return;
            }
            switchTargetId = targetBranch.id;
        }

        try {
            setIsDeleting(true);

            await removeBranchMutation({
                branchId: branch.id as Id<'branches'>,
            });

            // Drop the branch from the local MobX collection BEFORE switching.
            // If `switchToBranch` throws, the Convex row is already gone, so we
            // must not leave a stale branch the user can no longer interact
            // with. Local cleanup first guarantees the list stays consistent
            // with the backend even when the subsequent switch fails.
            editorEngine.branches.removeBranch(branch.id);

            if (switchTargetId) {
                await editorEngine.branches.switchToBranch(switchTargetId);
            }

            toast.success('Branch deleted successfully');
            handleClose();
        } catch (error) {
            console.error('Failed to delete branch:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to delete branch');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleRename();
        } else if (e.key === 'Escape') {
            setIsRenaming(false);
            setNewName(branch.name);
        }
    };

    return (
        <div className="text-active text-mini flex h-full w-full flex-grow flex-col p-0">
            <div className="border-border flex items-center justify-start gap-2 border-b py-3 pr-2.5 pl-3">
                <Button
                    variant="ghost"
                    size="icon"
                    className="hover:bg-background-secondary h-7 w-7 rounded-md"
                    onClick={handleClose}
                >
                    <Icons.ArrowLeft className="h-4 w-4" />
                </Button>
                <h2 className="text-foreground text-small font-normal">{t('branchSettings')}</h2>
            </div>

            <div className="border-border space-y-4 border-b p-4">
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-foreground text-small">{t('name')}</label>
                        {isActiveBranch && (
                            <span className="text-mini text-foreground-skill bg-foreground-skill/15 rounded px-2 py-1">
                                {t('active')}
                            </span>
                        )}
                    </div>
                    {isRenaming ? (
                        <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={handleRename}
                            className="text-small h-9"
                            autoFocus
                        />
                    ) : (
                        <div
                            className="bg-background-secondary hover:bg-background-secondary/70 flex cursor-pointer items-start justify-between rounded-md border p-2"
                            role="button"
                            tabIndex={0}
                            onClick={() => setIsRenaming(true)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setIsRenaming(true);
                                }
                            }}
                            aria-label={`Rename branch ${branch.name}`}
                        >
                            <span className="mr-2 min-w-0 flex-1 leading-tight font-medium break-words">
                                {branch.name}
                            </span>
                            <Icons.Pencil className="text-muted-foreground mt-0.5 h-3 w-3 flex-shrink-0" />
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 space-y-3 p-4">
                <div className="space-y-2">
                    <h3 className="text-foreground text-small">{t('actions')}</h3>
                    <div className="flex w-full flex-col items-center gap-2">
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={handleFork}
                            disabled={isForking}
                        >
                            {isForking ? (
                                <div className="flex items-center gap-2">
                                    <Icons.LoadingSpinner className="h-4 w-4" />
                                    <span>{t('forking')}</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Icons.Branch className="h-4 w-4" />
                                    <span>{t('fork')}</span>
                                </div>
                            )}
                        </Button>

                        <Button
                            variant="destructive"
                            className="w-full"
                            onClick={handleDelete}
                            disabled={isDeleting || isOnlyBranch}
                            title={
                                isOnlyBranch
                                    ? 'Cannot delete the last remaining branch'
                                    : 'Delete branch'
                            }
                        >
                            {isDeleting ? (
                                <div className="flex items-center gap-2">
                                    <Icons.LoadingSpinner className="h-4 w-4" />
                                    <span>{t('deleting')}</span>
                                </div>
                            ) : (
                                <div className="text-destructive flex items-center gap-2">
                                    <Icons.Trash className="h-4 w-4" />
                                    <span>{t('delete')}</span>
                                </div>
                            )}
                        </Button>
                    </div>
                </div>

                <div className="border-border border-t pt-4">
                    <div className="space-y-2">
                        <div className="text-foreground-tertiary/80 text-mini space-y-1">
                            <div>Created {timeAgo(branch.createdAt)} ago</div>
                            <div>Last modified {timeAgo(branch.updatedAt)} ago</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});
