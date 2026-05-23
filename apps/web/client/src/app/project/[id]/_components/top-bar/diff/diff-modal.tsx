'use client';

import { observer } from 'mobx-react-lite';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@weblab/ui/accordion';
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

import type { FileDiff, FileDiffStatus } from '@/components/store/editor/git/git';
import { useEditorEngine } from '@/components/store/editor';
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
    added: 'bg-foreground-success/10 text-foreground-success border-foreground-success/30',
    modified: 'bg-foreground-warning/10 text-foreground-warning border-foreground-warning/30',
    deleted: 'bg-destructive/10 text-destructive border-destructive/30',
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
    return {
        added: countLines(diff.modified),
        removed: countLines(diff.original),
    };
}

export const DiffModal = observer(({ open, onOpenChange }: DiffModalProps) => {
    const editorEngine = useEditorEngine();
    const gitManager = editorEngine.activeSandbox?.gitManager;
    const diffs = gitManager?.diffs ?? [];
    const isLoading = gitManager?.isLoadingDiffs ?? false;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-4xl">
                <DialogHeader className="border-border border-b px-6 pt-6 pb-4">
                    <div className="flex items-center gap-2">
                        <Icons.Code className="h-5 w-5" />
                        <DialogTitle className="text-title3 font-semibold">Changes</DialogTitle>
                        {!isLoading && diffs.length > 0 && (
                            <span className="text-foreground-secondary text-small">
                                {diffs.length} {diffs.length === 1 ? 'file' : 'files'}
                            </span>
                        )}
                    </div>
                    <DialogDescription className="sr-only">
                        Review unsaved changes in your project
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[70vh]">
                    {isLoading ? (
                        <div className="text-foreground-secondary flex items-center justify-center py-16">
                            <Icons.LoadingSpinner className="mr-2 h-5 w-5 animate-spin" />
                            Loading changes…
                        </div>
                    ) : diffs.length === 0 ? (
                        <div className="text-foreground-secondary flex flex-col items-center justify-center py-16 text-center">
                            <Icons.Check className="mb-2 h-6 w-6" />
                            <p className="text-small">All changes saved</p>
                        </div>
                    ) : (
                        <Accordion type="multiple" className="w-full">
                            {diffs.map((diff) => {
                                const { added, removed } = fileLineCounts(diff);
                                return (
                                    <AccordionItem
                                        key={diff.path}
                                        value={diff.path}
                                        className="border-border border-b last:border-b-0"
                                    >
                                        <AccordionTrigger className="hover:bg-background-secondary/40 px-6 py-3 hover:no-underline">
                                            <div className="flex min-w-0 flex-1 items-center gap-3 pr-4">
                                                <span
                                                    className={cn(
                                                        'shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium',
                                                        STATUS_CLASSES[diff.status],
                                                    )}
                                                >
                                                    {STATUS_LABELS[diff.status]}
                                                </span>
                                                <span
                                                    className="text-foreground-primary text-small truncate text-left font-mono"
                                                    title={diff.path}
                                                >
                                                    {diff.path}
                                                </span>
                                                <span className="text-mini ml-auto flex shrink-0 items-center gap-2">
                                                    {added > 0 && (
                                                        <span className="text-foreground-success">
                                                            +{added}
                                                        </span>
                                                    )}
                                                    {removed > 0 && (
                                                        <span className="text-destructive">
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
            <div className="text-foreground-secondary text-small px-6 py-4">
                Binary file — no preview available.
            </div>
        );
    }
    if (diff.skipped === 'too-large') {
        return (
            <div className="text-foreground-secondary text-small px-6 py-4">
                File too large to preview.
            </div>
        );
    }
    return (
        <div className="border-border border-t">
            <CodeDiff originalCode={diff.original} modifiedCode={diff.modified} />
        </div>
    );
}
