'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import localforage from 'localforage';
import { AnimatePresence, motion } from 'motion/react';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { useAuthContext } from '@/app/auth/auth-context';
import { CreateManagerProvider, useCreateManager } from '@/components/store/create';
import { isNotAuthenticatedError } from '@/components/store/create/manager';
import { api } from '@/trpc/react';
import { LocalForageKeys, Routes } from '@/utils/constants';
import { getExternalTemplate } from '../_components/templates/template-data';

// ─── Types ──────────────────────────────────────────────────────────────────

type Phase = 'waiting-auth' | 'initialising' | 'importing' | 'saving' | 'redirecting' | 'error';

interface StepDef {
    phase: Phase;
    label: string;
    detail: string;
}

const STEPS: StepDef[] = [
    { phase: 'initialising', label: 'Looking up template', detail: 'Fetching template details…' },
    {
        phase: 'importing',
        label: 'Setting up sandbox',
        detail: 'Preparing your sandbox…',
    },
    { phase: 'saving', label: 'Creating project', detail: 'Saving to your workspace…' },
    { phase: 'redirecting', label: 'Opening workspace', detail: 'Almost there…' },
];

const PHASE_ORDER: Phase[] = ['initialising', 'importing', 'saving', 'redirecting'];

// Templates with a pre-seeded sandboxId fork in ~2s; templates without one fall
// back to a full GitHub import that genuinely takes 2-5 minutes for the current
// monorepo-based examples. The importing-step tip text adapts so users on the
// slow path know to expect a multi-minute wait instead of giving up after 30s.
const FAST_IMPORT_TIP = 'Almost there — finalizing your sandbox.';
const SLOW_IMPORT_TIP =
    'Cloning the template from GitHub. Larger templates can take a few minutes.';
const SLOW_IMPORT_LONG_TIP =
    'Still working — large GitHub templates can take up to five minutes. You can keep this tab open.';

// ─── Content (needs Suspense boundary for useSearchParams) ──────────────────

function CreatingContent() {
    const router = useRouter();
    const params = useSearchParams();
    const templateId = params.get('templateId');

    const { data: user, isLoading: isLoadingUser } = api.user.get.useQuery();
    const { setIsAuthModalOpen } = useAuthContext();
    const createManager = useCreateManager();

    const [phase, setPhase] = useState<Phase>('waiting-auth');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [importDuration, setImportDuration] = useState(0);
    const hasStarted = useRef(false);

    const template = templateId ? getExternalTemplate(templateId) : null;
    const isFastImport = Boolean(template?.sandboxId);

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
        if (!user?.id) {
            // Store return URL so we come back after login
            void localforage.setItem(
                LocalForageKeys.RETURN_URL,
                window.location.pathname + window.location.search,
            );
            setIsAuthModalOpen(true);
        }
    }, [isLoadingUser, user?.id, setIsAuthModalOpen]);

    // ── Start creation once we have a user ───────────────────────────────────
    useEffect(() => {
        if (!user?.id || !template || hasStarted.current) return;
        hasStarted.current = true;

        const run = async () => {
            setPhase('initialising');
            // Short pause so the "Looking up template" step is visible
            await new Promise<void>((r) => setTimeout(r, 400));

            try {
                setPhase('importing');
                const project = await createManager.startPublicGitHubTemplate({
                    userId: user.id,
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
                // mutate call — re-open the auth modal instead of showing
                // a confusing 'NOT_AUTHENTICATED' error message.
                if (isNotAuthenticatedError(err)) {
                    void localforage.setItem(
                        LocalForageKeys.RETURN_URL,
                        window.location.pathname + window.location.search,
                    );
                    setIsAuthModalOpen(true);
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
    }, [user?.id, template, createManager, router, setIsAuthModalOpen]);

    // ── Derived state ────────────────────────────────────────────────────────
    const currentStepIndex =
        phase === 'error' || phase === 'waiting-auth' ? -1 : PHASE_ORDER.indexOf(phase);

    // ── Missing template guard ───────────────────────────────────────────────
    if (!template) {
        return (
            <ErrorCard
                title="Template not found"
                detail={`No template with id "${templateId ?? ''}" exists.`}
                backHref={Routes.MARKETPLACE}
                backLabel="Back to Marketplace"
                retryHref={null}
            />
        );
    }

    if (phase === 'error') {
        return (
            <ErrorCard
                title="Something went wrong"
                detail={errorMessage ?? 'An unknown error occurred.'}
                backHref={Routes.MARKETPLACE}
                backLabel="Back to Marketplace"
                retryHref={null}
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
                    Creating&nbsp;
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
                            ? FAST_IMPORT_TIP
                            : importDuration > 60
                              ? SLOW_IMPORT_LONG_TIP
                              : SLOW_IMPORT_TIP}
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
}: {
    title: string;
    detail: string;
    backHref: string;
    backLabel: string;
    retryHref: string | null;
}) {
    const router = useRouter();

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
                {retryHref && (
                    <Button size="sm" onClick={() => router.push(retryHref)}>
                        Try again
                    </Button>
                )}
            </div>
        </motion.div>
    );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CreatingPage() {
    return (
        <CreateManagerProvider>
            <div className="flex h-screen w-screen flex-col">
                <div className="flex flex-1 flex-col items-center justify-center px-6">
                    <Suspense
                        fallback={
                            <div className="flex flex-col items-center gap-3">
                                <Icons.LoadingSpinner className="text-foreground/40 h-6 w-6 animate-spin" />
                                <p className="text-foreground-tertiary text-sm">Loading…</p>
                            </div>
                        }
                    >
                        <CreatingContent />
                    </Suspense>
                </div>
            </div>
        </CreateManagerProvider>
    );
}
