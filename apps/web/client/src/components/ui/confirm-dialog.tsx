'use client';

import { useCallback, useRef, useState } from 'react';

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@weblab/ui/alert-dialog';
import { Button } from '@weblab/ui/button';

interface ConfirmOptions {
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
}

interface PendingState extends ConfirmOptions {
    open: boolean;
}

interface QueuedConfirm {
    opts: ConfirmOptions;
    resolve: (value: boolean) => void;
}

/**
 * Drop-in replacement for `window.confirm`. Returns a `confirm` function that
 * resolves to `true` on confirm, `false` on cancel/dismiss, plus a `<dialog>`
 * element to mount once in the consumer's JSX.
 *
 * Concurrent calls queue: the next call waits for the prior dialog to settle
 * rather than stomping its resolver. Each caller gets its own answer.
 */
export function useConfirm() {
    const [state, setState] = useState<PendingState>({
        open: false,
        title: '',
    });
    const resolverRef = useRef<((value: boolean) => void) | null>(null);
    const queueRef = useRef<QueuedConfirm[]>([]);

    const present = useCallback((entry: QueuedConfirm) => {
        resolverRef.current = entry.resolve;
        setState({ ...entry.opts, open: true });
    }, []);

    const confirm = useCallback(
        (opts: ConfirmOptions): Promise<boolean> => {
            return new Promise((resolve) => {
                if (resolverRef.current) {
                    queueRef.current.push({ opts, resolve });
                    return;
                }
                present({ opts, resolve });
            });
        },
        [present],
    );

    const settle = useCallback(
        (value: boolean) => {
            resolverRef.current?.(value);
            resolverRef.current = null;
            const next = queueRef.current.shift();
            if (next) {
                present(next);
                return;
            }
            setState((prev) => ({ ...prev, open: false }));
        },
        [present],
    );

    const dialog = (
        <AlertDialog
            open={state.open}
            onOpenChange={(next) => {
                if (!next) settle(false);
            }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{state.title}</AlertDialogTitle>
                    {state.description && (
                        <AlertDialogDescription>{state.description}</AlertDialogDescription>
                    )}
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <Button variant="ghost" onClick={() => settle(false)}>
                        {state.cancelLabel ?? 'Cancel'}
                    </Button>
                    <Button
                        variant={state.destructive ? 'destructive' : 'default'}
                        onClick={() => settle(true)}
                    >
                        {state.confirmLabel ?? 'Confirm'}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );

    return { confirm, dialog };
}
