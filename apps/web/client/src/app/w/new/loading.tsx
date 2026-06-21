import { ProjectCreationLoader } from '@/components/project-creation-loader';

// Suspense fallback for the new-workspace segment so the server resolve doesn't
// flash a blank screen on a soft navigation.
export default function NewWorkspaceLoading() {
    return <ProjectCreationLoader heading="Setting up your workspace" />;
}
