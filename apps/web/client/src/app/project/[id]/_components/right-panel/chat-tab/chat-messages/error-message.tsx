import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import type { Usage } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';

import { useStateManager } from '@/components/store/state';
import { transKeys } from '@/i18n/keys';

interface ErrorMessageProps {
    error: Error;
    /** Re-runs the last turn. Omitted while a stream is in flight. */
    onRetry?: () => Promise<void>;
}

export const ErrorMessage = observer(({ error: chatError, onRetry }: ErrorMessageProps) => {
    const stateManager = useStateManager();
    const t = useTranslations();
    const [isRetrying, setIsRetrying] = useState(false);

    const handleRetry = async () => {
        if (!onRetry || isRetrying) return;
        try {
            setIsRetrying(true);
            await onRetry();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to retry. Please try again.');
        } finally {
            setIsRetrying(false);
        }
    };

    // Parse error to extract usage and message
    let usage: Usage | null = null;
    let errorMessage: string | null = null;

    try {
        const parsed = JSON.parse(chatError.message) as {
            code: number;
            error: string;
            usage: Usage;
        };
        if (parsed && typeof parsed === 'object') {
            if (
                parsed.code === 402 &&
                parsed.usage &&
                typeof parsed.usage.limitCount === 'number' &&
                (parsed.usage.period === 'day' || parsed.usage.period === 'month')
            ) {
                usage = parsed.usage;
                errorMessage = parsed.error || 'Message limit exceeded.';
            } else {
                errorMessage = parsed.error || chatError.toString();
            }
        } else {
            // Valid JSON but not an object (a bare number/string/null). Fall
            // back to the raw message so the error never renders as nothing —
            // an empty render would drop both the text and the Retry button.
            errorMessage = chatError.message || chatError.toString();
        }
    } catch {
        // Not JSON, use raw error message
        errorMessage = chatError.message || chatError.toString();
    }

    if (usage) {
        return (
            <div className="text-small flex w-full flex-col items-center justify-center gap-2 px-4 pb-4">
                <p className="text-foreground-secondary text-mini my-1 select-none">
                    You reached your {usage.limitCount}{' '}
                    {usage.period === 'day' ? 'daily' : 'monthly'} credit limit.
                </p>
                <Button
                    variant="default"
                    className="mx-10 w-full"
                    onClick={() => stateManager.setIsSubscriptionModalOpen(true)}
                >
                    Get more {usage.period === 'day' ? 'daily' : 'monthly'} credits
                </Button>
            </div>
        );
    }

    if (errorMessage) {
        return (
            <div className="text-small flex w-full flex-col items-center gap-2 p-2">
                <div className="text-destructive flex w-full flex-row items-center justify-center gap-2">
                    <Icons.ExclamationTriangle className="w-6 shrink-0" />
                    <p className="overflow-auto text-wrap">{errorMessage}</p>
                </div>
                {onRetry && (
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={isRetrying}
                        onClick={() => void handleRetry()}
                    >
                        {isRetrying ? (
                            <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Icons.Reload className="mr-2 h-4 w-4" />
                        )}
                        {t(transKeys.editor.panels.edit.tabs.chat.retry)}
                    </Button>
                )}
            </div>
        );
    }

    return null;
});
