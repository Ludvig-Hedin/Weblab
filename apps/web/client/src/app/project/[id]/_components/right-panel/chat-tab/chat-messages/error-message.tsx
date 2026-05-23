import { observer } from 'mobx-react-lite';

import type { Usage } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { useStateManager } from '@/components/store/state';

interface ErrorMessageProps {
    error: Error;
}

export const ErrorMessage = observer(({ error: chatError }: ErrorMessageProps) => {
    const stateManager = useStateManager();

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
            if (parsed.code === 402 && parsed.usage) {
                usage = parsed.usage;
                errorMessage = parsed.error || 'Message limit exceeded.';
            } else {
                errorMessage = parsed.error || chatError.toString();
            }
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
            <div className="text-small text-destructive flex w-full flex-row items-center justify-center gap-2 p-2">
                <Icons.ExclamationTriangle className="w-6" />
                <p className="w-5/6 overflow-auto text-wrap">{errorMessage}</p>
            </div>
        );
    }

    return null;
});
