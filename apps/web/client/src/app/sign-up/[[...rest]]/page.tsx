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

    // Supabase mode still has its own legacy form at /login. Send signups
    // there so the redirect chain doesn't loop through /sign-in for a
    // provider that doesn't support it.
    if (env.WEBLAB_AUTH_PROVIDER !== 'clerk') {
        redirect(`/login${qs ? `?${qs}` : ''}`);
    }

    redirect(`/sign-in${qs ? `?${qs}` : ''}`);
}
