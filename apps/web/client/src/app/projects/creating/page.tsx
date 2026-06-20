'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import localforage from 'localforage';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { useAuthContext } from '@/app/auth/auth-context';
import { CreateManagerProvider, useCreateManager } from '@/components/store/create';
import { isNotAuthenticatedError } from '@/components/store/create/manager';
import { LocalForageKeys, Routes } from '@/utils/constants';
import { getExternalTemplate } from '../_components/templates/template-data';

// ─── Types ──────────────────────────────────────────────────────────────────

type Phase = 'waiting-auth' | 'initialising' | 'importing' | 'saving' | 'redirecting' | 'error';

interface StepDef {
    phase: Phase;
    label: string;
    detail: string;
}

const PHASE_ORDER: Phase[] = ['initialising', 'importing', 'saving', 'redirecting'];

// ─── Content (needs Suspense boundary for useSearchParams) ──────────────────

function CreatingContent() {
    const t = useTranslations('projects.creating');
    const router = useRouter();
    const params = useSearchParams();
    const templateId = params.get('templateId');

    const user = useQuery(api.users.me, {});
    const isLoadingUser = user === undefined;
    const { redirectToSignIn } = useAuthContext();
    const createManager = useCreateManager();

    const [phase, setPhase] = useState<Phase>('waiting-auth');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [importDuration, setImportDuration] = useState(0);
    const hasStarted = useRef(false);
    const [retryNonce, setRetryNonce] = useState(0);

    // In-place retry for the template-import error state. Resets the run guard
    // and bumps a nonce so the create effect re-fires — a plain <Link> to the
    // same route is a client-nav no-op that never remounts (so `hasStarted`
    // would stay true and nothing would retry).
    const handleRetry = () => {
        setErrorMessage(null);
        hasStarted.current = false;
        setPhase('initialising');
        setRetryNonce((n) => n + 1);
    };

    const template = templateId ? getExternalTemplate(templateId) : null;
    const isFastImport = Boolean(template?.sandboxId);

    const STEPS: StepDef[] = [
        {
            phase: 'initialising',
            label: t('lookingUpTemplate'),
            detail: t('fetchingTemplateDetails'),
        },
        {
            phase: 'importing',
            label: t('settingUpSandbox'),
            detail: t('preparingSandbox'),
        },
        {
            phase: 'saving',
            label: t('creatingProject'),
            detail: t('savingToWorkspace'),
        },
        { phase: 'redirecting', label: t('openingWorkspace'), detail: t('almostThere') },
    ];

    // Tick a counter while the slow import is in flight so the tip can
    // escalate from "this can take a few minutes" to "still working" without
    // the user thinking the page is frozen.
    useEffect(() => {
        if (phase !== 'importing' || isFastImport) {
            return;
        }
        const started = Date.now();
        const timer = window.setInterval(() => {
            setImportDuration(Math.floor((Date.now() - started) / 1000));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [phase, isFastImport]);

    // ── Redirect to login if the user isn't signed in ────────────────────────
    useEffect(() => {
        if (isLoadingUser) return;
        if (!user?._id) {
            // Store return URL so we come back after login
            void localforage.setItem(
                LocalForageKeys.RETURN_URL,
                window.location.pathname + window.location.search,
            );
            redirectToSignIn();
        }
    }, [isLoadingUser, user?._id, redirectToSignIn]);

    // ── Start creation once we have a user ───────────────────────────────────
    useEffect(() => {
        if (!user?._id || !template || hasStarted.current) return;
        hasStarted.current = true;

        const run = async () => {
            setPhase('initialising');
            // Short pause so the "Looking up template" step is visible
            await new Promise<void>((r) => setTimeout(r, 400));

            try {
                setPhase('importing');
                const project = await createManager.startPublicGitHubTemplate({
                    userId: user._id,
                    name: template.name,
                    description: template.shortDescription,
                    repoUrl: template.repoUrl,
                    branch: template.branch,
                    subpath: template.subpath,
                    sandboxId: template.sandboxId,
                    framework: template.framework,
                });

                if (!project) {
                    throw new Error(
                        createManager.error ?? 'No project was returned from the server.',
                    );
                }

                setPhase('saving');
                await new Promise<void>((r) => setTimeout(r, 500));

                setPhase('redirecting');
                await new Promise<void>((r) => setTimeout(r, 400));
                router.push(`${Routes.PROJECT}/${project.id}`);
            } catch (err) {
                // Session expired between the auth gate above and the
                // mutate call — bounce to /sign-in. This page doesn't mount
                // <AuthModal />, so a full-page redirect is the only recovery.
                if (isNotAuthenticatedError(err)) {
                    void localforage.setItem(
                        LocalForageKeys.RETURN_URL,
                        window.location.pathname + window.location.search,
                    );
                    redirectToSignIn();
                    setPhase('waiting-auth');
                    hasStarted.current = false;
                    return;
                }
                const msg = err instanceof Error ? err.message : String(err);
                setErrorMessage(msg);
                setPhase('error');
            }
        };

        void run();
    }, [user?._id, template, createManager, router, redirectToSignIn, retryNonce]);

    // ── Derived state ────────────────────────────────────────────────────────
    const currentStepIndex =
        phase === 'error' || phase === 'waiting-auth' ? -1 : PHASE_ORDER.indexOf(phase);

    // ── Missing template guard ───────────────────────────────────────────────
    if (!template) {
        return (
            <ErrorCard
                title={t('templateNotFound')}
                detail={t('noTemplateWithId', { id: templateId ?? '' })}
                backHref={Routes.MARKETPLACE}
                backLabel={t('backToMarketplace')}
                retryHref={null}
            />
        );
    }

    if (phase === 'error') {
        return (
            <ErrorCard
                title={t('somethingWentWrong')}
                detail={errorMessage ?? t('unknownError')}
                backHref={Routes.MARKETPLACE}
                backLabel={t('backToMarketplace')}
                retryHref={null}
                onRetry={handleRetry}
            />
        );
    }

    return (
        <div className="flex flex-col items-center gap-10">
            {/* Header */}
            <div className="flex flex-col items-center gap-2 text-center">
                <motion.h1
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-foreground text-2xl font-light tracking-tight"
                >
                    {t('creating')}&nbsp;
                    <span className="font-medium">{template.name}</span>
                </motion.h1>
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.15 }}
                    className="text-foreground-tertiary max-w-sm text-sm"
                >
                    {template.shortDescription}
                </motion.p>
            </div>

            {/* Step list */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="w-full max-w-sm"
            >
                <ol className="flex flex-col gap-3">
                    {STEPS.map((step, i) => {
                        const isDone = currentStepIndex > i;
                        const isCurrent = currentStepIndex === i;

                        return (
                            <li key={step.phase} className="flex items-start gap-3">
                                {/* Icon column */}
                                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                                    {isDone ? (
                                        <motion.div
                                            initial={{ scale: 0.5, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                        >
                                            <Icons.CheckCircled className="text-foreground h-4 w-4" />
                                        </motion.div>
                                    ) : isCurrent ? (
                                        <Icons.LoadingSpinner className="text-foreground h-4 w-4 animate-spin" />
                                    ) : (
                                        <div className="border-foreground/20 h-4 w-4 rounded-full border" />
                                    )}
                                </div>

                                {/* Text column */}
                                <div className="min-w-0">
                                    <p
                                        className={`text-sm font-medium transition-colors ${
                                            isDone
                                                ? 'text-foreground/50'
                                                : isCurrent
                                                  ? 'text-foreground'
                                                  : 'text-foreground/30'
                                        }`}
                                    >
                                        {step.label}
                                    </p>
                                    <AnimatePresence>
                                        {isCurrent && (
                                            <motion.p
                                                key="detail"
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="text-foreground-tertiary mt-0.5 text-xs leading-relaxed"
                                            >
                                                {step.detail}
                                            </motion.p>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            </motion.div>

            {/* Progress bar */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="bg-foreground/8 h-1 w-full max-w-sm overflow-hidden rounded-full"
            >
                <motion.div
                    className="bg-foreground/40 h-full rounded-full"
                    initial={{ width: '0%' }}
                    animate={{
                        width:
                            currentStepIndex < 0
                                ? '0%'
                                : currentStepIndex === 0
                                  ? '10%'
                                  : currentStepIndex === 1
                                    ? '35%'
                                    : currentStepIndex === 2
                                      ? '80%'
                                      : '100%',
                    }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                />
            </motion.div>

            {/* Tip for the long import step */}
            <AnimatePresence>
                {phase === 'importing' && (
                    <motion.p
                        key="tip"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: 4 }}
                        className="text-foreground/30 max-w-xs text-center text-xs"
                    >
                        {isFastImport
                            ? t('tipFastImport')
                            : importDuration > 60
                              ? t('tipSlowImportLong')
                              : t('tipSlowImport')}
                    </motion.p>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Error card ─────────────────────────────────────────────────────────────

function ErrorCard({
    title,
    detail,
    backHref,
    backLabel,
    retryHref,
    onRetry,
}: {
    title: string;
    detail: string;
    backHref: string;
    backLabel: string;
    retryHref: string | null;
    onRetry?: () => void;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex w-full max-w-sm flex-col items-center gap-6 text-center"
        >
            <div className="border-border bg-background-secondary flex h-12 w-12 items-center justify-center rounded-full border">
                <Icons.CrossS className="text-foreground/60 h-5 w-5" />
            </div>
            <div className="flex flex-col gap-1">
                <p className="text-foreground text-base font-medium">{title}</p>
                <p className="text-foreground-tertiary text-xs leading-relaxed">{detail}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" size="sm" asChild>
                    <Link href={backHref}>{backLabel}</Link>
                </Button>
                {onRetry ? (
                    <Button size="sm" onClick={onRetry}>
                        Try again
                    </Button>
                ) : (
                    retryHref && (
                        <Button size="sm" asChild>
                            <Link href={retryHref}>Try again</Link>
                        </Button>
                    )
                )}
            </div>
        </motion.div>
    );
}

// ─── Page ────────────────────────────────────────────────────────────────────

function CreatingPageFallback() {
    const t = useTranslations('projects.creating');
    return (
        <div className="flex flex-col items-center gap-3">
            <Icons.LoadingSpinner className="text-foreground/40 h-6 w-6 animate-spin" />
            <p className="text-foreground-tertiary text-sm">{t('loadingEllipsis')}</p>
        </div>
    );
}

export default function CreatingPage() {
    return (
        <CreateManagerProvider>
            <div className="flex h-screen w-screen flex-col">
                <div className="flex flex-1 flex-col items-center justify-center px-6">
                    <Suspense fallback={<CreatingPageFallback />}>
                        <CreatingContent />
                    </Suspense>
                </div>
            </div>
        </CreateManagerProvider>
    );
}
