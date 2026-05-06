'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';

import { Button } from '@weblab/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@weblab/ui/card';
import { Icons } from '@weblab/ui/icons';

import { Routes } from '@/utils/constants';

type CallbackState = 'loading' | 'success' | 'error';

export default function FigmaOAuthCallbackPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [state, setState] = useState<CallbackState>('loading');
    const [message, setMessage] = useState('');

    const calledRef = useRef(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        if (calledRef.current) return;
        calledRef.current = true;

        const code = searchParams.get('code');
        const stateParam = searchParams.get('state');
        const error = searchParams.get('error');

        const cleanup = () => {
            clearTimeout(timeoutRef.current);
        };

        if (error) {
            setState('error');
            setMessage(`Figma returned an error: ${error}`);
            return cleanup;
        }

        if (!code || !stateParam) {
            setState('error');
            setMessage('Missing required parameters from Figma.');
            return cleanup;
        }

        setState('error');
        setMessage(
            'Figma OAuth is not configured yet. Return to import and use a personal access token.',
        );

        return cleanup;
    }, []);

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-900 p-6">
            <div className="w-full max-w-md">
                <div className="mb-8 flex items-center justify-center gap-4">
                    <div className="rounded-xl bg-gray-800 p-4">
                        <Icons.WeblabLogo className="h-8 w-8 text-white" />
                    </div>
                    <Icons.DotsHorizontal className="h-8 w-8 text-gray-400" />
                    <div className="rounded-xl bg-gray-800 p-4">
                        <Icons.Figma className="h-8 w-8 text-white" />
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={state}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                    >
                        <Card className="border-gray-800 bg-gray-900 shadow-2xl">
                            <CardContent className="p-8">
                                <div className="flex flex-col items-center gap-4 text-center">
                                    {state === 'loading' && (
                                        <>
                                            <div className="relative mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-gray-800">
                                                <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-white/30" />
                                                <Icons.Figma className="h-8 w-8 text-white" />
                                            </div>
                                            <CardTitle className="text-foreground-primary text-xl">
                                                Connecting to Figma
                                            </CardTitle>
                                            <CardDescription className="text-foreground-secondary/90">
                                                Completing your authorization…
                                            </CardDescription>
                                        </>
                                    )}

                                    {state === 'success' && (
                                        <motion.div
                                            className="flex flex-col items-center gap-4"
                                            initial={{ scale: 0.8, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ duration: 0.3, ease: 'easeOut' }}
                                        >
                                            <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-green-500">
                                                <Icons.CheckCircled className="h-8 w-8 text-white" />
                                            </div>
                                            <CardTitle className="text-foreground-primary text-xl">
                                                Figma connected!
                                            </CardTitle>
                                            <CardDescription className="text-foreground-secondary/90">
                                                You can close this tab and return to Weblab.
                                            </CardDescription>
                                        </motion.div>
                                    )}

                                    {state === 'error' && (
                                        <motion.div
                                            className="flex w-full flex-col items-center gap-4"
                                            initial={{ scale: 0.8, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ duration: 0.3, ease: 'easeOut' }}
                                        >
                                            <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-red-500">
                                                <Icons.ExclamationTriangle className="h-8 w-8 text-white" />
                                            </div>
                                            <CardTitle className="text-foreground-primary text-xl">
                                                Something went wrong
                                            </CardTitle>
                                            <CardDescription className="max-w-sm text-gray-400">
                                                {message}
                                            </CardDescription>
                                            <div className="mt-2 flex w-full flex-col gap-3">
                                                <Button
                                                    variant="outline"
                                                    onClick={() => router.push(Routes.IMPORT_FIGMA)}
                                                    className="w-full"
                                                >
                                                    Return to Import
                                                </Button>
                                            </div>
                                        </motion.div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
