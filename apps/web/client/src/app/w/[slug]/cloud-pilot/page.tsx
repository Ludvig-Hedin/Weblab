'use client';

import type { Id } from '@convex/_generated/dataModel';
import { CloudProjectEntry } from '@/components/cloud-editor/entry';
import { CloudBackups } from '@/components/cloud-editor/backups';
import { useActiveWorkspace } from '../_components/workspace-context';

export default function CloudProjectPage() {
    const workspace = useActiveWorkspace();
    return <CloudProjectEntry workspaceId={workspace.id as Id<'workspaces'>} workspaceSlug={workspace.slug}>
        <CloudBackups workspaceId={workspace.id as Id<'workspaces'>} />
    </CloudProjectEntry>;
}
