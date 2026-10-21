'use client';

import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { useQuery } from 'convex/react';

import { Button } from '@weblab/ui/button';

import type { Id } from '@convex/_generated/dataModel';
import { useActiveWorkspace } from '@/app/w/[slug]/_components/workspace-context';
import { cloudEditorApi } from '@/lib/cloud-editor/api';
import { useCloudEditorCopy } from '@/lib/cloud-editor/copy';
import { PilotSubscriptionBoundary } from './boundary';

function AvailableEntry() {
    const workspace = useActiveWorkspace();
    const copy = useCloudEditorCopy();
    const access = useQuery(cloudEditorApi.workspace, { workspaceId: workspace.id as Id<'workspaces'> });
    if (!access || (!(access.enabled && access.canCreate) && !access.projects.length)) return null;
    return (
        <Button asChild variant="outline">
            <Link href={`/w/${encodeURIComponent(workspace.slug)}/cloud-pilot`}>{copy.title}</Link>
        </Button>
    );
}

export function CloudPilotEntry() {
    const workspace = useActiveWorkspace();
    const { userId } = useAuth();
    if (!userId) return null;
    return (
        <PilotSubscriptionBoundary key={`${workspace.id}:${userId}`} onError={() => undefined}>
            <AvailableEntry />
        </PilotSubscriptionBoundary>
    );
}
