'use client';

import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';

import { useAuthContext } from '@/app/auth/auth-context';
import { useHasAuthCookie } from '@/hooks/use-has-auth-cookie';
import { EnterpriseCard } from '../pricing-modal/enterprise-card';
import { FreeCard } from '../pricing-modal/free-card';
import { ProCard } from '../pricing-modal/pro-card';

export const PricingTable = () => {
    // The pricing page is reachable by anonymous visitors. Gate the
    // protected `users.me` query on the cookie heuristic so we don't fire
    // a guaranteed-401 request on every public render.
    const hasAuthCookie = useHasAuthCookie();
    const user = useQuery(api.users.me, hasAuthCookie === true ? {} : 'skip');
    const { setIsAuthModalOpen } = useAuthContext();

    // Distinguish "loading" from "anonymous". Without this, a signed-in
    // visitor sees "Get Started Free" / "Get started" CTAs during the
    // brief window before `users.me` resolves — and clicking them in that
    // window opens the auth modal instead of starting checkout. Treat the
    // visitor as anonymous only after we either confirmed no auth cookie
    // (false) or finished loading the user (defined). The `null` SSR /
    // first-paint window and the `cookie-present-but-query-loading` window
    // both fall through to the auth-loading branch.
    const authResolving = hasAuthCookie === null || (hasAuthCookie === true && user === undefined);
    const isUnauthenticated = hasAuthCookie === false || (user === null && !authResolving);

    return (
        <div className="w-full">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <FreeCard
                    delay={0.1}
                    variant="flat"
                    isUnauthenticated={isUnauthenticated}
                    isAuthLoading={authResolving}
                    onSignupClick={() => setIsAuthModalOpen(true)}
                />
                <ProCard
                    delay={0.2}
                    variant="flat"
                    isUnauthenticated={isUnauthenticated}
                    isAuthLoading={authResolving}
                    onSignupClick={() => setIsAuthModalOpen(true)}
                />
                <EnterpriseCard delay={0.3} variant="flat" />
            </div>
        </div>
    );
};
