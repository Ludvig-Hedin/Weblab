'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';

import { env } from '@/env';
import { useHasAuthCookie } from '@/hooks/use-has-auth-cookie';
import { api } from '@/trpc/react';

// TelemetryProvider
// Unified initialization and identity management for analytics/feedback tools.
// - Initializes PostHog (analytics) and Gleap (feedback) when configured via env.
// - Identifies users once from a single source: Supabase user.id via TRPC.
// - Clears identities on user sign-out (see utils/telemetry/resetTelemetry).
// - Keeps PostHog React context so existing `usePostHog()` calls continue to work.

let gleapSingleton: any | null = null;
let hasWarnedMissingPostHogKey = false;

function hasCookieConsent(): boolean {
    if (typeof document === 'undefined') return false;
    return /(?:^|;\s*)weblab\.consent=accepted(?:;|$)/.test(document.cookie);
}

export function TelemetryProvider({ children }: { children: React.ReactNode }) {
    const hasAuthCookie = useHasAuthCookie();
    // Skip the network call on anonymous public surfaces. Once the user
    // signs in (cookie appears on next focus tick), the query enables and
    // identifies them in PostHog/Gleap.
    const { data: user } = api.user.get.useQuery(undefined, {
        enabled: hasAuthCookie === true,
    });
    const pathname = usePathname();

    // Initialize SDKs once, only after user has granted cookie consent.
    // Until consent is granted, no analytics/feedback SDK loads or fires.
    useEffect(() => {
        if (!hasCookieConsent()) {
            return;
        }
        if (env.NEXT_PUBLIC_POSTHOG_KEY) {
            try {
                posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
                    api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
                    capture_pageview: 'history_change',
                    capture_pageleave: true,
                    capture_exceptions: true,
                });
            } catch (e) {
                console.warn('PostHog init failed', e);
            }
        } else {
            if (!hasWarnedMissingPostHogKey) {
                console.warn('PostHog key is not set, skipping initialization');
                hasWarnedMissingPostHogKey = true;
            }
        }

        if (env.NEXT_PUBLIC_GLEAP_API_KEY) {
            (async () => {
                try {
                    // Dynamic import to avoid hard dependency when not installed
                    const mod = await import('gleap');
                    gleapSingleton = mod.default ?? mod;
                    gleapSingleton.initialize(env.NEXT_PUBLIC_GLEAP_API_KEY);
                } catch (e) {
                    console.warn('Gleap init failed (is dependency installed?)', e);
                }
            })();
        }
    }, []);

    // Identify or clear identity on user changes
    useEffect(() => {
        try {
            if (user) {
                const fullName =
                    user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ');
                posthog.identify(
                    user.id,
                    {
                        // Reserved PostHog person properties
                        $email: user.email,
                        $name: fullName,
                        $avatar: user.avatarUrl,
                        // Custom person properties (kept for compatibility)
                        firstName: user.firstName,
                        lastName: user.lastName,
                        displayName: user.displayName,
                        email: user.email,
                        avatar_url: user.avatarUrl,
                    },
                    {
                        signup_date: new Date().toISOString(),
                    },
                );
            } else {
                // If user is signed out, reset PostHog identity
                posthog.reset();
            }
        } catch (e) {
            console.error('PostHog identify/reset error:', e);
        }

        if (!env.NEXT_PUBLIC_GLEAP_API_KEY) return;
        (async () => {
            try {
                const Gleap = gleapSingleton ?? (await import('gleap')).default;
                if (user) {
                    const name =
                        user.displayName ||
                        [user.firstName, user.lastName].filter(Boolean).join(' ');
                    Gleap.identify(user.id, {
                        name,
                        email: user.email,
                        // Attach non-sensitive profile context
                        customData: {
                            displayName: user.displayName,
                            firstName: user.firstName,
                            lastName: user.lastName,
                            avatarUrl: user.avatarUrl,
                        },
                    });
                } else {
                    Gleap.clearIdentity();
                }
            } catch (e) {
                // Safe to ignore if Gleap is not present
                // console.warn("Gleap identify/clear failed:", e);
            }
        })();
    }, [user]);

    // Soft re-initialize Gleap on path changes to guard against soft reloads/HMR
    useEffect(() => {
        if (!env.NEXT_PUBLIC_GLEAP_API_KEY) return;
        (async () => {
            try {
                const Gleap = gleapSingleton ?? (await import('gleap')).default;
                if (Gleap?.getInstance?.()?.softReInitialize) {
                    Gleap?.getInstance()?.softReInitialize();
                }
            } catch {
                // ignore
            }
        })();
    }, [pathname]);

    return <PHProvider client={posthog}>{children}</PHProvider>;
}
