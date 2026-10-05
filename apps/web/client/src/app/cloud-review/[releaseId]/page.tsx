import { notFound } from 'next/navigation';
import { env } from '@/env';
import { CloudReviewLaunch } from '@/components/cloud-editor/review-launch';
import { validReviewReleaseId } from '@/lib/cloud-releases/review-launch';

export const dynamic = 'force-dynamic';
export const metadata = { referrer: 'strict-origin' as const };

export default async function CloudReviewPage({ params }: { params: Promise<{ releaseId: string }> }) {
    const { releaseId } = await params;
    if (!validReviewReleaseId(releaseId)) notFound();
    const suffix = env.WEBLAB_CLOUD_RELEASE_REVIEW_HOST_SUFFIX;
    const reviewUrl = suffix && /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(suffix)
        ? `https://${releaseId}.${suffix}/__weblab_review_access` : null;
    return <CloudReviewLaunch releaseId={releaseId} reviewUrl={reviewUrl} />;
}
