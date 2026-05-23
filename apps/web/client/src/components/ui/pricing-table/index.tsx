'use client';

import { useAuthContext } from '@/app/auth/auth-context';
import { useHasAuthCookie } from '@/hooks/use-has-auth-cookie';
import { api } from '@/trpc/react';
import { EnterpriseCard } from '../pricing-modal/enterprise-card';
import { FreeCard } from '../pricing-modal/free-card';
import { ProCard } from '../pricing-modal/pro-card';

export const PricingTable = () => {
    // The pricing page is reachable by anonymous visitors. Gate the
    // protected `user.get` query on the cookie heuristic so we don't fire
    // a guaranteed-401 request on every public render.
    const hasAuthCookie = useHasAuthCookie();
    const { data: user } = api.user.get.useQuery(undefined, {
        enabled: hasAuthCookie === true,
    });
    const { setIsAuthModalOpen } = useAuthContext();

    return (
        <div className="w-full">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <FreeCard
                    delay={0.1}
                    variant="flat"
                    isUnauthenticated={!user}
                    onSignupClick={() => setIsAuthModalOpen(true)}
                />
                <ProCard
                    delay={0.2}
                    variant="flat"
                    isUnauthenticated={!user}
                    onSignupClick={() => setIsAuthModalOpen(true)}
                />
                <EnterpriseCard delay={0.3} variant="flat" />
            </div>
        </div>
    );
};
