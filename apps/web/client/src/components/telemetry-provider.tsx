'use client';

import type Gleap from 'gleap';
import type PostHog from 'posthog-js';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { PostHogProvider as PHProvider } from 'posthog-js/react';

import { env } from '@/env';
import { useHasAuthCookie } from '@/hooks/use-has-auth-cookie';

// TelemetryProvider
// Unified initialization and identity management for analytics/feedback tools.
// - Initializes PostHog (analytics) and Gleap (feedback) when configured via env.
// - Identifies users once from a single source: Supabase user.id via TRPC.
// - Clears identities on user sign-out (see utils/telemetry/resetTelemetry).
// - Keeps PostHog React context so existing `usePostHog()` calls continue to work.
//
// Dynamic import for posthog-js keeps the SDK out of the critical-path bundle
// on landing/login/dashboard until cookie consent fires. Identify/reset calls
// optional-chain on the client so they no-op cleanly until init lands.

type PosthogClient = typeof PostHog;
type GleapClient = typeof Gleap;

let posthogClient: PosthogClient | null = null;
let gleapSingleton: GleapClient | null = null;
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
    const user = useQuery(api.users.me, hasAuthCookie === true ? {} : 'skip');
    const pathname = usePathname();
    // Bumps after the consent-gated dynamic imports resolve. The identify and
    // path-change effects depend on this so they re-fire once the SDKs land —
    // without it, a user who signed in before consent would never be
    // identified because the `[user]` effect already ran while the module
    // refs were still null.
    const [clientsRevision, setClientsRevision] = useState(0);

    // Initialize SDKs once, only after user has granted cookie consent.
    // Until consent is granted, no analytics/feedback SDK loads or fires.
    useEffect(() => {
        if (!hasCookieConsent()) {
            return;
        }
        let cancelled = false;
        const posthogKey = env.NEXT_PUBLIC_POSTHOG_KEY;
        if (posthogKey) {
            void (async () => {
                try {
                    const mod = await import('posthog-js');
                    if (cancelled) return;
                    posthogClient = mod.default ?? mod;
                    posthogClient.init(posthogKey, {
                        api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
                        capture_pageview: 'history_change',
                        capture_pageleave: true,
                        capture_exceptions: true,
                    });
                    if (!cancelled) setClientsRevision((n) => n + 1);
                } catch (e) {
                    console.warn('PostHog init failed', e);
                }
            })();
        } else {
            if (!hasWarnedMissingPostHogKey) {
                console.warn('PostHog key is not set, skipping initialization');
                hasWarnedMissingPostHogKey = true;
            }
        }

        const gleapKey = env.NEXT_PUBLIC_GLEAP_API_KEY;
        if (gleapKey) {
            void (async () => {
                try {
                    // Dynamic import to avoid hard dependency when not installed
                    const mod = await import('gleap');
                    if (cancelled) return;
                    gleapSingleton = mod.default ?? mod;
                    gleapSingleton.initialize(gleapKey);
                    if (!cancelled) setClientsRevision((n) => n + 1);
                } catch (e) {
                    console.warn('Gleap init failed (is dependency installed?)', e);
                }
            })();
        }
        return () => {
            cancelled = true;
        };
    }, []);

    // Identify or clear identity on user changes
    useEffect(() => {
        try {
            if (!posthogClient) {
                // SDK not yet loaded (pre-consent, or import still in flight).
                // The effect re-runs when `user` changes; once init lands the
                // next render will pick this branch up.
                return;
            }
            if (user) {
                // `||` is intentional: empty-string displayName must also fall
                // through to first+last name; nullish-coalescing would only
                // catch null/undefined.
                const fullName =
                    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                    user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ');
                posthogClient.identify(
                    user._id,
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
                posthogClient.reset();
            }
        } catch (e) {
            console.error('PostHog identify/reset error:', e);
        }

        if (!env.NEXT_PUBLIC_GLEAP_API_KEY) return;
        if (!gleapSingleton) return;
        try {
            const Gleap = gleapSingleton;
            if (user) {
                // See note above re: `||` over `??` — empty displayName must
                // fall through to the assembled first+last name.
                const name =
                    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                    user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ');
                Gleap.identify(user._id, {
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
        } catch {
            // Safe to ignore if Gleap is not present
        }
    }, [user, clientsRevision]);

    // Soft re-initialize Gleap on path changes to guard against soft reloads/HMR.
    // Only fires when Gleap has already been loaded + initialized — without this
    // guard every anonymous pathname change triggered a dynamic import of the
    // Gleap SDK on landing/login surfaces that never opted into feedback.
    useEffect(() => {
        if (!env.NEXT_PUBLIC_GLEAP_API_KEY) return;
        if (!gleapSingleton) return;
        try {
            // The Gleap type ships `getInstance()` loosely typed — narrow via
            // a structural check rather than `any` so the call is type-safe.
            const getInstance = gleapSingleton.getInstance as
                | (() => { softReInitialize?: () => void } | null | undefined)
                | undefined;
            const instance = getInstance?.();
            instance?.softReInitialize?.();
        } catch {
            // ignore
        }
    }, [pathname, clientsRevision]);

    // Render PHProvider only after the SDK lands. `usePostHog()` consumers
    // resolve to `undefined` from the default context until then — they no-op
    // safely, which is the correct behaviour pre-consent / pre-init.
    if (posthogClient) {
        return <PHProvider client={posthogClient}>{children}</PHProvider>;
    }
    return <>{children}</>;
}
