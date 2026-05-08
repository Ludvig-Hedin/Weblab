import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { AnimatePresence, motion } from 'motion/react';

import type { ParsedError } from '@weblab/utility';
import { ChatType } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@weblab/ui/collapsible';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

import type { SendMessage } from '../../../_hooks/use-chat';
import { useEditorEngine } from '@/components/store/editor';

interface ErrorSectionProps {
    isStreaming: boolean;
    onSendMessage: SendMessage;
}

export const ErrorSection = observer(({ isStreaming, onSendMessage }: ErrorSectionProps) => {
    const editorEngine = useEditorEngine();
    const [isOpen, setIsOpen] = useState(false);
    const allErrors = editorEngine.branches.getAllErrors();
    const errorCount = editorEngine.branches.getTotalErrorCount();

    const sendFixError = () => {
        toast.promise(
            onSendMessage(
                'How can I resolve these errors? If you propose a fix, please make it concise.',
                ChatType.FIX,
            ),
            {
                error: 'Failed to send fix error message. Please try again.',
            },
        );
    };

    return (
        <Collapsible
            open={isOpen}
            onOpenChange={setIsOpen}
            className={cn('m-2 flex flex-col', errorCount === 0 && 'hidden')}
        >
            <div
                className={cn(
                    'border-border bg-background-tertiary/40 relative rounded-md border',
                    !isOpen && 'hover:bg-background-tertiary/70',
                )}
            >
                <div
                    className={cn(
                        'text-foreground-secondary flex items-center justify-between transition-colors',
                        !isOpen && 'hover:text-foreground-primary',
                    )}
                >
                    <CollapsibleTrigger asChild disabled={errorCount === 1}>
                        <div className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-2 pl-3">
                            <Icons.ChevronDown
                                className={cn(
                                    'text-foreground-tertiary h-4 w-4 shrink-0 transition-transform duration-200',
                                    isOpen && 'rotate-180',
                                )}
                            />
                            <div className="min-w-0 flex-1 text-start">
                                <p className="text-small text-foreground-primary pointer-events-none truncate select-none">
                                    {errorCount === 1 ? 'Error' : `${errorCount} Errors`}
                                </p>
                                <p className="text-mini text-foreground-tertiary pointer-events-none hidden max-w-[300px] truncate select-none">
                                    {errorCount === 1
                                        ? allErrors[0]?.content
                                        : `You have ${errorCount} errors`}
                                </p>
                            </div>
                        </div>
                    </CollapsibleTrigger>
                    <div className="flex shrink-0 items-center gap-1 py-1 pr-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={isStreaming}
                            className="text-foreground-secondary hover:bg-foreground/8 hover:text-foreground-primary h-7 px-2 select-none"
                            onClick={sendFixError}
                        >
                            <Icons.MagicWand className="mr-2 h-4 w-4" />
                            Fix
                        </Button>
                    </div>
                </div>
                <CollapsibleContent forceMount>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key="content"
                            initial={{ height: 0, opacity: 0 }}
                            animate={
                                isOpen ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }
                            }
                            transition={{ duration: 0.2, ease: 'easeInOut' }}
                            style={{ overflow: 'hidden' }}
                            className="border-border/60 border-t"
                        >
                            <div className="max-h-60 overflow-auto px-2.5 py-2">
                                {allErrors.map((error: ParsedError) => (
                                    <div
                                        key={`${error.branchId}-${error.content}`}
                                        className="mb-3 font-mono last:mb-0"
                                    >
                                        <div className="text-mini text-foreground-tertiary mb-1 flex items-center gap-2">
                                            <span className="truncate">
                                                {error.sourceId} • {error.branchName}
                                            </span>
                                        </div>
                                        <pre className="text-micro text-foreground-secondary">
                                            {error.content}
                                        </pre>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </AnimatePresence>
                </CollapsibleContent>
            </div>
        </Collapsible>
    );
});
