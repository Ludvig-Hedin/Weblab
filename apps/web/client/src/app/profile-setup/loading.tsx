import { ProjectCreationLoader } from '@/components/project-creation-loader';

// Suspense fallback for the post-sign-up profile setup segment so the RSC
// resolve doesn't show a blank screen.
export default function ProfileSetupLoading() {
    return <ProjectCreationLoader heading="Setting up your profile" />;
}
