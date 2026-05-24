import { redirect } from 'next/navigation';

import { env } from '@/env';

// Unified-auth: /sign-up now redirects to /sign-in. The custom Clerk-powered
// form at /sign-in handles both flows transparently — it tries
// `signIn.create` first and falls back to `signUp.create` when the email
// isn't registered. No separate sign-up surface needed; this stub exists so
// historical links, OAuth provider redirects, and bookmarks all land
// somewhere sensible instead of 404'ing.

interface SignUpPageProps {
    searchParams: Promise<{ returnUrl?: string }>;
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
    const { returnUrl } = await searchParams;
    const params = new URLSearchParams();
    if (returnUrl) params.set('returnUrl', returnUrl);
    const qs = params.toString();

    // Supabase mode fallback. The legacy `/login` route directory was removed
    // in the Clerk migration, so signups land on the live /sign-in entry. This
    // branch is the documented Supabase rollback lever and is intentionally
    // preserved.
    if (env.WEBLAB_AUTH_PROVIDER !== 'clerk') {
        redirect(`/sign-in${qs ? `?${qs}` : ''}`);
    }

    redirect(`/sign-in${qs ? `?${qs}` : ''}`);
}
