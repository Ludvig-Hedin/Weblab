'use client';

import { useAuthContext } from '@/app/auth/auth-context';
import { api } from '@/trpc/react';
import { EnterpriseCard } from '../pricing-modal/enterprise-card';
import { FreeCard } from '../pricing-modal/free-card';
import { ProCard } from '../pricing-modal/pro-card';

export const PricingTable = () => {
    const { data: user } = api.user.get.useQuery();
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
