import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { BranchTabValue } from '@weblab/models';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@weblab/ui/alert-dialog';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';
import { timeAgo } from '@weblab/utility';

import { useEditorEngine } from '@/components/store/editor';
import { BranchManagement } from './branch-management';

export const BranchesTab = observer(() => {
    const t = useTranslations('editor.leftPanel.branches');
    const editorEngine = useEditorEngine();
    const { branches } = editorEngine;
    const [hoveredBranchId, setHoveredBranchId] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [branchName, setBranchName] = useState('');
    const [createMode, setCreateMode] = useState<'fork' | 'blank'>('fork');
    const [isCreating, setIsCreating] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [pendingSwitchBranchId, setPendingSwitchBranchId] = useState<string | null>(null);

    const filteredBranches = searchQuery.trim()
        ? branches.allBranches.filter((branch) =>
              branch.name.toLowerCase().includes(searchQuery.trim().toLowerCase()),
          )
        : branches.allBranches;

    const performBranchSwitch = async (branchId: string) => {
        try {
            // Find a frame that belongs to this branch
            const branchFrame = editorEngine.frames
                .getAll()
                .find((frameData) => frameData.frame.branchId === branchId);
            if (branchFrame) {
                // Select the frame, which will trigger the reaction to update the active branch
                editorEngine.frames.select([branchFrame.frame]);
            } else {
                // Fallback to direct branch switch if no frames found
                await branches.switchToBranch(branchId);
            }
        } catch (error) {
            console.error('Failed to switch branch:', error);
            toast.error('Failed to switch branch', {
                description: error instanceof Error ? error.message : 'Please try again.',
            });
        }
    };

    const handleBranchSwitch = async (branchId: string) => {
        if (branchId === branches.activeBranch.id) return;

        // history.canUndo is true after any in-session edit; treat that as "you have changes"
        if (editorEngine.history.canUndo) {
            setPendingSwitchBranchId(branchId);
            return;
        }

        await performBranchSwitch(branchId);
    };

    const handleManageBranch = (branchId: string) => {
        editorEngine.state.setManageBranchId(branchId);
        editorEngine.state.setBranchTab(BranchTabValue.MANAGE);
    };

    if (
        editorEngine.state.branchTab === BranchTabValue.MANAGE &&
        editorEngine.state.manageBranchId
    ) {
        const manageBranch = branches.allBranches.find(
            (b) => b.id === editorEngine.state.manageBranchId,
        );
        if (manageBranch) {
            return <BranchManagement branch={manageBranch} />;
        }
    }

    const handleCreateBranch = async () => {
        if (isCreating) {
            return;
        }

        try {
            setIsCreating(true);
            const trimmedName = branchName.trim();

            if (createMode === 'fork') {
                await branches.forkBranch(branches.activeBranch.id);
                if (trimmedName) {
                    await branches.updateBranch(branches.activeBranch.id, {
                        name: trimmedName,
                    });
                }
                toast.success('Branch created from current branch');
            } else {
                await branches.createBlankSandbox(trimmedName || undefined);
                toast.success('Blank branch created');
            }

            setBranchName('');
            setCreateMode('fork');
            setCreateOpen(false);
        } catch (error) {
            console.error('Failed to create branch:', error);
            toast.error('Failed to create branch', {
                description: error instanceof Error ? error.message : 'Please try again.',
            });
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b p-4">
                <span className="text-muted-foreground text-mini">
                    {branches.allBranches.length}{' '}
                    {branches.allBranches.length === 1 ? 'branch' : 'branches'}
                </span>
                <Popover open={createOpen} onOpenChange={setCreateOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Icons.Plus className="h-4 w-4" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 p-3">
                        <div className="space-y-3">
                            <div>
                                <p className="text-small font-medium">{t('createBranch')}</p>
                                <p className="text-muted-foreground text-mini">
                                    {t('createBranchDescription')}
                                </p>
                            </div>
                            <Input
                                value={branchName}
                                onChange={(event) => setBranchName(event.target.value)}
                                placeholder={t('branchNamePlaceholder')}
                                disabled={isCreating}
                            />
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    variant={createMode === 'fork' ? 'secondary' : 'outline'}
                                    className="justify-center"
                                    disabled={isCreating}
                                    onClick={() => setCreateMode('fork')}
                                >
                                    {t('forkCurrent')}
                                </Button>
                                <Button
                                    variant={createMode === 'blank' ? 'secondary' : 'outline'}
                                    className="justify-center"
                                    disabled={isCreating}
                                    onClick={() => setCreateMode('blank')}
                                >
                                    {t('blankBranch')}
                                </Button>
                            </div>
                            <Button
                                className="w-full"
                                disabled={isCreating}
                                onClick={handleCreateBranch}
                            >
                                {isCreating ? (
                                    <>
                                        <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />
                                        {t('creating')}
                                    </>
                                ) : createMode === 'fork' ? (
                                    t('createFromCurrent')
                                ) : (
                                    t('createBlank')
                                )}
                            </Button>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            {branches.allBranches.length > 3 && (
                <div className="px-3 pt-2">
                    <div className="relative">
                        <Icons.MagnifyingGlass className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('searchBranches')}
                            className="text-small h-8 pl-7"
                        />
                    </div>
                </div>
            )}

            <AlertDialog
                open={pendingSwitchBranchId !== null}
                onOpenChange={(open) => {
                    if (!open) setPendingSwitchBranchId(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('switchUnsaved')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('switchUnsavedDescription')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                const branchId = pendingSwitchBranchId;
                                setPendingSwitchBranchId(null);
                                if (branchId) {
                                    await performBranchSwitch(branchId);
                                }
                            }}
                        >
                            {t('switchAnyway')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="flex-1 overflow-auto">
                <div className="space-y-1 p-2">
                    {filteredBranches.length === 0 && (
                        <div className="text-muted-foreground text-mini py-6 text-center">
                            {t('noBranchesMatch', { query: searchQuery })}
                        </div>
                    )}
                    {filteredBranches.map((branch) => {
                        const isActive = branch.id === branches.activeBranch.id;
                        const isHovered = hoveredBranchId === branch.id;

                        return (
                            <div
                                key={branch.id}
                                className={cn(
                                    'group relative flex cursor-pointer items-center gap-3 rounded-lg border p-1 px-2 transition-colors',
                                    isActive
                                        ? 'bg-accent text-foreground border-border'
                                        : 'hover:bg-accent/50 text-foreground-secondary hover:text-foreground border-transparent',
                                )}
                                onClick={() => handleBranchSwitch(branch.id)}
                                onMouseEnter={() => setHoveredBranchId(branch.id)}
                                onMouseLeave={() => setHoveredBranchId(null)}
                            >
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                    {isActive ? (
                                        <Icons.CheckCircled className="text-foreground-skill h-4 w-4 flex-shrink-0" />
                                    ) : (
                                        <Icons.Branch className="text-muted-foreground h-4 w-4 flex-shrink-0" />
                                    )}
                                    <div className="min-w-0 flex-1 overflow-hidden">
                                        <div className="text-small truncate font-medium">
                                            {branch.name}
                                        </div>
                                        <div className="text-mini text-muted-foreground mb-1 truncate">
                                            {timeAgo(branch.updatedAt)}
                                        </div>
                                    </div>
                                </div>

                                {isHovered && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="hover:bg-background h-8 w-8 p-2 opacity-50 transition-opacity hover:opacity-100"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleManageBranch(branch.id);
                                        }}
                                        title={t('manageBranch')}
                                    >
                                        <Icons.Gear className="h-3 w-3" />
                                    </Button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
});
