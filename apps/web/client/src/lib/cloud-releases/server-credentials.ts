import 'server-only';

import { makeFunctionReference } from 'convex/server';
import type { Id } from '@convex/_generated/dataModel';
import type { ReleaseReviewTarget } from '@convex/lib/cloudReleaseReviewTarget';
import type { RetainedReviewMedia } from '@convex/lib/cloudReleaseReviewMedia';

export const reviewCredentialContext = makeFunctionReference<'action', {
    releaseId: Id<'cloudReleases'>; session: string; verifier: string;
    mediaRequest?: { path: string[]; search: string };
}, { target: ReleaseReviewTarget & { expiresAt: number }; token: string; bypass: string; media?: RetainedReviewMedia } | null>(
    'cloudReleaseCredentialActions:reviewContext',
);
