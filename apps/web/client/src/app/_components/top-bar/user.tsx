'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { AnimatedButton, StaggerText } from '@/app/_components/landing-page/animated';
import { CurrentUserAvatar } from '@/components/ui/avatar-dropdown';
import { useHasAuthCookie } from '@/hooks/use-has-auth-cookie';
import { isClerkMode, useSafeClerkAuth } from '@/utils/auth/safe-clerk';
import { getSignInUrlClient } from '@/utils/auth/sign-in-url';
import { Routes } from '@/utils/constants';

export const AuthButton = () => {
    // Use Clerk's authoritative session signal in clerk mode so the marketing
    // nav stays in sync with the rest of the app. The previous implementation
    // gated the avatar on a `user.get` tRPC round-trip — which left the nav
    // showing "Sign In" during the (sometimes long) window between Clerk
    // hydrating and React Query resolving, including on the marketing 404
    // page where a brief flash turned into a persistent stale render because
    // the page never re-mounts. Clerk's `useAuth()` mirrors the server-side
    // session immediately after hydration (the middleware-set `__client_uat`
    // cookie tells Clerk JS the session is live), so reading from there
    // gives the same answer the auth-bridge would give on the server.
    //
    // In supabase mode we fall back to the cookie-sniff + tRPC pattern so
    // deploys without Clerk keys continue to work.
    const clerk = useSafeClerkAuth();
    const hasAuthCookie = useHasAuthCookie();
    const clerkActive = isClerkMode();
    // SSR-safe gate. Clerk exposes the session during SSR, so the server can
    // render the resolved "Projects + avatar" markup while the client's FIRST
    // paint — before Clerk JS hydrates (`isLoaded: false`) — renders the
    // spacer, producing a hydration mismatch (React #418). Forcing the neutral
    // (`null`) state until after mount guarantees the server HTML and the first
    // client render are byte-identical; the real state resolves one tick later.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const resolvedSignedIn = clerkActive
        ? clerk.isLoaded
            ? Boolean(clerk.isSignedIn)
            : null
        : hasAuthCookie;
    const isSignedIn = mounted ? resolvedSignedIn : null;
    const t = useTranslations('nav.user');
    return (
        <div className="mt-0 flex items-center gap-3">
            <Button
                variant="ghost"
                size="sm"
                asChild
                className="wl-stagger-group hidden cursor-pointer rounded-full lg:inline-flex"
            >
                <Link href={Routes.DOWNLOAD}>
                    <Icons.Download className="h-3.5 w-3.5" />
                    <StaggerText>{t('download')}</StaggerText>
                </Link>
            </Button>
            {isSignedIn === null ? (
                // Reserve space while the auth check is in-flight so the
                // layout doesn't jump from "Sign In" → avatar after hydrate.
                <div className="h-8 w-[7.5rem]" aria-hidden />
            ) : isSignedIn ? (
                <>
                    <AnimatedButton
                        href={Routes.PROJECTS}
                        variant="secondary"
                        size="sm"
                        className="rounded-full"
                    >
                        {t('projects')}
                    </AnimatedButton>
                    <CurrentUserAvatar className="cursor-pointer hover:opacity-80" />
                </>
            ) : (
                <AnimatedButton
                    href={getSignInUrlClient()}
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                >
                    {t('signIn')}
                </AnimatedButton>
            )}
        </div>
    );
};
