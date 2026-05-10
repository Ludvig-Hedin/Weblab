import { useCallback, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import type { ParsedError } from '@weblab/utility';
import { ChatType } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@weblab/ui/collapsible';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

import type { SendMessage } from '../../../_hooks/use-chat';
import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';

interface ErrorSectionProps {
    isStreaming: boolean;
    onSendMessage: SendMessage;
}

// Window event used by the bottom-bar Errors console (or any other surface)
// to ask the chat to draft a fix for the current error set. Decouples those
// surfaces from the chat plumbing.
export const FIX_ERRORS_EVENT = 'weblab:fix-errors-requested';

export const ErrorSection = observer(({ isStreaming, onSendMessage }: ErrorSectionProps) => {
    const editorEngine = useEditorEngine();
    const t = useTranslations();
    const [isOpen, setIsOpen] = useState(false);
    const allErrors = editorEngine.branches.getAllErrors();
    const errorCount = editorEngine.branches.getTotalErrorCount();
    const isSingleError = errorCount === 1;

    const sendFixError = useCallback(() => {
        toast.promise(
            onSendMessage(t(transKeys.editor.panels.edit.tabs.chat.errors.fixPrompt), ChatType.FIX),
            {
                error: t(transKeys.editor.panels.edit.tabs.chat.errors.fixToastError),
            },
        );
    }, [onSendMessage, t]);

    useEffect(() => {
        const handler = () => {
            if (isStreaming || errorCount === 0) return;
            editorEngine.chat.consumeFixErrorsRequest();
            sendFixError();
        };
        window.addEventListener(FIX_ERRORS_EVENT, handler);
        return () => window.removeEventListener(FIX_ERRORS_EVENT, handler);
    }, [editorEngine.chat, isStreaming, errorCount, sendFixError]);

    useEffect(() => {
        if (!editorEngine.chat.pendingFixErrorsRequest) return;
        // Drop the request if errors cleared before chat could honor it —
        // otherwise the flag strands and fires against a future, unrelated
        // error set.
        if (errorCount === 0) {
            editorEngine.chat.consumeFixErrorsRequest();
            return;
        }
        if (isStreaming) return;
        if (!editorEngine.chat.consumeFixErrorsRequest()) return;
        sendFixError();
    }, [
        editorEngine.chat,
        editorEngine.chat.pendingFixErrorsRequest,
        isStreaming,
        errorCount,
        sendFixError,
    ]);

    return (
        <Collapsible
            open={isOpen}
            onOpenChange={setIsOpen}
            className={cn('m-2 flex flex-col', errorCount === 0 && 'hidden')}
        >
            <div
                className={cn(
                    'border-border bg-background-tertiary/40 relative rounded-md border',
                    !isOpen && !isSingleError && 'hover:bg-background-tertiary/70',
                )}
            >
                <div
                    className={cn(
                        'text-foreground-secondary flex items-center justify-between transition-colors',
                        !isOpen && !isSingleError && 'hover:text-foreground-primary',
                    )}
                >
                    <CollapsibleTrigger asChild disabled={isSingleError}>
                        <div
                            className={cn(
                                'flex min-w-0 flex-1 items-center gap-2 py-2 pl-3',
                                isSingleError ? 'cursor-default' : 'cursor-pointer',
                            )}
                        >
                            <Icons.ChevronDown
                                className={cn(
                                    'text-foreground-tertiary h-4 w-4 shrink-0 transition-transform duration-200',
                                    isOpen && 'rotate-180',
                                    isSingleError && 'opacity-0',
                                )}
                            />
                            <div className="min-w-0 flex-1 text-start">
                                <p className="text-small text-foreground-primary pointer-events-none truncate select-none">
                                    {isSingleError
                                        ? t(transKeys.editor.panels.edit.tabs.chat.errors.single)
                                        : t(transKeys.editor.panels.edit.tabs.chat.errors.many, {
                                              count: String(errorCount),
                                          })}
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
                            {t(transKeys.editor.panels.edit.tabs.chat.errors.fix)}
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
                                {allErrors.map((error: ParsedError, index: number) => (
                                    <div
                                        key={`${error.branchId}-${index}-${error.content}`}
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
