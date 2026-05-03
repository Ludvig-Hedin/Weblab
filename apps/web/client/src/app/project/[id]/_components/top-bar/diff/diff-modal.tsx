'use client';

import { useEditorEngine } from '@/components/store/editor';
import type { FileDiff, FileDiffStatus } from '@/components/store/editor/git/git';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@weblab/ui/accordion';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { Icons } from '@weblab/ui/icons';
import { ScrollArea } from '@weblab/ui/scroll-area';
import { cn } from '@weblab/ui/utils';
import { observer } from 'mobx-react-lite';
import { CodeDiff } from '../../right-panel/chat-tab/code-display/code-diff';

interface DiffModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const STATUS_LABELS: Record<FileDiffStatus, string> = {
    added: 'Added',
    modified: 'Modified',
    deleted: 'Deleted',
};

const STATUS_CLASSES: Record<FileDiffStatus, string> = {
    added: 'bg-green-500/10 text-green-500 border-green-500/30',
    modified: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
    deleted: 'bg-red-500/10 text-red-500 border-red-500/30',
};

function countLines(value: string): number {
    if (!value) return 0;
    let count = 1;
    for (let i = 0; i < value.length; i++) {
        if (value.charCodeAt(i) === 10) count++;
    }
    return count;
}

function fileLineCounts(diff: FileDiff): { added: number; removed: number } {
    if (diff.skipped) return { added: 0, removed: 0 };
    if (diff.status === 'added') return { added: countLines(diff.modified), removed: 0 };
    if (diff.status === 'deleted') return { added: 0, removed: countLines(diff.original) };
    return { added: countLines(diff.modified), removed: countLines(diff.original) };
}

export const DiffModal = observer(({ open, onOpenChange }: DiffModalProps) => {
    const editorEngine = useEditorEngine();
    const gitManager = editorEngine.activeSandbox?.gitManager;
    const diffs = gitManager?.diffs ?? [];
    const isLoading = gitManager?.isLoadingDiffs ?? false;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl p-0 gap-0 overflow-hidden">
                <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
                    <div className="flex items-center gap-2">
                        <Icons.Code className="h-5 w-5" />
                        <DialogTitle className="text-xl font-semibold">Changes</DialogTitle>
                        {!isLoading && diffs.length > 0 && (
                            <span className="text-sm text-foreground-secondary">
                                {diffs.length} {diffs.length === 1 ? 'file' : 'files'}
                            </span>
                        )}
                    </div>
                    <DialogDescription className="sr-only">
                        Review uncommitted changes in your project
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[70vh]">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-16 text-foreground-secondary">
                            <Icons.LoadingSpinner className="h-5 w-5 animate-spin mr-2" />
                            Loading diff…
                        </div>
                    ) : diffs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center text-foreground-secondary">
                            <Icons.Check className="h-6 w-6 mb-2" />
                            <p className="text-sm">No uncommitted changes</p>
                        </div>
                    ) : (
                        <Accordion type="multiple" className="w-full">
                            {diffs.map((diff) => {
                                const { added, removed } = fileLineCounts(diff);
                                return (
                                    <AccordionItem
                                        key={diff.path}
                                        value={diff.path}
                                        className="border-b border-border last:border-b-0"
                                    >
                                        <AccordionTrigger className="px-6 py-3 hover:bg-background-secondary/40 hover:no-underline">
                                            <div className="flex items-center gap-3 min-w-0 flex-1 pr-4">
                                                <span
                                                    className={cn(
                                                        'shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-medium',
                                                        STATUS_CLASSES[diff.status],
                                                    )}
                                                >
                                                    {STATUS_LABELS[diff.status]}
                                                </span>
                                                <span
                                                    className="text-sm font-mono truncate text-left text-foreground-primary"
                                                    title={diff.path}
                                                >
                                                    {diff.path}
                                                </span>
                                                <span className="ml-auto flex items-center gap-2 text-xs shrink-0">
                                                    {added > 0 && (
                                                        <span className="text-green-500">
                                                            +{added}
                                                        </span>
                                                    )}
                                                    {removed > 0 && (
                                                        <span className="text-red-500">
                                                            -{removed}
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="px-0 pb-0">
                                            <DiffBody diff={diff} />
                                        </AccordionContent>
                                    </AccordionItem>
                                );
                            })}
                        </Accordion>
                    )}
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
});

function DiffBody({ diff }: { diff: FileDiff }) {
    if (diff.skipped === 'binary') {
        return (
            <div className="px-6 py-4 text-sm text-foreground-secondary">
                Binary file — no preview available.
            </div>
        );
    }
    if (diff.skipped === 'too-large') {
        return (
            <div className="px-6 py-4 text-sm text-foreground-secondary">
                File too large to preview.
            </div>
        );
    }
    return (
        <div className="border-t border-border">
            <CodeDiff originalCode={diff.original} modifiedCode={diff.modified} />
        </div>
    );
}
