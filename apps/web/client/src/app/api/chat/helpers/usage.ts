import { type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import { fetchMutation, fetchQuery } from 'convex/nextjs';

import type { Usage } from '@weblab/models';
import { UsageType } from '@weblab/models';

import type { Id } from '../../../../../convex/_generated/dataModel';
import { getCurrentUser } from '@/utils/auth/current-user';

const getConvexToken = async (): Promise<string | undefined> => {
    const { getToken } = await auth();
    const token = await getToken({ template: 'convex' });
    return token ?? undefined;
};

export const checkMessageLimit = async (
    _req: NextRequest,
): Promise<{
    exceeded: boolean;
    usage: Usage;
}> => {
    const token = await getConvexToken();
    const usage = await fetchQuery(api.usage.get, {}, { token });

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

export type IncrementResult =
    | { usageRecordId: string | undefined; rateLimitId: string | undefined }
    | { limitReached: true }
    | null;

export const incrementUsage = async (
    req: NextRequest,
    traceId?: string,
): Promise<IncrementResult> => {
    try {
        const user = await getSupabaseUser(req);
        if (!user) {
            throw new Error('User not found');
        }
        const token = await getConvexToken();
        const incrementRes = await fetchMutation(
            api.usage.increment,
            {
                type: UsageType.MESSAGE,
                traceId,
            },
            { token },
        );
        return {
            usageRecordId: incrementRes?.usageRecordId,
            rateLimitId: incrementRes?.rateLimitId,
        };
    } catch (error) {
        // A PRO bucket with no credits left throws USAGE_LIMIT_REACHED. That is
        // NOT a transient failure: it must block the stream. Otherwise a burst
        // of concurrent requests that all passed checkMessageLimit before any
        // deduction landed (TOCTOU) would each get a free LLM response — the
        // exact concurrent-abuse case the up-front increment is meant to stop.
        // Convex wraps the thrown message, so match it as a substring.
        if (error instanceof Error && error.message.includes('USAGE_LIMIT_REACHED')) {
            return { limitReached: true };
        }
        // Any other (transient/infra) error keeps the legacy behavior of not
        // penalizing the user: return null so the caller streams without a
        // recorded deduction.
        console.error('Error in chat usage increment', error);
    }
    return null;
};

export const decrementUsage = async (
    _req: NextRequest,
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
        const token = await getConvexToken();
        await fetchMutation(
            api.usage.revertIncrement,
            {
                usageRecordId: usageRecordId as Id<'usageRecords'> | undefined,
                rateLimitId: rateLimitId as Id<'rateLimits'> | undefined,
            },
            { token },
        );
    } catch (error) {
        console.error('Error in chat usage decrement', error);
    }
};
