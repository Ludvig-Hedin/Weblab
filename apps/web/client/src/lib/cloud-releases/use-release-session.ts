'use client';

import { useLayoutEffect, useRef } from 'react';
import { useClerk, useSession } from '@clerk/nextjs';
import { env } from '@/env';
import { ReleaseSession } from './session';

/** Clerk identity changes cancel operations before a follow-up request can run. */
export function useReleaseSession(scope: string) {
    const clerk = useClerk(), { session } = useSession();
    const identity = `${scope}/${session?.id ?? ''}/${session?.user.id ?? ''}`;
    const current = useRef(identity); current.current = identity;
    const active = useRef<AbortController | null>(null);
    useLayoutEffect(() => {
        const controller = new AbortController(); active.current = controller;
        return () => { controller.abort(); if (active.current === controller) active.current = null; };
    }, [identity]);
    return () => {
        const captured = session, controller = active.current, backend = env.NEXT_PUBLIC_CONVEX_URL;
        if (!captured || !controller || !backend) throw new Error('CLOUD_RELEASE_SESSION_CHANGED');
        const operation = new ReleaseSession({ backend, signal: controller.signal,
            getToken: () => captured.getToken({ template: 'convex' }),
            current: () => active.current === controller && current.current === identity
                && clerk.session?.id === captured.id && clerk.user?.id === captured.user.id,
        });
        operation.guard();
        return operation;
    };
}
