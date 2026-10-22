'use client';

import type { Id } from '@convex/_generated/dataModel';
import { CloudImportProject } from '@/components/cloud-editor/import-project';
import { useActiveWorkspace } from '../../_components/workspace-context';

export default function ImportCloudProjectPage() {
    const workspace = useActiveWorkspace();
    return <CloudImportProject workspaceId={workspace.id as Id<'workspaces'>} workspaceSlug={workspace.slug} />;
}
