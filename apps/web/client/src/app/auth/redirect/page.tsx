import { redirect } from 'next/navigation';

import { Routes } from '@/utils/constants';
import { sanitizeReturnUrl } from '@/utils/url';
import { ClientFallback } from './client-fallback';

interface AuthRedirectProps {
    searchParams: Promise<{ returnUrl?: string }>;
}

export default async function AuthRedirect({ searchParams }: AuthRedirectProps) {
    const { returnUrl } = await searchParams;

    if (returnUrl) {
        // returnUrl is now propagated via URL query (see #30 unification).
        // Sanitize and redirect on the server — no JS required.
        const sanitized = sanitizeReturnUrl(returnUrl);
        redirect(sanitized === Routes.HOME ? Routes.PROJECTS : sanitized);
    }

    // Fallback: no returnUrl in query. Render a client component that drains
    // legacy localforage values, provides a manual "Continue" button after a
    // short delay, and includes a <noscript> meta-refresh fallback.
    return <ClientFallback />;
}
