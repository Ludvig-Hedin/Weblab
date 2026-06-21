import { ProjectCreationLoader } from '@/components/project-creation-loader';

// Suspense fallback for the email/OTP verification segment — it awaits Clerk +
// the returnUrl resolve, which otherwise paints nothing on a soft navigation.
export default function VerifyLoading() {
    return <ProjectCreationLoader heading="Verifying your sign-in" />;
}
