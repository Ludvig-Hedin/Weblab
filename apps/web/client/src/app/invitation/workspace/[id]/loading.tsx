import { ProjectCreationLoader } from '@/components/project-creation-loader';

// Suspense fallback for the workspace-invitation accept segment so an invited
// user sees feedback while the invite + token resolve server-side.
export default function WorkspaceInvitationLoading() {
    return <ProjectCreationLoader heading="Loading your invitation" />;
}
