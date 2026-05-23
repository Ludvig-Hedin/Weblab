'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import type { PromoBanner as PromoBannerConfig } from '@/lib/promo-banners';
import { getActiveBanner, PROMO_BANNER_DISMISSED_STORAGE_PREFIX } from '@/lib/promo-banners';
import { api } from '@/trpc/react';
import { getSignInUrlClient } from '@/utils/auth/sign-in-url';

/**
 * CSS variable consumed by `WebsiteLayout` to position the TopBar below the
 * banner. Kept in sync as the banner mounts/unmounts so the rest of the
 * marketing page doesn't need to know whether a banner is active.
 */
const PROMO_BANNER_HEIGHT_VAR = '--promo-banner-height';
const PROMO_BANNER_HEIGHT_PX = 36;
// Dismissal expires after 30 days so a banner the user dismissed months ago
// gets a fresh chance to convert if it's still running.
const PROMO_BANNER_DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface PromoBannerProps {
    locale?: string;
    /** Override the active banner — used by the design-system preview. */
    bannerOverride?: PromoBannerConfig;
    /** Skip the localStorage dismiss check — used by the design-system preview. */
    forceShow?: boolean;
}

export function PromoBanner({ locale, bannerOverride, forceShow }: PromoBannerProps) {
    const banner = useMemo<PromoBannerConfig | null>(
        () => bannerOverride ?? getActiveBanner(),
        [bannerOverride],
    );
    const [mounted, setMounted] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (forceShow || !banner?.dismissible) return;
        try {
            const stored = window.localStorage.getItem(
                PROMO_BANNER_DISMISSED_STORAGE_PREFIX + banner.id,
            );
            if (!stored) return;
            // Backward compat: the original implementation wrote `'1'` as a
            // permanent flag. Treat that as a fresh dismissal anchored to now
            // so existing dismissals expire 30 days from this visit instead
            // of hiding the banner forever.
            const dismissedAt = stored === '1' ? Date.now() : Number(stored);
            if (!Number.isFinite(dismissedAt) || dismissedAt <= 0) return;
            const expiresAt = dismissedAt + PROMO_BANNER_DISMISS_TTL_MS;
            if (Date.now() < expiresAt) {
                setDismissed(true);
            } else {
                // TTL elapsed — clear the entry so we don't keep parsing it.
                window.localStorage.removeItem(PROMO_BANNER_DISMISSED_STORAGE_PREFIX + banner.id);
            }
        } catch {
            // localStorage can throw in privacy modes — fall through to showing the banner.
        }
    }, [banner, forceShow]);

    const isVisible = Boolean(
        mounted &&
        banner &&
        (banner.locales ? banner.locales.includes(locale ?? 'en') : true) &&
        !dismissed,
    );

    // Reflect visibility on the document element so the rest of the layout
    // can adjust its top offset via the CSS variable.
    useEffect(() => {
        if (typeof document === 'undefined') return;
        if (isVisible) {
            document.documentElement.style.setProperty(
                PROMO_BANNER_HEIGHT_VAR,
                `${PROMO_BANNER_HEIGHT_PX}px`,
            );
        } else {
            document.documentElement.style.removeProperty(PROMO_BANNER_HEIGHT_VAR);
        }
        return () => {
            document.documentElement.style.removeProperty(PROMO_BANNER_HEIGHT_VAR);
        };
    }, [isVisible]);

    return (
        <AnimatePresence initial={false}>
            {banner && isVisible && (
                <PromoBannerView
                    key={banner.id}
                    banner={banner}
                    onDismiss={
                        banner.dismissible
                            ? () => {
                                  try {
                                      // Store the dismissal timestamp so the
                                      // mount-time TTL check can re-show the
                                      // banner after PROMO_BANNER_DISMISS_TTL_MS.
                                      window.localStorage.setItem(
                                          PROMO_BANNER_DISMISSED_STORAGE_PREFIX + banner.id,
                                          String(Date.now()),
                                      );
                                  } catch {
                                      // Best-effort persistence — still hide for this tab.
                                  }
                                  setDismissed(true);
                              }
                            : undefined
                    }
                />
            )}
        </AnimatePresence>
    );
}

interface PromoBannerViewProps {
    banner: PromoBannerConfig;
    onDismiss?: () => void;
}

function PromoBannerView({ banner, onDismiss }: PromoBannerViewProps) {
    const t = useTranslations('promoBanner');
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const startPromoCheckout = api.subscription.startPromoCheckout.useMutation();
    const prefersReducedMotion = useReducedMotion();

    // Subtle "fade + de-blur" entry. Bar slides in vertically, text de-blurs
    // and fades up with a tiny stagger so message → CTA arrive in sequence.
    // Reduced-motion users get a plain opacity fade.
    const barTransition = { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const };
    const textTransition = { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const };
    const fromBlur = prefersReducedMotion ? 'blur(0px)' : 'blur(6px)';
    const toBlur = 'blur(0px)';

    const handleClick = () => {
        if (banner.action.type === 'link') {
            router.push(banner.action.href);
            return;
        }
        // Stripe-checkout flow.
        const action = banner.action;
        startTransition(async () => {
            try {
                const result = await startPromoCheckout.mutateAsync({
                    plan: action.plan,
                    promotionCode: action.promotionCode,
                });
                if ('redirectUrl' in result && result.redirectUrl) {
                    window.location.href = result.redirectUrl;
                    return;
                }
                switch (result.errorCode) {
                    case 'not_authenticated': {
                        const next = `/api/promo-resume?banner=${encodeURIComponent(banner.id)}`;
                        router.push(getSignInUrlClient(next));
                        return;
                    }
                    case 'already_subscribed':
                        toast.info(t('alreadyOnPlan'));
                        return;
                    default:
                        toast.error(t('genericError'));
                }
            } catch {
                toast.error(t('genericError'));
            }
        });
    };

    return (
        <motion.div
            // Sticky above the fixed TopBar (z-50). Banner takes priority.
            className="bg-foreground text-background sticky top-0 left-0 z-[60] flex w-full items-center justify-center overflow-hidden px-4"
            style={{ height: PROMO_BANNER_HEIGHT_PX }}
            role="region"
            aria-label="Promotional announcement"
            initial={{
                y: prefersReducedMotion ? 0 : -PROMO_BANNER_HEIGHT_PX,
                opacity: 0,
            }}
            animate={{ y: 0, opacity: 1 }}
            exit={{
                y: prefersReducedMotion ? 0 : -PROMO_BANNER_HEIGHT_PX,
                opacity: 0,
            }}
            transition={barTransition}
        >
            <button
                type="button"
                onClick={handleClick}
                disabled={isPending}
                className={cn(
                    'mx-auto flex max-w-7xl items-center gap-2 text-xs sm:text-sm',
                    'cursor-pointer select-none',
                    'transition-opacity duration-150 hover:opacity-90 disabled:opacity-60',
                )}
            >
                {/* `useTranslations` types its key argument as the literal
                    union of message paths. Banner keys are stored as plain
                    strings in the config so editors don't need to maintain
                    typed namespaces — cast through to `Parameters<typeof t>[0]`
                    here, and rely on the runtime warnings next-intl emits if a
                    key is missing. */}
                <motion.span
                    className="truncate"
                    initial={{ opacity: 0, y: 4, filter: fromBlur }}
                    animate={{ opacity: 1, y: 0, filter: toBlur }}
                    transition={{ ...textTransition, delay: 0.08 }}
                >
                    {t(banner.messageKey as Parameters<typeof t>[0])}
                </motion.span>
                <motion.span
                    className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
                    initial={{ opacity: 0, y: 4, filter: fromBlur }}
                    animate={{ opacity: 1, y: 0, filter: toBlur }}
                    transition={{ ...textTransition, delay: 0.18 }}
                >
                    {t(banner.ctaKey as Parameters<typeof t>[0])}
                    <Icons.ArrowRight className="h-3.5 w-3.5" />
                </motion.span>
            </button>
            {onDismiss && (
                <motion.button
                    type="button"
                    onClick={onDismiss}
                    aria-label={t('dismiss')}
                    className={cn(
                        'absolute right-3 inline-flex h-6 w-6 items-center justify-center',
                        'rounded-md text-current/70 transition-colors hover:bg-white/10 hover:text-current',
                    )}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.25 }}
                >
                    <Icons.CrossS className="h-3.5 w-3.5" />
                </motion.button>
            )}
        </motion.div>
    );
}
