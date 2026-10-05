'use client';

import { useEffect, useRef, useState } from 'react';
import { SignInButton, useSession } from '@clerk/nextjs';
import { ConvexHttpClient } from 'convex/browser';
import { useLocale } from 'next-intl';
import { Button } from '@weblab/ui/button';
import type { Id } from '@convex/_generated/dataModel';
import { env } from '@/env';
import { cloudReleaseApi } from '@/lib/cloud-releases/api';
import { observeReviewTicket, submitReviewTicket, type ReviewTicket } from '@/lib/cloud-releases/review-launch';
import en from '../../../messages/cloud-releases/en.json';
import sv from '../../../messages/cloud-releases/sv.json';

export function CloudReviewLaunch({ releaseId, reviewUrl }: { releaseId: string; reviewUrl: string | null }) {
    const locale = useLocale(), copy = locale.startsWith('sv') ? sv : en;
    const { isLoaded, session } = useSession();
    const [attempt, setAttempt] = useState(0);
    const [failedIdentity, setFailedIdentity] = useState<string | null>(null);
    const identity = `${session?.id ?? ''}/${releaseId}/${attempt}`;
    const current = useRef<string | null>(identity);
    current.current = identity;
    const pending = useRef<{ identity: string; ticket: Promise<ReviewTicket> } | null>(null);

    useEffect(() => {
        if (!isLoaded || !session || !reviewUrl) return;
        current.current = identity;
        if (pending.current?.identity !== identity) {
            // Bind the HTTP call to this Clerk session, not a changing shared Convex client.
            const ticket = (async () => {
                const backend = env.NEXT_PUBLIC_CONVEX_URL;
                if (!backend) throw new Error('CLOUD_RELEASE_REVIEW_UNAVAILABLE');
                const token = await session.getToken({ template: 'convex' });
                if (!token || current.current !== identity) throw new Error('CLOUD_RELEASE_NOT_ALLOWED');
                const client = new ConvexHttpClient(backend);
                client.setAuth(token);
                return client.mutation(cloudReleaseApi.issueReview, { releaseId: releaseId as Id<'cloudReleases'> });
            })();
            pending.current = { identity, ticket };
        }
        const cancel = observeReviewTicket(pending.current.ticket, () => current.current === identity,
            issued => submitReviewTicket(document, issued, reviewUrl), () => setFailedIdentity(identity));
        return () => {
            cancel();
            if (current.current === identity) current.current = null;
        };
    }, [identity, isLoaded, session, releaseId, reviewUrl]);

    const unavailable = !reviewUrl;
    return <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm space-y-4">
            <h1 className="text-lg font-medium">{copy.openReview}</h1>
            {unavailable ? <p role="alert">{copy.reviewUnavailable}</p>
                : isLoaded && !session ? <SignInButton mode="redirect" forceRedirectUrl={`/cloud-review/${releaseId}`}>
                    <Button>{copy.signInReview}</Button>
                </SignInButton>
                    : failedIdentity === identity ? <><p role="alert">{copy.reviewLaunchFailed}</p>
                        <Button onClick={() => { setFailedIdentity(null); setAttempt(value => value + 1); }}>{copy.retryReview}</Button></>
                        : <p role="status">{copy.openingReview}</p>}
        </div>
    </main>;
}
