'use server';

import type { AppRouter } from '~/server/api/root';
import type { NextRequest } from 'next/server';
import { cache } from 'react';
import { createHydrationHelpers } from '@trpc/react-query/rsc';
import { TRPCError } from '@trpc/server';
import { createCaller } from '~/server/api/root';

import { db } from '@weblab/db/src/client';

import { getClerkBridgedUser, isClerkActive } from '@/server/api/auth-bridge';
import { createClient as createSupabaseClient } from '@/utils/supabase/request-server';
import { createQueryClient } from './query-client';

export const createTRPCContext = async (req: NextRequest, opts: { headers: Headers }) => {
    const supabase = await createSupabaseClient(req);

    if (isClerkActive()) {
        const user = await getClerkBridgedUser();
        return {
            db,
            supabase,
            user,
            ...opts,
        };
    }

    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    if (error) {
        // Mirror the carve-out in `src/server/api/trpc.ts`: an absent
        // session is not an error — it's just an anonymous request.
        // Without this, public RSC paths that share this context throw 401
        // while the HTTP tRPC path returns `user: null`.
        if (error.message === 'Auth session missing!') {
            return { db, supabase, user: null, ...opts };
        }
        throw new TRPCError({ code: 'UNAUTHORIZED', message: error.message });
    }

    return {
        db,
        supabase,
        user,
        ...opts,
    };
};

const createContext = async (req: NextRequest) => {
    return createTRPCContext(req, { headers: req.headers });
};

const getQueryClient = cache(createQueryClient);

/**
 * Used for API routes without using next headers lib
 */
export const createClient = async (req: NextRequest) => {
    const context = await createContext(req);
    const caller = createCaller(context);

    const { trpc: api, HydrateClient } = createHydrationHelpers<AppRouter>(caller, getQueryClient);

    return { api, HydrateClient };
};
