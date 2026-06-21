import { ProjectCreationLoader } from '@/components/project-creation-loader';

// Suspense fallback for the project-invitation accept segment (it resolves the
// invite + token server-side) so an invited user sees feedback immediately.
export default function InvitationLoading() {
    return <ProjectCreationLoader heading="Loading your invitation" />;
}
