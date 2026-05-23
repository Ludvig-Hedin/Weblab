import { type NextRequest } from 'next/server';

import type { Usage } from '@weblab/models';
import { UsageType } from '@weblab/models';

import { createClient as createTRPCClient } from '@/trpc/request-server';
import { getCurrentUser } from '@/utils/auth/current-user';

export const checkMessageLimit = async (
    req: NextRequest,
): Promise<{
    exceeded: boolean;
    usage: Usage;
}> => {
    const { api } = await createTRPCClient(req);
    const usage = await api.usage.get();

    const dailyUsage = usage.daily;
    const dailyExceeded = dailyUsage.usageCount >= dailyUsage.limitCount;
    if (dailyExceeded) {
        return {
            exceeded: true,
            usage: dailyUsage,
        };
    }

    const monthlyUsage = usage.monthly;
    const monthlyExceeded = monthlyUsage.usageCount >= monthlyUsage.limitCount;
    if (monthlyExceeded) {
        return {
            exceeded: true,
            usage: monthlyUsage,
        };
    }

    return {
        exceeded: false,
        usage: monthlyUsage,
    };
};

// Keeps the legacy name so callers don't churn; underlying impl is now
// flag-aware (Supabase vs Clerk bridge). The `request` arg is unused under
// the new path but kept for API stability.
export const getSupabaseUser = async (_request: NextRequest) => {
    return getCurrentUser();
};

export const incrementUsage = async (
    req: NextRequest,
    traceId?: string,
): Promise<{
    usageRecordId: string | undefined;
    rateLimitId: string | undefined;
} | null> => {
    try {
        const user = await getSupabaseUser(req);
        if (!user) {
            throw new Error('User not found');
        }
        const { api } = await createTRPCClient(req);
        const incrementRes = await api.usage.increment({
            type: UsageType.MESSAGE,
            traceId,
        });
        return {
            usageRecordId: incrementRes?.usageRecordId,
            rateLimitId: incrementRes?.rateLimitId,
        };
    } catch (error) {
        console.error('Error in chat usage increment', error);
    }
    return null;
};

export const decrementUsage = async (
    req: NextRequest,
    usageRecord: {
        usageRecordId: string | undefined;
        rateLimitId: string | undefined;
    } | null,
): Promise<void> => {
    try {
        if (!usageRecord) {
            return;
        }
        const { usageRecordId, rateLimitId } = usageRecord;
        // We should call revertIncrement even if only one of the IDs is available
        // For free plan users, rateLimitId will be undefined but we still want to delete the usage record
        if (!usageRecordId && !rateLimitId) {
            return;
        }
        const { api } = await createTRPCClient(req);
        await api.usage.revertIncrement({ usageRecordId, rateLimitId });
    } catch (error) {
        console.error('Error in chat usage decrement', error);
    }
};
